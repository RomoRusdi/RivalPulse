"""Cookie sessions for the browser. Only token hashes are stored in the database."""
import hashlib
import hmac
import secrets
from datetime import timedelta, timezone
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.security import APIKeyCookie
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.db import get_db, iso, utcnow
from app.errors import AppError
from app.models import AuthSession, Company, Membership, PendingRegistration, User, Watchlist, Workspace, WorkspaceCredit, WorkspaceMembership
from app import email_verification
from app.providers import redis_connection

hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
dummy_hash = hasher.hash(secrets.token_urlsafe(32))
router = APIRouter(prefix="/api/v1", tags=["accounts"])
DB = Annotated[object, Depends(get_db)]


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def cookie_name(kind):
    return ("__Host-" if get_settings().cookie_secure else "") + "rivalpulse_" + kind


session_cookie = APIKeyCookie(name=cookie_name("session"), auto_error=False)


class ProfileOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    timezone: str
    joinedAt: str
    workspace: str
    workspaceId: str
    sessionExpiresAt: str
    emailVerified: bool = False
    remembered: bool = True


class VerificationOut(BaseModel):
    verificationRequired: bool = True
    challengeId: str
    expiresAt: str
    resendAfter: str


class SessionOut(ProfileOut):
    tabToken: str | None = None


def cookie(response, kind, value, max_age):
    response.set_cookie(cookie_name(kind), value, max_age=max_age, httponly=True,
                        secure=get_settings().cookie_secure, samesite="strict", path="/")


def accounts_only():
    if get_settings().auth_mode != "accounts":
        raise AppError("ACCOUNTS_DISABLED", "Account access is not enabled", 404)


def validate_csrf(request, auth_session=None):
    origin = request.headers.get("origin", "")
    if origin not in get_settings().auth_origins:
        raise AppError("ORIGIN_REJECTED", "Request origin not allowed", 403)
    supplied = request.headers.get("x-csrf-token", "")
    stored = request.cookies.get(cookie_name("csrf"), "")
    if not (20 <= len(supplied) <= 128) or not hmac.compare_digest(supplied.encode(), stored.encode()):
        raise AppError("CSRF_REJECTED", "Refresh the page and try again", 403)
    if auth_session and not hmac.compare_digest(digest(supplied), auth_session.csrf_hash):
        raise AppError("CSRF_REJECTED", "Refresh the page and try again", 403)


def authenticate(request, db, *, touch=True):
    accounts_only()
    token = request.cookies.get(cookie_name("session"), "")
    row = db.scalar(select(AuthSession).where(AuthSession.token_hash == digest(token))) if token else None
    now = utcnow()
    if (not row or row.revoked or row.expires_at.replace(tzinfo=timezone.utc) <= now
            or row.last_seen_at.replace(tzinfo=timezone.utc) + timedelta(hours=get_settings().session_idle_hours) <= now):
        raise AppError("UNAUTHORIZED", "Please log in to continue", 401)
    if not row.remembered and row.tab_hash:
        proof = request.headers.get("x-tab-session", "")
        if not (20 <= len(proof) <= 128) or not hmac.compare_digest(digest(proof), row.tab_hash):
            raise AppError("UNAUTHORIZED", "Please log in to continue", 401)
    user = db.get(User, row.user_id)
    member = db.get(WorkspaceMembership, (row.user_id, row.workspace_id))
    if not user or not user.active or not member:
        raise AppError("UNAUTHORIZED", "Please log in to continue", 401)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        validate_csrf(request, row)
    if touch and row.last_seen_at.replace(tzinfo=timezone.utc) < now - timedelta(minutes=1):
        row.last_seen_at = now
        db.commit()
    db.info["workspace_id"] = row.workspace_id
    return row, user


def current(request: Request, db: DB, credentials=Depends(session_cookie)):
    return authenticate(request, db)


def profile(db, auth_session, user):
    workspace = db.get(Workspace, auth_session.workspace_id)
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.job_title,
            "timezone": user.timezone, "joinedAt": iso(user.created_at)[:10], "workspace": workspace.name,
            "workspaceId": workspace.id, "sessionExpiresAt": iso(auth_session.expires_at),
            "emailVerified": user.email_verified_at is not None, "remembered": auth_session.remembered}


