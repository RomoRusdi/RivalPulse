"""Read-only annual-ratio presentation from a run's saved Sectors evidence.

Never fetch a provider, modify a snapshot/result, or turn quarter/TTM rates into
annual growth. Old runs can gain a corrected view without another paid run.
"""
import copy

from app.comparison import build_comparison
from app.contracts import FinancialBrief
from app.financial_projection import decimal_value, project_snapshot, growth, scope_boundary


MONEY_WARNING = "Currency/reporting scale was not supplied. Calculated annual monetary growth and peer rankings are withheld; Sectors-reported percentages are separate context."


def financial_warning(text):
    return MONEY_WARNING if text == "Provider did not specify currency; monetary comparisons are disabled." else text


def verified_annual_growth(brief, snapshots):
    """Validate old derived percentages against their actual saved monetary sources."""
    data = brief.model_dump()
    removed = False
    for row in data["rows"]:
        kept = []
        for metric in row["metrics"]:
            if metric["metric"] not in ("revenue_yoy_percent", "earnings_yoy_percent"):
                kept.append(metric)
                continue
            snapshot = snapshots.get(metric["snapshot_id"])
            current = previous = None
            try:
                source = snapshot.normalized["metrics"] if snapshot and snapshot.normalized.get("symbol") == row["symbol"] else []
                kind = metric["metric"].removesuffix("_yoy_percent")
                current = next((m for m in source if m["metric"] == kind and m["period"] == metric["period"]), None)
                previous = next((m for m in source if m["metric"] == kind and int(m["period"]) == int(metric["period"]) - 1), None)
                rate = growth(current, previous) if current and previous and not scope_boundary(current["period"], previous["period"], row["comparison_note"], current["comparison_basis"]) else None
            except (ValueError, TypeError, KeyError, AttributeError):
                rate = None
            if rate is None:
                removed = True
                row["metric_notes"][metric["metric"]] = "Not calculated: currency, scale, adjacent annual periods or reporting scope could not be verified from the saved source."
            else:
                metric["value"] = ("+" if decimal_value(rate) >= 0 else "") + rate + "%"
                kept.append(metric)
        row["metrics"] = kept
    data["caveats"] = [financial_warning(note) for note in data["caveats"]
                       if not note.startswith("Year-on-year percentages are computed from as-reported values")]
    if removed:
        data["caveats"].append("Unverified calculated annual growth is withheld. Sectors-reported margins and quarterly percentages are separate source facts, not verified monetary comparisons.")
    return FinancialBrief.model_validate(data)


def with_reported_margins(brief, snapshots):
    """Return a new cited brief and new model claims, using its original sources."""
    updated = verified_annual_growth(brief, snapshots).model_dump()
    claims = []
    for row in updated["rows"]:
        source_id = next((m["snapshot_id"] for m in row["metrics"] if m["metric"] == "revenue"),
                         next((m["snapshot_id"] for m in row["metrics"]), None))
        snapshot = snapshots.get(source_id)
        if not snapshot or snapshot.provider != "sectors" or snapshot.normalized.get("symbol") != row["symbol"]:
            continue
        year = brief.period or next((m["period"] for m in row["metrics"] if m["metric"] == "revenue"), None)
        if not year:
            continue
        _, rates = project_snapshot(snapshot)
        margin = next((m for m in rates if m.get("metric") == "net_profit_margin"
                       and m.get("periodKind") == "annual" and m.get("period") == year), None)
        if not margin:
            continue
        # Rebuild just this reported metric so projecting an already-corrected
        # result is idempotent. Do not retain a value contradicted by its source.
        row["metrics"] = [m for m in row["metrics"] if not (m["metric"] == "net_profit_margin" and m["period"] == year)]
        if margin.get("displayStatus") == "conflict":
            row["metric_notes"]["net_profit_margin"] = f"Sectors returned conflicting annual net margins for {year}; no value is displayed."
            continue
        if (margin.get("origin") != "provider_reported" or margin.get("unit") != "percent"
                or margin.get("displayStatus") != "available" or decimal_value(margin.get("value")) is None):
            row["metric_notes"]["net_profit_margin"] = f"Sectors' annual net margin for {year} could not be validated."
            continue
        claim_id = f"financial-{row['symbol']}-net-profit-margin-{year}"
        row["metrics"].append(dict(metric="net_profit_margin", value=margin["value"], currency=None,
                                   unit="percent", period=year,
                                   comparison_basis="provider_reported; reporting_scope_unverified",
                                   source_url=snapshot.url, json_pointer=margin["jsonPointer"],
                                   snapshot_id=snapshot.id, claim_id=claim_id))
        row["metric_notes"]["net_profit_margin"] = "Sectors-reported annual margin; reporting scope is unverified. Shown as context, not ranked."
        claims.append(dict(claim_id=claim_id, symbol=row["symbol"], metric="net_profit_margin", period=year,
                           value=margin["value"], currency=None, unit="percent"))
    return FinancialBrief.model_validate(updated), claims


