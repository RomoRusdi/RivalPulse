from typing import Any

from app.sectors.service import SectorsDataService


sectors_service = SectorsDataService()


def get_company(
    company: str,
) -> dict[str, Any]:
    """
    Get normalized company information from Yahoo Finance.

    The input is a natural-language company name or search query.
    Yahoo Finance resolves the corresponding symbol internally.
    """

    company = company.strip()

    print(f"[TOOL] get_company company={company}")

    result = sectors_service.get_company(company)

    return result.model_dump()


def get_financials(
    company: str,
) -> dict[str, Any]:
    """
    Get normalized financial information from Yahoo Finance.

    The input is a natural-language company name or search query.
    """

    company = company.strip()

    print(f"[TOOL] get_financials company={company}")

    result = sectors_service.get_financials(company)

    return result.model_dump()


def get_industry(
    company: str,
) -> dict[str, Any]:
    """
    Get normalized industry information from Yahoo Finance.

    The input is a natural-language company name or search query.
    """

    company = company.strip()

    print(f"[TOOL] get_industry company={company}")

    result = sectors_service.get_industry(company)

    return result.model_dump()


def get_news(
    company: str,
) -> dict[str, Any]:
    """
    Get normalized recent company news from Yahoo Finance.

    The input is a natural-language company name or search query.
    """

    company = company.strip()

    print(f"[TOOL] get_news company={company}")

    news = sectors_service.get_news(company)

    return {
        "items": [
            item.model_dump()
            for item in news
        ]
    }


TOOL_DEFINITIONS = [
    {
        "name": "get_company",
        "description": (
            "Get normalized company information from Yahoo Finance. "
            "Accepts a company name or natural-language company search query. "
            "Do not require the user to provide a stock ticker."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "company": {
                    "type": "string",
                    "description": (
                        "Company name or natural-language company search query, "
                        "for example 'Telkom Indonesia', 'Indosat', or 'Bank BCA'."
                    ),
                }
            },
            "required": ["company"],
        },
    },
    {
        "name": "get_financials",
        "description": (
            "Get normalized financial information from Yahoo Finance. "
            "Accepts a company name or natural-language company search query. "
            "Yahoo Finance resolves the company internally."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "company": {
                    "type": "string",
                    "description": (
                        "Company name or natural-language company search query."
                    ),
                }
            },
            "required": ["company"],
        },
    },
    {
        "name": "get_industry",
        "description": (
            "Get normalized sector and industry information from Yahoo Finance. "
            "Accepts a company name or natural-language company search query."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "company": {
                    "type": "string",
                    "description": (
                        "Company name or natural-language company search query."
                    ),
                }
            },
            "required": ["company"],
        },
    },
    {
        "name": "get_news",
        "description": (
            "Get normalized recent company news from Yahoo Finance. "
            "Accepts a company name or natural-language company search query."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "company": {
                    "type": "string",
                    "description": (
                        "Company name or natural-language company search query."
                    ),
                }
            },
            "required": ["company"],
        },
    },
]


TOOL_FUNCTIONS = {
    "get_company": get_company,
    "get_financials": get_financials,
    "get_industry": get_industry,
    "get_news": get_news,
}