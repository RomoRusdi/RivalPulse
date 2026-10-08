"""Saved-news regression cases. All data/database setup is offline; no provider requests."""
import copy

from sqlalchemy import select

from app.classify import as_event, classify, company_event, finding_scope
from app.config import get_settings
from app.contracts import SignalCard
from app.db import iso, session, uid, utcnow
from app.decision_support import analysis_context, fallback_interpretation, prepared_candidate
from app.finding_projection import find_context_signal, project_signal_card, reindex_categories
from app.models import Company, Conversation, Revision, Run, RunSnapshot, Signal, Snapshot, Watchlist
from app.research import build_card, candidates_for, validate_card

EXCL = {"symbol": "EXCL", "name": "PT XLSmart Telecom Sejahtera Tbk", "industry": "Telecommunication", "comparison_note": "Scope unverified"}
CAPEX = ("EXCL raised its 2026 capex guidance to Rp20 trillion to fund the XL‐Link Net integration, "
         "reporting 26 % semester‐I 2026 revenue growth and a normalized EBITDA increase of 19 %, "
         "while ISAT lifted its 2026 capex from Rp13 trillion to Rp23 trillion for 5G rollout, "
         "posting Q2‐2026 revenue growth of 14 % and ARPU growth of 19.5 %.")
ANALYST = ("The Kiwoom Sekuritas analyst highlights that the rollout of 700 MHz spectrum and the "
           "consolidation of mobile operators into PT XLSmart Telecom Sejahtera (EXCL) are expected to "
           "drive the performance of Indonesia’s three listed tower companies through 2026.")


def archived_card(text, title=None):
    stamp = iso(utcnow())
    citation = uid()
    return dict(schema_version=1, signal_id=uid(), revision_id=uid(), company={"id": uid(), **EXCL},
                mode="live", type="Product", title=title or text[:180], change_status="new",
                analysis_status="incomplete", severity="high", score_components={"total": 10},
                severity_reason="Original legacy scoring", facts=[],
                observed_signals=[{"claim_id": "observation-0", "text": text, "evidence_ids": [citation]}],
                hypotheses=[{"text": "This observation may affect competitive positioning; intent is unverified.",
                             "supporting_claim_ids": ["observation-0"], "uncertainty": "high"}],
                financial_context=[], why_marketing_should_care={"text": "Review this evidence when assessing messaging.",
                    "supporting_claim_ids": ["observation-0"], "uncertainty": "high"},
                evidence=[{"id": citation, "snapshot_id": uid(), "source": "sectors_news",
                    "url_or_endpoint": "https://api.sectors.app/v2/news/", "excerpt_or_json_pointer": text,
                    "published_at": stamp, "fetched_at": stamp, "cache_status": "fetched"}],
                run_id=uid(), compared_against_run_id=None, first_seen_at=stamp, published_at=stamp, stored_at=stamp)


def test_capex_guidance_is_financial_not_product_and_excludes_isat_clause():
    event = as_event("Telecom capital spending guidance", CAPEX, "https://news.example.invalid/capex", "2026-10-06")
    scoped = company_event(event, EXCL)
    assert scoped["type"] == "Financial update"
    assert finding_scope(scoped["type"]) == "financial_context"
    assert "EXCL raised" in scoped["text"] and scoped["text"] in event["text"]
    assert "ISAT" not in scoped["text"] and "Rp23" not in scoped["text"]
    other = company_event(event, {"symbol": "ISAT", "name": "PT Indosat Tbk"})
    assert other["type"] == "Financial update" and "ISAT" in other["text"]
    assert "EXCL" not in other["text"] and "Rp20" not in other["text"]


def test_kiwoom_tower_outlook_stays_third_party_commentary():
    event = as_event("Analyst tower outlook", ANALYST, "https://news.example.invalid/analyst", "2026-10-06")
    scoped = company_event(event, EXCL)
    assert scoped["type"] == "Analyst commentary"
    assert finding_scope(scoped["type"]) == "third_party_commentary"
    assert "Kiwoom" in scoped["text"]
    assert "EXCL" in scoped["text"] and scoped["text"] in event["text"]


def test_other_company_launch_is_not_attributed_to_excl():
    event = as_event("Indosat launch", "Indosat launches an enterprise product to compete with EXCL.",
                     "https://news.example.invalid/other", "2026-10-06")
    assert company_event(event, EXCL) is None


def test_other_company_financial_numbers_are_not_owned_by_a_later_mention():
    event = as_event("Company capex context", "ISAT raised capex to fund a network competing with EXCL.",
                     "https://news.example.invalid/finance", "2026-10-06")
    assert company_event(event, EXCL) is None


