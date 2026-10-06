"""Short-lived, single-use email enrollment. No plaintext code is persisted."""
import hashlib
import secrets
import smtplib
import ssl
from datetime import timedelta
from email.message import EmailMessage

from sqlalchemy import delete, select

from app.config import get_settings
from app.db import iso, utcnow
from app.errors import AppError
from app.models import PendingRegistration


def code_digest(identifier, code):
    return hashlib.sha256(f"{identifier}:{code}".encode()).hexdigest()


def send_code(email, code):
    settings = get_settings()
    if not settings.verification_smtp_host or not settings.verification_email_from:
        raise AppError("VERIFICATION_UNAVAILABLE", "Email verification is temporarily unavailable. Try again later.", 503, True)
    if settings.verification_smtp_security == "local" and settings.verification_smtp_host not in ("localhost", "127.0.0.1", "mailpit"):
        raise AppError("VERIFICATION_UNAVAILABLE", "Email verification is temporarily unavailable. Try again later.", 503, True)
    message = EmailMessage()
    message["Subject"] = "Verify your RivalPulse email"
    message["From"] = settings.verification_email_from
    message["To"] = email
    message.set_content(f"Your RivalPulse verification code is {code}.\n\n"
                        "It expires in 15 minutes. Do not share this code.\n"
                        "If you did not request this, ignore this email. Your account will not be activated.")
    smtp_type = smtplib.SMTP_SSL if settings.verification_smtp_security == "ssl" else smtplib.SMTP
    smtp_options = {"context": ssl.create_default_context()} if settings.verification_smtp_security == "ssl" else {}
    try:
        with smtp_type(settings.verification_smtp_host, settings.verification_smtp_port, timeout=10, **smtp_options) as smtp:
            if settings.verification_smtp_security == "starttls":
                smtp.starttls(context=ssl.create_default_context())
            if settings.verification_smtp_username:
                smtp.login(settings.verification_smtp_username, settings.verification_smtp_password.get_secret_value())
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        raise AppError("VERIFICATION_UNAVAILABLE", "The verification email could not be delivered. Try sending it again.", 503, True) from None


def cleanup(db):
    db.execute(delete(PendingRegistration).where(PendingRegistration.expires_at <= utcnow()).execution_options(synchronize_session=False))


def pending_result(row):
    return {"verificationRequired": True, "challengeId": row.id, "expiresAt": iso(row.code_expires_at),
            "resendAfter": iso(row.sent_at + timedelta(seconds=60))}


def enroll(db, body, password_hash, *, user_id=None):
    from app.db import uid
    cleanup(db)
    row = db.scalar(select(PendingRegistration).where(PendingRegistration.email == str(body.email)).with_for_update())
    now = utcnow()
    if row and row.sent_at.replace(tzinfo=now.tzinfo) > now - timedelta(seconds=60):
        raise AppError("VERIFICATION_COOLDOWN", "Wait a minute before requesting another code.", 429, True)
    if not row:
        row = PendingRegistration(id=uid(), email=str(body.email), name=body.name)
        db.add(row)
    row.name, row.password_hash, row.user_id = body.name, password_hash, user_id
    row.workspace_name, row.user_company = getattr(body, "workspace_name", None), getattr(body, "user_company", None)
    code = str(secrets.randbelow(100_000_000)).zfill(8)
    row.code_hash, row.attempts = code_digest(row.id, code), 0
    row.code_expires_at, row.expires_at, row.sent_at = now + timedelta(minutes=15), now + timedelta(hours=24), now
    # Send before committing the challenge. Failed delivery can be safely retried.
    send_code(row.email, code)
    db.commit()
    return pending_result(row)
