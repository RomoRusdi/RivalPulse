"""PostgreSQL outbox reconciliation; Redis queue delivery is disposable and repeatable."""
import logging
import time
from datetime import datetime, timedelta

from redis.exceptions import RedisError
from rq import Queue, Worker
from sqlalchemy import or_, select, update

from app.config import get_settings
from app.contracts import RunCreate
from app.db import session, uid, utcnow
from app.errors import AppError
from app.models import Run, RunStep, Watchlist
from app.providers import redis_connection
from app.service import create_run

log = logging.getLogger("rivalpulse.jobs")

_last_sweep: datetime | None = None


def enqueue(run_id):
    settings = get_settings()
    try:
        Queue("research", connection=redis_connection()).enqueue(
            "app.research.execute_run", run_id, job_id=f"{run_id}-{uid()}",
            job_timeout=settings.run_timeout + 10, result_ttl=3600, failure_ttl=86400,
        )
        with session() as db, db.begin():
            db.execute(update(Run).where(Run.id == run_id, Run.status == "queued").values(enqueued_at=utcnow()))
        return True
    except RedisError:
        # The already committed run remains queued. Reconciler retries without losing the request.
        log.warning("enqueue_deferred", extra={"run_id": run_id})
        return False


def reconcile(enqueue_fn=enqueue):
    settings, now = get_settings(), utcnow()
    with session() as db, db.begin():
        from app.email_verification import cleanup
        cleanup(db)
        expired = list(db.scalars(select(Run).where(
            Run.status == "running", Run.started_at < now - timedelta(seconds=settings.run_timeout + 30),
        ).with_for_update(skip_locked=True)))
        for run in expired:
            run.lease_token = None  # Fence any old worker still executing.
            run.error_code = "WORKER_INTERRUPTED"
            db.execute(update(RunStep).where(RunStep.run_id == run.id, RunStep.status == "running").values(status="interrupted"))
            if run.attempts < settings.max_run_attempts:
                run.status, run.enqueued_at = "queued", None
            else:
                run.status, run.finished_at = "failed", now
        queued = list(db.scalars(select(Run.id).where(
            Run.status == "queued", or_(Run.enqueued_at.is_(None), Run.enqueued_at < now - timedelta(seconds=60)),
        ).limit(100)))
    for run_id in queued:
        enqueue_fn(run_id)
    return len(queued)


def maybe_scheduled_sweep(now=None):
    """Queue one bounded sweep of the default watchlist per interval.

    Opt-in via SCHEDULED_SWEEP_ENABLED. Skips when another run is active, so
    scheduled and manual investigations never overlap or double-spend. Costs
    exactly one normal run's budget when it fires; the email itself is free
    (built from the run's own evidence under the alert policy). The first
    call only arms the timer, so enabling it never spends credits immediately.
    """
    settings = get_settings()
    if settings.auth_mode != "demo" or not settings.scheduled_sweep_enabled:
        return False
    global _last_sweep
    now = now or utcnow()
    if _last_sweep is None or now - _last_sweep < timedelta(hours=settings.scheduled_sweep_interval_hours):
        if _last_sweep is None:
            _last_sweep = now
        return False
    with session() as db:
        watchlist = db.scalar(select(Watchlist).where(Watchlist.workspace_id == settings.workspace_id)
                              .order_by(Watchlist.created_at))
        if watchlist is None:
            return False
        active = db.scalar(select(Run).where(Run.watchlist_id == watchlist.id,
                                             Run.status.in_(["queued", "running"])).limit(1))
        if active is not None:
            return False
        watchlist_id = watchlist.id
    try:
        with session() as db:
            db.info["workspace_id"] = settings.workspace_id
            run = create_run(db, RunCreate(watchlist_id=watchlist_id, query=None), None)
    except AppError:
        return False
    _last_sweep = now
    enqueue(run.id)
    log.info("scheduled_sweep_queued", extra={"run_id": run.id})
    return True


def main():
    import sys
    from app.logging_config import configure_logging
    configure_logging()
    if "reconcile" in sys.argv:
        while True:
            try:
                reconcile()
            except Exception:
                log.error("reconciliation_unavailable")
            try:
                maybe_scheduled_sweep()
            except Exception:
                log.error("scheduler_unavailable")
            time.sleep(5)
    else:
        connection = redis_connection()
        Worker([Queue("research", connection=connection)], connection=connection).work()


if __name__ == "__main__":
    main()
