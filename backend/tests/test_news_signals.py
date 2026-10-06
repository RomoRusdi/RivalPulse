"""Sectors company news is the primary competitive-event source in live mode."""
import httpx
from sqlalchemy import select

from app.config import get_settings
from app.db import session
from app.errors import ProviderError
from app.models import Snapshot
from app.providers import replay_report
from app.research import execute_run
from tests.conftest import launch
from tests.test_providers import LockRedis

ANNOUNCEMENT = {
    "title": "Indosat launches new enterprise package",
    "body": "Indosat launches a new enterprise connectivity package for business customers.",
    "source": "https://news.test/isat-package", "timestamp": "2026-09-20", "symbols": ["ISAT"],
}
BOILERPLATE = {
    "title": "Quarterly report summary",
    "body": "The company published its quarterly report for the period.",
    "source": "https://news.test/quarterly", "timestamp": "2026-09-19", "symbols": ["ISAT"],
}


def live_stack(monkeypatch, articles):
    monkeypatch.setenv("MODE", "live")
    monkeypatch.setenv("SECTORS_API_KEY", "test-only-fake-key")
    get_settings.cache_clear()

    def handler(request):
        if "/news/" in request.url.path:
            return httpx.Response(200, json={"results": articles, "pagination": {"has_next": False}})
        symbol = request.url.path.split("/")[-2]
        return httpx.Response(200, json=replay_report(symbol, "baseline", {}))

    real = httpx.Client
    monkeypatch.setattr("app.providers.httpx.Client",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr("app.providers.redis_connection", LockRedis)
    # Approved pages are out of scope here; provider news is the evidence under test.
    monkeypatch.setattr("app.agent.collect_public",
                        lambda *a: (_ for _ in ()).throw(ProviderError("SOURCE_UNAVAILABLE", "unreachable")))


def test_provider_news_becomes_cited_signals_and_boilerplate_is_dropped(client, watchlist, monkeypatch):
    live_stack(monkeypatch, [ANNOUNCEMENT, BOILERPLATE])
    run_id = launch(client, watchlist)
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()
    cards = detail["result"]["signals"]

    assert cards, "provider news should produce competitive signals without any page scraping"
    assert {c["type"] for c in cards} == {"Product"}
    # The announcement became a signal; the quarterly-report filler did not.
    assert all("launches new enterprise package" in c["title"].lower() for c in cards)

    with session() as db:
        news = db.scalars(select(Snapshot).where(Snapshot.provider == "sectors_news")).all()
    assert news, "news must be stored under its own provider, not as financial evidence"
    assert all(len(s.normalized["events"]) == 1 and len(s.normalized["articles"]) == 2 for s in news)

    cited = {e["snapshot_id"] for c in cards for e in c["evidence"]}
    assert cited & {s.id for s in news}, "signal evidence must resolve to the stored news snapshot"


def test_news_without_announcements_is_quiet_not_a_fabricated_signal(client, watchlist, monkeypatch):
    live_stack(monkeypatch, [BOILERPLATE])
    run_id = launch(client, watchlist)
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()

    assert detail["result"]["signals"] == []
    with session() as db:
        news = db.scalars(select(Snapshot).where(Snapshot.provider == "sectors_news")).all()
    assert news and all(s.normalized["events"] == [] for s in news)


def test_news_snapshots_cannot_be_cited_as_financial_evidence(client, watchlist, monkeypatch):
    """financial_context must resolve to a report snapshot, never to a news story."""
    live_stack(monkeypatch, [ANNOUNCEMENT])
    run_id = launch(client, watchlist)
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()

    with session() as db:
        news_ids = {s.id for s in db.scalars(select(Snapshot).where(Snapshot.provider == "sectors_news"))}
    for card in detail["result"]["signals"]:
        evidence = {e["id"]: e for e in card["evidence"]}
        for metric in card["financial_context"]:
            assert not {evidence[i]["snapshot_id"] for i in metric["evidence_ids"]} & news_ids


def test_catalogue_company_without_approved_pages_still_completes(client, monkeypatch):
    """Most IDX companies have no hand-curated page. Sectors covers them, so a
    missing optional page must not be reported as missing evidence."""
    live_stack(monkeypatch, [{**ANNOUNCEMENT, "title": "BBCA launches an enterprise service",
        "body": "BBCA launches a new enterprise service for its business customers.", "symbols": ["BBCA"]}])
    catalogue = {c["symbol"]: c["id"] for c in client.get("/api/v1/companies?limit=100").json()["items"]}
    assert {"BBCA", "BBRI"} <= set(catalogue), "the backend catalogue must match what the UI offers"

    created = client.post("/api/v1/watchlists", json={
        "name": "Banks", "objective": "Compare product and pricing moves",
        "company_ids": [catalogue["BBCA"], catalogue["BBRI"]]})
    assert created.status_code == 201, created.text

    run_id = client.post("/api/v1/research-runs", json={"watchlist_id": created.json()["id"]}).json()["id"]
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()

    assert detail["status"] == "completed", detail["result"]["warnings"]
    assert not any("NO_APPROVED_SOURCES" in w for w in detail["result"]["warnings"])
    assert detail["result"]["signals"], "provider news alone should produce signals"


def test_news_with_non_string_timestamp_still_publishes(client, watchlist, monkeypatch):
    """Provider timestamps are not guaranteed strings. A numeric timestamp must
    degrade to unknown publication time, never fail the run or drop the finding."""
    epoch_article = {**ANNOUNCEMENT, "timestamp": 1758000000}
    live_stack(monkeypatch, [epoch_article])
    run_id = launch(client, watchlist)
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()

    assert detail["status"] in ("completed", "partial"), detail["error_code"]
    assert detail["result"]["signals"], "the announcement must still be published"
    assert all(c["published_at"] is None for c in detail["result"]["signals"])


def test_silent_companies_are_named_and_statements_still_compared(client, watchlist, monkeypatch):
    """Only ISAT makes the news: TLKM and EXCL must be named as silent instead
    of vanishing, while the cited annual table still compares all three."""
    import httpx

    from app.config import get_settings
    from app.providers import replay_report
    from tests.test_providers import LockRedis

    monkeypatch.setenv("MODE", "live")
    monkeypatch.setenv("SECTORS_API_KEY", "test-only-fake-key")
    get_settings.cache_clear()

    def handler(request):
        if "/news/" in request.url.path:
            if request.url.params.get("symbols") == "ISAT":
                return httpx.Response(200, json={"results": [ANNOUNCEMENT],
                                                 "pagination": {"has_next": False}})
            return httpx.Response(200, json={"results": [], "pagination": {"has_next": False}})
        symbol = request.url.path.split("/")[-2]
        return httpx.Response(200, json=replay_report(symbol, "baseline", {}))

    real = httpx.Client
    monkeypatch.setattr("app.providers.httpx.Client",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr("app.providers.redis_connection", LockRedis)
    monkeypatch.setattr("app.agent.collect_public", lambda *a: (_ for _ in ()).throw(
        ProviderError("SOURCE_UNAVAILABLE", "unreachable")))

    run_id = launch(client, watchlist)
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()

    assert detail["status"] in ("completed", "partial"), detail["error_code"]
    cards = detail["result"]["signals"]
    assert cards and {c["company"]["symbol"] for c in cards} == {"ISAT"}
    summary = detail["result"]["summary"]
    assert "No findings for TLKM" in summary and "No findings for EXCL" in summary
    brief = detail["result"]["financial_brief"]
    assert brief and {r["symbol"] for r in brief["rows"]} == {"TLKM", "ISAT", "EXCL"}
    assert brief["interpretation"] is None


def test_backend_catalogue_covers_every_company_the_ui_offers(client):
    """A ticker the UI lets you pick but the backend rejects is a dead end."""
    import pathlib
    import re
    source = pathlib.Path("../frontend/src/lib/catalogue.ts").read_text(encoding="utf-8")
    offered = set(re.findall(r'ticker:\s*"([A-Z]{4})"', source))
    seeded = {c["symbol"] for c in client.get("/api/v1/companies?limit=100").json()["items"]}
    assert offered and offered <= seeded, f"UI offers unseeded tickers: {sorted(offered - seeded)}"
