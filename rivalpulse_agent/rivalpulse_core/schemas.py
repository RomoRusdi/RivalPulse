"""Typed domain and workflow models for the RivalPulse agent."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator


Ticker = Annotated[str, Field(min_length=1, max_length=16, pattern=r"^[A-Z0-9.-]+$")]


class StrictModel(BaseModel):
    """Base model that rejects accidental provider-specific fields."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class DataKind(StrEnum):
    COMPANY = "company"
    FINANCIALS = "financials"
    INDUSTRY = "industry"
    NEWS = "news"


class EvidenceCategory(StrEnum):
    COMPANY = "company"
    FINANCIAL = "financial"
    INDUSTRY = "industry"
    NEWS = "news"


class SignalSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ChangeStatus(StrEnum):
    """How a finding differs from the last successful run for the same scope."""

    BASELINE = "baseline"
    NEW = "new"
    UPDATED = "updated"
    UNCHANGED = "unchanged"


class SourceType(StrEnum):
    FIXTURE = "fixture"
    SECTORS = "sectors"
    NEWS = "news"
    OTHER = "other"


class ResearchRequest(StrictModel):
    target_company: Ticker
    competitors: list[Ticker] = Field(min_length=1)

    @field_validator("target_company", mode="before")
    @classmethod
    def normalize_target(cls, value: Any) -> Any:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("competitors", mode="before")
    @classmethod
    def normalize_competitors(cls, value: Any) -> Any:
        if not isinstance(value, list):
            return value
        normalized: list[Any] = []
        seen: set[Any] = set()
        for item in value:
            candidate = item.strip().upper() if isinstance(item, str) else item
            if candidate not in seen:
                normalized.append(candidate)
                seen.add(candidate)
        return normalized

    @model_validator(mode="after")
    def target_must_not_be_a_competitor(self) -> ResearchRequest:
        if self.target_company in self.competitors:
            raise ValueError("target_company cannot also appear in competitors")
        return self


class SourceReference(StrictModel):
    id: str = Field(min_length=1)
    type: SourceType
    title: str = Field(min_length=1)
    url: HttpUrl | None = None
    published_at: datetime | None = None
    period: str | None = None
    retrieved_at: datetime | None = None


class CompanyProfile(StrictModel):
    ticker: Ticker
    name: str = Field(min_length=1)
    sector: str | None = None
    industry: str | None = None
    description: str | None = None
    source_refs: list[str] = Field(default_factory=list)


class FinancialSnapshot(StrictModel):
    ticker: Ticker
    period: str
    currency: str | None = None
    revenue: float | None = None
    revenue_growth: float | None = None
    net_income: float | None = None
    net_income_growth: float | None = None
    operating_margin: float | None = None
    gross_margin: float | None = None
    profit_margin: float | None = None
    ebitda: float | None = None
    free_cash_flow: float | None = None
    total_cash: float | None = None
    total_debt: float | None = None
    market_cap: float | None = None
    enterprise_value: float | None = None
    trailing_pe: float | None = None
    forward_pe: float | None = None
    price_to_book: float | None = None
    dividend_yield: float | None = None
    fifty_two_week_change: float | None = None
    source_refs: list[str] = Field(default_factory=list)


class IndustryContext(StrictModel):
    ticker: Ticker
    sector: str | None = None
    industry: str | None = None
    summary: str | None = None
    source_refs: list[str] = Field(default_factory=list)


class NewsItem(StrictModel):
    company: Ticker
    title: str = Field(min_length=1)
    summary: str | None = None
    published_at: datetime
    source_name: str
    source_url: HttpUrl | None = None
    source_ref: str


class NormalizedDataBundle(StrictModel):
    """Provider-neutral file contract accepted by the agent CLI."""

    companies: list[CompanyProfile]
    financials: list[FinancialSnapshot] = Field(default_factory=list)
    industries: list[IndustryContext] = Field(default_factory=list)
    news: list[NewsItem] = Field(default_factory=list)
    sources: list[SourceReference] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_company_tickers(self) -> NormalizedDataBundle:
        tickers = [company.ticker for company in self.companies]
        if len(tickers) != len(set(tickers)):
            raise ValueError("companies must contain unique tickers")
        return self


class PlanStep(StrictModel):
    sequence: int = Field(ge=1)
    action: str
    reason: str
    required_source: SourceType | None = None


class ResearchPlan(StrictModel):
    companies: list[Ticker]
    required_data: list[DataKind]
    steps: list[PlanStep] = Field(default_factory=list)


class ComparisonValue(StrictModel):
    company: Ticker
    value: float | None = None


class CompanyComparison(StrictModel):
    metric: str
    label: str
    period: str | None = None
    unit: str
    target: ComparisonValue
    competitors: list[ComparisonValue]
    observation: str


class EvidenceItem(StrictModel):
    id: str
    kind: Literal["fact"] = "fact"
    company: Ticker
    category: EvidenceCategory
    statement: str
    value: float | str | None = None
    period: str | None = None
    source_refs: list[str]


class CompetitiveSignal(StrictModel):
    id: str
    stable_key: str = Field(min_length=12)
    type: str
    severity: SignalSeverity
    change_status: ChangeStatus = ChangeStatus.BASELINE
    title: str
    companies: list[Ticker]
    observation_kind: Literal["observed_signal"] = "observed_signal"
    observation: str
    evidence_ids: list[str] = Field(min_length=1)
    interpretation_kind: Literal["ai_hypothesis"] = "ai_hypothesis"
    interpretation: str
    why_it_matters: str
    confidence: float = Field(ge=0, le=1)


class MarketingImplication(StrictModel):
    signal_id: str
    implication: str
    recommended_monitoring: list[str]


class ResearchResult(StrictModel):
    run_id: str
    target_company: Ticker
    competitors: list[Ticker]
    generated_at: datetime
    compared_against_run_id: str | None = None
    llm_provider: str = "none"
    llm_status: Literal["grounded", "fallback", "disabled"] = "disabled"
    summary: str
    research_plan: ResearchPlan
    company_profiles: list[CompanyProfile]
    financial_snapshots: list[FinancialSnapshot]
    comparisons: list[CompanyComparison]
    evidence: list[EvidenceItem]
    signals: list[CompetitiveSignal]
    marketing_implications: list[MarketingImplication]
    sources: list[SourceReference]
    warnings: list[str]


class ResearchState(StrictModel):
    """Explicit state returned by the Phase 4 collection workflow."""

    request: ResearchRequest
    plan: ResearchPlan
    company_data: dict[str, CompanyProfile] = Field(default_factory=dict)
    financial_data: dict[str, FinancialSnapshot] = Field(default_factory=dict)
    industry_data: dict[str, IndustryContext] = Field(default_factory=dict)
    news_data: dict[str, list[NewsItem]] = Field(default_factory=dict)
    sources: list[SourceReference] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
