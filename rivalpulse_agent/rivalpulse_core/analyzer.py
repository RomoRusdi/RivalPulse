"""Deterministic company comparison and evidence extraction."""

from __future__ import annotations

from dataclasses import dataclass, field

from .schemas import (
    CompanyComparison,
    ComparisonValue,
    EvidenceCategory,
    EvidenceItem,
    ResearchState,
)


@dataclass(slots=True)
class AnalysisBundle:
    comparisons: list[CompanyComparison] = field(default_factory=list)
    evidence: list[EvidenceItem] = field(default_factory=list)
    evidence_by_metric: dict[str, dict[str, str]] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class MetricDefinition:
    field_name: str
    label: str
    unit: str


FINANCIAL_METRICS = (
    MetricDefinition("revenue_growth", "Revenue growth", "%"),
    MetricDefinition("net_income_growth", "Net income growth", "%"),
    MetricDefinition("operating_margin", "Operating margin", "%"),
    MetricDefinition("gross_margin", "Gross margin", "%"),
    MetricDefinition("profit_margin", "Profit margin", "%"),
    MetricDefinition("fifty_two_week_change", "52-week price change", "%"),
    MetricDefinition("dividend_yield", "Dividend yield", "%"),
    MetricDefinition("revenue", "Revenue", "currency"),
    MetricDefinition("net_income", "Net income", "currency"),
    MetricDefinition("ebitda", "EBITDA", "currency"),
    MetricDefinition("free_cash_flow", "Free cash flow", "currency"),
    MetricDefinition("total_cash", "Total cash", "currency"),
    MetricDefinition("total_debt", "Total debt", "currency"),
    MetricDefinition("market_cap", "Market capitalization", "currency"),
    MetricDefinition("enterprise_value", "Enterprise value", "currency"),
    MetricDefinition("trailing_pe", "Trailing P/E", "ratio"),
    MetricDefinition("forward_pe", "Forward P/E", "ratio"),
    MetricDefinition("price_to_book", "Price to book", "ratio"),
)


