"""Durable, fenced orchestration. Publication is one database transaction."""
import copy
import logging
import re
import time
from datetime import timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy import select, text, update

from pydantic import ValidationError

from app.agent import Agent, Tools, is_financial_question, planned_scope
from app.alerts import send_digest
from app.config import get_settings
from app.classify import company_event, signal_title
from app.contracts import FinancialBrief, ResearchResult, SignalCard, ToolCall
from app.db import iso, session, uid, utcnow
from app.errors import ProviderError
from app.models import Evidence, Revision, Run, RunSnapshot, RunStep, Signal, Snapshot
from app.providers import digest, ensure_active, growth
from app.financial_projection import scope_boundary
from app.public_sources import normalized_text

log = logging.getLogger("rivalpulse.research")
STAGES = ["validate", "plan", "collect", "recover", "compare", "analyze", "validate_output", "persist"]
# Providers whose snapshots carry classified competitive events.
EVENT_PROVIDERS = ("public", "sectors_news")
# Tools that sweep for competitive events, in coverage records.
SWEEP_TOOLS = ("get_recent_signals", "get_company_news")
# Approved pages are optional corroboration; Sectors is the primary event source.
# A company with no page configured has nothing to fail, so these must not be
# read as coverage failures — otherwise every catalogue company without a
# hand-curated page would drag its run to "partial".
OPTIONAL_SOURCE_CODES = {"NO_APPROVED_SOURCES", "NO_REMAINING_SOURCES"}


def blocking(entries):
    """Warnings that represent evidence we failed to obtain, not evidence we
    were never configured to look for."""
    return [w for w in entries
            if not (isinstance(w, dict) and w.get("code") in OPTIONAL_SOURCE_CODES)]


def diagnose(run_id, coverage, financial_only=False):
    """Name the evidence each company is still missing, and whether another
    bounded request could realistically close it. A gap that cannot be closed is
    reported with its reason instead of being retried into the run deadline.

    Coverage, not stored snapshots, decides what was attempted: a source that
    failed to load leaves no snapshot but must not look like an unread page."""
    sweeps = {}
    for entry in coverage:
        if entry["tool"] == "get_recent_signals":
            for company_id in entry["company_ids"]:
                sweeps[company_id] = sweeps.get(company_id, 0) + 1
    with session() as db:
        run = db.get(Run, run_id)
        snapshots = db.scalars(select(Snapshot).join(RunSnapshot).where(RunSnapshot.run_id == run_id)).all()
        read = {s.company_id for s in snapshots if s.provider in EVENT_PROVIDERS}
        financial = {s.company_id for s in snapshots
                     if s.provider == "sectors" and s.normalized.get("metrics")}
        empty_financial = {s.company_id for s in snapshots
                           if s.provider == "sectors" and not s.normalized.get("metrics")}
        events = {s.company_id for s in snapshots if s.provider in EVENT_PROVIDERS and s.normalized.get("events")}
        gaps = []
        scope = planned_scope(run.inputs)
        for company in run.inputs["companies"]:
            if company["id"] not in scope:
                continue
            company_id, sources = company["id"], company.get("sources", [])
            if company_id not in financial:
                gaps.append({
                    "symbol": company["symbol"], "company_id": company_id, "missing": "financial",
                    # A stored report with no metrics means the provider has no
                    # statements for this company; asking again returns the cache.
                    "recoverable": company_id not in empty_financial,
                    "reason": ("Provider returned a report without financial statements"
                               if company_id in empty_financial else "No financial report was retrieved"),
                })
            # A statement-only investigation never sweeps public pages, so their
            # absence is the requested scope rather than a gap.
            if company_id not in events and not financial_only:
                # Each sweep consumes at most two approved pages.
                consumed = 2 * sweeps.get(company_id, 0)
                unread = len(sources) > consumed
                gaps.append({
                    "symbol": company["symbol"], "company_id": company_id, "missing": "public_events",
                    "recoverable": bool(sources) and unread,
                    "reason": ("No approved source is configured" if not sources else
                               "Approved pages remain unread" if unread else
                               "All approved pages were read and contained no announcement"
                               if company_id in read else "Every approved page failed to load"),
                })
        return gaps


def recovery_plan(gaps, inputs, coverage=()):
    """A second evidence plan derived from what the first pass actually returned,
    rather than from the query alone."""
    companies = {c["id"]: c for c in inputs["companies"]}
    sweeps = {}
    for entry in coverage:
        if entry["tool"] == "get_recent_signals":
            for company_id in entry["company_ids"]:
                sweeps[company_id] = sweeps.get(company_id, 0) + 1
    actions = []
    permanent_financial_failures = {company_id for entry in coverage
                                   if entry.get("tool") == "get_company_metrics" and entry.get("code") in {
                                       "PROVIDER_AUTH_FAILED", "PROVIDER_ACCESS_DENIED", "PROVIDER_QUOTA_EXHAUSTED",
                                       "CREDIT_BUDGET_EXCEEDED", "PROVIDER_INVALID_RESPONSE", "PROVIDER_REQUEST_REJECTED"}
                                   for company_id in entry.get("company_ids", [])}
    for gap in (g for g in gaps if g["recoverable"]):
        company = companies[gap["company_id"]]
        if gap["missing"] == "financial":
            if company["id"] in permanent_financial_failures:
                continue
            actions.append(ToolCall(name="get_company_metrics", company_ids=[company["id"]],
                                    reason=f"Retry unretrieved financial statements for {company['symbol']}"))
        else:
            # Continue where this run's own sweeps left off: a company the first
            # pass never swept starts at offset 0, not 2.
            offset = 2 * sweeps.get(company["id"], 0)
            actions.append(ToolCall(name="get_recent_signals", company_ids=[company["id"]], source_offset=offset,
                                    reason=f"Read the remaining approved pages for {company['symbol']}"))
    return actions


