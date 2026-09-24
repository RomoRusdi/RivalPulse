from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "RivalPulse"
    app_env: str = "development"
    debug: bool = True

    # LLM
    llm_provider: str = "ollama"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:8b"

    # Sectors
    sectors_base_url: str = ""
    sectors_api_key: str = ""
    sectors_timeout: float = 10.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()