from sqlalchemy import select

from app.agent import Agent, is_financial_question
from app.config import get_settings
from app.db import session
from app.models import Run, RunSnapshot, Snapshot
from app.research import claim_run, comparison_note, execute_run


class FinancialAdapter:
    def __init__(self):
        self.calls = []

    def structured(self, kind, schema, data, repair=False):
        self.calls.append(kind)
        if kind == "plan":
            return {"tools": [{"name": "get_company_metrics", "company_ids": [c["id"]],
                               "reason": "Annual financial statements"} for c in data["companies"]]}
        assert kind == "financial_analysis"
        assert all("value" not in claim and "direction" in claim for claim in data["claims"])
        return {"text": "These statements provide financial context, but do not establish a near-term competitive move.",
                "supporting_claim_ids": [data["claims"][0]["claim_id"]], "uncertainty": "high"}


def test_financial_question_uses_real_snapshots_without_public_events(client, watchlist, monkeypatch):
    monkeypatch.setenv("LLM_PLAN_ENABLED", "true")
    get_settings.cache_clear()
    monkeypatch.setattr("app.agent.collect_public", lambda *_: (_ for _ in ()).throw(AssertionError("No page fetch")))
    query = "Compare annual revenue and earnings of TLKM, ISAT and EXCL."
    response = client.post("/api/v1/research-runs", json={"watchlist_id": watchlist["id"], "query": query})
    run_id = response.json()["id"]
    adapter = FinancialAdapter()
    execute_run(run_id, adapter=adapter)
    result = client.get("/api/v1/research-runs/" + run_id).json()
    assert result["status"] == "completed"
    assert adapter.calls == ["plan", "financial_analysis"]
    assert len(result["plan"]["tools"]) == 3
    assert result["result"]["signals"] == []
    brief = result["result"]["financial_brief"]
    assert brief["period"] == "2025" and len(brief["rows"]) == 3
    for row in brief["rows"]:
        expected = {"revenue", "earnings"}
        if row["symbol"] != "EXCL":
            expected |= {"revenue_yoy_percent", "earnings_yoy_percent"}
        assert {m["metric"] for m in row["metrics"]} == expected
        assert [metric["period"] for metric in row["revenue_history"]] == ["2024", "2025"]
        assert all(metric["metric"] == "revenue" for metric in row["revenue_history"])
    assert all(m["unit"] == "percent" or not m["metric"].endswith("_yoy_percent")
               or m["value"].endswith("%") for row in brief["rows"] for m in row["metrics"])
    assert brief["interpretation"]["supporting_claim_ids"][0].startswith("financial-")
    with session() as db:
        for row in brief["rows"]:
            for metric in row["metrics"] + row["revenue_history"]:
                source = db.get(Snapshot, metric["snapshot_id"])
                assert source.mode == "replay" and source.url == metric["source_url"]
                assert metric["json_pointer"] in {m["pointer"] for m in source.normalized["metrics"]}
        assert db.scalar(select(Run).where(Run.id == run_id)).llm_calls == 2
        assert len(db.scalars(select(RunSnapshot).where(RunSnapshot.run_id == run_id)).all()) == 3
    legacy = client.get("/runs/" + run_id + "/stream").text
    assert '"financialBrief"' in legacy and '"coverageStatus": "completed"' in legacy


def test_grouped_llm_plan_is_split_into_bounded_company_calls(client, watchlist, monkeypatch):
    monkeypatch.setenv("LLM_PLAN_ENABLED", "true")
    get_settings.cache_clear()
    run_id = client.post("/api/v1/research-runs", json={
        "watchlist_id": watchlist["id"], "query": "What changed across my competitors this week?",
    }).json()["id"]
    token = claim_run(run_id)
    with session() as db:
        inputs = db.get(Run, run_id).inputs

    class GroupedPlan:
        def structured(self, kind, schema, data, repair=False):
            assert kind == "plan"
            ids = [company["id"] for company in data["companies"]]
            return {"tools": [
                {"name": "get_company_metrics", "company_ids": ids, "reason": "Financial evidence"},
                {"name": "get_recent_signals", "company_ids": ids, "reason": "Approved sources"},
            ]}

    agent = Agent(run_id, token, GroupedPlan())
    plan = agent.plan(inputs)
    assert agent.plan_source == "qwen"
    assert len(plan.tools) == 6
    assert all(len(tool.company_ids) == 1 for tool in plan.tools)


