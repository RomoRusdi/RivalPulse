"""Owner-managed workspace LLM settings. Reads/saves never call any provider."""
import json
import re
from typing import Literal
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from pydantic import Field, SecretStr, field_validator
from sqlalchemy import select, update

from app.config import get_settings
from app.contracts import Strict
from app.db import iso
from app.errors import AppError, ProviderError
from app.models import LLMConfiguration, Workspace, WorkspaceLLM

Provider = Literal["ollama", "openai", "anthropic", "gemini"]
# Suggested starting points, pinned first in the connected model list: fast,
# low-cost models that return short structured JSON without a thinking budget.
DEFAULTS = {"openai": "gpt-4.1-mini", "anthropic": "claude-haiku-4-5", "gemini": "gemini-2.5-flash"}


def check_key(value):
    if value is not None:
        raw = value.get_secret_value()
        if not 10 <= len(raw) <= 4096 or re.search(r"\s|[\x00-\x1f\x7f]", raw):
            raise ValueError("Supply a nonempty API key without spaces or control characters")
    return value


class LLMUpdate(Strict):
    provider: Provider
    model: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$")
    enabled: bool = True
    cloud_consent: bool = False
    api_key: SecretStr | None = None

    valid_key = field_validator("api_key")(check_key)


class ModelListRequest(Strict):
    provider: Provider
    api_key: SecretStr | None = None

    valid_key = field_validator("api_key")(check_key)


def cipher():
    try:
        settings = get_settings()
        key = settings.llm_key_encryption_key.get_secret_value().encode()
        if not key and settings.llm_key_encryption_key_file:
            key = Path(settings.llm_key_encryption_key_file).read_bytes().strip()
        return Fernet(key)
    except (OSError, ValueError, TypeError):
        raise AppError("LLM_KEY_STORAGE_UNAVAILABLE", "Secure API-key storage is not configured. Contact your administrator.", 503) from None


def storage_ready():
    try:
        cipher()
        return True
    except AppError:
        return False


def encrypt(raw, workspace, provider):
    data = json.dumps({"workspace": workspace, "provider": provider, "key": raw}).encode()
    return cipher().encrypt(data).decode()


def decrypt(row):
    try:
        data = json.loads(cipher().decrypt(row.encrypted_key.encode()))
        if data["workspace"] != row.workspace_id or data["provider"] != row.provider:
            raise ValueError()
        return data["key"]
    except (AppError, InvalidToken, ValueError, KeyError, AttributeError, TypeError):
        raise ProviderError("LLM_NOT_CONFIGURED", "The selected model credential is unavailable", False) from None


def latest_for(db, workspace, provider):
    return db.scalar(select(LLMConfiguration).where(LLMConfiguration.workspace_id == workspace,
        LLMConfiguration.provider == provider).order_by(LLMConfiguration.created_at.desc(), LLMConfiguration.id.desc()).limit(1))


def descriptor(db, workspace):
    active = db.get(WorkspaceLLM, workspace)
    row = db.get(LLMConfiguration, active.configuration_id) if active else None
    if row:
        return {"configuration_id": row.id, "provider": row.provider, "model": row.model, "enabled": row.enabled}
    s = get_settings()
    return {"configuration_id": None, "provider": "ollama", "model": s.ollama_model, "enabled": s.llm_enabled}


def settings_view(db, workspace, can_edit):
    providers = []
    for provider in ("ollama", "openai", "anthropic", "gemini"):
        row = latest_for(db, workspace, provider)
        providers.append({"provider": provider, "model": row.model if row else get_settings().ollama_model if provider == "ollama" else DEFAULTS[provider],
                          "key_configured": bool(row and row.encrypted_key), "updated_at": iso(row.created_at) if row else None})
    current = descriptor(db, workspace)
    row = db.get(LLMConfiguration, current["configuration_id"]) if current["configuration_id"] else None
    return {**current, "cloud_consent": bool(row and row.cloud_consent), "providers": providers,
            "can_edit": can_edit, "key_storage_ready": storage_ready(), "connection_tested": False}


