from sqlalchemy import select

from app.db import session, utcnow
from app.models import Company, RunSnapshot, Snapshot
from tests.conftest import execute


def replace_report(db, run_id, ticker, rows):
    company = db.scalar(select(Company).where(Company.symbol == ticker))
    company.comparison_note = 'Consolidated annual reports.'
    snapshot = Snapshot(company_id=company.id, mode='replay', provider='sectors', request_key='synthetic-report',
                        content_hash='synthetic-' + ticker, url='https://example.com/' + ticker,
                        normalized={'metrics': rows}, fetched_at=utcnow())
    db.add(snapshot)
    db.flush()
    db.add(RunSnapshot(run_id=run_id, snapshot_id=snapshot.id, outcome='fetched'))


def metric(year, value):
    return dict(metric='revenue', period=str(year), value=str(value), currency='XTS',
                unit='synthetic_currency_units', comparison_basis='synthetic_same_scope')


def test_latest_reports_have_real_years_exact_values_and_shared_base(client, watchlist):
    run = execute(client, watchlist)
    with session() as db, db.begin():
        replace_report(db, run['id'], 'TLKM', [metric(2025, '123456789012345.67'), metric(2023, '100000000000000'), metric(2024, '110000000000000')])
        replace_report(db, run['id'], 'ISAT', [metric(2024, 100), metric(2025, 120)])
    feed = client.get('/api/v1/watchlists/' + watchlist['id'] + '/financials').json()
    assert feed['baseYear'] == 2024 and feed['absoluteAvailable']
    track = next(c for c in feed['companies'] if c['ticker'] == 'TLKM')
    assert [p['year'] for p in track['points']] == [2023, 2024, 2025]
    assert track['points'][-1]['value'] == '123456789012345.67'
    assert track['points'][1]['index'] == '100.00'
    assert track['points'][-1]['index'] == '112.23'
    assert track['points'][-1]['sourceUrl'] == 'https://example.com/TLKM'
    assert track['points'][-1]['fetchedAt']


def test_unknown_metadata_gap_zero_and_conflicting_values_are_not_growth(client, watchlist):
    run = execute(client, watchlist)
    unknown = metric(2025, 100)
    unknown['currency'] = None
    with session() as db, db.begin():
        replace_report(db, run['id'], 'TLKM', [metric(2020, 0), metric(2021, 100), metric(2023, 150), metric(2024, 180), metric(2024, 181), unknown])
    feed = client.get('/api/v1/watchlists/' + watchlist['id'] + '/financials').json()
    points = next(c['points'] for c in feed['companies'] if c['ticker'] == 'TLKM')
    assert all(p['yoy'] is None for p in points)
    assert points[-2]['value'] is None and 'Conflicting' in points[-2]['limitation']
    assert not points[-1]['comparable'] and points[-1]['index'] is None
    assert points[0]['value'] == '0'


def test_scope_and_currency_changes_break_comparisons(client, watchlist):
    run = execute(client, watchlist)
    changed = metric(2025, 200)
    changed['currency'] = 'USD'
    with session() as db, db.begin():
        replace_report(db, run['id'], 'TLKM', [metric(2024, 100), changed])
    feed = client.get('/api/v1/watchlists/' + watchlist['id'] + '/financials').json()
    assert not feed['absoluteAvailable']
    points = next(c['points'] for c in feed['companies'] if c['ticker'] == 'TLKM')
    assert points[-1]['yoy'] is None and points[-1]['index'] is None
    merger = next(c for c in feed['companies'] if c['ticker'] == 'EXCL')
    assert merger['points'][-1]['yoy'] is None
    assert 'scope changed' in merger['points'][-1]['limitation']


def test_browsing_never_calls_provider_and_preserves_mode(client, watchlist, monkeypatch):
    execute(client, watchlist)
    def forbidden(*args, **kwargs):
        raise AssertionError('Browsing cannot fetch provider data')
    monkeypatch.setattr('app.providers.Sectors.report', forbidden)
    endpoint = '/api/v1/watchlists/' + watchlist['id'] + '/financials'
    assert client.get(endpoint).status_code == 200
    monkeypatch.setenv('MODE', 'live')
    from app.config import get_settings
    get_settings.cache_clear()
    assert all(not c['points'] for c in client.get(endpoint).json()['companies'])


def test_empty_financial_feed(client, watchlist):
    response = client.get('/api/v1/watchlists/' + watchlist['id'] + '/financials')
    assert response.status_code == 200
    assert response.json()['baseYear'] is None
    assert not response.json()['absoluteAvailable']
