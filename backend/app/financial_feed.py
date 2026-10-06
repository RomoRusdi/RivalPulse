"""Workspace-scoped, read-only annual revenue. Never calls a provider."""
import re
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel
from sqlalchemy import select

from app.config import get_settings
from app.db import iso
from app.errors import AppError
from app.models import Run, RunSnapshot, Snapshot
from app.providers import growth
from app.service import members, workspace_id


class RevenuePoint(BaseModel):
    year: int
    value: str | None
    currency: str | None
    unit: str
    basis: str
    sourceUrl: str
    fetchedAt: str
    snapshotId: str | None = None
    yoy: str | None = None
    index: str | None = None
    comparable: bool = False
    limitation: str | None = None


class RevenueCompany(BaseModel):
    ticker: str
    name: str
    note: str
    points: list[RevenuePoint]


class RevenueFeed(BaseModel):
    companies: list[RevenueCompany]
    baseYear: int | None
    absoluteAvailable: bool
    mode: str


class FinancialSourceFigure(BaseModel):
    metric: str
    period: str
    value: str
    currency: str | None
    unit: str
    basis: str


class FinancialSourceOut(BaseModel):
    id: str
    ticker: str
    name: str
    provider: str
    fetchedAt: str
    note: str
    points: list[RevenuePoint]
    figures: list[FinancialSourceFigure]


def verified(point):
    return bool(point['value'] is not None and point['currency'] and point['unit'] and point['basis']
                and not any(word in (point['unit'] + point['basis']).lower()
                            for word in ('unspecified', 'unverified', 'unknown')))


def same_basis(a, b):
    return all(a[key] == b[key] for key in ('currency', 'unit', 'basis'))


def report_points(snapshot, note):
    if not snapshot:
        return []
    groups = {}
    for metric in snapshot.normalized.get('metrics', []):
        if metric.get('metric') != 'revenue':
            continue
        try:
            year = int(metric['period'])
            amount = Decimal(metric['value'])
            if not 1900 <= year <= 2100 or not amount.is_finite():
                continue
        except (ValueError, TypeError, KeyError, InvalidOperation):
            continue
        point = dict(year=year, value=str(amount), currency=metric.get('currency'),
                     unit=metric.get('unit') or 'provider_native_unspecified',
                     basis=metric.get('comparison_basis') or 'reporting_scope_unverified',
                     sourceUrl=snapshot.url, fetchedAt=iso(snapshot.fetched_at), snapshotId=snapshot.id,
                     yoy=None, index=None, comparable=False, limitation=None)
        groups.setdefault(year, []).append(point)
    points = []
    previous = None
    break_years = {int(year) for year in re.findall(r'\b(20\d{2})\b', note)} if re.search(r'merger|scope change|acquisition', note, re.I) else set()
    for year, entries in sorted(groups.items()):
        point = entries[0]
        if any((entry['value'], entry['currency'], entry['unit'], entry['basis']) !=
               (point['value'], point['currency'], point['unit'], point['basis']) for entry in entries):
            point.update(value=None, limitation='Conflicting values in the same report; review the source.')
        elif Decimal(point['value']) < 0:
            point['limitation'] = 'Negative reported revenue requires source review.'
        elif not verified(point):
            point['limitation'] = 'Currency, units or reporting scope are unverified.'
        else:
            point['comparable'] = True
        boundary = (previous and any(previous['year'] < change <= year for change in break_years)
                    and 'restated' not in point['basis'].lower())
        if boundary:
            point['limitation'] = 'Reporting scope changed; growth across this boundary is unavailable.'
        if previous and previous['comparable'] and point['comparable'] and not boundary:
            def metric(p):
                return dict(metric='revenue', period=str(p['year']), value=p['value'], currency=p['currency'],
                            unit=p['unit'], comparison_basis=p['basis'])
            point['yoy'] = growth(metric(point), metric(previous))
        points.append(point)
        previous = point
    return points


def revenue_feed(db, watchlist):
    companies = members(db, watchlist.id)
    # Snapshots are shared internally; only expose reports linked to owned runs.
    snapshots = db.scalars(select(Snapshot).join(RunSnapshot).join(Run, Run.id == RunSnapshot.run_id)
                          .where(Run.workspace_id == workspace_id(db), Run.mode == get_settings().mode,
                                 Snapshot.mode == get_settings().mode,
                                 Snapshot.company_id.in_([company.id for company in companies]))
                          .order_by(Snapshot.fetched_at.desc(), Snapshot.id.desc())).unique().all()
    latest = {}
    for snapshot in snapshots:
        if any(metric.get('metric') == 'revenue' for metric in snapshot.normalized.get('metrics', [])):
            latest.setdefault(snapshot.company_id, snapshot)
    tracks = [dict(ticker=c.symbol, name=c.name, note=c.comparison_note,
                   points=report_points(latest.get(c.id), c.comparison_note)) for c in companies]
    segments = []
    for track in tracks:
        segment = []
        for point in track['points']:
            if not point['comparable']:
                segment = []
                continue
            if segment and (not same_basis(segment[-1], point) or point['limitation']):
                segment = []
            segment.append(point)
        if len(segment) >= 2:
            segments.append(segment)
    common = set.intersection(*(set(p['year'] for p in segment if Decimal(p['value']) > 0) for segment in segments)) if segments else set()
    base = next((year for year in sorted(common) if all(any(p['year'] > year for p in segment) for segment in segments)), None)
    if base is not None:
        for segment in segments:
            denominator = Decimal(next(p['value'] for p in segment if p['year'] == base))
            for point in segment:
                if point['year'] >= base:
                    try:
                        point['index'] = str((Decimal(point['value']) / denominator * 100).quantize(Decimal('0.01')))
                    except InvalidOperation:
                        point['limitation'] = 'The indexed value is outside the supported comparison range.'
    verified_points = [p for track in tracks for p in track['points'] if p['comparable']]
    absolute = bool(verified_points and len({(p['currency'], p['unit']) for p in verified_points}) == 1)
    return dict(companies=tracks, baseYear=base, absoluteAvailable=absolute, mode=get_settings().mode)


def financial_source(db, snapshot_id):
    from app.models import Company
    snapshot = db.scalar(select(Snapshot).join(RunSnapshot).join(Run, Run.id == RunSnapshot.run_id).where(
        Snapshot.id == str(snapshot_id), Run.workspace_id == workspace_id(db),
        Run.mode == get_settings().mode, Snapshot.mode == get_settings().mode).limit(1))
    if not snapshot:
        raise AppError("NOT_FOUND", "Financial evidence not found in this workspace", 404)
    company = db.get(Company, snapshot.company_id)
    points = report_points(snapshot, company.comparison_note)
    figures = []
    for metric in snapshot.normalized.get("metrics", [])[:1000]:
        try:
            year, value = int(metric["period"]), Decimal(metric["value"])
            if not 1900 <= year <= 2100 or not value.is_finite():
                continue
        except (ValueError, TypeError, KeyError, InvalidOperation):
            continue
        figures.append({"metric": metric["metric"], "period": str(year), "value": str(value),
                        "currency": metric.get("currency"), "unit": metric.get("unit") or "provider_native_unspecified",
                        "basis": metric.get("comparison_basis") or "reporting_scope_unverified"})
    if not figures:
        raise AppError("NOT_FOUND", "Annual financial evidence is unavailable", 404)
    return {"id": snapshot.id, "ticker": company.symbol, "name": company.name,
            "provider": "Sectors" if "api.sectors.app" in snapshot.url else "Stored research source",
            "fetchedAt": iso(snapshot.fetched_at), "points": points, "figures": figures, "note": company.comparison_note}
