from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Application
    app_name: str = "RivalPulse"
    app_env: str = "development"
    debug: bool = True

    # Infrastructure
    database_url: str = (
        "postgresql+psycopg://rivalpulse:rivalpulse@localhost:15432/rivalpulse"
    )
    redis_url: str = "redis://localhost:6379/0"

    # Workspace / Demo
    workspace_id: str = "private-demo"
    demo_access_token: SecretStr = SecretStr("")

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    # Application mode
    mode: Literal["live", "replay"] = "live"

    # LLM
    llm_provider: str = "ollama"

    gemini_api_key: SecretStr = SecretStr("")
    gemini_model: str = "gemini-3.6-flash"

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:8b"

    # Generic LLM configuration
    llm_api_key: SecretStr = SecretStr("")
    llm_base_url: str = ""
    llm_model: str = ""
    llm_enabled: bool = False

    # Sectors / data provider
    data_provider: str = "yahoo"

    sectors_base_url: str = ""
    sectors_api_key: SecretStr = SecretStr("")
    sectors_timeout: float = 10.0

    # Agent limits
    credit_total: int = Field(1000, ge=1)
    credit_reserve: int = Field(200, ge=0)
    run_credit_limit: int = Field(16, ge=0)

    max_tool_calls: int = Field(12, ge=1, le=30)
    run_timeout: int = Field(180, ge=20, le=600)
    max_run_attempts: int = Field(3, ge=1, le=5)
    provider_timeout: int = Field(10, ge=1, le=30)

    # Cache
    cache_seconds: int = Field(86400, ge=0)

    # Replay
    replay_scenario: Literal[
        "baseline",
        "changed",
        "missing_financial",
        "conflict",
        "failure",
    ] = "baseline"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()