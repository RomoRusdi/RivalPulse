from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext

import httpx
import pytest
from sqlalchemy import func, select

from app.config import get_settings
from app.db import session
from app.errors import ProviderError
from app.models import CreditAccount, CreditReservation, Run
from app.providers import Sectors, growth, normalize_report, normalize_yahoo_report, replay_report
from app.research import claim_run
from tests.conftest import launch


class LockRedis:
    def lock(self, *args, **kwargs):
        return nullcontext()


def live_provider(client, watchlist, monkeypatch, handler):
    monkeypatch.setenv("MODE", "live")
    monkeypatch.setenv("SECTORS_API_KEY", "test-only-fake-key")
    get_settings.cache_clear()
    run_id = launch(client, watchlist)
    token = claim_run(run_id)
    with session() as db:
        company = db.get(Run, run_id).inputs["companies"][0]
    provider = Sectors(run_id, token, client=httpx.Client(transport=httpx.MockTransport(handler)), redis=LockRedis())
    return provider, company, run_id


def test_cache_explicit_sections_and_credit_cost(client, watchlist, monkeypatch):
    requests = []

    def handler(request):
        requests.append(request)
        symbol = request.url.path.split("/")[-2]
        return httpx.Response(200, json=replay_report(symbol, "baseline", {}))

    provider, company, run_id = live_provider(client, watchlist, monkeypatch, handler)
    first, status = provider.report(company)
    second, status = provider.report(company)
    assert first.id == second.id and status == "resumed"
    assert len(requests) == 1
    assert requests[0].url.params["sections"] == "financials,overview"
    assert requests[0].headers["Authorization"] == "test-only-fake-key"
    with session() as db:
        assert db.get(CreditAccount, "sectors").used == 2
        assert db.get(Run, run_id).credits == 2
    client.post("/runs/" + run_id + "/cancel")
    next_id = launch(client, watchlist)
    next_provider = Sectors(next_id, claim_run(next_id), client=provider.client, redis=LockRedis())
    third, status = next_provider.report(company)
    assert third.id == first.id and status == "cached" and len(requests) == 1


def test_central_budget_atomic_reservations(client, watchlist, monkeypatch):
    provider, company, run_id = live_provider(client, watchlist, monkeypatch, lambda r: httpx.Response(500))
    with session() as db, db.begin():
        db.get(CreditAccount, "sectors").used = 798

    def reserve(_):
        try:
            provider.reserve("a" * 64, 2)
            return True
        except ProviderError as exc:
            assert exc.code == "CREDIT_BUDGET_EXCEEDED"
            return False

    with ThreadPoolExecutor(max_workers=4) as pool:
        assert sum(pool.map(reserve, range(4))) == 1
    with session() as db:
        assert db.get(CreditAccount, "sectors").used == 800
        assert db.get(Run, run_id).credits == 2
        assert db.scalar(select(func.count()).select_from(CreditReservation)) == 1


def test_retries_are_bounded_and_billable(client, watchlist, monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(429, headers={"Retry-After": "0"})

    monkeypatch.setattr("app.providers.time.sleep", lambda seconds: None)
    provider, company, run_id = live_provider(client, watchlist, monkeypatch, handler)
    with pytest.raises(ProviderError):
        provider.report(company)
    assert len(calls) == 3
    with session() as db:
        assert db.get(CreditAccount, "sectors").used == 6
        assert db.get(Run, run_id).credits == 6


def test_credentials_fail_fast(client, watchlist, monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(401)

    provider, company, _ = live_provider(client, watchlist, monkeypatch, handler)
    with pytest.raises(ProviderError, match="credentials"):
        provider.report(company)
    assert len(calls) == 1


def test_normalization_nulls_periods_currency_and_growth():
    normalized = normalize_report({"symbol": "TLKM.JK", "financials": {"historical_financials": [
        {"year": 2025, "revenue": None, "earnings": "0"}, {"year": 2024, "revenue": "NaN"},
    ]}}, "TLKM")
    assert len(normalized["metrics"]) == 1
    assert normalized["metrics"][0]["value"] == "0"
    assert normalized["metrics"][0]["currency"] is None
    assert normalized["warnings"]
    with pytest.raises(ProviderError):
        normalize_report({"symbol": "ISAT.JK"}, "TLKM")
    a = dict(metric="revenue", value="120", currency="XTS", unit="units", period="2025", comparison_basis="same")
    b = {**a, "value": "100", "period": "2024"}
    assert growth(a, b) == "20.00"
    for patch in ({"value": "0"}, {"currency": "IDR"}, {"period": "2023"}, {"comparison_basis": "merged"}):
        assert growth(a, {**b, **patch}) is None


def test_yahoo_mode_is_explicit_labeled_and_does_not_charge_sectors(client, watchlist, monkeypatch):
    monkeypatch.setenv("MODE", "yahoo")
    monkeypatch.setenv("SECTORS_API_KEY", "")
    get_settings.cache_clear()
    requests = []

    def handler(request):
        requests.append(request)
        symbol = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json={"timeseries": {"result": [{
            "meta": {"symbol": [symbol], "type": ["annualTotalRevenue"]},
            "annualTotalRevenue": [{"asOfDate": "2024-12-31", "periodType": "12M", "currencyCode": "IDR",
                                    "reportedValue": {"raw": 149216000000000}}],
        }]}})

    run_id = launch(client, watchlist)
    token = claim_run(run_id)
    with session() as db:
        company = db.get(Run, run_id).inputs["companies"][0]
    provider = Sectors(run_id, token, client=httpx.Client(transport=httpx.MockTransport(handler)), redis=LockRedis())
    snapshot, status = provider.report(company)
    assert status == "fetched" and snapshot.provider == "yahoo" and snapshot.mode == "yahoo"
    assert snapshot.normalized["metrics"][0]["currency"] == "IDR"
    assert "query2.finance.yahoo.com" in snapshot.url
    assert requests[0].url.params["symbol"] == company["symbol"] + ".JK"
    with session() as db:
        assert db.get(CreditAccount, "sectors").used == 0
        assert db.get(Run, run_id).credits == 0
        assert db.get(Run, run_id).external_calls == 1


def test_yahoo_normalizer_rejects_wrong_company():
    payload = {"timeseries": {"result": [{
        "meta": {"symbol": ["ISAT.JK"], "type": ["annualTotalRevenue"]},
        "annualTotalRevenue": [{"asOfDate": "2024-12-31", "periodType": "12M", "currencyCode": "IDR",
                                "reportedValue": {"raw": 100}}],
    }]}}
    with pytest.raises(ProviderError, match="identity"):
        normalize_yahoo_report(payload, "TLKM")


def test_news_pagination_and_symbol_filter(client, watchlist, monkeypatch):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"results": [], "pagination": {"has_next": True}})

    provider, company, _ = live_provider(client, watchlist, monkeypatch, handler)
    assert len(provider.news(company, pages=2)) == 2
    assert len(requests) == 2
    assert requests[0].url.params["symbols"] == company["symbol"]
    assert requests[1].url.params["offset"] == "30"
    with pytest.raises(ValueError):
        provider.news(company, pages=3)
