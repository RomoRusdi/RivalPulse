"""Read-only, workspace-scoped finding browse queries. Never calls a provider."""
import base64
import json
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select

from app.compat import signal_json
from app.db import iso, utcnow
from app.errors import AppError
from app.models import Company, Revision, Signal

CATEGORIES = ("Pricing", "Product", "Partnership", "Campaign", "Financial update", "Analyst commentary", "Market context")
COLORS = ("#146C50", "#087F78", "#6950A1", "#B13F67", "#536778", "#766546", "#66756D")


class FindingSummary(BaseModel):
    total: int
    filtered: int
    companies: int
    mix: list[dict]


class FindingFeed(BaseModel):
    items: list[dict]
    nextCursor: str | None
    summary: FindingSummary


def bounds(period, start, end, zone):
    try:
        tz = ZoneInfo(zone)
    except (ValueError, ZoneInfoNotFoundError):
        raise AppError("INVALID_TIMEZONE", "Choose a valid timezone", 422) from None
    today = utcnow().astimezone(tz).date()
    if period == "custom":
        if not start or not end or start > end:
            raise AppError("INVALID_DATE_RANGE", "Choose a start date on or before the end date", 422)
    elif period != "all":
        end = today
        start = today - timedelta(days={"today": 0, "week": 6, "month": 29}[period])
    else:
        return None, None
    if end == date.max:
        raise AppError("INVALID_DATE_RANGE", "Choose an earlier end date", 422)
    return (datetime.combine(start, time.min, tz).astimezone(timezone.utc),
            datetime.combine(end + timedelta(days=1), time.min, tz).astimezone(timezone.utc))


def finding_page(db, statement, *, period="month", start=None, end=None, zone="UTC",
                 company=None, category=None, cursor=None, limit=20):
    lower, upper = bounds(period, start, end, zone)
    if lower:
        statement = statement.where(Signal.first_seen_at >= lower, Signal.first_seen_at < upper)
    if company:
        statement = statement.join(Company, Company.id == Signal.company_id).where(Company.symbol == company)
    distribution = db.execute(statement.with_only_columns(Signal.type, func.count())
                              .group_by(Signal.type)).all()
    counts = dict(distribution)
    total = sum(counts.values())
    represented = db.scalar(statement.with_only_columns(func.count(func.distinct(Signal.company_id)))) or 0
    if category:
        statement = statement.where(Signal.type == category)
    filtered = db.scalar(statement.with_only_columns(func.count(), maintain_column_froms=True)) or 0
    if cursor:
        try:
            stamp, identity = json.loads(base64.urlsafe_b64decode(cursor.encode()))
            if not isinstance(stamp, str) or not isinstance(identity, str):
                raise ValueError()
            added = datetime.fromisoformat(stamp)
            if added.tzinfo is None:
                raise ValueError()
            added = added.astimezone(timezone.utc)
            UUID(identity)
        except (ValueError, TypeError, json.JSONDecodeError):
            raise AppError("INVALID_CURSOR", "Reload the findings and try again", 422) from None
        statement = statement.where(or_(Signal.first_seen_at < added,
                                       and_(Signal.first_seen_at == added, Signal.id < identity)))
    rows = db.scalars(statement.order_by(Signal.first_seen_at.desc(), Signal.id.desc()).limit(limit + 1)).all()
    more, rows = len(rows) > limit, rows[:limit]
    items = []
    for row in rows:
        card = db.scalar(select(Revision).where(Revision.signal_id == row.id)
                         .order_by(Revision.created_at.desc(), Revision.id.desc()).limit(1)).card
        item = signal_json(card)
        item["addedAt"] = iso(row.first_seen_at)
        items.append(item)
    next_cursor = None
    if more:
        next_cursor = base64.urlsafe_b64encode(json.dumps([iso(rows[-1].first_seen_at), rows[-1].id]).encode()).decode()
    return {"items": items, "nextCursor": next_cursor,
            "summary": {"total": total, "filtered": filtered, "companies": represented,
                        "mix": [{"label": kind, "count": counts.get(kind, 0),
                                 "percent": 100 * counts.get(kind, 0) / total if total else 0,
                                 "color": color} for kind, color in zip(CATEGORIES, COLORS)]}}
