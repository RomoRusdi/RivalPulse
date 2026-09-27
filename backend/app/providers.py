"""Bounded Sectors v2 calls with durable cache and conservative credit accounting."""
import hashlib
import json
import random
import re
import time
from datetime import timedelta, timezone
from decimal import Decimal, InvalidOperation
from importlib.resources import files

import httpx
from redis import Redis
from redis.exceptions import LockError, RedisError
from sqlalchemy import select, update

from app.config import get_settings
from app.db import session, utcnow
from app.errors import ProviderError
from app.models import CreditAccount, CreditReservation, ProviderCache, Run, RunSnapshot, Snapshot

SECTORS_BASE = "https://api.sectors.app/v2"
YAHOO_BASE = "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries"
YAHOO_TYPES = {
    "annualTotalRevenue": "revenue",
    "annualNetIncome": "earnings",
    "annualTotalAssets": "total_assets",
    "annualStockholdersEquity": "total_equity",
    "annualNormalizedEBITDA": "ebitda",
}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def redis_connection():
    return Redis.from_url(get_settings().redis_url, socket_timeout=3, socket_connect_timeout=3)


def number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value))
        return str(result) if result.is_finite() else None
    except InvalidOperation:
        return None


def normalize_report(payload, symbol):
    if not isinstance(payload, dict) or str(payload.get("symbol", "")).upper().removesuffix(".JK") != symbol:
        raise ProviderError("PROVIDER_INVALID_RESPONSE", "Report company identity did not match", False)
    financials = payload.get("financials") or {}
    if not isinstance(financials, dict):
        raise ProviderError("PROVIDER_INVALID_RESPONSE", "Invalid financial report structure", False)
    rows = financials.get("historical_financials") or []
    if not isinstance(rows, list):
        raise ProviderError("PROVIDER_INVALID_RESPONSE", "Invalid financial report structure", False)
    metrics = []
    # The documented response does not specify currency/unit. Keep them unknown unless supplied.
    currency = financials.get("currency") or payload.get("currency")
    unit = financials.get("unit") or "provider_native_unspecified"
    basis = financials.get("comparison_basis") or "reporting_scope_unverified"
    if ((currency is not None and (not isinstance(currency, str) or not re.fullmatch(r"[A-Z]{3}", currency)))
            or not isinstance(unit, str) or not isinstance(basis, str) or len(unit) > 100 or len(basis) > 200):
        raise ProviderError("PROVIDER_INVALID_RESPONSE", "Invalid financial metadata", False)
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or not str(row.get("year", "")).isdigit():
            continue
        for metric in ("revenue", "earnings", "total_assets", "total_equity", "ebitda"):
            value = number(row.get(metric))
            if value is not None:
                metrics.append(dict(metric=metric, value=value, period=str(row["year"]), currency=currency,
                                    unit=unit, comparison_basis=basis,
                                    pointer=f"/financials/historical_financials/{index}/{metric}"))
    return {"schema_version": 1, "symbol": symbol, "name": payload.get("company_name"),
            "overview": payload.get("overview") or {}, "metrics": metrics, "peers": payload.get("peers") or [],
            "warnings": ([] if currency else ["Provider did not specify currency; monetary comparisons are disabled."])}


def normalize_yahoo_report(payload, symbol):
    """Normalize Yahoo's undocumented fundamentals response for development runs only."""
    timeseries = payload.get("timeseries") if isinstance(payload, dict) else None
    results = timeseries.get("result") if isinstance(timeseries, dict) else None
    if not isinstance(results, list):
        raise ProviderError("PROVIDER_INVALID_RESPONSE", "Invalid Yahoo Finance response", False)
    metrics = []
    for series_index, series in enumerate(results):
        if not isinstance(series, dict):
            continue
        meta = series.get("meta") or {}
        returned_symbols = meta.get("symbol") or []
        if returned_symbols and symbol + ".JK" not in returned_symbols:
            raise ProviderError("PROVIDER_INVALID_RESPONSE", "Yahoo company identity did not match", False)
        provider_types = meta.get("type") or []
        provider_type = provider_types[0] if provider_types else None
        metric = YAHOO_TYPES.get(provider_type)
        rows = series.get(provider_type) if provider_type else None
        if not metric or not isinstance(rows, list):
            continue
        for row_index, row in enumerate(rows):
            if not isinstance(row, dict) or row.get("periodType") != "12M":
                continue
            value = number((row.get("reportedValue") or {}).get("raw"))
            date = str(row.get("asOfDate") or "")
            currency = row.get("currencyCode")
            if value is None or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
                continue
            if not isinstance(currency, str) or not re.fullmatch(r"[A-Z]{3}", currency):
                currency = None
            metrics.append({
                "metric": metric, "value": value, "period": date[:4], "currency": currency,
                "unit": "raw_currency_units", "comparison_basis": "Yahoo Finance annual 12M reported value",
                "pointer": f"/timeseries/result/{series_index}/{provider_type}/{row_index}/reportedValue/raw",
            })
    if not metrics:
        raise ProviderError("PROVIDER_INVALID_RESPONSE", "Yahoo returned no annual financial metrics", False)
    return {
        "schema_version": 1, "symbol": symbol, "name": symbol, "overview": {"provider": "Yahoo Finance"},
        "metrics": metrics, "peers": [],
        "warnings": ["Development-only data from an unofficial Yahoo Finance endpoint; verify with Sectors before final use."],
    }


