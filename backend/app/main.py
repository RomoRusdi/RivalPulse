import asyncio
import base64
import hmac
import json
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.security import HTTPBearer
from pydantic import Field
from sqlalchemy import delete, exists, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException

from app import auth, chat as conversation, jobs
from app.alerts import status as alert_status
from app.allowance import allowance
from app.compat import run_json as legacy_run, signal_json as legacy_signal
from app.finding_projection import project_signal_card
from app.classify import CONTEXT_CATEGORIES
from app.brief_projection import project_run_result
from app.config import get_settings
from app.contracts import ConversationSync, ErrorBody, LegacyRunCreate, LegacyWatchlistUpdate, RunAccepted, RunCreate, Strict, WatchlistCreate, WatchlistPatch
from app.contracts import ChatReply, ChatRequest, CompanyOut, Page, WatchlistOut
from app.public_evidence import PublicRunDetail as RunDetail, PublicSignalCard as SignalCard, PublicSignalDetail as SignalDetail
from app.public_evidence import public_payload
from app.db import get_db, iso, migration_heads, session, uid, utcnow
from app.errors import AppError
from app.finding_feed import CATEGORIES, COLORS, FindingFeed, finding_page
from app.financial_feed import FinancialSourceOut, RevenueFeed, financial_source, revenue_feed
from app.logging_config import configure_logging
from app.data_keys import SectorsKeyUpdate
from app.llm_settings import LLMUpdate, ModelListRequest
from app.models import Company, Conversation, Membership, Revision, Run, RunSnapshot, RunStep, Signal, Watchlist, WorkspaceMembership
from app.service import company_json, create_run, owned, page, replace_members, validate_companies, watchlist_json, workspace_id


@asynccontextmanager
async def lifespan(app):
    configure_logging()
    yield


settings = get_settings()
app = FastAPI(title="RivalPulse", version="0.1.0", lifespan=lifespan,
              description="Private competitive intelligence backed by Sectors v2. Replay data is for tests only.",
              responses={400: {"model": ErrorBody}, 401: {"model": ErrorBody}, 409: {"model": ErrorBody},
                         422: {"model": ErrorBody}, 503: {"model": ErrorBody}})
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-CSRF-Token", "X-Tab-Session"], expose_headers=["X-Request-ID"])


@app.middleware("http")
async def context_and_limits(request, call_next):
    request.state.request_id = uid()
    if request.method in ("POST", "PATCH", "PUT"):
        size = 0
        body = bytearray()
        async for chunk in request.stream():
            size += len(chunk)
            if size > 32_768:
                return error_response(request, AppError("REQUEST_TOO_LARGE", "Request exceeds 32 KiB", 413))
            body.extend(chunk)
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def error_response(request, exc):
    # Cookie sessions use the app's login page. A Basic challenge on a fetch
    # response opens the browser's native password dialog before the UI can
    # handle the 401. Explicit demo API clients can still use bearer tokens.
    headers = {"WWW-Authenticate": 'Bearer realm="RivalPulse"'} if (
        exc.status == 401 and get_settings().auth_mode == "demo"
    ) else None
    return JSONResponse(status_code=exc.status, headers=headers, content={"code": exc.code, "message": exc.message,
                         "retryable": exc.retryable, "request_id": getattr(request.state, "request_id", uid())})


@app.exception_handler(AppError)
async def app_error(request, exc):
    return error_response(request, exc)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return error_response(request, AppError("VALIDATION_ERROR", "Request fields are invalid", 422))


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return error_response(request, AppError("HTTP_ERROR", "Request could not be processed", exc.status_code))


@app.exception_handler(Exception)
async def internal_error(request, exc):
    return error_response(request, AppError("INTERNAL_ERROR", "Unexpected server error", 500, True))


bearer = HTTPBearer(auto_error=False)


