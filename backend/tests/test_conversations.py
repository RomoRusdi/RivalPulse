from uuid import uuid4


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
                "run": {"id": "run-1", "status": "complete"},
            },
        ],
    }

    saved = client.post("/api/v1/conversations", json=body)
    assert saved.status_code == 200
    assert saved.json()["id"] == conversation_id
    assert len(saved.json()["messages"]) == 2

    body["title"] = "ISAT investigation"
    body["updatedAt"] = "2026-09-27T10:02:00Z"
    assert client.post("/api/v1/conversations", json=body).json()["title"] == "ISAT investigation"

    history = client.get("/api/v1/conversations")
    assert history.status_code == 200
    assert history.json()[0]["title"] == "ISAT investigation"

    assert client.delete(f"/api/v1/conversations/{conversation_id}").status_code == 204
    assert client.get("/api/v1/conversations").json() == []


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
