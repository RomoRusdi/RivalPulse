from datetime import timedelta

import fakeredis
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import get_settings
from app.db import session, utcnow
from app.models import AuthSession, Signal, User, Watchlist, Workspace, WorkspaceMembership

PASSWORD = "a long private test passphrase"
ORIGIN = "http://localhost:8000"


@pytest.fixture
def account_client(env, monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "accounts")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("AUTH_ORIGINS", '["http://localhost:8000"]')
    monkeypatch.setenv("REGISTRATION_ENABLED", "true")
    get_settings.cache_clear()
    redis = fakeredis.FakeRedis()
    monkeypatch.setattr("app.auth.redis_connection", lambda: redis)
    from app.main import app
    with TestClient(app, base_url=ORIGIN) as client:
        yield client


def mutate(client, path, body=None, method="POST", **headers):
    csrf = client.get("/api/v1/auth/csrf")
    assert csrf.status_code == 200, csrf.text
    return client.request(method, "/api/v1" + path, json=body,
                          headers={"Origin": ORIGIN, "X-CSRF-Token": csrf.json()["token"], **headers})


def register(client, email="owner@example.com"):
    return mutate(client, "/auth/register", {"name": "Demo Owner", "workspace_name": "Team One",
                                            "email": email, "password": PASSWORD})


def login(client, email="owner@example.com", password=PASSWORD, remember=False):
    return mutate(client, "/auth/login", {"email": email, "password": password, "remember": remember})


def assert_account_login_required(response):
    assert response.status_code == 401, response.text
    assert "www-authenticate" not in response.headers
    assert response.headers["content-type"] == "application/json"
    assert response.headers["cache-control"] == "no-store"
    assert set(response.json()) == {"code", "message", "retryable", "request_id"}
    assert response.json()["request_id"] == response.headers["x-request-id"]


@pytest.mark.parametrize("path", [
    "/api/v1/auth/me", "/dashboard", "/api/v1/conversations",
    "/runs/00000000-0000-0000-0000-000000000000/stream",
])
def test_signed_out_requests_use_app_login_without_browser_challenge(account_client, path):
    assert_account_login_required(account_client.get(path))
    # Explicit demo credentials never bypass account authentication.
    assert_account_login_required(account_client.get(path, headers={
        "Authorization": "Bearer test-private-access-token",
        "Cookie": "rivalpulse_session=invalid-session",
    }))


def test_register_login_profile_logout(account_client):
    c = account_client
    assert c.get("/dashboard").status_code == 401
    created = register(c)
    assert created.status_code == 201, created.text
    user = created.json()
    assert user["workspace"] == "Team One"
    assert c.get("/dashboard").status_code == 200
    assert len(c.get("/dashboard").json()["watchlist"]["companies"]) == 3
    assert "HttpOnly" in created.headers["set-cookie"]
    assert "SameSite=strict" in created.headers["set-cookie"]
    raw_token = c.cookies.get("rivalpulse_session")
    with session() as db:
        stored_user = db.get(User, user["id"])
        assert stored_user.password_hash.startswith("$argon2id$")
        stored_session = db.scalar(select(AuthSession))
        assert raw_token not in (stored_session.token_hash, stored_session.csrf_hash)
        assert db.get(WorkspaceMembership, (user["id"], user["workspaceId"])).permission == "owner"
    updated = mutate(c, "/users/me", {"name": "Saved Name", "role": "Analyst", "timezone": "UTC"}, "PATCH")
    assert updated.status_code == 200
    assert c.get("/api/v1/auth/me").json()["name"] == "Saved Name"
    assert mutate(c, "/auth/logout").status_code == 204
    assert not c.cookies.get("rivalpulse_session")
    c.cookies.set("rivalpulse_session", raw_token)
    assert_account_login_required(c.get("/api/v1/auth/me"))
    c.cookies.clear()
    assert login(c).status_code == 200
    assert c.get("/api/v1/auth/me").json()["name"] == "Saved Name"