def access(request: Request, db=Depends(get_db), credentials=Depends(bearer)):
    if get_settings().auth_mode == "accounts":
        return auth.authenticate(request, db)
    db.info["workspace_id"] = get_settings().workspace_id
    expected = get_settings().demo_access_token.get_secret_value()
    if len(expected) < 16:
        raise AppError("ACCESS_NOT_CONFIGURED", "Set a demo access token of at least 16 characters", 503)
    token = request.cookies.get("rivalpulse_demo", "")
    authorization = request.headers.get("authorization", "")
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    elif authorization.startswith("Basic "):
        try:
            token = base64.b64decode(authorization[6:], validate=True).decode().split(":", 1)[1]
        except (ValueError, IndexError, UnicodeDecodeError):
            token = ""
    if not hmac.compare_digest(token.encode(), expected.encode()):
        raise AppError("UNAUTHORIZED", "Private demo authentication required", 401)
    if request.method in ("POST", "PATCH", "DELETE") and token == request.cookies.get("rivalpulse_demo"):
        origin = request.headers.get("origin")
        same_origin = str(request.base_url).rstrip("/")
        if origin and origin not in [same_origin, *get_settings().cors_origins]:
            raise AppError("ORIGIN_REJECTED", "Request origin not allowed", 403)


class Login(Strict):
    token: str = Field(min_length=16, max_length=256)


class AlertStatus(Strict):
    enabled: bool
    provider: str
    recipient: str | None
    minimum_severity: Literal["medium", "high"]
    delivery_policy: str


@app.get("/demo/login", response_class=HTMLResponse, include_in_schema=False)
def login_page():
    if get_settings().auth_mode != "demo":
        raise AppError("DEMO_DISABLED", "Use account login", 404)
    return """<!doctype html><html><meta charset="utf-8"><title>RivalPulse private demo</title>
    <body><h1>RivalPulse private demo</h1><form id="login"><label>Access token
    <input id="token" type="password" autocomplete="current-password" required></label><button>Sign in</button></form>
    <p id="status"></p><script>document.querySelector('#login').onsubmit=async e=>{e.preventDefault();
    const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:document.querySelector('#token').value})});
    document.querySelector('#status').textContent=r.ok?'Signed in. Open the dashboard.':'Access denied.';
    document.querySelector('#token').value='';};</script></body></html>"""


@app.post("/demo/login", status_code=204)
def login(body: Login, request: Request):
    if get_settings().auth_mode != "demo":
        raise AppError("DEMO_DISABLED", "Use account login", 404)
    expected = get_settings().demo_access_token.get_secret_value()
    if len(expected) < 16 or not hmac.compare_digest(body.token.encode(), expected.encode()):
        raise AppError("UNAUTHORIZED", "Access denied", 401)
    response = Response(status_code=204)
    response.set_cookie("rivalpulse_demo", expected, httponly=True, secure=request.url.scheme == "https",
                        samesite="strict", max_age=8 * 3600)
    return response


@app.post("/demo/logout", status_code=204)
def logout(request: Request):
    if get_settings().auth_mode != "demo":
        raise AppError("DEMO_DISABLED", "Use account logout", 404)
    # A cross-site POST must not clear another site's demo cookie.
    origin = request.headers.get("origin")
    if origin and origin != str(request.base_url).rstrip("/"):
        raise AppError("ORIGIN_REJECTED", "Request origin not allowed", 403)
    response = Response(status_code=204)
    response.delete_cookie("rivalpulse_demo", path="/", samesite="strict")
    return response


router = APIRouter(prefix="/api/v1", dependencies=[Depends(access)])


def llm_owner(db, identity):
    if get_settings().auth_mode == "demo":
        return True
    membership = db.get(WorkspaceMembership, (identity[1].id, workspace_id(db)))
    return bool(membership and membership.permission == "owner")


@router.get("/settings/llm", tags=["settings"])
def get_llm_settings(db: Annotated[object, Depends(get_db)], identity=Depends(access)):
    from app.llm_settings import settings_view
    return settings_view(db, workspace_id(db), llm_owner(db, identity))


@router.patch("/settings/llm", tags=["settings"])
def patch_llm_settings(body: LLMUpdate, db: Annotated[object, Depends(get_db)], identity=Depends(access)):
    from app.llm_settings import save
    if not llm_owner(db, identity):
        raise AppError("FORBIDDEN", "Only workspace owners can change model settings", 403)
    return save(db, workspace_id(db), body)


@router.post("/settings/llm/models", tags=["settings"])
def list_llm_models(body: ModelListRequest, db: Annotated[object, Depends(get_db)], identity=Depends(access)):
    """Connect step: one read-only provider request; nothing is saved or generated."""
    from app.llm_settings import models_view
    if not llm_owner(db, identity):
        raise AppError("FORBIDDEN", "Only workspace owners can connect model providers", 403)
    return models_view(db, workspace_id(db), body)


