"""Offline decision-support contract, grounding, fallback and immutable-history tests."""
import copy
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.agent import Agent, LLMAdapter
from app.contracts import Interpretation
from app.db import session
from app.decision_support import analysis_context, fallback_interpretation, relevance_for, validate_interpretation
from app.errors import ProviderError
from app.models import Revision, Run, Snapshot, Watchlist
from app.research import claim_run, execute_run, validate_card
from tests.conftest import execute, launch


COMPANY = {"symbol": "BETA", "name": "Synthetic rival", "industry": "Synthetic telecom"}
CONTEXT = {"objective": "Compare student offers", "user_company": {
    "symbol": "ALFA", "name": "Synthetic own company", "industry": "Synthetic telecom"}}
CANDIDATE = {"event_key": "synthetic-event", "company": COMPANY, "event_type": "Pricing",
             "claims": [{"claim_id": "observation-0", "text": "Synthetic student bundle announcement."}],
             "financial_context": []}


def interpretation(**updates):
    return Interpretation(**{
        "event_key": "synthetic-event", "supporting_claim_ids": ["observation-0"],
        "why_it_matters": "BETA's advertised student offer may be relevant to ALFA if their customer overlap is confirmed.",
        "potential_implication": "If the target customers overlap, the offer could warrant a review of existing bundle eligibility.",
        "recommended_next_step": "Compare the advertised price, inclusions and eligibility with the existing student offer after confirming overlap.",
        "limitations": ["The announcement does not establish customer uptake or revenue impact."], "uncertainty": "high",
        **updates,
    })


class StructuredLLM(LLMAdapter):
    def __init__(self):
        self.payloads = []

    def structured(self, kind, schema, data, repair=False):
        assert kind == "analyze"
        self.payloads.append(copy.deepcopy(data))
        own = (data.get("user_company") or {}).get("symbol")
        rows = []
        for candidate in data["candidates"]:
            symbol = candidate["company"]["symbol"]
            event_type = candidate["event_type"].lower()
            rows.append({
                "event_key": candidate["event_key"], "supporting_claim_ids": ["observation-0"],
                "why_it_matters": f"{symbol}'s {event_type} observation may be relevant to {own or 'a neutral review'} if customer overlap is confirmed.",
                "potential_implication": "If the offers serve overlapping customers, the announcement could warrant checking the existing proposition.",
                "recommended_next_step": f"Verify the {event_type} announcement's scope, intended customers and availability against a relevant existing offer.",
                "limitations": ["Customer uptake and financial effects are not established by this announcement."],
                "uncertainty": "high",
            })
        return {"interpretations": rows}


def set_perspective(watchlist, symbol):
    with session() as db, db.begin():
        db.get(Watchlist, watchlist["id"]).user_company = symbol


def test_structured_analysis_accepts_conditional_grounded_reasoning():
    validate_interpretation(interpretation(), CANDIDATE, CONTEXT)
    validate_interpretation(interpretation(potential_implication=None), CANDIDATE, CONTEXT)


@pytest.mark.parametrize("updates", [
    {"supporting_claim_ids": ["unknown"]},
    {"supporting_claim_ids": ["observation-0", "observation-0"]},
    {"why_it_matters": "BETA will increase revenue for ALFA."},
    {"why_it_matters": "BETA's announcement matters to a company whose identity is not supplied."},
    {"potential_implication": "This guarantees improved competitive positioning."},
    {"potential_implication": "Expect growth of 40%."},
    {"potential_implication": "Relevant."},
    {"recommended_next_step": "See https://unapproved.example for further evidence."},
    {"recommended_next_step": "Review this evidence when assessing messaging."},
    {"limitations": ["The statement covers 2025 only."]},
    {"limitations": [" "]},
])
def test_model_cannot_publish_unsupported_boilerplate_or_numeric_reasoning(updates):
    with pytest.raises(ValueError):
        validate_interpretation(interpretation(**updates), CANDIDATE, CONTEXT)


def test_financial_claims_cannot_replace_observation_support():
    candidate = {**CANDIDATE, "claims": [*CANDIDATE["claims"], {"claim_id": "financial-0", "text": "Synthetic earnings."}]}
    with pytest.raises(ValueError, match="observation"):
        validate_interpretation(interpretation(supporting_claim_ids=["financial-0"]), candidate, CONTEXT)


def test_catalogue_pluralisation_is_not_mistaken_for_cross_sector_relevance():
    context = {**CONTEXT, "user_company": {**CONTEXT["user_company"], "industry": "Telecommunications"}}
    assert relevance_for({**COMPANY, "industry": "Telecommunication"}, context) == "same_sector"
    assert relevance_for({**COMPANY, "industry": "   "}, context) == "unknown"


