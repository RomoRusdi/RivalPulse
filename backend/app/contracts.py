from datetime import datetime
from typing import Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class WatchlistCreate(Strict):
    name: str = Field(min_length=1, max_length=120)
    objective: str = Field(min_length=3, max_length=2000)
    company_ids: list[UUID] = Field(min_length=2, max_length=5)
    user_company: str | None = Field(None, max_length=200)

    @field_validator("company_ids")
    @classmethod
    def distinct(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Select 2–5 distinct companies")
        return value


class WatchlistPatch(Strict):
    name: str | None = Field(None, min_length=1, max_length=120)
    objective: str | None = Field(None, min_length=3, max_length=2000)
    company_ids: list[UUID] | None = Field(None, min_length=2, max_length=5)
    user_company: str | None = Field(None, max_length=200)

    @model_validator(mode="after")
    def validate_patch(self):
        for key in self.model_fields_set - {"user_company"}:
            if getattr(self, key) is None:
                raise ValueError(f"{key} cannot be null")
        if self.company_ids and len(set(self.company_ids)) != len(self.company_ids):
            raise ValueError("Companies must be distinct")
        return self


class ConversationSuggestion(Strict):
    label: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=500)


class ConversationMessageIn(Strict):
    id: str = Field(min_length=1, max_length=80)
    role: Literal["user", "assistant"]
    kind: Literal["text", "instant", "research", "chat"]
    content: str = Field(min_length=1, max_length=20_000)
    label: str | None = Field(None, max_length=200)
    created_at: datetime = Field(alias="createdAt")
    run: dict | None = None
    suggestions: list[ConversationSuggestion] | None = Field(None, max_length=4)


class ConversationSync(Strict):
    id: UUID
    title: str = Field(min_length=1, max_length=120)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    messages: list[ConversationMessageIn] = Field(max_length=200)


class ChatTurn(Strict):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(Strict):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)


class ChatReply(Strict):
    reply: str
    # "llm", "fallback" (no model available), or "guarded" (figure suppressed).
    source: Literal["llm", "fallback", "guarded"]
    language: Literal["en", "id"]


class RunCreate(Strict):
    watchlist_id: UUID
    query: str | None = Field(None, min_length=3, max_length=2000)
    parent_signal_id: UUID | None = None


class LegacyRunCreate(Strict):
    query: str = Field(min_length=3, max_length=2000)


class LegacyWatchlistUpdate(Strict):
    name: str | None = Field(None, min_length=1, max_length=120)
    tickers: list[str] | None = Field(None, min_length=2, max_length=5)
    user_company: str | None = Field(None, max_length=200)

    @model_validator(mode="after")
    def validate_update(self):
        if self.name is None and self.tickers is None:
            raise ValueError("At least one watchlist field is required")
        if self.tickers is not None:
            normalized = [ticker.upper() for ticker in self.tickers]
            if len(set(normalized)) != len(normalized):
                raise ValueError("Competitors must be distinct")
            self.tickers = normalized
        return self


class ToolCall(Strict):
    name: Literal["get_company_profile", "get_company_metrics", "get_industry_context",
                  "get_recent_signals", "get_company_news", "get_previous_state"]
    company_ids: list[str] = Field(min_length=1, max_length=5)
    requested_periods: list[int] = Field(default_factory=list, max_length=5)
    comparable_period: int | None = Field(None, ge=2000, le=2100)
    # Recovery rounds re-read a company's remaining approved pages rather than
    # repeating the two the first pass already tried.
    source_offset: int = Field(0, ge=0, le=8)
    reason: str = Field(min_length=1, max_length=300)


class AgentPlan(Strict):
    tools: list[ToolCall] = Field(min_length=1, max_length=30)


class Interpretation(Strict):
    event_key: str
    supporting_claim_ids: list[str] = Field(min_length=1, max_length=20)
    hypothesis: str = Field(min_length=3, max_length=700)
    uncertainty: Literal["low", "medium", "high"]
    marketing_implication: str = Field(min_length=3, max_length=700)


class Analysis(Strict):
    interpretations: list[Interpretation] = Field(max_length=50)