class CompetitiveAnalyzer:
    """Compare normalized values and create traceable factual evidence."""

    def analyze(self, state: ResearchState) -> AnalysisBundle:
        bundle = AnalysisBundle()
        sectors = {
            context.sector
            for context in state.industry_data.values()
            if context.sector is not None
        }
        if len(sectors) > 1:
            bundle.warnings.append(
                "The selection spans different sectors. Interpret direct financial comparisons with caution."
            )
        self._extract_company_evidence(state, bundle)
        self._analyze_financials(state, bundle)
        self._extract_news_evidence(state, bundle)
        self._analyze_activity(state, bundle)
        return bundle

    def _extract_company_evidence(self, state: ResearchState, bundle: AnalysisBundle) -> None:
        for ticker in state.plan.companies:
            profile = state.company_data.get(ticker)
            if profile is None:
                continue
            classification = " / ".join(
                value for value in (profile.sector, profile.industry) if value
            )
            details = profile.description or "No normalized company description is available."
            statement = f"{profile.name} ({ticker})"
            if classification:
                statement += f" is classified as {classification}."
            else:
                statement += "."
            statement += f" {details}"
            bundle.evidence.append(
                EvidenceItem(
                    id=self._next_evidence_id(bundle),
                    company=ticker,
                    category=EvidenceCategory.COMPANY,
                    statement=statement,
                    value=None,
                    period=None,
                    source_refs=profile.source_refs,
                )
            )

    def _analyze_financials(self, state: ResearchState, bundle: AnalysisBundle) -> None:
        target = state.request.target_company
        target_snapshot = state.financial_data.get(target)
        if target_snapshot is None:
            bundle.warnings.append(
                f"Financial comparisons were skipped because data is unavailable for target {target}."
            )
            return

        for metric in FINANCIAL_METRICS:
            target_value = getattr(target_snapshot, metric.field_name)
            if target_value is None:
                continue
            if metric.unit == "currency" and not target_snapshot.currency:
                bundle.warnings.append(
                    f"{metric.label} was not compared because {target}'s currency is unknown."
                )
                continue

            competitor_values: list[ComparisonValue] = []
            for ticker in state.request.competitors:
                snapshot = state.financial_data.get(ticker)
                value: float | None = None
                if snapshot is not None:
                    if (
                        metric.unit == "currency"
                        and snapshot.currency != target_snapshot.currency
                    ):
                        bundle.warnings.append(
                            f"{metric.label} for {ticker} was not compared because its currency "
                            f"({snapshot.currency or 'unknown'}) differs from {target}'s currency "
                            f"({target_snapshot.currency})."
                        )
                    elif snapshot.period == target_snapshot.period:
                        value = getattr(snapshot, metric.field_name)
                    else:
                        bundle.warnings.append(
                            f"{metric.label} for {ticker} was not compared because its period "
                            f"({snapshot.period}) differs from {target}'s period ({target_snapshot.period})."
                        )
                competitor_values.append(ComparisonValue(company=ticker, value=value))

            if not any(item.value is not None for item in competitor_values):
                continue

            values = [ComparisonValue(company=target, value=target_value), *competitor_values]
            available = [item for item in values if item.value is not None]
            highest = max(available, key=lambda item: item.value if item.value is not None else float("-inf"))
            lowest = min(available, key=lambda item: item.value if item.value is not None else float("inf"))
            spread = (highest.value or 0) - (lowest.value or 0)
            suffix = " percentage points" if metric.unit == "%" else ""
            observation = (
                f"{highest.company} has the highest available {metric.label.lower()} value; "
                f"the observed spread is {spread:.1f}{suffix}."
            )

            comparison = CompanyComparison(
                metric=metric.field_name,
                label=metric.label,
                period=target_snapshot.period,
                unit=metric.unit,
                target=values[0],
                competitors=competitor_values,
                observation=observation,
            )
            bundle.comparisons.append(comparison)

            metric_evidence: dict[str, str] = {}
            for item in available:
                snapshot = state.financial_data[item.company]
                evidence_id = self._next_evidence_id(bundle)
                formatted = f"{item.value:.1f}%" if metric.unit == "%" else f"{item.value:,.1f}"
                bundle.evidence.append(
                    EvidenceItem(
                        id=evidence_id,
                        company=item.company,
                        category=EvidenceCategory.FINANCIAL,
                        statement=(
                            f"{item.company} reported {metric.label.lower()} of {formatted} "
                            f"for {snapshot.period}."
                        ),
                        value=item.value,
                        period=snapshot.period,
                        source_refs=snapshot.source_refs,
                    )
                )
                metric_evidence[item.company] = evidence_id
            bundle.evidence_by_metric[metric.field_name] = metric_evidence

    def _extract_news_evidence(
        self,
        state: ResearchState,
        bundle: AnalysisBundle,
    ) -> None:
        for ticker in state.plan.companies:
            for item in state.news_data.get(ticker, [])[:10]:
                evidence_id = self._next_evidence_id(bundle)
                statement = item.title
                if item.summary:
                    statement += f" — {item.summary}"
                bundle.evidence.append(
                    EvidenceItem(
                        id=evidence_id,
                        company=ticker,
                        category=EvidenceCategory.NEWS,
                        statement=statement,
                        value=item.title,
                        period=item.published_at.date().isoformat(),
                        source_refs=[item.source_ref],
                    )
                )
                bundle.evidence_by_metric[
                    f"news_event:{ticker}:{item.source_ref}"
                ] = {ticker: evidence_id}

    def _analyze_activity(self, state: ResearchState, bundle: AnalysisBundle) -> None:
        target = state.request.target_company
        if target not in state.news_data:
            bundle.warnings.append(
                f"Recent activity comparison was skipped because news data is unavailable for target {target}."
            )
            return

        target_value = len(state.news_data[target])
        competitor_values = [
            ComparisonValue(
                company=ticker,
                value=float(len(state.news_data[ticker])) if ticker in state.news_data else None,
            )
            for ticker in state.request.competitors
        ]
        if not any(item.value is not None for item in competitor_values):
            return

        values = [ComparisonValue(company=target, value=float(target_value)), *competitor_values]
        available = [item for item in values if item.value is not None]
        if not any((item.value or 0) > 0 for item in available):
            return
        leader = max(available, key=lambda item: item.value if item.value is not None else -1)
        observation = (
            f"{leader.company} has the highest normalized news/event count "
            f"in the available collection window ({int(leader.value or 0)} items)."
        )
        bundle.comparisons.append(
            CompanyComparison(
                metric="recent_activity",
                label="Recent tracked events",
                period="Latest normalized collection window",
                unit="items",
                target=values[0],
                competitors=competitor_values,
                observation=observation,
            )
        )

        metric_evidence: dict[str, str] = {}
        for item in available:
            news_items = state.news_data[item.company]
            evidence_id = self._next_evidence_id(bundle)
            source_refs = list(dict.fromkeys(news.source_ref for news in news_items))
            bundle.evidence.append(
                EvidenceItem(
                    id=evidence_id,
                    company=item.company,
                    category=EvidenceCategory.NEWS,
                    statement=(
                        f"{item.company} has {int(item.value or 0)} normalized news/event items "
                        "in the latest collection window."
                    ),
                    value=int(item.value or 0),
                    period="Latest normalized collection window",
                    source_refs=source_refs,
                )
            )
            metric_evidence[item.company] = evidence_id
        bundle.evidence_by_metric["recent_activity"] = metric_evidence

    @staticmethod
    def _next_evidence_id(bundle: AnalysisBundle) -> str:
        return f"EV-{len(bundle.evidence) + 1:03d}"