@pytest.mark.parametrize("perspective", [None, "ICBP"])
def test_valid_ai_stays_limited_when_personalised_relevance_is_unestablished(client, watchlist, perspective):
    set_perspective(watchlist, perspective)
    run_id = launch(client, watchlist)
    execute_run(run_id, StructuredLLM())
    detail = client.get("/api/v1/research-runs/" + run_id).json()
    assert detail["status"] in ("completed", "partial"), detail.get("error_code")
    assert detail["result"]["signals"]
    for card in detail["result"]["signals"]:
        support = card["decision_support"]
        assert support["status"] == "limited" and support["origin"] == "ai"
        assert support["perspective"] == perspective
        assert support["relevance"] == ("cross_sector" if perspective else "neutral")


def test_rule_based_steps_are_event_specific_and_do_not_claim_impact():
    pricing = fallback_interpretation(CANDIDATE, CONTEXT)
    product = fallback_interpretation({**CANDIDATE, "event_type": "Product"}, CONTEXT)
    assert pricing.potential_implication is None and product.potential_implication is None
    assert "price, inclusions" in pricing.recommended_next_step
    assert "features, availability" in product.recommended_next_step
    assert pricing.recommended_next_step != product.recommended_next_step
    assert "ALFA" in pricing.why_it_matters and "BETA" in pricing.why_it_matters


def test_cross_sector_and_neutral_fallback_do_not_invent_personalised_relevance():
    cross = {**CONTEXT, "user_company": {**CONTEXT["user_company"], "industry": "Synthetic food"}}
    row = fallback_interpretation(CANDIDATE, cross)
    assert "different catalogue sectors" in row.why_it_matters
    assert row.potential_implication is None
    neutral = fallback_interpretation(CANDIDATE, {})
    assert "no own-company perspective" in neutral.why_it_matters
    assert "Choose an own-company perspective" in neutral.recommended_next_step


def test_pipeline_exposes_structured_analysis_and_backend_observation(client, watchlist):
    set_perspective(watchlist, "TLKM")
    adapter = StructuredLLM()
    run_id = launch(client, watchlist)
    execute_run(run_id, adapter)
    detail = client.get("/api/v1/research-runs/" + run_id).json()
    assert detail["status"] == "completed", detail.get("error_code")
    assert adapter.payloads[0]["user_company"]["symbol"] == "TLKM"
    assert adapter.payloads[0]["objective"]
    for card in detail["result"]["signals"]:
        support = card["decision_support"]
        assert support["origin"] == "ai" and support["status"] == "available"
        assert support["perspective"] == "TLKM"
        assert support["what_happened"] == card["observed_signals"][0]["text"]
        assert set(support["evidence_ids"]) <= {e["id"] for e in card["evidence"]}
        assert any("overlap" in note for note in support["limitations"])
        compat = client.get("/signals/" + card["signal_id"]).json()
        assert compat["decisionSupport"] == support
    with session() as db:
        from app.compat import run_json
        findings = run_json(db, db.get(Run, run_id))["findings"]
    assert len(findings) == 3 and all(f["decisionSupport"]["perspective"] == "TLKM" for f in findings)


def test_repair_feedback_is_bounded_and_does_not_echo_rejected_output(client, watchlist):
    class Repair(StructuredLLM):
        def structured(self, kind, schema, data, repair=False):
            output = super().structured(kind, schema, data, repair)
            if len(self.payloads) == 1:
                output["interpretations"][0]["recommended_next_step"] = "Expect an unsupported rise of 999% after this campaign."
            return output
    set_perspective(watchlist, "TLKM")
    adapter = Repair()
    run_id = launch(client, watchlist)
    execute_run(run_id, adapter)
    detail = client.get("/api/v1/research-runs/" + run_id).json()
    assert len(adapter.payloads) == 2
    feedback = adapter.payloads[1]["validation_feedback"]
    assert "backend-owned" in feedback and "999" not in feedback
    assert all(c["decision_support"]["origin"] == "ai" for c in detail["result"]["signals"])


def test_rejected_model_has_explicit_unavailable_status(client, watchlist):
    class Bad(StructuredLLM):
        def structured(self, *args, **kwargs):
            output = super().structured(*args, **kwargs)
            for row in output["interpretations"]:
                row["potential_implication"] = "Revenue will rise 40%."
            return output
    set_perspective(watchlist, "TLKM")
    run_id = launch(client, watchlist)
    execute_run(run_id, Bad())
    detail = client.get("/api/v1/research-runs/" + run_id).json()
    assert detail["status"] == "completed"
    for card in detail["result"]["signals"]:
        support = card["decision_support"]
        assert support["status"] == "unavailable" and support["origin"] == "rule_based"
        assert support["potential_implication"] is None
        assert support["fallback_reason"] == "wording_rejected"
        assert "40" not in str([support["why_it_matters"], support["potential_implication"],
                                   support["recommended_next_step"], support["limitations"]])
    step = next(s for s in detail["progress"] if s["stage"] == "analyze")
    assert "unavailable" in step["message"] and "reviewed wording" not in step["message"]


