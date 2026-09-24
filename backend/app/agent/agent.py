import logging
import time
from typing import Any

from app.agent.comparison import (
    CompanyComparisonData,
    ComparisonEngine,
)
from app.agent.executor import ToolExecutor
from app.agent.planner import ResearchPlanner
from app.agent.report import ReportGenerator
from app.agent.schemas import (
    CompanySnapshot,
    CompetitorComparison,
    FinancialContext,
    ResearchResult,
    ResearchSource,
    ToolCall,
)
from app.agent.signals import SignalDetector
from app.llm.base import LLMProvider

from app.sectors.normalizer import (
    CompanyData,
    FinancialData,
    IndustryData,
    NewsItem,
)


logger = logging.getLogger("rivalpulse.agent")


class ResearchAgent:

    def __init__(
        self,
        llm: LLMProvider,
        executor: ToolExecutor,
        planner: ResearchPlanner | None = None,
        comparison_engine: ComparisonEngine | None = None,
        signal_detector: SignalDetector | None = None,
    ):
        self.llm = llm
        self.executor = executor

        self.planner = planner or ResearchPlanner()

        self.comparison_engine = (
            comparison_engine or ComparisonEngine()
        )

        self.signal_detector = (
            signal_detector or SignalDetector()
        )

        self.report_generator = ReportGenerator(
            llm
        )

    # =========================================================
    # MAIN RESEARCH PIPELINE
    # =========================================================

    async def run_research(
        self,
        company: str,
        competitors: list[str],
    ) -> ResearchResult:

        started_at = time.perf_counter()

        company = company.strip()

        competitors = [
            competitor.strip()
            for competitor in competitors
            if competitor.strip()
        ]

        if not company:
            raise ValueError(
                "Research company cannot be empty."
            )

        logger.info(
            "RESEARCH_STARTED company=%s competitors=%s",
            company,
            competitors,
        )

        # =====================================================
        # 1. CREATE PLAN
        # =====================================================

        plan = self.planner.create_plan(
            company=company,
            competitors=competitors,
        )

        logger.info(
            "RESEARCH_PLAN target=%s competitors=%s tasks=%d",
            plan.target,
            plan.competitors,
            len(plan.tasks),
        )

        # =====================================================
        # 2. EXECUTE TOOLS
        # =====================================================

        collected_data: dict[
            str,
            dict[str, Any],
        ] = {}

        tool_calls: list[ToolCall] = []

        for task in plan.tasks:

            if not task.company:
                continue

            logger.info(
                "TOOL_CALL tool=%s company=%s",
                task.name,
                task.company,
            )

            tool_call = ToolCall(
                name=task.name,
                arguments={
                    "company": task.company,
                },
            )

            tool_calls.append(tool_call)

            result = self.executor.execute(
                tool_call
            )

            if not result.success:
                raise RuntimeError(
                    f"Tool failed: "
                    f"{task.name}({task.company}): "
                    f"{result.error}"
                )

            collected_data.setdefault(
                task.company,
                {},
            )

            collected_data[
                task.company
            ][task.name] = (
                result.data or {}
            )

        # =====================================================
        # 3. TARGET DATA
        # =====================================================

        target_raw = collected_data.get(
            company
        )

        if not target_raw:
            raise RuntimeError(
                f"No research data collected for "
                f"company '{company}'."
            )

        # -----------------------------------------------------
        # IMPORTANT
        #
        # SectorsDataService already normalizes data.
        #
        # tools.py then calls model_dump().
        #
        # Therefore we use model_validate() here.
        #
        # We DO NOT call normalize_company(),
        # normalize_financials(), etc. again.
        # -----------------------------------------------------

        target_company = (
            CompanyData.model_validate(
                target_raw["get_company"]
            )
        )

        target_financials = (
            FinancialData.model_validate(
                target_raw["get_financials"]
            )
        )

        target_industry = (
            IndustryData.model_validate(
                target_raw["get_industry"]
            )
        )

        target_news_data = (
            target_raw.get(
                "get_news",
                {},
            )
        )

        target_news = [
            NewsItem.model_validate(
                item
            )
            for item in target_news_data.get(
                "items",
                [],
            )
        ]

        logger.info(
            "TARGET_NORMALIZED "
            "ticker=%s name=%s "
            "revenue=%s revenue_growth=%s "
            "net_income=%s net_income_growth=%s",

            target_company.ticker,

            target_company.company_name,

            target_financials.revenue,

            target_financials.revenue_growth_pct,

            target_financials.net_income,

            target_financials.net_income_growth_pct,
        )

        # =====================================================
        # 4. TARGET COMPARISON DATA
        # =====================================================

        target_data = CompanyComparisonData(
            ticker=target_company.ticker,
            company=target_company,
            financials=target_financials,
            industry=target_industry,
        )

        comparisons: list[
            CompetitorComparison
        ] = []

        all_signals = []

        competitor_company_names: list[str] = []

        # =====================================================
        # 5. COMPETITOR PROCESSING
        # =====================================================

        for competitor in competitors:

            competitor_raw = (
                collected_data.get(
                    competitor
                )
            )

            if not competitor_raw:
                raise RuntimeError(
                    f"No research data collected "
                    f"for competitor "
                    f"'{competitor}'."
                )

            # -------------------------------------------------
            # Validate already-normalized data
            # -------------------------------------------------

            competitor_company = (
                CompanyData.model_validate(
                    competitor_raw[
                        "get_company"
                    ]
                )
            )

            competitor_financials = (
                FinancialData.model_validate(
                    competitor_raw[
                        "get_financials"
                    ]
                )
            )

            competitor_industry = (
                IndustryData.model_validate(
                    competitor_raw[
                        "get_industry"
                    ]
                )
            )

            competitor_news_data = (
                competitor_raw.get(
                    "get_news",
                    {},
                )
            )

            competitor_news = [
                NewsItem.model_validate(
                    item
                )
                for item in competitor_news_data.get(
                    "items",
                    [],
                )
            ]

            # -------------------------------------------------
            # Save company name
            # -------------------------------------------------

            competitor_company_names.append(
                competitor_company.company_name
            )

            logger.info(
                "COMPETITOR_NORMALIZED "
                "ticker=%s name=%s "
                "revenue=%s revenue_growth=%s "
                "net_income=%s "
                "net_income_growth=%s",

                competitor_company.ticker,

                competitor_company.company_name,

                competitor_financials.revenue,

                competitor_financials.revenue_growth_pct,

                competitor_financials.net_income,

                competitor_financials.net_income_growth_pct,
            )

            # =================================================
            # 5A. BUILD COMPETITOR DATA
            # =================================================

            competitor_data = CompanyComparisonData(
                ticker=(
                    competitor_company.ticker
                ),

                company=(
                    competitor_company
                ),

                financials=(
                    competitor_financials
                ),

                industry=(
                    competitor_industry
                ),
            )

            # =================================================
            # 5B. COMPARISON
            # =================================================

            comparison = (
                self.comparison_engine.compare(
                    target=target_data,
                    competitor=competitor_data,
                )
            )

            logger.info(
                "COMPARISON_RESULT "
                "target=%s competitor=%s "
                "revenue_gap=%s "
                "net_income_gap=%s",

                target_company.ticker,

                competitor_company.ticker,

                comparison.revenue_growth_difference_pct,

                comparison.net_income_growth_difference_pct,
            )

            comparisons.append(
                self._build_competitor_comparison(
                    comparison
                )
            )

            # =================================================
            # 5C. SIGNAL DETECTION
            # =================================================

            signals = (
                self.signal_detector.detect(
                    comparison
                )
            )

            logger.info(
                "SIGNAL_RESULT "
                "target=%s competitor=%s count=%d",

                target_company.ticker,

                competitor_company.ticker,

                len(signals),
            )

            all_signals.extend(
                signals
            )

        # =====================================================
        # 6. FINANCIAL CONTEXT
        # =====================================================

        financial_context = FinancialContext(
            revenue=(
                target_financials.revenue
            ),

            revenue_growth_pct=(
                target_financials
                .revenue_growth_pct
            ),

            net_income=(
                target_financials.net_income
            ),

            net_income_growth_pct=(
                target_financials
                .net_income_growth_pct
            ),

            currency=(
                target_financials.currency
            ),

            period=(
                target_financials.period
            ),
        )

        logger.info(
            "FINANCIAL_CONTEXT %s",
            financial_context.model_dump(),
        )

        # =====================================================
        # 7. COMPANY SNAPSHOT
        # =====================================================

        company_snapshot = CompanySnapshot(
            ticker=(
                target_company.ticker
            ),

            company_name=(
                target_company.company_name
            ),

            sector=(
                target_company.sector
            ),

            industry=(
                target_company.industry
            ),

            country=(
                target_company.country
            ),

            description=(
                target_company.description
            ),
        )

        # =====================================================
        # 8. SOURCES
        # =====================================================

        sources = self._build_sources(
            target_news=target_news,
            competitor_data=collected_data,
        )

        logger.info(
            "SOURCES_BUILT count=%d",
            len(sources),
        )

        # =====================================================
        # 9. LLM REPORT
        # =====================================================

        logger.info(
            "REPORT_GENERATION company=%s",
            target_company.company_name,
        )

        summary, implications = (
            await self.report_generator.generate(
                company=(
                    target_company.company_name
                ),

                competitors=(
                    competitor_company_names
                ),

                company_snapshot=(
                    company_snapshot
                ),

                financial_context=(
                    financial_context
                ),

                comparisons=[
                    comparison.model_dump()
                    for comparison
                    in comparisons
                ],

                signals=(
                    all_signals
                ),

                sources=[
                    source.model_dump()
                    for source
                    in sources
                ],
            )
        )

        # =====================================================
        # 10. COMPLETE
        # =====================================================

        elapsed = (
            time.perf_counter()
            - started_at
        )

        logger.info(
            "RESEARCH_COMPLETED "
            "company=%s "
            "signals=%d "
            "comparisons=%d "
            "sources=%d "
            "duration_ms=%.2f",

            target_company.company_name,

            len(all_signals),

            len(comparisons),

            len(sources),

            elapsed * 1000,
        )

        # =====================================================
        # 11. RETURN
        # =====================================================

        return ResearchResult(

            company=(
                target_company.company_name
            ),

            competitors=(
                competitor_company_names
            ),

            summary=summary,

            company_snapshot=(
                company_snapshot
            ),

            financial_context=(
                financial_context
            ),

            signals=(
                all_signals
            ),

            competitor_comparison=(
                comparisons
            ),

            marketing_implications=(
                implications
            ),

            sources=(
                sources
            ),

            execution_metadata={
                "tool_calls": len(
                    tool_calls
                ),

                "signals_detected": len(
                    all_signals
                ),

                "comparisons": len(
                    comparisons
                ),

                "sources": len(
                    sources
                ),

                "duration_ms": round(
                    elapsed * 1000,
                    2,
                ),
            },
        )

    # =========================================================
    # COMPETITOR COMPARISON BUILDER
    # =========================================================

    @staticmethod
    def _build_competitor_comparison(
        comparison,
    ) -> CompetitorComparison:

        observations = []

        if (
            comparison.revenue_growth_difference_pct
            is not None
        ):
            observations.append(
                "Revenue growth difference: "
                f"{comparison.revenue_growth_difference_pct:.2f} "
                "percentage points."
            )

        if (
            comparison.net_income_growth_difference_pct
            is not None
        ):
            observations.append(
                "Net income growth difference: "
                f"{comparison.net_income_growth_difference_pct:.2f} "
                "percentage points."
            )

        return CompetitorComparison(

            company=(
                comparison
                .target
                .company
                .company_name
            ),

            competitor=(
                comparison
                .competitor
                .company
                .company_name
            ),

            revenue_growth_difference_pct=(
                comparison
                .revenue_growth_difference_pct
            ),

            net_income_growth_difference_pct=(
                comparison
                .net_income_growth_difference_pct
            ),

            observations=(
                observations
            ),
        )

    # =========================================================
    # SOURCE BUILDER
    # =========================================================

    @staticmethod
    def _build_sources(
        target_news: list[NewsItem],
        competitor_data: dict[
            str,
            dict[str, Any],
        ],
    ) -> list[ResearchSource]:

        sources: list[
            ResearchSource
        ] = []

        seen: set[str] = set()

        # =====================================================
        # TARGET NEWS
        # =====================================================

        for item in target_news:

            if not item.url:
                continue

            if item.url in seen:
                continue

            seen.add(
                item.url
            )

            sources.append(
                ResearchSource(
                    ticker=item.ticker,

                    title=item.title,

                    source=item.source,

                    published_at=(
                        item.published_at
                    ),

                    url=item.url,
                )
            )

        # =====================================================
        # COMPETITOR NEWS
        # =====================================================

        for data in competitor_data.values():

            news_data = data.get(
                "get_news",
                {},
            )

            if not news_data:
                continue

            # tools.py returns:
            #
            # {
            #     "items": [...]
            # }

            for item_data in news_data.get(
                "items",
                [],
            ):

                item = NewsItem.model_validate(
                    item_data
                )

                if not item.url:
                    continue

                if item.url in seen:
                    continue

                seen.add(
                    item.url
                )

                sources.append(
                    ResearchSource(
                        ticker=item.ticker,

                        title=item.title,

                        source=item.source,

                        published_at=(
                            item.published_at
                        ),

                        url=item.url,
                    )
                )

        # =====================================================
        # LIMIT
        # =====================================================

        return sources[:20]