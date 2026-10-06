from datetime import timedelta

import fakeredis
from rq import Queue, SimpleWorker
from rq.timeouts import TimerDeathPenalty
from sqlalchemy import select

import app.jobs as jobs
from app.config import get_settings
from app.db import session, utcnow
from app.models import Run
from tests.conftest import launch


def test_rq_delivery_executes_real_job_function(client, watchlist):
    run_id = launch(client, watchlist)
    redis = fakeredis.FakeRedis()
    queue = Queue("test", connection=redis)
    first = queue.enqueue("app.research.execute_run", run_id)
    duplicate = queue.enqueue("app.research.execute_run", run_id)

    class PortableWorker(SimpleWorker):
        death_penalty_class = TimerDeathPenalty

    worker = PortableWorker([queue], connection=redis)
    worker.work(burst=True)
    assert first.get_status().value == "finished"
    assert duplicate.get_status().value == "finished"
    with session() as db:
        run = db.get(Run, run_id)
        assert run.status == "completed" and run.attempts == 1


def test_scheduled_sweep_arms_fires_and_never_overlaps(client, watchlist, monkeypatch):
    monkeypatch.setenv("SCHEDULED_SWEEP_ENABLED", "true")
    monkeypatch.setenv("SCHEDULED_SWEEP_INTERVAL_HOURS", "1")
    get_settings.cache_clear()
    jobs._last_sweep = None

    assert jobs.maybe_scheduled_sweep() is False  # first call only arms the timer
    assert jobs.maybe_scheduled_sweep(now=utcnow() + timedelta(minutes=30)) is False
    assert jobs.maybe_scheduled_sweep(now=utcnow() + timedelta(hours=2)) is True
    with session() as db:
        sweep = db.scalar(select(Run).order_by(Run.created_at.desc()).limit(1))
        assert sweep is not None and sweep.status == "queued"
        sweep_id = sweep.id
    client.post("/runs/" + sweep_id + "/cancel")

    active_id = launch(client, watchlist)
    assert jobs.maybe_scheduled_sweep(now=utcnow() + timedelta(hours=4)) is False
    client.post("/runs/" + active_id + "/cancel")

    monkeypatch.setenv("SCHEDULED_SWEEP_ENABLED", "false")
    get_settings.cache_clear()
    assert jobs.maybe_scheduled_sweep(now=utcnow() + timedelta(hours=100)) is False
    jobs._last_sweep = None
