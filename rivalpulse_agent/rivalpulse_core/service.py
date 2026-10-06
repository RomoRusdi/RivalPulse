"""Backend-facing orchestration service for deterministic RivalPulse research."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from .analyzer import CompetitiveAnalyzer
from .llm import ResearchSynthesizer, SynthesisError
from .memory import ResearchMemory
from .planner import DeterministicResearchPlanner
from .schemas import DataKind, ResearchRequest, ResearchResult, ResearchState, SourceType
from .signal_detector import CompetitiveSignalDetector
from .tools import CompetitiveDataTools, DataToolError


class RivalPulseAgentService:
    """Collect normalized data and produce an evidence-backed research result."""

    def __init__(
        self,
        tools: CompetitiveDataTools,
        planner: DeterministicResearchPlanner | None = None,
        analyzer: CompetitiveAnalyzer | None = None,
        signal_detector: CompetitiveSignalDetector | None = None,
        synthesizer: ResearchSynthesizer | None = None,
        memory: ResearchMemory | None = None,
    ) -> None:
        self._tools = tools
        self._planner = planner or DeterministicResearchPlanner()
        self._analyzer = analyzer or CompetitiveAnalyzer()
        self._signal_detector = signal_detector or CompetitiveSignalDetector()
        self._synthesizer = synthesizer
        self._memory = memory

    async def run_research(self, request: ResearchRequest) -> ResearchResult:
        """Execute the deterministic Phase 5 workflow and return the shared contract."""
        state = await self.collect_research(request)
        analysis = self._analyzer.analyze(state)
        detection = self._signal_detector.detect(state, analysis)

        warnings = [*state.warnings, *analysis.warnings]
        source_types = {source.type for source in state.sources}
        if SourceType.FIXTURE in source_types:
            warnings.insert(0, "This result uses demonstration fixture data, not live company intelligence.")
        if SourceType.SECTORS not in source_types:
            warnings.append(
                "Sectors financial evidence is absent. This run is not eligible as the production hackathon result."
            )
        warnings = list(dict.fromkeys(warnings))

        company_profiles = [
            state.company_data[ticker]
            for ticker in state.plan.companies
            if ticker in state.company_data
        ]
        signal_summary = (
            f"Detected {len(detection.signals)} evidence-backed competitive signal"
            f"{'s' if len(detection.signals) != 1 else ''}."
            if detection.signals
            else "No comparison crossed the current deterministic signal thresholds."
        )

        result = ResearchResult(
            run_id=str(uuid4()),
            target_company=request.target_company,
            competitors=request.competitors,
            generated_at=datetime.now(UTC),
            summary=(
                f"Compared {request.target_company} with {', '.join(request.competitors)} across "
                f"{len(analysis.comparisons)} supported dimensions. {signal_summary}"
            ),
            research_plan=state.plan,
            company_profiles=company_profiles,
            financial_snapshots=[
                state.financial_data[ticker]
                for ticker in state.plan.companies
                if ticker in state.financial_data
            ],
            comparisons=analysis.comparisons,
            evidence=analysis.evidence,
            signals=detection.signals,
            marketing_implications=detection.implications,
            sources=state.sources,
            warnings=warnings,
        )

        if self._synthesizer is not None:
            try:
                enriched = await self._synthesizer.enrich(result)
                provider = getattr(self._synthesizer, "provider_name", "LLM")
                result = ResearchResult.model_validate(
                    enriched.model_copy(
                        update={"llm_provider": provider, "llm_status": "grounded"}
                    ).model_dump()
                )
            except SynthesisError as exc:
                provider = getattr(self._synthesizer, "provider_name", "LLM")
                result = result.model_copy(
                    update={"llm_provider": provider, "llm_status": "fallback"}
                )
                result.warnings.append(
                    f"{provider} synthesis was unavailable; deterministic output was retained. {exc}"
                )

        if self._memory is not None:
            try:
                result = self._memory.compare_and_store(result)
            except RuntimeError as exc:
                result.warnings.append(
                    f"Previous-run comparison was unavailable; this run was not persisted. {exc}"
                )
        return result

    async def collect_research(self, request: ResearchRequest) -> ResearchState:
        """Collect provider-neutral data and expose state for testing and diagnostics."""
        plan = self._planner.create_plan(request)
        state = ResearchState(request=request, plan=plan)

        pending: dict[tuple[DataKind, str], Awaitable[Any]] = {}
        for ticker in plan.companies:
            pending[(DataKind.COMPANY, ticker)] = self._tools.get_company(ticker)
            pending[(DataKind.FINANCIALS, ticker)] = self._tools.get_financials(ticker)
            pending[(DataKind.INDUSTRY, ticker)] = self._tools.get_industry(ticker)
            pending[(DataKind.NEWS, ticker)] = self._tools.get_news(ticker)

        keys = list(pending)
        results = await asyncio.gather(*pending.values(), return_exceptions=True)

        for (kind, ticker), result in zip(keys, results, strict=True):
            if isinstance(result, DataToolError):
                state.warnings.append(str(result))
                continue
            if isinstance(result, BaseException):
                raise result

            if kind is DataKind.COMPANY:
                state.company_data[ticker] = result
            elif kind is DataKind.FINANCIALS:
                state.financial_data[ticker] = result
            elif kind is DataKind.INDUSTRY:
                state.industry_data[ticker] = result
            elif kind is DataKind.NEWS:
                state.news_data[ticker] = result

        try:
            state.sources = await self._tools.get_sources()
        except DataToolError as exc:
            state.warnings.append(f"Source metadata is unavailable: {exc}")

        return state
