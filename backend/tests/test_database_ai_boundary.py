"""Actual local HTTP + persistent SQL tests; the HTTP server is a protocol fixture, not a live model."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from sqlalchemy import select

from app.config import get_settings
from app.db import session
from app.models import Run, RunSnapshot


def test_sql_persistence_and_actual_ai_http_boundary(client, watchlist, monkeypatch):
    calls = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            assert self.path == "/api/chat"
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            assert payload["model"] == "protocol-fixture"
            assert payload["stream"] is False
            assert payload["format"]["type"] == "object"
            task = json.loads(payload["messages"][1]["content"])
            calls.append(task["task"])
            data = task["data"]
            if task["task"] == "plan":
                output = {"tools": [{"name": "get_company_metrics", "company_ids": [company["id"]],
                                    "reason": "Financial evidence"} for company in data["companies"]]}
            else:
                assert task["task"] == "financial_analysis"
                output = {"text": "The supplied statements report nonnegative earnings.",
                          "supporting_claim_ids": [data["claims"][0]["claim_id"]], "uncertainty": "high"}
            body = json.dumps({"message": {"content": json.dumps(output)}, "done_reason": "stop",
                               "prompt_eval_count": 10, "eval_count": 10}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        monkeypatch.setenv("LLM_ENABLED", "true")
        monkeypatch.setenv("LLM_PLAN_ENABLED", "true")
        monkeypatch.setenv("OLLAMA_MODEL", "protocol-fixture")
        monkeypatch.setenv("OLLAMA_BASE_URL", f"http://127.0.0.1:{server.server_port}")
        get_settings.cache_clear()
        accepted = client.post("/api/v1/research-runs", json={"watchlist_id": watchlist["id"],
                              "query": "Compare annual revenue and earnings across my competitors."})
        assert accepted.status_code == 202, accepted.text
        run_id = accepted.json()["id"]
        from app.research import execute_run
        execute_run(run_id)  # No injected adapter: the real Ollama HTTP adapter is exercised.
        result = client.get(f"/api/v1/research-runs/{run_id}").json()
        assert result["status"] == "completed", result
        assert calls == ["plan", "financial_analysis"]
        assert result["result"]["financial_brief"]["interpretation"]["supporting_claim_ids"]
        with session() as fresh_connection:
            stored = fresh_connection.get(Run, run_id)
            assert stored.result == result["result"]
            assert stored.llm_calls == 2
            assert len(fresh_connection.scalars(select(RunSnapshot).where(RunSnapshot.run_id == run_id)).all()) == 3
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
