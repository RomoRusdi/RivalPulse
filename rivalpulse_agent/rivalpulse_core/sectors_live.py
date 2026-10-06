"""Sectors Financial API v2 adapter for the RivalPulse agent.

Sectors is intentionally the primary financial source. The adapter makes one
coalesced company-report request and one bounded news request per company, then
normalizes provider payloads behind the same tool contract used by the agent.
"""

from __future__ import annotations

import asyncio
import hashlib
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from .schemas import (
    CompanyProfile,
    FinancialSnapshot,
    IndustryContext,
    NewsItem,
    SourceReference,
    SourceType,
)
from .tools import DataNotFoundError, DataToolError


@dataclass(slots=True)
class _CachedReport:
    company: CompanyProfile
    financials: FinancialSnapshot
    industry: IndustryContext
    source: SourceReference
    cached_at: float


@dataclass(slots=True)
class _CachedNews:
    items: list[NewsItem]
    sources: list[SourceReference]
    cached_at: float


class SectorsCompetitiveDataTools:
    """Bounded, cached implementation of ``CompetitiveDataTools`` for Sectors v2."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://api.sectors.app/v2",
        timeout_seconds: float = 30,
        report_cache_ttl_seconds: float = 86_400,
        news_cache_ttl_seconds: float = 3_600,
        news_limit: int = 20,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        if not api_key.strip():
            raise ValueError("SECTORS_API_KEY is required for the Sectors provider")
        if not 1 <= news_limit <= 30:
            raise ValueError("Sectors news_limit must be between 1 and 30")
        self.api_key = api_key.strip()
        self.base_url = base_url.rstrip("/")
        self.report_cache_ttl_seconds = report_cache_ttl_seconds
        self.news_cache_ttl_seconds = news_cache_ttl_seconds
        self.news_limit = news_limit
        self._client = client or httpx.AsyncClient(
            timeout=timeout_seconds,
            trust_env=False,
            headers={"Authorization": self.api_key},
        )
        self._owns_client = client is None
        self._reports: dict[str, _CachedReport] = {}
        self._news: dict[str, _CachedNews] = {}
        self._report_locks: dict[str, asyncio.Lock] = {}
        self._news_locks: dict[str, asyncio.Lock] = {}

    async def get_company(self, ticker: str) -> CompanyProfile:
        return (await self._report(ticker)).company.model_copy(deep=True)

    async def get_financials(self, ticker: str) -> FinancialSnapshot:
        return (await self._report(ticker)).financials.model_copy(deep=True)

    async def get_industry(self, ticker: str) -> IndustryContext:
        return (await self._report(ticker)).industry.model_copy(deep=True)

    async def get_news(self, ticker: str) -> list[NewsItem]:
        return [item.model_copy(deep=True) for item in (await self._get_news(ticker)).items]

    async def get_sources(self) -> list[SourceReference]:
        sources = {record.source.id: record.source for record in self._reports.values()}
        for record in self._news.values():
            sources.update({source.id: source for source in record.sources})
        return [source.model_copy(deep=True) for source in sources.values()]

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _report(self, ticker: str) -> _CachedReport:
        symbol = self._symbol(ticker)
        cached = self._reports.get(symbol)
        if cached and self._fresh(cached.cached_at, self.report_cache_ttl_seconds):
            return cached
        lock = self._report_locks.setdefault(symbol, asyncio.Lock())
        async with lock:
            cached = self._reports.get(symbol)
            if cached and self._fresh(cached.cached_at, self.report_cache_ttl_seconds):
                return cached
            endpoint = f"/company/report/{symbol}/"
            payload = await self._get(endpoint, {"sections": "financials,overview"})
            record = self._normalize_report(symbol, payload, endpoint)
            self._reports[symbol] = record
            return record

    async def _get_news(self, ticker: str) -> _CachedNews:
        symbol = self._symbol(ticker)
        cached = self._news.get(symbol)
        if cached and self._fresh(cached.cached_at, self.news_cache_ttl_seconds):
            return cached
        lock = self._news_locks.setdefault(symbol, asyncio.Lock())
        async with lock:
            cached = self._news.get(symbol)
            if cached and self._fresh(cached.cached_at, self.news_cache_ttl_seconds):
                return cached
            payload = await self._get(
                "/news/",
                {
                    "extension": "idx",
                    "symbols": symbol,
                    "limit": self.news_limit,
                    "offset": 0,
                },
            )
            record = self._normalize_news(symbol, payload)
            self._news[symbol] = record
            return record

    async def _get(self, endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
        for attempt in range(3):
            try:
                response = await self._client.get(
                    f"{self.base_url}{endpoint}",
                    params=params,
                    headers={"Authorization": self.api_key},
                )
                if response.status_code in {401, 403}:
                    raise DataToolError("Sectors rejected the configured API credentials")
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt < 2:
                        await asyncio.sleep(2**attempt)
                        continue
                response.raise_for_status()
                if len(response.content) > 2_000_000:
                    raise DataToolError("Sectors response exceeded the 2 MB safety limit")
                payload = response.json()
                if not isinstance(payload, dict):
                    raise DataToolError("Sectors returned a non-object response")
                return payload
            except DataToolError:
                raise
            except (httpx.HTTPError, ValueError) as exc:
                if attempt == 2:
                    raise DataToolError(f"Sectors request failed for {endpoint}") from exc
                await asyncio.sleep(2**attempt)
        raise DataToolError(f"Sectors request failed for {endpoint}")

    def _normalize_report(
        self,
        symbol: str,
        payload: dict[str, Any],
        endpoint: str,
    ) -> _CachedReport:
        returned_symbol = str(payload.get("symbol") or "").upper().removesuffix(".JK")
        if returned_symbol and returned_symbol != symbol:
            raise DataToolError(
                f"Sectors returned {returned_symbol} for requested company {symbol}"
            )
        financials = payload.get("financials") or {}
        rows = financials.get("historical_financials") if isinstance(financials, dict) else None
        if not isinstance(rows, list):
            raise DataNotFoundError(f"Sectors financial history is unavailable for {symbol}")
        annual = sorted(
            [row for row in rows if isinstance(row, dict) and str(row.get("year", "")).isdigit()],
            key=lambda row: int(row["year"]),
            reverse=True,
        )
        if not annual:
            raise DataNotFoundError(f"Sectors financial history is unavailable for {symbol}")

        current = annual[0]
        previous = annual[1] if len(annual) > 1 else None
        period = str(current["year"])
        currency = self._text(financials.get("currency") or payload.get("currency"))
        overview = payload.get("overview") or {}
        overview = overview if isinstance(overview, dict) else {"summary": str(overview)}
        sector = self._text(overview.get("sector") or overview.get("sub_sector"))
        industry = self._text(overview.get("industry") or overview.get("sub_industry"))
        description = self._text(
            overview.get("description")
            or overview.get("company_description")
            or overview.get("summary")
        )
        retrieved_at = datetime.now(UTC)
        source_id = f"SECTORS-REPORT-{symbol}-{period}"
        source_url = f"{self.base_url}{endpoint}?sections=financials%2Coverview"
        source_refs = [source_id]

        revenue = self._number(current.get("revenue"))
        net_income = self._number(current.get("earnings") or current.get("net_income"))
        financial_snapshot = FinancialSnapshot(
            ticker=symbol,
            period=period,
            currency=currency,
            revenue=revenue,
            revenue_growth=self._growth(revenue, self._number(previous.get("revenue")) if previous else None),
            net_income=net_income,
            net_income_growth=self._growth(
                net_income,
                self._number(previous.get("earnings") or previous.get("net_income"))
                if previous
                else None,
            ),
            operating_margin=self._percent(current.get("operating_margin")),
            gross_margin=self._percent(current.get("gross_margin")),
            profit_margin=self._percent(current.get("profit_margin")),
            ebitda=self._number(current.get("ebitda")),
            free_cash_flow=self._number(current.get("free_cash_flow")),
            total_cash=self._number(current.get("cash") or current.get("total_cash")),
            total_debt=self._number(current.get("debt") or current.get("total_debt")),
            source_refs=source_refs,
        )
        company = CompanyProfile(
            ticker=symbol,
            name=self._text(payload.get("company_name")) or symbol,
            sector=sector,
            industry=industry,
            description=description,
            source_refs=source_refs,
        )
        context = IndustryContext(
            ticker=symbol,
            sector=sector,
            industry=industry,
            summary=description,
            source_refs=source_refs,
        )
        source = SourceReference(
            id=source_id,
            type=SourceType.SECTORS,
            title=f"Sectors v2 company report for {symbol}",
            url=source_url,
            period=period,
            retrieved_at=retrieved_at,
        )
        return _CachedReport(
            company=company,
            financials=financial_snapshot,
            industry=context,
            source=source,
            cached_at=time.monotonic(),
        )

    def _normalize_news(self, symbol: str, payload: dict[str, Any]) -> _CachedNews:
        rows = payload.get("results")
        if not isinstance(rows, list):
            raise DataToolError("Sectors returned an invalid news response")
        retrieved_at = datetime.now(UTC)
        items: list[NewsItem] = []
        sources: list[SourceReference] = []
        for index, row in enumerate(rows[: self.news_limit], start=1):
            if not isinstance(row, dict):
                continue
            title = self._text(row.get("title"))
            published = self._datetime(row.get("timestamp") or row.get("published_at"))
            if not title or published is None:
                continue
            url = self._url(row.get("source") or row.get("url"))
            source_id = "SECTORS-NEWS-" + hashlib.sha256(
                f"{symbol}|{title}|{published.isoformat()}".encode("utf-8")
            ).hexdigest()[:16].upper()
            items.append(
                NewsItem(
                    company=symbol,
                    title=title,
                    summary=self._text(row.get("body") or row.get("summary")),
                    published_at=published,
                    source_name=self._text(row.get("publisher")) or "Sectors v2 news",
                    source_url=url,
                    source_ref=source_id,
                )
            )
            sources.append(
                SourceReference(
                    id=source_id,
                    type=SourceType.NEWS,
                    title=title,
                    url=url,
                    published_at=published,
                    retrieved_at=retrieved_at,
                )
            )
        return _CachedNews(items=items, sources=sources, cached_at=time.monotonic())

    @staticmethod
    def _symbol(value: str) -> str:
        symbol = value.strip().upper().removesuffix(".JK")
        if not symbol or not symbol.isalnum() or len(symbol) > 16:
            raise DataToolError(f"Invalid IDX ticker: {value!r}")
        return symbol

    @staticmethod
    def _fresh(cached_at: float, ttl: float) -> bool:
        return time.monotonic() - cached_at < ttl

    @staticmethod
    def _number(value: Any) -> float | None:
        if value is None or isinstance(value, bool):
            return None
        try:
            number = Decimal(str(value).replace(",", ""))
            return float(number) if number.is_finite() else None
        except (InvalidOperation, ValueError):
            return None

    @classmethod
    def _percent(cls, value: Any) -> float | None:
        number = cls._number(value)
        if number is None:
            return None
        return number * 100 if abs(number) <= 1 else number

    @staticmethod
    def _growth(current: float | None, previous: float | None) -> float | None:
        if current is None or previous is None or previous <= 0:
            return None
        return round((current - previous) / previous * 100, 4)

    @staticmethod
    def _text(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _datetime(value: Any) -> datetime | None:
        if isinstance(value, (int, float)):
            try:
                return datetime.fromtimestamp(float(value), tz=UTC)
            except (ValueError, OSError):
                return None
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
            except ValueError:
                return None
        return None

    @staticmethod
    def _url(value: Any) -> str | None:
        return value if isinstance(value, str) and value.startswith(("http://", "https://")) else None
