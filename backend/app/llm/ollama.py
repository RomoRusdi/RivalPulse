from typing import Any

import httpx

from app.config import Settings
from app.llm.base import LLMProvider, LLMResponse


class OllamaProvider(LLMProvider):
    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_url = settings.ollama_base_url.rstrip("/")
        self.model = settings.ollama_model

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
    ) -> str:
        messages = []

        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt,
            })

        messages.append({
            "role": "user",
            "content": prompt,
        })

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": 0.2,
                "num_ctx": 4096,
            },
        }

        timeout = httpx.Timeout(
            connect=10.0,
            read=600.0,
            write=30.0,
            pool=30.0,
        )

        print(f"[LLM] Ollama model={self.model}")
        print(f"[LLM] Prompt length={len(prompt)} characters")
        print("[LLM] Generating response...")

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json=payload,
                )

            response.raise_for_status()

        except httpx.ReadTimeout as exc:
            raise RuntimeError(
                f"Ollama response timed out after 600 seconds. "
                f"Model={self.model}. "
                f"The model may be too slow for the current prompt/hardware."
            ) from exc

        except httpx.ConnectError as exc:
            raise RuntimeError(
                f"Could not connect to Ollama at {self.base_url}. "
                f"Make sure Ollama is running."
            ) from exc

        data = response.json()

        message = data.get("message", {})
        content = message.get("content")

        if not content:
            raise RuntimeError(
                "Ollama returned an empty response."
            )

        print(
            f"[LLM] Response received "
            f"({len(content)} characters)"
        )

        return content

    async def generate_with_tools(
        self,
        contents: list[Any],
        tool_definitions: list[dict[str, Any]],
        system_prompt: str | None = None,
    ) -> LLMResponse:
        raise NotImplementedError(
            "Ollama tool calling is not implemented. "
            "RivalPulse uses deterministic tool orchestration."
        )