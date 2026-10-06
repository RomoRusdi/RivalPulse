"""Provider-neutral data interfaces consumed by the RivalPulse agent."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from .schemas import (
    CompanyProfile,
    FinancialSnapshot,
    IndustryContext,
    NewsItem,
    SourceReference,
)


class DataToolError(Exception):
    """Base exception for normalized data-tool failures."""


class DataNotFoundError(DataToolError):
    """Raised when a normalized record does not exist for a ticker."""


@runtime_checkable
class CompetitiveDataTools(Protocol):
    """Contract implemented by mock and future Sectors-backed adapters."""

    async def get_company(self, ticker: str) -> CompanyProfile:
        """Return a normalized company profile."""
        ...

    async def get_financials(self, ticker: str) -> FinancialSnapshot:
        """Return a normalized financial snapshot."""
        ...

    async def get_industry(self, ticker: str) -> IndustryContext:
        """Return normalized industry context."""
        ...

    async def get_news(self, ticker: str) -> list[NewsItem]:
        """Return normalized recent event or news items."""
        ...

    async def get_sources(self) -> list[SourceReference]:
        """Return source metadata referenced by normalized records."""
        ...