@pytest.mark.parametrize("company", [None, "TLKM", "BBCA"])
def test_signup_company_and_neutral_persist(account_client, company):
    c = account_client
    catalog = c.get('/api/v1/auth/companies?query=bank').json()['items']
    assert catalog and all(set(item) == {'ticker', 'name', 'industry'} for item in catalog)
    assert c.get('/dashboard').status_code == 401
    created = mutate(c, '/auth/register', {'name': 'Company owner', 'workspace_name': 'Research',
        'email': 'company@example.com', 'password': PASSWORD, 'user_company': company})
    assert created.status_code == 201, created.text
    wl = c.get('/dashboard').json()['watchlist']
    assert wl['user_company'] == company
    assert len(wl['companies']) >= 2
    assert company not in {item['ticker'] for item in wl['companies']}
    assert mutate(c, '/auth/logout').status_code == 204
    assert login(c, email='company@example.com').status_code == 200
    assert c.get('/dashboard').json()['watchlist']['user_company'] == company


def test_invalid_signup_company_does_not_create_account(account_client):
    result = mutate(account_client, '/auth/register', {'name': 'Owner', 'workspace_name': 'Research',
        'email': 'unknown@example.com', 'password': PASSWORD, 'user_company': 'ZZZZ'})
    assert result.status_code == 422
    with session() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0


@pytest.mark.parametrize('company,expected', [(None, "Owner's workspace"), ('TLKM', 'TLKM research')])
def test_signup_generates_workspace_name(account_client, company, expected):
    result = mutate(account_client, '/auth/register', {'name': 'Owner', 'user_company': company,
        'email': 'generated@example.com', 'password': PASSWORD})
    assert result.status_code == 201, result.text
    assert result.json()['workspace'] == expected


def test_financial_reports_are_isolated_by_account(account_client):
    from app.research import execute_run
    c = account_client
    assert register(c).status_code == 201
    first = c.get('/dashboard').json()['watchlist']['id']
    run = mutate(c, '/research-runs', {'watchlist_id': first})
    execute_run(run.json()['id'])
    assert any(track['points'] for track in c.get('/api/v1/watchlists/' + first + '/financials').json()['companies'])
    assert mutate(c, '/auth/logout').status_code == 204
    assert register(c, email='second@example.com').status_code == 201
    assert c.get('/api/v1/watchlists/' + first + '/financials').status_code == 404
    second = c.get('/dashboard').json()['watchlist']['id']
    assert all(not track['points'] for track in c.get('/api/v1/watchlists/' + second + '/financials').json()['companies'])


def test_finding_feed_isolated_by_account(account_client):
    from app.research import execute_run
    c = account_client
    assert register(c).status_code == 201
    run = mutate(c, '/research-runs', {'watchlist_id': c.get('/dashboard').json()['watchlist']['id']})
    assert run.status_code == 202
    execute_run(run.json()['id'])
    assert c.get('/findings?period=all').json()['items']
    assert mutate(c, '/auth/logout').status_code == 204
    assert register(c, 'second@example.com').status_code == 201
    assert c.get('/findings?period=all').json()['summary']['total'] == 0


def test_email_uniqueness_and_atomic_registration(account_client):
    c = account_client
    assert register(c, " Owner@Example.COM ").status_code == 201
    assert register(c, "owner@example.com").status_code == 409
    with session() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert db.scalar(select(func.count()).select_from(WorkspaceMembership)) == 1
        assert db.scalar(select(func.count()).select_from(Workspace)) == 2  # legacy + new


def test_csrf_origin_session_binding_and_demo_bypass(account_client):
    c = account_client
    payload = {"email": "owner@example.com", "password": PASSWORD}
    assert c.post("/api/v1/auth/login", json=payload).status_code == 403
    old_csrf = c.get("/api/v1/auth/csrf").json()["token"]
    assert register(c).status_code == 201
    assert c.post("/api/v1/auth/logout", headers={"Origin": ORIGIN, "X-CSRF-Token": old_csrf}).status_code == 403
    assert mutate(c, "/auth/logout", Origin="https://attacker.example").status_code == 403
    assert c.post("/api/v1/auth/logout", headers={"Origin": ORIGIN}).status_code == 403
    c.cookies.clear()
    assert c.get("/dashboard", headers={"Authorization": "Bearer test-private-access-token"}).status_code == 401
    assert c.post("/demo/login", json={"token": "test-private-access-token"}).status_code == 404


