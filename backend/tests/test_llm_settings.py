"""Offline credential isolation, provider protocol and frozen-agent regressions."""
import json

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select

from app.cloud_llm import CloudAdapter, transport_schema
from app.config import get_settings
from app.contracts import Analysis
from app.db import session
from app.errors import ProviderError
from app.llm_settings import adapter_for, decrypt
from app.models import LLMConfiguration, Run, WorkspaceMembership
from app.research import execute_run
from tests.conftest import launch
from tests import test_auth
from tests.test_auth import mutate, register
from tests.test_decision_support import StructuredLLM

KEY = "synthetic-provider-secret-not-real"


@pytest.fixture
def account_client(env, monkeypatch):
    yield from test_auth.account_client.__wrapped__(env, monkeypatch)


@pytest.fixture(autouse=True)
def encryption(monkeypatch):
    monkeypatch.setenv("LLM_KEY_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("LLM_KEY_ENCRYPTION_KEY_FILE", "")
    get_settings.cache_clear()


def selection(provider="openai", **changes):
    return {"provider": provider, "model": "test-model", "enabled": True, "cloud_consent": True, **changes}


def test_setting_and_loading_keys_are_owner_scoped_encrypted_and_read_only(account_client, monkeypatch):
    c = account_client
    assert c.get("/api/v1/settings/llm").status_code == 401
    who = register(c).json()
    def forbidden(*args, **kwargs):
        raise AssertionError("Settings must not call providers")
    monkeypatch.setattr("app.cloud_llm.httpx.Client", forbidden)
    before = c.get("/api/v1/settings/llm").json()
    assert before["provider"] == "ollama" and before["can_edit"]
    changed = mutate(c, "/settings/llm", selection(api_key=KEY), "PATCH")
    assert changed.status_code == 200, changed.text
    assert KEY not in changed.text and "encrypted_key" not in changed.text
    assert changed.json()["connection_tested"] is False
    with session() as db:
        row = db.scalar(select(LLMConfiguration))
        assert row.workspace_id == who["workspaceId"]
        assert row.encrypted_key != KEY and KEY not in row.encrypted_key
        assert decrypt(row) == KEY
    assert c.patch("/api/v1/settings/llm", json=selection()).status_code == 403
    changed = mutate(c, "/settings/llm", selection(model="next-model"), "PATCH")
    assert changed.status_code == 200
    assert next(p for p in changed.json()["providers"] if p["provider"] == "openai")["key_configured"]
    with session() as db:
        assert all(decrypt(row) == KEY for row in db.scalars(select(LLMConfiguration)))


def test_other_workspace_and_non_owner_cannot_use_or_edit_credentials(account_client):
    c = account_client
    first = register(c).json()
    mutate(c, "/settings/llm", selection(api_key=KEY), "PATCH")
    mutate(c, "/auth/logout")
    second = register(c, "second@example.com").json()
    view = c.get("/api/v1/settings/llm").json()
    assert view["provider"] == "ollama" and not any(p["key_configured"] for p in view["providers"])
    with session() as db:
        row = db.scalar(select(LLMConfiguration))
        with pytest.raises(ProviderError):
            adapter_for(db, second["workspaceId"], {"configuration_id": row.id, "enabled": True, "provider": "openai", "model": row.model})
    with session() as db, db.begin():
        db.get(WorkspaceMembership, (second["id"], second["workspaceId"])).permission = "viewer"
    assert not c.get("/api/v1/settings/llm").json()["can_edit"]
    assert mutate(c, "/settings/llm", selection(api_key=KEY), "PATCH").status_code == 403
    assert mutate(c, "/settings/llm/keys/openai", method="DELETE").status_code == 403
    assert first["workspaceId"] != second["workspaceId"]


@pytest.mark.parametrize("body,code", [
    (selection(), "LLM_KEY_REQUIRED"),
    (selection(api_key=KEY, cloud_consent=False), "LLM_CLOUD_CONSENT_REQUIRED"),
    (selection("ollama", api_key=KEY), "LLM_KEY_NOT_REQUIRED"),
    (selection(api_key="short"), "VALIDATION_ERROR"),
    (selection(api_key="key with spaces not allowed"), "VALIDATION_ERROR"),
    (selection(provider="arbitrary", api_key=KEY), "VALIDATION_ERROR"),
    (selection(model="https://evil.example/?key=secret", api_key=KEY), "VALIDATION_ERROR"),
])
def test_invalid_configuration_does_not_echo_secrets(account_client, body, code):
    register(account_client)
    result = mutate(account_client, "/settings/llm", body, "PATCH")
    assert result.status_code == 422 and result.json()["code"] == code
    assert KEY not in result.text


def test_missing_encryption_fails_closed_and_local_still_works(account_client, monkeypatch):
    register(account_client)
    monkeypatch.setenv("LLM_KEY_ENCRYPTION_KEY", "")
    get_settings.cache_clear()
    assert not account_client.get("/api/v1/settings/llm").json()["key_storage_ready"]
    assert mutate(account_client, "/settings/llm", selection(api_key=KEY), "PATCH").status_code == 503
    assert mutate(account_client, "/settings/llm", selection("ollama", model="local-model:tag", cloud_consent=False), "PATCH").status_code == 200


def test_key_removal_erases_versions_and_disables_active_cloud_for_new_requests(account_client):
    c = account_client
    who = register(c).json()
    mutate(c, "/settings/llm", selection(api_key=KEY), "PATCH")
    old = c.get("/api/v1/settings/llm").json()
    mutate(c, "/settings/llm", selection(model="replacement"), "PATCH")
    result = mutate(c, "/settings/llm/keys/openai", method="DELETE")
    assert result.status_code == 200 and not result.json()["enabled"]
    with session() as db:
        assert all(row.encrypted_key is None for row in db.scalars(select(LLMConfiguration)))
        with pytest.raises(ProviderError):
            adapter_for(db, who["workspaceId"], old)


@pytest.mark.parametrize("provider", ["openai", "anthropic", "gemini"])
def test_cloud_protocol_uses_native_schema_fixed_hosts_and_secret_headers(provider):
    calls = []
    def handler(request):
        payload = json.loads(request.content)
        calls.append(payload)
        assert KEY not in str(request.url) and KEY not in request.content.decode()
        header = {"openai": "authorization", "anthropic": "x-api-key", "gemini": "x-goog-api-key"}[provider]
        assert KEY in request.headers[header]
        answer = json.dumps({"interpretations": []})
        if provider == "openai":
            assert request.url.host == "api.openai.com"
            if "response_format" in payload:
                assert payload["response_format"]["json_schema"]["strict"]
            assert not payload["store"]
            return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": answer}}]})
        if provider == "anthropic":
            assert request.url.host == "api.anthropic.com"
            assert payload["system"] and "output_config" in payload
            return httpx.Response(200, json={"stop_reason": "end_turn", "content": [{"type": "text", "text": answer}]})
        assert request.url.host == "generativelanguage.googleapis.com"
        assert payload["generationConfig"]["responseMimeType"] == "application/json"
        return httpx.Response(200, json={"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": answer}]}}]})
    adapter = CloudAdapter(provider, "test-model", KEY, httpx.Client(transport=httpx.MockTransport(handler)))
    assert adapter.structured("analyze", Analysis.model_json_schema(), {"candidates": []}) == {"interpretations": []}
    assert len(calls) == 1
    assert calls[0].get("tools") is None


