import json
from typing import Any

from google import genai

from app.config import Settings
from app.llm.base import LLMProvider, LLMResponse


class GeminiProvider(LLMProvider):
    def __init__(self, settings: Settings):
        self.settings = settings

        self.client = genai.Client(
            api_key=settings.gemini_api_key,
            http_options={"api_version": "v1"},
        )

        self._last_tool_definitions: list[dict[str, Any]] = []

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
    ) -> str:
        input_text = prompt

        if system_prompt:
            input_text = (
                f"System instructions:\n{system_prompt}\n\n"
                f"User request:\n{prompt}"
            )

        interaction = await self.client.aio.interactions.create(
            model=self.settings.gemini_model,
            input=input_text,
            store=False,
        )

        if not interaction.output_text:
            raise RuntimeError("Gemini returned an empty response.")

        return interaction.output_text

    async def generate_with_tools(
        self,
        contents: list[Any],
        tool_definitions: list[dict[str, Any]],
        system_prompt: str | None = None,
    ) -> LLMResponse:

        self._last_tool_definitions = tool_definitions

        user_input = contents[0]

        if system_prompt:
            user_input = (
                f"System instructions:\n{system_prompt}\n\n"
                f"User request:\n{user_input}"
            )

        interaction = await self.client.aio.interactions.create(
            model=self.settings.gemini_model,
            input=user_input,
            tools=self._convert_tools(tool_definitions),
            store=False,
        )

        tool_calls = self._extract_tool_calls(interaction)

        return LLMResponse(
            text=interaction.output_text,
            tool_calls=tool_calls,
            raw_response=interaction,
        )

    async def send_tool_results(
        self,
        contents: list[Any],
        tool_results: list[dict[str, Any]],
        system_prompt: str | None = None,
    ) -> LLMResponse:

        history = contents

        function_result_steps = []

        for result in tool_results:
            function_result_steps.append(
                {
                    "type": "function_result",
                    "name": result["name"],
                    "call_id": result["id"],
                    "result": [
                        {
                            "type": "text",
                            "text": json.dumps(
                                result["response"],
                                ensure_ascii=False,
                            ),
                        }
                    ],
                }
            )

        history.extend(function_result_steps)

        interaction = await self.client.aio.interactions.create(
            model=self.settings.gemini_model,
            input=history,
            tools=self._convert_tools(self._last_tool_definitions),
            store=False,
        )

        tool_calls = self._extract_tool_calls(interaction)

        return LLMResponse(
            text=interaction.output_text,
            tool_calls=tool_calls,
            raw_response=interaction,
        )

    @staticmethod
    def _convert_tools(
        tool_definitions: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:

        return [
            {
                "type": "function",
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["parameters"],
            }
            for tool in tool_definitions
        ]

    @staticmethod
    def _extract_tool_calls(
        interaction: Any,
    ) -> list[dict[str, Any]]:

        tool_calls = []

        for step in interaction.steps:
            if step.type == "function_call":
                tool_calls.append(
                    {
                        "name": step.name,
                        "arguments": dict(step.arguments or {}),
                        "id": step.id,
                    }
                )

        return tool_calls