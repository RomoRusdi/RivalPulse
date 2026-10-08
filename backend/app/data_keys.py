"""Workspace Sectors connection. Reads and saves never call Sectors.

A workspace may bring its own Sectors API key; research uses it before the
server default. Keys are encrypted with the same server key as model keys and
are never returned, logged or placed in run inputs.
"""
from pydantic import SecretStr, field_validator

from app.config import get_settings
from app.contracts import Strict
from app.db import iso, utcnow
from app.errors import AppError, ProviderError
from app.llm_settings import check_key, decrypt, encrypt, storage_ready
from app.models import WorkspaceDataKey

PROVIDER = "sectors"


class SectorsKeyUpdate(Strict):
    api_key: SecretStr

    valid_key = field_validator("api_key")(check_key)


def server_key():
    return get_settings().sectors_api_key.get_secret_value().strip() or None


def sectors_key(db, workspace):
    """The key research should use: the workspace's own, else the server default."""
    row = db.get(WorkspaceDataKey, (workspace, PROVIDER))
    if row:
        try:
            return decrypt(row)
        except ProviderError:
            raise ProviderError("PROVIDER_CREDENTIALS_MISSING",
                                "The saved Sectors key cannot be unlocked; add it again in Settings", False) from None
    return server_key()


def view(db, workspace, can_edit):
    row = db.get(WorkspaceDataKey, (workspace, PROVIDER))
    return {"workspace_key": bool(row), "server_key": bool(server_key()),
            "connected": bool(row) or bool(server_key()), "updated_at": iso(row.updated_at) if row else None,
            "can_edit": can_edit, "key_storage_ready": storage_ready(), "live": get_settings().mode == "live"}


def save(db, workspace, body):
    if not storage_ready():
        raise AppError("LLM_KEY_STORAGE_UNAVAILABLE", "Secure key storage is not configured. Contact your administrator.", 503)
    row = db.get(WorkspaceDataKey, (workspace, PROVIDER), with_for_update=True)
    encrypted = encrypt(body.api_key.get_secret_value(), workspace, PROVIDER)
    if row:
        row.encrypted_key, row.updated_at = encrypted, utcnow()
    else:
        db.add(WorkspaceDataKey(workspace_id=workspace, provider=PROVIDER, encrypted_key=encrypted, updated_at=utcnow()))
    db.commit()
    return view(db, workspace, True)


def remove(db, workspace):
    row = db.get(WorkspaceDataKey, (workspace, PROVIDER), with_for_update=True)
    if row:
        db.delete(row)
    db.commit()
    return view(db, workspace, True)
