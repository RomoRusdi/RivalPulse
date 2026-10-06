"""Pure projections of saved Sectors facts. No I/O and no inferred monetary metadata."""
import re
from decimal import Decimal, InvalidOperation, localcontext

PROJECTION_VERSION = 2
MAX_FIGURES = 1000


def decimal_value(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        amount = Decimal(str(value))
        # Bound processing of untrusted exponent/precision as well as row count.
        return amount if amount.is_finite() and abs(amount.adjusted()) <= 300 and len(amount.as_tuple().digits) <= 300 else None
    except (InvalidOperation, ValueError, TypeError):
        return None


def annual_year(value):
    text = str(value)
    return text if re.fullmatch(r"(?:19|20)\d{2}|2100", text) else None


def known_metadata(currency, unit, basis):
    return bool(currency and unit and basis and not any(
        word in (unit + basis).lower() for word in ("unspecified", "unverified", "unknown")))


def scope_boundary(current, previous, note, basis):
    if "restated" in basis.lower() or not re.search(r"merger|scope change|acquisition", note, re.I):
        return False
    return any(int(previous) < int(year) <= int(current) for year in re.findall(r"\b(20\d{2})\b", note))


def growth(current, previous):
    """Adjacent annual figures with identical known metadata and a positive base."""
    try:
        if not known_metadata(current.get("currency"), current.get("unit"), current.get("comparison_basis")):
            return None
        if any(not current.get(key) or current.get(key) != previous.get(key)
               for key in ("metric", "currency", "unit", "comparison_basis")):
            return None
        if int(current["period"]) != int(previous["period"]) + 1:
            return None
        numerator, denominator = decimal_value(current["value"]), decimal_value(previous["value"])
        if numerator is None or denominator is None or denominator <= 0:
            return None
        with localcontext() as context:
            context.prec = 640
            return str(((numerator - denominator) / denominator * 100).quantize(Decimal("0.01")))
    except (ValueError, InvalidOperation, KeyError, TypeError, AttributeError):
        return None


def performance_metrics(payload):
    """The documented Sectors growth/margin fields are fractional rates."""
    financials = payload.get("financials") if isinstance(payload, dict) else None
    if not isinstance(financials, dict):
        return []
    metrics = []

    def add(name, raw, period_kind, period, pointer):
        amount = decimal_value(raw)
        if amount is None:
            return
        with localcontext() as context:
            context.prec = 640
            value = str((amount * 100).quantize(Decimal("0.01")))
        metrics.append(dict(metric=name, rawValue=str(amount), value=value, unit="percent",
                            periodKind=period_kind, period=period, origin="provider_reported",
                            currency=None, basis="provider_reported", jsonPointer=pointer,
                            transformation="fraction_to_percent", displayStatus="available",
                            comparisonStatus="context_only",
                            reasons=["period_unknown"] if period is None else ["scope_unverified"]))

    # The report does not document a reference quarter: keep it unknown.
    for name in ("yoy_quarter_revenue_growth", "yoy_quarter_earnings_growth"):
        add(name, financials.get(name), "quarter", None, f"/financials/{name}")
    rows = financials.get("historical_financial_ratio")
    for index, row in enumerate(rows[:MAX_FIGURES] if isinstance(rows, list) else []):
        if not isinstance(row, dict) or (year := annual_year(row.get("year"))) is None:
            continue
        profitability = row.get("profitability")
        if isinstance(profitability, dict):
            add("net_profit_margin", profitability.get("net_profit_margin"), "annual", year,
                f"/financials/historical_financial_ratio/{index}/profitability/net_profit_margin")
    grouped = {}
    for metric in metrics:
        grouped.setdefault((metric["metric"], metric["period"]), []).append(metric)
    result = []
    for entries in grouped.values():
        point = entries[0]
        if any(entry["rawValue"] != point["rawValue"] for entry in entries[1:]):
            point = {**point, "value": None, "displayStatus": "conflict", "reasons": ["conflicting_values"]}
        result.append(point)
    return result


def project_snapshot(snapshot, note=""):
    """Upgrade legacy evidence in memory without modifying immutable snapshots."""
    if snapshot is None:
        return [], []
    normalized = snapshot.normalized or {}
    figures = []
    for metric in normalized.get("metrics", [])[:MAX_FIGURES]:
        if not isinstance(metric, dict) or (year := annual_year(metric.get("period"))) is None:
            continue
        amount = decimal_value(metric.get("value"))
        if amount is None:
            continue
        figures.append(dict(metric=metric["metric"], period=year, value=str(amount),
                            currency=metric.get("currency"), unit=metric.get("unit") or "provider_native_unspecified",
                            basis=metric.get("comparison_basis") or "reporting_scope_unverified",
                            jsonPointer=metric.get("pointer")))
    raw = snapshot.raw_payload
    # Only report payloads have these fields; never project another provider's payload.
    metrics = performance_metrics(raw) if snapshot.provider == "sectors" else []
    if raw is None:
        metrics = normalized.get("performance_metrics", [])
    from app.db import iso
    metrics = [{**metric, "snapshotId": snapshot.id, "sourceUrl": snapshot.url,
                "fetchedAt": iso(snapshot.fetched_at),
                "reasons": list(dict.fromkeys(metric["reasons"] + (
                    ["scope_change"] if re.search(r"merger|scope change|acquisition", note, re.I) else [])))}
               for metric in metrics[:MAX_FIGURES]]
    return figures, metrics
