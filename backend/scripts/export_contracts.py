"""Generate frontend examples from actual replay execution; never from live provider data."""
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    os.chdir(ROOT)
    with tempfile.TemporaryDirectory(prefix="rivalpulse-contracts-") as directory:
        os.environ.update(DATABASE_URL="sqlite:///" + (Path(directory) / "replay.db").as_posix(), MODE="replay",
                          REPLAY_SCENARIO="baseline", DEMO_ACCESS_TOKEN="contract-generation-only-token", LLM_ENABLED="false")
        from app.config import get_settings
        from app.db import engine
        get_settings.cache_clear()
        engine.cache_clear()
        from alembic import command
        from alembic.config import Config
        command.upgrade(Config("alembic.ini"), "head")
        from app.seed import seed
        seed()
        from app import jobs
        jobs.enqueue = lambda _: True  # Export only: execute persisted queued IDs synchronously below.
        from app.main import app
        from app.research import execute_run
        from fastapi.testclient import TestClient
        with TestClient(app, headers={"Authorization": "Bearer contract-generation-only-token"}) as client:
            watchlist = client.get("/api/v1/watchlists").json()["items"][0]
            accepted = client.post("/api/v1/research-runs", json={"watchlist_id": watchlist["id"]}).json()
            execute_run(accepted["id"])
            detail = client.get(accepted["status_url"]).json()
            assert detail["status"] == "completed", detail
            examples = {"notice": "Synthetic replay only. IDs are generated, metrics are fictional XTS test values.",
                        "watchlist": watchlist, "accepted": accepted, "completed_run": detail,
                        "dashboard": client.get("/dashboard").json(),
                        "signal_detail": client.get("/api/v1/signals/" + detail["result"]["signals"][0]["signal_id"]).json()}
            output = ROOT / "docs"
            output.mkdir(exist_ok=True)
            (output / "openapi.json").write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
            (output / "examples.json").write_text(json.dumps(examples, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        engine().dispose()
    print("Generated docs/openapi.json and docs/examples.json from a migrated replay database")


if __name__ == "__main__":
    main()
