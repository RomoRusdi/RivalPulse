"""Idempotent catalog/source seed. No real financial values are included."""
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import get_settings
from app.db import session
from app.models import Company, CreditAccount, Membership, Source, Watchlist

CATALOG = [
    ("TLKM", "PT Telkom Indonesia (Persero) Tbk", ["Telkom Indonesia"], "www.telkom.co.id",
     "https://www.telkom.co.id/sites/about-us/en_US/page/profile-and-brief-history-24"),
    ("ISAT", "PT Indosat Tbk", ["Indosat Ooredoo Hutchison"], "ioh.co.id",
     "https://ioh.co.id/portal/ID/iohaboutus"),
    ("EXCL", "PT XLSMART Telecom Sejahtera Tbk", ["XLSMART", "XL Axiata"], "www.xlsmart.co.id",
     "https://www.xlsmart.co.id/"),
]


def seed():
    with session() as db, db.begin():
        companies = []
        for symbol, name, aliases, domain, reference in CATALOG:
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
            if not db.scalar(select(Source).where(Source.company_id == company.id)):
                db.add(Source(company_id=company.id, url=reference, domain=domain,
                              extraction={"selector": "main", "event_type": "Product"}))
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
