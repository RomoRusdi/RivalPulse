"""Qualitative decision support over frozen evidence; never fetches or calculates figures."""
import re

from app.contracts import DecisionSupport, Interpretation
from app.comparison import industry_key
from app.classify import classification_note


BOILERPLATE = (
    "this observation may affect competitive positioning",
    "review this evidence when assessing messaging",
    "review the observed evidence before changing messaging",
)
NEXT_STEPS = {
    "pricing": "compare the advertised price, inclusions and eligibility with the relevant existing offer",
    "product": "check the announced product's features, availability and intended customers against the relevant existing product",
    "partnership": "check the named partner, agreement scope and availability before assessing overlapping distribution or capabilities",
    "campaign": "check the campaign's intended audience, message and channels against the relevant existing campaign",
    "financial update": "verify the guidance's reporting period, funding assumptions and whether it describes planned or realised expenditure",
    "analyst commentary": "check which companies the analyst actually discusses and verify any claimed company action against a company announcement",
    "market context": "look for a dated, attributable company announcement before treating this coverage as a competitor move",
}


def analysis_context(run):
    inputs = run.inputs or {}
    symbol = inputs.get("user_company")
    own = next((c for c in inputs.get("companies", []) if c["symbol"] == symbol), None)
    return {
        "objective": run.query,
        "user_company": {k: own[k] for k in ("symbol", "name", "industry")} if own else None,
        "context_limitations": [
            "The company perspective comes from the frozen investigation catalogue, not a verified product or customer profile.",
            "Customer, product and geographic overlap is not established by a sector label alone.",
        ],
    }


def metric_claim_text(metric):
    return (f"{metric['metric']} for {metric['period']}: {metric['value']} "
            f"{metric['currency'] or 'currency unspecified'} ({metric['unit']}).")


def prepared_candidate(candidate):
    return {
        "event_key": candidate["event_key"],
        "company": {k: candidate["company"][k] for k in ("symbol", "name", "industry")},
        "event_type": candidate["observations"][0][0]["type"],
        "classification_origin": candidate["observations"][0][0].get("classification_origin", "rule_based"),
        "attribution_role": candidate["observations"][0][0].get("attribution_role"),
        "claims": [*candidate["claims"], *[
            {"claim_id": f"financial-{i}", "text": metric_claim_text(metric)}
            for i, metric in enumerate(candidate["metrics"])]],
        "financial_context": candidate["metrics"],
    }


def relevance_for(company, context):
    own = context.get("user_company")
    if not own:
        return "neutral"
    if company.get("symbol") == own["symbol"]:
        return "same_company"
    sector, own_sector = industry_key(company.get("industry")), industry_key(own.get("industry"))
    if not sector or not own_sector:
        return "unknown"
    return "same_sector" if sector == own_sector else "cross_sector"


def required_limitations(candidate, context):
    relation = relevance_for(candidate.get("company", {}), context)
    notes = list(context.get("context_limitations", []))
    category_note = classification_note(candidate.get("event_type", ""))
    if category_note:
        notes.append(category_note)
    if relation == "neutral":
        notes.append("No own-company perspective was frozen for this investigation; personalised relevance is not established.")
    elif relation == "cross_sector":
        notes.append("These companies have different catalogue sectors; a direct competitive comparison is not established.")
    elif relation == "unknown":
        notes.append("Sector metadata is incomplete; peer relevance is not established.")
    notes.append("An announcement does not establish customer uptake, revenue impact or the cause of a profit change.")
    if candidate.get("financial_context"):
        notes.append("Annual financial context is separate from the announcement; figures do not establish its business impact.")
    return notes


def fallback_interpretation(candidate, context):
    company = candidate.get("company", {})
    symbol = company.get("symbol", "the observed company")
    own = context.get("user_company")
    relation = relevance_for(company, context)
    if relation == "same_company":
        why = f"This finding concerns {symbol} itself, not a competitor move. A competitive implication has not been established."
        prefix = "For this own-company observation, "
    elif relation == "same_sector":
        why = (f"{symbol} and {own['symbol']} share the catalogue sector, but their customer and product overlap "
               "is unverified. A personalised business implication has not been established.")
        prefix = f"Confirm customer and product overlap with {own['symbol']}; if relevant, "
    elif relation == "cross_sector":
        why = (f"{symbol} and {own['symbol']} have different catalogue sectors. This observation does not establish "
               f"a direct competitive implication for {own['symbol']}.")
        prefix = f"First establish whether {symbol}'s activity overlaps with a market served by {own['symbol']}; only then "
    elif relation == "unknown":
        why = f"Sector evidence is incomplete for {symbol} relative to {own['symbol']}; direct relevance remains unverified."
        prefix = f"Verify sector and market overlap with {own['symbol']}; if relevant, "
    else:
        why = f"The observation concerns {symbol}, but no own-company perspective is saved; personalised relevance cannot be established."
        prefix = "Choose an own-company perspective and confirm market overlap; if relevant, "
    next_step = NEXT_STEPS.get(candidate.get("event_type", "").casefold(),
                               "verify the announcement's scope, availability and affected customers against a relevant existing offer")
    return Interpretation(event_key=candidate["event_key"],
                          supporting_claim_ids=[c["claim_id"] for c in candidate["claims"]][:20],
                          why_it_matters=why, potential_implication=None,
                          recommended_next_step=prefix + next_step + ".",
                          limitations=required_limitations(candidate, context), uncertainty="high")


