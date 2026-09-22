"""PostgreSQL outbox reconciliation; Redis queue delivery is disposable and repeatable."""
import logging
import time
from datetime import timedelta

from redis.exceptions import RedisError
from rq import Queue, Worker
from sqlalchemy import or_, select, update

from app.config import get_settings
from app.db import session, uid, utcnow
from app.models import Run, RunStep
from app.providers import redis_connection

log = logging.getLogger("rivalpulse.jobs")


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
            time.sleep(5)
    else:
        connection = redis_connection()
        Worker([Queue("research", connection=connection)], connection=connection).work()


if __name__ == "__main__":
    main()