def project_run_result(db, run):
    """Correct the delivered view only; keep persisted research and provenance intact."""
    result = copy.deepcopy(run.result)
    if result:
        for entry in result.get("coverage", []):
            if entry.get("warnings"):
                entry["warnings"] = [financial_warning(note) for note in entry["warnings"]]
        from app.finding_projection import project_signal_card
        result["signals"] = [project_signal_card(card) for card in result.get("signals", [])]
        contexts = [card for card in result["signals"] if card["finding_scope"] != "competitor_move"]
        if contexts and any(card.get("classification_revised") for card in result["signals"]):
            moves = len(result["signals"]) - len(contexts)
            result["summary"] = (f"{moves} verified competitor-move findings and {len(contexts)} context-only findings. "
                                 "Financial updates and third-party commentary are not product launches. "
                                 "Saved categories and attribution have been corrected from existing evidence; original research remains stored.")
        if result.get("financial_brief"):
            sectors = {c["symbol"]: c.get("industry", "") for c in (run.inputs or {}).get("companies", [])}
            for row in result["financial_brief"]["rows"]:
                row["industry"] = sectors.get(row["symbol"], "")
    if (not result or run.mode not in ("live", "replay") or not result.get("financial_brief")):
        return result
    from sqlalchemy import select
    from app.models import RunSnapshot, Snapshot

    snapshots = {s.id: s for s in db.scalars(select(Snapshot).join(RunSnapshot).where(
        RunSnapshot.run_id == run.id, Snapshot.mode == run.mode, Snapshot.provider == "sectors"))}
    brief, _ = with_reported_margins(FinancialBrief.model_validate(result["financial_brief"]), snapshots)
    result["financial_brief"] = brief.model_dump()
    old_comparison = result.get("comparison")
    if not old_comparison:
        return result
    symbols = set(run.inputs.get("compared_symbols") or [e["symbol"] for e in old_comparison["entries"]])
    companies = [c for c in run.inputs["companies"] if c["symbol"] in symbols]
    activity = {e["symbol"]: {"findings": e["findings"], "note": e.get("activity_note")}
                for e in old_comparison["entries"]}
    if any(card.get("classification_revised") for card in result["signals"]):
        for symbol, entry in activity.items():
            own = [card for card in result["signals"] if card["company"]["symbol"] == symbol]
            entry["findings"] = sum(card["finding_scope"] == "competitor_move" for card in own)
            if own and not entry["findings"]:
                entry["note"] = "Only financial, analyst or market context was recorded; no verified competitor move is established."
    comparison = build_comparison(brief, companies, run.inputs.get("user_company"), activity)
    result["financial_brief"] = brief.model_dump()
    if comparison:
        result["comparison"] = comparison.model_dump()
        headline = old_comparison.get("headline")
        if headline and result["summary"].startswith(headline):
            result["summary"] = comparison.headline + result["summary"][len(headline):]
    return result
