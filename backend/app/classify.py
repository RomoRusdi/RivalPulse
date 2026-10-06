"""Shared competitive-event classification.

Kept separate from both providers and page extraction so structured provider news
and scraped approved pages are judged by exactly one rule set, and neither module
has to import the other.
"""
import re
import unicodedata

# Announcement language, not category nouns. "fixed line products" is corporate
# description; "product update" is an event. Matching the first is how a company
# profile page becomes a fake competitive signal.
#
# Every alternative is word-anchored. Bare substrings are unusable here: "mou"
# matches "amount", and "advertising" matches every cookie policy on the web.
SIGNAL_RULES = (
    ("Pricing", r"(?:pricing|price (?:increase|cut|change)|new tariff|tarif baru|"
                r"new (?:package|plan)|paket baru|discounts?|diskon|promo|bundling|kuota baru)"),
    ("Partnership", r"(?:partnerships?|kemitraan|partners with|collaborat\w+ with|kolaborasi|"
                    r"signed an agreement|memorandum of understanding|mou|joint venture|"
                    r"strategic alliance|teams up)"),
    ("Product", r"(?:launch\w*|luncur\w*|meluncurkan|unveil\w*|introduc(?:es|ing)|rolls? out|"
                r"rollout|now available|new service|layanan baru|product update|expands its|upgrade to)"),
    ("Campaign", r"(?:campaigns?|kampanye|sponsorships?|advertising campaign|brand activation)"),
)
MATCHERS = tuple((category, re.compile(rf"\b{pattern}\b", re.I)) for category, pattern in SIGNAL_RULES)


def signal_title(event, company, attributed=True):
    """A complete evidence-grounded event summary, never a fixed word/character slice.

    Short source headlines are retained. Long prose uses the verified event category
    and an explicit purpose clause when it fits; no business outcome is inferred.
    """
    symbol = normalized_text(company.get("symbol", ""))
    title = normalized_text(event.get("title", ""))
    text = normalized_text(event.get("text", "")) or title
    kind = event.get("type") or classify(text)
    if not attributed:
        return f"{symbol} · {kind or 'Company'} activity in cited coverage; attribution needs review"
    prefix = f"{symbol} · " if symbol and not re.match(rf"{re.escape(symbol)}\b", title, re.I) else ""
    # A complete sentence/clause boundary can shorten prose without leaving half a phrase.
    candidates = [title, *re.split(r"(?<=[.!?])\s+|\s+[—–]\s+", title)]
    incomplete = re.compile(r"(?:\b(?:and|or|with|for|to|of|the|a|in|dan|untuk|dengan)|[,:;…])$", re.I)
    for candidate in candidates:
        if candidate and len(prefix + candidate) <= 120 and not incomplete.search(candidate) and not candidate.endswith("...") and classify(candidate) == kind:
            return prefix + candidate.rstrip(".")
    actions = {"Pricing": "announces a pricing change", "Partnership": "announces a partnership",
               "Product": "announces a product or service update", "Campaign": "announces a campaign"}
    action = actions.get(kind, "reports a company announcement")
    if kind == "Pricing" and re.search(r"\bprice cut\b", text, re.I):
        action = "announces a price reduction"
    elif kind == "Product" and re.search(r"\b(?:launch\w*|meluncurkan|luncur\w*)\b", text, re.I):
        action = "announces a product or service launch"
    summary = f"{symbol} {action}".strip()
    purpose = re.search(r"\b(?:to|for|untuk|guna)\s+[^.!?;]+[.!?]?$", text, re.I)
    if purpose:
        clause = purpose.group().rstrip(".!?")
        if len(summary + " " + clause) <= 120 and not incomplete.search(clause):
            summary += " " + clause
    return summary


def normalized_text(value):
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip()


def classify(text):
    """Return the competitive category an announcement belongs to, or None."""
    for category, matcher in MATCHERS:
        if matcher.search(text):
            return category
    return None


def as_event(title, text, url, published_at):
    """Shape a classified announcement into the event record the comparison
    stage consumes, or None when it is not a competitive event."""
    combined = normalized_text(f"{title} {text}")
    category = classify(combined)
    if category is None or len(combined) < 40:
        return None
    headline = normalized_text(title) or combined[:120]
    return {"subject": headline.casefold(), "title": headline[:300], "text": combined[:4000],
            "published_at": published_at, "url": url, "type": category}


def company_event(event, company):
    """Classify the company's own announcement sentences, not an entire roundup.

    The excerpt remains a literal slice of stored evidence. Merely mentioning a
    ticker in market commentary cannot attribute another company's partnership.
    """
    name = normalized_text(company.get("name", ""))
    short_name = re.sub(r"\b(?:PT|Tbk|Persero)\b|[()]", "", name, flags=re.I)
    terms = [company.get("symbol", ""), short_name, *company.get("aliases", [])]
    words = normalized_text(short_name).split()
    if words and words[0].casefold() not in {"bank", "sarana", "tower", "perusahaan"}:
        terms.append(words[0])
    terms = [normalized_text(term) for term in terms if len(normalized_text(term)) >= 3]
    pattern = re.compile(r"(?<!\w)(?:" + "|".join(re.escape(term) for term in terms) + r")(?!\w)", re.I)
    text = normalized_text(event.get("text", ""))
    title = normalized_text(event.get("title", ""))
    body = text[len(title):].lstrip() if title and text.startswith(title) else text
    sentences = re.split(r"(?<=[.!?])\s+", body)
    relevant = [sentence for sentence in sentences if pattern.search(sentence) and classify(sentence)]
    if not relevant and pattern.match(title) and classify(title):
        relevant = [title]
    if not relevant:
        return None
    excerpt = relevant[0]
    kind = classify(excerpt)
    if not pattern.search(title) or classify(title) != kind:
        title = excerpt[:180]
    return {**event, "text": excerpt, "title": title, "subject": title.casefold(), "type": kind}
