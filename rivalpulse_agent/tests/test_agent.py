from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import httpx
import pytest

from rivalpulse_core.llm import (
    ImplicationSynthesis,
    SignalSynthesis,
    SynthesisError,
    SynthesisResponse,
    _apply_synthesis,
)
from rivalpulse_core.memory import ResearchMemory
from rivalpulse_core.schemas import (
    ChangeStatus,
    CompanyProfile,
    FinancialSnapshot,
    IndustryContext,
    NewsItem,
    ResearchRequest,
    SourceReference,
    SourceType,
)
from rivalpulse_core.sectors_live import SectorsCompetitiveDataTools
from rivalpulse_core.service import RivalPulseAgentService


class FixtureTools:
    def __init__(self, target_growth: float = 20.0) -> None:
        self.target_growth = target_growth

    async def get_company(self, ticker: str) -> CompanyProfile:
        return CompanyProfile(
            ticker=ticker,
            name=f"{ticker} Telecom",
            sector="Communication Services",
            industry="Telecom Services",
            source_refs=[f"SECTORS-{ticker}"],
        )

    async def get_financials(self, ticker: str) -> FinancialSnapshot:
        return FinancialSnapshot(
            ticker=ticker,
            period="2025",
            currency="IDR",
            revenue=1200 if ticker == "ISAT" else 1050,
            revenue_growth=self.target_growth if ticker == "ISAT" else 5.0,
            net_income=150 if ticker == "ISAT" else 120,
            net_income_growth=12.0 if ticker == "ISAT" else 4.0,
            source_refs=[f"SECTORS-{ticker}"],
        )

    async def get_industry(self, ticker: str) -> IndustryContext:
        return IndustryContext(
            ticker=ticker,
            sector="Communication Services",
            industry="Telecom Services",
            source_refs=[f"SECTORS-{ticker}"],
        )

    async def get_news(self, ticker: str):
        return []

    async def get_sources(self) -> list[SourceReference]:
        return [
            SourceReference(
                id=f"SECTORS-{ticker}",
                type=SourceType.SECTORS,
                title=f"Sectors report for {ticker}",
                url=f"https://api.sectors.app/v2/company/report/{ticker}/",
                period="2025",
                retrieved_at=datetime.now(UTC),
            )
            for ticker in ("ISAT", "TLKM")
        ]


def test_memory_labels_baseline_unchanged_and_updated(tmp_path):
    memory = ResearchMemory(tmp_path / "memory.json")
    request = ResearchRequest(target_company="ISAT", competitors=["TLKM"])

    first = asyncio.run(
        RivalPulseAgentService(FixtureTools(), memory=memory).run_research(request)
    )
    assert first.signals
    assert first.compared_against_run_id is None
    assert {signal.change_status for signal in first.signals} == {ChangeStatus.BASELINE}

    second = asyncio.run(
        RivalPulseAgentService(FixtureTools(), memory=memory).run_research(request)
    )
    assert second.compared_against_run_id == first.run_id
    assert {signal.change_status for signal in second.signals} == {ChangeStatus.UNCHANGED}

    third = asyncio.run(
        RivalPulseAgentService(FixtureTools(target_growth=25.0), memory=memory).run_research(
            request
        )
    )
    assert third.compared_against_run_id == second.run_id
    assert ChangeStatus.UPDATED in {signal.change_status for signal in third.signals}


def test_public_event_becomes_labeled_marketing_signal():
    class EventTools(FixtureTools):
        async def get_news(self, ticker: str):
            if ticker != "TLKM":
                return []
            return [
                NewsItem(
                    company="TLKM",
                    title="TLKM launches a new enterprise package",
                    summary="The package was announced with a distribution partnership.",
                    published_at=datetime(2025, 1, 16, tzinfo=UTC),
                    source_name="Sectors v2 news",
                    source_url="https://example.com/tlkm-package",
                    source_ref="NEWS-TLKM-1",
                )
            ]

        async def get_sources(self):
            sources = await super().get_sources()
            sources.append(
                SourceReference(
                    id="NEWS-TLKM-1",
                    type=SourceType.NEWS,
                    title="TLKM launches a new enterprise package",
                    url="https://example.com/tlkm-package",
                    published_at=datetime(2025, 1, 16, tzinfo=UTC),
                )
            )
            return sources

    result = asyncio.run(
        RivalPulseAgentService(EventTools()).run_research(
            ResearchRequest(target_company="ISAT", competitors=["TLKM"])
        )
    )
    event = next(signal for signal in result.signals if signal.type == "pricing")
    assert event.observation_kind == "observed_signal"
    assert event.interpretation_kind == "ai_hypothesis"
    assert len(event.evidence_ids) == 1
    assert event.severity.value == "high"
    implication = next(
        item for item in result.marketing_implications if item.signal_id == event.id
    )
    assert "Offer framing" in implication.recommended_monitoring


def test_llm_cannot_introduce_unsupported_numbers():
    result = asyncio.run(
        RivalPulseAgentService(FixtureTools()).run_research(
            ResearchRequest(target_company="ISAT", competitors=["TLKM"])
        )
    )
    synthesis = SynthesisResponse(
        summary="Revenue will grow by 999 percent.",
        signals=[
            SignalSynthesis(
                signal_id=signal.id,
                interpretation=signal.interpretation,
                why_it_matters=signal.why_it_matters,
            )
            for signal in result.signals
        ],
        marketing_implications=[
            ImplicationSynthesis(
                signal_id=item.signal_id,
                implication=item.implication,
                recommended_monitoring=item.recommended_monitoring,
            )
            for item in result.marketing_implications
        ],
    )
    with pytest.raises(SynthesisError, match="unsupported numeric"):
        _apply_synthesis(result, synthesis, "test model")


def test_sectors_adapter_coalesces_report_and_normalizes_financials():
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path.endswith("/company/report/ISAT/"):
            return httpx.Response(
                200,
                json={
                    "symbol": "ISAT.JK",
                    "company_name": "PT Indosat Tbk",
                    "overview": {
                        "sector": "Communication Services",
                        "industry": "Telecom Services",
                        "description": "Indonesian telecommunications company.",
                    },
                    "financials": {
                        "currency": "IDR",
                        "historical_financials": [
                            {"year": 2025, "revenue": "1200", "earnings": "150"},
                            {"year": 2024, "revenue": "1000", "earnings": "100"},
                        ],
                    },
                },
            )
        if request.url.path.endswith("/news/"):
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "title": "Indosat announces a new partnership",
                            "body": "The company announced a distribution partnership.",
                            "timestamp": "2025-01-16T10:00:00Z",
                            "source": "https://example.com/indosat-partnership",
                        }
                    ],
                    "pagination": {"has_next": False},
                },
            )
        return httpx.Response(404)

    async def scenario():
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        tools = SectorsCompetitiveDataTools(api_key="test-key", client=client)
        company, financials, industry = await asyncio.gather(
            tools.get_company("ISAT"),
            tools.get_financials("ISAT"),
            tools.get_industry("ISAT"),
        )
        news = await tools.get_news("ISAT")
        sources = await tools.get_sources()
        await client.aclose()
        return company, financials, industry, news, sources

    company, financials, industry, news, sources = asyncio.run(scenario())
    assert company.name == "PT Indosat Tbk"
    assert industry.industry == "Telecom Services"
    assert financials.period == "2025"
    assert financials.revenue_growth == 20.0
    assert financials.net_income_growth == 50.0
    assert len(news) == 1
    assert any(source.type is SourceType.SECTORS for source in sources)
    assert calls.count("/v2/company/report/ISAT/") == 1
    assert calls.count("/v2/news/") == 1
