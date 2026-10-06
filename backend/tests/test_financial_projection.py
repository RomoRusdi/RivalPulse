from copy import deepcopy
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.db import session, utcnow
from app.financial_projection import performance_metrics
from app.models import Company, Run, RunSnapshot, RunStep, Snapshot
from app.providers import normalize_report
from app.research import recovery_plan, yoy_percent
from tests.conftest import execute


def legacy_snapshot(db, run_id, ticker="TLKM", financials=None):
    company = db.scalar(select(Company).where(Company.symbol == ticker))
    payload = {"symbol": ticker + ".JK", "overview": {"website": "www.example.com"}, "financials": financials or {
        "historical_financials": [{"year": 2024, "revenue": "100", "earnings": "-5"},
                                 {"year": 2025, "revenue": "120", "earnings": "0"}],
        "yoy_quarter_revenue_growth": "0.123456", "yoy_quarter_earnings_growth": "-0.25",
        "historical_financial_ratio": [{"year": "2025", "profitability": {"net_profit_margin": "0"}}],
    }}
    normalized = normalize_report(payload, ticker)
    normalized.pop("performance_metrics")
    normalized["schema_version"] = 1
    snapshot = Snapshot(company_id=company.id, provider="sectors", mode="replay", request_key="legacy-test",
                        content_hash="legacy-test", raw_payload=payload, normalized=normalized,
                        url="https://api.sectors.app/v2/company/report/" + ticker + "/", fetched_at=utcnow())
    db.add(snapshot)
    db.flush()
    db.add(RunSnapshot(run_id=run_id, snapshot_id=snapshot.id, outcome="fetched"))
    return snapshot.id, deepcopy(normalized)


def test_saved_legacy_payload_supplies_rates_without_metadata_or_provider_calls(client, watchlist, monkeypatch):
    run = execute(client, watchlist)
    with session() as db, db.begin():
        snapshot_id, original = legacy_snapshot(db, run["id"])
    monkeypatch.setattr("app.providers.Sectors.report", lambda *_: pytest.fail("Browsing must not call Sectors"))
    feed = client.get(f"/api/v1/watchlists/{watchlist['id']}/financials").json()
    company = next(c for c in feed["companies"] if c["ticker"] == "TLKM")
    rates = {m["metric"]: m for m in company["performanceMetrics"]}
    revenue = rates["yoy_quarter_revenue_growth"]
    assert revenue["value"] == "12.35" and revenue["rawValue"] == "0.123456"
    assert revenue["period"] is None and revenue["periodKind"] == "quarter"
    assert revenue["reasons"] == ["period_unknown"] and revenue["comparisonStatus"] == "context_only"
    assert rates["yoy_quarter_earnings_growth"]["value"] == "-25.00"
    assert rates["net_profit_margin"]["value"] == "0.00" and rates["net_profit_margin"]["period"] == "2025"
    assert company["coverage"] == "as_reported"
    assert all(p["yoy"] is None and p["index"] is None for p in company["points"])
    assert next(f for f in company["annualFigures"] if f["metric"] == "earnings" and f["period"] == "2025")["value"] == "0"
    source = client.get(f"/api/v1/financial-sources/{snapshot_id}")
    assert source.status_code == 200 and source.json()["performanceMetrics"] == company["performanceMetrics"]
    with session() as db:
        saved = db.get(Snapshot, snapshot_id)
        assert saved.normalized == original and saved.parser_version == "1"
        for metric in company["performanceMetrics"]:
            value = saved.raw_payload
            for token in metric["jsonPointer"].split("/")[1:]:
                value = value[int(token)] if isinstance(value, list) else value[token]
            assert Decimal(str(value)) == Decimal(metric["rawValue"])


@pytest.mark.parametrize("raw", [None, True, False, "NaN", "Infinity", "not-a-number", "1e10000"])
def test_malformed_optional_rate_does_not_erase_annual_facts(raw):
    normalized = normalize_report({"symbol": "TLKM", "financials": {
        "historical_financials": [{"year": 2025, "revenue": "123456789012345.67"}],
        "yoy_quarter_revenue_growth": raw}}, "TLKM")
    assert normalized["metrics"][0]["value"] == "123456789012345.67"
    assert normalized["performance_metrics"] == []


