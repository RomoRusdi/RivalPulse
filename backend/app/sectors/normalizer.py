from typing import Any

from pydantic import BaseModel


# =========================================================
# NORMALIZED MODELS
# =========================================================


class CompanyData(BaseModel):
    ticker: str
    company_name: str
    sector: str | None = None
    industry: str | None = None
    country: str | None = None
    description: str | None = None


class FinancialData(BaseModel):
    ticker: str
    currency: str | None = None
    revenue: float | None = None
    revenue_growth_pct: float | None = None
    net_income: float | None = None
    net_income_growth_pct: float | None = None
    period: str | None = None


class IndustryData(BaseModel):
    ticker: str
    sector: str | None = None
    industry: str | None = None
    market: str | None = None


class NewsItem(BaseModel):
    ticker: str
    title: str
    summary: str | None = None
    source: str | None = None
    published_at: str | None = None
    url: str | None = None


# =========================================================
# BASIC HELPERS
# =========================================================


def _safe_float(
    value: Any,
) -> float | None:

    if value is None:
        return None

    try:
        numeric = float(value)

        if numeric != numeric:
            return None

        return numeric

    except (TypeError, ValueError):
        return None


def _get_info(
    data: dict[str, Any],
) -> dict[str, Any]:

    info = data.get("info")

    if not isinstance(info, dict):
        return {}

    return info


def _get_info_value(
    data: dict[str, Any],
    names: list[str],
) -> float | None:

    info = _get_info(data)

    for name in names:

        value = _safe_float(
            info.get(name)
        )

        if value is not None:
            return value

    return None


# =========================================================
# STATEMENT HELPERS
# =========================================================


def _get_statement_columns(
    statement: Any,
) -> list[Any]:

    if statement is None:
        return []

    columns = getattr(
        statement,
        "columns",
        None,
    )

    if columns is None:
        return []

    return list(columns)


def _find_statement_row(
    statement: Any,
    possible_names: list[str],
) -> Any:

    if statement is None:
        return None

    index = getattr(
        statement,
        "index",
        None,
    )

    if index is None:
        return None

    # -----------------------------------------------------
    # Exact match
    # -----------------------------------------------------

    for name in possible_names:

        if name in index:
            return name

    # -----------------------------------------------------
    # Case-insensitive match
    # -----------------------------------------------------

    normalized_index = {
        str(item).strip().lower(): item
        for item in index
    }

    for name in possible_names:

        key = (
            str(name)
            .strip()
            .lower()
        )

        if key in normalized_index:
            return normalized_index[key]

    # -----------------------------------------------------
    # Normalized-space match
    # -----------------------------------------------------

    def normalize_name(
        value: str,
    ) -> str:

        return (
            value
            .lower()
            .replace("_", "")
            .replace(" ", "")
            .replace("-", "")
        )

    normalized_rows = {
        normalize_name(str(item)): item
        for item in index
    }

    for name in possible_names:

        key = normalize_name(
            str(name)
        )

        if key in normalized_rows:
            return normalized_rows[key]

    return None


def _get_statement_value(
    statement: Any,
    possible_names: list[str],
    column: Any = None,
) -> float | None:

    row_name = _find_statement_row(
        statement,
        possible_names,
    )

    if row_name is None:
        return None

    try:

        row = statement.loc[row_name]

        if column is not None:

            return _safe_float(
                row[column]
            )

        if hasattr(
            row,
            "iloc",
        ) and len(row) > 0:

            return _safe_float(
                row.iloc[0]
            )

        return _safe_float(row)

    except (
        KeyError,
        IndexError,
        TypeError,
    ):

        return None


# =========================================================
# GROWTH CALCULATION
# =========================================================


def _calculate_growth(
    current: float | None,
    previous: float | None,
) -> float | None:

    if current is None:
        return None

    if previous is None:
        return None

    if previous == 0:
        return None

    return (
        (current - previous)
        / abs(previous)
    ) * 100.0


def _normalize_yahoo_growth(
    value: Any,
) -> float | None:

    numeric = _safe_float(value)

    if numeric is None:
        return None

    # Yahoo commonly returns 0.xx
    # for percentage-based growth fields.
    if abs(numeric) < 1:

        return numeric * 100.0

    return numeric


# =========================================================
# COMPANY
# =========================================================


def normalize_company(
    data: dict[str, Any],
) -> CompanyData:

    return CompanyData(
        ticker=str(
            data.get("symbol")
            or data.get("ticker")
            or ""
        ).upper(),

        company_name=str(
            data.get("company_name")
            or ""
        ),

        sector=data.get("sector"),

        industry=data.get(
            "industry"
        ),

        country=data.get(
            "country"
        ),

        description=data.get(
            "description"
        ),
    )