@router.get("/settings/sectors", tags=["settings"])
def get_sectors_settings(db: Annotated[object, Depends(get_db)], identity=Depends(access)):
    from app.data_keys import view
    return view(db, workspace_id(db), llm_owner(db, identity))


@router.put("/settings/sectors", tags=["settings"])
def put_sectors_key(body: SectorsKeyUpdate, db: Annotated[object, Depends(get_db)], identity=Depends(access)):
    """Stores the key encrypted. No request is sent to Sectors."""
    from app.data_keys import save
    if not llm_owner(db, identity):
        raise AppError("FORBIDDEN", "Only workspace owners can connect a data source", 403)
    return save(db, workspace_id(db), body)


@router.delete("/settings/sectors/key", tags=["settings"])
def delete_sectors_key(db: Annotated[object, Depends(get_db)], identity=Depends(access)):
    from app.data_keys import remove
    if not llm_owner(db, identity):
        raise AppError("FORBIDDEN", "Only workspace owners can remove a data source key", 403)
    return remove(db, workspace_id(db))


@router.delete("/settings/llm/keys/{provider}", tags=["settings"])
def delete_llm_key(provider: Literal["openai", "anthropic", "gemini"], db: Annotated[object, Depends(get_db)], identity=Depends(access)):
    from app.llm_settings import remove_key
    if not llm_owner(db, identity):
        raise AppError("FORBIDDEN", "Only workspace owners can remove model credentials", 403)
    return remove_key(db, workspace_id(db), provider)
DB = Annotated[object, Depends(get_db)]
Limit = Annotated[int, Query(ge=1, le=100)]


@app.get("/api/v1/health/live", tags=["health"])
def live():
    return {"status": "ok", "mode": get_settings().mode}


@app.get("/api/v1/health/ready", tags=["health"])
def ready(db: DB):
    try:
        revisions = set(db.scalars(text("SELECT version_num FROM alembic_version")))
        if not revisions or revisions != migration_heads():
            raise ValueError()
        from app.providers import redis_connection
        redis_connection().ping()
        if get_settings().auth_mode == "demo" and len(get_settings().demo_access_token.get_secret_value()) < 16:
            raise ValueError()
    except Exception:
        raise AppError("NOT_READY", "Database, migration, Redis or access configuration is not ready", 503, True) from None
    # No server Sectors key is not "not ready": workspaces can connect their own.
    return {"status": "ready", "mode": get_settings().mode,
            "server_sectors_key": bool(get_settings().sectors_api_key.get_secret_value().strip())}


@router.get("/alerts/status", tags=["alerts"], response_model=AlertStatus)
def alerts_status(db: DB):
    return alert_status(workspace_id(db))


def conversation_json(row, db=None, run_views=None):
    messages = public_payload(row.messages)
    if db is not None:
        cache = run_views if run_views is not None else {}
        for message in messages:
            run_data = message.get("run")
            if not run_data:
                continue
            run_id = run_data.get("id")
            if not run_id:
                continue  # Legacy archives without a run ID remain sanitized and readable.
            if run_id not in cache:
                run = db.get(Run, run_id)
                cache[run_id] = (legacy_run(db, run) if run.workspace_id == row.workspace_id else False) if run else None
            if isinstance(cache[run_id], dict):
                message["run"] = cache[run_id]
            elif cache[run_id] is False:
                message.pop("run", None)
    return {"id": row.id, "title": row.title, "createdAt": iso(row.created_at),
            "updatedAt": iso(row.updated_at), "messages": public_payload(messages)}


@router.get("/session", tags=["auth"])
def current_session():
    return {"authenticated": True, "mode": "accounts" if get_settings().auth_mode == "accounts" else "private-demo"}


@router.post("/chat", tags=["agent"], response_model=ChatReply)
def chat_reply(body: ChatRequest, db: DB):
    """Conversation only: no provider calls, no credits, no research run."""
    text, source, language = conversation.reply(
        db, body.message, [turn.model_dump() for turn in body.history], saved=body.saved, symbols=body.symbols)
    return {"reply": text, "source": source, "language": language}


