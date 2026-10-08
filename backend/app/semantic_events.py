"""AI-led event attribution over saved evidence. No provider requests or numeric calculations.

Regex is not the classifier: the model selects category, speaker role and literal
spans. Backend checks the span, source association and conflicting named actors.
Unclassified articles remain disclosed coverage gaps, never guessed findings.
"""
import re
from datetime import datetime, timezone

from pydantic import Field
from sqlalchemy import select

from app.classify import COMPETITIVE_CATEGORIES, finding_scope, normalized_text
from app.contracts import Strict
from app.models import Company, RunSnapshot, Snapshot
from app.providers import digest

MAX_REVIEWED = 6
BATCH_SIZE = 3


class EventAttribution(Strict):
    article_id: str
    category: str = Field(pattern=r"^(Pricing|Product|Partnership|Campaign|Financial update|Analyst commentary|Market context)$")
    role: str = Field(pattern=r"^(company_announcement|third_party_commentary|company_mention|unverified|irrelevant)$")
    actor_quote: str = Field(max_length=160)
    observation_quote: str = Field(max_length=900)
    rationale: str = Field(min_length=15, max_length=350)


class EventAttributions(Strict):
    items: list[EventAttribution] = Field(max_length=BATCH_SIZE)


def named(text, company):
    """A negative/association guard, not event-category keyword matching."""
    aliases = [company.get("symbol", ""), company.get("name", ""), *company.get("aliases", [])]
    return any(alias and re.search(rf"(?<!\w){re.escape(normalized_text(alias))}(?!\w)", text, re.I)
               for alias in aliases)


def symbols(article):
    return {s.upper().split('.')[0] for s in article.get("symbols", []) if isinstance(s, str)}


def validate_attribution(row, article, catalogue):
    text = article["text"]
    if row.role == "irrelevant":
        return
    if not row.observation_quote.strip() or row.observation_quote not in text:
        raise ValueError("observation_quote must be an exact contiguous span of this source text")
    own = article["company"]
    associated = named(row.observation_quote, own) or symbols(article) == {own["symbol"]}
    if row.role not in ("unverified", "irrelevant") and not associated and article["source_kind"] != "public":
        raise ValueError("This quotation is not associated with the scoped company; use unverified rather than borrowing another company's news")
    if row.role == "company_announcement":
        if row.category not in (*COMPETITIVE_CATEGORIES, "Financial update"):
            raise ValueError("Company announcements require an action or financial category")
        if not row.actor_quote.strip() or row.actor_quote not in row.observation_quote:
            raise ValueError("actor_quote must be a literal actor within the observation span")
        foreign = [c for c in catalogue if c["symbol"] != own["symbol"] and named(row.actor_quote, c)]
        if foreign and not named(row.actor_quote, own):
            raise ValueError("The quoted actor is a different company; do not attribute its action to this company")
        association = named(row.actor_quote, own) or article["source_kind"] == "public" or symbols(article) == {own["symbol"]}
        if not association:
            raise ValueError("Company attribution is ambiguous; use company_mention or unverified, not a company action")
        if row.category == "Financial update" and any(named(row.observation_quote, c) for c in catalogue if c["symbol"] != own["symbol"]):
            raise ValueError("Narrow financial observations to this company's clause; other companies' figures must be excluded")
    elif row.role == "third_party_commentary" and row.category not in ("Analyst commentary", "Market context"):
        raise ValueError("Third-party forecasts/opinions are commentary, not company announcements")
    elif row.role in ("company_mention", "unverified") and row.category != "Market context":
        raise ValueError("A mention or uncertain attribution must remain Market context")


