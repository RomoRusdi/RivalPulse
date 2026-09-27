from app.alerts import send_digest, status
from app.config import get_settings


def test_gmail_digest_is_bounded_and_suppresses_baselines(monkeypatch):
    monkeypatch.setenv("ALERTS_ENABLED", "true")
    monkeypatch.setenv("ALERT_MIN_SEVERITY", "high")
    monkeypatch.setenv("ALERT_EMAIL_TO", "marketing@example.com")
    monkeypatch.setenv("GMAIL_ADDRESS", "rivalpulse@gmail.com")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "app-password")
    get_settings.cache_clear()
    sent = []

    class SMTP:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def login(self, username, password):
            assert username == "rivalpulse@gmail.com" and password == "app-password"

        def send_message(self, message):
            sent.append(message)

    monkeypatch.setattr("app.alerts.smtplib.SMTP_SSL", SMTP)
    cards = [
        {"change_status": "baseline", "severity": "high", "company": {"symbol": "TLKM"},
         "type": "Product", "title": "Baseline"},
        {"change_status": "new", "severity": "medium", "company": {"symbol": "EXCL"},
         "type": "Campaign", "title": "Below threshold"},
        {"change_status": "updated", "severity": "high", "company": {"symbol": "ISAT"},
         "type": "Pricing", "title": "Important change"},
    ]
    assert status()["recipient"] == "ma***@example.com"
    assert send_digest(cards) is True
    assert len(sent) == 1
    body = sent[0].get_content()
    assert "Important change" in body
    assert "TLKM" not in body and "EXCL" not in body
    get_settings.cache_clear()
