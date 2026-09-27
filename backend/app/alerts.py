"""Bounded Gmail delivery for newly published high-priority competitor changes."""
import logging
import re
import smtplib
from email.message import EmailMessage

from app.config import get_settings

log = logging.getLogger("rivalpulse.alerts")
SEVERITY = {"low": 1, "medium": 2, "high": 3}
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def status():
    settings = get_settings()
    recipient = settings.alert_email_to.strip()
    configured = bool(
        settings.alerts_enabled
        and EMAIL.fullmatch(recipient)
        and settings.gmail_address.get_secret_value()
        and settings.gmail_app_password.get_secret_value()
    )
    local, _, domain = recipient.partition("@")
    masked = (local[:2] + "***@" + domain) if local and domain else None
    return {
        "enabled": configured,
        "provider": "gmail",
        "recipient": masked,
        "minimum_severity": settings.alert_min_severity,
        "delivery_policy": "One digest per completed run; baseline and unchanged findings are never emailed.",
    }


def send_digest(cards):
    """Send at most one digest for a run; failures never invalidate research."""
    settings = get_settings()
    current = status()
    if not current["enabled"]:
        return False
    threshold = SEVERITY[settings.alert_min_severity]
    important = [
        card for card in cards
        if card.get("change_status") in ("new", "updated")
        and SEVERITY.get(card.get("severity"), 0) >= threshold
    ]
    if not important:
        return False

    sender = settings.gmail_address.get_secret_value()
    recipient = settings.alert_email_to.strip()
    message = EmailMessage()
    count = len(important)
    message["Subject"] = f"[RivalPulse] {count} important competitor change{'s' if count != 1 else ''}"
    message["From"] = sender
    message["To"] = recipient
    lines = [
        "RivalPulse detected evidence-backed competitor changes:",
        "",
    ]
    for card in important:
        company = card.get("company") or {}
        lines.extend([
            f"- {company.get('symbol', 'Competitor')} · {card.get('type', 'Signal')} · {card.get('severity', '').upper()}",
            f"  {card.get('title', 'Untitled signal')}",
            f"  Change: {card.get('change_status')}",
            "",
        ])
    lines.extend([
        f"Review evidence: {settings.app_base_url.rstrip('/')}/signals",
        "",
        "Information and business analysis only; not investment advice.",
        "You received one digest for this run. Baselines and unchanged findings are suppressed.",
    ])
    message.set_content("\n".join(lines))
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as smtp:
            smtp.login(sender, settings.gmail_app_password.get_secret_value())
            smtp.send_message(message)
        log.info("alert_digest_sent", extra={"count": count, "minimum_severity": settings.alert_min_severity})
        return True
    except (OSError, smtplib.SMTPException):
        log.warning("alert_digest_failed", extra={"count": count})
        return False