@pytest.mark.parametrize("provider", ["openai", "anthropic", "gemini"])
def test_cloud_chat_and_unavailable_responses_are_sanitized(provider):
    def handler(request):
        return httpx.Response(401, json={"error": KEY})
    adapter = CloudAdapter(provider, "test-model", KEY, httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(ProviderError) as error:
        adapter.chat([{"role": "system", "content": "Cited context only"}, {"role": "user", "content": "Help"}])
    assert KEY not in str(error.value)


@pytest.mark.parametrize("provider", ["openai", "anthropic", "gemini"])
def test_ordinary_chat_uses_selected_workspace_provider_and_saved_chat_stays_free(client, provider, monkeypatch):
    assert client.patch("/api/v1/settings/llm", json=selection(provider, api_key=KEY)).status_code == 200
    real = httpx.Client
    requests = []
    def handler(request):
        requests.append(request)
        text = "RivalPulse can help you review cited findings in your workspace."
        if provider == "openai":
            return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})
        if provider == "anthropic":
            return httpx.Response(200, json={"content": [{"type": "text", "text": text}]})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})
    monkeypatch.setattr("app.cloud_llm.httpx.Client", lambda **kwargs: real(transport=httpx.MockTransport(handler)))
    reply = client.post("/api/v1/chat", json={"message": "How can RivalPulse help me?"})
    assert reply.status_code == 200 and reply.json()["source"] == "llm", reply.text
    assert len(requests) == 1
    saved = client.post("/api/v1/chat", json={"message": "Summarize the stored findings"})
    assert saved.json()["source"] == "saved_evidence" and len(requests) == 1
    assert KEY not in reply.text and KEY not in saved.text


def test_wrong_encryption_key_cannot_load_a_cloud_credential(client, monkeypatch):
    client.patch("/api/v1/settings/llm", json=selection(api_key=KEY))
    monkeypatch.setenv("LLM_KEY_ENCRYPTION_KEY", Fernet.generate_key().decode())
    get_settings.cache_clear()
    with session() as db:
        with pytest.raises(ProviderError):
            decrypt(db.scalar(select(LLMConfiguration)))


def test_transport_grammar_keeps_backend_schema_untouched():
    original = Analysis.model_json_schema()
    before = json.dumps(original)
    portable = transport_schema(original)
    assert json.dumps(original) == before and "$defs" not in portable
    assert portable["additionalProperties"] is False
    assert "interpretations" in portable["required"]


def test_new_run_freezes_selected_model_and_uses_same_agent_validation(client, watchlist, monkeypatch):
    assert client.patch("/api/v1/settings/llm", json=selection(api_key=KEY)).status_code == 200
    run_id = launch(client, watchlist)
    client.patch("/api/v1/settings/llm", json=selection("ollama", model="local-model", enabled=False))
    requests = []
    real = httpx.Client
    def handler(request):
        payload = json.loads(request.content)
        data = json.loads(payload["messages"][1]["content"])
        requests.append(payload)
        output = StructuredLLM().structured(data["task"], {}, data["data"])
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(output)}}]})
    monkeypatch.setattr("app.cloud_llm.httpx.Client", lambda **kwargs: real(transport=httpx.MockTransport(handler)))
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()
    assert detail["status"] == "completed", detail["error_code"]
    assert all(card["decision_support"]["origin"] == "ai" for card in detail["result"]["signals"])
    assert requests and all(request["model"] == "test-model" for request in requests)
    with session() as db:
        row = db.get(Run, run_id)
        assert row.inputs["llm"]["provider"] == "openai"
        assert KEY not in json.dumps(row.inputs) and row.llm_calls <= 8
    from app.compat import run_json
    with session() as db:
        view = run_json(db, db.get(Run, run_id))
    assert view["orchestration"]["modelProvider"] == "openai" and view["orchestration"]["interpreter"] == "openai"