def claim_run(run_id):
    token = uid()
    with session() as db, db.begin():
        result = db.execute(update(Run).where(Run.id == run_id, Run.status == "queued",
                                             Run.attempts < get_settings().max_run_attempts).values(
            status="running", lease_token=token, started_at=utcnow(), heartbeat_at=utcnow(),
            attempts=Run.attempts + 1, error_code=None))
        return token if result.rowcount else None


def stage(run_id, token, name, message, details=None):
    with session() as db, db.begin():
        run = ensure_active(db, run_id, token)
        previous = db.scalar(select(RunStep).where(RunStep.run_id == run_id, RunStep.attempt == run.attempts)
                             .order_by(RunStep.sequence.desc()).limit(1))
        now = utcnow()
        duration = int((now - previous.created_at.replace(tzinfo=timezone.utc)).total_seconds() * 1000) if previous else 0
        if previous:
            previous.status, previous.duration_ms = "completed", duration
        db.add(RunStep(run_id=run_id, attempt=run.attempts, sequence=STAGES.index(name), stage=name,
                       message=message, details=details or {}, status="running"))
        run.stage, run.heartbeat_at = name, now
    log.info("run_stage", extra={"run_id": run_id, "stage": name, "duration_ms": duration})


def successful_source_baseline(db, run, snapshot):
    return db.scalar(select(Snapshot).join(RunSnapshot, RunSnapshot.snapshot_id == Snapshot.id)
                     .join(Run, Run.id == RunSnapshot.run_id).where(
                         Run.watchlist_id == run.watchlist_id, Run.mode == run.mode,
                         Run.status.in_(["completed", "partial"]), Run.id != run.id,
                         Snapshot.request_key == snapshot.request_key,
                     ).order_by(Run.created_at.desc()).limit(1))


def candidates_for(run_id, coverage):
    candidates = {}
    with session() as db:
        run = db.get(Run, run_id)
        links = db.execute(select(Snapshot, RunSnapshot.outcome).join(RunSnapshot).where(RunSnapshot.run_id == run_id)).all()
        companies = {c["id"]: c for c in run.inputs["companies"]}
        financials = {}
        for snapshot, outcome in links:
            if snapshot.provider == "sectors" and snapshot.normalized.get("metrics"):
                financials[snapshot.company_id] = (snapshot, outcome)
        for snapshot, outcome in links:
            # Approved pages and structured provider news are both event evidence.
            if snapshot.provider not in EVENT_PROVIDERS:
                continue
            previous = successful_source_baseline(db, run, snapshot)
            old_subjects = {e["subject"] for e in previous.normalized.get("events", [])} if previous else set()
            for event in snapshot.normalized.get("events", []):
                if snapshot.provider == "sectors_news":
                    event = company_event(event, companies[snapshot.company_id])
                    if event is None:
                        continue
                event_key = digest([snapshot.company_id, event["type"],
                                    normalized_text(event["subject"]).casefold(), event.get("published_at")])
                candidate = candidates.get(event_key)
                if candidate:
                    candidate["observations"].append((event, snapshot, outcome))
                    continue
                candidates[event_key] = dict(
                    event_key=event_key, company=companies[snapshot.company_id], observations=[(event, snapshot, outcome)],
                    financial=financials.get(snapshot.company_id),
                    change_status="baseline" if previous is None else ("updated" if event["subject"] in old_subjects else "new"),
                )
        for c in candidates.values():
            c["claims"] = [{"claim_id": f"observation-{i}", "text": e["text"][:4000]}
                           for i, (e, _, _) in enumerate(c["observations"])]
            fin = c["financial"][0].normalized["metrics"] if c["financial"] else []
            periods = next((t["requested_periods"] for t in run.plan["tools"]
                            if t["name"] == "get_company_metrics" and c["company"]["id"] in t["company_ids"]), [])
            if periods:
                kept = []
                for m in fin:
                    try:
                        if int(m["period"]) in periods:
                            kept.append(m)
                    except (ValueError, TypeError, KeyError):
                        continue
                fin = kept
            c["metrics"] = fin
            c["content_hash"] = digest({"events": sorted({e["text"] for e, _, _ in c["observations"]}), "financials": fin})
    return list(candidates.values())


