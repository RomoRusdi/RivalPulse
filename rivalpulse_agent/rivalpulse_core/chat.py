"""Evidence-grounded conversational interface for RivalPulse research."""

from __future__ import annotations

import json
from typing import Literal, Protocol

import httpx
from pydantic import Field, model_validator

from .llm import SynthesisError
from .prompts import SYSTEM_PROMPT
from .schemas import ResearchRequest, StrictModel, Ticker
from .service import RivalPulseAgentService


class ChatHistoryItem(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AgentChatRequest(StrictModel):
    question: str = Field(min_length=1, max_length=2000)
    target_company: Ticker
    competitors: list[Ticker] = Field(min_length=1)
    history: list[ChatHistoryItem] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def validate_research_scope(self) -> AgentChatRequest:
        ResearchRequest(
            target_company=self.target_company,
            competitors=self.competitors,
        )
        return self


class AgentChatResponse(StrictModel):
    answer: str
    evidence_ids: list[str]
    source_refs: list[str]
    provider: str
    status: Literal["grounded", "fallback"]
    warnings: list[str]


class ChatCompanyFinding(StrictModel):
    company: str
    finding: str


class GroundedChatOutput(StrictModel):
    direct_answer: str = Field(min_length=1)
    company_findings: list[ChatCompanyFinding] = Field(default_factory=list)
    competitive_interpretation: str | None = None
    marketing_relevance: str | None = None
    limitations: list[str] = Field(default_factory=list)
    evidence_ids: list[str]

    def render(self) -> str:
        sections = [self.direct_answer]
        if self.company_findings:
            sections.append(
                "Company findings:\n"
                + "\n".join(
                    f"- {item.company}: {item.finding}"
                    for item in self.company_findings
                )
            )
        if self.competitive_interpretation:
            sections.append(
                f"Competitive interpretation:\n{self.competitive_interpretation}"
            )
        if self.marketing_relevance:
            sections.append(f"Marketing relevance:\n{self.marketing_relevance}")
        if self.limitations:
            sections.append(
                "Limitations:\n" + "\n".join(f"- {item}" for item in self.limitations)
            )
        return "\n\n".join(sections)


class ChatResponder(Protocol):
    provider_name: str

    async def answer(
        self,
        question: str,
        history: list[ChatHistoryItem],
        context_json: str,
    ) -> GroundedChatOutput:
        ...


def _chat_schema() -> dict[str, object]:
    schema = GroundedChatOutput.model_json_schema()

    def clean(value: object) -> None:
        if isinstance(value, dict):
            value.pop("additionalProperties", None)
            for child in value.values():
                clean(child)
        elif isinstance(value, list):
            for child in value:
                clean(child)

    clean(schema)
    return schema


class OllamaChatResponder:
    provider_name = "Ollama"

    def __init__(
        self,
        model: str = "qwen3.8:27b",
        base_url: str = "http://localhost:11434",
        timeout_seconds: float = 180,
        num_ctx: int = 8192,
        num_predict: int = 900,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._num_ctx = num_ctx
        self._num_predict = num_predict
        self._client = client or httpx.AsyncClient(timeout=timeout_seconds)

    async def answer(
        self,
        question: str,
        history: list[ChatHistoryItem],
        context_json: str,
    ) -> GroundedChatOutput:
        instructions = f"""{SYSTEM_PROMPT}

You are answering a user's follow-up question inside RivalPulse.
Use only the supplied ResearchResult. Cite supporting evidence by returning its exact evidence IDs.
If the requested company or fact is absent, clearly say the available evidence cannot answer it.
Do not claim to browse the web or have live data.

Populate the structured response completely. For analytical or comparison questions:
- direct_answer must state the conclusion, not introduce a future explanation;
- company_findings must contain a specific finding for each relevant company;
- competitive_interpretation must explain the meaningful difference;
- marketing_relevance must explain what deserves attention;
- limitations must identify incomplete or stale data.
Do not merely announce or list evidence IDs. Use them to support substantive findings.
For a simple factual question, direct_answer may be sufficient and other sections may be empty.

ResearchResult:
{context_json}
"""
        messages = [{"role": "system", "content": instructions}]
        messages.extend({"role": item.role, "content": item.content} for item in history)
        messages.append({"role": "user", "content": question})

        try:
            response = await self._client.post(
                f"{self._base_url}/api/chat",
                json={
                    "model": self._model,
                    "stream": False,
                    "messages": messages,
                    "format": _chat_schema(),
                    "options": {
                        "temperature": 0.2,
                        "num_ctx": self._num_ctx,
                        "num_predict": self._num_predict,
                    },
                },
            )
            response.raise_for_status()
            content = response.json()["message"]["content"]
            return GroundedChatOutput.model_validate_json(content)
        except httpx.ConnectError as exc:
            raise SynthesisError(
                f"Ollama is unreachable at {self._base_url}; start the Ollama application"
            ) from exc
        except httpx.TimeoutException as exc:
            raise SynthesisError("Ollama did not answer within the configured timeout") from exc
        except httpx.HTTPStatusError as exc:
            raise SynthesisError(
                f"Ollama chat failed with status {exc.response.status_code}"
            ) from exc
        except (KeyError, ValueError, json.JSONDecodeError) as exc:
            raise SynthesisError("Ollama returned an invalid chat response") from exc


class RivalPulseChatService:
    """Collect broad company context and validate conversational evidence links."""

    def __init__(
        self,
        research_service: RivalPulseAgentService,
        responder: ChatResponder,
    ) -> None:
        self._research_service = research_service
        self._responder = responder

    async def ask(self, request: AgentChatRequest) -> AgentChatResponse:
        research = await self._research_service.run_research(
            ResearchRequest(
                target_company=request.target_company,
                competitors=request.competitors,
            )
        )
        evidence_lookup = {item.id: item for item in research.evidence}
        try:
            grounded = await self._responder.answer(
                question=request.question,
                history=request.history,
                context_json=research.model_dump_json(),
            )
            unknown_ids = [item for item in grounded.evidence_ids if item not in evidence_lookup]
            if unknown_ids:
                raise SynthesisError(
                    "The chat model returned evidence IDs that are not in the research result"
                )
            evidence_ids = list(dict.fromkeys(grounded.evidence_ids))
            source_refs = list(
                dict.fromkeys(
                    source_ref
                    for evidence_id in evidence_ids
                    for source_ref in evidence_lookup[evidence_id].source_refs
                )
            )
            return AgentChatResponse(
                answer=grounded.render(),
                evidence_ids=evidence_ids,
                source_refs=source_refs,
                provider=self._responder.provider_name,
                status="grounded",
                warnings=research.warnings,
            )
        except SynthesisError as exc:
            fallback_evidence = list(
                dict.fromkeys(
                    evidence_id
                    for signal in research.signals
                    for evidence_id in signal.evidence_ids
                )
            )
            return AgentChatResponse(
                answer=(
                    "The conversational model is unavailable. Current deterministic brief: "
                    f"{research.summary}"
                ),
                evidence_ids=fallback_evidence,
                source_refs=list(
                    dict.fromkeys(
                        source_ref
                        for evidence_id in fallback_evidence
                        for source_ref in evidence_lookup[evidence_id].source_refs
                    )
                ),
                provider=self._responder.provider_name,
                status="fallback",
                warnings=[*research.warnings, str(exc)],
            )
