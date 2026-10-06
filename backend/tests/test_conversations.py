import base64
from datetime import datetime, timezone
from uuid import uuid4

from app.db import session
from app.models import Conversation, Run


def test_conversation_history_upsert_and_delete(client):
    conversation_id = str(uuid4())
    body = {
        "id": conversation_id,
        "title": "What changed at ISAT?",
        "createdAt": "2026-09-27T10:00:00Z",
        "updatedAt": "2026-09-27T10:01:00Z",
        "messages": [
            {
                "id": str(uuid4()),
                "role": "user",
                "kind": "text",
                "content": "What changed at ISAT?",
                "createdAt": "2026-09-27T10:00:00Z",
            },
            {
                "id": str(uuid4()),
                "role": "assistant",
                "kind": "research",
                "content": "Evidence-backed investigation complete.",
                "label": "Research investigation",
                "createdAt": "2026-09-27T10:01:00Z",
                "suggestions": [{"label": "Compare rivals", "prompt": "Compare ISAT and TLKM"}],
            },
        ],
    }

    saved = client.post("/api/v1/conversations", json=body)
    assert saved.status_code == 200
    assert saved.json()["id"] == conversation_id
    assert len(saved.json()["messages"]) == 2
    assert saved.json()["messages"][1]["suggestions"] == body["messages"][1]["suggestions"]

    body["title"] = "ISAT investigation"
    body["updatedAt"] = "2026-09-27T10:02:00Z"
    assert client.post("/api/v1/conversations", json=body).json()["title"] == "ISAT investigation"
    stale = {**body, "title": "Old tab", "updatedAt": "2026-09-27T10:01:00Z"}
    assert client.post("/api/v1/conversations", json=stale).status_code == 409

    history = client.get("/api/v1/conversations")
    assert history.status_code == 200
    assert history.json()[0]["title"] == "ISAT investigation"

    assert client.delete(f"/api/v1/conversations/{conversation_id}").status_code == 204
    assert client.get("/api/v1/conversations").json() == []


def test_clear_all_conversations_is_workspace_scoped_and_preserves_runs(client, watchlist):
    created = datetime.now(timezone.utc)
    for name in ("first", "second"):
        assert client.post("/api/v1/conversations", json={
            "id": str(uuid4()), "title": name, "createdAt": created.isoformat(),
            "updatedAt": created.isoformat(), "messages": [],
        }).status_code == 200
    other_id = str(uuid4())
    with session() as db, db.begin():
        db.add(Conversation(id=other_id, workspace_id="someone-else", title="Keep mine",
                            messages=[], created_at=created, updated_at=created))
    run = client.post("/api/v1/research-runs", json={
        "watchlist_id": watchlist["id"], "query": "What changed?",
    })
    assert run.status_code == 202

    assert client.delete("/api/v1/conversations").status_code == 204
    assert client.get("/api/v1/conversations").json() == []
    with session() as db:
        assert db.get(Conversation, other_id).title == "Keep mine"
        assert db.get(Run, run.json()["id"]) is not None
    assert client.delete("/api/v1/conversations").status_code == 204


def test_private_demo_login_session_and_sign_out(client):
    no_bearer = {"Authorization": ""}
    denied = client.get("/api/v1/session", headers=no_bearer)
    assert denied.status_code == 401
    assert denied.headers["www-authenticate"] == 'Bearer realm="RivalPulse"'
    wrong = client.post("/demo/login", json={"token": "wrong-access-token"})
    assert wrong.status_code == 401
    assert wrong.headers["www-authenticate"] == 'Bearer realm="RivalPulse"'
    # Existing command-line demo credentials remain supported without a dialog.
    basic = base64.b64encode(b"demo:test-private-access-token").decode()
    assert client.get("/api/v1/session", headers={"Authorization": "Basic " + basic}).status_code == 200
    signed_in = client.post("/demo/login", json={"token": "test-private-access-token"})
    assert signed_in.status_code == 204
    assert signed_in.cookies.get("rivalpulse_demo") is not None
    assert client.get("/api/v1/session", headers=no_bearer).json() == {
        "authenticated": True, "mode": "private-demo"}
    assert client.post("/demo/logout", headers={"Origin": "https://attacker.example"}).status_code == 403
    assert client.get("/api/v1/session", headers=no_bearer).status_code == 200
    assert client.post("/demo/logout").status_code == 204
    assert client.get("/api/v1/session", headers=no_bearer).status_code == 401


def test_agent_watchlist_command_is_durable(client):
    updated = client.patch("/watchlist", json={"name": "Focused rivals", "tickers": ["ISAT", "TLKM"]})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Focused rivals"
    assert {company["ticker"] for company in updated.json()["companies"]} == {"ISAT", "TLKM"}

    dashboard = client.get("/dashboard").json()
    assert dashboard["watchlist"]["name"] == "Focused rivals"
    assert {company["ticker"] for company in dashboard["watchlist"]["companies"]} == {"ISAT", "TLKM"}


def test_conversation_payload_is_bounded(client):
    body = {
        "id": str(uuid4()),
        "title": "Too many messages",
        "createdAt": "2026-09-27T10:00:00Z",
        "updatedAt": "2026-09-27T10:00:00Z",
        "messages": [{
            "id": "m", "role": "user", "kind": "text", "content": "hello",
            "createdAt": "2026-09-27T10:00:00Z",
        }] * 201,
    }
    response = client.post("/api/v1/conversations", json=body)
    assert response.status_code == 422
