"""Pure, cited comparison of annual statements; no I/O or model-generated figures.

A sector match alone does not establish financial comparability. Calculated ratios
and ranks require verified metadata. Provider-reported annual ratios may be shown
as cited context even when their reporting scope is unverified. Missing
companies and unverified figures remain visible rather than disappearing.
"""
from decimal import Decimal, localcontext

from app.contracts import Comparison
from app.financial_projection import decimal_value, known_metadata


def industry_key(label):
    text = (label or "").strip().casefold()
    return text[:-1] if text.endswith("s") else text


def percentage(value):
    return decimal_value(str(value).strip().removesuffix("%").removeprefix("+"))


def ordinal(number):
    suffix = "th" if 10 <= number % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(number % 10, "th")
    return f"{number}{suffix}"


def metric_for(row, name, period):
    matches = [m for m in row.metrics if m.metric == name and m.period == period] if row else []
    if not matches or any(m.model_dump() != matches[0].model_dump() for m in matches[1:]):
        return None
    return matches[0]


def entry_for(company, row, period, activity):
    revenue = metric_for(row, "revenue", period)
    earnings = metric_for(row, "earnings", period)
    growth_metric = metric_for(row, "revenue_yoy_percent", period)
    reported_margin = metric_for(row, "net_profit_margin", period)
    reported_note = row.metric_notes.get("net_profit_margin") if row else None
    growth, margin, claims, notes = None, None, [], []
    margin_origin = None
    basis = revenue.comparison_basis if revenue else None
    verified = bool(revenue and known_metadata(revenue.currency, revenue.unit, basis))
    # Growth is a same-company, same-source ratio: the currency cancels, so it
    # does not need verified monetary metadata (adjacency and scope are checked
    # where the percentage is produced).
    if growth_metric:
        growth = percentage(growth_metric.value)
        if growth is not None:
            claims.append(growth_metric.claim_id)
    # A documented provider-reported percentage does not require us to invent
    # the units/currency of its underlying amounts. Its scope is still unverified
    # and it must NOT become a ranked ratio just because the revenue is known.
    if reported_margin and reported_margin.unit == "percent" and reported_margin.comparison_basis.startswith("provider_reported;"):
        margin = percentage(reported_margin.value)
        if margin is not None:
            margin_origin = "provider_reported"
            claims.append(reported_margin.claim_id)
    # Only derive a margin if no conflicting/invalid reported ratio exists.
    # Equal null metadata is not evidence that two amounts have the same units.
    if margin is None and not reported_note and verified and earnings and (revenue.unit, revenue.currency, basis) == (
            earnings.unit, earnings.currency, earnings.comparison_basis):
        revenue_value, earnings_value = decimal_value(revenue.value), decimal_value(earnings.value)
        if revenue_value is not None and revenue_value > 0 and earnings_value is not None:
            with localcontext() as context:
                context.prec = 640
                margin = (earnings_value / revenue_value * 100).quantize(Decimal("0.01"))
            if margin is not None:
                margin_origin = "calculated"
                claims.extend([revenue.claim_id, earnings.claim_id])
    if growth is not None:
        growth_note = "Calculated from the company's own adjacent-year revenue in the same Sectors report."
    elif not period:
        growth_note = "No shared annual reporting year; growth is not compared across different years."
    elif not revenue:
        growth_note = f"No annual revenue figure for {period} was supplied."
    elif row and row.metric_notes.get("revenue_yoy_percent"):
        growth_note = row.metric_notes["revenue_yoy_percent"]
    else:
        growth_note = "Adjacent-year revenue figures are missing or not comparable; annual growth was not calculated."
    if margin_origin == "provider_reported":
        margin_note = "Net margin as reported by Sectors for this year."
    elif margin_origin == "calculated":
        margin_note = "Calculated from compatible annual earnings and revenue."
    elif reported_note:
        margin_note = reported_note
    elif not period:
        margin_note = "No shared annual reporting year; review individual annual statements."
    elif revenue and earnings and not verified:
        margin_note = "No annual margin was reported; monetary metadata is unverified, so margin was not calculated."
    else:
        margin_note = "No validated annual margin or compatible revenue/earnings pair was available."
    profit = None
    if earnings and (amount := decimal_value(earnings.value)) is not None:
        profit = "profit" if amount > 0 else "loss" if amount < 0 else "break_even"
        claims.append(earnings.claim_id)
        earnings_growth = metric_for(row, "earnings_yoy_percent", period)
        if amount < 0 and earnings_growth and (change := percentage(earnings_growth.value)) is not None and change < -100:
            profit = "swung_to_loss"
            claims.append(earnings_growth.claim_id)
    if not period:
        notes.append("No shared annual revenue period; unlike years are not ranked.")
    elif not revenue:
        notes.append(f"No revenue statement for {period}.")
    if growth is None:
        notes.append(growth_note)
    if margin is None:
        notes.append(margin_note)
    symbol = company["symbol"]
    return dict(symbol=symbol, name=company["name"], industry=company.get("industry") or "Unclassified",
                revenue_growth_percent=f"{growth:+.2f}" if growth is not None else None,
                net_margin_percent=str(margin) if margin is not None else None, net_margin_origin=margin_origin,
                growth_note=growth_note, margin_note=margin_note, profit=profit,
                growth_rank=None, margin_rank=None, growth_rank_size=0, margin_rank_size=0,
                peer_group=False, peer_group_size=0, findings=activity.get(symbol, {}).get("findings", 0),
                activity_note=activity.get(symbol, {}).get("note"), claim_ids=list(dict.fromkeys(claims)),
                notes=notes, _growth=growth, _margin=margin, _basis=basis)