def test_invalid_credentials_and_throttle(account_client):
    c = account_client
    assert register(c).status_code == 201
    wrong = login(c, password="wrong")
    missing = login(c, email="missing@example.com", password="wrong")
    assert_account_login_required(wrong)
    assert_account_login_required(missing)
    assert wrong.json()["message"] == missing.json()["message"]
    for _ in range(9):
        assert login(c, password="wrong").status_code == 401
    assert login(c).status_code == 429


def test_password_whitespace_preserved_and_change_revokes_all(account_client):
    c = account_client
    assert register(c).status_code == 201
    first_token = c.cookies.get("rivalpulse_session")
    c.cookies.clear()  # independent device
    assert login(c).status_code == 200
    assert mutate(c, "/auth/change-password", {"current_password": "incorrect", "new_password": PASSWORD}).status_code == 400
    next_password = "  a different long passphrase  "
    assert mutate(c, "/auth/change-password", {"current_password": PASSWORD, "new_password": next_password}).status_code == 204
    c.cookies.set("rivalpulse_session", first_token)
    assert_account_login_required(c.get("/dashboard"))
    c.cookies.clear()
    assert login(c).status_code == 401
    assert login(c, password=next_password.strip()).status_code == 401
    assert login(c, password=next_password).status_code == 200


@pytest.mark.parametrize("expiration", ["absolute", "idle", "disabled", "membership"])
def test_expired_and_removed_access(account_client, expiration):
    c = account_client
    assert register(c).status_code == 201
    with session() as db:
        auth = db.scalar(select(AuthSession))
        if expiration == "absolute":
            auth.expires_at = utcnow() - timedelta(seconds=1)
        elif expiration == "idle":
            auth.last_seen_at = utcnow() - timedelta(hours=25)
        elif expiration == "disabled":
            db.get(User, auth.user_id).active = False
        else:
            db.delete(db.get(WorkspaceMembership, (auth.user_id, auth.workspace_id)))
        db.commit()
    assert_account_login_required(c.get("/dashboard"))


def test_session_rotation_remember_and_secure_cookie(account_client, monkeypatch):
    c = account_client
    assert register(c).status_code == 201
    first = c.cookies.get("rivalpulse_session")
    response = login(c, remember=True)
    assert response.status_code == 200
    assert "Max-Age=2592000" in response.headers["set-cookie"]
    c.cookies.clear()
    c.cookies.set("rivalpulse_session", first)
    assert c.get("/dashboard").status_code == 401
    c.cookies.clear()
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("AUTH_ORIGINS", '["https://testserver"]')
    get_settings.cache_clear()
    from app.main import app
    with TestClient(app, base_url="https://testserver") as secure:
        csrf = secure.get("/api/v1/auth/csrf").json()["token"]
        result = secure.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": PASSWORD},
                             headers={"Origin": "https://testserver", "X-CSRF-Token": csrf})
        assert result.status_code == 200
        assert "__Host-rivalpulse_session=" in result.headers["set-cookie"]
        assert "Secure" in result.headers["set-cookie"]
        assert secure.get("/api/v1/auth/me").status_code == 200


def test_profile_allowlist_and_validation(account_client):
    c = account_client
    assert register(c).status_code == 201
    profile = {"name": "Name", "role": "Analyst", "timezone": "UTC"}
    for bad in ({"email": "attacker@example.com"}, {"workspaceId": "private-demo"},
                {"permission": "owner"}, {"name": " "}, {"timezone": "Invalid/Timezone"}):
        assert mutate(c, "/users/me", {**profile, **bad}, "PATCH").status_code == 422


