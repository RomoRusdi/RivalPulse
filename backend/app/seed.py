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