class Input(BaseModel):
    # Passwords must NEVER be stripped or normalized by a base schema.
    model_config = ConfigDict(extra="forbid")


class Credentials(Input):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().casefold() if isinstance(value, str) else value


class Login(Credentials):
    remember: bool = False


class Register(Credentials):
    password: str = Field(min_length=15, max_length=128)
    name: str = Field(min_length=1, max_length=80)
    workspace_name: str | None = Field(None, min_length=1, max_length=120)
    user_company: str | None = Field(None, pattern="^[A-Z]{4}$")

    @field_validator("name", "workspace_name")
    @classmethod
    def nonblank(cls, value):
        if value is None:
            return None
        if not value.strip():
            raise ValueError("Must not be blank")
        return value.strip()


class ProfilePatch(Input):
    name: str = Field(min_length=1, max_length=80)
    role: str | None = Field(None, min_length=1, max_length=80)
    timezone: str = Field(min_length=1, max_length=80)

    @field_validator("name", "role")
    @classmethod
    def nonblank(cls, value):
        if value is None:
            return None
        if not value.strip():
            raise ValueError("Must not be blank")
        return value.strip()

    @field_validator("timezone")
    @classmethod
    def valid_zone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Choose a valid timezone") from None
        return value


class PasswordChange(Input):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=15, max_length=128)


class VerificationCheck(Input):
    challenge_id: str = Field(pattern=r"^[a-f0-9-]{36}$")
    code: str = Field(pattern=r"^\d{8}$")


class VerificationResend(Input):
    challenge_id: str = Field(pattern=r"^[a-f0-9-]{36}$")


def throttle(request, email, operation):
    # Use the transport peer, never untrusted client-supplied forwarding headers.
    peer = request.client.host if request.client else "unknown"
    limits = [(f"{operation}:ip:{digest(peer)}", 60 if operation == "login" else 10),
              (f"{operation}:email:{digest(email)}", 10)]
    try:
        pipe = redis_connection().pipeline()
        for key, _ in limits:
            pipe.incr("auth:" + key)
            pipe.expire("auth:" + key, 900, nx=True)
        counts = pipe.execute()
    except Exception:
        raise AppError("AUTH_UNAVAILABLE", "Authentication is temporarily unavailable", 503, True) from None
    if any(counts[i * 2] > limit for i, (_, limit) in enumerate(limits)):
        raise AppError("RATE_LIMITED", "Too many attempts. Please try again in 15 minutes", 429, True)


def verify(encoded, password):
    try:
        return hasher.verify(encoded, password)
    except (VerificationError, InvalidHashError):
        return False


def issue_session(db, request, response, user, workspace_id, remember):
    # Replace a previous session rather than carrying it across identities.
    old_token = request.cookies.get(cookie_name("session"))
    if old_token:
        db.execute(update(AuthSession).where(AuthSession.token_hash == digest(old_token)).values(revoked=True))
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    tab_token = secrets.token_urlsafe(32) if not remember and get_settings().tab_session_required else None
    settings = get_settings()
    seconds = (settings.remember_days * 86400 if remember else settings.session_hours * 3600)
    now = utcnow()
    row = AuthSession(token_hash=digest(token), csrf_hash=digest(csrf), user_id=user.id,
                      workspace_id=workspace_id, expires_at=now + timedelta(seconds=seconds), last_seen_at=now,
                      remembered=remember, tab_hash=digest(tab_token) if tab_token else None)
    user.last_login_at = now
    db.add(row)
    db.flush()
    result = profile(db, row, user)
    result["tabToken"] = tab_token
    db.commit()
    cookie(response, "session", token, seconds if remember else None)
    cookie(response, "csrf", csrf, seconds if remember else None)
    return result


@router.get("/auth/csrf", dependencies=[Depends(accounts_only)])
def csrf(request: Request, response: Response, db: DB):
    token = request.cookies.get(cookie_name("csrf"), "")
    try:
        auth_session, _ = authenticate(request, db)
    except AppError as exc:
        if exc.status != 401:
            raise
        auth_session = None
    if not (20 <= len(token) <= 128) or (auth_session and digest(token) != auth_session.csrf_hash):
        token = secrets.token_urlsafe(32)
        if auth_session:
            auth_session.csrf_hash = digest(token)
            db.commit()
        cookie(response, "csrf", token, None)
    return {"token": token}