@router.get("/conversations", tags=["agent"])
def conversations(db: DB):
    rows = db.scalars(select(Conversation).where(
        Conversation.workspace_id == workspace_id(db)
    ).order_by(Conversation.updated_at.desc()).limit(30)).all()
    # Resolve current read-only evidence projections, rather than stale run
    # copies embedded in a transcript. This never starts or rewrites research.
    run_views = {}
    return [conversation_json(row, db, run_views) for row in rows]


@router.post("/conversations", tags=["agent"])
def sync_conversation(body: ConversationSync, db: DB):
    row = db.scalar(select(Conversation).where(
        Conversation.id == str(body.id), Conversation.workspace_id == workspace_id(db)))
    messages = [message.model_dump(mode="json", by_alias=True, exclude_none=True) for message in body.messages]
    existing = {message.get("id"): message for message in (row.messages if row else [])}
    for message in messages:
        run_data = message.get("run")
        if run_data:
            run = owned(db, Run, run_data.get("id", ""))
            previous_run = (existing.get(message.get("id"), {}).get("run") or {})
            # Frozen embedded copies are archives, not caches to overwrite on
            # refresh. GET resolves the latest read-only view independently.
            message["run"] = previous_run if previous_run.get("id") == run.id else legacy_run(db, run)
    if row:
        # An old browser tab must not overwrite a more recent saved transcript.
        if body.updated_at.replace(tzinfo=utcnow().tzinfo) < row.updated_at.replace(tzinfo=utcnow().tzinfo):
            raise AppError("CONVERSATION_STALE", "Reload this conversation before saving changes", 409)
        row.title, row.messages, row.updated_at = body.title, messages, body.updated_at
    else:
        row = Conversation(id=str(body.id), workspace_id=workspace_id(db), title=body.title,
                           messages=messages, created_at=body.created_at, updated_at=body.updated_at)
        db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError("CONVERSATION_CONFLICT", "Conversation cannot be saved", 409) from None
    return conversation_json(row, db)


@router.delete("/conversations", tags=["agent"], status_code=204)
def clear_conversations(db: DB):
    # Chat transcripts only; stored investigations and immutable evidence are
    # not removed. Workspace scoping is enforced by the database predicate.
    db.execute(delete(Conversation).where(Conversation.workspace_id == workspace_id(db)))
    db.commit()
    return Response(status_code=204)


@router.delete("/conversations/{conversation_id}", tags=["agent"], status_code=204)
def delete_conversation(conversation_id: UUID, db: DB):
    row = owned(db, Conversation, conversation_id)
    db.delete(row)
    db.commit()
    return Response(status_code=204)


@router.get("/companies", tags=["companies"], response_model=Page[CompanyOut])
def companies(db: DB, query: str = Query("", max_length=100), cursor: str | None = None, limit: Limit = 20):
    term = query.replace("%", "\\%").replace("_", "\\_")
    statement = select(Company).where(or_(Company.symbol.ilike(f"%{term}%", escape="\\"),
                                         Company.name.ilike(f"%{term}%", escape="\\")))
    rows, next_cursor = page(db, statement, Company, cursor, limit)
    return {"items": [company_json(c) for c in rows], "next_cursor": next_cursor}


@router.post("/watchlists", status_code=201, tags=["watchlists"], response_model=WatchlistOut)
def create_watchlist(body: WatchlistCreate, db: DB):
    ids = validate_companies(db, body.company_ids)
    row = Watchlist(workspace_id=workspace_id(db), **body.model_dump(exclude={"company_ids"}))
    db.add(row)
    db.flush()
    replace_members(db, row.id, ids)
    db.commit()
    return watchlist_json(db, row)


@router.get("/watchlists", tags=["watchlists"], response_model=Page[WatchlistOut])
def watchlists(db: DB, cursor: str | None = None, limit: Limit = 20):
    rows, next_cursor = page(db, select(Watchlist).where(Watchlist.workspace_id == workspace_id(db)),
                             Watchlist, cursor, limit)
    return {"items": [watchlist_json(db, row) for row in rows], "next_cursor": next_cursor}


@router.get("/watchlists/{watchlist_id}", tags=["watchlists"], response_model=WatchlistOut)
def get_watchlist(watchlist_id: UUID, db: DB):
    return watchlist_json(db, owned(db, Watchlist, watchlist_id))