class FinancialInterpretation(Strict):
    text: str = Field(min_length=12, max_length=500)
    supporting_claim_ids: list[str] = Field(min_length=1, max_length=10)
    uncertainty: Literal["low", "medium", "high"]


class BriefMetric(Strict):
    metric: str
    value: str
    currency: str | None
    unit: str
    period: str
    comparison_basis: str
    source_url: str
    json_pointer: str
    snapshot_id: str
    claim_id: str


class BriefCompany(Strict):
    symbol: str
    name: str
    comparison_note: str
    metrics: list[BriefMetric]
    revenue_history: list[BriefMetric] = Field(default_factory=list)


class FinancialBrief(Strict):
    period: str | None
    rows: list[BriefCompany]
    interpretation: FinancialInterpretation | None = None
    caveats: list[str]


class Claim(Strict):
    claim_id: str
    text: str
    evidence_ids: list[str] = Field(min_length=1)


class FinancialMetric(Strict):
    metric: str
    value: str
    unit: str
    currency: str | None
    period: str
    comparison_basis: str
    evidence_ids: list[str] = Field(min_length=1)


class Citation(Strict):
    id: str
    snapshot_id: str
    source: str
    url_or_endpoint: str
    excerpt_or_json_pointer: str
    published_at: str | None
    fetched_at: str
    cache_status: str


class Hypothesis(Strict):
    text: str
    supporting_claim_ids: list[str]
    uncertainty: str


class SignalCard(Strict):
    schema_version: int = 1
    signal_id: str
    revision_id: str
    company: dict
    mode: Literal["live", "yahoo", "replay"]
    type: str
    title: str
    change_status: Literal["baseline", "new", "updated", "unchanged"]
    analysis_status: Literal["complete", "incomplete"]
    severity: Literal["low", "medium", "high"]
    score_components: dict
    severity_reason: str
    facts: list[Claim]
    observed_signals: list[Claim]
    hypotheses: list[Hypothesis]
    financial_context: list[FinancialMetric]
    why_marketing_should_care: Hypothesis
    evidence: list[Citation]
    run_id: str
    compared_against_run_id: str | None
    first_seen_at: str
    published_at: str | None
    stored_at: str


class ResearchResult(Strict):
    schema_version: int = 1
    run_id: str
    mode: Literal["live", "yahoo", "replay"]
    status: Literal["completed", "partial", "failed"]
    generated_at: str
    summary: str
    coverage: list[dict]
    warnings: list[str]
    signals: list[SignalCard]
    financial_brief: FinancialBrief | None = None
    disclaimer: str = "Information and business analysis only; no investment recommendations or trade execution."


class RunAccepted(Strict):
    id: str
    status: str
    mode: str
    status_url: str


class ErrorBody(Strict):
    code: str
    message: str
    retryable: bool
    request_id: str


T = TypeVar("T")


class Page(Strict, Generic[T]):
    items: list[T]
    next_cursor: str | None


class CompanyOut(Strict):
    id: str
    symbol: str
    ticker: str
    name: str
    industry: str
    aliases: list[str]
    official_domains: list[str]
    identity_verified_at: str | None
    identity_reference: str
    comparison_note: str


class WatchlistOut(Strict):
    id: str
    name: str
    objective: str
    user_company: str | None
    companies: list[CompanyOut]
    created_at: str
    updated_at: str


class ProgressStep(Strict):
    stage: str
    sequence: int
    attempt: int
    status: str
    message: str
    details: dict
    duration_ms: int


class RunDetail(Strict):
    id: str
    watchlist_id: str
    mode: Literal["live", "yahoo", "replay"]
    status: Literal["queued", "running", "completed", "partial", "failed"]
    stage: str
    query: str
    created_at: str
    started_at: str | None
    finished_at: str | None
    heartbeat_at: str | None
    attempts: int
    estimated_credits: int
    external_calls: int
    llm_calls: int
    inputs: dict
    plan: AgentPlan | None
    error_code: str | None
    result: ResearchResult | None
    progress: list[ProgressStep]


class SignalDetail(Strict):
    signal: SignalCard
    revisions: list[SignalCard]
    first_seen_at: str
    last_seen_at: str
