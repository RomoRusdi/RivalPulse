"""Offline comparison regressions: no external API or model calls."""
import copy
import json

from sqlalchemy import select

from app.comparison import build_comparison
from app.config import get_settings
from app.contracts import FinancialBrief
from app.db import session
from app.models import Company, Run
from app.research import execute_run


def company(symbol, industry="Banking"):
    return {"id": symbol, "symbol": symbol, "name": f"Synthetic {symbol}", "industry": industry}


def row(symbol, revenue="100", earnings="20", growth="+10.00%", basis="consolidated", currency="XTS", unit="units"):
    metrics = []
    for name, value in (("revenue", revenue), ("earnings", earnings), ("revenue_yoy_percent", growth)):
        if value is None:
            continue
        metrics.append(dict(metric=name, value=value, period="2025", currency=None if name.endswith("percent") else currency,
                            unit="percent" if name.endswith("percent") else unit, comparison_basis=basis,
                            source_url="https://replay.invalid/report", json_pointer=f"/{name}",
                            snapshot_id=f"snapshot-{symbol}", claim_id=f"{symbol}-{name}"))
    return dict(symbol=symbol, name=f"Synthetic {symbol}", comparison_note="", metrics=metrics)


def brief(*rows, period="2025"):
    return FinancialBrief(period=period, rows=list(rows), caveats=[])


def test_ranked_perspective_cited_and_no_input_mutation():
    data = brief(row("BBCA", earnings="0", growth="+5%"), row("BBRI", earnings="30", growth="+20%"))
    before = data.model_dump()
    result = build_comparison(data, [company("BBCA"), company("BBRI")], "BBCA")
    ours, other = result.entries
    assert ours.growth_rank == 2 and ours.growth_rank_size == 2
    assert ours.net_margin_percent == "0.00" and ours.profit == "break_even"
    assert other.margin_rank == 1
    assert "BBCA ranks 2nd of 2" in result.headline
    claims = {metric.claim_id for item in data.rows for metric in item.metrics}
    assert all(set(item.claim_ids) <= claims for item in result.entries)
    assert "BBCA-earnings" in ours.claim_ids
    assert data.model_dump() == before


def test_unknown_currency_still_ranks_growth_but_never_calculates_a_margin():
    data = brief(row("BBCA", currency=None, unit="provider_native_unspecified", basis="reporting_scope_unverified"),
                 row("BBRI", currency=None, unit="provider_native_unspecified", basis="reporting_scope_unverified", growth="+20%"))
    result = build_comparison(data, [company("BBCA"), company("BBRI")], "BBCA")
    ours, other = result.entries
    # Growth is a same-company ratio, so an unstated currency cancels and peers rank.
    assert (ours.growth_rank, other.growth_rank) == (2, 1)
    # Revenue and earnings with unknown units are never divided into a margin.
    assert all(e.net_margin_percent is None and e.margin_rank is None for e in result.entries)
    assert "BBCA ranks 2nd of 2 on revenue growth" in result.headline


def test_mixed_sectors_and_missing_company_remain_visible():
    result = build_comparison(brief(row("BBCA"), row("BBRI"), row("TLKM", growth="+99%")),
                              [company("BBCA"), company("BBRI"), company("TLKM", "Telecommunications"), company("BMRI")],
                              "BBCA", {"BMRI": {"findings": 0, "note": "Financial retrieval failed"}})
    items = {item.symbol: item for item in result.entries}
    assert items["TLKM"].growth_rank is None and not items["TLKM"].peer_group
    assert items["BBCA"].growth_rank_size == 2 and items["BBCA"].peer_group_size == 3
    assert items["BMRI"].profit is None and items["BMRI"].activity_note == "Financial retrieval failed"
    assert any("No revenue" in note for note in items["BMRI"].notes)


def test_compatible_basis_only_and_ties_share_a_rank():
    result = build_comparison(brief(row("BBCA"), row("BBRI"), row("BMRI", basis="standalone")),
                              [company("BBCA"), company("BBRI"), company("BMRI")], "BBCA")
    assert [e.growth_rank for e in result.entries] == [1, 1, None]
    assert result.entries[0].growth_rank_size == 2
    assert result.entries[-1].margin_rank is None


def test_no_shared_period_or_no_financials_is_an_explicit_comparison_gap():
    for data in (None, brief(row("BBCA"), row("BBRI"), period=None)):
        result = build_comparison(data, [company("BBCA"), company("BBRI")], "BBCA")
        assert result.period is None and len(result.entries) == 2
        assert all(e.growth_rank is None and e.margin_rank is None for e in result.entries)
        assert "no shared reporting year" in result.headline


def test_nonfinite_and_conflicting_metrics_do_not_crash_or_rank():
    bad = row("BBCA", revenue="NaN", earnings="Infinity", growth="NaN%")
    conflict = row("BBRI")
    duplicate = copy.deepcopy(conflict["metrics"][0])
    duplicate["value"] = "999"
    conflict["metrics"].append(duplicate)
    result = build_comparison(brief(bad, conflict), [company("BBCA"), company("BBRI")])
    assert all(e.growth_rank is None and e.margin_rank is None and e.net_margin_percent is None for e in result.entries)
    assert result.entries[0].profit is None