def save(db, workspace, body):
    # Serialize selection/key preservation to avoid lost edits between owners.
    db.scalar(select(Workspace).where(Workspace.id == workspace).with_for_update())
    prior = latest_for(db, workspace, body.provider)
    key = prior.encrypted_key if prior else None
    if body.provider == "ollama" and body.api_key:
        raise AppError("LLM_KEY_NOT_REQUIRED", "Local Ollama does not need an API key", 422)
    if body.api_key is not None:
        key = encrypt(body.api_key.get_secret_value(), workspace, body.provider)
    if body.enabled and body.provider != "ollama":
        if not body.cloud_consent:
            raise AppError("LLM_CLOUD_CONSENT_REQUIRED", "Confirm external processing and separate provider charges before enabling a cloud model.", 422)
        if not key:
            raise AppError("LLM_KEY_REQUIRED", "Add an API key for this provider before enabling it.", 422)
        cipher()  # Never accept an apparently usable cloud setting without decryption support.
        if prior and body.api_key is None:
            try:
                decrypt(prior)
            except ProviderError:
                raise AppError("LLM_KEY_STORAGE_UNAVAILABLE", "The saved API key cannot be unlocked. Restore the server encryption key or replace the provider key.", 503) from None
    row = LLMConfiguration(workspace_id=workspace, provider=body.provider, model=body.model,
                           enabled=body.enabled, cloud_consent=body.cloud_consent, encrypted_key=key)
    db.add(row)
    db.flush()
    active = db.get(WorkspaceLLM, workspace)
    if active:
        active.configuration_id = row.id
    else:
        db.add(WorkspaceLLM(workspace_id=workspace, configuration_id=row.id))
    db.commit()
    return settings_view(db, workspace, True)


def remove_key(db, workspace, provider):
    if provider == "ollama":
        raise AppError("LLM_KEY_NOT_REQUIRED", "Local Ollama has no saved API key", 422)
    db.scalar(select(Workspace).where(Workspace.id == workspace).with_for_update())
    db.execute(update(LLMConfiguration).where(LLMConfiguration.workspace_id == workspace,
        LLMConfiguration.provider == provider).values(encrypted_key=None))
    current = descriptor(db, workspace)
    if current["provider"] == provider:
        # New selection disables future inference; frozen historic selections stay
        # intact but their erased credentials can no longer be loaded for retries.
        return save(db, workspace, LLMUpdate(provider=provider, model=current["model"], enabled=False))
    db.commit()
    return settings_view(db, workspace, True)


def adapter_for(db, workspace, frozen=None):
    from app.agent import OllamaAdapter
    from app.cloud_llm import CloudAdapter
    selected = frozen if frozen is not None else descriptor(db, workspace)
    if not selected["enabled"]:
        return None
    if selected["provider"] == "ollama":
        # No override for the server default keeps existing injected test adapters compatible.
        return OllamaAdapter() if selected["model"] == get_settings().ollama_model else OllamaAdapter(model=selected["model"])
    row = db.get(LLMConfiguration, selected.get("configuration_id"))
    if not row or row.workspace_id != workspace or row.provider != selected["provider"] or row.model != selected["model"] or not row.cloud_consent:
        raise ProviderError("LLM_NOT_CONFIGURED", "The selected workspace model is not configured", False)
    return CloudAdapter(row.provider, row.model, decrypt(row))


def models_view(db, workspace, body):
    """Connect step: list what the pasted (or saved) key can use. Saves nothing."""
    from app.cloud_llm import available_models
    key = None
    if body.provider != "ollama":
        if body.api_key is not None:
            key = body.api_key.get_secret_value()
        else:
            row = latest_for(db, workspace, body.provider)
            if not row or not row.encrypted_key:
                raise AppError("LLM_KEY_REQUIRED", "Paste an API key to connect this provider.", 422)
            key = decrypt(row)
    models = available_models(body.provider, key)
    suggested = get_settings().ollama_model if body.provider == "ollama" else DEFAULTS[body.provider]
    models.sort(key=lambda model: model[0] != suggested)  # stable: provider order otherwise kept
    return {"provider": body.provider, "key_source": "pasted" if body.api_key is not None else "saved" if key else "none",
            "models": [{"id": model, "label": label, "suggested": model == suggested} for model, label in models]}
