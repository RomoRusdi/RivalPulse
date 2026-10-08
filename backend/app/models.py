from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, uid, utcnow


class Identity:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class User(Identity, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(String(80))
    job_title: Mapped[str] = mapped_column(String(80), default="Marketing analyst")
    timezone: Mapped[str] = mapped_column(String(80), default="Asia/Jakarta")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    email_verified_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)


class Workspace(Base):
    __tablename__ = "workspaces"
    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=utcnow)


class LLMConfiguration(Identity, Base):
    """Versioned model selection; never put plaintext keys into research inputs."""
    __tablename__ = "llm_configurations"
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(100))
    enabled: Mapped[bool] = mapped_column(Boolean)
    cloud_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    encrypted_key: Mapped[str | None] = mapped_column(Text, nullable=True)


class WorkspaceLLM(Base):
    __tablename__ = "workspace_llm"
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), primary_key=True)
    configuration_id: Mapped[str] = mapped_column(ForeignKey("llm_configurations.id"))


class WorkspaceDataKey(Base):
    """A workspace's own data-provider key, encrypted like model keys. Research
    uses it before the server default; it is never returned to a browser."""
    __tablename__ = "workspace_data_keys"
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), primary_key=True)
    provider: Mapped[str] = mapped_column(String(20), primary_key=True, default="sectors")
    encrypted_key: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkspaceMembership(Base):
    __tablename__ = "workspace_memberships"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), primary_key=True)
    permission: Mapped[str] = mapped_column(String(20), default="owner")
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuthSession(Identity, Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"))
    expires_at: Mapped[object] = mapped_column(DateTime(timezone=True), index=True)
    last_seen_at: Mapped[object] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    remembered: Mapped[bool] = mapped_column(Boolean, default=True)
    tab_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)


class PendingRegistration(Identity, Base):
    __tablename__ = "pending_registrations"
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    workspace_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    user_company: Mapped[str | None] = mapped_column(String(12), nullable=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    code_expires_at: Mapped[object] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[object] = mapped_column(DateTime(timezone=True), index=True)
    sent_at: Mapped[object] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)


class WorkspaceCredit(Base):
    __tablename__ = "workspace_credits"
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), primary_key=True)
    total: Mapped[int] = mapped_column(Integer)
    used: Mapped[int] = mapped_column(Integer, default=0)


class Company(Identity, Base):
    __tablename__ = "companies"
    symbol: Mapped[str] = mapped_column(String(12), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    industry: Mapped[str] = mapped_column(String(100))
    aliases: Mapped[list] = mapped_column(JSON, default=list)
    official_domains: Mapped[list] = mapped_column(JSON, default=list)
    identity_verified_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    identity_reference: Mapped[str] = mapped_column(Text, default="")
    comparison_note: Mapped[str] = mapped_column(Text, default="Reporting scope must be verified before growth comparisons.")


class Watchlist(Identity, Base):
    __tablename__ = "watchlists"
    workspace_id: Mapped[str] = mapped_column(String(80), index=True)
    name: Mapped[str] = mapped_column(String(120))
    objective: Mapped[str] = mapped_column(Text)
    user_company: Mapped[str | None] = mapped_column(String(200))
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=utcnow)


class Membership(Base):
    __tablename__ = "watchlist_companies"
    watchlist_id: Mapped[str] = mapped_column(ForeignKey("watchlists.id"), primary_key=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), primary_key=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Conversation(Identity, Base):
    __tablename__ = "conversations"
    workspace_id: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(String(120))
    messages: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Run(Identity, Base):
    __tablename__ = "research_runs"
    workspace_id: Mapped[str] = mapped_column(String(80), index=True)
    watchlist_id: Mapped[str] = mapped_column(ForeignKey("watchlists.id"), index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128))
    request_hash: Mapped[str] = mapped_column(String(64))
    inputs: Mapped[dict] = mapped_column(JSON)
    mode: Mapped[str] = mapped_column(String(10))
    query: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    stage: Mapped[str] = mapped_column(String(30), default="queued")
    baseline_id: Mapped[str | None] = mapped_column(ForeignKey("research_runs.id"))
    plan: Mapped[dict | None] = mapped_column(JSON)
    result: Mapped[dict | None] = mapped_column(JSON)
    error_code: Mapped[str | None] = mapped_column(String(60))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    credits: Mapped[int] = mapped_column(Integer, default=0)
    external_calls: Mapped[int] = mapped_column(Integer, default=0)
    llm_calls: Mapped[int] = mapped_column(Integer, default=0)
    lease_token: Mapped[str | None] = mapped_column(String(36))
    heartbeat_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    enqueued_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (
        Index("ix_runs_watchlist_created", "watchlist_id", "created_at"),
        UniqueConstraint("workspace_id", "idempotency_key", name="uq_run_idempotency"),
        Index("uq_active_run", "watchlist_id", unique=True,
              postgresql_where=text("status IN ('queued', 'running')"),
              sqlite_where=text("status IN ('queued', 'running')")),
    )


