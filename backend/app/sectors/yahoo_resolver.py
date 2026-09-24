from typing import Any
import yfinance as yf


class YahooFinanceResolver:
    def search(self, query: str) -> list[dict[str, Any]]:
        search = yf.Search(
            query,
            max_results=10,
            news_count=0,
            enable_fuzzy_query=True,
        )

        results = []

        for quote in search.quotes:
            results.append(
                {
                    "symbol": quote.get("symbol"),
                    "name": (
                        quote.get("longname")
                        or quote.get("shortname")
                        or ""
                    ),
                    "exchange": quote.get("exchange"),
                    "type": quote.get("quoteType"),
                }
            )

        return results

    def resolve(self, query: str) -> dict[str, Any]:
        results = self.search(query)

        if not results:
            raise ValueError(
                f'Company "{query}" was not found on Yahoo Finance.'
            )

        # Prefer equity results
        equities = [
            item
            for item in results
            if item.get("type") == "EQUITY"
        ]

        if equities:
            return equities[0]

        return results[0]