def comparison_note(brief):
    """One evidence-grounded ranking line for the common period, or None.

    Ranking is only stated when every compared company reports revenue for the
    same period with identical known currency, unit and reporting scope — the
    same comparability rule as growth(). Anything weaker stays a table the
    reader can eyeball, never a claim.
    """
    if not brief or not brief.period:
        return None
    figures = []
    for row in brief.rows:
        match = next((m for m in row.metrics
                      if m.metric == "revenue" and m.period == brief.period), None)
        if not match or not match.currency:
            return None
        figures.append((row.symbol, match, match.currency, match.unit, match.comparison_basis))
    if len(figures) < 2:
        return None
    first = figures[0]
    if any((c, u, b) != (first[2], first[3], first[4]) for _, _, c, u, b in figures):
        return None
    if first[3] == "provider_native_unspecified" or first[4] == "reporting_scope_unverified":
        return None
    try:
        ranked = sorted(figures, key=lambda f: Decimal(f[1].value), reverse=True)
    except (InvalidOperation, ValueError, AttributeError):
        return None
    if ranked[0][1].value == ranked[-1][1].value:
        return None
    return (f"In {brief.period}, reported revenue on a comparable basis "
            f"({first[2]}, {first[3]}) was highest at {ranked[0][0]} "
            f"and lowest at {ranked[-1][0]}. See the cited figures below.")


def yoy_percent(current, previous):
    """Use the same verified annual arithmetic as the Competitors page."""
    change = growth(current, previous)
    return (("+" if Decimal(change) >= 0 else "") + change + "%") if change is not None else None


def financial_brief_for(run_id):
    """Build a cited statement brief directly from this run's immutable snapshots."""
    with session() as db:
        run = db.get(Run, run_id)
        snapshots = {s.company_id: s for s in db.scalars(select(Snapshot).join(RunSnapshot).where(
            RunSnapshot.run_id == run_id, Snapshot.mode == run.mode,
            Snapshot.provider == "sectors",
        )) if s.normalized.get("metrics")}
        common = None
        present = [c for c in run.inputs["companies"] if c["id"] in snapshots]
        if present:
            periods = [{m["period"] for m in snapshots[c["id"]].normalized["metrics"] if m["metric"] == "revenue"}
                       for c in present]
            shared = set.intersection(*periods) if periods else set()
            common = max(shared) if shared else None
        rows, claims, caveats = [], [], []
        unverified_basis = False
        scoped = [c for c in run.inputs["companies"] if c["id"] in planned_scope(run.inputs)]
        for company in scoped:
            snapshot = snapshots.get(company["id"])
            if not snapshot:
                caveats.append(f"{company['symbol']}: no financial statements were available.")
                continue
            available = snapshot.normalized["metrics"]
            period = common or max(m["period"] for m in available)
            metrics = []
            for metric_name in ("revenue", "earnings"):
                match = next((m for m in available if m["metric"] == metric_name and m["period"] == period), None)
                if match:
                    claim_id = f"financial-{company['symbol']}-{metric_name}-{period}"
                    metrics.append({**{k: match[k] for k in ("metric", "value", "currency", "unit", "period", "comparison_basis")},
                                    "source_url": snapshot.url, "json_pointer": match["pointer"],
                                    "snapshot_id": snapshot.id, "claim_id": claim_id})
                    claims.append({"claim_id": claim_id, "symbol": company["symbol"],
                                   "metric": metric_name, "period": period, "value": match["value"],
                                   "currency": match["currency"], "unit": match["unit"]})
            for metric_name in ("revenue", "earnings"):
                current = next((m for m in metrics if m["metric"] == metric_name), None)
                if not current:
                    continue
                try:
                    prior_period = str(int(period) - 1)
                except (ValueError, TypeError):
                    continue
                prior = next((m for m in available
                              if m["metric"] == metric_name and m["period"] == prior_period), None)
                if not prior or scope_boundary(period, prior['period'], company['comparison_note'], current['comparison_basis']):
                    continue
                change = yoy_percent(current, prior)
                if change is None:
                    continue
                if not current["currency"] or current["unit"] == "provider_native_unspecified":
                    unverified_basis = True
                metrics.append({"metric": f"{metric_name}_yoy_percent", "value": change, "currency": None,
                                "unit": "percent", "period": period,
                                "comparison_basis": f"computed vs {prior['period']}; {current['comparison_basis']}",
                                "source_url": current["source_url"], "json_pointer": current["json_pointer"],
                                "snapshot_id": current["snapshot_id"],
                                "claim_id": f"financial-{company['symbol']}-{metric_name}-yoy-{period}"})
            rows.append({"symbol": company["symbol"], "name": company["name"],
                         "comparison_note": company["comparison_note"], "metrics": metrics,
                         "revenue_history": [
                             {**{key: metric[key] for key in ("metric", "value", "currency", "unit", "period", "comparison_basis")},
                              "source_url": snapshot.url, "json_pointer": metric["pointer"], "snapshot_id": snapshot.id,
                              "claim_id": f"financial-{company['symbol']}-revenue-{metric['period']}"}
                             for metric in sorted(available, key=lambda entry: entry["period"]) if metric["metric"] == "revenue"
                         ]})
        if unverified_basis:
            caveats.append("Year-on-year percentages are computed from as-reported values; "
                           "verify reporting scope before relying on them.")
        if not common:
            caveats.append("No common annual revenue period was available for all companies; do not rank unlike periods.")
        return FinancialBrief(period=common, rows=rows, caveats=caveats), claims


