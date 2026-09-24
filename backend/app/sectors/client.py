import logging
import re
from typing import Any

import yfinance as yf
from yfinance import EquityQuery


logger = logging.getLogger("rivalpulse.yahoo")


class SectorsClient:
    """
    Yahoo Finance client used by RivalPulse.

    Company names are resolved dynamically through Yahoo Finance.

    Resolution strategy:
    1. Try Yahoo Finance Search.
    2. For short/acronym-like queries, also load the Indonesian
       equity universe from Yahoo Finance Screener.
    3. Match the user query against Yahoo-provided:
       - ticker symbols
       - company names
       - dynamically generated acronyms
       - meaningful name tokens
    4. Prefer Indonesian (.JK) companies when the query matches
       an Indonesian company identity.
    5. Return the Yahoo-provided ticker.

    No hardcoded ticker/company mapping is used.
    No mock company data is used.
    """

    # Yahoo limits screen() to 250 records per request.
    _SCREEN_PAGE_SIZE = 250

    # Class-level cache so multiple SectorsClient instances do not
    # repeatedly download the same IDX universe.
    _idx_universe_cache: list[dict[str, Any]] | None = None

    # Generic company-name words that should not participate in
    # acronym or token matching.
    _IGNORED_NAME_WORDS = {
        "pt",
        "tbk",
        "persero",
        "inc",
        "incorporated",
        "corp",
        "corporation",
        "co",
        "company",
        "limited",
        "ltd",
        "plc",
        "llc",
        "holdings",
        "holding",
        "group",
        "the",
        "and",
        "&",
    }

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout

        logger.info(
            "Initialized Yahoo Finance client timeout=%s",
            self.timeout,
        )

    # =========================================================
    # TEXT HELPERS
    # =========================================================

    @staticmethod
    def _normalize_text(value: str) -> str:
        """
        Normalize text for matching.

        Example:
            "PT Bank Central Asia Tbk"
            ->
            "pt bank central asia tbk"
        """

        value = str(value or "").lower().strip()

        value = re.sub(
            r"[^a-z0-9]+",
            " ",
            value,
        )

        value = re.sub(
            r"\s+",
            " ",
            value,
        )

        return value.strip()

    @classmethod
    def _meaningful_tokens(
        cls,
        value: str,
    ) -> list[str]:
        """
        Return meaningful words from a company/query string.

        Corporate suffixes such as PT, Tbk, Persero, Inc, etc.
        are ignored.
        """

        normalized = cls._normalize_text(value)

        return [
            token
            for token in normalized.split()
            if token not in cls._IGNORED_NAME_WORDS
        ]

    @classmethod
    def _build_acronym(
        cls,
        company_name: str,
    ) -> str:
        """
        Dynamically generate an acronym from a company name.

        Examples:

            PT Bank Central Asia Tbk
            -> BCA

            PT Bank Rakyat Indonesia (Persero) Tbk
            -> BRI

            PT Telekomunikasi Indonesia Tbk
            -> TI
        """

        tokens = cls._meaningful_tokens(
            company_name
        )

        if not tokens:
            return ""

        return "".join(
            token[0]
            for token in tokens
        ).upper()

    @classmethod
    def _compact_query(
        cls,
        query: str,
    ) -> str:
        """
        Remove spaces and punctuation.

        Example:
            "BCA Indonesia"
            -> "BCAINDONESIA"
        """

        return re.sub(
            r"[^a-z0-9]",
            "",
            cls._normalize_text(query),
        ).upper()

    @classmethod
    def _query_acronym_match(
        cls,
        query: str,
        company_name: str,
    ) -> bool:
        """
        Match a query against a dynamically generated acronym.

        Examples:

            BCA
            -> PT Bank Central Asia Tbk
            -> True

            Bank BCA
            -> PT Bank Central Asia Tbk
            -> True

            BRI
            -> PT Bank Rakyat Indonesia (Persero) Tbk
            -> True
        """

        acronym = cls._build_acronym(
            company_name
        )

        if not acronym:
            return False

        query_compact = cls._compact_query(
            query
        )

        # Exact acronym.
        if query_compact == acronym:
            return True

        query_tokens = cls._meaningful_tokens(
            query
        )

        return any(
            token.upper() == acronym
            for token in query_tokens
        )

    @classmethod
    def _is_acronym_match(
        cls,
        query: str,
        company_name: str,
    ) -> bool:
        return cls._query_acronym_match(
            query,
            company_name,
        )

    @classmethod
    def _token_overlap(
        cls,
        query: str,
        company_name: str,
    ) -> int:
        """
        Count meaningful tokens shared between query and company name.

        Example:

            "Bank Central Asia"
            vs
            "PT Bank Central Asia Tbk"

            overlap = 3
        """

        query_tokens = set(
            cls._meaningful_tokens(query)
        )

        company_tokens = set(
            cls._meaningful_tokens(
                company_name
            )
        )

        if not query_tokens or not company_tokens:
            return 0

        return len(
            query_tokens.intersection(
                company_tokens
            )
        )

    @classmethod
    def _identity_match(
        cls,
        query: str,
        result: dict[str, Any],
    ) -> bool:
        """
        Determine whether a Yahoo candidate has an actual
        identity relationship with the user query.

        Important:
        Short queries must NOT be treated as substring matches.

        Example:

            BRI
            -> PT Bank Rakyat Indonesia
            -> True

            BRI
            -> Bristol-Myers Squibb
            -> False

        This prevents:

            "bri" in "bristol"

        from incorrectly resolving BRI to BMY.
        """

        query_normalized = cls._normalize_text(
            query
        )

        query_compact = cls._compact_query(
            query
        )

        symbol = str(
            result.get("symbol") or ""
        ).upper()

        company_name = str(
            result.get("company_name") or ""
        )

        company_normalized = cls._normalize_text(
            company_name
        )

        symbol_without_exchange = (
            symbol.split(".")[0]
        )

        # -----------------------------------------------------
        # 1. Exact ticker
        # -----------------------------------------------------

        if symbol_without_exchange == query_compact:
            return True

        # -----------------------------------------------------
        # 2. Exact company name
        # -----------------------------------------------------

        if company_normalized == query_normalized:
            return True

        # -----------------------------------------------------
        # 3. Dynamic acronym
        # -----------------------------------------------------

        if cls._is_acronym_match(
            query,
            company_name,
        ):
            return True

        # -----------------------------------------------------
        # 4. Meaningful token overlap
        #
        # BRI vs Bristol Myers Squibb:
        #
        # BRI
        # Bristol
        # Myers
        # Squibb
        #
        # No token overlap.
        # -----------------------------------------------------

        if cls._token_overlap(
            query,
            company_name,
        ) > 0:
            return True

        # -----------------------------------------------------
        # 5. Phrase matching
        #
        # IMPORTANT:
        # Only allow substring matching for multi-word queries.
        #
        # "Bank Central Asia"
        # ->
        # "PT Bank Central Asia Tbk"
        #
        # is valid.
        #
        # "BRI"
        # ->
        # "Bristol-Myers Squibb"
        #
        # is NOT valid.
        # -----------------------------------------------------

        query_tokens = cls._meaningful_tokens(
            query
        )

        if len(query_tokens) >= 2:
            if (
                query_normalized
                and query_normalized
                in company_normalized
            ):
                return True

        return False

    # =========================================================
    # YAHOO SEARCH
    # =========================================================

    def search_company(
        self,
        query: str,
        fuzzy: bool = False,
    ) -> list[dict[str, Any]]:
        """
        Search company candidates using Yahoo Finance Search.
        """

        query = query.strip()

        if not query:
            raise ValueError(
                "Company search query cannot be empty."
            )

        logger.info(
            "YAHOO_SEARCH query=%s fuzzy=%s",
            query,
            fuzzy,
        )

        try:
            search = yf.Search(
                query,
                max_results=10,
                news_count=0,
                enable_fuzzy_query=fuzzy,
                timeout=self.timeout,
                raise_errors=True,
            )

            quotes = search.quotes or []

        except Exception as exc:
            raise RuntimeError(
                f"Yahoo Finance search failed for "
                f'"{query}": {exc}'
            ) from exc

        results = []

        for quote in quotes:
            symbol = quote.get(
                "symbol"
            )

            if not symbol:
                continue

            results.append(
                {
                    "symbol": symbol,
                    "company_name": (
                        quote.get("longname")
                        or quote.get("shortname")
                        or ""
                    ),
                    "exchange": quote.get(
                        "exchange"
                    ),
                    "quote_type": quote.get(
                        "quoteType"
                    ),
                }
            )

        logger.info(
            "YAHOO_SEARCH_RESULTS "
            "query=%s fuzzy=%s count=%d",
            query,
            fuzzy,
            len(results),
        )

        return results

    # =========================================================
    # IDX UNIVERSE
    # =========================================================

    @classmethod
    def _load_idx_universe(
        cls,
        timeout: float = 30.0,
    ) -> list[dict[str, Any]]:
        """
        Load the Indonesian equity universe dynamically
        from Yahoo Finance Screener.

        Yahoo currently limits each request to 250 records,
        so the complete universe is loaded using offsets:

            0
            250
            500
            750
            ...

        No ticker/company names are hardcoded.
        """

        if cls._idx_universe_cache is not None:
            logger.info(
                "YAHOO_IDX_CACHE_HIT count=%d",
                len(cls._idx_universe_cache),
            )

            return cls._idx_universe_cache

        logger.info(
            "YAHOO_IDX_UNIVERSE_LOADING"
        )

        query = EquityQuery(
            "eq",
            [
                "exchange",
                "JKT",
            ],
        )

        all_quotes: list[dict[str, Any]] = []

        offset = 0

        while True:
            logger.info(
                "YAHOO_IDX_SCREEN offset=%d size=%d",
                offset,
                cls._SCREEN_PAGE_SIZE,
            )

            try:
                response = yf.screen(
                    query,
                    offset=offset,
                    size=cls._SCREEN_PAGE_SIZE,
                )

            except Exception as exc:
                raise RuntimeError(
                    "Yahoo Finance IDX universe lookup failed: "
                    f"{exc}"
                ) from exc

            quotes = response.get(
                "quotes",
                [],
            )

            if not quotes:
                break

            for quote in quotes:
                symbol = str(
                    quote.get("symbol")
                    or ""
                ).upper().strip()

                if not symbol:
                    continue

                company_name = (
                    quote.get("longName")
                    or quote.get("longname")
                    or quote.get("shortName")
                    or quote.get("shortname")
                    or ""
                )

                quote_type = (
                    quote.get("quoteType")
                    or quote.get("quote_type")
                    or ""
                )

                exchange = (
                    quote.get("exchange")
                    or ""
                )

                all_quotes.append(
                    {
                        "symbol": symbol,
                        "company_name": str(
                            company_name
                        ),
                        "exchange": str(
                            exchange
                        ),
                        "quote_type": str(
                            quote_type
                        ),
                    }
                )

            total = response.get(
                "total"
            )

            logger.info(
                "YAHOO_IDX_SCREEN_RESULT "
                "offset=%d returned=%d total=%s",
                offset,
                len(quotes),
                total,
            )

            # Stop when Yahoo says the complete universe
            # has been loaded.
            if (
                total is not None
                and len(all_quotes) >= int(total)
            ):
                break

            # Defensive stop if Yahoo returns fewer
            # records than requested.
            if len(quotes) < cls._SCREEN_PAGE_SIZE:
                break

            offset += cls._SCREEN_PAGE_SIZE

        # -----------------------------------------------------
        # Deduplicate by symbol.
        # -----------------------------------------------------

        unique: dict[
            str,
            dict[str, Any],
        ] = {}

        for item in all_quotes:
            symbol = item["symbol"]

            if symbol not in unique:
                unique[symbol] = item

        universe = list(
            unique.values()
        )

        if not universe:
            raise LookupError(
                "Yahoo Finance returned an empty "
                "Indonesian equity universe."
            )

        cls._idx_universe_cache = universe

        logger.info(
            "YAHOO_IDX_UNIVERSE_LOADED count=%d",
            len(universe),
        )

        return universe

    # =========================================================
    # RESOLUTION CANDIDATE COLLECTION
    # =========================================================

    def _collect_search_candidates(
        self,
        query: str,
    ) -> list[dict[str, Any]]:
        """
        Collect candidates from Yahoo Search using several
        generic search variations.

        No company-specific names or tickers are used.
        """

        search_queries = [
            (query, False),
            (f"{query} Indonesia", False),
            (f"{query} IDX", False),
            (f"{query} stock", False),
            (f"Bank {query}", False),
            (f"{query} bank Indonesia", False),
            (query, True),
        ]

        all_results: list[
            dict[str, Any]
        ] = []

        seen_symbols: set[str] = set()

        for search_query, fuzzy in search_queries:
            try:
                results = self.search_company(
                    search_query,
                    fuzzy=fuzzy,
                )

            except Exception as exc:
                logger.warning(
                    "YAHOO_SEARCH_FAILED "
                    "query=%s fuzzy=%s error=%s",
                    search_query,
                    fuzzy,
                    exc,
                )

                continue

            for result in results:
                symbol = str(
                    result.get("symbol")
                    or ""
                ).upper().strip()

                if not symbol:
                    continue

                if symbol in seen_symbols:
                    continue

                seen_symbols.add(symbol)

                all_results.append(
                    {
                        **result,
                        "symbol": symbol,
                    }
                )

        logger.info(
            "YAHOO_SEARCH_CANDIDATES "
            "query=%s count=%d",
            query,
            len(all_results),
        )

        return all_results

    # =========================================================
    # RESOLVE COMPANY
    # =========================================================

    def resolve_company(
        self,
        query: str,
    ) -> dict[str, Any]:
        """
        Resolve a natural-language company query into a
        Yahoo Finance company/ticker.

        Short queries such as:

            BCA
            BRI
            TLKM

        are always checked against Yahoo's Indonesian
        equity universe so global Yahoo results do not
        incorrectly win.
        """

        query = query.strip()

        if not query:
            raise ValueError(
                "Company query cannot be empty."
            )

        query_normalized = self._normalize_text(
            query
        )

        query_compact = self._compact_query(
            query
        )

        query_tokens = self._meaningful_tokens(
            query
        )

        # -----------------------------------------------------
        # STEP 1
        # Yahoo Search
        # -----------------------------------------------------

        search_candidates = (
            self._collect_search_candidates(
                query
            )
        )

        # -----------------------------------------------------
        # STEP 2
        # Determine whether this is a short/acronym-like
        # query.
        #
        # Examples:
        #
        # BCA
        # BRI
        # TLKM
        # Bank BCA
        #
        # These should be compared with the IDX universe.
        # -----------------------------------------------------

        is_short_query = (
            len(query_compact) <= 6
            or len(query_tokens) <= 2
        )

        # -----------------------------------------------------
        # STEP 3
        # For short queries, ALWAYS include IDX universe.
        #
        # This is important because Yahoo global Search can
        # return unrelated foreign companies.
        #
        # Example:
        #
        # BRI
        #   -> BMY
        #
        # while IDX contains:
        #   -> BBRI.JK
        #
        # Example:
        #
        # BCA
        #   -> BCAT
        #
        # while IDX contains:
        #   -> BBCA.JK
        # -----------------------------------------------------

        if is_short_query:
            logger.info(
                "YAHOO_SHORT_QUERY "
                "query=%s loading IDX universe",
                query,
            )

            idx_candidates = (
                self._load_idx_universe(
                    timeout=self.timeout
                )
            )

            search_candidates.extend(
                idx_candidates
            )

        else:
            # -------------------------------------------------
            # Longer natural-language query.
            # -------------------------------------------------

            strong_search_candidates = [
                candidate
                for candidate in search_candidates
                if self._identity_match(
                    query,
                    candidate,
                )
            ]

            # Prefer Indonesian identity matches if available.
            jk_search_candidates = [
                candidate
                for candidate
                in strong_search_candidates
                if str(
                    candidate.get("symbol")
                    or ""
                ).upper().endswith(".JK")
            ]

            if jk_search_candidates:
                search_candidates = (
                    jk_search_candidates
                )

            elif strong_search_candidates:
                search_candidates = (
                    strong_search_candidates
                )

            else:
                logger.info(
                    "YAHOO_SEARCH_NO_STRONG_MATCH "
                    "query=%s loading IDX universe",
                    query,
                )

                idx_candidates = (
                    self._load_idx_universe(
                        timeout=self.timeout
                    )
                )

                search_candidates.extend(
                    idx_candidates
                )

        # -----------------------------------------------------
        # Deduplicate candidates.
        # -----------------------------------------------------

        unique_candidates: dict[
            str,
            dict[str, Any],
        ] = {}

        for candidate in search_candidates:
            symbol = str(
                candidate.get("symbol")
                or ""
            ).upper().strip()

            if not symbol:
                continue

            unique_candidates[
                symbol
            ] = candidate

        all_results = list(
            unique_candidates.values()
        )

        if not all_results:
            raise LookupError(
                f'Company "{query}" was not found on Yahoo Finance.'
            )

        # -----------------------------------------------------
        # Candidate scoring
        # -----------------------------------------------------

        def score(
            result: dict[str, Any],
        ) -> int:
            symbol = str(
                result.get("symbol")
                or ""
            ).upper()

            company_name = str(
                result.get("company_name")
                or ""
            )

            company_normalized = (
                self._normalize_text(
                    company_name
                )
            )

            exchange = str(
                result.get("exchange")
                or ""
            ).upper()

            quote_type = str(
                result.get("quote_type")
                or ""
            ).upper()

            symbol_without_exchange = (
                symbol.split(".")[0]
            )

            exact_symbol = (
                symbol_without_exchange
                == query_compact
            )

            exact_name = (
                company_normalized
                == query_normalized
            )

            acronym_match = (
                self._is_acronym_match(
                    query,
                    company_name,
                )
            )

            token_overlap = (
                self._token_overlap(
                    query,
                    company_name,
                )
            )

            # IMPORTANT:
            # Only use phrase matching for multi-word queries.
            #
            # Otherwise:
            #
            # BRI
            # in
            # Bristol
            #
            # would become a false positive.
            phrase_match = (
                len(query_tokens) >= 2
                and bool(query_normalized)
                and query_normalized
                in company_normalized
            )

            value = 0

            # -------------------------------------------------
            # 1. Exact identity
            # -------------------------------------------------

            if exact_symbol:
                value += 5000

            if acronym_match:
                value += 4000

            if exact_name:
                value += 3500

            # -------------------------------------------------
            # 2. Meaningful name matching
            # -------------------------------------------------

            value += (
                token_overlap * 700
            )

            if phrase_match:
                value += 800

            # -------------------------------------------------
            # 3. Indonesian market
            # -------------------------------------------------

            if symbol.endswith(".JK"):
                value += 1200

            if exchange in {
                "JKT",
                "JAKARTA",
                "JSE",
            }:
                value += 600

            # -------------------------------------------------
            # 4. Equity
            # -------------------------------------------------

            if quote_type == "EQUITY":
                value += 200

            # -------------------------------------------------
            # 5. Indonesian corporate naming
            # -------------------------------------------------

            if "persero" in company_normalized:
                value += 50

            if "tbk" in company_normalized:
                value += 50

            # -------------------------------------------------
            # 6. Strong rejection for unrelated candidates
            # -------------------------------------------------

            identity_match = (
                exact_symbol
                or acronym_match
                or exact_name
                or token_overlap > 0
                or phrase_match
            )

            if not identity_match:
                if len(query_compact) <= 5:
                    value -= 5000
                else:
                    value -= 2000

            # -------------------------------------------------
            # 7. Additional protection for short queries
            #
            # For a short query such as BRI, a non-JK result
            # should need a very strong identity match.
            # -------------------------------------------------

            if is_short_query:
                if not symbol.endswith(".JK"):
                    if not (
                        exact_symbol
                        or acronym_match
                        or exact_name
                    ):
                        value -= 5000

            return value

        # -----------------------------------------------------
        # Rank
        # -----------------------------------------------------

        ranked = sorted(
            all_results,
            key=score,
            reverse=True,
        )

        # -----------------------------------------------------
        # Logging
        # -----------------------------------------------------

        logger.info(
            "YAHOO_RESOLUTION query=%s candidates=%s",
            query,
            [
                {
                    "symbol": item.get(
                        "symbol"
                    ),
                    "name": item.get(
                        "company_name"
                    ),
                    "exchange": item.get(
                        "exchange"
                    ),
                    "quote_type": item.get(
                        "quote_type"
                    ),
                    "acronym": self._build_acronym(
                        str(
                            item.get(
                                "company_name"
                            )
                            or ""
                        )
                    ),
                    "token_overlap": (
                        self._token_overlap(
                            query,
                            str(
                                item.get(
                                    "company_name"
                                )
                                or ""
                            ),
                        )
                    ),
                    "identity_match": (
                        self._identity_match(
                            query,
                            item,
                        )
                    ),
                    "score": score(item),
                }
                for item in ranked[:20]
            ],
        )

        # -----------------------------------------------------
        # Select best candidate
        # -----------------------------------------------------

        resolved = ranked[0]

        # -----------------------------------------------------
        # Final identity validation.
        #
        # Never return a random Yahoo candidate merely because
        # Yahoo Search returned it.
        # -----------------------------------------------------

        if not self._identity_match(
            query,
            resolved,
        ):
            raise LookupError(
                f'Yahoo Finance could not confidently resolve '
                f'"{query}" to a company.'
            )

        logger.info(
            "YAHOO_RESOLVED "
            "query=%s symbol=%s name=%s score=%s",
            query,
            resolved.get("symbol"),
            resolved.get("company_name"),
            score(resolved),
        )

        return resolved

    # =========================================================
    # INTERNAL TICKER
    # =========================================================

    def _get_ticker(
        self,
        company: str,
    ) -> tuple[str, dict[str, Any]]:
        """
        Resolve company name/query to a Yahoo ticker.
        """

        resolved = self.resolve_company(
            company
        )

        symbol = str(
            resolved.get("symbol")
            or ""
        ).strip()

        if not symbol:
            raise LookupError(
                f'Yahoo Finance returned no symbol for "{company}".'
            )

        logger.info(
            "YAHOO_TICKER company=%s symbol=%s",
            company,
            symbol,
        )

        return symbol, resolved

    # =========================================================
    # COMPANY
    # =========================================================

    def get_company(
        self,
        company: str,
    ) -> dict[str, Any]:
        """
        Get company information from Yahoo Finance.
        """

        symbol, resolved = self._get_ticker(
            company
        )

        logger.info(
            "YAHOO_COMPANY "
            "company=%s symbol=%s",
            company,
            symbol,
        )

        ticker = yf.Ticker(
            symbol
        )

        try:
            info = ticker.get_info()

        except Exception as exc:
            raise RuntimeError(
                f'Yahoo Finance company data failed for '
                f'"{company}" ({symbol}): {exc}'
            ) from exc

        if not info:
            raise LookupError(
                f'No company information available for '
                f'"{company}" ({symbol}).'
            )

        return {
            "symbol": symbol,
            "company_name": (
                info.get("longName")
                or info.get("shortName")
                or resolved.get("company_name")
                or company
            ),
            "sector": info.get(
                "sector"
            ),
            "industry": info.get(
                "industry"
            ),
            "country": info.get(
                "country"
            ),
            "description": info.get(
                "longBusinessSummary"
            ),
            "website": info.get(
                "website"
            ),
            "exchange": info.get(
                "exchange"
            ),
            "currency": info.get(
                "currency"
            ),
            "market_cap": info.get(
                "marketCap"
            ),
            "info": info,
        }

    # =========================================================
    # FINANCIALS
    # =========================================================

    def get_financials(
        self,
        company: str,
    ) -> dict[str, Any]:
        """
        Get financial statements from Yahoo Finance.
        """

        symbol, _ = self._get_ticker(
            company
        )

        logger.info(
            "YAHOO_FINANCIALS "
            "company=%s symbol=%s",
            company,
            symbol,
        )

        ticker = yf.Ticker(
            symbol
        )

        # -----------------------------------------------------
        # Company info
        # -----------------------------------------------------

        try:
            info = ticker.get_info()

        except Exception as exc:
            logger.warning(
                "YAHOO_FINANCIALS_INFO_FAILED "
                "company=%s symbol=%s error=%s",
                company,
                symbol,
                exc,
            )

            info = {}

        # -----------------------------------------------------
        # Income statement
        # -----------------------------------------------------

        try:
            income_statement = (
                ticker.get_income_stmt(
                    freq="yearly"
                )
            )

        except Exception as exc:
            raise RuntimeError(
                f'Yahoo Finance income statement failed for '
                f'"{company}" ({symbol}): {exc}'
            ) from exc

        # -----------------------------------------------------
        # Balance sheet
        # -----------------------------------------------------

        try:
            balance_sheet = (
                ticker.get_balance_sheet(
                    freq="yearly"
                )
            )

        except Exception as exc:
            logger.warning(
                "YAHOO_BALANCE_SHEET_FAILED "
                "company=%s symbol=%s error=%s",
                company,
                symbol,
                exc,
            )

            balance_sheet = None

        # -----------------------------------------------------
        # Cash flow
        # -----------------------------------------------------

        try:
            cash_flow = (
                ticker.get_cash_flow(
                    freq="yearly"
                )
            )

        except Exception as exc:
            logger.warning(
                "YAHOO_CASH_FLOW_FAILED "
                "company=%s symbol=%s error=%s",
                company,
                symbol,
                exc,
            )

            cash_flow = None

        if (
            income_statement is None
            and balance_sheet is None
            and cash_flow is None
        ):
            raise LookupError(
                f'No financial data available for '
                f'"{company}" ({symbol}).'
            )

        return {
            "symbol": symbol,
            "currency": info.get(
                "currency"
            ),
            "info": info,
            "income_statement": income_statement,
            "balance_sheet": balance_sheet,
            "cash_flow": cash_flow,
        }

    # =========================================================
    # INDUSTRY
    # =========================================================

    def get_industry(
        self,
        company: str,
    ) -> dict[str, Any]:
        """
        Get sector and industry information from Yahoo Finance.
        """

        symbol, _ = self._get_ticker(
            company
        )

        logger.info(
            "YAHOO_INDUSTRY "
            "company=%s symbol=%s",
            company,
            symbol,
        )

        ticker = yf.Ticker(
            symbol
        )

        try:
            info = ticker.get_info()

        except Exception as exc:
            raise RuntimeError(
                f'Yahoo Finance industry data failed for '
                f'"{company}" ({symbol}): {exc}'
            ) from exc

        return {
            "symbol": symbol,
            "sector": info.get(
                "sector"
            ),
            "industry": info.get(
                "industry"
            ),
            "country": info.get(
                "country"
            ),
        }

    # =========================================================
    # NEWS
    # =========================================================

    def get_news(
        self,
        company: str,
    ) -> dict[str, Any]:
        """
        Get recent company news from Yahoo Finance.
        """

        symbol, _ = self._get_ticker(
            company
        )

        logger.info(
            "YAHOO_NEWS "
            "company=%s symbol=%s",
            company,
            symbol,
        )

        ticker = yf.Ticker(
            symbol
        )

        try:
            news = ticker.get_news(
                count=20,
                tab="news",
            )

        except Exception as exc:
            raise RuntimeError(
                f'Yahoo Finance news failed for '
                f'"{company}" ({symbol}): {exc}'
            ) from exc

        items = []

        for item in news or []:
            if not isinstance(
                item,
                dict,
            ):
                continue

            content = item.get(
                "content",
                {},
            )

            if not isinstance(
                content,
                dict,
            ):
                content = {}

            title = (
                content.get("title")
                or item.get("title")
            )

            if not title:
                continue

            provider = content.get(
                "provider",
                {},
            )

            if not isinstance(
                provider,
                dict,
            ):
                provider = {}

            canonical_url = content.get(
                "canonicalUrl",
                {},
            )

            if not isinstance(
                canonical_url,
                dict,
            ):
                canonical_url = {}

            url = (
                canonical_url.get("url")
                or item.get("link")
                or item.get("url")
            )

            published_at = (
                content.get("pubDate")
                or item.get(
                    "providerPublishTime"
                )
            )

            summary = (
                content.get("summary")
                or item.get("summary")
            )

            source = (
                provider.get(
                    "displayName"
                )
                or item.get("publisher")
            )

            items.append(
                {
                    "symbol": symbol,
                    "title": str(title),
                    "summary": summary,
                    "source": source,
                    "published_at": published_at,
                    "url": url,
                }
            )

        return {
            "symbol": symbol,
            "items": items,
        }