@router.get("/auth/companies", dependencies=[Depends(accounts_only)])
def signup_companies(db: DB, query: str = Query("", max_length=80)):
    # Public catalog only. No users, workspace data or external requests.
    term = query.replace("%", "\\%").replace("_", "\\_")
    from sqlalchemy import or_
    rows = db.scalars(select(Company).where(or_(Company.symbol.ilike(f"%{term}%", escape="\\"),
        Company.name.ilike(f"%{term}%", escape="\\"), Company.industry.ilike(f"%{term}%", escape="\\")))
        .order_by(Company.symbol).limit(50)).all()
    return {"items": [{"ticker": row.symbol, "name": row.name, "industry": row.industry} for row in rows]}


@router.post("/auth/register", status_code=201, dependencies=[Depends(accounts_only)], response_model=SessionOut | VerificationOut)
def register(body: Register, request: Request, response: Response, db: DB):
    validate_csrf(request)
    if not get_settings().registration_enabled:
        raise AppError("REGISTRATION_DISABLED", "Registration is closed. Contact your administrator", 403)
    throttle(request, str(body.email), "register")
    if body.user_company and not db.scalar(select(Company.id).where(Company.symbol == body.user_company)):
        raise AppError("UNKNOWN_COMPANY", "Choose a company from the catalog or select Neutral", 422)
    if get_settings().email_verification_enabled:
        if db.scalar(select(User.id).where(User.email == str(body.email))):
            # Same response shape without modifying an existing account or sending mail to it.
            from app.db import uid, utcnow
            now = utcnow()
            response.status_code = 202
            return {"verificationRequired": True, "challengeId": uid(), "expiresAt": iso(now + timedelta(minutes=15)),
                    "resendAfter": iso(now + timedelta(seconds=60))}
        response.status_code = 202
        return email_verification.enroll(db, body, hasher.hash(body.password))
    return activate_registration(body, hasher.hash(body.password), request, response, db)


def activate_registration(body, password_hash, request, response, db, *, verified=False, pending=None):
    user = User(email=str(body.email), password_hash=password_hash, name=body.name,
                email_verified_at=utcnow() if verified else None)
    workspace = Workspace(name=body.workspace_name or (f"{body.user_company} research" if body.user_company else f"{body.name}'s workspace"))
    try:
        db.add_all([user, workspace])
        db.flush()
        db.add(WorkspaceMembership(user_id=user.id, workspace_id=workspace.id))
        db.add(WorkspaceCredit(workspace_id=workspace.id, total=get_settings().workspace_credit_total, used=0))
        watchlist = Watchlist(workspace_id=workspace.id, name="Competitor watchlist", user_company=body.user_company,
                             objective="Monitor product, pricing and partnership developments")
        db.add(watchlist)
        db.flush()
        companies = db.scalars(select(Company).where(Company.symbol.in_(["TLKM", "ISAT", "EXCL"]),
                                                     Company.symbol != (body.user_company or ""))).all()
        if len(companies) < 2:
            raise AppError("CATALOG_NOT_READY", "Run the catalog seed before creating accounts", 503)
        db.add_all([Membership(watchlist_id=watchlist.id, company_id=c.id) for c in companies])
        if pending:
            db.delete(pending)
        if verified:
            # Verification activates the account; login separately chooses session persistence.
            db.commit()
            return {"verified": True}
        return issue_session(db, request, response, user, workspace.id, False)
    except IntegrityError:
        db.rollback()
        raise AppError("REGISTRATION_FAILED", "Unable to create this account. Try logging in", 409) from None