def score_candidate(candidate, metrics, prior):
    """Transparent positioning-impact rubric adapted from the standalone agent."""
    event_type = candidate["observations"][0][0]["type"].casefold()
    materiality = {"pricing": 3, "product": 2, "partnership": 2, "campaign": 1}.get(event_type, 1)
    relevance = {"pricing": 3, "product": 3, "partnership": 2, "campaign": 2}.get(event_type, 1)
    evidence_strength = min(3, len(candidate["observations"]) + (1 if metrics else 0))
    novelty = 1 if prior else (0 if candidate["change_status"] == "baseline" else 2)
    total = materiality + relevance + evidence_strength + novelty
    severity = "high" if total >= 10 else ("medium" if total >= 6 else "low")
    confidence = min(0.95, 0.50 + min(len(candidate["observations"]), 2) * 0.10 + (0.20 if metrics else 0))
    components = {
        "materiality": materiality,
        "relevance": relevance,
        "evidence_strength": evidence_strength,
        "novelty": novelty,
        "confidence": round(confidence, 2),
        "total": total,
        "rubric_version": 2,
    }
    reason = (
        f"Positioning-impact rubric v2: materiality {materiality}, relevance {relevance}, "
        f"evidence strength {evidence_strength}, novelty {novelty}."
    )
    return components, severity, reason


def build_card(run, candidate, interpretation, signal, prior):
    revision_id = uid()
    evidence, facts, observed, metrics = [], [], [], []

    def cite(snapshot, outcome, locator, claim_id, published=None, url=None):
        identifier = uid()
        evidence.append(dict(id=identifier, snapshot_id=snapshot.id, source=snapshot.provider,
                             url_or_endpoint=url or snapshot.url, excerpt_or_json_pointer=locator,
                             published_at=published, fetched_at=iso(snapshot.fetched_at), cache_status=outcome))
        return identifier

    for i, (event, snapshot, outcome) in enumerate(candidate["observations"]):
        claim_id = f"observation-{i}"
        quote = event["text"][:4000]
        eid = cite(snapshot, outcome, quote, claim_id, event.get("published_at"), event.get("url"))
        observed.append(dict(claim_id=claim_id, text=quote, evidence_ids=[eid]))
    if candidate["financial"]:
        snapshot, outcome = candidate["financial"]
        raw_metrics = candidate["metrics"]
        for i, metric in enumerate(raw_metrics):
            eid = cite(snapshot, outcome, metric["pointer"], f"financial-{i}")
            value = {k: metric[k] for k in ("metric", "value", "unit", "currency", "period", "comparison_basis")}
            metrics.append({**value, "evidence_ids": [eid]})
            facts.append(dict(claim_id=f"financial-{i}", text=f"{metric['metric']} for {metric['period']}: "
                              f"{metric['value']} {metric['currency'] or 'currency unspecified'} ({metric['unit']}).",
                              evidence_ids=[eid]))
        revenues = sorted([m for m in metrics if m["metric"] == "revenue"], key=lambda m: m["period"])
        if len(revenues) >= 2 and not scope_boundary(revenues[-1]["period"], revenues[-2]["period"],
                                                    candidate["company"].get("comparison_note", ""),
                                                    revenues[-1]["comparison_basis"]) and (change := growth(revenues[-1], revenues[-2])) is not None:
            refs = revenues[-1]["evidence_ids"] + revenues[-2]["evidence_ids"]
            metrics.append(dict(metric="revenue_growth_percent", value=change, currency=None, unit="percent",
                                period=revenues[-1]["period"], comparison_basis="adjacent annual periods; " + revenues[-1]["comparison_basis"],
                                evidence_ids=refs))
            facts.append(dict(claim_id="revenue-growth", text=f"Calculated revenue growth: {change}%.", evidence_ids=refs))
    status = "complete" if metrics else "incomplete"
    scores, severity, severity_reason = score_candidate(candidate, metrics, prior)
    implication = dict(text=interpretation.marketing_implication,
                       supporting_claim_ids=interpretation.supporting_claim_ids, uncertainty=interpretation.uncertainty)
    now = iso(utcnow())
    event = candidate["observations"][0][0]
    card = dict(schema_version=1, signal_id=signal.id, revision_id=revision_id,
                company={k: candidate["company"][k] for k in ("id", "symbol", "name", "industry", "comparison_note")},
                mode=run.mode, type=event["type"], title=signal_title(event, candidate["company"]), analysis_status=status,
                change_status="updated" if prior else candidate["change_status"], severity=severity,
                score_components=scores, severity_reason=severity_reason,
                facts=facts, observed_signals=observed,
                hypotheses=[dict(text=interpretation.hypothesis, supporting_claim_ids=interpretation.supporting_claim_ids,
                                 uncertainty=interpretation.uncertainty)],
                financial_context=metrics, why_marketing_should_care=implication, evidence=evidence,
                run_id=run.id, compared_against_run_id=run.baseline_id, first_seen_at=iso(signal.first_seen_at),
                published_at=event.get("published_at"), stored_at=now)
    return SignalCard.model_validate(card).model_dump(), revision_id