@router.get("/watchlists/{watchlist_id}/financials", tags=["watchlists"], response_model=RevenueFeed)
def watchlist_financials(watchlist_id: UUID, db: DB):
    return revenue_feed(db, owned(db, Watchlist, watchlist_id))


@router.get("/financial-sources/{snapshot_id}", tags=["watchlists"], response_model=FinancialSourceOut)
def financial_evidence(snapshot_id: UUID, db: DB):
    return financial_source(db, snapshot_id)


@router.patch("/watchlists/{watchlist_id}", tags=["watchlists"], response_model=WatchlistOut)
def patch_watchlist(watchlist_id: UUID, body: WatchlistPatch, db: DB):
    row = owned(db, Watchlist, watchlist_id)
    db.refresh(row, with_for_update=True)
    for key, value in body.model_dump(exclude_unset=True).items():
        if key == "company_ids":
            replace_members(db, row.id, validate_companies(db, value))
        else:
            setattr(row, key, value)
    row.updated_at = utcnow()
    db.commit()
    return watchlist_json(db, row)


@router.post("/research-runs", status_code=202, response_model=RunAccepted, tags=["research"])
def submit_run(body: RunCreate, db: DB, background: BackgroundTasks, idempotency_key: str | None = Header(None)):
    run = create_run(db, body, idempotency_key)
    if run.status == "queued":
        background.add_task(jobs.enqueue, run.id)
    return {"id": run.id, "status": run.status, "mode": run.mode, "status_url": f"/api/v1/research-runs/{run.id}"}


def run_detail(db, run):
    steps = db.scalars(select(RunStep).where(RunStep.run_id == run.id).order_by(RunStep.attempt, RunStep.sequence)).all()
    return {"id": run.id, "watchlist_id": run.watchlist_id, "mode": run.mode, "status": run.status,
            "stage": run.stage, "query": run.query, "created_at": iso(run.created_at), "started_at": iso(run.started_at),
            "finished_at": iso(run.finished_at), "heartbeat_at": iso(run.heartbeat_at), "attempts": run.attempts,
            "estimated_credits": run.credits, "external_calls": run.external_calls, "llm_calls": run.llm_calls,
            "inputs": run.inputs, "plan": run.plan, "error_code": run.error_code, "result": project_run_result(db, run),
            "progress": [{"stage": s.stage, "sequence": s.sequence, "attempt": s.attempt, "status": s.status,
                          "message": s.message, "details": s.details, "duration_ms": s.duration_ms} for s in steps]}


@router.get("/research-runs/{run_id}", tags=["research"], response_model=RunDetail)
def get_run(run_id: UUID, db: DB):
    return run_detail(db, owned(db, Run, run_id))


@router.get("/watchlists/{watchlist_id}/research-runs", tags=["research"], response_model=Page[RunDetail])
def history(watchlist_id: UUID, db: DB, cursor: str | None = None, limit: Limit = 20):
    owned(db, Watchlist, watchlist_id)
    rows, next_cursor = page(db, select(Run).where(Run.watchlist_id == str(watchlist_id),
                                                 Run.workspace_id == workspace_id(db)), Run, cursor, limit)
    return {"items": [run_detail(db, r) for r in rows], "next_cursor": next_cursor}


def latest_revision(db, signal):
    return db.scalar(select(Revision).where(Revision.signal_id == signal.id)
                     .order_by(Revision.created_at.desc(), Revision.id.desc()).limit(1))


def signal_query(db, watchlist_id=None, severity=None, mode=None):
    latest_id = select(Revision.id).where(Revision.signal_id == Signal.id).order_by(
        Revision.created_at.desc(), Revision.id.desc()).limit(1).correlate(Signal).scalar_subquery()
    query = select(Signal).join(Revision, Revision.id == latest_id).where(
        Signal.workspace_id == workspace_id(db), Signal.mode == (mode or get_settings().mode))
    if watchlist_id:
        owned(db, Watchlist, watchlist_id)
        query = query.where(exists(select(Membership.company_id).where(Membership.watchlist_id == str(watchlist_id),
                                                                      Membership.company_id == Signal.company_id,
                                                                      Membership.active.is_(True))))
    if severity:
        query = query.where(or_(Revision.severity == "low", Signal.type.in_(CONTEXT_CATEGORIES))) if severity == "low" else query.where(
            Revision.severity == severity, Signal.type.not_in(CONTEXT_CATEGORIES))
    return query