@router.post("/auth/login", dependencies=[Depends(accounts_only)], response_model=SessionOut)
def login(body: Login, request: Request, response: Response, db: DB):
    validate_csrf(request)
    throttle(request, str(body.email), "login")
    user = db.scalar(select(User).where(User.email == str(body.email)).with_for_update())
    valid = verify(user.password_hash if user else dummy_hash, body.password)
    if not user or not user.active or not valid:
        raise AppError("INVALID_CREDENTIALS", "Email or password is incorrect", 401)
    membership = db.scalar(select(WorkspaceMembership).where(WorkspaceMembership.user_id == user.id)
                           .order_by(WorkspaceMembership.created_at, WorkspaceMembership.workspace_id).limit(1))
    if not membership:
        raise AppError("INVALID_CREDENTIALS", "Email or password is incorrect", 401)
    if hasher.check_needs_rehash(user.password_hash):
        user.password_hash = hasher.hash(body.password)
    return issue_session(db, request, response, user, membership.workspace_id, body.remember)


@router.get("/auth/me", response_model=ProfileOut)
def me(db: DB, identity=Depends(current)):
    return profile(db, *identity)


@router.post("/auth/verification/check", dependencies=[Depends(accounts_only)])
def check_verification(body: VerificationCheck, request: Request, db: DB):
    validate_csrf(request)
    throttle(request, body.challenge_id, "verification")
    row = db.scalar(select(PendingRegistration).where(PendingRegistration.id == body.challenge_id).with_for_update())
    now = utcnow()
    if not row or row.expires_at.replace(tzinfo=timezone.utc) <= now or row.code_expires_at.replace(tzinfo=timezone.utc) <= now or row.attempts >= 5:
        raise AppError("VERIFICATION_INVALID", "This code has expired. Request another code or start registration again.", 400)
    if not hmac.compare_digest(row.code_hash, email_verification.code_digest(row.id, body.code)):
        row.attempts += 1
        db.commit()
        raise AppError("VERIFICATION_INVALID", "The code is incorrect. Check your email and try again.", 400)
    if row.user_id:
        user = db.get(User, row.user_id)
        if not user or not user.active:
            raise AppError("VERIFICATION_INVALID", "This verification is unavailable.", 400)
        user.email_verified_at = now
        db.delete(row)
        db.commit()
        return {"verified": True}
    return activate_registration(row, row.password_hash, request, Response(), db, verified=True, pending=row)


@router.post("/auth/verification/resend", dependencies=[Depends(accounts_only)], response_model=VerificationOut)
def resend_verification(body: VerificationResend, request: Request, db: DB):
    validate_csrf(request)
    throttle(request, body.challenge_id, "resend")
    row = db.scalar(select(PendingRegistration).where(PendingRegistration.id == body.challenge_id).with_for_update())
    if not row or row.expires_at.replace(tzinfo=timezone.utc) <= utcnow():
        raise AppError("VERIFICATION_INVALID", "Start registration again to request a new code.", 400)
    return email_verification.enroll(db, row, row.password_hash, user_id=row.user_id)


@router.post("/auth/verification/start", response_model=VerificationOut | dict)
def verify_existing(request: Request, db: DB, identity=Depends(current)):
    _, user = identity
    if user.email_verified_at:
        return {"verified": True}
    throttle(request, user.email, "verification-start")
    return email_verification.enroll(db, user, None, user_id=user.id)


def clear_cookies(response):
    for kind in ("session", "csrf"):
        response.delete_cookie(cookie_name(kind), path="/", httponly=True,
                               secure=get_settings().cookie_secure, samesite="strict")


@router.post("/auth/logout", status_code=204)
def logout(response: Response, db: DB, identity=Depends(current)):
    identity[0].revoked = True
    db.commit()
    clear_cookies(response)


@router.patch("/users/me", response_model=ProfileOut)
def update_profile(body: ProfilePatch, db: DB, identity=Depends(current)):
    auth_session, user = identity
    user.name, user.timezone = body.name, body.timezone
    db.commit()
    return profile(db, auth_session, user)


@router.post("/auth/change-password", status_code=204)
def change_password(body: PasswordChange, request: Request, response: Response, db: DB, identity=Depends(current)):
    _, user = identity
    throttle(request, user.email, "password")
    db.refresh(user, with_for_update=True)
    if not verify(user.password_hash, body.current_password):
        raise AppError("INVALID_PASSWORD", "Current password is incorrect", 400)
    user.password_hash = hasher.hash(body.new_password)
    db.execute(update(AuthSession).where(AuthSession.user_id == user.id).values(revoked=True))
    db.commit()
    clear_cookies(response)