def validate_card(card, snapshots):
    parsed = SignalCard.model_validate(card)
    evidence = {e.id: e for e in parsed.evidence}
    claims = {c.claim_id: c for c in parsed.facts + parsed.observed_signals}
    if len(claims) != len(parsed.facts) + len(parsed.observed_signals):
        raise ValueError("Duplicate claim ID")
    for c in claims.values():
        if not set(c.evidence_ids) <= evidence.keys():
            raise ValueError("Unresolved claim citation")
    for e in parsed.evidence:
        snapshot = snapshots.get(e.snapshot_id)
        if snapshot is None or snapshot.company_id != parsed.company["id"] or snapshot.mode != parsed.mode:
            raise ValueError("Evidence is outside company/run/mode")
        if snapshot.provider in EVENT_PROVIDERS:
            if not any(e.excerpt_or_json_pointer in event["text"] for event in snapshot.normalized.get("events", [])):
                raise ValueError("Unverifiable excerpt")
    for metric in parsed.financial_context:
        if not set(metric.evidence_ids) <= evidence.keys():
            raise ValueError("Unresolved financial citation")
        cited = [snapshots[evidence[i].snapshot_id] for i in metric.evidence_ids]
        # Existing archived test cards retain their original citation checks;
        # the retired test provider cannot be selected for any new run.
        # Financial figures may only ever cite a Sectors company report. News
        # snapshots are stored under "sectors_news" precisely so they cannot
        # satisfy this check.
        allowed_financial_provider = "sectors"
        if any(s.provider != allowed_financial_provider for s in cited):
            raise ValueError(f"Financial metrics require {allowed_financial_provider} evidence in {parsed.mode} mode")
        if metric.metric != "revenue_growth_percent":
            if not any(all(m.get(k) == getattr(metric, k) for k in
                           ("metric", "value", "period", "currency", "unit", "comparison_basis"))
                       for s in cited for m in s.normalized.get("metrics", [])):
                raise ValueError("Financial value does not match evidence")
        else:
            pointers = {evidence[i].excerpt_or_json_pointer for i in metric.evidence_ids}
            source_metrics = [m for m in cited[0].normalized["metrics"]
                              if m["metric"] == "revenue" and m["pointer"] in pointers]
            ordered = sorted(source_metrics, key=lambda m: m["period"])
            if len(ordered) < 2 or growth(ordered[-1], ordered[-2]) != metric.value:
                raise ValueError("Invalid computed growth")
    for h in parsed.hypotheses + [parsed.why_marketing_should_care]:
        if not h.supporting_claim_ids or not set(h.supporting_claim_ids) <= claims.keys():
            raise ValueError("Unsupported interpretation")
    if parsed.analysis_status == "complete" and not parsed.financial_context:
        raise ValueError("Complete card lacks financial evidence")


