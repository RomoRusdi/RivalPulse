"""Connect step: list a provider's chat models without saving or generating anything."""
import httpx
import pytest
from cryptography.fernet import Fernet

from app.cloud_llm import available_models
from app.config import get_settings
from app.errors import AppError, ProviderError
from app.models import WorkspaceMembership
from app.db import session
from tests import test_auth
from tests.test_auth import mutate, register

KEY = "synthetic-provider-secret-not-real"

LISTS = {
    "openai": {"data": [{"id": "gpt-4.1-mini"}, {"id": "text-embedding-3-small"}, {"id": "dall-e-3"},
                        {"id": "gpt-4o-realtime-preview"}, {"id": "o4-mini"}, {"id": "whisper-1"}]},
    "anthropic": {"data": [{"id": "claude-sonnet-5-5", "display_name": "Claude Sonnet 5.5"},
                           {"id": "claude-haiku-4-5", "display_name": "Claude Haiku 4.5"}]},
    "gemini": {"models": [{"name": "models/gemini-2.5-flash", "displayName": "Gemini 2.5 Flash", "supportedGenerationMethods": ["generateContent"]},
                          {"name": "models/text-embedding-004", "supportedGenerationMethods": ["embedContent"]},
                          {"name": "models/imagen-4", "supportedGenerationMethods": ["generateContent"]}]},
    "ollama": {"models": [{"name": "qwen3.8:27b"}, {"name": "nomic-embed-text:latest"}]},
}


def fake(provider, status=200, seen=None):
    def handler(request):
        if seen is not None:
            seen.append(request)
        return httpx.Response(status, json=LISTS[provider] if status == 200 else {"error": "nope"})
    return httpx.Client(transport=httpx.MockTransport(handler))


@pytest.mark.parametrize("provider,expected", [
    ("openai", ["o4-mini", "gpt-4.1-mini"]),
    ("anthropic", ["claude-sonnet-5-5", "claude-haiku-4-5"]),
    ("gemini", ["gemini-2.5-flash"]),
    ("ollama", ["qwen3.8:27b"]),
])
def test_lists_only_chat_models(provider, expected):
    assert [model for model, _ in available_models(provider, KEY, fake(provider))] == expected


def test_key_goes_in_a_header_only_and_rejection_is_a_clear_user_error():
    seen = []
    with pytest.raises(AppError) as rejected:
        available_models("anthropic", KEY, fake("anthropic", 401, seen))
    assert rejected.value.status == 422 and rejected.value.code == "LLM_KEY_REJECTED"
    assert KEY not in rejected.value.message
    request = seen[0]
    assert request.method == "GET" and KEY not in str(request.url) and request.headers["x-api-key"] == KEY


def test_unreachable_provider_is_retryable():
    def down(request):
        raise httpx.ConnectError("refused")
    with pytest.raises(ProviderError) as failed:
        available_models("ollama", None, httpx.Client(transport=httpx.MockTransport(down)))
    assert failed.value.retryable and "reachable" in failed.value.message


@pytest.fixture
def account_client(env, monkeypatch):
    monkeypatch.setenv("LLM_KEY_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("LLM_KEY_ENCRYPTION_KEY_FILE", "")
    get_settings.cache_clear()
    yield from test_auth.account_client.__wrapped__(env, monkeypatch)


def test_connect_endpoint_uses_pasted_then_saved_key_pins_suggestion_and_is_owner_only(account_client, monkeypatch):
    c = account_client
    who = register(c).json()
    keys = []
    def listing(provider, key=None, client=None):
        keys.append(key)
        return [("claude-sonnet-5-5", "Claude Sonnet 5.5"), ("claude-haiku-4-5", "Claude Haiku 4.5")]
    monkeypatch.setattr("app.cloud_llm.available_models", listing)
    missing = mutate(c, "/settings/llm/models", {"provider": "anthropic"})
    assert missing.status_code == 422 and missing.json()["code"] == "LLM_KEY_REQUIRED"
    pasted = mutate(c, "/settings/llm/models", {"provider": "anthropic", "api_key": KEY})
    assert pasted.status_code == 200, pasted.text
    body = pasted.json()
    assert KEY not in pasted.text and body["key_source"] == "pasted"
    assert body["models"][0] == {"id": "claude-haiku-4-5", "label": "Claude Haiku 4.5", "suggested": True}
    # Connecting saves nothing; after a real save the stored key is reused.
    assert not next(p for p in c.get("/api/v1/settings/llm").json()["providers"] if p["provider"] == "anthropic")["key_configured"]
    mutate(c, "/settings/llm", {"provider": "anthropic", "model": "claude-haiku-4-5", "enabled": True, "cloud_consent": True, "api_key": KEY}, "PATCH")
    saved = mutate(c, "/settings/llm/models", {"provider": "anthropic"})
    assert saved.json()["key_source"] == "saved" and keys == [KEY, KEY]
    with session() as db, db.begin():
        db.get(WorkspaceMembership, (who["id"], who["workspaceId"])).permission = "viewer"
    assert mutate(c, "/settings/llm/models", {"provider": "anthropic", "api_key": KEY}).status_code == 403
