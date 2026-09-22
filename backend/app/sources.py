"""Server-only approved-source configuration, never exposed as a browser tool."""
import argparse
import json
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, TypeAdapter
from sqlalchemy import select

from app.contracts import Strict
from app.db import session
from app.models import Company, Source


class SourceConfig(Strict):
    symbol: str = Field(pattern=r"^[A-Z]{4}$")
    url: str = Field(max_length=2000)
    kind: Literal["html", "rss", "atom"] = "html"
    selector: str = Field("main", min_length=1, max_length=200)
    event_type: Literal["Pricing", "Product", "Partnership", "Campaign"] = "Product"
    enabled: bool = True


def configure(path):
    configs = TypeAdapter(list[SourceConfig]).validate_python(json.loads(Path(path).read_text(encoding="utf-8")))
    with session() as db, db.begin():
        for config in configs:
            company = db.scalar(select(Company).where(Company.symbol == config.symbol))
            parsed = urlsplit(config.url)
            if (not company or parsed.scheme != "https" or parsed.hostname not in company.official_domains
                    or parsed.username or parsed.password or parsed.port not in (None, 443)):
                raise ValueError("Source must use an approved company HTTPS domain")
            source = db.scalar(select(Source).where(Source.url == config.url))
            if source and source.company_id != company.id:
                raise ValueError("Source is already assigned to another company")
            if not source:
                source = Source(company_id=company.id, url=config.url, domain=parsed.hostname)
                db.add(source)
            source.kind, source.enabled = config.kind, config.enabled
            source.extraction = {"selector": config.selector, "event_type": config.event_type}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    configure(parser.parse_args().path)