# =========================================================
# FINANCIALS
# =========================================================


def normalize_financials(
    data: dict[str, Any],
) -> FinancialData:

    symbol = str(
        data.get("symbol")
        or data.get("ticker")
        or ""
    ).upper()

    income_statement = data.get(
        "income_statement"
    )

    columns = _get_statement_columns(
        income_statement
    )

    current_period = (
        columns[0]
        if len(columns) >= 1
        else None
    )

    previous_period = (
        columns[1]
        if len(columns) >= 2
        else None
    )

    # =====================================================
    # REVENUE
    # =====================================================

    revenue_names = [
        "Total Revenue",
        "Operating Revenue",
        "TotalRevenue",
        "OperatingRevenue",
        "Revenue",
    ]

    revenue = _get_statement_value(
        income_statement,
        revenue_names,
        current_period,
    )

    previous_revenue = _get_statement_value(
        income_statement,
        revenue_names,
        previous_period,
    )

    # Yahoo info fallback
    if revenue is None:

        revenue = _get_info_value(
            data,
            [
                "totalRevenue",
                "operatingRevenue",
            ],
        )

    # =====================================================
    # NET INCOME
    # =====================================================

    net_income_names = [
        "Net Income",
        "Net Income Common Stockholders",
        "Net Income Including Noncontrolling Interests",
        "NetIncome",
        "NetIncomeCommonStockholders",
    ]

    net_income = _get_statement_value(
        income_statement,
        net_income_names,
        current_period,
    )

    previous_net_income = _get_statement_value(
        income_statement,
        net_income_names,
        previous_period,
    )

    # Yahoo info fallback
    if net_income is None:

        net_income = _get_info_value(
            data,
            [
                "netIncomeToCommon",
                "netIncome",
            ],
        )

    # =====================================================
    # GROWTH FROM FINANCIAL STATEMENT
    # =====================================================

    revenue_growth = _calculate_growth(
        revenue,
        previous_revenue,
    )

    net_income_growth = _calculate_growth(
        net_income,
        previous_net_income,
    )

    # =====================================================
    # GROWTH FALLBACK FROM YAHOO INFO
    # =====================================================

    if revenue_growth is None:

        info = _get_info(data)

        revenue_growth = (
            _normalize_yahoo_growth(
                info.get(
                    "revenueGrowth"
                )
            )
        )

    if net_income_growth is None:

        info = _get_info(data)

        net_income_growth = (
            _normalize_yahoo_growth(
                info.get(
                    "earningsGrowth"
                )
            )
        )

    # =====================================================
    # LOGGING
    # =====================================================

    print(
        "[NORMALIZER] Financial data:",
        {
            "ticker": symbol,
            "revenue": revenue,
            "previous_revenue": previous_revenue,
            "revenue_growth_pct": revenue_growth,
            "net_income": net_income,
            "previous_net_income": previous_net_income,
            "net_income_growth_pct": (
                net_income_growth
            ),
            "period": (
                str(current_period)
                if current_period is not None
                else None
            ),
        },
    )

    return FinancialData(
        ticker=symbol,

        currency=data.get(
            "currency"
        ),

        revenue=revenue,

        revenue_growth_pct=(
            revenue_growth
        ),

        net_income=net_income,

        net_income_growth_pct=(
            net_income_growth
        ),

        period=(
            str(current_period)
            if current_period is not None
            else None
        ),
    )


# =========================================================
# INDUSTRY
# =========================================================


def normalize_industry(
    data: dict[str, Any],
) -> IndustryData:

    return IndustryData(
        ticker=str(
            data.get("symbol")
            or data.get("ticker")
            or ""
        ).upper(),

        sector=data.get(
            "sector"
        ),

        industry=data.get(
            "industry"
        ),

        market=data.get(
            "country"
        ),
    )


# =========================================================
# NEWS
# =========================================================


def normalize_news(
    data: dict[str, Any],
) -> list[NewsItem]:

    items = data.get(
        "items",
        [],
    )

    if not isinstance(
        items,
        list,
    ):

        raise ValueError(
            "Invalid Yahoo Finance news "
            "response: 'items' must be a list."
        )

    normalized = []

    for item in items:

        if not isinstance(
            item,
            dict,
        ):
            continue

        title = item.get(
            "title"
        )

        if not title:
            continue

        normalized.append(
            NewsItem(
                ticker=str(
                    item.get("symbol")
                    or item.get("ticker")
                    or ""
                ).upper(),

                title=str(
                    title
                ),

                summary=item.get(
                    "summary"
                ),

                source=item.get(
                    "source"
                ),

                published_at=item.get(
                    "published_at"
                ),

                url=item.get(
                    "url"
                ),
            )
        )

    return normalized