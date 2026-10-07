"""Presentation boundary: immutable evidence retains provider diagnostics on the server."""
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, Field, model_serializer, model_validator

from app.contracts import FinancialInterpretation, ResearchResult, RunDetail, SignalCard, SignalDetail

PRIVATE_FIELDS = {"jsonPointer", "json_pointer", "excerpt_or_json_pointer", "rawValue", "raw_payload",
                  "rawPayload", "transformation", "request_headers", "response_headers", "api_key",
                  "authorization", "source_url", "sourceUrl", "url_or_endpoint"}


def report_link(snapshot_id):
    return f"/financial-sources/{snapshot_id}" if snapshot_id else ""


def public_link(url, snapshot_id=None, source=""):
    try:
        parsed = urlsplit(url)
        if source == "sectors_news":
            return ""
        if (source == "sectors" or parsed.hostname == "api.sectors.app"
                or parsed.path.startswith(("/v1/", "/v2/"))):
            return report_link(snapshot_id)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            return ""
        # Authentication and tracking query parameters are never needed by the evidence UI.
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
    except (ValueError, AttributeError):
        return ""


def public_payload(value):
    """Copy JSON for delivery; never mutate persisted evidence or validators' inputs."""
    if isinstance(value, list):
        return [public_payload(item) for item in value]
    if not isinstance(value, dict):
        return value
    return {key: (public_link(item, value.get("snapshot_id") or value.get("snapshotId"), value.get("source", ""))
                  if key == "url" and isinstance(item, str) else public_payload(item))
            for key, item in value.items() if key not in PRIVATE_FIELDS}


class PublicBriefMetric(BaseModel):
    metric: str
    value: str
    currency: str | None
    unit: str
    period: str
    comparison_basis: str
    snapshot_id: str
    claim_id: str


class PublicBriefCompany(BaseModel):
    symbol: str
    name: str
    comparison_note: str
    metrics: list[PublicBriefMetric]
    revenue_history: list[PublicBriefMetric] = Field(default_factory=list)


class PublicFinancialBrief(BaseModel):
    period: str | None
    rows: list[PublicBriefCompany]
    interpretation: FinancialInterpretation | None = None
    caveats: list[str]


class PublicCitation(BaseModel):
    id: str
    snapshot_id: str
    source: str
    url: str = ""
    published_at: str | None
    fetched_at: str
    cache_status: str

    @model_validator(mode="before")
    @classmethod
    def readable_link(cls, data):
        if not isinstance(data, dict):
            return data
        return {**data, "url": public_link(data.get("url_or_endpoint", data.get("url", "")), data.get("snapshot_id"),
                                          data.get("source", ""))}


class PublicSignalCard(SignalCard):
    evidence: list[PublicCitation]


class PublicResearchResult(ResearchResult):
    signals: list[PublicSignalCard]
    financial_brief: PublicFinancialBrief | None = None


class PublicRunDetail(RunDetail):
    result: PublicResearchResult | None

    @model_serializer(mode="wrap")
    def present(self, handler):
        return public_payload(handler(self))


class PublicSignalDetail(SignalDetail):
    signal: PublicSignalCard
    revisions: list[PublicSignalCard]