def test_model_disabled_is_not_labelled_as_rejected(client, watchlist):
    detail = execute(client, watchlist)
    assert all(c["decision_support"]["fallback_reason"] == "model_disabled" for c in detail["result"]["signals"])


def test_model_budget_exhaustion_is_explicit_and_never_calls_adapter(client, watchlist):
    run_id = launch(client, watchlist)
    with session() as db, db.begin():
        db.get(Run, run_id).llm_calls = 8
    adapter = StructuredLLM()
    execute_run(run_id, adapter)
    detail = client.get("/api/v1/research-runs/" + run_id).json()
    assert not adapter.payloads
    assert all(c["decision_support"]["fallback_reason"] == "llm_budget_exhausted" for c in detail["result"]["signals"])


def test_unchanged_evidence_gets_current_context_without_rewriting_originals(client, watchlist):
    first = execute(client, watchlist)
    with session() as db:
        before = {r.id: copy.deepcopy(r.card) for r in db.scalars(select(Revision))}
        snapshots_before = {s.id: copy.deepcopy((s.raw_payload, s.normalized)) for s in db.scalars(select(Snapshot))}
    set_perspective(watchlist, "TLKM")
    adapter = StructuredLLM()
    run_id = launch(client, watchlist)
    execute_run(run_id, adapter)
    detail = client.get("/api/v1/research-runs/" + run_id).json()
    assert detail["status"] == "completed", detail.get("error_code")
    assert all(c["change_status"] == "unchanged" for c in detail["result"]["signals"])
    assert all(c["decision_support"]["perspective"] == "TLKM" and c["decision_support"]["origin"] == "ai"
               for c in detail["result"]["signals"])
    assert all(c["decision_support"]["perspective"] is None for c in first["result"]["signals"])
    with session() as db:
        assert {r.id: r.card for r in db.scalars(select(Revision))} == before
        assert all((db.get(Snapshot, identity).raw_payload, db.get(Snapshot, identity).normalized) == payload
                   for identity, payload in snapshots_before.items())
        assert db.get(Run, first["id"]).result["signals"][0]["decision_support"]["perspective"] is None
        from app.compat import run_json
        result = run_json(db, db.get(Run, run_id))
        assert result["producedSignalIds"] == []
        assert all(f["decisionSupport"]["perspective"] == "TLKM" for f in result["findings"])


def test_perspective_comes_from_frozen_inputs_not_current_watchlist():
    run = SimpleNamespace(query="Saved objective", inputs={"user_company": "ALFA", "companies": [CONTEXT["user_company"]]})
    assert analysis_context(run)["user_company"]["symbol"] == "ALFA"


def test_persistence_rejects_fabricated_observation_and_mismatched_citations(client, watchlist):
    detail = execute(client, watchlist)
    with session() as db:
        card = copy.deepcopy(db.get(Revision, detail["result"]["signals"][0]["revision_id"]).card)
        snapshots = {s.id: s for s in db.scalars(select(Snapshot))}
    invalid = copy.deepcopy(card)
    invalid["decision_support"]["what_happened"] = "An invented announcement."
    with pytest.raises(ValueError, match="literal observation"):
        validate_card(invalid, snapshots)
    invalid = copy.deepcopy(card)
    invalid["decision_support"]["evidence_ids"] = ["not-a-real-citation"]
    with pytest.raises(ValueError, match="citations"):
        validate_card(invalid, snapshots)
    invalid = copy.deepcopy(card)
    invalid["decision_support"]["status"] = "available"
    with pytest.raises(ValueError, match="masquerade"):
        validate_card(invalid, snapshots)


def test_duplicate_event_keys_are_rejected_with_bounded_repair(client, watchlist):
    class Duplicate(StructuredLLM):
        def structured(self, *args, **kwargs):
            output = super().structured(*args, **kwargs)
            output["interpretations"].append(copy.deepcopy(output["interpretations"][0]))
            return output
    run_id = launch(client, watchlist)
    token = claim_run(run_id)
    adapter = Duplicate()
    with pytest.raises(ProviderError, match="LLM output failed validation"):
        Agent(run_id, token, adapter).analyze([CANDIDATE])
    assert len(adapter.payloads) == 2
