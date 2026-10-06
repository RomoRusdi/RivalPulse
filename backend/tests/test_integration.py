"""Opt-in real PostgreSQL/Redis check. Uses an isolated PostgreSQL schema and Redis queue."""
import os
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from redis import Redis
from rq import Queue, SimpleWorker
from rq.timeouts import TimerDeathPenalty
from sqlalchemy import create_engine, select, text


@pytest.mark.integration
def test_postgres_redis_queued_replay(monkeypatch):
    database_url = os.environ.get("TEST_DATABASE_URL")
    redis_url = os.environ.get("TEST_REDIS_URL")
    if not database_url or not redis_url:
        pytest.skip("Set TEST_DATABASE_URL and TEST_REDIS_URL for real service verification")
    from app.config import get_settings
    from app.db import engine, session
    from app.models import Run, Watchlist
    from app.contracts import RunCreate
    from app.service import create_run
    from app.seed import seed
    schema = "test_" + uuid4().hex
    admin = create_engine(database_url)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    url = admin.url.update_query_dict({"options": f"-csearch_path={schema}"}).render_as_string(hide_password=False)
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("REDIS_URL", redis_url)
    monkeypatch.setenv("MODE", "replay")
    monkeypatch.setenv("AUTH_MODE", "demo")
    monkeypatch.setenv("LLM_ENABLED", "false")
    monkeypatch.setenv("REPLAY_SCENARIO", "baseline")
    get_settings.cache_clear()
    engine.cache_clear()
    connection = Redis.from_url(redis_url)
    queue = Queue(schema, connection=connection)
    try:
        command.upgrade(Config("alembic.ini"), "head")
        seed()
        with session() as db:
            wl = db.scalar(select(Watchlist))
            run = create_run(db, RunCreate(watchlist_id=wl.id), "integration")
            run_id = run.id
        job = queue.enqueue("app.research.execute_run", run_id)

        class PortableWorker(SimpleWorker):
            death_penalty_class = TimerDeathPenalty

        PortableWorker([queue], connection=connection).work(burst=True)
        with session() as db:
            result = db.get(Run, run_id)
            assert result.status == "completed"
            assert len(result.result["signals"]) == 3
        job.delete()
    finally:
        queue.delete(delete_jobs=True)
        engine().dispose()
        engine.cache_clear()
        get_settings.cache_clear()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
