from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://rivalpulse:rivalpulse@localhost:15432/rivalpulse"
    redis_url: str = "redis://localhost:6379/0"
    workspace_id: str = "private-demo"
    demo_access_token: SecretStr = SecretStr("")
    cors_origins: list[str] = ["http://localhost:3000"]
    # Replay is reserved for automated tests; the deployed provider is Sectors.
    mode: Literal["live", "replay"] = "live"
    sectors_api_key: SecretStr = SecretStr("")
    llm_enabled: bool = True
    llm_plan_enabled: bool = True
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3.8:27b"
    ollama_timeout: int = Field(240, ge=30, le=600)
    ollama_num_ctx: int = Field(16384, ge=4096, le=262144)
    ollama_num_predict: int = Field(4096, ge=256, le=8192)
    alerts_enabled: bool = False
    alert_min_severity: Literal["medium", "high"] = "high"
    alert_email_to: str = ""
    gmail_address: SecretStr = SecretStr("")
    gmail_app_password: SecretStr = SecretStr("")
    app_base_url: str = "http://localhost:8080"
    credit_total: int = Field(1000, ge=1)
    credit_reserve: int = Field(200, ge=0)
    run_credit_limit: int = Field(16, ge=0)
    max_tool_calls: int = Field(12, ge=1, le=30)
    run_timeout: int = Field(180, ge=20, le=600)
    max_run_attempts: int = Field(3, ge=1, le=5)
    provider_timeout: int = Field(10, ge=1, le=30)
    cache_seconds: int = Field(86400, ge=0)
    replay_scenario: Literal["baseline", "changed", "missing_financial", "conflict", "failure"] = "baseline"
    # Optional scheduled sweep: one bounded default-watchlist investigation per
    # interval, queued by the reconciler loop. Never overlaps an active run and
    # never exceeds the normal per-run budgets. Gmail still follows the alert
    # policy on top (only newly published findings at/above the severity floor).
    scheduled_sweep_enabled: bool = False
    scheduled_sweep_interval_hours: int = Field(24, ge=1, le=168)


@lru_cache
def get_settings():
    return Settings()
