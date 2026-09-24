from dataclasses import dataclass

from app.sectors.normalizer import (
    CompanyData,
    FinancialData,
    IndustryData,
)


@dataclass
class CompanyComparisonData:
    ticker: str
    company: CompanyData
    financials: FinancialData
    industry: IndustryData


@dataclass
class FinancialComparison:
    target: CompanyComparisonData
    competitor: CompanyComparisonData

    revenue_growth_difference_pct: float | None
    net_income_growth_difference_pct: float | None


class ComparisonEngine:

    def compare(
        self,
        target: CompanyComparisonData,
        competitor: CompanyComparisonData,
    ) -> FinancialComparison:

        # =========================================================
        # Revenue growth comparison
        # =========================================================

        revenue_difference = self._difference(
            target.financials.revenue_growth_pct,
            competitor.financials.revenue_growth_pct,
        )

        # =========================================================
        # Net income growth comparison
        # =========================================================

        net_income_difference = self._difference(
            target.financials.net_income_growth_pct,
            competitor.financials.net_income_growth_pct,
        )

        return FinancialComparison(
            target=target,
            competitor=competitor,
            revenue_growth_difference_pct=(
                revenue_difference
            ),
            net_income_growth_difference_pct=(
                net_income_difference
            ),
        )

    @staticmethod
    def _difference(
        target_value: float | None,
        competitor_value: float | None,
    ) -> float | None:

        if target_value is None:
            return None

        if competitor_value is None:
            return None

        return target_value - competitor_value