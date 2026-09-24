from app.agent.comparison import (
    CompanyComparisonData,
    ComparisonEngine,
)
from app.agent.signals import SignalDetector
from app.sectors.normalizer import (
    CompanyData,
    FinancialData,
    IndustryData,
)


def make_company(
    ticker: str,
    revenue_growth: float,
    net_income_growth: float,
) -> CompanyComparisonData:

    return CompanyComparisonData(
        ticker=ticker,
        company=CompanyData(
            ticker=ticker,
            company_name=f"{ticker} Test Company",
            sector="Telecommunications",
            industry="Wireless Telecommunications",
            country="Indonesia",
            description="Deterministic test company.",
        ),
        financials=FinancialData(
            ticker=ticker,
            currency="IDR",
            revenue=100_000_000_000,
            revenue_growth_pct=revenue_growth,
            net_income=10_000_000_000,
            net_income_growth_pct=net_income_growth,
            period="FY2025",
        ),
        industry=IndustryData(
            ticker=ticker,
            sector="Telecommunications",
            industry="Wireless Telecommunications",
            market="Indonesia",
        ),
    )


def test_revenue_growth_signal_is_detected():

    target = make_company(
        ticker="ISAT",
        revenue_growth=8.4,
        net_income_growth=12.1,
    )

    competitor = make_company(
        ticker="TLKM",
        revenue_growth=4.7,
        net_income_growth=3.8,
    )

    comparison = ComparisonEngine().compare(
        target=target,
        competitor=competitor,
    )

    signals = SignalDetector().detect(comparison)

    revenue_signal = next(
        signal
        for signal in signals
        if signal.type == "REVENUE_GROWTH_GAP"
    )

    assert revenue_signal.severity == "MEDIUM"
    assert len(revenue_signal.evidence) >= 2
    assert revenue_signal.confidence == 1.0

    assert "8.4" in revenue_signal.description
    assert "4.7" in revenue_signal.description
    assert "3.70" in revenue_signal.description


def test_high_revenue_growth_signal():

    target = make_company(
        ticker="ISAT",
        revenue_growth=15.0,
        net_income_growth=12.0,
    )

    competitor = make_company(
        ticker="TLKM",
        revenue_growth=5.0,
        net_income_growth=3.0,
    )

    comparison = ComparisonEngine().compare(
        target=target,
        competitor=competitor,
    )

    signals = SignalDetector().detect(comparison)

    revenue_signal = next(
        signal
        for signal in signals
        if signal.type == "REVENUE_GROWTH_GAP"
    )

    assert revenue_signal.severity == "HIGH"


def test_no_revenue_signal_below_threshold():

    target = make_company(
        ticker="ISAT",
        revenue_growth=6.0,
        net_income_growth=5.0,
    )

    competitor = make_company(
        ticker="TLKM",
        revenue_growth=4.0,
        net_income_growth=3.0,
    )

    comparison = ComparisonEngine().compare(
        target=target,
        competitor=competitor,
    )

    signals = SignalDetector().detect(comparison)

    revenue_signals = [
        signal
        for signal in signals
        if signal.type == "REVENUE_GROWTH_GAP"
    ]

    assert revenue_signals == []


def test_negative_revenue_growth():

    target = make_company(
        ticker="ISAT",
        revenue_growth=-2.5,
        net_income_growth=-1.0,
    )

    competitor = make_company(
        ticker="TLKM",
        revenue_growth=4.0,
        net_income_growth=3.0,
    )

    comparison = ComparisonEngine().compare(
        target=target,
        competitor=competitor,
    )

    signals = SignalDetector().detect(comparison)

    negative_growth_signal = next(
        signal
        for signal in signals
        if signal.type == "NEGATIVE_REVENUE_GROWTH"
    )

    assert negative_growth_signal.severity == "HIGH"
    assert len(negative_growth_signal.evidence) == 1
    assert negative_growth_signal.evidence[0].value == -2.5


def test_signal_has_evidence():

    target = make_company(
        ticker="ISAT",
        revenue_growth=10.0,
        net_income_growth=12.0,
    )

    competitor = make_company(
        ticker="TLKM",
        revenue_growth=4.0,
        net_income_growth=3.0,
    )

    comparison = ComparisonEngine().compare(
        target=target,
        competitor=competitor,
    )

    signals = SignalDetector().detect(comparison)

    assert signals

    for signal in signals:
        assert signal.evidence
        assert signal.confidence >= 0.0
        assert signal.confidence <= 1.0