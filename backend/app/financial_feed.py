"""Workspace-scoped, read-only annual revenue. Never calls a provider."""
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, Field
from sqlalchemy import select

from app.config import get_settings
from app.db import iso
from app.errors import AppError
from app.models import Run, RunSnapshot, RunStep, Snapshot
from app.financial_projection import PROJECTION_VERSION, known_metadata, project_snapshot, scope_boundary
from app.providers import growth
from app.service import members, workspace_id


class RevenuePoint(BaseModel):
    year: int
    value: str | None
    currency: str | None
    unit: str
    basis: str
    fetchedAt: str
    snapshotId: str | None = None
    yoy: str | None = None
    index: str | None = None
    comparable: bool = False
    limitation: str | None = None


class PerformanceMetric(BaseModel):
    metric: str
    value: str | None
    unit: str
    periodKind: str
    period: str | None
    origin: str
    currency: str | None
    basis: str
    snapshotId: str
    fetchedAt: str
    displayStatus: str
    comparisonStatus: str
    reasons: list[str]


class FinancialSourceFigure(BaseModel):
    metric: str
    period: str
    value: str
    currency: str | None
    unit: str
    basis: str


class CollectionStatus(BaseModel):
    status: str = "not_collected"
    code: str | None = None


class Freshness(BaseModel):
    fetchedAt: str | None = None
    status: str = "not_collected"


class CompanyProfile(BaseModel):
    industry: str
    website: str | None = None


class RevenueCompany(BaseModel):
    ticker: str
    name: str
    note: str
    points: list[RevenuePoint]
    annualFigures: list[FinancialSourceFigure] = Field(default_factory=list)
    performanceMetrics: list[PerformanceMetric] = Field(default_factory=list)
    snapshotId: str | None = None
    profile: CompanyProfile | None = None
    coverage: str = "not_collected"
    freshness: Freshness = Field(default_factory=Freshness)
    collectionStatus: CollectionStatus = Field(default_factory=CollectionStatus)


class ComparisonEligibility(BaseModel):
    indexedCompanies: list[str] = Field(default_factory=list)
    absoluteCompanies: list[str] = Field(default_factory=list)
    excludedCompanies: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)


class RevenueFeed(BaseModel):
    companies: list[RevenueCompany]
    baseYear: int | None
    absoluteAvailable: bool
    mode: str
    projectionVersion: int = PROJECTION_VERSION
    comparisonEligibility: ComparisonEligibility = Field(default_factory=ComparisonEligibility)


class FinancialSourceOut(BaseModel):
    id: str
    ticker: str
    name: str
    provider: str
    fetchedAt: str
    note: str
    freshness: Freshness = Field(default_factory=Freshness)
    points: list[RevenuePoint]
    figures: list[FinancialSourceFigure]
    performanceMetrics: list[PerformanceMetric] = Field(default_factory=list)


