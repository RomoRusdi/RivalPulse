"""Durable, fenced orchestration. Publication is one database transaction."""
import copy
import logging
import time
from datetime import timezone

from sqlalchemy import select, text, update

from app.agent import Agent, Tools
from app.config import get_settings
from app.contracts import ResearchResult, SignalCard
from app.db import iso, session, uid, utcnow
from app.errors import ProviderError
from app.models import Evidence, Revision, Run, RunSnapshot, RunStep, Signal, Snapshot
from app.providers import digest, ensure_active, growth
from app.public_sources import normalized_text

log = logging.getLogger("rivalpulse.research")
STAGES = ["validate", "plan", "collect", "compare", "analyze", "validate_output", "persist"]


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
            if snapshot.provider != "public":
                continue
            previous = successful_source_baseline(db, run, snapshot)
            old_subjects = {e["subject"] for e in previous.normalized.get("events", [])} if previous else set()
            for event in snapshot.normalized.get("events", []):
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
                fin = [m for m in fin if int(m["period"]) in periods]
            c["metrics"] = fin
            c["content_hash"] = digest({"events": sorted({e["text"] for e, _, _ in c["observations"]}), "financials": fin})
    return list(candidates.values())


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
        if len(revenues) >= 2 and (change := growth(revenues[-1], revenues[-2])) is not None:
            refs = revenues[-1]["evidence_ids"] + revenues[-2]["evidence_ids"]
            metrics.append(dict(metric="revenue_growth_percent", value=change, currency=None, unit="percent",
                                period=revenues[-1]["period"], comparison_basis="adjacent annual periods; " + revenues[-1]["comparison_basis"],
                                evidence_ids=refs))
            facts.append(dict(claim_id="revenue-growth", text=f"Calculated revenue growth: {change}%.", evidence_ids=refs))
    status = "complete" if metrics else "incomplete"
    baseline = candidate["change_status"] == "baseline"
    scores = {"materiality": 1, "relevance": 1, "evidence_strength": 2 if metrics else 1,
              "novelty": 0 if baseline else 1, "rubric_version": 1}
    severity = "medium" if metrics else "low"
    implication = dict(text=interpretation.marketing_implication,
                       supporting_claim_ids=interpretation.supporting_claim_ids, uncertainty=interpretation.uncertainty)
    now = iso(utcnow())
    event = candidate["observations"][0][0]
    card = dict(schema_version=1, signal_id=signal.id, revision_id=revision_id,
                company={k: candidate["company"][k] for k in ("id", "symbol", "name", "industry")},
                mode=run.mode, type=event["type"], title=event["title"], analysis_status=status,
                change_status="updated" if prior else candidate["change_status"], severity=severity,
                score_components=scores, severity_reason="Conservative evidence-based rubric; business materiality is unverified.",
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
        if snapshot.provider == "public":
            if not any(e.excerpt_or_json_pointer in event["text"] for event in snapshot.normalized.get("events", [])):
                raise ValueError("Unverifiable excerpt")
    for metric in parsed.financial_context:
        if not set(metric.evidence_ids) <= evidence.keys():
            raise ValueError("Unresolved financial citation")
        cited = [snapshots[evidence[i].snapshot_id] for i in metric.evidence_ids]
        if any(s.provider != "sectors" for s in cited):
            raise ValueError("Financial metrics require Sectors evidence")
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


def persist(run_id, token, candidates, analysis, coverage, warnings):
    with session() as db, db.begin():
        # Serialize event publication across different watchlists in the same workspace.
        if db.bind.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:workspace))"),
                       {"workspace": get_settings().workspace_id})
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
            card, revision_id = build_card(run, candidate, interpretations[candidate["event_key"]], signal, prior)
            validate_card(card, snapshots)
            revision = Revision(id=revision_id, signal_id=signal.id, run_id=run.id,
                                prior_revision_id=prior.id if prior else None, content_hash=candidate["content_hash"],
                                severity=card["severity"], card=card)
            db.add(revision)
            db.flush()
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
        partial = bool(warnings) or not cards or any(c["analysis_status"] != "complete" for c in cards)
        run.status = "partial" if partial else "completed"
        run.error_code = "INSUFFICIENT_EVIDENCE" if partial else None
        run.finished_at, run.heartbeat_at = utcnow(), utcnow()
        result = ResearchResult(run_id=run.id, mode=run.mode, status=run.status, generated_at=iso(utcnow()),
                                summary=f"{changes} new or updated findings; "
                                        f"{sum(c['change_status'] == 'baseline' for c in cards)} baseline observations.",
                                coverage=coverage, warnings=warnings, signals=cards)
        run.result = result.model_dump()
        run.lease_token = None
        final_step = db.scalar(select(RunStep).where(RunStep.run_id == run_id, RunStep.attempt == run.attempts,
                                                    RunStep.stage == "persist"))
        final_step.status = "completed"
        final_step.duration_ms = int((utcnow() - final_step.created_at.replace(tzinfo=timezone.utc)).total_seconds() * 1000)


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
        stage(run_id, token, "plan", "Selecting approved evidence tools")
        plan = agent.plan(inputs)
        with session() as db, db.begin():
            ensure_active(db, run_id, token).plan = plan.model_dump()
        stage(run_id, token, "collect", "Collecting provider evidence", {"tools": plan.model_dump()["tools"]})
        tools, coverage, warnings = Tools(run_id, token, inputs), [], []
        for tool in plan.tools:
            with session() as db, db.begin():
                active = ensure_active(db, run_id, token)
                active.heartbeat_at = utcnow()
                credits_before = active.credits
            started = time.monotonic()
            try:
                output = tools.execute(tool)
                outcome = {"tool": tool.name, "company_ids": tool.company_ids, "status": "ok",
                           "cache_status": output.get("cache_status") if isinstance(output, dict) else None,
                           "duration_ms": int((time.monotonic() - started) * 1000)}
                if isinstance(output, dict) and output.get("warnings"):
                    outcome["warnings"] = output["warnings"]
                    warnings.extend(f"{tool.name}: {w}" for w in output["warnings"])
                if tool.name == "get_company_metrics" and not output["data"].get("metrics"):
                    warnings.append("INSUFFICIENT_EVIDENCE: " + tool.company_ids[0])
                    outcome["status"] = "missing_financial"
                coverage.append(outcome)
            except ProviderError as exc:
                if exc.code in ("RUN_INTERRUPTED", "RUN_TIMEOUT"):
                    raise
                warnings.append(f"{tool.name}: {exc.code}")
                coverage.append({"tool": tool.name, "company_ids": tool.company_ids, "status": "failed", "code": exc.code})
            with session() as db, db.begin():
                active = ensure_active(db, run_id, token)
                coverage[-1]["estimated_credits"] = active.credits - credits_before
                step = db.scalar(select(RunStep).where(RunStep.run_id == run_id, RunStep.attempt == active.attempts,
                                                       RunStep.stage == "collect"))
                step.details = {"coverage": coverage}
            log.info("tool_finished", extra={"run_id": run_id, "stage": tool.name,
                     "estimated_credits": coverage[-1]["estimated_credits"],
                     "cache_status": coverage[-1].get("cache_status"),
                     "duration_ms": coverage[-1].get("duration_ms")})
        stage(run_id, token, "compare", "Comparing successful source baselines")
        candidates = candidates_for(run_id, coverage)
        stage(run_id, token, "analyze", "Generating labeled interpretations",
              {"adapter": "llm" if agent.adapter else "deterministic", "candidates": len(candidates)})
        analysis = agent.analyze([{"event_key": c["event_key"], "claims": c["claims"],
                                  "financial_context": c["metrics"]}
                                 for c in candidates])
        stage(run_id, token, "validate_output", "Schema and supporting claims validated")
        stage(run_id, token, "persist", "Publishing evidence-backed findings")
        persist(run_id, token, candidates, analysis, coverage, warnings)
    except Exception as exc:
        code = exc.code if isinstance(exc, ProviderError) else "INTERNAL_ERROR"
        with session() as db, db.begin():
            changed = db.execute(update(Run).where(Run.id == run_id, Run.status == "running", Run.lease_token == token).values(
                status="failed", error_code=code, finished_at=utcnow(), lease_token=None))
            if changed.rowcount:
                db.execute(update(RunStep).where(RunStep.run_id == run_id, RunStep.status == "running").values(status="failed"))
        # Never log provider exception bodies or prompts.
        log.error("run_failed", extra={"run_id": run_id, "error_code": code})
