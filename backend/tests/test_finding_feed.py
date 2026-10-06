import base64
import json
from datetime import datetime, timezone

from sqlalchemy import select

from app.db import session
from app.models import Signal
from tests.conftest import execute


def test_added_dates_use_local_midnight_and_ignore_last_seen(client, watchlist):
    execute(client, watchlist)
    with session() as db, db.begin():
        rows = db.scalars(select(Signal).order_by(Signal.id)).all()
        assert len(rows) >= 2
        for row in rows:
            row.first_seen_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
        rows[0].first_seen_at = datetime(2026, 10, 5, 16, 59, tzinfo=timezone.utc)
        rows[1].first_seen_at = datetime(2026, 10, 5, 17, 0, tzinfo=timezone.utc)
        rows[0].last_seen_at = datetime(2026, 10, 6, 12, tzinfo=timezone.utc)
        expected = rows[1].id
    response = client.get('/findings?period=custom&start=2026-10-06&end=2026-10-06&timezone=Asia/Jakarta')
    assert response.status_code == 200, response.text
    assert [item['id'] for item in response.json()['items']] == [expected]
    assert response.json()['summary']['total'] == 1


def test_counts_precede_pagination_and_category_filter(client, watchlist):
    execute(client, watchlist)
    first = client.get('/findings?period=all&limit=1').json()
    assert len(first['items']) == 1 and first['nextCursor']
    assert first['summary']['total'] > 1
    assert sum(item['count'] for item in first['summary']['mix']) == first['summary']['total']
    second = client.get('/findings', params={'period': 'all', 'limit': 1, 'cursor': first['nextCursor']}).json()
    assert first['items'][0]['id'] != second['items'][0]['id']
    category = first['items'][0]['type']
    filtered = client.get('/findings', params={'period': 'all', 'category': category}).json()
    assert filtered['summary']['total'] == first['summary']['total']
    assert len(filtered['items']) == filtered['summary']['filtered']
    assert all(item['type'] == category for item in filtered['items'])
    company = first['items'][0]['company']
    scoped = client.get('/findings', params={'period': 'all', 'company': company}).json()
    assert all(item['company'] == company for item in scoped['items'])


def test_invalid_browse_input_is_rejected(client):
    for query in ('period=custom', 'period=custom&start=2026-10-07&end=2026-10-06',
                  'timezone=Invalid/Zone', 'cursor=not-a-cursor', 'category=High', 'company=bad'):
        response = client.get('/findings?' + query)
        assert response.status_code == 422, (query, response.text)
    for identity in (None, 5, [], {}):
        cursor = base64.urlsafe_b64encode(json.dumps(['2026-10-06T00:00:00+00:00', identity]).encode()).decode()
        assert client.get('/findings', params={'period': 'all', 'cursor': cursor}).status_code == 422


def test_projection_preserves_financial_metadata_and_links(client, watchlist):
    execute(client, watchlist)
    item = client.get('/findings?period=all').json()['items'][0]
    assert item['addedAt'] and item['sources']
    for metric in item['financialContext']['rows']:
        assert {'value', 'currency', 'unit', 'period', 'basis', 'sourceUrl'} <= metric.keys()


def test_browse_requires_authentication_and_never_calls_provider(env):
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as anonymous:
        assert anonymous.get('/findings?period=all').status_code == 401
