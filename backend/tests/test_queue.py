import fakeredis
from rq import Queue, SimpleWorker
from rq.timeouts import TimerDeathPenalty

from app.db import session
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
