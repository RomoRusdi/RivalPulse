"""Environment-driven composition for the standalone RivalPulse agent."""

from __future__ import annotations

import importlib
import os
from collections.abc import Callable
from pathlib import Path

from .chat import OllamaChatResponder, RivalPulseChatService
from .json_tools import JsonCompetitiveDataTools
from .llm import OllamaResearchSynthesizer, ResearchSynthesizer
from .memory import ResearchMemory
from .service import RivalPulseAgentService
from .tools import CompetitiveDataTools


def build_data_tools(
    data_path: str | Path | None = None,
    factory_path: str | None = None,
    provider: str | None = None,
) -> CompetitiveDataTools:
    """Load Sectors, normalized JSON, or an externally supplied adapter."""

    selected_provider = (provider or os.getenv("RIVALPULSE_DATA_PROVIDER", "")).strip().lower()
    if selected_provider == "sectors":
        if data_path is not None:
            raise RuntimeError("--data cannot be combined with --provider sectors")
        from .sectors_live import SectorsCompetitiveDataTools

        api_key = os.getenv("SECTORS_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("SECTORS_API_KEY is required when the Sectors provider is selected")
        return SectorsCompetitiveDataTools(
            api_key=api_key,
            base_url=os.getenv("SECTORS_BASE_URL", "https://api.sectors.app/v2"),
            timeout_seconds=float(os.getenv("SECTORS_TIMEOUT_SECONDS", "30")),
            report_cache_ttl_seconds=float(os.getenv("SECTORS_REPORT_CACHE_TTL_SECONDS", "86400")),
            news_cache_ttl_seconds=float(os.getenv("SECTORS_NEWS_CACHE_TTL_SECONDS", "3600")),
        )
    if selected_provider and selected_provider != "json":
        raise RuntimeError(f"Unknown data provider '{selected_provider}'")

    external_factory = factory_path or os.getenv("RIVALPULSE_DATA_TOOLS_FACTORY")
    if external_factory:
        try:
            module_name, function_name = external_factory.split(":", 1)
            module = importlib.import_module(module_name)
            factory: Callable[[], object] = getattr(module, function_name)
            tools = factory()
        except (ValueError, ImportError, AttributeError, TypeError) as exc:
            raise RuntimeError(
                "RIVALPULSE_DATA_TOOLS_FACTORY must use package.module:function"
            ) from exc
        if not isinstance(tools, CompetitiveDataTools):
            raise RuntimeError("Configured data tools do not implement CompetitiveDataTools")
        return tools

    configured_path = data_path or os.getenv("RIVALPULSE_DATA_FILE")
    if configured_path:
        return JsonCompetitiveDataTools(configured_path)
    raise RuntimeError(
        "No data provider configured. Pass --data PATH, set RIVALPULSE_DATA_FILE, "
        "or configure RIVALPULSE_DATA_TOOLS_FACTORY."
    )


def build_synthesizer(*, deterministic: bool = False) -> ResearchSynthesizer | None:
    if deterministic:
        return None
    return OllamaResearchSynthesizer(
        model=os.getenv("OLLAMA_MODEL", "qwen3.8:27b"),
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        timeout_seconds=float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "240")),
    )


def build_memory() -> ResearchMemory | None:
    path = os.getenv("RIVALPULSE_MEMORY_FILE", ".rivalpulse/research-memory.json").strip()
    return ResearchMemory(path) if path else None


def build_agent_service(
    data_path: str | Path | None = None,
    *,
    deterministic: bool = False,
    provider: str | None = None,
) -> RivalPulseAgentService:
    return RivalPulseAgentService(
        tools=build_data_tools(data_path=data_path, provider=provider),
        synthesizer=build_synthesizer(deterministic=deterministic),
        memory=build_memory(),
    )


def build_chat_service(
    data_path: str | Path | None = None,
    *,
    provider: str | None = None,
) -> RivalPulseChatService:
    responder = OllamaChatResponder(
        model=os.getenv("OLLAMA_MODEL", "qwen3.8:27b"),
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        timeout_seconds=float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "240")),
        num_ctx=int(os.getenv("OLLAMA_NUM_CTX", "8192")),
        num_predict=int(os.getenv("OLLAMA_NUM_PREDICT", "900")),
    )
    context_service = RivalPulseAgentService(
        tools=build_data_tools(data_path=data_path, provider=provider),
        memory=build_memory(),
    )
    return RivalPulseChatService(context_service, responder)