def test_workspace_isolation_including_completed_runs_and_streams(account_client):
    c = account_client
    first = register(c).json()
    watchlist = c.get("/api/v1/watchlists").json()["items"][0]
    run = mutate(c, "/research-runs", {"watchlist_id": watchlist["id"]}, **{"Idempotency-Key": "same-key"})
    assert run.status_code == 202, run.text
    from app.research import execute_run
    execute_run(run.json()["id"])
    run_id = run.json()["id"]
    result = c.get(f"/api/v1/research-runs/{run_id}").json()
    assert result["status"] == "completed", result
    signal_id = c.get("/api/v1/signals").json()["items"][0]["signal_id"]
    assert c.get(f"/runs/{run_id}/stream").status_code == 200
    assert register(c, "other@example.com").status_code == 201
    second_watchlist = c.get("/api/v1/watchlists").json()["items"][0]
    assert second_watchlist["id"] != watchlist["id"]
    for path in (f"/api/v1/watchlists/{watchlist['id']}", f"/api/v1/research-runs/{run_id}",
                 f"/api/v1/watchlists/{watchlist['id']}/research-runs", f"/api/v1/signals/{signal_id}",
                 f"/signals/{signal_id}", f"/runs/{run_id}/stream"):
        assert c.get(path).status_code == 404, path
    assert mutate(c, f"/watchlists/{watchlist['id']}", {"name": "stolen"}, "PATCH").status_code == 404
    assert c.post(f"/runs/{run_id}/cancel", headers={"Origin": ORIGIN, "X-CSRF-Token": c.get("/api/v1/auth/csrf").json()["token"]}).status_code == 404
    assert mutate(c, "/research-runs", {"watchlist_id": watchlist["id"]}).status_code == 404
    assert mutate(c, "/research-runs", {"watchlist_id": second_watchlist["id"], "parent_signal_id": signal_id}).status_code == 404
    own_run = mutate(c, "/research-runs", {"watchlist_id": second_watchlist["id"]}, **{"Idempotency-Key": "same-key"})
    assert own_run.status_code == 202
    assert own_run.json()["id"] != run_id
    assert c.get("/dashboard").json()["signals"] == []
    with session() as db:
        assert db.scalar(select(Signal)).workspace_id == first["workspaceId"]


def test_registration_switch_and_fail_closed_redis(account_client, monkeypatch):
    monkeypatch.setenv("REGISTRATION_ENABLED", "false")
    get_settings.cache_clear()
    assert register(account_client).status_code == 403
    monkeypatch.setattr("app.auth.redis_connection", lambda: (_ for _ in ()).throw(ConnectionError()))
    assert login(account_client).status_code == 503


def test_legacy_workspace_requires_explicit_bootstrap(account_client):
    from app.accounts import bootstrap
    bootstrap("legacy@example.com", "Legacy owner", "private-demo", PASSWORD)
    assert login(account_client, "legacy@example.com").status_code == 200
    assert account_client.get("/api/v1/auth/me").json()["workspaceId"] == "private-demo"
    with pytest.raises(ValueError):
        bootstrap("legacy@example.com", "Someone else", "private-demo", PASSWORD)
    with session() as db:
        assert db.scalar(select(Watchlist).where(Watchlist.workspace_id == "private-demo"))


def test_stream_stops_after_session_revocation(account_client, monkeypatch):
    import asyncio
    from starlette.requests import Request
    from app.auth import authenticate
    from app.main import stream
    from app.models import Run

    c = account_client
    assert register(c).status_code == 201
    wl = c.get("/api/v1/watchlists").json()["items"][0]
    accepted = mutate(c, "/research-runs", {"watchlist_id": wl["id"]})
    assert accepted.status_code == 202
    request = Request({"type": "http", "method": "GET", "headers": [
        (b"cookie", ("rivalpulse_session=" + c.cookies.get("rivalpulse_session")).encode())]})

    async def no_wait(_):
        pass

    monkeypatch.setattr("app.main.asyncio.sleep", no_wait)

    async def consume():
        with session() as db:
            auth, _ = authenticate(request, db)
            response = stream(accepted.json()["id"], request, db)
            assert (await anext(response.body_iterator)).startswith("data: ")
            auth.revoked = True
            db.commit()
            assert "auth-expired" in await anext(response.body_iterator)
            with pytest.raises(StopAsyncIteration):
                await anext(response.body_iterator)
            # Revoking access does not cancel a persisted investigation.
            assert db.get(Run, accepted.json()["id"]).status == "queued"
    asyncio.run(consume())


