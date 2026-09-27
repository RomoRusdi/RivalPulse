"""Projection into the existing frontend Zod contract; canonical evidence lives at /api/v1."""
from datetime import timezone

from sqlalchemy import select

from app.db import iso, utcnow
from app.models import RunStep
from app.research import STAGES


def signal_json(card):
    return {
        "id": card["signal_id"], "company": card["company"]["symbol"], "companyName": card["company"]["name"],
        "type": card["type"], "title": ({"replay": "[REPLAY] ", "yahoo": "[YAHOO TEST] "}.get(card["mode"], "")) + card["title"],
        "subline": f"{card['mode']} · {card['change_status']} · {card['analysis_status']}",
        "headline": card["observed_signals"][0]["text"], "severity": card["severity"],
        "detectedAt": card["first_seen_at"][:10], "runId": card["run_id"], "storedAt": card["stored_at"],
        "comparedAgainstRunId": card["compared_against_run_id"] or "",
        "evidence": [{"kind": kind, "source": "AI interpretation" if kind == "hypothesis" else "Stored evidence",
                      "text": c["text"]} for kind, field in
                     (("fact", "facts"), ("observed_signal", "observed_signals"), ("hypothesis", "hypotheses"))
                     for c in card[field]],
        "financialContext": {
            "seriesCaption": (("Yahoo Finance test data" if card["mode"] == "yahoo" else "Sectors annual revenue") +
                              "; source currency and unit shown in metrics"),
            "series": [{"label": m["period"], "value": float(m["value"])}
                       for m in card["financial_context"] if m["metric"] == "revenue"],
            "metrics": [{"label": m["metric"] + " · " + m["period"],
                         "value": f"{m['value']} {m['currency'] or ''} {m['unit']}".strip()}
                        for m in card["financial_context"]],
            "whyItMatters": "Hypothesis: " + card["why_marketing_should_care"]["text"],
        }, "mode": card["mode"], "change_status": card["change_status"],
    }


def run_json(db, run):
    steps = list(db.scalars(select(RunStep).where(RunStep.run_id == run.id).order_by(RunStep.created_at)))
    status = {"completed": "complete", "partial": "complete", "failed": "failed"}.get(run.status, run.status)
    elapsed = ((run.finished_at or utcnow()).replace(tzinfo=timezone.utc) -
               (run.started_at or run.created_at).replace(tzinfo=timezone.utc)).total_seconds()
    data = dict(id=run.id, query=run.query, status=status,
                currentStep=STAGES.index(run.stage) if run.stage in STAGES else -1,
                steps=[{"id": stage, "label": stage.replace("_", " ").title()} for stage in STAGES],
                elapsedSeconds=max(0, elapsed), etaSeconds=max(0, 90 - elapsed) if status in ("queued", "running") else 0,
                toolCalls=[{"name": s.stage, "detail": s.message} for s in steps], mode=run.mode,
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
