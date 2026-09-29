"""The agent re-plans against collected evidence, not only against the query."""
from datetime import timedelta

from sqlalchemy import select

from app.db import session, utcnow
from app.errors import ProviderError
from app.models import Company, RunSnapshot, RunStep, Snapshot, Source
from app.providers import digest
from app.research import execute_run
from tests.conftest import launch

SEEDED = {
    "TLKM": "https://www.telkom.co.id/sites/about-us/en_US/page/profile-and-brief-history-24",
    "ISAT": "https://ioh.co.id/portal/ID/iohaboutus",
    "EXCL": "https://www.xlsmart.co.id/",
}


def event(symbol):
    return [{"symbol": symbol, "subject": f"{symbol} launches a new package",
             "title": f"{symbol} launches a new package", "type": "Product",
             "published_at": "2026-09-20", "text": f"{symbol} launches a new package for enterprise customers."}]


def add_sources(symbol, urls):
    """Add fallback pages strictly after the seeded one, so the recovery round —
    not the platform clock resolution — decides which pages are read second."""
    with session() as db, db.begin():
        company = db.scalar(select(Company).where(Company.symbol == symbol))
        for index, url in enumerate(urls, start=1):
            db.add(Source(company_id=company.id, url=url, domain=company.official_domains[0],
                          created_at=utcnow() + timedelta(seconds=index),
                          extraction={"selector": "main", "event_type": "Product"}))


def collector(readable):
    """Stand in for the network: only `readable` URLs yield announcements."""
    def collect(run_id, token, company, source):
        if source["url"] not in readable:
            raise ProviderError("SOURCE_PARSE_FAILED", "Approved content selector did not match", False)
        normalized = {"schema_version": 1, "events": readable[source["url"]]}
        snapshot = Snapshot(company_id=company["id"], source_id=source["id"], mode="replay", provider="public",
                            request_key=digest({"url": source["url"]}), content_hash=digest(normalized),
                            normalized=normalized, url=source["url"])
        with session() as db, db.begin():
            db.add(snapshot)
            db.flush()
            db.add(RunSnapshot(run_id=run_id, snapshot_id=snapshot.id, outcome="fetched"))
        return snapshot, "fetched"
    return collect


def steps(run_id, stage):
    with session() as db:
        return db.scalars(select(RunStep).where(RunStep.run_id == run_id, RunStep.stage == stage)).all()


def test_recovery_reads_remaining_pages_after_the_first_ones_fail(client, watchlist, monkeypatch):
    # EXCL's first two approved pages are unreadable; a third one carries the news.
    add_sources("EXCL", ["https://www.xlsmart.co.id/broken", "https://www.xlsmart.co.id/newsroom"])
    readable = {SEEDED["TLKM"]: event("TLKM"), SEEDED["ISAT"]: event("ISAT"),
                "https://www.xlsmart.co.id/newsroom": event("EXCL")}
    monkeypatch.setattr("app.agent.collect_public", collector(readable))

    run_id = launch(client, watchlist)
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()

    recover = steps(run_id, "recover")
    assert len(recover) == 1, "a gap should have triggered exactly one recovery round"
    assert recover[0].details["gaps_closed"] >= 1
    assert any(g["missing"] == "public_events" and g["recoverable"] for g in recover[0].details["gaps"])
    # The recovery round is recorded as its own coverage, so the extra reads are auditable.
    assert any(entry["stage"] == "recover" for entry in detail["result"]["coverage"])
    assert "EXCL" in {card["company"]["symbol"] for card in detail["result"]["signals"]}


def test_unclosable_gap_is_explained_rather_than_retried(client, watchlist, monkeypatch):
    # Every company has exactly one seeded page and it cannot be read.
    monkeypatch.setattr("app.agent.collect_public", collector({}))

    run_id = launch(client, watchlist)
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()

    recover = steps(run_id, "recover")
    assert len(recover) == 1
    assert recover[0].details["gaps_closed"] == 0
    gaps = [g for g in recover[0].details["gaps"] if g["missing"] == "public_events"]
    assert len(gaps) == 3 and not any(g["recoverable"] for g in gaps)
    # No recovery request was issued, so an unreachable source cannot burn the budget.
    assert recover[0].details["actions"] == []
    assert detail["status"] == "partial"


def test_quiet_pages_complete_instead_of_reporting_missing_evidence(client, watchlist, monkeypatch):
    """A page read successfully with no announcement is a verified quiet result."""
    def quiet(run_id, token, company, source):
        normalized = {"schema_version": 1, "events": [], "blocks_scanned": 7, "blocks_matched": 0}
        snapshot = Snapshot(company_id=company["id"], source_id=source["id"], mode="replay", provider="public",
                            request_key=digest({"url": source["url"]}), content_hash=digest(normalized),
                            normalized=normalized, url=source["url"])
        with session() as db, db.begin():
            db.add(snapshot)
            db.flush()
            db.add(RunSnapshot(run_id=run_id, snapshot_id=snapshot.id, outcome="fetched"))
        return snapshot, "fetched"

    monkeypatch.setattr("app.agent.collect_public", quiet)
    run_id = launch(client, watchlist)
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()

    assert detail["status"] == "completed" and detail["error_code"] is None
    assert detail["result"]["signals"] == []
    assert "verified quiet period" in detail["result"]["summary"]
