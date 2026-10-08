# Architecture and evidence rules

## Active application

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind, Zod. Routes under `frontend/src/app/`; reusable UI under `components/`; API/contracts/state/export code under `lib/`.
- **API:** FastAPI in `backend/app/main.py`, account/session access, workspace isolation, request validation, and saved-data endpoints.
- **Agent:** `backend/app/agent.py` plans approved bounded tools and requests validated model output. `research.py` executes the workflow and publishes evidence-linked results.
- **Providers:** Sectors v2 in `providers.py`; approved public-page collection in `public_sources.py`; interchangeable local/cloud reasoning adapters in `agent.py` and `cloud_llm.py`.
- **Persistence:** PostgreSQL/SQLAlchemy/Alembic. Redis/RQ queues research; the worker and reconciler are `app.jobs`. No standalone prototype is required.

```text
validate → plan → collect → recover → compare → analyze → validate_output → persist
```

The backend—not a model—authorizes tools, scope, permissions, request/time/credit limits, financial arithmetic, and citations. There is a bounded model-call ceiling and one repair path, no provider-native tools, arbitrary provider URL, or silent cross-provider fallback. Collection failures remain explicit; a wording outage can preserve collected evidence with unavailable AI support.

## Workspace and saved-data boundaries

Watchlists have 2–5 competitor slots; optional own-company perspective is independent. A run freezes company/source scope, objective, perspective, and model descriptor, never credentials. Settings changes apply to new work/current chat, not historical reanalysis. Snapshots, evidence, revisions, and terminal research results are immutable; read-only projections can correct delivery without rewriting originals.

Opening history, finding detail, stored financial sources, and exports does not call providers/models or save a projected correction back automatically. Saved-summary chat returns saved excerpts, links, coverage qualifications, and original interpretations; ordinary chat may call the selected model but does not call Sectors or queue research. Explicit fresh research is separate.

## Findings and financial context

Findings distinguish Product, Pricing, Partnership, Campaign, Financial update, Analyst commentary, and Market context. Commentary, mentions, and financial guidance are not automatically competitor moves. Evidence observation citations are distinct from financial-context citations.

Current live semantic review selects at most **6 articles**, batches of **3**, and sends up to **1,000 source characters** per article to classification. Question/company/topic/time relevance orders selection; it does not establish category or actor meaning. The model labels literal spans; backend checks quotations, scoped association, and conflicting actors. Unclassified articles are counted/disclosed rather than published as guessed moves. Review is bounded, not exhaustive or independently fact-checked.

Structured decision support separates:

1. **What happened:** cited literal observation.
2. **Why it matters:** validated qualitative interpretation.
3. **Possible implication:** conditional and nullable.
4. **Recommended next step:** suggestion only.
5. **Limitations:** missing evidence, uncertain scope, and inference provenance.

Financial numbers originate in source reports, not model memory. Decimal calculations, annual periods, adjacent-year checks, and merger/scope boundaries live in backend projections. Provider-reported percentages remain distinct from calculated ones. Grouping companies by sector does not itself prove comparability.

### Current accuracy caveats

These are existing behavior/limitations, not guarantees introduced by repository cleanup:

- Some saved monetary figures omit currency/scale/basis. The frontend currently infers rupiah for large unlabeled values; XLS can use that inference for Rp-trillion numeric cells. Magnitude is **not authoritative currency/scale evidence**.
- Annual growth accepts matching unknown metadata, and same-sector peer ranking currently accepts matching unverified basis strings. Review reporting scale/scope before relying on growth or ranks.
- The older `CompetitorMomentum` panel reads signal-attached financials rather than every saved report. Blank cells there do not establish missing provider data.
- Saved-chat missing-company wording is based on a limited recent finding selection, so older saved findings may be omitted.
- Missing dates, unreviewed articles, rejected attribution, or source failures cannot establish a verified quiet period.

## Exports

`frontend/src/lib/export-xls.ts` exports the specific investigation's question, answer, comparison, sector-grouped annual history, exact source figures, findings, and deduplicated notes/limitations. Own-company rows are highlighted. Numeric cells support sorting/charting; long source digits are retained as text to avoid Excel's 15-digit precision limit. The format is HTML tables with an `.xls` extension, not native `.xlsx`, so a format warning is possible. Individual findings export a labeled text brief. Neither path regenerates research.

## Credentials, processing, and billing

Account access uses Argon2 password hashes, revocable HttpOnly sessions, CSRF/origin checks, temporary-session tab proofs, and workspace ownership. Only owners manage provider keys. Fernet-encrypted envelopes bind credentials to workspace/provider. Keys do not belong in prompts, research inputs/results, URLs, client storage, returned settings, or error messages. Trusted server administrators can decrypt; this is not zero-knowledge storage.

Cloud inference sends bounded research context or ordinary chat/history to the selected provider under its policy and may incur separate API charges. Settings saves contact no provider; explicit model discovery performs a listing request, not generation. Removing model credentials clears workspace configuration versions and disables the active cloud selection for future requests, not in-flight memory or external backups. Revoke leaked keys at the provider.

Sectors workspace keys take precedence over the shared server key. Requests have conservative internal reservations; unknown outcomes remain charged. Per-run/workspace budgets still share a global Sectors reserve even for workspace-owned keys. These counters are **not authoritative external account balances**. Scheduled sweeps are disabled by default; optional Gmail alerts belong to the configured preserved workspace, not all accounts.

See [Setup](SETUP.md), [Development](DEVELOPMENT.md), and the [Sectors endpoint reference](SECTORS_ENDPOINT_REVIEW.md).