def articles_for(db, run):
    companies = {c["id"]: c for c in run.inputs["companies"]}
    groups = {key: [] for key in companies}
    seen = set()
    links = db.execute(select(Snapshot, RunSnapshot.outcome).join(RunSnapshot).where(RunSnapshot.run_id == run.id)).all()
    for snapshot, outcome in links:
        if snapshot.provider not in ("sectors_news", "public") or snapshot.company_id not in companies:
            continue
        if snapshot.provider == "sectors_news":
            articles = snapshot.normalized.get("articles")
            if articles is None:
                articles = snapshot.normalized.get("events", [])
        else:
            articles = snapshot.normalized.get("articles", snapshot.normalized.get("events", []))
            if not articles and snapshot.normalized.get("text"):
                articles = [{"text": snapshot.normalized["text"], "title": "Saved approved company page", "published_at": snapshot.published_at}]
        for raw in articles:
            text = normalized_text(raw.get("text") or raw.get("body"))[:4000]
            if not text:
                continue
            key = digest([snapshot.company_id, text, raw.get("published_at")])
            if key in seen:
                continue
            seen.add(key)
            groups[snapshot.company_id].append({"article_id": key, "company": companies[snapshot.company_id],
                "text": text, "title": str(raw.get("title", ""))[:250], "published_at": raw.get("published_at"),
                "symbols": raw.get("symbols") or [], "source_kind": "public" if snapshot.provider == "public" else "news",
                "snapshot": snapshot, "outcome": outcome})
    question = asked_question(run)
    days = window_days(question)
    asked = news_scope(run, question)
    catalogue = [{"symbol": c["symbol"], "name": c.get("name", ""), "aliases": c.get("aliases") or []} for c in run.inputs["companies"]]
    topics = [words for pattern, words in TOPIC_HINTS if pattern.search(question)]
    now = (run.created_at or datetime.now(timezone.utc)).replace(tzinfo=timezone.utc).timestamp()
    outside_window = 0
    ranked = {}
    for company_id, group in groups.items():
        if company_id not in asked:
            continue
        kept = []
        for article in group:
            published = time_key(article)
            if days and published and published < now - days * 86400:
                outside_window += 1
                continue
            kept.append((relevance(article, catalogue, topics), published, article))
        kept.sort(key=lambda item: (item[0], item[1]), reverse=True)
        ranked[company_id] = [article for _, _, article in kept]
    # Fair, bounded coverage: each asked company's most relevant article before
    # anyone's second. Unselected articles are counted, never published.
    selected = []
    for index in range(MAX_REVIEWED):
        for group in ranked.values():
            if index < len(group) and len(selected) < MAX_REVIEWED:
                selected.append(group[index])
        if len(selected) >= MAX_REVIEWED:
            break
    considered = sum(len(group) for group in ranked.values())
    return selected, {"available_articles": len(seen), "selected_articles": len(selected),
                      "not_reviewed": considered - len(selected), "outside_window": outside_window,
                      "window_days": days, "out_of_scope_articles": sum(len(g) for k, g in groups.items() if k not in asked),
                      "selection": "most relevant to the question per asked company, round-robin; bounded evidence review"}


def time_key(article):
    try:
        moment = datetime.fromisoformat(str(article["published_at"]).replace('Z', '+00:00'))
        return (moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)).timestamp()
    except (TypeError, ValueError, AttributeError, OverflowError, KeyError):
        return 0


# The frontend's perspective prefix is framing, not part of what was asked.
PERSPECTIVE_PREFIX = re.compile(r"^Our company is [^.]+\. Compare relative to our position\.\s*", re.I)


def asked_question(run):
    return PERSPECTIVE_PREFIX.sub("", run.query or "")


def window_days(question):
    """A time window in the question, in days; None when it names none."""
    match = re.search(r"\b(?:last|past|previous)\s+(\d{1,3})\s+(day|week|month)s?\b|\b(\d{1,3})\s+(hari|minggu|bulan)\s+terakhir\b", question, re.I)
    if match:
        count = int(match.group(1) or match.group(3))
        unit = (match.group(2) or match.group(4)).lower()
        return count * {"day": 1, "hari": 1, "week": 7, "minggu": 7, "month": 30, "bulan": 30}[unit]
    for pattern, days in ((r"\b(today|hari ini)\b", 2), (r"\b(this|last|past) week\b|\bminggu (ini|lalu)\b", 7),
                          (r"\b(this|last|past) month\b|\bbulan (ini|lalu)\b|\b(lately|recently|akhir-akhir ini|belakangan)\b", 30),
                          (r"\b(this|last|past) quarter\b|\bkuartal (ini|lalu)\b", 92)):
        if re.search(pattern, question, re.I):
            return days
    return None


def news_scope(run, question):
    """Companies whose news answers the question: the asked ones, never our own
    company unless the question names it. Perspective is framing, not a target."""
    companies = run.inputs["companies"]
    compared = set(run.inputs.get("compared_symbols") or [])
    ours = run.inputs.get("user_company")
    named_ours = bool(ours) and any(named(question, c) for c in companies if c["symbol"] == ours)
    chosen = {c["id"] for c in companies if (not compared or c["symbol"] in compared) and (c["symbol"] != ours or named_ours)}
    return chosen or {c["id"] for c in companies}


