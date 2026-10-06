"""Check configured database, queue, and local AI without logging credentials.

Run from backend/: python scripts/check_connections.py [--probe-ai]
The optional AI probe sends a small synthetic request, never workspace data.
"""
import argparse
import json
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import httpx  # noqa: E402
from alembic.config import Config  # noqa: E402
from alembic.runtime.migration import MigrationContext  # noqa: E402
from alembic.script import ScriptDirectory  # noqa: E402
from redis import Redis  # noqa: E402
from rq import Queue  # noqa: E402
from sqlalchemy import create_engine, inspect, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.agent import OllamaAdapter  # noqa: E402
from app.config import get_settings  # noqa: E402


def check_database(settings):
    url = make_url(settings.database_url)
    result = {"driver": url.drivername, "host": url.host, "port": url.port,
              "database": url.database, "connected": False, "read_write": False}
    args = {"connect_timeout": 3} if url.drivername.startswith("postgresql") else {}
    engine = create_engine(url, connect_args=args)
    try:
        with engine.connect() as connection, connection.begin():
            assert connection.scalar(text("SELECT 1")) == 1
            result["connected"] = True
            if engine.dialect.name == "postgresql":
                result["server_version"] = connection.scalar(text("SHOW server_version"))
            # Transaction-scoped temporary table; no application records are changed.
            table = "rivalpulse_probe_" + uuid4().hex
            connection.execute(text(f"CREATE TEMPORARY TABLE {table} (value INTEGER)"))
            connection.execute(text(f"INSERT INTO {table} (value) VALUES (42)"))
            result["read_write"] = connection.scalar(text(f"SELECT value FROM {table}")) == 42
            connection.execute(text(f"DROP TABLE {table}"))
            applied = list(MigrationContext.configure(connection).get_current_heads())
            config = Config(str(ROOT / "alembic.ini"))
            config.set_main_option("script_location", str(ROOT / "migrations"))
            expected = ScriptDirectory.from_config(config).get_heads()
            result.update(migration_heads=applied, expected_heads=expected,
                          migration_current=set(applied) == set(expected))
            result["missing_tables"] = sorted({"users", "auth_sessions", "conversations", "research_runs",
                                                "snapshots", "signals"} - set(inspect(connection).get_table_names()))
    except Exception as exc:
        result["error_type"] = type(exc).__name__
        result["message"] = "Database connection, write permission, or schema check failed."
    finally:
        engine.dispose()
    return result


def check_queue(settings):
    result = {"connected": False, "workers": 0}
    client = Redis.from_url(settings.redis_url, socket_connect_timeout=3, socket_timeout=3)
    try:
        result["connected"] = client.ping()
        queue = Queue("research", connection=client)
        result.update(queued_jobs=queue.count)
        from rq import Worker
        result["workers"] = len(Worker.all(connection=client, queue=queue))
    except Exception as exc:
        result["error_type"] = type(exc).__name__
        result["message"] = "Redis or the research queue is unavailable."
    finally:
        client.close()
    return result


def check_ai(settings, probe):
    result = {"enabled": settings.llm_enabled, "planning_enabled": settings.llm_plan_enabled,
              "model": settings.ollama_model, "reachable": False, "model_installed": False,
              "generation_verified": False}
    try:
        base = OllamaAdapter._endpoint(settings.ollama_base_url).removesuffix("/api/chat")
        with httpx.Client(timeout=5, trust_env=False) as client:
            response = client.get(base + "/api/tags")
            response.raise_for_status()
            models = response.json()["models"]
            result["reachable"] = True
            result["model_installed"] = any(model.get("name") == settings.ollama_model for model in models)
        if probe and settings.llm_enabled and result["model_installed"]:
            output = OllamaAdapter().structured("connection_probe", {
                "type": "object", "properties": {"status": {"type": "string", "enum": ["ok"]}},
                "required": ["status"], "additionalProperties": False,
            }, {"instruction": "Return the JSON object with status ok. This is synthetic connection-test data."})
            result["generation_verified"] = output == {"status": "ok"}
        elif not settings.llm_enabled:
            result["message"] = "AI calls are disabled by LLM_ENABLED=false."
    except Exception as exc:
        result["error_type"] = type(exc).__name__
        result["message"] = "Local Ollama/model connection or structured generation failed."
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--probe-ai", action="store_true")
    args = parser.parse_args()
    settings = get_settings()
    report = {"mode": settings.mode, "database": check_database(settings),
              "queue": check_queue(settings), "ai": check_ai(settings, args.probe_ai)}
    print(json.dumps(report, indent=2))
    database, queue, ai = report["database"], report["queue"], report["ai"]
    ok = (database["connected"] and database["read_write"] and database.get("migration_current")
          and not database.get("missing_tables") and queue["connected"] and queue["workers"] > 0)
    if args.probe_ai and not settings.llm_enabled:
        ok = False
    if settings.llm_enabled:
        ok = ok and ai["reachable"] and ai["model_installed"] and (not args.probe_ai or ai["generation_verified"])
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
