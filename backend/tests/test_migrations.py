from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
import fakeredis
import pytest

from app.db import engine, migration_heads


def test_clean_migration_roundtrip_and_metadata(env):
    config = Config("alembic.ini")
    command.check(config)
    command.downgrade(config, "base")
    assert "research_runs" not in inspect(engine()).get_table_names()
    command.upgrade(config, "head")
    with engine().connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "20261008_workspace_data_keys"


@pytest.mark.parametrize("stale_revision", ["20260928_integrated_backend", None])
def test_readiness_accepts_current_schema_and_rejects_stale_or_missing(client, monkeypatch, stale_revision):
    redis = fakeredis.FakeRedis()
    monkeypatch.setattr("app.providers.redis_connection", lambda: redis)
    with engine().connect() as connection:
        assert set(connection.scalars(text("SELECT version_num FROM alembic_version"))) == migration_heads()
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "ready"
    with engine().begin() as connection:
        if stale_revision:
            connection.execute(text("UPDATE alembic_version SET version_num = :revision"), {"revision": stale_revision})
        else:
            connection.execute(text("DELETE FROM alembic_version"))
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 503 and response.json()["code"] == "NOT_READY"