class RunStep(Identity, Base):
    __tablename__ = "run_steps"
    run_id: Mapped[str] = mapped_column(ForeignKey("research_runs.id"), index=True)
    attempt: Mapped[int] = mapped_column(Integer)
    sequence: Mapped[int] = mapped_column(Integer)
    stage: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="completed")
    message: Mapped[str] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (UniqueConstraint("run_id", "attempt", "sequence"),)


class Source(Identity, Base):
    __tablename__ = "sources"
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    url: Mapped[str] = mapped_column(Text, unique=True)
    domain: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20), default="html")
    extraction: Mapped[dict] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class Snapshot(Identity, Base):
    __tablename__ = "snapshots"
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"))
    mode: Mapped[str] = mapped_column(String(10))
    provider: Mapped[str] = mapped_column(String(30))
    request_key: Mapped[str] = mapped_column(String(64), index=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    normalized: Mapped[dict] = mapped_column(JSON)
    raw_payload: Mapped[dict | None] = mapped_column(JSON)
    url: Mapped[str] = mapped_column(Text)
    published_at: Mapped[str | None] = mapped_column(String(100))
    fetched_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=utcnow)
    parser_version: Mapped[str] = mapped_column(String(20), default="1")
    __table_args__ = (Index("ix_snapshots_source_fetched", "source_id", "fetched_at"),)


class RunSnapshot(Base):
    __tablename__ = "run_snapshots"
    run_id: Mapped[str] = mapped_column(ForeignKey("research_runs.id"), primary_key=True)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("snapshots.id"), primary_key=True)
    outcome: Mapped[str] = mapped_column(String(20), default="fetched")


class Signal(Identity, Base):
    __tablename__ = "signals"
    workspace_id: Mapped[str] = mapped_column(String(80), index=True)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    mode: Mapped[str] = mapped_column(String(10))
    event_key: Mapped[str] = mapped_column(String(64))
    type: Mapped[str] = mapped_column(String(30))
    first_seen_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[object] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("workspace_id", "mode", "event_key"),)


class Revision(Identity, Base):
    __tablename__ = "signal_revisions"
    signal_id: Mapped[str] = mapped_column(ForeignKey("signals.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("research_runs.id"), index=True)
    prior_revision_id: Mapped[str | None] = mapped_column(ForeignKey("signal_revisions.id"))
    content_hash: Mapped[str] = mapped_column(String(64))
    severity: Mapped[str] = mapped_column(String(10), index=True)
    card: Mapped[dict] = mapped_column(JSON)
    __table_args__ = (UniqueConstraint("signal_id", "run_id"),)


class Evidence(Identity, Base):
    __tablename__ = "evidence"
    revision_id: Mapped[str] = mapped_column(ForeignKey("signal_revisions.id"), index=True)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("snapshots.id"))
    claim_id: Mapped[str] = mapped_column(String(100))
    locator: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    published_at: Mapped[str | None] = mapped_column(String(100))
    fetched_at: Mapped[object] = mapped_column(DateTime(timezone=True))


class CreditAccount(Base):
    __tablename__ = "credit_accounts"
    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    used: Mapped[int] = mapped_column(Integer, default=0)


class CreditReservation(Identity, Base):
    __tablename__ = "credit_reservations"
    run_id: Mapped[str] = mapped_column(ForeignKey("research_runs.id"), index=True)
    request_key: Mapped[str] = mapped_column(String(64))
    credits: Mapped[int] = mapped_column(Integer)
    outcome: Mapped[str] = mapped_column(String(20), default="unknown")


class ProviderCache(Base):
    __tablename__ = "provider_cache"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("snapshots.id"))
    expires_at: Mapped[object] = mapped_column(DateTime(timezone=True))


# PostgreSQL adds these without rewriting immutable history tables.
for model in (Watchlist, Conversation, Run, Signal):
    model.__table__.append_constraint(ForeignKeyConstraint(
        ["workspace_id"], ["workspaces.id"], name=f"fk_{model.__tablename__}_workspace"
    ).ddl_if(dialect="postgresql"))
