"""The deterministic plan must fit the run tool budget for every watchlist size.

A 5-company live watchlist needs 15 tools for full coverage against a default
budget of 12. That used to raise out of plan() and fail the whole run with
INTERNAL_ERROR at the plan stage. The page sweep is now dropped uniformly in
that case (Sectors news stays the primary event source) and recovered later
within budget.
"""
from app.agent import Agent
from app.config import get_settings


def five_ids(client):
    catalogue = {c["symbol"]: c["id"] for c in
                 client.get("/api/v1/companies?limit=100").json()["items"]}
    return [catalogue[s] for s in ("TLKM", "ISAT", "EXCL", "BBRI", "BMRI")]


def test_five_company_live_plan_drops_page_sweep_uniformly(client, monkeypatch):
    monkeypatch.setenv("MODE", "live")
    get_settings.cache_clear()
    agent = Agent("run-scratch", "token-scratch", adapter=None)
    plan = agent.plan({"companies": [{"id": i} for i in five_ids(client)],
                       "query": "bandingkan semuanya minggu ini"})
    assert len(plan.tools) <= get_settings().max_tool_calls
    assert {t.name for t in plan.tools} == {"get_company_metrics", "get_company_news"}
    assert agent.plan_source == "deterministic"


def test_three_company_live_plan_keeps_full_sweep(client, monkeypatch):
    monkeypatch.setenv("MODE", "live")
    get_settings.cache_clear()
    agent = Agent("run-scratch", "token-scratch", adapter=None)
    plan = agent.plan({"companies": [{"id": i} for i in five_ids(client)[:3]],
                       "query": "bandingkan semuanya minggu ini"})
    assert len(plan.tools) == 9
    assert {t.name for t in plan.tools} == {
        "get_company_metrics", "get_recent_signals", "get_company_news"}


def test_five_company_replay_plan_keeps_full_sweep(client, monkeypatch):
    monkeypatch.setenv("MODE", "replay")
    get_settings.cache_clear()
    agent = Agent("run-scratch", "token-scratch", adapter=None)
    plan = agent.plan({"companies": [{"id": i} for i in five_ids(client)],
                       "query": "bandingkan semuanya minggu ini"})
    assert len(plan.tools) == 10
    assert {t.name for t in plan.tools} == {"get_company_metrics", "get_recent_signals"}


def test_llm_plan_without_page_sweep_validates(client, watchlist, monkeypatch):
    """A model plan that fits the budget without page sweeps is accepted and
    validated; missing pages become recoverable gaps, not a crashed run."""
    from app.db import session
    from app.models import Run
    from app.research import claim_run

    monkeypatch.setenv("MODE", "live")
    monkeypatch.setenv("LLM_PLAN_ENABLED", "true")
    get_settings.cache_clear()
    run_id = client.post("/api/v1/research-runs", json={
        "watchlist_id": watchlist["id"], "query": "bandingkan semuanya minggu ini",
    }).json()["id"]
    token = claim_run(run_id)
    with session() as db:
        inputs = db.get(Run, run_id).inputs

    class SlimPlan:
        def structured(self, kind, schema, data, repair=False):
            assert kind == "plan"
            return {"tools": [
                {"name": "get_company_metrics", "company_ids": [c["id"]],
                 "reason": "Statements"} for c in data["companies"]] + [
                {"name": "get_company_news", "company_ids": [c["id"]],
                 "reason": "Events"} for c in data["companies"]]}

    agent = Agent(run_id, token, SlimPlan())
    plan = agent.plan(inputs)
    assert agent.plan_source == "qwen"
    assert len(plan.tools) == 2 * len(inputs["companies"])
