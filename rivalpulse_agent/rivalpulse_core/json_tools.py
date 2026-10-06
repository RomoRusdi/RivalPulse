"""Normalized JSON-file adapter for CLI development and data-owner handoff."""

from __future__ import annotations

from pathlib import Path

from pydantic import ValidationError

from .schemas import (
    CompanyProfile,
    FinancialSnapshot,
    IndustryContext,
    NewsItem,
    NormalizedDataBundle,
    SourceReference,
)
from .tools import DataNotFoundError, DataToolError


class JsonCompetitiveDataTools:
    """Load provider-neutral data from a validated local JSON document."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        try:
            raw = self.path.read_text(encoding="utf-8")
        except OSError as exc:
            raise DataToolError(f"Could not read normalized data file: {self.path}") from exc
        try:
            self.bundle = NormalizedDataBundle.model_validate_json(raw)
        except ValidationError as exc:
            raise DataToolError(
                f"Normalized data file does not match the RivalPulse contract: {exc}"
            ) from exc

        self._companies = {item.ticker: item for item in self.bundle.companies}
        self._financials = {item.ticker: item for item in self.bundle.financials}
        self._industries = {item.ticker: item for item in self.bundle.industries}
        self._news: dict[str, list[NewsItem]] = {
            ticker: [] for ticker in self._companies
        }
        for item in self.bundle.news:
            self._news.setdefault(item.company, []).append(item)

    @property
    def available_tickers(self) -> list[str]:
        return list(self._companies)

    async def get_company(self, ticker: str) -> CompanyProfile:
        return self._get(self._companies, ticker, "company")

    async def get_financials(self, ticker: str) -> FinancialSnapshot:
        return self._get(self._financials, ticker, "financials")

    async def get_industry(self, ticker: str) -> IndustryContext:
        return self._get(self._industries, ticker, "industry")

    async def get_news(self, ticker: str) -> list[NewsItem]:
        normalized = ticker.upper()
        if normalized not in self._companies:
            raise DataNotFoundError(f"news data is unavailable for {normalized}")
        return [item.model_copy(deep=True) for item in self._news.get(normalized, [])]

    async def get_sources(self) -> list[SourceReference]:
        return [item.model_copy(deep=True) for item in self.bundle.sources]

    @staticmethod
    def _get(records: dict[str, object], ticker: str, kind: str):
        normalized = ticker.upper()
        try:
            item = records[normalized]
        except KeyError as exc:
            raise DataNotFoundError(f"{kind} data is unavailable for {normalized}") from exc
        return item.model_copy(deep=True)
