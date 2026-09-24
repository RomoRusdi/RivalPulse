from app.agent.comparison import FinancialComparison
from app.agent.schemas import Evidence, Signal


class SignalDetector:

    REVENUE_GROWTH_GAP_MEDIUM = 3.0
    REVENUE_GROWTH_GAP_HIGH = 7.0

    NET_INCOME_GROWTH_GAP_MEDIUM = 5.0
    NET_INCOME_GROWTH_GAP_HIGH = 10.0

    def detect(
        self,
        comparison: FinancialComparison,
    ) -> list[Signal]:

        signals: list[Signal] = []

        signals.extend(
            self._detect_revenue_growth_signal(
                comparison
            )
        )

        signals.extend(
            self._detect_net_income_growth_signal(
                comparison
            )
        )

        signals.extend(
            self._detect_negative_revenue_growth(
                comparison
            )
        )

        return signals

    # =========================================================
    # REVENUE GROWTH
    # =========================================================

    def _detect_revenue_growth_signal(
        self,
        comparison: FinancialComparison,
    ) -> list[Signal]:

        difference = (
            comparison.revenue_growth_difference_pct
        )

        if difference is None:
            return []

        target = comparison.target
        competitor = comparison.competitor

        target_growth = (
            target.financials.revenue_growth_pct
        )

        competitor_growth = (
            competitor.financials.revenue_growth_pct
        )

        if (
            target_growth is None
            or competitor_growth is None
        ):
            return []

        # -----------------------------------------------------
        # Target growth advantage
        # -----------------------------------------------------

        if (
            difference
            >= self.REVENUE_GROWTH_GAP_MEDIUM
        ):

            severity = (
                "HIGH"
                if difference
                >= self.REVENUE_GROWTH_GAP_HIGH
                else "MEDIUM"
            )

            evidence = [
                Evidence(
                    source="Yahoo Finance",
                    field="revenue_growth_pct",
                    value=target_growth,
                    comparison=(
                        f"{target.company.company_name}="
                        f"{target_growth:.2f}% vs "
                        f"{competitor.company.company_name}="
                        f"{competitor_growth:.2f}%"
                    ),
                ),
                Evidence(
                    source="Yahoo Finance",
                    field="revenue_growth_difference_pct",
                    value=difference,
                    comparison=(
                        f"Target minus competitor = "
                        f"{difference:.2f} "
                        "percentage points"
                    ),
                ),
            ]

            return [
                Signal(
                    type="REVENUE_GROWTH_ADVANTAGE",
                    severity=severity,
                    title=(
                        f"{target.company.company_name} "
                        "has higher revenue growth"
                    ),
                    description=(
                        f"{target.company.company_name} reported "
                        f"{target_growth:.2f}% revenue growth, "
                        f"compared with "
                        f"{competitor.company.company_name} "
                        f"at {competitor_growth:.2f}%. "
                        f"The difference is "
                        f"{difference:.2f} percentage points."
                    ),
                    evidence=evidence,
                    confidence=0.95,
                )
            ]

        # -----------------------------------------------------
        # Target growth disadvantage
        # -----------------------------------------------------

        if (
            difference
            <= -self.REVENUE_GROWTH_GAP_MEDIUM
        ):

            absolute_difference = abs(
                difference
            )

            severity = (
                "HIGH"
                if absolute_difference
                >= self.REVENUE_GROWTH_GAP_HIGH
                else "MEDIUM"
            )

            evidence = [
                Evidence(
                    source="Yahoo Finance",
                    field="revenue_growth_pct",
                    value=target_growth,
                    comparison=(
                        f"{target.company.company_name}="
                        f"{target_growth:.2f}% vs "
                        f"{competitor.company.company_name}="
                        f"{competitor_growth:.2f}%"
                    ),
                ),
                Evidence(
                    source="Yahoo Finance",
                    field="revenue_growth_difference_pct",
                    value=difference,
                    comparison=(
                        f"Target minus competitor = "
                        f"{difference:.2f} "
                        "percentage points"
                    ),
                ),
            ]

            return [
                Signal(
                    type="REVENUE_GROWTH_DISADVANTAGE",
                    severity=severity,
                    title=(
                        f"{target.company.company_name} "
                        "has lower revenue growth"
                    ),
                    description=(
                        f"{target.company.company_name} reported "
                        f"{target_growth:.2f}% revenue growth, "
                        f"compared with "
                        f"{competitor.company.company_name} "
                        f"at {competitor_growth:.2f}%. "
                        f"The difference is "
                        f"{absolute_difference:.2f} "
                        "percentage points in favor of "
                        f"{competitor.company.company_name}."
                    ),
                    evidence=evidence,
                    confidence=0.95,
                )
            ]

        return []

    # =========================================================
    # NET INCOME GROWTH
    # =========================================================

    def _detect_net_income_growth_signal(
        self,
        comparison: FinancialComparison,
    ) -> list[Signal]:

        difference = (
            comparison.net_income_growth_difference_pct
        )

        if difference is None:
            return []

        target = comparison.target
        competitor = comparison.competitor

        target_growth = (
            target.financials.net_income_growth_pct
        )

        competitor_growth = (
            competitor.financials.net_income_growth_pct
        )

        if (
            target_growth is None
            or competitor_growth is None
        ):
            return []

        # -----------------------------------------------------
        # Target advantage
        # -----------------------------------------------------

        if (
            difference
            >= self.NET_INCOME_GROWTH_GAP_MEDIUM
        ):

            severity = (
                "HIGH"
                if difference
                >= self.NET_INCOME_GROWTH_GAP_HIGH
                else "MEDIUM"
            )

            evidence = [
                Evidence(
                    source="Yahoo Finance",
                    field="net_income_growth_pct",
                    value=target_growth,
                    comparison=(
                        f"{target.company.company_name}="
                        f"{target_growth:.2f}% vs "
                        f"{competitor.company.company_name}="
                        f"{competitor_growth:.2f}%"
                    ),
                ),
                Evidence(
                    source="Yahoo Finance",
                    field="net_income_growth_difference_pct",
                    value=difference,
                    comparison=(
                        f"Target minus competitor = "
                        f"{difference:.2f} "
                        "percentage points"
                    ),
                ),
            ]

            return [
                Signal(
                    type="NET_INCOME_GROWTH_ADVANTAGE",
                    severity=severity,
                    title=(
                        f"{target.company.company_name} "
                        "has higher net income growth"
                    ),
                    description=(
                        f"{target.company.company_name} reported "
                        f"{target_growth:.2f}% net income growth, "
                        f"compared with "
                        f"{competitor.company.company_name} "
                        f"at {competitor_growth:.2f}%. "
                        f"The difference is "
                        f"{difference:.2f} percentage points."
                    ),
                    evidence=evidence,
                    confidence=0.95,
                )
            ]

        # -----------------------------------------------------
        # Target disadvantage
        # -----------------------------------------------------

        if (
            difference
            <= -self.NET_INCOME_GROWTH_GAP_MEDIUM
        ):

            absolute_difference = abs(
                difference
            )

            severity = (
                "HIGH"
                if absolute_difference
                >= self.NET_INCOME_GROWTH_GAP_HIGH
                else "MEDIUM"
            )

            evidence = [
                Evidence(
                    source="Yahoo Finance",
                    field="net_income_growth_pct",
                    value=target_growth,
                    comparison=(
                        f"{target.company.company_name}="
                        f"{target_growth:.2f}% vs "
                        f"{competitor.company.company_name}="
                        f"{competitor_growth:.2f}%"
                    ),
                ),
                Evidence(
                    source="Yahoo Finance",
                    field="net_income_growth_difference_pct",
                    value=difference,
                    comparison=(
                        f"Target minus competitor = "
                        f"{difference:.2f} "
                        "percentage points"
                    ),
                ),
            ]

            return [
                Signal(
                    type="NET_INCOME_GROWTH_DISADVANTAGE",
                    severity=severity,
                    title=(
                        f"{target.company.company_name} "
                        "has lower net income growth"
                    ),
                    description=(
                        f"{target.company.company_name} reported "
                        f"{target_growth:.2f}% net income growth, "
                        f"compared with "
                        f"{competitor.company.company_name} "
                        f"at {competitor_growth:.2f}%. "
                        f"The difference is "
                        f"{absolute_difference:.2f} "
                        "percentage points in favor of "
                        f"{competitor.company.company_name}."
                    ),
                    evidence=evidence,
                    confidence=0.95,
                )
            ]

        return []

    # =========================================================
    # NEGATIVE TARGET REVENUE GROWTH
    # =========================================================

    def _detect_negative_revenue_growth(
        self,
        comparison: FinancialComparison,
    ) -> list[Signal]:

        target = comparison.target

        growth = (
            target.financials.revenue_growth_pct
        )

        if growth is None or growth >= 0:
            return []

        evidence = [
            Evidence(
                source="Yahoo Finance",
                field="revenue_growth_pct",
                value=growth,
                comparison=(
                    f"{target.company.company_name} "
                    f"revenue growth={growth:.2f}%"
                ),
            )
        ]

        return [
            Signal(
                type="NEGATIVE_REVENUE_GROWTH",
                severity="HIGH",
                title=(
                    f"{target.company.company_name} "
                    "reports negative revenue growth"
                ),
                description=(
                    f"{target.company.company_name} reported "
                    f"{growth:.2f}% revenue growth for the "
                    "available comparison period."
                ),
                evidence=evidence,
                confidence=0.95,
            )
        ]