def test_fraction_conversion_keeps_zero_negative_large_rates_and_conflicts():
    rates = performance_metrics({"financials": {"yoy_quarter_revenue_growth": "12.5",
        "yoy_quarter_earnings_growth": 0, "historical_financial_ratio": [
            {"year": 2025, "profitability": {"net_profit_margin": "-0.012345"}},
            {"year": 2025, "profitability": {"net_profit_margin": "-0.022345"}},
            {"year": True, "profitability": {"net_profit_margin": 1}},
        ]}})
    assert rates[0]["value"] == "1250.00" and rates[1]["value"] == "0.00"
    assert rates[2]["value"] is None and rates[2]["reasons"] == ["conflicting_values"]


def test_percentage_only_report_has_source_view_without_annual_figures(client, watchlist):
    run = execute(client, watchlist)
    with session() as db, db.begin():
        snapshot_id, _ = legacy_snapshot(db, run["id"], financials={"yoy_quarter_revenue_growth": "0.05"})
    source = client.get(f"/api/v1/financial-sources/{snapshot_id}").json()
    assert source["figures"] == [] and source["points"] == []
    assert source["performanceMetrics"][0]["value"] == "5.00"


def test_failed_refresh_retains_annual_evidence_and_reports_error(client, watchlist):
    run = execute(client, watchlist)
    with session() as db, db.begin():
        snapshot_id, _ = legacy_snapshot(db, run["id"])
        company = db.scalar(select(Company).where(Company.symbol == "TLKM"))
        db.add(RunStep(run_id=run["id"], attempt=1, sequence=999, stage="collect", status="completed", message="test",
                       details={"coverage": [{"tool": "get_company_metrics", "company_ids": [company.id],
                                              "status": "failed", "code": "PROVIDER_QUOTA_EXHAUSTED"}]}))
    feed = client.get(f"/api/v1/watchlists/{watchlist['id']}/financials").json()
    company = next(c for c in feed["companies"] if c["ticker"] == "TLKM")
    assert company["snapshotId"] == snapshot_id and company["annualFigures"]
    assert company["collectionStatus"] == {"status": "failed", "code": "PROVIDER_QUOTA_EXHAUSTED"}


def test_foreign_workspace_and_archived_mode_do_not_leak_performance(client, watchlist, monkeypatch):
    with session() as db, db.begin():
        foreign = Run(workspace_id="different-workspace", watchlist_id=watchlist["id"], mode="replay",
                      status="completed", inputs={}, query="foreign", request_hash="foreign")
        db.add(foreign)
        db.flush()
        snapshot_id, _ = legacy_snapshot(db, foreign.id)
    assert client.get(f"/api/v1/financial-sources/{snapshot_id}").status_code == 404
    assert all(not c["performanceMetrics"] for c in client.get(f"/api/v1/watchlists/{watchlist['id']}/financials").json()["companies"])


def test_mixed_industries_withhold_shared_charts(client, watchlist):
    execute(client, watchlist)
    with session() as db, db.begin():
        db.scalar(select(Company).where(Company.symbol == "ISAT")).industry = "Banking"
    feed = client.get(f"/api/v1/watchlists/{watchlist['id']}/financials").json()
    assert feed["baseYear"] is None and not feed["absoluteAvailable"]
    assert feed["comparisonEligibility"]["reasons"] == ["mixed_business_definitions"]
    assert any(c["annualFigures"] for c in feed["companies"])


def test_unknown_metadata_is_not_computed_growth_and_access_failure_is_not_retried():
    a = dict(metric="revenue", value="120", currency=None, unit="provider_native_unspecified",
             comparison_basis="reporting_scope_unverified", period="2025")
    assert yoy_percent(a, {**a, "period": "2024", "value": "100"}) is None
    inputs = {"companies": [{"id": "c", "symbol": "TLKM"}]}
    gaps = [{"recoverable": True, "company_id": "c", "missing": "financial"}]
    assert recovery_plan(gaps, inputs, [{"tool": "get_company_metrics", "company_ids": ["c"],
                                        "code": "PROVIDER_ACCESS_DENIED"}]) == []