def test_real_product_launch_survives_an_analyst_comment_elsewhere():
    event = as_event("EXCL launches enterprise service", "EXCL launches an enterprise cloud service. An analyst discusses tower prospects.",
                     "https://news.example.invalid/launch", "2026-10-06")
    scoped = company_event(event, EXCL)
    assert scoped["type"] == "Product"
    assert scoped["text"] == "EXCL launches an enterprise cloud service."


def test_archived_projection_is_idempotent_and_does_not_rewrite_originals():
    original = archived_card(CAPEX)
    before = copy.deepcopy(original)
    view = project_signal_card(original)
    assert original == before
    assert view["type"] == "Financial update" and view["original_type"] == "Product"
    assert view["classification_revised"]
    assert view["hypotheses"] == [] and view["decision_support"] is None
    assert "ISAT" not in view["observed_signals"][0]["text"]
    assert view["evidence"] == original["evidence"]
    assert view["severity"] == "low" and view["score_components"]["total"] == 0
    assert project_signal_card(view) == view
    SignalCard.model_validate(view)


def test_truncated_archive_title_does_not_remove_the_capex_actor():
    view = project_signal_card(archived_card(CAPEX, CAPEX[:180]))
    assert view["type"] == "Financial update"
    assert view["observed_signals"][0]["text"].startswith("EXCL raised")


def test_stored_analyst_title_never_becomes_excl_launch_summary():
    view = project_signal_card(archived_card(ANALYST))
    assert view["type"] == "Analyst commentary"
    assert "launch" not in view["title"].lower()
    assert "third-party analyst commentary" in view["title"]
    assert "not an announcement" in view["classification_note"]


def test_generated_finding_title_cannot_substitute_for_source_evidence():
    text = "ISAT raised capex to compete with EXCL."
    view = project_signal_card(archived_card(text, "EXCL announces a product launch"))
    assert view["type"] == "Market context"
    assert view["observed_signals"][0]["text"] == text
    assert view["attribution_review"]


def test_financial_report_citation_is_not_observation_support_for_a_news_quote():
    from app.compat import signal_json
    card = archived_card(CAPEX)
    financial = copy.deepcopy(card["evidence"][0])
    financial.update(id=uid(), snapshot_id=uid(), source="sectors")
    card["evidence"].append(financial)
    sources = signal_json(card)["sources"]
    assert sources[0]["source"] == "sectors_news" and sources[0]["observationSupport"]
    assert sources[0]["url"] == ""
    assert sources[1]["url"].startswith("/financial-sources/")
    assert not sources[1]["observationSupport"]


def test_profile_background_is_not_a_recent_product_move():
    card = archived_card("About Us. EXCL is a telecommunications company serving Indonesia.", "About Us")
    card["evidence"][0]["source"] = "public"
    assert project_signal_card(card)["type"] == "Market context"
    assert classify("About Us. A company providing fixed line products.") is None


def seed_archived_news(watchlist):
    """Two legacy misclassified records plus their literal evidence, in test SQLite."""
    with session() as db, db.begin():
        wl = db.get(Watchlist, watchlist["id"])
        company = db.scalar(select(Company).where(Company.symbol == "EXCL"))
        own = {"id": company.id, **EXCL}
        run = Run(id=uid(), workspace_id=wl.workspace_id, watchlist_id=wl.id, mode="live", status="running",
                  query="Synthetic saved-news review", request_hash="synthetic-archive", stage="persist",
                  inputs={"companies": [own], "user_company": None, "compared_symbols": ["EXCL"]},
                  plan={"tools": [{"name": "get_company_news", "company_ids": [company.id],
                                   "reason": "Offline archived fixture; no requests executed"}]},
                  result=None, finished_at=utcnow())
        db.add(run)
        db.flush()
        cards = []
        for text in (CAPEX, ANALYST):
            card = archived_card(text)
            card["company"] = own
            card["run_id"] = run.id
            snapshot = Snapshot(id=card["evidence"][0]["snapshot_id"], company_id=company.id,
                mode="live", provider="sectors_news", request_key=uid(), content_hash=uid(),
                normalized={"events": [{"text": text, "title": text[:180], "subject": text[:180].lower(),
                                       "type": "Product", "published_at": card["published_at"]}]},
                raw_payload={"synthetic": True, "body": text}, url="https://api.sectors.app/v2/news/")
            signal = Signal(id=card["signal_id"], workspace_id=wl.workspace_id, company_id=company.id,
                            mode="live", event_key=uid(), type="Product")
            db.add_all([snapshot, signal])
            db.flush()
            db.add(RunSnapshot(run_id=run.id, snapshot_id=snapshot.id, outcome="fetched"))
            db.add(Revision(id=card["revision_id"], run_id=run.id, signal_id=signal.id,
                            content_hash=uid(), severity="high", card=card))
            cards.append(card)
        run.status = "completed"
        run.result = dict(schema_version=1, run_id=run.id, mode="live", status="completed", generated_at=iso(utcnow()),
                          summary="Two new product findings", coverage=[], warnings=[], signals=copy.deepcopy(cards),
                          comparison=None, financial_brief=None)
        return run.id, wl.workspace_id, cards


