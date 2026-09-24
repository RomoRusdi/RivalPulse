from abc import ABC, abstractmethod
from typing import Any


class LLMResponse:
    """
    Provider-independent representation of an LLM response.
    """

    def __init__(
        self,
        text: str | None = None,
        tool_calls: list[dict[str, Any]] | None = None,
        raw_response: Any = None,
    ):
        self.text = text
        self.tool_calls = tool_calls or []
        self.raw_response = raw_response


class LLMProvider(ABC):
    """
    Provider-agnostic interface for language models.
    """

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
    ) -> str:
        raise NotImplementedError

    @abstractmethod
    async def generate_with_tools(
        self,
        contents: list[Any],
        tool_definitions: list[dict[str, Any]],
        system_prompt: str | None = None,
    ) -> LLMResponse:
        """
        Generate a response that may contain tool calls.
        """
        raise NotImplementedError