@router.get("/signals", tags=["signals"], response_model=Page[SignalCard])
def signals(db: DB, watchlist_id: UUID | None = None, severity: Literal["low", "medium", "high"] | None = None,
            mode: Literal["live", "replay"] | None = None, cursor: str | None = None, limit: Limit = 20):
    rows, next_cursor = page(db, signal_query(db, watchlist_id, severity, mode), Signal, cursor, limit)
    return {"items": [project_signal_card(latest_revision(db, s).card) for s in rows], "next_cursor": next_cursor}


@router.get("/signals/{signal_id}", tags=["signals"], response_model=SignalDetail)
def signal_detail(signal_id: UUID, db: DB):
    signal = owned(db, Signal, signal_id)
    revisions = db.scalars(select(Revision).where(Revision.signal_id == signal.id).order_by(Revision.created_at.desc())).all()
    return {"signal": project_signal_card(revisions[0].card), "revisions": [r.card for r in revisions],
            "first_seen_at": iso(signal.first_seen_at), "last_seen_at": iso(signal.last_seen_at)}


app.include_router(auth.router)
app.include_router(router)
compat = APIRouter(dependencies=[Depends(access)], tags=["frontend compatibility"])


def default_watchlist(db):
    row = db.scalar(select(Watchlist).where(Watchlist.workspace_id == workspace_id(db)).order_by(Watchlist.created_at))
    if not row:
        raise AppError("WATCHLIST_REQUIRED", "Create a watchlist first or run the seed command", 409)
    return row


@compat.get("/dashboard")
def dashboard(db: DB, range: Literal["week", "month"] = "week"):
    wl = default_watchlist(db)
    rows = db.scalars(signal_query(db, wl.id).where(Signal.last_seen_at >= utcnow() - timedelta(days=7 if range == "week" else 30))).all()
    cards = [project_signal_card(latest_revision(db, s).card) for s in rows]
    projected = [legacy_signal(c) for c in cards]
    count = len(cards)
    kinds = CATEGORIES
    mix = [{"label": kind, "count": sum(c["type"] == kind for c in cards),
            "percent": 100 * sum(c["type"] == kind for c in cards) / count if count else 0,
            "color": COLORS[i]} for i, kind in enumerate(kinds)]
    last = db.scalar(select(Run).where(Run.workspace_id == workspace_id(db),
                                      Run.mode == get_settings().mode).order_by(Run.created_at.desc()).limit(1))
    link_query = select(func.count()).select_from(RunSnapshot).join(Run).where(
        Run.workspace_id == workspace_id(db), Run.mode == get_settings().mode)
    total_links = db.scalar(link_query) or 0
    cache_hits = db.scalar(link_query.where(RunSnapshot.outcome == "cached")) or 0
    watchlist = watchlist_json(db, wl)
    return {"watchlist": watchlist, "signals": projected, "mode": get_settings().mode,
            "aggregates": {"companiesTracked": len(watchlist["companies"]), "signalsInRange": count,
                           "highSeverityCount": sum(c["severity"] == "high" for c in cards),
                           "credits": {**allowance(db, workspace_id(db)),
                                       "cacheHitRate": cache_hits / total_links if total_links else 0},
                           "pipeline": [{"label": "Stored signals", "count": count, "percent": 100 if count else 0,
                                         "tone": "accent"}], "mix": mix, "mixTotal": count,
                           "interpretation": {"body": "Cited observations and explicitly uncertain interpretations.",
                                              "counts": {"facts": sum(len(c["facts"]) for c in cards),
                                                         "observedSignals": sum(len(c["observed_signals"]) for c in cards),
                                                         "hypotheses": sum(len(c["hypotheses"]) for c in cards)}},
                           "lastRunAt": iso(last.created_at) if last else ""}}


