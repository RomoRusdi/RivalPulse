import json
from copy import deepcopy

from sqlalchemy import select

from app.db import session, uid, utcnow
from app.models import Conversation, Run, Snapshot
from app.public_evidence import public_link, public_payload
from tests.conftest import execute


PRIVATE = {"jsonPointer", "json_pointer", "rawValue", "source_url", "sourceUrl",
           "url_or_endpoint", "excerpt_or_json_pointer", "transformation"}


def assert_public(value):
    if isinstance(value, list):
        for child in value:
            assert_public(child)
    elif isinstance(value, dict):
        assert PRIVATE.isdisjoint(value), value
        for child in value.values():
            assert_public(child)
    assert "api.sectors.app" not in json.dumps(value)


def test_authenticated_financial_and_signal_responses_keep_provenance_private(client, watchlist, monkeypatch):
    run = execute(client, watchlist)
    with session() as db:
        before = {row.id: (deepcopy(row.normalized), deepcopy(row.raw_payload), row.url)
                  for row in db.scalars(select(Snapshot)).all()}
        stored_result = deepcopy(db.get(Run, run["id"]).result)
    monkeypatch.setattr("app.providers.Sectors.report", lambda *_: (_ for _ in ()).throw(AssertionError("Read only")))
    feed = client.get(f"/api/v1/watchlists/{watchlist['id']}/financials").json()
    assert_public(feed)
    for company in feed["companies"]:
        if company["snapshotId"]:
            response = client.get(f"/api/v1/financial-sources/{company['snapshotId']}")
            assert response.status_code == 200
            assert_public(response.json())
            assert response.json()["provider"] == "Sectors"
            assert response.json()["figures"]
    assert_public(run)
    signals = client.get("/api/v1/signals").json()["items"]
    assert signals
    assert_public(signals)
    for signal in signals:
        assert_public(client.get(f"/api/v1/signals/{signal['signal_id']}").json())
    assert_public(client.get(f"/signals/{signals[0]['signal_id']}").json())
    stream = client.get(f"/runs/{run['id']}/stream").text
    assert "api.sectors.app" not in stream and "json_pointer" not in stream
    with session() as db:
        assert db.get(Run, run["id"]).result == stored_result
        for key, original in before.items():
            row = db.get(Snapshot, key)
            assert (row.normalized, row.raw_payload, row.url) == original


def test_old_saved_chat_is_sanitized_on_read_without_rewriting_storage(client, watchlist):
    run = execute(client, watchlist)
    message = {"id": "legacy", "role": "assistant", "kind": "research", "content": "Saved research",
               "createdAt": utcnow().isoformat(), "run": {"financialBrief": {"rows": [{"metrics": [{
                   "value": "123456789012345.67", "source_url": "https://api.sectors.app/v2/report?api_key=synthetic-secret",
                   "json_pointer": "/financials/0"}]}]}}}
    with session() as db, db.begin():
        row = Conversation(id=uid(), workspace_id=db.get(Run, run["id"]).workspace_id,
                           title="Legacy saved research", messages=[message], created_at=utcnow(), updated_at=utcnow())
        db.add(row)
        key = row.id
    response = client.get("/api/v1/conversations").json()
    assert_public(response)
    assert "synthetic-secret" not in json.dumps(response)
    assert "123456789012345.67" in json.dumps(response)
    with session() as db:
        assert db.get(Conversation, key).messages == [message]


def test_only_useful_public_document_urls_are_delivered():
    assert public_link("https://api.sectors.app/v2/report/TLKM?key=secret", "saved-id", "sectors") == "/financial-sources/saved-id"
    assert public_link("https://api.sectors.app/v2/news", "news-id", "sectors_news") == ""
    assert public_link("https://example.com/annual-report.pdf?token=secret#page=2") == "https://example.com/annual-report.pdf"
    assert public_link("https://user:secret@example.com/report") == ""
    assert public_link("javascript:alert(1)") == ""
    source = {"nested": {"request_headers": {"Authorization": "secret"}, "value": "0"}}
    assert public_payload(source) == {"nested": {"value": "0"}}
    assert "request_headers" in source["nested"]
