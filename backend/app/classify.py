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
