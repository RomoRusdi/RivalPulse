import base64
import json
from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.db import iso
from app.errors import AppError
from app.models import Company, Membership, Run, Signal, Source, Watchlist
from app.providers import digest


def owned(db, model, identifier):
    row = db.scalar(select(model).where(model.id == str(identifier), model.workspace_id == get_settings().workspace_id))
    if not row:
        raise AppError("NOT_FOUND", "Resource not found", 404)
    return row


def company_json(company):
    return {"id": company.id, "symbol": company.symbol, "ticker": company.symbol, "name": company.name,
            "industry": company.industry, "aliases": company.aliases, "official_domains": company.official_domains,
            "identity_verified_at": iso(company.identity_verified_at), "identity_reference": company.identity_reference,
            "comparison_note": company.comparison_note}


def members(db, watchlist_id):
    return db.scalars(select(Company).join(Membership).where(Membership.watchlist_id == watchlist_id,
                                                           Membership.active.is_(True)).order_by(Company.symbol)).all()


def watchlist_json(db, row):
    return {"id": row.id, "name": row.name, "objective": row.objective, "user_company": row.user_company,
            "companies": [company_json(c) for c in members(db, row.id)],
            "created_at": iso(row.created_at), "updated_at": iso(row.updated_at)}


def validate_companies(db, company_ids):
    ids = [str(c) for c in company_ids]
    found = db.scalars(select(Company).where(Company.id.in_(ids))).all()
    if not 2 <= len(ids) <= 5 or len(set(ids)) != len(ids) or len(found) != len(ids):
        raise AppError("INVALID_COMPANY", "Select 2–5 distinct companies from the catalog", 422)
    return ids


def replace_members(db, watchlist_id, ids):
    existing = {m.company_id: m for m in db.scalars(select(Membership).where(Membership.watchlist_id == watchlist_id))}
    for company_id, member in existing.items():
        member.active = company_id in ids
    for company_id in set(ids) - set(existing):
        db.add(Membership(watchlist_id=watchlist_id, company_id=company_id))


def create_run(db, body, key):
    settings = get_settings()
    if key is not None and (not key.strip() or len(key) > 128):
        raise AppError("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must contain 1–128 characters", 422)
    request_hash = digest({"body": body.model_dump(mode="json"), "mode": settings.mode})

    def prior_request():
        prior = db.scalar(select(Run).where(Run.workspace_id == settings.workspace_id, Run.idempotency_key == key))
        if prior and prior.request_hash != request_hash:
            raise AppError("IDEMPOTENCY_CONFLICT", "Idempotency key was used with different inputs", 409)
        return prior

    if key and (prior := prior_request()):
        return prior
    if settings.mode == "live" and not settings.sectors_api_key.get_secret_value().strip():
        raise AppError("PROVIDER_CREDENTIALS_MISSING", "Configure a private Sectors API key before starting research", 503)
    watchlist = owned(db, Watchlist, body.watchlist_id)
    # Serialize input freezing with membership edits on PostgreSQL.
    db.refresh(watchlist, with_for_update=True)
    companies = members(db, watchlist.id)
    validate_companies(db, [c.id for c in companies])
    if body.parent_signal_id:
        parent = owned(db, Signal, body.parent_signal_id)
        if parent.mode != settings.mode or parent.company_id not in {c.id for c in companies}:
            raise AppError("INVALID_PARENT_SIGNAL", "Parent signal must belong to the selected competitors and mode", 422)
    frozen = []
    for c in companies:
        # Oldest first, then by URL. Ordering by the random UUID alone made "the
        # first two approved pages" vary between runs; the clock can tie on
        # coarse-resolution platforms, so the unique URL is the final tiebreak.
        sources = db.scalars(select(Source).where(Source.company_id == c.id, Source.enabled.is_(True))
                             .order_by(Source.created_at, Source.url)).all()
        frozen.append({**company_json(c), "sources": [dict(id=s.id, url=s.url, domain=s.domain,
                                                        kind=s.kind, extraction=s.extraction) for s in sources]})
    baseline = db.scalar(select(Run).where(Run.watchlist_id == watchlist.id, Run.mode == settings.mode,
                                          Run.status.in_(["completed", "partial"])).order_by(Run.created_at.desc()).limit(1))
    row = Run(workspace_id=settings.workspace_id, watchlist_id=watchlist.id, idempotency_key=key,
              request_hash=request_hash, query=body.query or watchlist.objective, mode=settings.mode,
              baseline_id=baseline.id if baseline else None,
              inputs={"schema_version": 1, "companies": frozen, "query": body.query or watchlist.objective,
                      "parent_signal_id": str(body.parent_signal_id) if body.parent_signal_id else None,
                      "replay_scenario": settings.replay_scenario, "watchlist_name": watchlist.name})
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if key and (prior := prior_request()):
            return prior
        raise AppError("RUN_ALREADY_ACTIVE", "This watchlist already has an active investigation", 409) from None
    return row


def page(db, query, model, cursor, limit):
    if cursor:
        try:
            stamp, identifier = json.loads(base64.urlsafe_b64decode(cursor.encode() + b"=" * (-len(cursor) % 4)))
            timestamp = datetime.fromisoformat(stamp)
            if not isinstance(identifier, str):
                raise ValueError()
        except (ValueError, TypeError, json.JSONDecodeError):
            raise AppError("INVALID_CURSOR", "Invalid pagination cursor", 422) from None
        query = query.where(or_(model.created_at < timestamp,
                                and_(model.created_at == timestamp, model.id < identifier)))
    rows = list(db.scalars(query.order_by(model.created_at.desc(), model.id.desc()).limit(limit + 1)))
    more, rows = len(rows) > limit, rows[:limit]
    next_cursor = None
    if more:
        next_cursor = base64.urlsafe_b64encode(json.dumps([iso(rows[-1].created_at), rows[-1].id]).encode()).decode().rstrip("=")
    return rows, next_cursor
