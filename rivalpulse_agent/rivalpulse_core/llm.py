"""Optional, strictly validated LLM synthesis boundaries."""

from __future__ import annotations

import json
import re
from typing import Protocol

import httpx
from pydantic import Field

from .prompts import SYNTHESIS_PROMPT_VERSION, SYSTEM_PROMPT, build_synthesis_prompt
from .schemas import ResearchResult, StrictModel


class SynthesisError(Exception):
    """Raised when synthesis is unavailable or violates the grounding contract."""


class SignalSynthesis(StrictModel):
    signal_id: str
    interpretation: str = Field(min_length=1)
    why_it_matters: str = Field(min_length=1)


class ImplicationSynthesis(StrictModel):
    signal_id: str
    implication: str = Field(min_length=1)
    recommended_monitoring: list[str] = Field(min_length=1)


class SynthesisResponse(StrictModel):
    summary: str = Field(min_length=1)
    signals: list[SignalSynthesis]
    marketing_implications: list[ImplicationSynthesis]


class ResearchSynthesizer(Protocol):
    async def enrich(self, result: ResearchResult) -> ResearchResult:
        """Improve interpretation text without changing deterministic facts."""
        ...


def _compatible_schema() -> dict[str, object]:
    """Return JSON Schema accepted by Ollama structured output."""

    schema = SynthesisResponse.model_json_schema()

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


def _synthesis_prompt(result: ResearchResult) -> str:
    payload = result.model_dump(mode="json")
    payload["prompt_version"] = SYNTHESIS_PROMPT_VERSION
    return build_synthesis_prompt(json.dumps(payload, ensure_ascii=False))


def _apply_synthesis(
    result: ResearchResult,
    synthesis: SynthesisResponse,
    provider: str,
) -> ResearchResult:
    expected_signal_ids = [signal.id for signal in result.signals]
    returned_signal_ids = [signal.signal_id for signal in synthesis.signals]
    expected_implication_ids = [item.signal_id for item in result.marketing_implications]
    returned_implication_ids = [item.signal_id for item in synthesis.marketing_implications]
    if returned_signal_ids != expected_signal_ids:
        raise SynthesisError(f"{provider} changed, removed, or reordered signal IDs")
    if returned_implication_ids != expected_implication_ids:
        raise SynthesisError(
            f"{provider} changed, removed, or reordered implication signal IDs"
        )

    number_pattern = r"(?<![A-Za-z0-9])[-+]?\d+(?:[.,]\d+)?(?![A-Za-z0-9])"
    source_numbers = set(re.findall(number_pattern, result.model_dump_json()))
    generated_text = " ".join(
        [synthesis.summary]
        + [
            value
            for signal in synthesis.signals
            for value in (signal.interpretation, signal.why_it_matters)
        ]
        + [
            value
            for implication in synthesis.marketing_implications
            for value in (implication.implication, *implication.recommended_monitoring)
        ]
    )
    if re.search(r"https?://|www\.", generated_text, flags=re.IGNORECASE):
        raise SynthesisError(f"{provider} introduced a URL outside the evidence contract")
    generated_numbers = set(re.findall(number_pattern, generated_text))
    if not generated_numbers <= source_numbers:
        raise SynthesisError(f"{provider} introduced unsupported numeric claims")

    signal_text = {item.signal_id: item for item in synthesis.signals}
    implication_text = {
        item.signal_id: item for item in synthesis.marketing_implications
    }
    enriched_signals = [
        signal.model_copy(
            update={
                "interpretation": signal_text[signal.id].interpretation,
                "why_it_matters": signal_text[signal.id].why_it_matters,
            }
        )
        for signal in result.signals
    ]
    enriched_implications = [
        implication.model_copy(
            update={
                "implication": implication_text[implication.signal_id].implication,
                "recommended_monitoring": implication_text[
                    implication.signal_id
                ].recommended_monitoring,
            }
        )
        for implication in result.marketing_implications
    ]
    return result.model_copy(
        update={
            "summary": synthesis.summary,
            "signals": enriched_signals,
            "marketing_implications": enriched_implications,
        }
    )


class OllamaResearchSynthesizer:
    """Local Ollama structured-output adapter."""

    provider_name = "Ollama"

    def __init__(
        self,
        model: str = "qwen3.8:27b",
        base_url: str = "http://localhost:11434",
        timeout_seconds: float = 180,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._client = client or httpx.AsyncClient(timeout=timeout_seconds)

    async def enrich(self, result: ResearchResult) -> ResearchResult:
        try:
            response = await self._client.post(
                f"{self._base_url}/api/chat",
                json={
                    "model": self._model,
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": _synthesis_prompt(result)},
                    ],
                    "format": _compatible_schema(),
                    "options": {"temperature": 0.2},
                },
            )
            response.raise_for_status()
            body = response.json()
            content = body["message"]["content"]
            synthesis = SynthesisResponse.model_validate_json(content)
        except httpx.ConnectError as exc:
            raise SynthesisError(
                f"Ollama is unreachable at {self._base_url}; start the Ollama application"
            ) from exc
        except httpx.TimeoutException as exc:
            raise SynthesisError(
                f"Ollama model {self._model} did not respond within the configured timeout"
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise SynthesisError(
                f"Ollama synthesis failed with status {exc.response.status_code}"
            ) from exc
        except (KeyError, ValueError, json.JSONDecodeError) as exc:
            raise SynthesisError("Ollama returned an invalid structured response") from exc

        return _apply_synthesis(result, synthesis, "Ollama")
