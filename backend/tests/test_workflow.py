from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.exc import DatabaseError

from app.config import get_settings
from app.db import session
from app.models import Evidence, Revision, Run, Signal, Snapshot
from app.research import execute_run, validate_card
from tests.conftest import execute, launch


def test_watchlist_validation(client, watchlist):
    ids = [c["id"] for c in watchlist["companies"]]
    for companies in (ids[:1], [ids[0], ids[0]], [ids[0], str(uuid4())], ids * 2):
        response = client.post("/api/v1/watchlists", json={"name": "Test", "objective": "Compare products", "company_ids": companies})
        assert response.status_code == 422
        assert set(response.json()) == {"code", "message", "retryable", "request_id"}
    result = client.post("/api/v1/watchlists", json={"name": "Test", "objective": "Compare products", "company_ids": ids[:2]})
    assert result.status_code == 201
    assert client.patch("/api/v1/watchlists/" + result.json()["id"], json={"company_ids": None}).status_code == 422


def test_idempotency_and_active_run(client, watchlist):
    first = launch(client, watchlist, "stable")
    assert launch(client, watchlist, "stable") == first
    assert client.post("/api/v1/research-runs", json={"watchlist_id": watchlist["id"]}).status_code == 409
    conflict = client.post("/api/v1/research-runs", headers={"Idempotency-Key": "stable"},
                           json={"watchlist_id": watchlist["id"], "query": "different question"})
    assert conflict.status_code == 409
    execute_run(first)
    assert launch(client, watchlist, "stable") == first


def test_concurrent_submission(client, watchlist):
    def submit(_):
        return client.post("/api/v1/research-runs", headers={"Idempotency-Key": "concurrent"},
                           json={"watchlist_id": watchlist["id"]})
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(submit, range(4)))
    assert [r.status_code for r in results] == [202] * 4
    assert len({r.json()["id"] for r in results}) == 1


def test_full_baseline_numeric_evidence_duplicate_and_revision(client, watchlist, monkeypatch):
    first = execute(client, watchlist)
    assert first["status"] == "completed"
    assert len(first["progress"]) == 7
    cards = first["result"]["signals"]
    assert len(cards) == 3
    assert all(c["change_status"] == "baseline" for c in cards)
    assert all(c["mode"] == "replay" for c in cards)
    for card in cards:
        growth = next(m for m in card["financial_context"] if m["metric"] == "revenue_growth_percent")
        assert growth["value"] == "20.00"
        assert card["published_at"] < card["first_seen_at"][:10]
        with session() as db:
            snapshots = {s.id: s for s in db.scalars(select(Snapshot))}
            validate_card(card, snapshots)
            for evidence in card["evidence"]:
                assert db.get(Evidence, evidence["id"]) is not None
    execute_run(first["id"])
    second = execute(client, watchlist)
    assert all(c["change_status"] == "unchanged" for c in second["result"]["signals"])
    with session() as db:
        assert db.scalar(select(func.count()).select_from(Revision)) == 3
        assert db.scalar(select(func.count()).select_from(Signal)) == 3
    monkeypatch.setenv("REPLAY_SCENARIO", "changed")
    get_settings.cache_clear()
    third = execute(client, watchlist)
    assert sum(c["change_status"] == "updated" for c in third["result"]["signals"]) == 1
    with session() as db:
        assert db.scalar(select(func.count()).select_from(Revision)) == 4
    fourth = execute(client, watchlist)
    assert all(c["change_status"] == "unchanged" for c in fourth["result"]["signals"])


def test_missing_financial_partial(client, watchlist, monkeypatch):
    monkeypatch.setenv("REPLAY_SCENARIO", "missing_financial")
    get_settings.cache_clear()
    run = execute(client, watchlist)
    assert run["status"] == "partial"
    assert run["error_code"] == "INSUFFICIENT_EVIDENCE"
    assert all(c["analysis_status"] == "incomplete" and not c["financial_context"] for c in run["result"]["signals"])


def test_failed_fetch_does_not_destroy_baseline(client, watchlist, monkeypatch):
    from app.errors import ProviderError
    execute(client, watchlist)
    original = __import__("app.agent", fromlist=["collect_public"]).collect_public
    monkeypatch.setattr("app.agent.collect_public", lambda *a: (_ for _ in ()).throw(ProviderError()))
    failure = execute(client, watchlist)
    assert failure["status"] == "partial" and failure["result"]["signals"] == []
    monkeypatch.setattr("app.agent.collect_public", original)
    recovered = execute(client, watchlist)
    assert all(c["change_status"] == "unchanged" for c in recovered["result"]["signals"])


def test_frozen_inputs_and_immutable_history(client, watchlist):
    run_id = launch(client, watchlist)
    client.patch("/api/v1/watchlists/" + watchlist["id"], json={"objective": "New objective", "company_ids": [c["id"] for c in watchlist["companies"][:2]]})
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()
    assert len(detail["inputs"]["companies"]) == 3
    assert detail["query"] == watchlist["objective"]
    for model, values in ((Run, {"inputs": {}}), (Revision, {"card": {}}), (Snapshot, {"normalized": {}})):
        with session() as db, pytest.raises(DatabaseError):
            db.execute(update(model).values(**values))
            db.commit()


def test_live_replay_isolation_no_silent_fallback(client, watchlist, monkeypatch):
    execute(client, watchlist)
    monkeypatch.setenv("MODE", "live")
    monkeypatch.setenv("SECTORS_API_KEY", "")
    get_settings.cache_clear()
    # Avoid external public traffic while testing a live missing-credentials failure.
    from app.errors import ProviderError
    monkeypatch.setattr("app.agent.collect_public", lambda *a: (_ for _ in ()).throw(ProviderError()))
    result = execute(client, watchlist)
    assert result["mode"] == "live" and result["status"] == "partial"
    assert result["result"]["signals"] == []
    assert client.get("/api/v1/signals").json()["items"] == []
    assert len(client.get("/api/v1/signals?mode=replay").json()["items"]) == 3


def test_cursor_auth_scope_and_legacy_contract(client, watchlist):
    execute(client, watchlist)
    first = client.get("/api/v1/signals?limit=2").json()
    assert len(first["items"]) == 2 and first["next_cursor"]
    second = client.get("/api/v1/signals", params={"cursor": first["next_cursor"], "limit": 2}).json()
    assert len(second["items"]) == 1
    assert client.get("/api/v1/signals?cursor=bad").status_code == 422
    assert client.get("/api/v1/signals", headers={"Authorization": ""}).status_code == 401
    response = client.get("/dashboard").json()
    assert response["aggregates"]["signalsInRange"] == len(response["signals"])
    assert response["signals"][0]["title"].startswith("[REPLAY]")
    assert response["signals"][0]["evidence"]
    with session() as db:
        run = db.scalar(select(Run))
    stream = client.get("/runs/" + run.id + "/stream")
    assert '"status": "complete"' in stream.text
    assert client.get("/api/v1/companies?query=ISAT").json()["items"][0]["symbol"] == "ISAT"