def test_conversation_persistence_is_isolated_by_account(account_client):
    from uuid import uuid4
    c = account_client
    assert register(c).status_code == 201
    identifier = str(uuid4())
    payload = {"id": identifier, "title": "Private conversation", "createdAt": "2026-09-28T00:00:00Z",
               "updatedAt": "2026-09-28T00:00:00Z", "messages": []}
    assert mutate(c, "/conversations", payload).status_code == 200
    assert register(c, "other@example.com").status_code == 201
    assert c.get("/api/v1/conversations").json() == []
    assert mutate(c, "/conversations", {**payload, "title": "Overwrite"}).status_code == 409
    assert mutate(c, "/conversations/" + identifier, method="DELETE").status_code == 404
    assert login(c).status_code == 200
    assert c.get("/api/v1/conversations").json()[0]["title"] == "Private conversation"


def test_account_ai_context_and_conversation_references(account_client, monkeypatch):
    import json
    from uuid import uuid4
    from app.models import Run
    from app.research import execute_run

    c = account_client
    first = register(c).json()
    wl = c.get("/api/v1/watchlists").json()["items"][0]
    assert mutate(c, "/watchlists/" + wl["id"], {"name": "Account A confidential", "user_company": "ISAT"}, "PATCH").status_code == 200
    run_id = mutate(c, "/research-runs", {"watchlist_id": wl["id"]}).json()["id"]
    execute_run(run_id)
    captured = []

    class Talker:
        def chat(self, messages):
            captured.append(messages)
            return "I can help investigate your watchlist."

    monkeypatch.setenv("LLM_ENABLED", "true")
    get_settings.cache_clear()
    monkeypatch.setattr("app.agent.OllamaAdapter", Talker)
    assert mutate(c, "/chat", {"message": "Hello RivalPulse"}).json()["source"] == "llm"
    prompt_a = json.dumps(captured[-1])
    assert "Account A confidential" in prompt_a and "Our company: ISAT" in prompt_a
    assert first["email"] not in prompt_a and PASSWORD not in prompt_a
    before = c.get("/api/v1/research-runs/" + run_id).json()["estimated_credits"]
    payload = {"id": str(uuid4()), "title": "Research", "createdAt": "2026-10-05T00:00:00Z",
               "updatedAt": "2026-10-05T00:00:00Z", "messages": [{"id": "a", "role": "assistant",
               "kind": "research", "content": "Cited findings", "createdAt": "2026-10-05T00:00:00Z",
               "run": {"id": run_id, "resultSummary": "CLIENT INVENTION"}}]}
    saved = mutate(c, "/conversations", payload)
    assert saved.status_code == 200, saved.text
    assert "CLIENT INVENTION" not in saved.text
    assert register(c, "other@example.com").status_code == 201
    assert mutate(c, "/chat", {"message": "Hello RivalPulse"}).status_code == 200
    assert "Account A confidential" not in json.dumps(captured[-1])
    assert "Stored findings:\n- none yet" in captured[-1][0]["content"]
    assert mutate(c, "/conversations", {**payload, "id": str(uuid4())}).status_code == 404
    with session() as db:
        assert db.get(Run, run_id).credits == before
    assert login(c).status_code == 200
    assert mutate(c, "/users/me", {"name": "Changed", "role": "Administrator", "timezone": "UTC"}, "PATCH").status_code == 200
    with session() as db:
        assert db.get(WorkspaceMembership, (first["id"], first["workspaceId"])).permission == "owner"


def test_chat_capacity_csrf_and_account_scheduler(account_client, monkeypatch):
    from app import chat, jobs
    c = account_client
    assert register(c).status_code == 201
    assert c.post("/api/v1/chat", json={"message": "hello"}).status_code == 403
    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("SCHEDULED_SWEEP_ENABLED", "true")
    get_settings.cache_clear()
    lock = chat.redis_connection().lock("rivalpulse:ai:chat", timeout=10)
    assert lock.acquire(blocking=False)
    try:
        busy = mutate(c, "/chat", {"message": "Hello RivalPulse"})
        assert busy.status_code == 429 and busy.json()["code"] == "AI_BUSY"
    finally:
        lock.release()
    assert jobs.maybe_scheduled_sweep() is False
    monkeypatch.setenv("ALERTS_ENABLED", "true")
    monkeypatch.setenv("ALERT_EMAIL_TO", "legacy@example.com")
    monkeypatch.setenv("GMAIL_ADDRESS", "sender@example.com")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "test-only")
    get_settings.cache_clear()
    status = c.get("/api/v1/alerts/status").json()
    assert not status["enabled"]
    assert status["recipient"] is None