def growth(current, previous):
    """Only adjacent annual periods of the same known reporting basis and unit are comparable."""
    for key in ("metric", "currency", "unit", "comparison_basis"):
        if not current.get(key) or current.get(key) != previous.get(key):
            return None
    if current["comparison_basis"] == "reporting_scope_unverified" or current["unit"] == "provider_native_unspecified":
        return None
    if int(current["period"]) != int(previous["period"]) + 1:
        return None
    denominator = Decimal(previous["value"])
    if denominator <= 0:
        return None
    return str(((Decimal(current["value"]) - denominator) / denominator * 100).quantize(Decimal("0.01")))


def ensure_active(db, run_id, token):
    run = db.get(Run, run_id)
    if not run or run.status != "running" or run.lease_token != token:
        raise ProviderError("RUN_INTERRUPTED", "Run no longer owns its execution lease", False)
    if (utcnow() - run.started_at.replace(tzinfo=timezone.utc)).total_seconds() >= get_settings().run_timeout:
        raise ProviderError("RUN_TIMEOUT", "Investigation deadline exceeded", False)
    return run


class Sectors:
    def __init__(self, run_id, token, *, client=None, redis=None):
        self.run_id, self.token = run_id, token
        self.settings = get_settings()
        self.client = client
        self.redis = redis if redis is not None else redis_connection()

    def reserve(self, key, cost):
        with session() as db, db.begin():
            run = ensure_active(db, self.run_id, self.token)
            result = db.execute(update(Run).where(
                Run.id == run.id, Run.lease_token == self.token, Run.status == "running",
                Run.credits + cost <= self.settings.run_credit_limit,
                Run.external_calls < self.settings.max_tool_calls,
            ).values(credits=Run.credits + cost, external_calls=Run.external_calls + 1))
            if not result.rowcount:
                raise ProviderError("CREDIT_BUDGET_EXCEEDED", "Run credit or request budget exhausted", False)
            result = db.execute(update(CreditAccount).where(
                CreditAccount.id == "sectors",
                CreditAccount.used + cost <= self.settings.credit_total - self.settings.credit_reserve,
            ).values(used=CreditAccount.used + cost))
            if not result.rowcount:
                raise ProviderError("CREDIT_BUDGET_EXCEEDED", "Shared credit reserve would be exceeded", False)
            entry = CreditReservation(run_id=run.id, request_key=key, credits=cost)
            db.add(entry)
            db.flush()
            return entry.id

    def _http(self, endpoint, params, key, cost):
        if not self.settings.sectors_api_key.get_secret_value():
            raise ProviderError("PROVIDER_CREDENTIALS_MISSING", "Sectors API key is not configured", False)
        for attempt in range(3):
            reservation_id = self.reserve(key, cost)  # Each retry can be billable, even when its outcome is unknown.
            try:
                client = self.client or httpx.Client(timeout=self.settings.provider_timeout, trust_env=False)
                try:
                    with client.stream("GET", SECTORS_BASE + endpoint, params=params,
                                       headers={"Authorization": self.settings.sectors_api_key.get_secret_value()}) as response:
                        status = response.status_code
                        if status in (401, 403):
                            raise ProviderError("PROVIDER_AUTH_FAILED", "Sectors rejected server credentials", False)
                        if status == 429 or status >= 500:
                            wait = min(8, float(response.headers.get("Retry-After", 2 ** attempt)))
                            if attempt < 2:
                                time.sleep(max(0, wait) + random.uniform(0, .2))
                                continue
                            raise ProviderError()
                        if status != 200:
                            raise ProviderError("PROVIDER_REQUEST_REJECTED", "Sectors request was rejected", False)
                        body = bytearray()
                        for chunk in response.iter_bytes():
                            body.extend(chunk)
                            if len(body) > 2_000_000:
                                raise ProviderError("RESPONSE_TOO_LARGE", "Provider response exceeded limit", False)
                        payload = json.loads(body)
                    with session() as db, db.begin():
                        db.get(CreditReservation, reservation_id).outcome = "received"
                    return payload
                finally:
                    if self.client is None:
                        client.close()
            except (httpx.HTTPError, ValueError):
                if attempt == 2:
                    raise ProviderError() from None
                time.sleep(2 ** attempt + random.uniform(0, .2))
        raise ProviderError()

    def _reserve_external_call(self):
        with session() as db, db.begin():
            run = ensure_active(db, self.run_id, self.token)
            result = db.execute(update(Run).where(
                Run.id == run.id, Run.lease_token == self.token, Run.status == "running",
                Run.external_calls < self.settings.max_tool_calls,
            ).values(external_calls=Run.external_calls + 1))
            if not result.rowcount:
                raise ProviderError("REQUEST_BUDGET_EXCEEDED", "Run request budget exhausted", False)

    def _yahoo_http(self, symbol, params):
        url = f"{YAHOO_BASE}/{symbol}.JK"
        for attempt in range(3):
            self._reserve_external_call()
            try:
                client = self.client or httpx.Client(timeout=self.settings.provider_timeout, trust_env=False)
                try:
                    response = client.get(url, params=params, headers={"User-Agent": "RivalPulse development adapter/1.0"})
                    if response.status_code == 429 or response.status_code >= 500:
                        if attempt < 2:
                            time.sleep(2 ** attempt + random.uniform(0, .2))
                            continue
                        raise ProviderError("PROVIDER_UNAVAILABLE", "Yahoo Finance is temporarily unavailable")
                    if response.status_code != 200:
                        raise ProviderError("PROVIDER_REQUEST_REJECTED", "Yahoo Finance request was rejected", False)
                    if len(response.content) > 2_000_000:
                        raise ProviderError("RESPONSE_TOO_LARGE", "Provider response exceeded limit", False)
                    return response.json()
                finally:
                    if self.client is None:
                        client.close()
            except (httpx.HTTPError, ValueError):
                if attempt == 2:
                    raise ProviderError("PROVIDER_UNAVAILABLE", "Yahoo Finance is unavailable") from None
                time.sleep(2 ** attempt + random.uniform(0, .2))
        raise ProviderError("PROVIDER_UNAVAILABLE", "Yahoo Finance is unavailable")

    def _cached(self, key):
        with session() as db:
            run = ensure_active(db, self.run_id, self.token)
            # An interrupted attempt resumes its persisted evidence, even if cache TTL elapsed.
            snapshot = db.scalar(select(Snapshot).join(RunSnapshot, RunSnapshot.snapshot_id == Snapshot.id).where(
                RunSnapshot.run_id == run.id, Snapshot.request_key == key))
            if snapshot:
                return snapshot, "resumed"
            cached = db.get(ProviderCache, key)
            if cached and cached.expires_at.replace(tzinfo=timezone.utc) > utcnow():
                return db.get(Snapshot, cached.snapshot_id), "cached"
        return None

    def _link(self, snapshot, outcome):
        with session() as db, db.begin():
            ensure_active(db, self.run_id, self.token)
            if not db.get(RunSnapshot, (self.run_id, snapshot.id)):
                db.add(RunSnapshot(run_id=self.run_id, snapshot_id=snapshot.id, outcome=outcome))
        return snapshot, outcome

    def request(self, company, endpoint, params, cost, normalize, ttl=None):
        with session() as db:
            run = ensure_active(db, self.run_id, self.token)
            mode, scenario = run.mode, run.inputs["replay_scenario"]
        provider_name = "yahoo" if mode == "yahoo" else "sectors"
        key = digest({"v": 1, "provider": "yahoo-finance" if mode == "yahoo" else "sectors-v2",
                      "endpoint": endpoint, "params": params, "mode": mode,
                      "scenario": scenario if mode == "replay" else None})
        hit = self._cached(key)
        if hit:
            return self._link(*hit)
        if mode == "live" and not self.settings.sectors_api_key.get_secret_value():
            raise ProviderError("PROVIDER_CREDENTIALS_MISSING", "Sectors API key is not configured", False)

        def fetch_and_store():
            hit = self._cached(key)
            if hit:
                return self._link(*hit)
            if mode == "replay":
                payload = replay_report(company["symbol"], scenario, params)
            elif mode == "yahoo":
                payload = self._yahoo_http(company["symbol"], params)
            else:
                payload = self._http(endpoint, params, key, cost)
            normalized = normalize(payload)
            base_url = f"{YAHOO_BASE}/{company['symbol']}.JK" if mode == "yahoo" else SECTORS_BASE + endpoint
            snapshot = Snapshot(company_id=company["id"], mode=mode, provider=provider_name,
                                request_key=key, content_hash=digest(normalized), normalized=normalized,
                                raw_payload=payload, url=base_url + "?" + str(httpx.QueryParams(params)))
            with session() as db, db.begin():
                ensure_active(db, self.run_id, self.token)
                db.add(snapshot)
                db.flush()
                from sqlalchemy.dialects.postgresql import insert as pg_insert
                from sqlalchemy.dialects.sqlite import insert as sqlite_insert
                insert = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
                values = dict(key=key, snapshot_id=snapshot.id,
                              expires_at=utcnow() + timedelta(seconds=ttl if ttl is not None else self.settings.cache_seconds))
                db.execute(insert(ProviderCache).values(**values).on_conflict_do_update(
                    index_elements=[ProviderCache.key], set_=values))
                db.add(RunSnapshot(run_id=self.run_id, snapshot_id=snapshot.id, outcome="fetched"))
            return snapshot, "fetched"

        if mode == "replay":
            return fetch_and_store()
        try:
            # Hold past the full run deadline; a killed worker's lock expires automatically.
            with self.redis.lock(provider_name + ":" + key, timeout=self.settings.run_timeout + 30, blocking_timeout=10):
                return fetch_and_store()
        except (RedisError, LockError):
            raise ProviderError("CACHE_UNAVAILABLE", "Provider request coalescing is unavailable") from None

    def report(self, company, sections=("overview", "financials")):
        if not sections or not set(sections) <= {"overview", "financials", "peers"}:
            raise ValueError("Unsupported report sections")
        with session() as db:
            mode = ensure_active(db, self.run_id, self.token).mode
        if mode == "yahoo":
            now = int(utcnow().timestamp()) // 86400 * 86400
            params = {
                "symbol": company["symbol"] + ".JK",
                "type": ",".join(YAHOO_TYPES),
                "period1": now - 86400 * 365 * 6,
                "period2": now,
            }
            return self.request(company, f"/{company['symbol']}.JK", params, 0,
                                lambda value: normalize_yahoo_report(value, company["symbol"]))
        return self.request(company, f"/company/report/{company['symbol']}/",
                            {"sections": ",".join(sorted(set(sections)))}, len(set(sections)),
                            lambda value: normalize_report(value, company["symbol"]),
                            ttl=604800 if set(sections) == {"overview"} else None)

    def screener(self, company, symbols, period, pages=1):
        """Bounded structured screener; no natural-language query or arbitrary SQL-like input."""
        if not 1 <= len(symbols) <= 5 or not all(re.fullmatch(r"[A-Z]{4}", s) for s in symbols):
            raise ValueError("Invalid screener symbols")
        if not 2000 <= period <= 2100 or not 1 <= pages <= 2:
            raise ValueError("Invalid screener period or pagination")
        where = "symbol in [" + ",".join("'" + s + "'" for s in sorted(set(symbols))) + f"] and revenue[{period}] >= 0"

        def normalize(payload):
            if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
                raise ProviderError("PROVIDER_INVALID_RESPONSE", "Invalid screener response", False)
            return {"schema_version": 1, "results": payload["results"][:30], "requested_period": period,
                    "has_next": bool((payload.get("pagination") or {}).get("has_next"))}
        outputs = []
        for page in range(pages):
            output = self.request(company, "/companies/", {"where": where, "limit": 30, "offset": page * 30,
                                                          "order_by": "symbol", "include_query_values": "true"}, 1, normalize)
            outputs.append(output)
            if not output[0].normalized["has_next"]:
                break
        return outputs

    def news(self, company, pages=1):
        if not 1 <= pages <= 2:
            raise ValueError("News is limited to two pages")
        results = []
        for page in range(pages):
            snapshot, outcome = self.request(company, "/news/", {
                "extension": "idx", "symbols": company["symbol"], "limit": 30, "offset": page * 30,
            }, 1, normalize_news, ttl=3600)
            results.append((snapshot, outcome))
            if not snapshot.normalized["has_next"]:
                break
        return results


def normalize_news(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise ProviderError("PROVIDER_INVALID_RESPONSE", "Invalid news response", False)
    return {"schema_version": 1, "articles": [{
        "title": str(row.get("title", ""))[:500], "text": str(row.get("body", ""))[:4000],
        "url": row.get("source"), "published_at": row.get("timestamp"), "symbols": row.get("symbols") or [],
    } for row in payload["results"][:30] if isinstance(row, dict)],
        "has_next": bool((payload.get("pagination") or {}).get("has_next"))}


def replay_report(symbol, scenario, params):
    if scenario == "failure":
        raise ProviderError(message="Explicit replay provider-failure scenario")
    fixture = json.loads(files("app").joinpath("fixtures/replay.json").read_text(encoding="utf-8"))
    if "extension" in params or "where" in params:
        return {"results": [], "pagination": {"has_next": False}}
    report = {"symbol": symbol + ".JK", "company_name": "SYNTHETIC REPLAY: " + symbol,
              "overview": {"industry": "Synthetic telecom scenario"}, "financials": fixture["financials"], "peers": []}
    if scenario == "missing_financial":
        report["financials"] = {}
    return report
