from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import httpx
import pytest
import ssl
from sqlalchemy import func, select

from app.config import get_settings
from app.db import session, utcnow
from app.errors import AppError, ProviderError
from app.models import AuthSession, CreditAccount, CreditReservation, PendingRegistration, Run, User, Workspace, WorkspaceCredit
from tests.test_auth import PASSWORD, account_client as account_fixture, login, mutate, register


account_client = account_fixture


@pytest.fixture
def verifying(account_client, monkeypatch):
    monkeypatch.setenv("EMAIL_VERIFICATION_ENABLED", "true")
    monkeypatch.setenv("TAB_SESSION_REQUIRED", "true")
    get_settings.cache_clear()
    mail = []
    monkeypatch.setattr("app.email_verification.send_code", lambda email, code: mail.append((email, code)))
    return account_client, mail


def begin(c, email="new@example.com"):
    response = mutate(c, "/auth/register", {"name": "Verified Owner", "email": email,
        "password": PASSWORD, "user_company": "TLKM"})
    assert response.status_code == 202, response.text
    return response.json()["challengeId"]


def check(c, identifier, code):
    return mutate(c, "/auth/verification/check", {"challenge_id": identifier, "code": code})


def test_email_ownership_before_atomic_activation_and_single_use(verifying):
    c, mail = verifying
    preflight = c.options("/api/v1/auth/me", headers={"Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "X-Tab-Session"})
    assert preflight.status_code == 200
    identifier = begin(c)
    with session() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0
        assert db.scalar(select(func.count()).select_from(Workspace)) == 1
        pending = db.get(PendingRegistration, identifier)
        assert pending.password_hash.startswith("$argon2id$")
        assert mail[-1][1] not in pending.code_hash
    assert login(c, email="new@example.com").status_code == 401
    assert check(c, identifier, mail[-1][1]).status_code == 200
    assert check(c, identifier, mail[-1][1]).status_code == 400
    result = login(c, email="new@example.com")
    assert result.status_code == 200 and result.json()["emailVerified"]
    assert result.json()["workspace"] == "TLKM research"
    with session() as db:
        assert db.get(PendingRegistration, identifier) is None
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert db.scalar(select(func.count()).select_from(Workspace)) == 2


def test_verification_attempt_limit_expiry_resend_and_cleanup(verifying):
    from app.email_verification import cleanup
    c, mail = verifying
    identifier = begin(c)
    code = mail[-1][1]
    wrong = "00000000" if code != "00000000" else "11111111"
    for _ in range(5):
        assert check(c, identifier, wrong).status_code == 400
    assert check(c, identifier, code).status_code == 400
    assert mutate(c, "/auth/verification/resend", {"challenge_id": identifier}).status_code == 429
    with session() as db, db.begin():
        db.get(PendingRegistration, identifier).sent_at = utcnow() - timedelta(seconds=61)
    assert mutate(c, "/auth/verification/resend", {"challenge_id": identifier}).status_code == 200
    assert mail[-1][1] != code
    assert check(c, identifier, code).status_code == 400
    with session() as db, db.begin():
        row = db.get(PendingRegistration, identifier)
        row.code_expires_at = utcnow() - timedelta(seconds=1)
    assert check(c, identifier, mail[-1][1]).status_code == 400
    with session() as db, db.begin():
        db.get(PendingRegistration, identifier).expires_at = utcnow() - timedelta(seconds=1)
        cleanup(db)
    with session() as db:
        assert db.get(PendingRegistration, identifier) is None
        assert db.scalar(select(func.count()).select_from(User)) == 0


def test_invalid_email_and_delivery_failure_create_no_account(verifying, monkeypatch):
    c, _ = verifying
    response = mutate(c, "/auth/register", {"name": "Owner", "email": "fake", "password": PASSWORD})
    assert response.status_code == 422
    def unavailable(*args):
        raise AppError("VERIFICATION_UNAVAILABLE", "Temporarily unavailable", 503)
    monkeypatch.setattr("app.email_verification.send_code", unavailable)
    assert mutate(c, "/auth/register", {"name": "Owner", "email": "valid@example.com", "password": PASSWORD}).status_code == 503
    with session() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0
        assert db.scalar(select(func.count()).select_from(PendingRegistration)) == 0


@pytest.mark.parametrize("security,port", [("ssl", 465), ("starttls", 587)])
def test_verification_mail_requires_certificate_validation(account_client, monkeypatch, security, port):
    from app.email_verification import send_code
    monkeypatch.setenv("VERIFICATION_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("VERIFICATION_SMTP_PORT", str(port))
    monkeypatch.setenv("VERIFICATION_SMTP_SECURITY", security)
    monkeypatch.setenv("VERIFICATION_EMAIL_FROM", "RivalPulse <verify@example.com>")
    get_settings.cache_clear()
    contexts, delivered = [], []
    class SMTP:
        def __init__(self, host, port, **options):
            if options.get("context"):
                contexts.append(options["context"])
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def starttls(self, *, context):
            contexts.append(context)
        def login(self, *args):
            pass
        def send_message(self, message):
            delivered.append(message)
    monkeypatch.setattr("app.email_verification.smtplib.SMTP", SMTP)
    monkeypatch.setattr("app.email_verification.smtplib.SMTP_SSL", SMTP)
    send_code("recipient@example.com", "12345678")
    assert len(contexts) == 1 and contexts[0].check_hostname
    assert contexts[0].verify_mode == ssl.CERT_REQUIRED
    assert delivered[0]["To"] == "recipient@example.com"


def test_registration_cannot_replace_an_existing_account(account_client, monkeypatch):
    c = account_client
    before = register(c).json()
    monkeypatch.setenv("EMAIL_VERIFICATION_ENABLED", "true")
    get_settings.cache_clear()
    sent = []
    monkeypatch.setattr("app.email_verification.send_code", lambda *args: sent.append(args))
    response = register(c)
    assert response.status_code == 202 and response.json()["verificationRequired"]
    assert not sent
    with session() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert db.scalar(select(func.count()).select_from(PendingRegistration)) == 0
    assert login(c).json()["workspaceId"] == before["workspaceId"]


def test_legacy_account_verification_preserves_password_workspace(account_client, monkeypatch):
    c = account_client
    original = register(c).json()
    monkeypatch.setenv("EMAIL_VERIFICATION_ENABLED", "true")
    get_settings.cache_clear()
    mail = []
    monkeypatch.setattr("app.email_verification.send_code", lambda email, code: mail.append(code))
    result = mutate(c, "/auth/verification/start")
    assert result.status_code == 200
    assert check(c, result.json()["challengeId"], mail[-1]).status_code == 200
    assert login(c).json()["workspaceId"] == original["workspaceId"]
    assert c.get("/api/v1/auth/me").json()["emailVerified"]
    assert mutate(c, "/users/me", {"name": "New Name", "timezone": "UTC"}, "PATCH").status_code == 200


def test_temporary_session_requires_tab_proof_on_all_protected_routes(verifying):
    from app.research import execute_run
    c, mail = verifying
    identifier = begin(c)
    assert check(c, identifier, mail[-1][1]).status_code == 200
    response = login(c, email="new@example.com")
    token = response.json()["tabToken"]
    assert token and not response.json()["remembered"]
    assert "Max-Age" not in response.headers["set-cookie"]
    assert c.get("/dashboard").status_code == 401
    c.headers["X-Tab-Session"] = token
    assert c.get("/dashboard").status_code == 200
    watchlist = c.get("/dashboard").json()["watchlist"]["id"]
    run = mutate(c, "/research-runs", {"watchlist_id": watchlist}).json()["id"]
    execute_run(run)
    assert c.get("/runs/" + run + "/stream").status_code == 200
    with session() as db:
        row = db.scalar(select(AuthSession))
        assert token != row.tab_hash
    del c.headers["X-Tab-Session"]
    assert c.get("/api/v1/auth/me").status_code == 401
    assert c.get("/runs/" + run + "/stream").status_code == 401
    assert c.get("/api/v1/watchlists/" + watchlist + "/financials").status_code == 401
    assert login(c, email="new@example.com", remember=True).json()["tabToken"] is None
    assert c.get("/dashboard").status_code == 200


def test_source_viewer_scoped_and_never_fetches(account_client, monkeypatch):
    from app.research import execute_run
    c = account_client
    assert register(c).status_code == 201
    watchlist = c.get("/dashboard").json()["watchlist"]["id"]
    execute_run(mutate(c, "/research-runs", {"watchlist_id": watchlist}).json()["id"])
    points = c.get("/api/v1/watchlists/" + watchlist + "/financials").json()["companies"][0]["points"]
    endpoint = "/api/v1/financial-sources/" + points[0]["snapshotId"]
    def forbidden(*args, **kwargs):
        raise AssertionError("Viewing evidence cannot call Sectors")
    monkeypatch.setattr("app.providers.Sectors.report", forbidden)
    source = c.get(endpoint)
    assert source.status_code == 200
    assert source.json()["points"][0]["value"] == points[0]["value"]
    assert any(figure["metric"] == "earnings" for figure in source.json()["figures"])
    assert "synthetic-test-key" not in source.text
    assert mutate(c, "/auth/logout").status_code == 204
    assert register(c, email="other@example.com").status_code == 201
    assert c.get(endpoint).status_code == 404


def test_workspace_quota_atomic_and_failed_provider_budget_rolls_back(client, watchlist, monkeypatch):
    from tests.test_providers import live_provider
    provider, _, run_id = live_provider(client, watchlist, monkeypatch, lambda request: httpx.Response(500))
    with session() as db, db.begin():
        workspace = db.get(Run, run_id).workspace_id
        db.add(WorkspaceCredit(workspace_id=workspace, total=2, used=0))
    def reserve(_):
        try:
            provider.reserve("b" * 64, 2)
            return True
        except ProviderError:
            return False
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert sum(pool.map(reserve, range(4))) == 1
    with session() as db:
        assert db.get(WorkspaceCredit, workspace).used == 2
        assert db.get(CreditAccount, "sectors").used == 2
        assert db.scalar(select(func.count()).select_from(CreditReservation)) == 1
    assert client.get("/dashboard").json()["aggregates"]["credits"]["availablePercent"] == 0
    with session() as db, db.begin():
        db.get(WorkspaceCredit, workspace).total = 10
        db.get(CreditAccount, "sectors").used = 800
    with pytest.raises(ProviderError):
        provider.reserve("c" * 64, 2)
    with session() as db:
        assert db.get(WorkspaceCredit, workspace).used == 2
        assert db.get(Run, run_id).credits == 2
    credits = client.get("/dashboard").json()["aggregates"]["credits"]
    assert credits["remaining"] == 8 and credits["available"] == 0 and credits["providerLimited"]
