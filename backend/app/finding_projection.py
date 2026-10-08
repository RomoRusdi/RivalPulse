"""Correct category/attribution at delivery without rewriting paid research evidence."""
import copy

from app.classify import (COMPETITIVE_CATEGORIES, classification_note, classify,
                          company_event, finding_scope, signal_title, normalized_text)

CLASSIFICATION_VERSION = 1


def project_signal_card(card):
    view = copy.deepcopy(card)
    if view.get("classification_version", 0) >= CLASSIFICATION_VERSION:
        return view
    if view.get("mode") == "replay":
        # Explicit synthetic scenarios need not contain real company aliases.
        view.update(classification_version=CLASSIFICATION_VERSION,
                    finding_scope=finding_scope(view["type"]), classification_note=classification_note(view["type"]))
        return view
    references = {e["id"]: e for e in view.get("evidence", [])}
    categories, narrowed = [], False
    review = False
    for observation in view.get("observed_signals", []):
        news = any(references.get(eid, {}).get("source") == "sectors_news" for eid in observation["evidence_ids"])
        if news:
            # Generated finding titles are not source quotations. Only permit
            # headline fallback when that wording exists in the saved evidence.
            literal_title = view["title"]
            if normalized_text(literal_title) not in normalized_text(observation["text"]):
                literal_title = ""
            event = company_event({"text": observation["text"], "body": observation["text"],
                                   "title": literal_title}, view["company"])
            if event:
                categories.append(event["type"])
                narrowed |= event["text"] != observation["text"]
                observation["text"] = event["text"]
            else:
                categories.append("Market context")
                review = True
        else:
            # Archived profile pages never become launches just because their
            # stored legacy category said Product.
            categories.append(classify(observation["text"]) or "Market context")
    category = categories[0] if categories and len(set(categories)) == 1 else "Market context"
    changed = category != view["type"] or narrowed
    view.update(classification_version=CLASSIFICATION_VERSION, type=category,
                finding_scope=finding_scope(category), classification_note=classification_note(category),
                attribution_review=review)
    if changed:
        view["original_type"] = card["type"]
        view["classification_revised"] = True
        note = view["classification_note"]
        if narrowed:
            note += " The displayed excerpt is narrowed to this company; other companies' clauses are not attributed to it."
        note += " The original interpretation is withheld because its category or attributed excerpt changed. Original research remains stored."
        view["classification_note"] = note.strip()
        # Old prose was written against a different scope. Do not bless it as
        # personalised reasoning after changing its supporting observation.
        view["decision_support"] = None
        view["hypotheses"] = []
        view["why_marketing_should_care"] = {
            "text": view["classification_note"], "uncertainty": "high",
            "supporting_claim_ids": [o["claim_id"] for o in view.get("observed_signals", [])],
        }
    if category not in COMPETITIVE_CATEGORIES:
        view["severity"] = "low"
        view["score_components"] = {**view.get("score_components", {}), "materiality": 0, "relevance": 0,
                                    "novelty": 0, "total": 0, "rubric_version": 2}
        view["severity_reason"] = "Context-only coverage; no verified competitor move or competitive impact is established."
    first = next(iter(view.get("observed_signals", [])), {}).get("text", "")
    view["title"] = signal_title({"title": view["title"], "text": first, "type": category},
                                 view["company"], attributed=not review)
    return view


def find_context_signal(db, run, candidate):
    """A corrected category is not a second copy of the same contextual article."""
    category = candidate["observations"][0][0]["type"]
    if category in COMPETITIVE_CATEGORIES or run.mode == "replay":
        return None
    from sqlalchemy import select
    from app.models import Revision, Signal

    excerpt = candidate["observations"][0][0]["text"]
    published = candidate["observations"][0][0].get("published_at")
    for signal in db.scalars(select(Signal).where(Signal.workspace_id == run.workspace_id,
                                                  Signal.mode == run.mode,
                                                  Signal.company_id == candidate["company"]["id"])
                             .order_by(Signal.first_seen_at.desc()).limit(200)):
        revision = db.scalar(select(Revision).where(Revision.signal_id == signal.id)
                             .order_by(Revision.created_at.desc(), Revision.id.desc()).limit(1))
        if not revision:
            continue
        view = project_signal_card(revision.card)
        if view["type"] == category and view.get("published_at") == published and any(
                claim["text"] == excerpt for claim in view.get("observed_signals", [])):
            return signal
    return None


def reindex_categories(db, workspace_id):
    """Explicit administrative index repair; revisions/snapshots/results stay immutable.

    Signal.type is the mutable browse index used by SQL filters/counts. This is
    never invoked on GET and never calls a provider.
    """
    from sqlalchemy import select
    from app.models import Revision, Signal

    changed = []
    for signal in db.scalars(select(Signal).where(Signal.workspace_id == workspace_id, Signal.mode == "live")):
        revision = db.scalar(select(Revision).where(Revision.signal_id == signal.id)
                             .order_by(Revision.created_at.desc(), Revision.id.desc()).limit(1))
        if not revision:
            continue
        category = project_signal_card(revision.card)["type"]
        if signal.type != category:
            changed.append({"signal_id": signal.id, "old": signal.type, "new": category})
            signal.type = category
    return changed
