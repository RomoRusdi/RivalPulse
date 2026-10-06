"""Command-line playground for the standalone RivalPulse agent."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from pydantic import ValidationError

from .chat import AgentChatRequest, ChatHistoryItem
from .factory import build_agent_service, build_chat_service
from .json_tools import JsonCompetitiveDataTools
from .schemas import NormalizedDataBundle, ResearchRequest
from .tools import DataToolError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="rivalpulse",
        description="Evidence-grounded competitive-intelligence agent CLI",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    research = subparsers.add_parser("research", help="Generate a structured research result")
    _add_scope_arguments(research)
    research.add_argument(
        "--deterministic",
        action="store_true",
        help="Skip LLM synthesis and return deterministic analysis only",
    )
    research.add_argument("--output", type=Path, help="Write JSON to a file instead of stdout")

    ask = subparsers.add_parser("ask", help="Ask one evidence-grounded question through Ollama")
    _add_scope_arguments(ask)
    ask.add_argument("--question", "-q", required=True, help="Question for the research agent")
    ask.add_argument("--output", type=Path, help="Write JSON to a file instead of stdout")

    chat = subparsers.add_parser("chat", help="Start a multi-turn interactive agent session")
    _add_scope_arguments(chat)

    schema = subparsers.add_parser("schema", help="Print the normalized input JSON Schema")
    schema.add_argument("--output", type=Path, help="Write the schema to a file")
    return parser


def _add_scope_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--provider",
        choices=("json", "sectors"),
        help="Data provider; Sectors is production and JSON is for offline fixtures",
    )
    parser.add_argument(
        "--data",
        type=Path,
        help="Normalized JSON file; defaults to RIVALPULSE_DATA_FILE",
    )
    parser.add_argument("--target", required=True, help="Target ticker")
    parser.add_argument(
        "--competitors",
        nargs="*",
        help="Competitor tickers; defaults to every other company in the JSON file",
    )


def _resolve_competitors(
    data_path: Path | None,
    target: str,
    supplied: list[str] | None,
) -> list[str]:
    if supplied:
        return supplied
    if data_path is None:
        raise RuntimeError(
            "--competitors is required when the data file is supplied through an external adapter"
        )
    tools = JsonCompetitiveDataTools(data_path)
    competitors = [ticker for ticker in tools.available_tickers if ticker != target.upper()]
    if not competitors:
        raise RuntimeError("The normalized data file must contain at least two companies")
    return competitors


def _emit(model_or_schema: object, output: Path | None) -> None:
    if hasattr(model_or_schema, "model_dump_json"):
        text = model_or_schema.model_dump_json(indent=2)  # type: ignore[attr-defined]
    else:
        text = json.dumps(model_or_schema, indent=2)
    if output:
        output.write_text(text + "\n", encoding="utf-8")
        print(f"Wrote {output}")
    else:
        print(text)


async def _run(args: argparse.Namespace) -> None:
    if args.command == "schema":
        _emit(NormalizedDataBundle.model_json_schema(), args.output)
        return

    provider = (args.provider or os.getenv("RIVALPULSE_DATA_PROVIDER", "")).strip().lower()
    configured_path = os.getenv("RIVALPULSE_DATA_FILE")
    data_path = args.data
    if data_path is None and provider != "sectors" and configured_path:
        data_path = Path(configured_path)
    competitors = _resolve_competitors(data_path, args.target, args.competitors)
    if args.command == "research":
        service = build_agent_service(
            data_path=data_path,
            deterministic=args.deterministic,
            provider=provider or None,
        )
        result = await service.run_research(
            ResearchRequest(
                target_company=args.target,
                competitors=competitors,
            )
        )
        _emit(result, args.output)
        return

    chat_service = build_chat_service(data_path=data_path, provider=provider or None)
    normalized_target = args.target.upper()
    normalized_competitors = [ticker.upper() for ticker in competitors]
    if args.command == "chat":
        await _run_live_chat(
            chat_service,
            target=normalized_target,
            competitors=normalized_competitors,
        )
        return

    response = await chat_service.ask(
        AgentChatRequest(
            question=args.question,
            target_company=normalized_target,
            competitors=normalized_competitors,
        )
    )
    _emit(response, args.output)


async def _run_live_chat(
    chat_service,
    *,
    target: str,
    competitors: list[str],
) -> None:
    history: list[ChatHistoryItem] = []
    warnings_shown: set[str] = set()
    print("\nRivalPulse interactive agent")
    print(f"Scope: {target} vs {', '.join(competitors)}")
    print("Commands: /help  /scope  /clear  /quit")

    while True:
        try:
            question = (await asyncio.to_thread(input, "\nYou > ")).strip()
        except (EOFError, KeyboardInterrupt):
            print("\nSession ended.")
            return
        if not question:
            continue
        command = question.lower()
        if command in {"/quit", "/exit"}:
            print("Session ended.")
            return
        if command == "/help":
            print("Ask about comparisons, signals, evidence, or marketing implications.")
            print("/scope shows companies, /clear resets history, /quit exits.")
            continue
        if command == "/scope":
            print(f"Target: {target}")
            print(f"Competitors: {', '.join(competitors)}")
            continue
        if command == "/clear":
            history.clear()
            print("Conversation history cleared.")
            continue
        if command.startswith("/"):
            print(f"Unknown command: {question}. Type /help.")
            continue

        print("RivalPulse is analyzing the available evidence...", flush=True)
        response = await chat_service.ask(
            AgentChatRequest(
                question=question,
                target_company=target,
                competitors=competitors,
                history=history[-8:],
            )
        )
        print(f"\nRivalPulse [{response.provider} | {response.status}] >")
        print(response.answer)
        if response.evidence_ids:
            print(f"Evidence: {', '.join(response.evidence_ids)}")
        if response.source_refs:
            print(f"Sources: {', '.join(response.source_refs)}")
        new_warnings = [warning for warning in response.warnings if warning not in warnings_shown]
        if new_warnings:
            print("Caveats:")
            for warning in new_warnings:
                print(f"  - {warning}")
                warnings_shown.add(warning)

        history.extend(
            [
                ChatHistoryItem(role="user", content=question),
                ChatHistoryItem(role="assistant", content=response.answer),
            ]
        )


def main() -> int:
    load_dotenv()
    parser = build_parser()
    args = parser.parse_args()
    try:
        asyncio.run(_run(args))
    except (DataToolError, RuntimeError, ValidationError) as exc:
        print(f"RivalPulse error: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
