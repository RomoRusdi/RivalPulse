from abc import ABC, abstractmethod
from typing import Any


class MarketDataProvider(ABC):

    @abstractmethod
    def search_company(self, query: str) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def get_company(self, symbol: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_financials(self, symbol: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_industry(self, symbol: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_news(self, symbol: str) -> list[dict[str, Any]]:
        raise NotImplementedError