from typing import Any

import yfinance as yf

from app.sectors.providers.base import MarketDataProvider


class YahooFinanceProvider(MarketDataProvider):

    def _ticker(self, ticker: str):
        return yf.Ticker(ticker.upper().strip())

    def get_company(self, ticker: str) -> dict[str, Any]:
        stock = self._ticker(ticker)

        info = stock.info

        return {
            "ticker": ticker.upper(),
            "company_name": (
                info.get("longName")
                or info.get("shortName")
                or ticker.upper()
            ),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "country": info.get("country"),
            "description": info.get("longBusinessSummary"),
        }

    def get_financials(self, ticker: str) -> dict[str, Any]:
        stock = self._ticker(ticker)

        statement = stock.income_stmt

        if statement is None or statement.empty:
            return {
                "ticker": ticker.upper(),
                "currency": None,
                "revenue": None,
                "revenue_growth_pct": None,
                "net_income": None,
                "net_income_growth_pct": None,
                "period": None,
            }

        revenue = self._latest_value(
            statement,
            "Total Revenue",
        )

        net_income = self._latest_value(
            statement,
            "Net Income",
        )

        previous_revenue = self._previous_value(
            statement,
            "Total Revenue",
        )

        previous_net_income = self._previous_value(
            statement,
            "Net Income",
        )

        return {
            "ticker": ticker.upper(),
            "currency": self._get_currency(stock),
            "revenue": revenue,
            "revenue_growth_pct": self._growth(
                revenue,
                previous_revenue,
            ),
            "net_income": net_income,
            "net_income_growth_pct": self._growth(
                net_income,
                previous_net_income,
            ),
            "period": self._latest_period(statement),
        }

    def get_industry(self, ticker: str) -> dict[str, Any]:
        stock = self._ticker(ticker)
        info = stock.info

        return {
            "ticker": ticker.upper(),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "market": info.get("exchange"),
        }

    def get_news(self, ticker: str) -> list[dict[str, Any]]:
        stock = self._ticker(ticker)

        try:
            news = stock.news or []
        except Exception:
            return []

        results = []

        for item in news[:10]:
            content = item.get("content", {})

            results.append(
                {
                    "ticker": ticker.upper(),
                    "title": content.get("title"),
                    "summary": content.get("summary"),
                    "source": self._get_source(content),
                    "published_at": content.get("pubDate"),
                    "url": self._get_url(content),
                }
            )

        return results

    @staticmethod
    def _latest_value(statement, row_name):
        if row_name not in statement.index:
            return None

        values = statement.loc[row_name].dropna()

        if values.empty:
            return None

        return float(values.iloc[0])

    @staticmethod
    def _previous_value(statement, row_name):
        if row_name not in statement.index:
            return None

        values = statement.loc[row_name].dropna()

        if len(values) < 2:
            return None

        return float(values.iloc[1])

    @staticmethod
    def _latest_period(statement):
        if statement.empty:
            return None

        return str(statement.columns[0].date())

    @staticmethod
    def _growth(
        current: float | None,
        previous: float | None,
    ):
        if current is None or previous in (None, 0):
            return None

        return ((current - previous) / abs(previous)) * 100

    @staticmethod
    def _get_currency(stock):
        try:
            return stock.fast_info.get("currency")
        except Exception:
            return None

    @staticmethod
    def _get_source(content):
        provider = content.get("provider", {})

        if isinstance(provider, dict):
            return provider.get("displayName")

        return None

    @staticmethod
    def _get_url(content):
        canonical = content.get("canonicalUrl", {})

        if isinstance(canonical, dict):
            return canonical.get("url")

        return None