def test_zero_base_negative_revenue_and_unequal_metric_units_are_not_margin():
    first = row("BBCA", revenue="0")
    second = row("BBRI", revenue="-10")
    third = row("BMRI")
    third["metrics"][1]["unit"] = "millions"
    result = build_comparison(brief(first, second, third), [company("BBCA"), company("BBRI"), company("BMRI")])
    assert all(e.net_margin_percent is None for e in result.entries)


def test_neutral_missing_perspective_and_sector_normalization():
    data = brief(row("TLKM"), row("ISAT"))
    companies = [company("TLKM", "Telecommunications"), company("ISAT", "Telecommunication")]
    result = build_comparison(data, companies, "BBCA")
    assert result.perspective == "BBCA"
    assert all(e.growth_rank_size == 2 for e in result.entries)
    assert any("absent" in note for note in result.notes)


def test_all_competitors_prefix_does_not_narrow_scope(client, watchlist):
    assert client.patch("/api/v1/watchlists/" + watchlist["id"], json={"user_company": "TLKM"}).status_code == 200
    response = client.post("/api/v1/research-runs", json={"watchlist_id": watchlist["id"],
        "query": "Our company is TLKM. Compare all my competitors."})
    assert response.status_code == 202
    run_id = response.json()["id"]
    with session() as db:
        assert set(db.get(Run, run_id).inputs["compared_symbols"]) == {"TLKM", "ISAT", "EXCL"}
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()
    assert detail["status"] in ("completed", "partial"), detail["error_code"]
    result = detail["result"]["comparison"]
    assert result["perspective"] == "TLKM" and len(result["entries"]) == 3
    projected = json.loads(client.get("/runs/" + run_id + "/stream").text.split("data: ")[-1].strip())
    assert projected["comparison"] == result
    assert "json_pointer" not in json.dumps(result) and "source_url" not in json.dumps(result)


def test_perspective_outside_watchlist_gets_frozen_evidence(client, watchlist):
    assert client.patch("/api/v1/watchlists/" + watchlist["id"], json={"user_company": "BBCA"}).status_code == 200
    response = client.post("/api/v1/research-runs", json={"watchlist_id": watchlist["id"],
        "query": "Compare annual revenue and earnings across all my competitors"})
    assert response.status_code == 202
    run_id = response.json()["id"]
    with session() as db:
        assert {c["symbol"] for c in db.get(Run, run_id).inputs["companies"]} == {"TLKM", "ISAT", "EXCL", "BBCA"}
    assert len(client.get("/api/v1/watchlists/" + watchlist["id"]).json()["companies"]) == 3
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()
    assert detail["status"] in ("completed", "partial"), detail["error_code"]
    result = detail["result"]["comparison"]
    assert result["perspective"] == "BBCA" and len(result["entries"]) == 4
    ours = next(e for e in result["entries"] if e["symbol"] == "BBCA")
    assert ours["peer_group_size"] == 1 and ours["growth_rank"] is None
    assert all("not investigated" in e["activity_note"] for e in result["entries"])
    with session() as db:
        assert any(c["symbol"] == "BBCA" for c in db.get(Run, run_id).inputs["companies"])
        assert db.scalar(select(Company).where(Company.symbol == "BBCA")) is not None


def test_five_competitors_plus_our_company_stays_within_tool_limits(client, watchlist):
    with session() as db:
        ids = [c.id for c in db.scalars(select(Company).where(Company.symbol.in_(
            ["TLKM", "ISAT", "EXCL", "BBRI", "BMRI"]))).all()]
    assert client.patch("/api/v1/watchlists/" + watchlist["id"], json={
        "company_ids": ids, "user_company": "BBCA"}).status_code == 200
    response = client.post("/api/v1/research-runs", json={"watchlist_id": watchlist["id"],
        "query": "Our company is BBCA. Compare annual revenue across all my competitors"})
    assert response.status_code == 202
    execute_run(response.json()["id"])
    detail = client.get("/api/v1/research-runs/" + response.json()["id"]).json()
    assert detail["status"] in ("completed", "partial"), detail["error_code"]
    assert len(detail["result"]["comparison"]["entries"]) == 6
    with session() as db:
        run = db.get(Run, response.json()["id"])
        assert len(run.inputs["compared_symbols"]) == 6
        assert len(run.plan["tools"]) == 6
        assert len(run.plan["tools"]) <= get_settings().max_tool_calls


def test_named_pair_comparison_does_not_leak_other_companies(client, watchlist):
    response = client.post("/api/v1/research-runs", json={"watchlist_id": watchlist["id"],
        "query": "Compare annual revenue for TLKM and ISAT"})
    execute_run(response.json()["id"])
    detail = client.get("/api/v1/research-runs/" + response.json()["id"]).json()
    assert {e["symbol"] for e in detail["result"]["comparison"]["entries"]} == {"TLKM", "ISAT"}
