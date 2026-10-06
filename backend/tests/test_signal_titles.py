from app.classify import signal_title


COMPANY = {"symbol": "TLKM", "name": "Telkom Indonesia"}


def test_short_complete_source_title_keeps_event_and_company():
    assert signal_title({"title": "Telkom launches enterprise cloud service", "type": "Product"}, COMPANY) == "TLKM · Telkom launches enterprise cloud service"


def test_long_prose_generates_complete_title_and_preserves_supported_purpose():
    event = {"title": "Telkom " + "introduces a new enterprise cloud service with regional infrastructure " * 5,
             "text": "Telkom launches a cloud service to serve enterprise customers.", "type": "Product"}
    title = signal_title(event, COMPANY)
    assert title == "TLKM announces a product or service launch to serve enterprise customers"
    assert len(title) <= 120


def test_no_inferred_revenue_outcomes_or_incomplete_connector():
    event = {"title": "Telkom announces a partnership with " + "regional infrastructure " * 10,
             "text": "Telkom announces a partnership with a regional operator.", "type": "Partnership"}
    assert signal_title(event, COMPANY) == "TLKM announces a partnership"


def test_legacy_projection_does_not_repeat_ticker_or_attribute_roundup():
    event = {"title": "TLKM · Telkom launches cloud service", "type": "Product"}
    assert signal_title(event, COMPANY) == event["title"]
    assert "attribution needs review" in signal_title(event, COMPANY, attributed=False)