def persist(run_id, token, candidates, analysis, coverage, warnings, financial_brief=None,
            financial_context_only=False):
    published = []
    with session() as db, db.begin():
        publication_scope = db.get(Run, run_id).workspace_id
        # Serialize event publication across different watchlists in the same workspace.
        if db.bind.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:workspace))"),
                       {"workspace": publication_scope})
        run = db.scalar(select(Run).where(Run.id == run_id).with_for_update())
        ensure_active(db, run_id, token)
        snapshots = {s.id: s for s in db.scalars(select(Snapshot).join(RunSnapshot).where(RunSnapshot.run_id == run_id))}
        interpretations = {i.event_key: i for i in analysis.interpretations}
        cards, changes = [], 0
        for candidate in candidates:
            signal = db.scalar(select(Signal).where(Signal.workspace_id == run.workspace_id, Signal.mode == run.mode,
                                                    Signal.event_key == candidate["event_key"]))
            if not signal:
                signal = Signal(workspace_id=run.workspace_id, company_id=candidate["company"]["id"], mode=run.mode,
                                event_key=candidate["event_key"], type=candidate["observations"][0][0]["type"])
                db.add(signal)
                db.flush()
            prior = db.scalar(select(Revision).where(Revision.signal_id == signal.id)
                              .order_by(Revision.created_at.desc(), Revision.id.desc()).limit(1))
            signal.last_seen_at = utcnow()
            if prior and prior.content_hash == candidate["content_hash"]:
                card = copy.deepcopy(prior.card)
                card["change_status"] = "unchanged"
                # The immutable original citations remain available from this run too.
                for e in card["evidence"]:
                    if not db.get(RunSnapshot, (run.id, e["snapshot_id"])):
                        db.add(RunSnapshot(run_id=run.id, snapshot_id=e["snapshot_id"], outcome="unchanged"))
                        db.flush()
                cards.append(card)
                continue
            try:
                card, revision_id = build_card(run, candidate, interpretations[candidate["event_key"]], signal, prior)
                validate_card(card, snapshots)
            except (ValidationError, ValueError, KeyError, TypeError) as exc:
                # One unbuildable finding must not discard the rest of a paid,
                # collected investigation: skip it loudly and publish the rest.
                log.warning("card_rejected", extra={"run_id": run_id,
                             "event_key": candidate.get("event_key", "unknown"),
                             "error_type": type(exc).__name__})
                warnings.append("One finding could not be validated and was skipped; "
                                "the remaining cited findings are published below.")
                continue
            revision = Revision(id=revision_id, signal_id=signal.id, run_id=run.id,
                                prior_revision_id=prior.id if prior else None, content_hash=candidate["content_hash"],
                                severity=card["severity"], card=card)
            db.add(revision)
            db.flush()
            published.append(copy.deepcopy(card))
            for claim in card["facts"] + card["observed_signals"]:
                for eid in claim["evidence_ids"]:
                    e = next(e for e in card["evidence"] if e["id"] == eid)
                    # A computed metric may cite evidence also used by its original fact.
                    db.add(Evidence(revision_id=revision_id, snapshot_id=e["snapshot_id"], claim_id=claim["claim_id"],
                                    id=eid if not db.get(Evidence, eid) else uid(), locator=e["excerpt_or_json_pointer"],
                                    url=e["url_or_endpoint"], published_at=e["published_at"],
                                    fetched_at=snapshots[e["snapshot_id"]].fetched_at))
                    db.flush()
            cards.append(card)
            if card["change_status"] != "baseline":
                changes += 1
        # The comparison table answers the request, not the whole watchlist:
        # scope its rows to the companies the query names (plus our own),
        # falling back to everyone when it names no one. Status and evidence
        # stay complete; only the presented comparison narrows.
        scoped_brief = financial_brief
        compared = (run.inputs or {}).get("compared_symbols")
        if scoped_brief is not None and compared:
            rows = [r for r in scoped_brief.rows if r.symbol in compared]
            # Per-company caveats ("FREN: no financial statements…") for
            # companies outside the requested comparison leak watchlist
            # members the user did not ask about — drop them with the rows.
            out_of_scope = {c["symbol"] for c in run.inputs["companies"]} - set(compared)
            caveats = [c for c in scoped_brief.caveats
                       if not any(c.startswith(f"{symbol}:") for symbol in out_of_scope)]
            if len(rows) != len(scoped_brief.rows) or len(caveats) != len(scoped_brief.caveats):
                scoped_brief = scoped_brief.model_copy(update={"rows": rows, "caveats": caveats})
        # A request naming "my company" with no perspective set compares
        # without it — say so plainly instead of silently dropping the framing.
        ours_note = ""
        if not (run.inputs or {}).get("user_company") and re.search(
                r"\b(my company|our company|perusahaanku|perusahaan\s+(saya|kami|kita))\b",
                run.query or "", re.I):
            ours_note = (" Note: the request refers to your company, but no company perspective is set — "
                         "set it under Competitors → Our company (or say “my company is TLKM”).")
        if financial_brief is not None and financial_context_only:
            # Report completeness is separate from competitive-change coverage.
            scoped = [c for c in run.inputs["companies"] if c["id"] in planned_scope(run.inputs)]
            partial = bool(warnings) or len(financial_brief.rows) != len(scoped) or any(
                not row.metrics for row in financial_brief.rows)
            summary = (f"Annual financial context for {len(financial_brief.rows)} of "
                       f"{len(run.inputs['companies'])} competitors. "
                       "See the cited figures below; annual statements do not establish weekly competitor moves.")
            note = comparison_note(scoped_brief)
            if note:
                summary += " " + note
            summary += ours_note
        else:
            # An approved page that was read successfully and contained no announcement
            # is a verified quiet result, not missing evidence. Only unread sources
            # leave real coverage gaps.
            sweeps = [entry for entry in coverage if entry["tool"] in SWEEP_TOOLS]
            verified_quiet = bool(sweeps) and all(
                entry["status"] == "ok" and not blocking(entry.get("warnings", [])) for entry in sweeps)
            partial = bool(warnings) or (not cards and not verified_quiet) or any(
                c["analysis_status"] != "complete" for c in cards)
            if not cards and verified_quiet:
                summary = (f"No competitive announcements were found on the approved pages for all "
                           f"{len(run.inputs['companies'])} competitors. Every page was read successfully; "
                           "this is a verified quiet period, not missing evidence.")
            else:
                baselines = sum(c["change_status"] == "baseline" for c in cards)
                unchanged = sum(c["change_status"] == "unchanged" for c in cards)
                if changes == 0 and baselines and not unchanged:
                    symbols = sorted({c["company"]["symbol"] for c in cards})
                    hot = sum(1 for c in cards if c["severity"] == "high")
                    summary = (
                        f"{baselines} baseline observations across {len(symbols)} "
                        f"competitor{'s' if len(symbols) != 1 else ''} ({', '.join(symbols)}). "
                        "This first investigation establishes the reference baseline; "
                        "new or updated findings will be flagged from the next run.")
                    if hot:
                        summary += (f" {hot} baseline "
                                    f"{'finding needs' if hot == 1 else 'findings need'} attention (high severity).")
                else:
                    summary = (f"{changes} new or updated findings; "
                               f"{baselines} baseline observations; "
                               f"{unchanged} previously observed findings unchanged.")
            if scoped_brief is not None:
                note = comparison_note(scoped_brief)
                if note:
                    summary += " " + note
            if cards:
                # Name the companies the evidence said nothing about. A tracked
                # competitor with zero findings otherwise vanishes silently,
                # leaving "why no Mandiri?" unanswered. Scoped to the requested
                # comparison: unmentioned companies were never investigated.
                scope = planned_scope(run.inputs)
                covered = {c["company"]["symbol"] for c in cards}
                for company in run.inputs["companies"]:
                    if company["id"] not in scope or company["symbol"] in covered:
                        continue
                    own = [s for s in snapshots.values() if s.company_id == company["id"]]
                    if not own:
                        why = "no data was retrieved for it"
                    elif not any(s.provider in EVENT_PROVIDERS and (s.normalized or {}).get("events")
                                   for s in own):
                        why = "no competitive events were found for it in this run's evidence"
                    else:
                        why = "its events could not be validated into findings"
                    summary += f" No findings for {company['symbol']}: {why}."
            summary += ours_note
            if warnings:
                summary += " Some sources were unavailable; this does not establish that nothing changed."
        run.status = "partial" if partial else "completed"
        run.error_code = "INSUFFICIENT_EVIDENCE" if partial else None
        run.finished_at, run.heartbeat_at = utcnow(), utcnow()
        result = ResearchResult(run_id=run.id, mode=run.mode, status=run.status, generated_at=iso(utcnow()),
                                summary=summary, coverage=coverage, warnings=warnings, signals=cards,
                                financial_brief=scoped_brief)
        run.result = result.model_dump()
        run.lease_token = None
        final_step = db.scalar(select(RunStep).where(RunStep.run_id == run_id, RunStep.attempt == run.attempts,
                                                    RunStep.stage == "persist"))
        final_step.status = "completed"
        final_step.duration_ms = int((utcnow() - final_step.created_at.replace(tzinfo=timezone.utc)).total_seconds() * 1000)
    return published


