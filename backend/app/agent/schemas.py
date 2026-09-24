from typing import Any, Literal

from pydantic import BaseModel, Field


Severity = Literal["LOW", "MEDIUM", "HIGH"]


class ResearchRequest(BaseModel):
    company: str = Field(..., min_length=1)
    competitors: list[str] = Field(default_factory=list)


class ToolCall(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    tool_name: str
    success: bool
    data: dict[str, Any] | None = None
    error: str | None = None


class Evidence(BaseModel):
    source: str
    field: str
    value: str | int | float | None
    comparison: str | None = None


class FinancialContext(BaseModel):
    revenue: float | None = None
    revenue_growth_pct: float | None = None
    net_income: float | None = None
    net_income_growth_pct: float | None = None
    currency: str | None = None
    period: str | None = None


class CompetitorComparison(BaseModel):
    company: str
    competitor: str
    revenue_growth_difference_pct: float | None = None
    net_income_growth_difference_pct: float | None = None
    observations: list[str] = Field(default_factory=list)


class Signal(BaseModel):
    type: str
    severity: Severity
    title: str
    description: str
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)


class MarketingImplication(BaseModel):
    title: str
    description: str
    supporting_signals: list[str] = Field(default_factory=list)


class ResearchSource(BaseModel):
    ticker: str
    title: str
    source: str | None = None
    published_at: str | None = None
    url: str | None = None


class CompanySnapshot(BaseModel):
    ticker: str
    company_name: str
    sector: str | None = None
    industry: str | None = None
    country: str | None = None
    description: str | None = None


class ResearchResult(BaseModel):
    company: str
    competitors: list[str]
    summary: str
    company_snapshot: CompanySnapshot
    financial_context: FinancialContext
    signals: list[Signal]
    competitor_comparison: list[CompetitorComparison]
    marketing_implications: list[MarketingImplication]
    sources: list[ResearchSource]
    execution_metadata: dict[str, Any] = Field(default_factory=dict)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: list[ChatMessage] = Field(default_factory=list)
    previous_result: ResearchResult | None = None


class ChatResponse(BaseModel):
    message: str
    intent: Literal[
        "research",
        "follow_up",
        "general",
        "unsupported",
    ]
    research_result: ResearchResult | None = None
    suggestions: list[str] = Field(default_factory=list)