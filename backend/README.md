# RivalPulse backend

FastAPI + SQLAlchemy/Alembic + PostgreSQL + Redis/RQ. The active research agent is `app/agent.py`; `app/research.py` orchestrates bounded collection, evidence validation, interpretation, and persistence. Sectors v2 is the only live financial provider. Local Ollama and workspace-selected cloud models share the same backend safeguards.

## Run

Use [Setup](../docs/SETUP.md) for configuration, encryption-key initialization, accounts, and the same-origin gateway. From the repository root on Windows:

```powershell
.\START_SECTORS.ps1
```

For manual Compose startup, initialize/protect `.env.llm-encryption` first, configure the ignored `.env`, start the host frontend on port 3000, then run:

```sh
docker compose --profile frontend up --build -d
```

The included manifest is local-development infrastructure. Keep volumes, credentials, and the encryption master key when updating. Do not apply migrations while investigations are active.

## Develop and test

Python 3.11+; the container uses 3.12. From this directory:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -e ".[test]"
.venv/Scripts/python.exe -m pytest -q -m "not integration"
.venv/Scripts/ruff.exe check app tests scripts migrations
```

On Linux/macOS use `.venv/bin/`. Tests use isolated synthetic evidence and mocked providers; `MODE=replay` is not a live website mode.

## API and maintenance

- API docs: **http://localhost:8000/docs**; current schema: `/openapi.json`.
- Readiness: `/api/v1/health/ready`; liveness: `/api/v1/health/live`.
- Worker: `python -m app.jobs`; reconciler: `python -m app.jobs reconcile`.
- Canonical contracts: `app/contracts.py`; frontend delivery projections: `app/compat.py`.
- Migration chain: `migrations/versions/`; normal upgrade: `alembic upgrade head`.
- Diagnostic and maintenance commands: `scripts/`—see [Development](../docs/DEVELOPMENT.md) before running them.

See [Architecture](../docs/ARCHITECTURE.md) for workspace isolation, billing, evidence rules, exports, and known limitations.