def verified(point):
    return point['value'] is not None and known_metadata(point['currency'], point['unit'], point['basis'])


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
        boundary = previous and scope_boundary(year, previous['year'], note, point['basis'])
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
                                 Snapshot.provider == 'sectors',
                                 Snapshot.company_id.in_([company.id for company in companies]))
                          .order_by(Snapshot.fetched_at.desc(), Snapshot.id.desc())).unique().all()
    latest, profiles = {}, {}
    for snapshot in snapshots:
        profiles.setdefault(snapshot.company_id, snapshot)
        figures, performance = project_snapshot(snapshot)
        if figures or performance:
            latest.setdefault(snapshot.company_id, snapshot)
    outcomes = {}
    steps = db.scalars(select(RunStep).join(Run, Run.id == RunStep.run_id).where(
        Run.workspace_id == workspace_id(db), Run.mode == get_settings().mode,
        Run.watchlist_id == watchlist.id, RunStep.stage.in_(['collect', 'recover']),
    ).order_by(Run.created_at.desc(), Run.id.desc(), RunStep.sequence.desc()).limit(1000)).all()
    for step in steps:
        for entry in reversed((step.details or {}).get('coverage', [])):
            if entry.get('tool') == 'get_company_metrics':
                for company_id in entry.get('company_ids', []):
                    outcomes.setdefault(company_id, dict(status=entry.get('status', 'not_collected'), code=entry.get('code')))
    tracks = []
    from app.db import utcnow
    from datetime import timezone
    for company in companies:
        snapshot = latest.get(company.id)
        profile_snapshot = snapshot or profiles.get(company.id)
        figures, performance = project_snapshot(snapshot, company.comparison_note)
        points = report_points(snapshot, company.comparison_note)
        overview = (profile_snapshot.normalized or {}).get('overview', {}) if profile_snapshot else {}
        overview = overview if isinstance(overview, dict) else {}
        stale = bool(snapshot and (utcnow() - snapshot.fetched_at.replace(tzinfo=timezone.utc)).total_seconds()
                     > get_settings().cache_seconds)
        tracks.append(dict(ticker=company.symbol, name=company.name, note=company.comparison_note, points=points,
                           annualFigures=figures, performanceMetrics=performance,
                           snapshotId=profile_snapshot.id if profile_snapshot else None,
                           profile=dict(industry=company.industry, website=overview.get('website')
                                        if isinstance(overview.get('website'), str) else None),
                           coverage=('as_reported' if any(not verified(p) for p in points) else 'available')
                           if figures or performance else ('profile_only' if profile_snapshot else 'not_collected'),
                           freshness=dict(fetchedAt=iso(profile_snapshot.fetched_at) if profile_snapshot else None,
                                          status='historical' if stale else 'stored' if profile_snapshot else 'not_collected'),
                           collectionStatus=outcomes.get(company.id, dict(status='ok' if profile_snapshot else 'not_collected', code=None))))
    mixed_industries = len({company.industry for company in companies}) > 1
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
    if mixed_industries:
        base = None
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
    absolute = bool(not mixed_industries and verified_points and
                    len({(p['currency'], p['unit'], p['basis']) for p in verified_points}) == 1)
    indexed = [t['ticker'] for t in tracks if any(p['index'] is not None for p in t['points'])]
    absolute_companies = [t['ticker'] for t in tracks if absolute and any(p['comparable'] for p in t['points'])]
    included = set(indexed + absolute_companies)
    return dict(companies=tracks, baseYear=base, absoluteAvailable=absolute, mode=get_settings().mode,
                projectionVersion=PROJECTION_VERSION,
                comparisonEligibility=dict(indexedCompanies=indexed, absoluteCompanies=absolute_companies,
                                           excludedCompanies=[t['ticker'] for t in tracks if t['ticker'] not in included],
                                           reasons=['mixed_business_definitions'] if mixed_industries else
                                           ['metadata_or_periods_unverified'] if not included else []))


def financial_source(db, snapshot_id):
    from datetime import timezone
    from app.db import utcnow
    from app.models import Company
    snapshot = db.scalar(select(Snapshot).join(RunSnapshot).join(Run, Run.id == RunSnapshot.run_id).where(
        Snapshot.id == str(snapshot_id), Run.workspace_id == workspace_id(db),
        Run.mode == get_settings().mode, Snapshot.mode == get_settings().mode).limit(1))
    if not snapshot:
        raise AppError("NOT_FOUND", "Financial evidence not found in this workspace", 404)
    company = db.get(Company, snapshot.company_id)
    points = report_points(snapshot, company.comparison_note)
    figures, performance = project_snapshot(snapshot, company.comparison_note)
    if not figures and not performance:
        raise AppError("NOT_FOUND", "Financial evidence is unavailable", 404)
    return {"id": snapshot.id, "ticker": company.symbol, "name": company.name,
            "provider": "Sectors" if "api.sectors.app" in snapshot.url else "Stored research source",
            "fetchedAt": iso(snapshot.fetched_at),
            "freshness": {"fetchedAt": iso(snapshot.fetched_at), "status": "historical" if
                          (utcnow() - snapshot.fetched_at.replace(tzinfo=timezone.utc)).total_seconds()
                          > get_settings().cache_seconds else "stored"},
            "points": points, "figures": figures,
            "performanceMetrics": performance, "note": company.comparison_note}
