import logging

from app.sectors.client import SectorsClient
from app.sectors.normalizer import (
    CompanyData,
    FinancialData,
    IndustryData,
    NewsItem,
    normalize_company,
    normalize_financials,
    normalize_industry,
    normalize_news,
)

logger = logging.getLogger(__name__)


class SectorsDataService:

    def __init__(
        self,
        client: SectorsClient | None = None,
    ):
        self.client = client or SectorsClient()

    def get_company(
        self,
        company: str,
    ) -> CompanyData:

        company = company.strip()

        if not company:
            raise ValueError(
                "Company name cannot be empty."
            )

        raw_data = self.client.get_company(
            company
        )

        return normalize_company(
            raw_data
        )

    def get_financials(
        self,
        company: str,
    ) -> FinancialData:

        company = company.strip()

        if not company:
            raise ValueError(
                "Company name cannot be empty."
            )

        raw_data = self.client.get_financials(
            company
        )

        return normalize_financials(
            raw_data
        )

    def get_industry(
        self,
        company: str,
    ) -> IndustryData:

        company = company.strip()

        if not company:
            raise ValueError(
                "Company name cannot be empty."
            )

        raw_data = self.client.get_industry(
            company
        )

        return normalize_industry(
            raw_data
        )

    def get_news(
        self,
        company: str,
    ) -> list[NewsItem]:

        company = company.strip()

        if not company:
            raise ValueError(
                "Company name cannot be empty."
            )

        raw_data = self.client.get_news(
            company
        )

        return normalize_news(
            raw_data
        )