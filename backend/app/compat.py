"""Projection into the existing frontend Zod contract; canonical evidence lives at /api/v1."""
from datetime import timezone

from sqlalchemy import select

from app.db import iso, utcnow
from app.models import RunStep
from app.research import STAGES


def try_float(value):
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def signal_json(card):
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
    why_it_matters = implication if implication.startswith("Hypothesis:") else "Hypothesis: " + implication
    # Headline is the short event title (≤300 chars), never the full
    # observation text: list rows and chat cards render it verbatim.
    headline = card["title"] or (observations[0]["text"] if observations else "")
    return {
        "id": card["signal_id"], "company": card["company"]["symbol"], "companyName": card["company"]["name"],
        "type": card["type"], "title": ({"replay": "[REPLAY] ", "yahoo": "[YAHOO TEST] "}.get(card["mode"], "")) + card["title"],
        "subline": f"{card['mode']} · {card['change_status']} · {card['analysis_status']}",
        "headline": headline, "severity": card["severity"],
        "detectedAt": card["first_seen_at"][:10], "runId": card["run_id"], "storedAt": card["stored_at"],
        "comparedAgainstRunId": card["compared_against_run_id"] or "",
        "evidence": [{"kind": kind, "source": "AI interpretation" if kind == "hypothesis" else "Stored evidence",
                      "text": c["text"]} for kind, field in
                     (("fact", "facts"), ("observed_signal", "observed_signals"), ("hypothesis", "hypotheses"))
                     for c in card[field]],
        "financialContext": {
            "seriesCaption": (("Yahoo Finance test data" if card["mode"] == "yahoo" else "Sectors annual revenue") +
                              "; source currency and unit shown in metrics"),
            "series": series,
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
    if run.result:
        data["resultSummary"] = ({"replay": "[REPLAY] ", "yahoo": "[YAHOO TEST] "}.get(run.mode, "")) + run.result["summary"]
        if run.status == "partial":
            missing = [entry for entry in run.result["coverage"] if entry["status"] != "ok" or
                       (entry["tool"] == "get_recent_signals" and entry.get("warnings"))]
            if missing:
                data["resultSummary"] += " Some evidence could not be verified; see source coverage in the run details."
        if run.result.get("financial_brief"):
            data["financialBrief"] = run.result["financial_brief"]
        data["producedSignalIds"] = [c["signal_id"] for c in run.result["signals"] if c["change_status"] in ("new", "updated")]
    return data
