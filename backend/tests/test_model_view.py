"""The analysis model gets a compact view: small enough to be fast, and free of
figures it is not allowed to repeat."""
import json

from app.agent import ANALYSIS_RULES, Agent, LLMAdapter, model_view
from app.decision_support import metric_claim_text, prepared_candidate

METRICS = [{"metric": metric, "value": value, "unit": "provider_native_unspecified", "currency": None,
            "period": period, "comparison_basis": "reporting_scope_unverified"}
           for period in ("2023", "2024", "2025")
           for metric, value in (("revenue", "42445960000000"), ("earnings", "-4426618000000"),
                                 ("total_assets", "90000000000000"))]


def candidate():
    return {"event_key": "event-1",
            "company": {"symbol": "EXCL", "name": "XLSMART", "industry": "Telecommunication"},
            "event_type": "Financial update",
            "claims": [{"claim_id": "observation-0",
                        "text": "EXCL raised its 2026 capex guidance to Rp20 trillion for the 700 MHz rollout."},
                       *[{"claim_id": f"financial-{i}", "text": metric_claim_text(m)} for i, m in enumerate(METRICS)]],
            "financial_context": METRICS}


def test_view_drops_raw_figures_and_most_metrics():
    view = model_view(candidate())
    text = json.dumps(view)
    assert not any(ch.isdigit() for ch in json.dumps([c["text"] for c in view["claims"]]))
    assert "[figure]" in view["claims"][0]["text"] and "MHz" in view["claims"][0]["text"]
    assert "financial_context" not in view and view["has_annual_financial_context"] is True
    assert len(text) < len(json.dumps(candidate())) / 3


def test_view_keeps_original_claim_ids_so_citations_resolve():
    full_ids = {c["claim_id"] for c in candidate()["claims"]}
    view_ids = [c["claim_id"] for c in model_view(candidate())["claims"]]
    assert set(view_ids) <= full_ids
    # Only the latest period's revenue and earnings survive, under their own IDs.
    latest = [f"financial-{i}" for i, m in enumerate(METRICS)
              if m["period"] == "2025" and m["metric"] in ("revenue", "earnings")]
    assert view_ids == ["observation-0", *latest]


def test_earnings_sign_is_described_without_numbers():
    texts = {c["claim_id"]: c["text"] for c in model_view(candidate())["claims"]}
    earnings_id = next(f"financial-{i}" for i, m in enumerate(METRICS) if m["period"] == "2025" and m["metric"] == "earnings")
    assert texts[earnings_id] == "Latest reported annual earnings were a loss."


def test_prepared_candidate_text_is_unchanged_for_text_rebinding():
    """Unchanged findings rebind claims by exact text; only the model view may differ."""
    full = {"event_key": "e", "company": {"symbol": "EXCL", "name": "X", "industry": "T"},
            "observations": [({"type": "Product"}, None, None)],
            "claims": [{"claim_id": "observation-0", "text": "EXCL 2026 text"}], "metrics": METRICS}
    claims = prepared_candidate(full)["claims"]
    assert claims[0]["text"] == "EXCL 2026 text"
    assert claims[1]["text"] == metric_claim_text(METRICS[0])


def test_model_receives_view_and_rules_but_validation_uses_full_candidate(client, watchlist):
    from app.research import claim_run
    from tests.conftest import launch

    seen = {}

    class Recorder(LLMAdapter):
        def structured(self, kind, schema, data, repair=False):
            seen["data"] = data
            return {"interpretations": []}

    run_id = launch(client, watchlist)
    token = claim_run(run_id)
    try:
        Agent(run_id, token, Recorder()).analyze([prepared_candidate({
            **candidate(), "observations": [({"type": "Product"}, None, None)], "metrics": METRICS})])
    except Exception:
        pass  # an empty answer is rejected; only the request matters here
    assert seen["data"]["rules"] == ANALYSIS_RULES
    sent = seen["data"]["candidates"][0]
    assert "financial_context" not in sent and not any(ch.isdigit() for ch in sent["claims"][0]["text"])
