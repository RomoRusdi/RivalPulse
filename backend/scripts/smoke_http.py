"""Start a temporary real HTTP server, migrate/seed SQLite, and check access/startup.

This does not claim to test PostgreSQL, Redis or live providers.
"""
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    os.chdir(ROOT)
    # SQLite can retain a short-lived file handle after the child exits on Windows.
    with tempfile.TemporaryDirectory(prefix="rivalpulse-http-", ignore_cleanup_errors=os.name == "nt") as directory:
        os.environ.update(DATABASE_URL="sqlite:///" + (Path(directory) / "smoke.db").as_posix(), MODE="replay",
                          DEMO_ACCESS_TOKEN="temporary-http-smoke-token", LLM_ENABLED="false")
        from app.config import get_settings
        from app.db import engine
        get_settings.cache_clear()
        engine.cache_clear()
        from alembic import command
        from alembic.config import Config
        command.upgrade(Config("alembic.ini"), "head")
        from app.seed import seed
        seed()
        child = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
                                  "--port", "18080", "--no-access-log"], cwd=ROOT,
                                 creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        try:
            with httpx.Client(base_url="http://127.0.0.1:18080", trust_env=False, timeout=2) as client:
                for _ in range(50):
                    try:
                        live = client.get("/api/v1/health/live")
                        if live.status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                    if child.poll() is not None:
                        raise RuntimeError("Server exited before startup")
                    time.sleep(.2)
                else:
                    raise RuntimeError("Server failed to start")
                assert live.json()["mode"] == "replay"
                assert client.get("/api/v1/watchlists").status_code == 401
                client.headers["Authorization"] = "Bearer temporary-http-smoke-token"
                assert len(client.get("/api/v1/companies").json()["items"]) == 3
                assert client.get("/openapi.json").status_code == 200
                print("HTTP startup, migration, catalog, private gate and OpenAPI smoke checks passed")
        finally:
            child.terminate()
            child.wait(timeout=10)
            engine().dispose()


if __name__ == "__main__":
    main()
