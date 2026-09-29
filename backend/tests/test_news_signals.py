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
