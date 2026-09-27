# RivalPulse Agent Core

Evidence-grounded competitive-intelligence agent for Indonesian public companies and the Sectors Hackathon 2026.

This package is the standalone agent laboratory preserved from the `eye` work. Its strongest patterns—bounded tools, deterministic scoring, evidence-ID guards, fact/hypothesis separation, and local Qwen synthesis—are integrated into the production backend. The durable backend remains authoritative for runs, snapshots, revisions, and frontend contracts.

## Why this is an agent

RivalPulse does more than prompt an LLM:

```text
validated research scope
  → explicit five-step evidence plan
  → bounded Sectors v2 tools
  → normalized company, financial, industry and news evidence
  → deterministic cross-company analysis
  → threshold-based signal detection
  → previous-run comparison
  → grounded LLM synthesis
  → schema and evidence-ID validation
  → persistent result memory
```

The model may improve summaries, hypotheses and marketing implications. It cannot create financial figures, evidence IDs, companies or signal IDs. If the model is unavailable or violates the schema, deterministic output is retained with a warning.

## Hackathon alignment

- **Sectors is core:** production research uses Sectors v2 company reports and bounded company news. There is no alternate live-data fallback.
- **Custom orchestration:** planning, tool routing, normalization, analysis, signal scoring and memory are application code rather than one large prompt.
- **Stateful:** stable signal keys are compared with the previous successful scope and labeled `baseline`, `new`, `updated` or `unchanged`.
- **Evidence disciplined:** factual evidence is source-linked; observations are labeled `observed_signal`; interpretations are labeled `ai_hypothesis`.
- **Marketing focused:** implications explain what a positioning or campaign team should monitor, not whether to trade a security.
- **Safe:** outputs include limitations and never provide investment advice or trade execution.

## Install

Python 3.11+ is required.

```powershell
cd rivalpulse_agent
python -m pip install -e ".[test]"
Copy-Item .env.example .env
```

For local Ollama synthesis:

```powershell
ollama pull qwen3.8:27b
```

Set the production provider in `.env`:

```dotenv
RIVALPULSE_DATA_PROVIDER=sectors
SECTORS_API_KEY=YOUR_SERVER_SIDE_KEY
RIVALPULSE_MEMORY_FILE=.rivalpulse/research-memory.json
OLLAMA_MODEL=qwen3.8:27b
```

Never expose `SECTORS_API_KEY` through a frontend environment variable.

## Research with Sectors

```powershell
python -m rivalpulse_core research `
  --provider sectors `
  --target ISAT `
  --competitors TLKM EXCL `
  --output research-result.json
```

The first run establishes a baseline. Run the same scope again to see unchanged or updated findings:

```powershell
python -m rivalpulse_core research `
  --provider sectors `
  --target ISAT `
  --competitors TLKM EXCL
```

The installed `rivalpulse` command is equivalent to `python -m rivalpulse_core`.

## Grounded chat

Single question:

```powershell
python -m rivalpulse_core ask `
  --provider sectors `
  --target ISAT `
  --competitors TLKM EXCL `
  --question "Who leads growth and what should marketing monitor?"
```

Interactive session:

```powershell
python -m rivalpulse_core chat `
  --provider sectors `
  --target ISAT `
  --competitors TLKM EXCL
```

Every grounded answer returns exact evidence IDs and source references. Unknown evidence IDs from the model are rejected.

## Offline fixtures

Normalized JSON remains available for deterministic development:

```powershell
python -m rivalpulse_core schema --output normalized-data.schema.json
python -m rivalpulse_core research `
  --provider json `
  --data normalized-data.json `
  --target ISAT `
  --competitors TLKM EXCL `
  --deterministic
```

## Production backend integration

The unchanged Next.js frontend uses the compatibility contract exposed by the durable backend:

```text
GET  /dashboard
GET  /signals/:id
POST /runs
GET  /runs/:id/stream
POST /runs/:id/cancel
```

Production orchestration lives in `backend/app/agent.py` and `backend/app/research.py`. It uses Sectors v2, PostgreSQL snapshots/revisions, Redis workers, deterministic planning and scoring, evidence validation, and optional local Ollama synthesis. The standalone JSON-file memory in this package is intentionally not used by the production service.

Backend configuration uses `backend/.env`:

```dotenv
MODE=live
SECTORS_API_KEY=YOUR_SERVER_SIDE_KEY
LLM_ENABLED=true
LLM_PLAN_ENABLED=false
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.8:27b
```

## External adapters

A data owner can provide another normalized development adapter without changing reasoning code:

```dotenv
RIVALPULSE_DATA_TOOLS_FACTORY=person3_package.adapter:create_tools
```

The factory must return an implementation of `rivalpulse_core.tools.CompetitiveDataTools`. Production judging runs should still use the Sectors provider.

## Verification

```powershell
cd rivalpulse_agent
python -m pytest -q
python -m compileall -q rivalpulse_core tests
python -m rivalpulse_core schema > $null
```

Current automated coverage verifies:

- Sectors response normalization;
- coalescing three report consumers into one company-report request;
- revenue and earnings growth calculations;
- Sectors source provenance;
- persistent baseline, unchanged and updated signal states.
