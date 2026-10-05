import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import engine


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + (tmp_path / "test.db").as_posix())
    monkeypatch.setenv("MODE", "replay")
    monkeypatch.setenv("REPLAY_SCENARIO", "baseline")
    monkeypatch.setenv("DEMO_ACCESS_TOKEN", "test-private-access-token")
    monkeypatch.setenv("LLM_ENABLED", "false")
    monkeypatch.setenv("LLM_PLAN_ENABLED", "false")
    get_settings.cache_clear()
    engine.cache_clear()
    command.upgrade(Config("alembic.ini"), "head")
    from app.seed import seed
    seed()
    monkeypatch.setattr("app.jobs.enqueue", lambda run_id: True)
    yield get_settings()
    engine().dispose()
    engine.cache_clear()
    get_settings.cache_clear()


@pytest.fixture
def client(env):
    from app.main import app
    with TestClient(app, headers={"Authorization": "Bearer test-private-access-token"}) as client:
        yield client


@pytest.fixture
def watchlist(client):
    return client.get("/api/v1/watchlists").json()["items"][0]


def launch(client, watchlist, key=None):
    response = client.post("/api/v1/research-runs", json={"watchlist_id": watchlist["id"]},
                           headers={"Idempotency-Key": key} if key else {})
    assert response.status_code == 202, response.text
    return response.json()["id"]


def execute(client, watchlist):
    from app.research import execute_run
    run_id = launch(client, watchlist)
    execute_run(run_id)
    result = client.get("/api/v1/research-runs/" + run_id).json()
    assert result["status"] in ("completed", "partial"), result
    return result
