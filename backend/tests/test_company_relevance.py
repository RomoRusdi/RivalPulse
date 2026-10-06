from app.classify import as_event, company_event


def test_market_mention_does_not_attribute_other_company_partnership():
    event = as_event('MITI signs partnership; market commentary',
        'MITI signed an agreement to develop silica mining concessions. '
        'Short selling includes BBCA, BUMI and INDF.', 'https://news.test/roundup', '2026-10-06')
    assert company_event(event, {'symbol': 'BBCA', 'name': 'Bank Central Asia'}) is None


def test_roundup_extracts_only_company_announcement_and_category():
    event = as_event('MITI partnership and Indosat announcement',
        'MITI signed an agreement to develop silica mining concessions. '
        'Indosat launches a new enterprise service for business customers.', 'https://news.test/roundup', '2026-10-06')
    scoped = company_event(event, {'symbol': 'ISAT', 'name': 'PT Indosat Tbk'})
    assert scoped['type'] == 'Product'
    assert scoped['text'] in event['text']
    assert 'MITI' not in scoped['text']
