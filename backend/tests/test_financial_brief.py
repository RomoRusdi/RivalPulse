from sqlalchemy import select

from app.agent import Agent, is_financial_question
from app.config import get_settings
from app.db import session
from app.models import Run, RunSnapshot, Snapshot
from app.research import claim_run, execute_run


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
    assert all({m["metric"] for m in row["metrics"]} == {"revenue", "earnings"} for row in brief["rows"])
    assert brief["interpretation"]["supporting_claim_ids"][0].startswith("financial-")
    with session() as db:
        for row in brief["rows"]:
            for metric in row["metrics"]:
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


def test_recent_question_still_requires_public_evidence():
    assert is_financial_question("What is annual revenue for TLKM?")
    assert not is_financial_question("What changed this week in revenue and product pricing?")
    assert not is_financial_question("How did the recent campaign affect earnings?")
