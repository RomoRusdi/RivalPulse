"""Idempotent catalog/source seed. No real financial values are included."""
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import get_settings
from app.db import session
from app.models import Company, CreditAccount, Membership, Source, Watchlist

# The identity reference names the company; the source is where announcements are
# published. They are not the same page: a corporate profile carries no events,
# so seeding it as the only source guarantees empty investigations.
CATALOG = [
    ("TLKM", "PT Telkom Indonesia (Persero) Tbk", ["Telkom Indonesia"], "www.telkom.co.id",
     "https://www.telkom.co.id/sites/about-us/en_US/page/profile-and-brief-history-24",
     [("https://www.telkom.co.id/sites/berita/id_ID/page/news-about-telkom-122", "main"),
      ("https://www.telkom.co.id/sites/about-us/en_US/page/profile-and-brief-history-24", "main")]),
    ("ISAT", "PT Indosat Tbk", ["Indosat Ooredoo Hutchison"], "ioh.co.id",
     "https://ioh.co.id/portal/ID/iohaboutus",
     [("https://ioh.co.id/portal/ID/iohaboutus", "main")]),
    ("EXCL", "PT XLSMART Telecom Sejahtera Tbk", ["XLSMART", "XL Axiata"], "www.xlsmart.co.id",
     "https://www.xlsmart.co.id/",
     # XLSMART's pages have no <main> element; "main" silently yields no coverage.
     [("https://www.xlsmart.co.id/id/tentang-xlsmart/berita", "body"),
      ("https://www.xlsmart.co.id/", "body")]),
]

# The rest of the IDX catalogue the frontend already offers. Sectors covers any
# listed ticker, so these need no per-company scraping configuration.
#
# They are seeded with no approved domains on purpose: a domain here is an SSRF
# allowlist entry, not a label, and pre-approving one that has not been verified
# would widen what the fetcher may reach. Adding a page source for any of these
# stays an explicit admin step via `python -m app.sources`.
CATALOG_ONLY = [
    ("FREN", "Smartfren Telecom", "Telecommunication"),
    ("TOWR", "Sarana Menara Nusantara", "Telecommunication"),
    ("TBIG", "Tower Bersama Infrastructure", "Telecommunication"),
    ("BBCA", "Bank Central Asia", "Banking"),
    ("BBRI", "Bank Rakyat Indonesia", "Banking"),
    ("BMRI", "Bank Mandiri", "Banking"),
    ("BBNI", "Bank Negara Indonesia", "Banking"),
    ("ARTO", "Bank Jago", "Banking"),
    ("BRIS", "Bank Syariah Indonesia", "Banking"),
    ("GOTO", "GoTo Gojek Tokopedia", "Technology"),
    ("BUKA", "Bukalapak.com", "Technology"),
    ("EMTK", "Elang Mahkota Teknologi", "Technology"),
    ("MTDL", "Metrodata Electronics", "Technology"),
    ("UNVR", "Unilever Indonesia", "Consumer goods"),
    ("ICBP", "Indofood CBP Sukses Makmur", "Consumer goods"),
    ("INDF", "Indofood Sukses Makmur", "Consumer goods"),
    ("MYOR", "Mayora Indah", "Consumer goods"),
    ("AMRT", "Sumber Alfaria Trijaya", "Retail"),
    ("ACES", "Aspirasi Hidup Indonesia", "Retail"),
    ("MAPI", "Mitra Adiperkasa", "Retail"),
    ("ERAA", "Erajaya Swasembada", "Retail"),
    ("KLBF", "Kalbe Farma", "Healthcare"),
    ("SIDO", "Industri Jamu dan Farmasi Sido Muncul", "Healthcare"),
    ("MIKA", "Mitra Keluarga Karyasehat", "Healthcare"),
    ("PGAS", "Perusahaan Gas Negara", "Energy"),
    ("PTBA", "Bukit Asam", "Energy"),
    ("MEDC", "Medco Energi Internasional", "Energy"),
    ("ANTM", "Aneka Tambang", "Basic materials"),
    ("INCO", "Vale Indonesia", "Basic materials"),
    ("SMGR", "Semen Indonesia", "Basic materials"),
    ("INTP", "Indocement Tunggal Prakarsa", "Basic materials"),
    ("JSMR", "Jasa Marga", "Infrastructure"),
    ("WIKA", "Wijaya Karya", "Infrastructure"),
]


def seed():
    with session() as db, db.begin():
        companies = []
        for symbol, name, aliases, domain, reference, sources in CATALOG:
            company = db.scalar(select(Company).where(Company.symbol == symbol))
            if not company:
                company = Company(symbol=symbol, name=name, industry="Telecommunications", aliases=aliases,
                                  official_domains=[domain], identity_reference=reference,
                                  identity_verified_at=datetime(2026, 9, 22, tzinfo=timezone.utc))
                if symbol == "EXCL":
                    company.comparison_note = "2025 merger changed scope; do not compare pre/post-merger growth."
                db.add(company)
                db.flush()
            companies.append(company)
            for url, selector in sources:
                source = db.scalar(select(Source).where(Source.url == url))
                if not source:
                    source = Source(company_id=company.id, url=url, domain=domain)
                    db.add(source)
                # Repair selectors on re-seed: an approved page that never matched
                # its selector produced silent gaps rather than a visible error.
                source.extraction = {"selector": selector, "event_type": "Product"}
        for symbol, name, industry in CATALOG_ONLY:
            if not db.scalar(select(Company).where(Company.symbol == symbol)):
                db.add(Company(
                    symbol=symbol, name=name, industry=industry, aliases=[], official_domains=[],
                    identity_reference="Catalogue entry; company identity not independently verified.",
                    comparison_note="Reporting scope must be verified before growth comparisons.",
                ))
        if not db.get(CreditAccount, "sectors"):
            db.add(CreditAccount(id="sectors", used=0))
        settings = get_settings()
        if not db.scalar(select(Watchlist).where(Watchlist.workspace_id == settings.workspace_id)):
            wl = Watchlist(workspace_id=settings.workspace_id, name="Indonesian telecoms",
                           objective="Monitor product, pricing and partnership developments")
            db.add(wl)
            db.flush()
            for company in companies:
                db.add(Membership(watchlist_id=wl.id, company_id=company.id))


if __name__ == "__main__":
    seed()
