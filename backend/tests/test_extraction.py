"""Approved pages must yield announcements, not corporate boilerplate.

The failure this guards against: a company profile page was extracted as one
12,000-character "signal" titled "About Us", and shipped as a competitive finding.
"""
import pytest

from app.classify import classify
from app.errors import ProviderError
from app.public_sources import extract

SOURCE = {"kind": "html", "url": "https://example.test", "extraction": {"selector": "main"}}

PROFILE_PAGE = b"""<main>
<h1>About Us</h1>
<h2>Profile and Brief History</h2>
Telkom is a state-owned enterprise engaged in information and communication technology.
Through Government Regulation Number 240 of 1961 the Indonesian Government established
the State Post and Telecommunications Company. The majority owner is the government.
From fixed line products to its current transformation into a digital company.
<h2>Culture &amp; Values</h2>
Bravery: the courage to execute with conviction. Integrity: upholding the highest
standards of ethics, values, norms and applicable regulations by acting honestly.
</main>"""

NEWSROOM_PAGE = b"""<main>
<h2>NEWS</h2>
<a href="/a">24 September 2026 Siaran Pers TelkomGroup dan China Unicom Jalin Kemitraan Strategis untuk Ekosistem Digital</a>
<a href="/b">18 September 2026 Siaran Pers Telkom Luncurkan SCALE, Integrasikan AI dan Keamanan Siber</a>
<a href="/c">21 September 2026 Siaran Pers Peringati Hari Sungai, TelkomGroup Angkut 51 Ton Sampah dari Kali Krukut</a>
<a href="/d">Kebijakan Privasi</a>
</main>"""


def test_corporate_profile_page_yields_no_events():
    result = extract(PROFILE_PAGE, SOURCE, SOURCE["url"])
    assert result["events"] == []
    assert result["blocks_scanned"] >= 3, "the page must still be segmented, not skipped"


def test_newsroom_links_become_titled_dated_announcements():
    result = extract(NEWSROOM_PAGE, SOURCE, SOURCE["url"])
    titles = [e["title"] for e in result["events"]]

    assert len(result["events"]) == 2, f"expected two announcements, got {titles}"
    # Date and "Siaran Pers" label are stripped; the headline survives intact.
    assert any(t.startswith("TelkomGroup dan China Unicom") for t in titles)
    assert any(t.startswith("Telkom Luncurkan SCALE") for t in titles)
    assert {e["type"] for e in result["events"]} == {"Partnership", "Product"}
    # A river clean-up and a privacy link are not competitive events.
    assert not any("Sampah" in t or "Privasi" in t for t in titles)


def test_nav_labels_owning_a_long_body_are_not_announcements():
    """"NEWS" and "Media Kit" head containers whose body mentions partnerships."""
    page = b"""<main><h2>Media Kit</h2>
    Download our brand assets. For collaboration with our press team, contact us.
    </main>"""
    assert extract(page, SOURCE, SOURCE["url"])["events"] == []


def test_events_are_deduplicated_by_headline():
    page = b"""<main>
    <a href="/1">Telkom Luncurkan SCALE, Integrasikan AI dan Keamanan Siber</a>
    <a href="/2">Telkom Luncurkan SCALE, Integrasikan AI dan Keamanan Siber</a>
    </main>"""
    assert len(extract(page, SOURCE, SOURCE["url"])["events"]) == 1


def test_unmatched_selector_still_fails_loudly():
    with pytest.raises(ProviderError) as error:
        extract(b"<body>no main element here at all</body>", SOURCE, SOURCE["url"])
    assert error.value.code == "SOURCE_PARSE_FAILED"


@pytest.mark.parametrize("text,expected", [
    ("the total amount was large", None),                      # 'mou' must not match 'amount'
    ("We use cookies for advertising and analytics", None),    # cookie policies are not campaigns
    ("Telkom has 12 subsidiaries in various sectors", None),
    ("from fixed line products to its transformation", None),  # 'products' is not 'product update'
    ("XLSMART launches a new enterprise package", "Product"),
    ("Indosat signs a memorandum of understanding", "Partnership"),
    ("New tariff for prepaid customers", "Pricing"),
    ("Telkomsel partners with Google Cloud", "Partnership"),
    ("Peluncuran kampanye brand baru", "Campaign"),
])
def test_classification_is_word_anchored(text, expected):
    assert classify(text) == expected
