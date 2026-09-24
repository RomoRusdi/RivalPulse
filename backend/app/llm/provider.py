from app.config import Settings
from app.llm.base import LLMProvider
from app.llm.gemini import GeminiProvider
from app.llm.ollama import OllamaProvider


def create_llm_provider(settings: Settings) -> LLMProvider:
    provider = settings.llm_provider.lower().strip()

    if provider == "ollama":
        return OllamaProvider(settings)

    if provider == "gemini":
        return GeminiProvider(settings)

    raise ValueError(
        f"Unsupported LLM provider: {settings.llm_provider}"
    )