# Question topics steer which articles are read first; they never label them.
TOPIC_HINTS = [
    (re.compile(r"\b(ship\w*|launch\w*|releas\w*|product\w*|feature\w*|apps?|roll\w* ?out|introduc\w*|unveil\w*|luncur\w*|produk|fitur|aplikasi|rilis)\b", re.I),
     ("launch", "launches", "launched", "product", "products", "feature", "app", "application", "service", "rollout", "introduce", "unveil", "luncur", "produk", "fitur", "aplikasi", "layanan")),
    (re.compile(r"\b(pric\w*|promo\w*|discount\w*|tariff\w*|harga|diskon|tarif)\b", re.I),
     ("price", "pricing", "promo", "promotion", "discount", "tariff", "rate", "harga", "diskon", "tarif")),
    (re.compile(r"\b(partner\w*|deal\w*|collaborat\w*|acqui\w*|merger|kemitraan|kerja ?sama|akuisisi)\b", re.I),
     ("partner", "partnership", "agreement", "collaboration", "deal", "acquire", "acquisition", "merger", "mou", "kerja sama", "kemitraan", "akuisisi")),
    (re.compile(r"\b(campaign\w*|marketing|advert\w*|kampanye|iklan)\b", re.I),
     ("campaign", "marketing", "advertising", "brand", "sponsor", "kampanye", "iklan")),
]


def relevance(article, catalogue, topics):
    """Ordering only: an article about the asked company and topic beats a
    sector round-up that merely lists it. Classification still decides meaning."""
    company = article["company"]
    title, opening = article["title"], article["text"][:400]
    score = 3 if named(title, company) else 1 if named(opening, company) else 0
    others = sum(1 for c in catalogue if c["symbol"] != company["symbol"] and named(title, c))
    score -= 3 if others >= 2 else 1 if others == 1 else 0
    haystack = f"{title} {opening}".lower()
    if any(re.search(rf"\b{re.escape(word)}", haystack) for words in topics for word in words):
        score += 2
    return score


def classification_payload(article):
    return {key: article[key] for key in ("article_id", "title", "published_at", "symbols", "source_kind")} | {
        "text": article["text"][:1000], "source_text_truncated": len(article["text"]) > 1000,
        "company": {key: article["company"].get(key) for key in ("symbol", "name", "aliases")}}


def candidates_from_articles(db, run, articles, decisions):
    financials = {s.company_id: (s, outcome) for s, outcome in db.execute(
        select(Snapshot, RunSnapshot.outcome).join(RunSnapshot).where(RunSnapshot.run_id == run.id, Snapshot.provider == "sectors"))}
    result = []
    for article in articles:
        decision = decisions.get(article["article_id"])
        # Only articles the model actually classified become findings. An
        # unclassified article is counted as not reviewed instead of being
        # published as a pile of identical "market coverage" cards.
        if decision is None or decision.role == "irrelevant":
            continue
        category, quote = decision.category, decision.observation_quote
        event = {"type": category, "text": quote, "title": article["title"], "subject": digest([quote]),
                 "published_at": article["published_at"], "classification_origin": "ai",
                 "attribution_role": decision.role, "classification_rationale": decision.rationale}
        fin = financials.get(article["company"]["id"])
        metrics = fin[0].normalized.get("metrics", []) if fin else []
        # Financial context remains backend-owned; source figures are never interpreted as news figures.
        periods = next((t.get("requested_periods", []) for t in (run.plan or {}).get("tools", [])
                        if t["name"] == "get_company_metrics" and article["company"]["id"] in t["company_ids"]), [])
        if periods:
            metrics = [m for m in metrics if str(m.get("period")) in {str(p) for p in periods}]
        key = digest([article["company"]["id"], category, event["subject"], article["published_at"]])
        result.append({"event_key": key, "company": article["company"], "observations": [(event, article["snapshot"], article["outcome"])],
            "financial": fin, "metrics": metrics, "claims": [{"claim_id": "observation-0", "text": quote}],
            "change_status": "baseline", "content_hash": digest({"events": [quote], "financials": metrics})})
    return result


def catalogue_for(db):
    return [{"symbol": c.symbol, "name": c.name, "aliases": c.aliases or []} for c in db.scalars(select(Company))]


def title_for(event, company):
    if event["attribution_role"] == "third_party_commentary":
        headline = re.sub(r"\s+", " ", str(event.get("title") or "")).strip()
        return f"{company['symbol']} · Analyst view: {headline[:110]}" if headline else f"{company['symbol']} · third-party commentary"
    if finding_scope(event["type"]) == "unverified_context":
        # The article's own headline says what the coverage is about; a fixed
        # phrase made every context card look identical.
        headline = re.sub(r"\s+", " ", str(event.get("title") or "")).strip()
        return f"{company['symbol']} · {headline[:120]}" if headline else f"{company['symbol']} · market coverage; company action not established"
    return f"{company['symbol']} · {event['type']} · {event['text'][:110]}"
