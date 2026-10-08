"""Synthetic offline regressions for reported annual ratios and old-run delivery."""
import copy
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.brief_projection import project_run_result, with_reported_margins
from app.comparison import build_comparison
from app.db import session
from app.models import Conversation, Run, RunSnapshot, Snapshot
from app.providers import normalize_report, replay_report
from app.research import execute_run
from tests.test_comparison import brief, company, row


def snapshot(symbol, margin="0.125", year=2025, provider="sectors", extra_rows=None):
    payload = {"symbol": symbol, "company_name": f"Synthetic {symbol}", "financials": {
        "historical_financials": [{"year": 2025, "revenue": "100", "earnings": "20"}],
        "historical_financial_ratio": [{"year": year, "profitability": {"net_profit_margin": margin}}, *(extra_rows or [])],
        "yoy_quarter_revenue_growth": "0.5", "yoy_ttm_revenue_growth": "0.6"}}
    return SimpleNamespace(id=f"snapshot-{symbol}", provider=provider, raw_payload=payload,
        normalized=normalize_report(payload, symbol), url="https://replay.invalid/report",
        fetched_at=datetime(2026, 1, 1, tzinfo=timezone.utc))


def unverified_row(symbol):
    return row(symbol, growth=None, currency=None, unit="provider_native_unspecified", basis="reporting_scope_unverified")


def test_reported_margin_is_cited_without_inventing_monetary_metadata_or_rank():
    sources = {s.id: s for s in [snapshot("BBCA"), snapshot("BBRI")]}
    data = brief(unverified_row("BBCA"), unverified_row("BBRI"))
    before = data.model_dump()
    projected, claims = with_reported_margins(data, sources)
    result = build_comparison(projected, [company("BBCA"), company("BBRI")], "BBCA")
    assert len(claims) == 2
    assert all(e.net_margin_percent == "12.50" and e.net_margin_origin == "provider_reported" for e in result.entries)
    # Reported margins of same-sector peers are ranked (ties share a rank); no
    # growth is invented when the source has no adjacent-year revenue.
    assert all(e.revenue_growth_percent is None and e.growth_rank is None for e in result.entries)
    assert all(e.margin_rank == 1 and e.margin_rank_size == 2 for e in result.entries)
    assert all("reported by Sectors" in e.margin_note for e in result.entries)
    margin = next(m for m in projected.rows[0].metrics if m.metric == "net_profit_margin")
    assert margin.claim_id in result.entries[0].claim_ids
    assert margin.json_pointer == "/financials/historical_financial_ratio/0/profitability/net_profit_margin"
    assert margin.snapshot_id == "snapshot-BBCA" and margin.unit == "percent" and margin.currency is None
    assert data.model_dump() == before
    assert with_reported_margins(projected, sources)[0].model_dump() == projected.model_dump()


@pytest.mark.parametrize("raw,expected", [("0", "0.00"), ("-0.045", "-4.50"), ("0.1125", "11.25")])
def test_reported_zero_negative_and_positive_margins_are_percentages(raw, expected):
    source = snapshot("BBCA", raw)
    projected, _ = with_reported_margins(brief(unverified_row("BBCA"), unverified_row("BBRI")), {source.id: source})
    entry = build_comparison(projected, [company("BBCA"), company("BBRI")]).entries[0]
    assert entry.net_margin_percent == expected
    assert entry.margin_rank is None


def test_reported_margin_is_not_replaced_by_a_different_calculated_margin():
    source = snapshot("BBCA", "0.11")
    projected, _ = with_reported_margins(brief(row("BBCA"), row("BBRI")), {source.id: source})
    entry = build_comparison(projected, [company("BBCA"), company("BBRI")]).entries[0]
    assert entry.net_margin_percent == "11.00"  # not earnings/revenue = 20%
    assert entry.net_margin_origin == "provider_reported" and entry.margin_rank is not None


@pytest.mark.parametrize("raw,year,provider", [("NaN", 2025, "sectors"), (True, 2025, "sectors"),
    ("Infinity", 2025, "sectors"), ("0.2", 2024, "sectors"), ("0.2", 2025, "sectors_news")])
