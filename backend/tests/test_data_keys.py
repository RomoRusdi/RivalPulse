"""Workspace Sectors keys: encrypted, never echoed, preferred over the server key.
Offline only: no request is ever sent to Sectors."""
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select

from app.config import get_settings
from app.data_keys import sectors_key
from app.db import session
from app.models import WorkspaceDataKey
from app.providers import Sectors
from app.research import claim_run
from tests.conftest import launch

OWN = "workspace-owned-sectors-key-not-real"


@pytest.fixture(autouse=True)
def encryption(monkeypatch):
    monkeypatch.setenv("LLM_KEY_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("LLM_KEY_ENCRYPTION_KEY_FILE", "")
    get_settings.cache_clear()


def test_saved_key_is_encrypted_never_returned_and_removable(client):
    before = client.get("/api/v1/settings/sectors").json()
    assert before["workspace_key"] is False and before["server_key"] is True
    saved = client.put("/api/v1/settings/sectors", json={"api_key": OWN})
    assert saved.status_code == 200 and OWN not in saved.text
    assert saved.json()["workspace_key"] is True and saved.json()["connected"] is True
    with session() as db:
        row = db.scalar(select(WorkspaceDataKey))
        assert OWN not in row.encrypted_key
    removed = client.delete("/api/v1/settings/sectors/key").json()
    assert removed["workspace_key"] is False
    assert client.put("/api/v1/settings/sectors", json={"api_key": "has spaces in it"}).status_code == 422


def test_research_uses_the_workspace_key_before_the_server_key(client, watchlist, monkeypatch):
    client.put("/api/v1/settings/sectors", json={"api_key": OWN})
    run_id = launch(client, watchlist)
    assert Sectors(run_id, claim_run(run_id), redis=object()).api_key() == OWN
    with session() as db:
        assert sectors_key(db, get_settings().workspace_id) == OWN


def test_a_workspace_key_unblocks_live_research_without_a_server_key(client, watchlist, monkeypatch):
    monkeypatch.setenv("MODE", "live")
    monkeypatch.setenv("SECTORS_API_KEY", "")
    get_settings.cache_clear()
    blocked = client.post("/api/v1/research-runs", json={"watchlist_id": watchlist["id"]})
    assert blocked.status_code == 503 and blocked.json()["code"] == "PROVIDER_CREDENTIALS_MISSING"
    assert "Settings" in blocked.json()["message"]
    client.put("/api/v1/settings/sectors", json={"api_key": OWN})
    with session() as db:
        assert sectors_key(db, get_settings().workspace_id) == OWN
    assert client.get("/api/v1/settings/sectors").json()["connected"] is True
