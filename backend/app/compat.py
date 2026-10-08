"""Projection into the existing frontend Zod contract; canonical evidence lives at /api/v1."""
import re
from datetime import timezone

from sqlalchemy import select
from app.classify import company_event, signal_title

from app.db import iso, utcnow
from app.models import RunStep
from app.research import STAGES
from app.public_evidence import PublicFinancialBrief, public_link
from app.brief_projection import project_run_result
from app.finding_projection import project_signal_card


def try_float(value):
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def signal_json(card):
    card = project_signal_card(card)
    observations = card.get("observed_signals") or []
    series = []
    for m in card.get("financial_context") or []:
        if m.get("metric") != "revenue":
            continue
        value = try_float(m.get("value"))
        if value is None:
            continue
        series.append({"label": m.get("period"), "value": value})
    implication = card["why_marketing_should_care"]["text"]
    why_it_matters = implication if card.get("classification_revised") or implication.startswith("Hypothesis:") else "Hypothesis: " + implication
    # Headline is the short event title (≤300 chars), never the full
    # observation text: list rows and chat cards render it verbatim.
    headline = card["title"] or (observations[0]["text"] if observations else "")
    references = {entry["id"]: entry for entry in card.get("evidence", [])}
    rows = []
    for metric in card.get("financial_context") or []:
        ref = next((references.get(identity) for identity in metric["evidence_ids"] if identity in references), {})
        rows.append({"metric": metric["metric"], "value": metric["value"], "currency": metric["currency"],
                     "unit": metric["unit"], "period": metric["period"], "basis": metric["comparison_basis"],
                     "snapshotId": ref.get("snapshot_id")})
    news = any(entry.get("source") == "sectors_news" for entry in card.get("evidence", []))
    scoped = [company_event({"text": observation["text"], "title": headline}, card["company"])
              for observation in observations] if news and card.get("classification_version", 0) < 2 else []
    semantic = card.get("classification_version", 0) >= 2
    relevance_review = card.get("attribution_review", False) if semantic else news and not any(event and event["type"] == card["type"] for event in scoped)
    if not semantic:
        headline = signal_title({"title": headline, "text": observations[0]["text"] if observations else headline,
                                 "type": card["type"]}, card["company"], attributed=not relevance_review)
    if headline.endswith("company action not established") and observations:
        # Older context findings stored one fixed title, so every row looked the
        # same. Show the opening of the cited text instead; the evidence is unchanged.
        opening = re.split(r"(?<=[.!?])\s+", observations[0]["text"].strip())[0]
        headline = f"{card['company']['symbol']} · {opening[:110].rstrip()}{'…' if len(opening) > 110 else ''}"
    return {
        "id": card["signal_id"], "company": card["company"]["symbol"], "companyName": card["company"]["name"],
        "type": card["type"], "title": ({"replay": "[REPLAY] ", "yahoo": "[YAHOO TEST] "}.get(card["mode"], "")) + headline,
        "subline": f"{card['mode']} · {card['change_status']} · {card['analysis_status']}",
        "changeStatus": card["change_status"],
        "findingScope": card.get("finding_scope", "competitor_move"),
        "classificationNote": card.get("classification_note", ""),
        "classificationRevised": card.get("classification_revised", False),
        "classificationOrigin": card.get("classification_origin", "rule_based"),
        "attributionRole": card.get("attribution_role"),
        "originalType": card.get("original_type"),
        "headline": headline, "severity": card["severity"],
        "detectedAt": card["first_seen_at"][:10], "runId": card["run_id"], "storedAt": card["stored_at"],
        "addedAt": card["first_seen_at"], "publishedAt": card.get("published_at"),
        "relevanceReview": relevance_review,
        "sources": [{"url": public_link(entry["url_or_endpoint"], entry.get("snapshot_id"), entry["source"]), "source": entry["source"],
                     "observationSupport": any(entry["id"] in claim.get("evidence_ids", []) for claim in observations),
                     "publishedAt": entry.get("published_at")} for entry in card.get("evidence", [])],
        "comparedAgainstRunId": card["compared_against_run_id"] or "",
        "evidence": [{"kind": kind, "source": ("Rule-based limitation" if (card.get("decision_support") or {}).get("origin") == "rule_based"
                                              else "AI interpretation") if kind == "hypothesis" else "Stored evidence",
                      "text": c["text"]} for kind, field in
                     (("fact", "facts"), ("observed_signal", "observed_signals"), ("hypothesis", "hypotheses"))
                     for c in card[field]],
        "decisionSupport": card.get("decision_support"),
        "financialContext": {
            "note": card["company"].get("comparison_note", ""),
            "seriesCaption": (("Yahoo Finance test data" if card["mode"] == "yahoo" else "Sectors annual revenue") +
                              "; source currency and unit shown in metrics"),
            "series": series,
            "rows": rows,
            "metrics": [{"label": m["metric"] + " · " + m["period"],
                         "value": f"{m['value']} {m['currency'] or ''} {m['unit']}".strip()}
                        for m in card["financial_context"]],
            "whyItMatters": why_it_matters,
        }, "mode": card["mode"], "change_status": card["change_status"],
    }


