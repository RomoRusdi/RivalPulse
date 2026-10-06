"""Workspace allowance, capped by the provider reserve. All amounts are credits."""
from sqlalchemy import func, select

from app.config import get_settings
from app.models import CreditAccount, Run, WorkspaceCredit


def workspace_balance(db, workspace):
    row = db.get(WorkspaceCredit, workspace)
    if row:
        return row.total, row.used
    return get_settings().workspace_credit_total, db.scalar(select(func.coalesce(func.sum(Run.credits), 0)).where(Run.workspace_id == workspace))


def ensure_balance(db, workspace):
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    total, used = workspace_balance(db, workspace)
    insert = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
    db.execute(insert(WorkspaceCredit).values(workspace_id=workspace, total=total, used=used).on_conflict_do_nothing())


def allowance(db, workspace):
    settings = get_settings()
    total, used = workspace_balance(db, workspace)
    provider = db.get(CreditAccount, "sectors")
    capacity = max(0, settings.credit_total - settings.credit_reserve - (provider.used if provider else 0))
    remaining = max(0, total - used)
    available = min(remaining, capacity)
    return {"used": used, "total": total, "remaining": remaining, "available": available,
            "availablePercent": round(100 * available / total, 1) if total > 0 else 0,
            "providerLimited": available < remaining, "unit": "research credits", "scope": "workspace"}