def build_comparison(brief, companies, perspective=None, activity=None):
    if len(companies) < 2:
        return None
    period = brief.period if brief else None
    rows = {r.symbol: r for r in brief.rows} if brief else {}
    entries = [entry_for(c, rows.get(c["symbol"]), period, activity or {}) for c in companies]
    ours = next((e for e in entries if e["symbol"] == perspective), None)
    groups = {}
    for entry in entries:
        groups.setdefault(industry_key(entry["industry"]), []).append(entry)
    focus = industry_key(ours["industry"]) if ours else max(groups, key=lambda key: len(groups[key]))
    peers = groups[focus]
    sector = peers[0]["industry"]
    for entry in entries:
        entry["peer_group"] = entry in peers
        entry["peer_group_size"] = len(peers)
        if entry not in peers:
            entry["notes"].append(f"Outside the {sector} peer group; shown for context, not ranked.")
    # Rank within a compatible reporting-basis group, not every ticker. Different
    # currencies may cancel in a verified ratio, but reporting bases may not.
    for field, rank_field, size_field in (("_growth", "growth_rank", "growth_rank_size"),
                                         ("_margin", "margin_rank", "margin_rank_size")):
        for entry in peers:
            if entry[field] is None or focus == "unclassified":
                continue
            eligible = [e for e in peers if e[field] is not None and e["_basis"] == entry["_basis"]]
            if len(eligible) >= 2:
                entry[rank_field] = 1 + sum(e[field] > entry[field] for e in eligible)
                entry[size_field] = len(eligible)
            else:
                entry["notes"].append("Too few peers with a compatible reporting basis to rank this ratio.")
    notes = ["Annual financial ratios are context, not an overall competitive score or proof of recent activity.",
             "Ranks compare same-sector companies on Sectors-reported annual figures; consolidated versus standalone "
             "reporting scope is not independently verified."]
    if perspective and not ours:
        notes.append(f"{perspective}: company perspective is absent from this investigation; no 'you versus them' ranking.")
    if not period:
        notes.append("No common annual revenue period is available; review individual cited statements instead.")
    if brief:
        notes.extend(brief.caveats)
    headline = headline_for(peers, ours, sector, period, entries)
    for entry in entries:
        for key in ("_growth", "_margin", "_basis"):
            entry.pop(key)
    return Comparison(period=period, perspective=perspective, sector=sector, headline=headline,
                      entries=entries, notes=list(dict.fromkeys(notes)))


def headline_for(peers, ours, sector, period, everyone=()):
    if not period:
        return "A like-for-like annual ranking is unavailable because the compared companies have no shared reporting year."
    if ours:
        parts = []
        for label, field, size, value in (("revenue growth", "growth_rank", "growth_rank_size", "revenue_growth_percent"),
                                          ("net margin", "margin_rank", "margin_rank_size", "net_margin_percent")):
            if ours[field]:
                parts.append(f"{ordinal(ours[field])} of {ours[size]} on {label} ({ours[value]}%)")
        if parts:
            return f"In {period}, {ours['symbol']} ranks {' and '.join(parts)} among the selected {sector} peers."
        others = [e["symbol"] for e in everyone if e is not ours]
        if len(peers) < 2:
            return (f"{ours['symbol']} has no same-sector peer among {', '.join(others)}, so the {period} figures "
                    "are shown side by side rather than ranked.")
        return f"{ours['symbol']} could not be ranked for {period}: the selected peers lack comparable annual figures."
    ranked = [e for e in peers if e["growth_rank"] or e["margin_rank"]]
    if not ranked:
        return f"A peer ranking for {period} is unavailable; the available annual evidence is not sufficiently comparable."
    return f"Compare {len(peers)} {sector} companies in {period} below; ranks use only peers with compatible reporting evidence."