def validate_interpretation(row, candidate, context):
    allowed = {c["claim_id"] for c in candidate["claims"]}
    if len(row.supporting_claim_ids) != len(set(row.supporting_claim_ids)) or not set(row.supporting_claim_ids) <= allowed:
        raise ValueError("Use unique supporting claim IDs from this event only.")
    # Every interpretation must cite the event, not just unrelated annual accounts.
    observed = {c["claim_id"] for c in candidate["claims"] if c["claim_id"].startswith("observation-")}
    if observed and not observed.intersection(row.supporting_claim_ids):
        raise ValueError("Cite at least one observation claim for this event.")
    texts = [row.why_it_matters, row.potential_implication or "", row.recommended_next_step, *row.limitations]
    text = " ".join(texts)
    if re.search(r"(?<![A-Za-z])\d+(?:[.,]\d+)?(?:%|\b)|https?://", text):
        raise ValueError("Numbers, dates and URLs are backend-owned; use qualitative reasoning and supplied claim IDs.")
    if any(phrase in text.casefold() for phrase in BOILERPLATE):
        raise ValueError("Replace generic fallback wording with company-specific relevance and a concrete verification step.")
    if re.search(r"\b(guarantee\w*|caused|proves?|will (?:increase|boost|improve|reduce|grow))\b", text, re.I):
        raise ValueError("Do not assert guaranteed outcomes or causal business impact from an observation.")
    for symbol in (candidate.get("company", {}).get("symbol"), (context.get("user_company") or {}).get("symbol")):
        if symbol and not re.search(rf"\b{re.escape(symbol)}\b", row.why_it_matters, re.I):
            raise ValueError("Explain relevance using the observed-company and frozen own-company tickers.")
    if row.potential_implication is not None and len(row.potential_implication.strip()) < 15:
        raise ValueError("Provide a specific conditional implication or null when evidence is insufficient.")
    if any(not note.strip() or len(note) > 700 for note in row.limitations):
        raise ValueError("Provide nonempty bounded limitations.")


def build_decision_support(run, candidate, interpretation, claims, origin="rule_based", fallback_reason=None):
    context = analysis_context(run)
    prepared = {"company": candidate["company"], "financial_context": candidate["metrics"],
                "event_type": candidate["observations"][0][0]["type"]}
    relevance = relevance_for(candidate["company"], context)
    status = ("unavailable" if origin != "ai" else "limited"
              if interpretation.potential_implication is None or relevance in {"neutral", "unknown", "cross_sector"}
              else "available")
    evidence_ids = list(dict.fromkeys(eid for claim in claims
                                     if claim["claim_id"] in interpretation.supporting_claim_ids
                                     for eid in claim["evidence_ids"]))
    # A literal saved observation, not a model-generated factual summary.
    observation = next(c["text"] for c in claims if c["claim_id"].startswith("observation-")
                       and c["claim_id"] in interpretation.supporting_claim_ids)
    notes = list(dict.fromkeys([*interpretation.limitations, *required_limitations(prepared, context)]))
    if fallback_reason:
        notes.append({"model_disabled": "AI interpretation was not enabled; only evidence and verification steps are available.",
                      "wording_rejected": "AI wording could not be validated; no personalised impact hypothesis was published.",
                      "llm_budget_exhausted": "The model-call budget was exhausted; no personalised impact hypothesis was published.",
                      "model_unavailable": "The selected model was unavailable; cited evidence remains saved without an AI impact assessment.",
                      "analysis_timeout": "The bounded analysis time expired; cited evidence remains saved without an AI impact assessment.",
                      "attribution_unverified": "Company attribution remains unverified; no company-action impact assessment was attempted."}[fallback_reason])
    return DecisionSupport(status=status, origin=origin, fallback_reason=fallback_reason,
                           perspective=(context.get("user_company") or {}).get("symbol"), objective=context["objective"],
                           relevance=relevance, what_happened=observation,
                           why_it_matters=interpretation.why_it_matters,
                           potential_implication=interpretation.potential_implication,
                           recommended_next_step=interpretation.recommended_next_step, limitations=notes,
                           supporting_claim_ids=interpretation.supporting_claim_ids, evidence_ids=evidence_ids,
                           uncertainty=interpretation.uncertainty).model_dump()
