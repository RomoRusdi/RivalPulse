import re


class TickerResolver:

    COMPANY_ALIASES = {
        "TELKOM": "TLKM",
        "TELKOM INDONESIA": "TLKM",
        "INDOSAT": "ISAT",
        "INDOSAT OOREDOO HUTCHISON": "ISAT",
        "XL": "EXCL",
        "XL AXIATA": "EXCL",
        "BANK BCA": "BBCA",
        "BCA": "BBCA",
        "BANK BRI": "BBRI",
        "BRI": "BBRI",
        "BANK MANDIRI": "BMRI",
        "MANDIRI": "BMRI",
        "GOTO": "GOTO",
        "GOJEK": "GOTO",
    }

    def resolve(self, message: str) -> list[str]:

        upper = message.upper()

        found = []

        # Detect aliases/company names.
        for alias, ticker in self.COMPANY_ALIASES.items():

            if re.search(
                rf"\b{re.escape(alias)}\b",
                upper,
            ):
                if ticker not in found:
                    found.append(ticker)

        # Detect Indonesian stock tickers.
        ticker_matches = re.findall(
            r"\b[A-Z]{4}\b",
            upper,
        )

        for ticker in ticker_matches:

            if ticker not in found:
                found.append(ticker)

        return found