def execute_run(run_id, adapter=None):
    token = claim_run(run_id)
    if not token:
        return
    try:
        stage(run_id, token, "validate", "Frozen competitors and prior state loaded")
        with session() as db:
            run = db.get(Run, run_id)
            inputs = run.inputs
        agent = Agent(run_id, token, adapter)
        financial_only = is_financial_question(inputs["query"])
        route = "financial_statements" if financial_only else "competitive_activity"
        stage(run_id, token, "plan", "Selecting approved evidence tools")
        plan = agent.plan(inputs)
        with session() as db, db.begin():
            active = ensure_active(db, run_id, token)
            active.plan = plan.model_dump()
            plan_step = db.scalar(select(RunStep).where(
                RunStep.run_id == run_id, RunStep.attempt == active.attempts, RunStep.stage == "plan"))
            # The route decides which evidence is required, so it belongs in the
            # audit trail next to the plan it produced.
            plan_step.details = {"planner": agent.plan_source, "route": route,
                                 "route_reason": ("Statement question: annual financials only, no page sweep"
                                                  if financial_only else
                                                  "Activity question: approved pages plus financial context"),
                                 "required_tools": sorted({t.name for t in plan.tools}),
                                 "user_company": inputs.get("user_company")}
            if agent.plan_source == "validated_fallback":
                plan_step.message = "Qwen plan rejected; using the reviewed bounded evidence plan"
        stage(run_id, token, "collect", "Collecting provider evidence", {"tools": plan.model_dump()["tools"]})
        tools, coverage, warnings = Tools(run_id, token, inputs), [], []

        def run_tool(tool, into_stage):
            with session() as db, db.begin():
                active = ensure_active(db, run_id, token)
                active.heartbeat_at = utcnow()
                credits_before = active.credits
            started = time.monotonic()
            try:
                output = tools.execute(tool)
                outcome = {"tool": tool.name, "company_ids": tool.company_ids, "status": "ok",
                           "stage": into_stage,
                           "cache_status": output.get("cache_status") if isinstance(output, dict) else None,
                           "duration_ms": int((time.monotonic() - started) * 1000)}
                if isinstance(output, dict) and output.get("warnings"):
                    outcome["warnings"] = output["warnings"]
                    if tool.name != "get_company_metrics":
                        warnings.extend(f"{tool.name}: {w}" for w in blocking(output["warnings"]))
                if tool.name == "get_company_metrics" and not output["data"].get("metrics"):
                    warnings.append("INSUFFICIENT_EVIDENCE: " + tool.company_ids[0])
                    outcome["status"] = "missing_financial"
                coverage.append(outcome)
            except ProviderError as exc:
                if exc.code in ("RUN_INTERRUPTED", "RUN_TIMEOUT"):
                    raise
                warnings.append(f"{tool.name}: {exc.code}")
                coverage.append({"tool": tool.name, "company_ids": tool.company_ids, "status": "failed",
                                 "stage": into_stage, "code": exc.code})
            with session() as db, db.begin():
                active = ensure_active(db, run_id, token)
                coverage[-1]["estimated_credits"] = active.credits - credits_before
                step = db.scalar(select(RunStep).where(RunStep.run_id == run_id, RunStep.attempt == active.attempts,
                                                       RunStep.stage == into_stage))
                step.details = {**(step.details or {}), "coverage": [c for c in coverage
                                                                     if c.get("stage") == into_stage]}
            log.info("tool_finished", extra={"run_id": run_id, "stage": tool.name,
                     "estimated_credits": coverage[-1]["estimated_credits"],
                     "cache_status": coverage[-1].get("cache_status"),
                     "duration_ms": coverage[-1].get("duration_ms")})

        for tool in plan.tools:
            run_tool(tool, "collect")

        # Re-plan against what the first pass actually returned. This is the only
        # point where the agent's plan responds to observed evidence rather than
        # to the query, so gaps and their reasons are recorded either way.
        gaps = diagnose(run_id, coverage, financial_only)
        if gaps:
            actions = recovery_plan(gaps, inputs, coverage)
            stage(run_id, token, "recover",
                  f"Closing {sum(g['recoverable'] for g in gaps)} of {len(gaps)} evidence gaps",
                  {"gaps": gaps, "actions": [a.model_dump() for a in actions]})
            for tool in actions:
                run_tool(tool, "recover")
            remaining = diagnose(run_id, coverage, financial_only)
            with session() as db, db.begin():
                active = ensure_active(db, run_id, token)
                step = db.scalar(select(RunStep).where(RunStep.run_id == run_id, RunStep.attempt == active.attempts,
                                                       RunStep.stage == "recover"))
                closed = len(gaps) - len(remaining)
                step.details = {**(step.details or {}), "remaining_gaps": remaining, "gaps_closed": closed}
                step.message = (f"Recovered {closed} of {len(gaps)} evidence gaps" if closed else
                                f"{len(gaps)} evidence gaps could not be closed; reasons recorded")
            log.info("recovery_finished", extra={"run_id": run_id, "gaps": len(gaps), "closed": closed})
        stage(run_id, token, "compare", "Comparing collected evidence")
        candidates = [] if financial_only else candidates_for(run_id, coverage)
        # Every run gets the cited annual-statement table for side-by-side
        # comparison. It is free (reads this run's snapshots: no credits, no
        # model call). Only statement-only investigations let it drive status;
        # activity runs attach it as context while competitive coverage decides.
        brief, claims = financial_brief_for(run_id)
        if financial_only:
            stage(run_id, token, "analyze", "Generating evidence-linked interpretation",
                  {"adapter": "llm" if agent.adapter else "deterministic", "candidates": len(candidates)})
            try:
                brief.interpretation = agent.analyze_financial(claims)
            except ProviderError as exc:
                if exc.code not in ("LLM_INVALID_OUTPUT", "LLM_UNAVAILABLE", "LLM_BUDGET_EXCEEDED"):
                    raise
                brief.caveats.append("AI interpretation could not be validated; the cited figures remain available.")
                log.warning("financial_interpretation_unavailable", extra={"run_id": run_id, "error_code": exc.code})
        else:
            stage(run_id, token, "analyze", "Generating evidence-linked interpretation",
                  {"adapter": "llm" if agent.adapter else "deterministic", "candidates": len(candidates)})
            brief.interpretation = None
            if not any(row.metrics for row in brief.rows):
                brief = None
        prepared = [{"event_key": c["event_key"], "claims": c["claims"], "financial_context": c["metrics"]}
                    for c in candidates]
        interpreter = "qwen" if agent.adapter and candidates else "deterministic"
        try:
            analysis = agent.analyze(prepared)
        except ProviderError as exc:
            # The evidence is already collected and paid for. A model sentence
            # that fails validation must not discard it: publish the cited
            # findings with reviewed conservative wording, and say so. A model
            # outage still fails the run, matching the planning policy.
            if exc.code not in ("LLM_INVALID_OUTPUT", "LLM_BUDGET_EXCEEDED"):
                raise
            analysis, interpreter = Agent.deterministic_analysis(prepared), "validated_fallback"
            log.warning("analysis_wording_rejected", extra={"run_id": run_id, "error_code": exc.code})
        with session() as db, db.begin():
            active = ensure_active(db, run_id, token)
            analyze_step = db.scalar(select(RunStep).where(
                RunStep.run_id == run_id, RunStep.attempt == active.attempts, RunStep.stage == "analyze"))
            analyze_step.details = {**(analyze_step.details or {}), "interpreter": interpreter}
            if interpreter == "validated_fallback":
                analyze_step.message = "AI wording rejected; published cited findings with reviewed wording"
        stage(run_id, token, "validate_output", "Schema and supporting claims validated")
        stage(run_id, token, "persist", "Storing cited investigation")
        published = persist(run_id, token, candidates, analysis, coverage, warnings, brief,
                              financial_context_only=financial_only)
        with session() as delivery_db:
            delivered_run = delivery_db.get(Run, run_id)
            legacy_delivery = delivered_run.workspace_id == get_settings().workspace_id
        if legacy_delivery:
            send_digest(published)
    except Exception as exc:
        code = exc.code if isinstance(exc, ProviderError) else "INTERNAL_ERROR"
        with session() as db, db.begin():
            changed = db.execute(update(Run).where(Run.id == run_id, Run.status == "running", Run.lease_token == token).values(
                status="failed", error_code=code, finished_at=utcnow(), lease_token=None))
            if changed.rowcount:
                db.execute(update(RunStep).where(RunStep.run_id == run_id, RunStep.status == "running").values(status="failed"))
        # Never log provider exception bodies or prompts; type plus a short
        # detail is what makes "check the API logs" actually answerable.
        log.error("run_failed", extra={"run_id": run_id, "error_code": code,
                 "error_type": type(exc).__name__, "error_detail": str(exc)[:300]})