@compat.get("/findings", response_model=FindingFeed)
def findings(db: DB, period: Literal["today", "week", "month", "all", "custom"] = "month",
             start: date | None = None, end: date | None = None, timezone: str = Query("UTC", max_length=80),
             company: str | None = Query(None, pattern="^[A-Z]{4}$"),
             category: Literal["Pricing", "Product", "Partnership", "Campaign", "Financial update", "Analyst commentary", "Market context"] | None = None,
             cursor: str | None = Query(None, max_length=300), limit: Limit = 20):
    wl = default_watchlist(db)
    return finding_page(db, signal_query(db, wl.id), period=period, start=start, end=end, zone=timezone,
                        company=company, category=category, cursor=cursor, limit=limit)


@compat.patch("/watchlist")
def update_default_watchlist(body: LegacyWatchlistUpdate, db: DB):
    row = default_watchlist(db)
    db.refresh(row, with_for_update=True)
    if body.tickers is not None:
        companies = db.scalars(select(Company).where(Company.symbol.in_(body.tickers))).all()
        if len(companies) != len(body.tickers):
            raise AppError("UNKNOWN_COMPANY", "One or more competitors are not available in the server catalog", 422)
        replace_members(db, row.id, validate_companies(db, [company.id for company in companies]))
    if body.name is not None:
        row.name = body.name
    # "user_company" in fields_set (even with null) means the user explicitly
    # set or cleared their company. A plain `is not None` check would make
    # "neutral" impossible to save.
    if "user_company" in body.model_fields_set:
        row.user_company = body.user_company.strip() if body.user_company else None
    row.updated_at = utcnow()
    db.commit()
    projected = watchlist_json(db, row)
    return {"id": projected["id"], "name": projected["name"], "user_company": projected["user_company"],
            "companies": [{"ticker": company["ticker"], "name": company["name"], "industry": company["industry"]}
                          for company in projected["companies"]]}


@compat.get("/signals/{signal_id}")
def old_signal(signal_id: UUID, db: DB):
    return legacy_signal(latest_revision(db, owned(db, Signal, signal_id)).card)


@compat.post("/runs", status_code=202)
def old_submit(body: LegacyRunCreate, db: DB, background: BackgroundTasks, idempotency_key: str | None = Header(None)):
    run = create_run(db, RunCreate(watchlist_id=default_watchlist(db).id, query=body.query), idempotency_key)
    if run.status == "queued":
        background.add_task(jobs.enqueue, run.id)
    return legacy_run(db, run)


@compat.get("/runs/active")
def active_run(db: DB):
    """The newest in-flight run on the default watchlist, if any.

    Lets a reloaded page (or a second tab) resume watching a run whose stream
    lived in another page lifetime, instead of orphaning it. Runs older than
    the execution window plus grace are reconciler prey, never adopted.
    """
    cutoff = utcnow() - timedelta(seconds=get_settings().run_timeout + 300)
    row = db.scalar(select(Run).where(Run.watchlist_id == default_watchlist(db).id,
                                      Run.status.in_(["queued", "running"]),
                                      Run.created_at > cutoff)
                    .order_by(Run.created_at.desc()).limit(1))
    if not row:
        raise AppError("NO_ACTIVE_RUN", "No investigation is currently running", 404)
    return legacy_run(db, row)


@compat.get("/runs/{run_id}/stream")
def stream(run_id: UUID, request: Request, db: DB):
    owned(db, Run, run_id)

    async def events():
        for _ in range(300):
            with session() as read_db:
                try:
                    if get_settings().auth_mode == "accounts":
                        auth.authenticate(request, read_db, touch=False)
                    else:
                        read_db.info["workspace_id"] = workspace_id(db)
                    row = owned(read_db, Run, run_id)
                except AppError:
                    yield 'event: auth-expired\ndata: {}\n\n'
                    return
                output, terminal = legacy_run(read_db, row), row.status not in ("queued", "running")
            yield "data: " + json.dumps(output) + "\n\n"
            if terminal:
                return
            await asyncio.sleep(2)
    return StreamingResponse(events(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})


@compat.post("/runs/{run_id}/cancel", status_code=204)
def cancel(run_id: UUID, db: DB):
    row = owned(db, Run, run_id)
    db.refresh(row, with_for_update=True)
    if row.status in ("queued", "running"):
        row.status, row.error_code, row.finished_at, row.lease_token = "failed", "CANCELLED", utcnow(), None
        db.commit()
    return Response(status_code=204)


app.include_router(compat)