def test_workspace_index_repair_and_all_delivery_paths_preserve_history(client, watchlist, monkeypatch):
    run_id, workspace, originals = seed_archived_news(watchlist)
    with session() as db, db.begin():
        changes = reindex_categories(db, workspace)
        assert {c["new"] for c in changes} == {"Financial update", "Analyst commentary"}
    monkeypatch.setenv("MODE", "live")
    get_settings.cache_clear()
    for category in ("Financial update", "Analyst commentary"):
        feed = client.get("/findings", params={"period": "all", "category": category}).json()
        assert feed["summary"]["filtered"] == 1
        assert feed["items"][0]["type"] == category
        assert sum(x["count"] for x in feed["summary"]["mix"]) == 2
    assert client.get("/findings?period=all&category=Product").json()["summary"]["filtered"] == 0
    assert client.get("/api/v1/signals?severity=high&mode=live").json()["items"] == []
    assert len(client.get("/api/v1/signals?severity=low&mode=live").json()["items"]) == 2
    result = client.get("/api/v1/research-runs/" + run_id).json()
    assert result["status"] == "completed"
    assert {c["type"] for c in result["result"]["signals"]} == {"Financial update", "Analyst commentary"}
    assert "0 verified competitor-move" in result["result"]["summary"]
    for card in originals:
        detail = client.get("/api/v1/signals/" + card["signal_id"]).json()
        assert detail["signal"]["type"] != "Product"
        assert detail["revisions"][0]["type"] == "Product"
        compat = client.get("/signals/" + card["signal_id"]).json()
        assert compat["findingScope"] != "competitor_move"
    with session() as db:
        assert all(db.get(Revision, c["revision_id"]).card == c for c in originals)
        assert all(db.get(Snapshot, c["evidence"][0]["snapshot_id"]).raw_payload["body"] == c["observed_signals"][0]["text"] for c in originals)
        assert db.get(Run, run_id).external_calls == 0


def test_conversation_sync_preserves_old_embedded_run_but_delivers_corrected_view(client, watchlist):
    run_id, workspace, _ = seed_archived_news(watchlist)
    stamp = utcnow()
    original_run = {"id": run_id, "status": "complete", "resultSummary": "Original embedded report copy"}
    messages = [{"id": uid(), "role": "assistant", "kind": "research", "content": "Original saved reply",
                 "createdAt": iso(stamp).replace("+00:00", "Z"), "run": copy.deepcopy(original_run)}]
    conversation_id = uid()
    with session() as db, db.begin():
        db.add(Conversation(id=conversation_id, workspace_id=workspace, title="Saved archive", messages=messages,
                            created_at=stamp, updated_at=stamp))
    delivered = next(c for c in client.get("/api/v1/conversations").json() if c["id"] == conversation_id)
    assert delivered["messages"][0]["run"] != original_run
    response = client.post("/api/v1/conversations", json=delivered)
    assert response.status_code == 200
    assert {s["type"] for s in response.json()["messages"][0]["run"]["findings"]} == {"Financial update", "Analyst commentary"}
    with session() as db:
        assert db.get(Conversation, conversation_id).messages == messages


def test_new_context_cards_have_no_competitive_severity_or_fabricated_metrics(client, watchlist):
    run_id, _, _ = seed_archived_news(watchlist)
    candidates = candidates_for(run_id, [])
    assert {c["observations"][0][0]["type"] for c in candidates} == {"Financial update", "Analyst commentary"}
    with session() as db:
        run = db.get(Run, run_id)
        snapshots = {s.id: s for s in db.scalars(select(Snapshot))}
        for candidate in candidates:
            matched = find_context_signal(db, run, candidate)
            assert matched is not None
            prepared = prepared_candidate(candidate)
            interpretation = fallback_interpretation(prepared, analysis_context(run))
            signal = db.get(Signal, next(c["signal_id"] for c in [r.card for r in db.scalars(select(Revision))]
                                         if c["observed_signals"][0]["text"].startswith(candidate["observations"][0][0]["text"])))
            card, _ = build_card(run, candidate, interpretation, signal, None)
            assert card["finding_scope"] != "competitor_move" and card["severity"] == "low"
            assert card["score_components"]["total"] == 0
            assert card["financial_context"] == [] and card["decision_support"]["potential_implication"] is None
            validate_card(card, snapshots)