def test_invalid_other_year_or_other_provider_ratios_are_not_used(raw, year, provider):
    source = snapshot("BBCA", raw, year, provider)
    projected, claims = with_reported_margins(brief(unverified_row("BBCA"), unverified_row("BBRI")), {source.id: source})
    assert claims == []
    entry = build_comparison(projected, [company("BBCA"), company("BBRI")]).entries[0]
    assert entry.net_margin_percent is None and entry.revenue_growth_percent is None
    # Neither the quarter nor TTM growth may be labelled as annual growth.
    assert not any("growth" in m.metric for m in projected.rows[0].metrics)


def test_conflicting_reported_margins_are_not_hidden_by_a_calculated_fallback():
    source = snapshot("BBCA", "0.1", extra_rows=[{"year": 2025, "profitability": {"net_profit_margin": "0.2"}}])
    projected, claims = with_reported_margins(brief(row("BBCA"), row("BBRI")), {source.id: source})
    entry = build_comparison(projected, [company("BBCA"), company("BBRI")]).entries[0]
    assert entry.net_margin_percent is None and entry.margin_rank is None and claims == []
    assert "conflicting" in entry.margin_note


def test_corrected_old_run_delivery_never_changes_evidence_results_or_budgets(client, watchlist, monkeypatch):
    def reported_payload(symbol, scenario, params):
        raw = copy.deepcopy(replay_report(symbol, scenario, params))
        raw["financials"]["historical_financial_ratio"] = [
            {"year": 2025, "profitability": {"net_profit_margin": "0.1125"}}]
        return raw

    monkeypatch.setattr("app.providers.replay_report", reported_payload)
    # Simulate the old writer that saved the provider's ratio but did not wire
    # it into the result. No immutable evidence/history is ever overwritten.
    monkeypatch.setattr("app.research.with_reported_margins", lambda data, _: (data, []))
    accepted = client.post("/api/v1/research-runs", json={"watchlist_id": watchlist["id"],
        "query": "Compare annual revenue and earnings for all my competitors"}).json()
    execute_run(accepted["id"])
    with session() as db:
        run = db.get(Run, accepted["id"])
        before = copy.deepcopy(run.result)
        accounting = (run.credits, run.external_calls, run.llm_calls)
        workspace_id = run.workspace_id
        raw_before = {s.id: copy.deepcopy(s.raw_payload) for s in db.scalars(select(Snapshot).join(RunSnapshot).where(
            RunSnapshot.run_id == run.id)).all()}
        projected = project_run_result(db, run)
        assert run.result == before
        assert all(e["net_margin_percent"] == "11.25" for e in projected["comparison"]["entries"])
    conversation_id = str(uuid4())
    stamp = datetime.now(timezone.utc)
    stored_messages = [{"id": str(uuid4()), "role": "assistant", "kind": "research", "content": "Saved research",
                        "createdAt": stamp.isoformat(), "run": {"id": accepted["id"], "comparison": before["comparison"]}}]
    with session() as db, db.begin():
        db.add(Conversation(id=conversation_id, workspace_id=workspace_id, title="Historical comparison",
                            messages=stored_messages, created_at=stamp, updated_at=stamp))
    public = client.get(accepted["status_url"]).json()["result"]
    legacy = json.loads(client.get("/runs/" + accepted["id"] + "/stream").text.split("data: ")[-1].strip())
    assert public["comparison"] == legacy["comparison"]
    assert legacy["financialBrief"] == public["financial_brief"]
    transcript = client.get("/api/v1/conversations").json()[0]
    assert transcript["messages"][0]["run"]["comparison"] == public["comparison"]
    assert all(e["net_margin_origin"] == "provider_reported" for e in public["comparison"]["entries"])
    assert "json_pointer" not in json.dumps(public) and "rawValue" not in json.dumps(public)
    for item in public["financial_brief"]["rows"]:
        margin = next(m for m in item["metrics"] if m["metric"] == "net_profit_margin")
        report = client.get("/api/v1/financial-sources/" + margin["snapshot_id"])
        assert report.status_code == 200
    with session() as db:
        run = db.get(Run, accepted["id"])
        assert run.result == before and (run.credits, run.external_calls, run.llm_calls) == accounting
        assert db.get(Conversation, conversation_id).messages == stored_messages
        assert {s.id: s.raw_payload for s in db.scalars(select(Snapshot).join(RunSnapshot).where(
            RunSnapshot.run_id == run.id)).all()} == raw_before
