from app.agent.comparison import (
    CompanyComparisonData,
    ComparisonEngine,
)
from app.agent.signals import SignalDetector
from app.sectors.normalizer import (
    normalize_company,
    normalize_financials,
    normalize_industry,
)


def test_normalized_data_to_signal():

    target = CompanyComparisonData(
        ticker="ISAT",
        company=normalize_company(
            {
                "ticker": "ISAT",
                "company_name": "Indosat Ooredoo Hutchison",
                "sector": "Telecommunications",
                "industry": "Wireless Telecommunications",
                "country": "Indonesia",
            }
        ),
        financials=normalize_financials(
            {
                "ticker": "ISAT",
                "currency": "IDR",
                "revenue": 56_500_000_000_000,
                "revenue_growth_pct": 8.4,
                "net_income": 7_200_000_000_000,
                "net_income_growth_pct": 12.1,
                "period": "FY2025",
            }
        ),
        industry=normalize_industry(
            {
                "ticker": "ISAT",
                "sector": "Telecommunications",
                "industry": "Wireless Telecommunications",
                "market": "Indonesia",
            }
        ),
    )

    competitor = CompanyComparisonData(
        ticker="TLKM",
        company=normalize_company(
            {
                "ticker": "TLKM",
                "company_name": "Telkom Indonesia",
                "sector": "Telecommunications",
                "industry": "Integrated Telecommunications Services",
                "country": "Indonesia",
            }
        ),
        financials=normalize_financials(
            {
                "ticker": "TLKM",
                "currency": "IDR",
                "revenue": 150_000_000_000_000,
                "revenue_growth_pct": 4.7,
                "net_income": 25_000_000_000_000,
                "net_income_growth_pct": 3.8,
                "period": "FY2025",
            }
        ),
        industry=normalize_industry(
            {
                "ticker": "TLKM",
                "sector": "Telecommunications",
                "industry": "Integrated Telecommunications Services",
                "market": "Indonesia",
            }
        ),
    )

    comparison = ComparisonEngine().compare(
        target=target,
        competitor=competitor,
    )

    signals = SignalDetector().detect(comparison)

    signal_types = {
        signal.type
        for signal in signals
    }

    assert "REVENUE_GROWTH_GAP" in signal_types
    assert "NET_INCOME_GROWTH_GAP" in signal_types

    for signal in signals:
        assert signal.evidence