def test_unvalidated_financial_narrative_does_not_erase_cited_figures(client, watchlist, monkeypatch):
    from app.errors import ProviderError

    monkeypatch.setenv("LLM_PLAN_ENABLED", "true")
    get_settings.cache_clear()

    class InvalidNarrative(FinancialAdapter):
        def structured(self, kind, schema, data, repair=False):
            if kind == "financial_analysis":
                raise ProviderError("LLM_INVALID_OUTPUT", "Invalid optional narrative", False)
            return super().structured(kind, schema, data, repair)

    run_id = client.post("/api/v1/research-runs", json={
        "watchlist_id": watchlist["id"], "query": "Compare annual revenue and earnings for all competitors.",
    }).json()["id"]
    execute_run(run_id, adapter=InvalidNarrative())
    result = client.get("/api/v1/research-runs/" + run_id).json()
    assert result["status"] == "completed"
    assert result["result"]["financial_brief"]["interpretation"] is None
    assert any("could not be validated" in caveat for caveat in result["result"]["financial_brief"]["caveats"])


def test_common_period_ignores_companies_without_statements(client, watchlist, monkeypatch):
    """EXCL has no statements but TLKM/ISAT share 2025: the brief period and
    the ranking line must reflect the pair that can actually be compared."""
    import httpx

    from app.errors import ProviderError
    from tests.test_providers import LockRedis

    monkeypatch.setenv("MODE", "live")
    monkeypatch.setenv("SECTORS_API_KEY", "test-only-fake-key")
    get_settings.cache_clear()

    def handler(request):
        if "/news/" in request.url.path:
            return httpx.Response(200, json={"results": [], "pagination": {"has_next": False}})
        symbol = request.url.path.split("/")[-2]
        financials = {} if symbol == "EXCL" else {
            "currency": "IDR", "unit": "billion", "comparison_basis": "audited",
            "historical_financials": [
                {"year": 2024, "revenue": 120.0, "earnings": 10.0},
                {"year": 2025, "revenue": 150.0 if symbol == "TLKM" else 100.0, "earnings": 12.0},
            ],
        }
        return httpx.Response(200, json={"symbol": symbol + ".JK", "company_name": symbol,
                                         "overview": {}, "financials": financials, "peers": []})

    real = httpx.Client
    monkeypatch.setattr("app.providers.httpx.Client",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr("app.providers.redis_connection", LockRedis)
    monkeypatch.setattr("app.agent.collect_public", lambda *a: (_ for _ in ()).throw(
        ProviderError("SOURCE_UNAVAILABLE", "unreachable")))

    run_id = client.post("/api/v1/research-runs", json={
        "watchlist_id": watchlist["id"], "query": "compare TLKM and ISAT this week",
    }).json()["id"]
    execute_run(run_id)
    detail = client.get("/api/v1/research-runs/" + run_id).json()

    assert detail["status"] == "partial", detail["error_code"]
    brief = detail["result"]["financial_brief"]
    assert brief["period"] == "2025"
    by_symbol = {r["symbol"]: r for r in brief["rows"]}
    assert set(by_symbol) == {"TLKM", "ISAT"}, "table covers the requested pair only"
    assert {m["metric"] for m in by_symbol["TLKM"]["metrics"]} == {
        "revenue", "earnings", "revenue_yoy_percent", "earnings_yoy_percent"}
    assert brief["interpretation"] is None
    assert "highest at TLKM and lowest at ISAT" in detail["result"]["summary"]
    assert any(m["value"].startswith("+") and m["value"].endswith("%")
               for m in by_symbol["TLKM"]["metrics"] if m["metric"].endswith("_yoy_percent"))


def test_recent_question_still_requires_public_evidence():
    assert is_financial_question("What is annual revenue for TLKM?")
    assert not is_financial_question("What changed this week in revenue and product pricing?")
    assert not is_financial_question("How did the recent campaign affect earnings?")


def make_brief(period, entries):
    from app.contracts import FinancialBrief
    return FinancialBrief(period=period, caveats=[], rows=[{
        "symbol": symbol, "name": symbol, "comparison_note": "",
        "metrics": [{
            "metric": "revenue", "value": value, "currency": currency,
            "unit": "billion", "period": period, "comparison_basis": "audited",
            "source_url": "https://sectors.test/r", "json_pointer": "/r",
            "snapshot_id": "s", "claim_id": "c",
        }],
    } for symbol, value, currency in entries])


def test_comparison_note_ranks_only_comparable_revenue():
    brief = make_brief("2025", [("BBCA", "100", "IDR"), ("BMRI", "200", "IDR")])
    note = comparison_note(brief)
    assert note is not None and "BMRI" in note and "BBCA" in note and "2025" in note


def test_comparison_note_withholds_ranking_without_common_basis():
    tie = make_brief("2025", [("BBCA", "100", "IDR"), ("BMRI", "100", "IDR")])
    assert comparison_note(tie) is None
    mixed_currency = make_brief("2025", [("BBCA", "100", "IDR"), ("BMRI", "200", "USD")])
    assert comparison_note(mixed_currency) is None
    unknown_currency = make_brief("2025", [("BBCA", "100", "IDR"), ("BMRI", "200", None)])
    assert comparison_note(unknown_currency) is None
    from app.contracts import FinancialBrief
    assert comparison_note(FinancialBrief(period=None, rows=[], caveats=[])) is None