def tool_calls(run, steps):
    """Real tool invocations, not stage names.

    The stage list says "collect"; the coverage record says which company was
    read, from which provider, whether it was cached and what it cost. That
    second thing is the evidence of orchestration, so it is what gets shown.
    """
    symbols = {c["id"]: c["symbol"] for c in (run.inputs or {}).get("companies", [])}
    calls = []
    for step in steps:
        for entry in (step.details or {}).get("coverage", []):
            target = ", ".join(symbols.get(i, i[:8]) for i in entry.get("company_ids", []))
            bits = [target] if target else []
            if entry.get("cache_status"):
                bits.append(entry["cache_status"])
            if entry.get("estimated_credits"):
                bits.append(f"{entry['estimated_credits']} credit{'s' if entry['estimated_credits'] != 1 else ''}")
            if entry.get("duration_ms"):
                bits.append(f"{entry['duration_ms']} ms")
            if entry["status"] != "ok":
                bits.append(entry.get("code") or entry["status"])
            calls.append({"name": entry["tool"], "detail": " · ".join(bits)})
    # Before the first tool returns there is nothing to show but the stage.
    return calls or [{"name": s.stage, "detail": s.message} for s in steps]


def orchestration(run, steps):
    """What the agent decided, as opposed to what it found."""
    by_stage = {s.stage: s for s in steps}
    plan = (by_stage["plan"].details or {}) if "plan" in by_stage else {}
    recover = (by_stage["recover"].details or {}) if "recover" in by_stage else {}
    analyze = (by_stage["analyze"].details or {}) if "analyze" in by_stage else {}
    coverage = [e for s in steps for e in (s.details or {}).get("coverage", [])]
    summary = {
        "route": plan.get("route"),
        "routeReason": plan.get("route_reason"),
        "planner": plan.get("planner"),
        "interpreter": analyze.get("interpreter"),
        "modelProvider": analyze.get("model_provider"), "model": analyze.get("model"),
        **({"aiExplanations": analyze["ai_explanations"], "evidenceOnlyFindings": analyze.get("evidence_only_findings", 0)} if "ai_explanations" in analyze else {}),
        **({"newsReview": analyze["news_review"]} if analyze.get("news_review") else {}),
        "toolCalls": len(coverage),
        "credits": run.credits,
        "cacheHits": sum(1 for e in coverage if e.get("cache_status") in ("cached", "resumed")),
        "comparedAgainstRunId": run.baseline_id,
        "gapsClosed": recover.get("gaps_closed"),
        "gaps": [{"symbol": g["symbol"], "missing": g["missing"],
                  "recoverable": g["recoverable"], "reason": g["reason"]}
                 for g in recover.get("gaps", [])],
    }
    return {k: v for k, v in summary.items() if v not in (None, [])}


def run_json(db, run):
    steps = list(db.scalars(select(RunStep).where(RunStep.run_id == run.id).order_by(RunStep.created_at)))
    status = {"completed": "complete", "partial": "complete", "failed": "failed"}.get(run.status, run.status)
    elapsed = ((run.finished_at or utcnow()).replace(tzinfo=timezone.utc) -
               (run.started_at or run.created_at).replace(tzinfo=timezone.utc)).total_seconds()
    data = dict(id=run.id, query=run.query, status=status,
                currentStep=STAGES.index(run.stage) if run.stage in STAGES else -1,
                steps=[{"id": stage, "label": stage.replace("_", " ").title()} for stage in STAGES],
                elapsedSeconds=max(0, elapsed), etaSeconds=max(0, 90 - elapsed) if status in ("queued", "running") else 0,
                toolCalls=tool_calls(run, steps), mode=run.mode,
                orchestration=orchestration(run, steps),
                coverageStatus=run.status, startedAt=iso(run.started_at))
    if run.error_code:
        data["failedTool"] = run.error_code
    result = project_run_result(db, run)
    if result:
        data["resultSummary"] = ({"replay": "[REPLAY] ", "yahoo": "[YAHOO TEST] "}.get(run.mode, "")) + result["summary"]
        if run.status == "partial":
            missing = [entry for entry in result["coverage"] if entry["status"] != "ok" or
                       (entry["tool"] == "get_recent_signals" and entry.get("warnings"))]
            if missing:
                data["resultSummary"] += " Some evidence could not be verified; see source coverage in the run details."
        if result.get("financial_brief"):
            data["financialBrief"] = PublicFinancialBrief.model_validate(result["financial_brief"]).model_dump()
        if result.get("comparison"):
            data["comparison"] = result["comparison"]
        # Frozen per-run findings also carry reinterpretations of unchanged
        # evidence; the mutable global signal list is not this run's perspective.
        data["findings"] = [signal_json(card) for card in result["signals"]]
        data["producedSignalIds"] = [c["signal_id"] for c in result["signals"] if c["change_status"] in ("new", "updated") and c.get("finding_scope", "competitor_move") == "competitor_move"]
    return data
