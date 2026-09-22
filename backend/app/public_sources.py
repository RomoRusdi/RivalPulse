import ipaddress
import json
import re
import socket
import unicodedata
from importlib.resources import files
from urllib.parse import urljoin, urlsplit

import httpx
from bs4 import BeautifulSoup
from defusedxml import ElementTree
from sqlalchemy import select, update

from app.config import get_settings
from app.db import session
from app.errors import ProviderError
from app.models import Run, RunSnapshot, Snapshot
from app.providers import digest, ensure_active


def normalized_text(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip()


def destination(url, allowed_domains):
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443)
            or parsed.hostname not in allowed_domains):
        raise ProviderError("SOURCE_BLOCKED", "Destination is not an approved HTTPS source", False)
    try:
        addresses = {row[4][0] for row in socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)}
    except OSError:
        raise ProviderError("SOURCE_UNAVAILABLE", "Source DNS lookup failed") from None
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ProviderError("SOURCE_BLOCKED", "Non-public destination rejected", False)
    # Pin the validated address to the connection to prevent DNS rebinding; preserve TLS SNI and Host.
    address = sorted(addresses)[0]
    authority = f"[{address}]" if ":" in address else address
    pinned = parsed._replace(netloc=authority).geturl()
    return parsed.hostname, pinned


def safe_fetch(url, allowed_domains):
    settings = get_settings()
    with httpx.Client(timeout=settings.provider_timeout, trust_env=False, follow_redirects=False) as client:
        for _ in range(4):
            host, pinned = destination(url, allowed_domains)
            with client.stream("GET", pinned, headers={"Host": host, "User-Agent": "RivalPulse/0.1"},
                               extensions={"sni_hostname": host}) as response:
                if response.is_redirect:
                    url = urljoin(url, response.headers.get("location", ""))
                    continue
                if response.status_code != 200:
                    raise ProviderError("SOURCE_UNAVAILABLE", "Approved source could not be fetched")
                content_type = response.headers.get("content-type", "").lower()
                if not any(t in content_type for t in ("text/html", "xml", "rss", "atom")):
                    raise ProviderError("SOURCE_FORMAT_UNSUPPORTED", "Expected HTML or XML feed", False)
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > 500_000:
                        raise ProviderError("RESPONSE_TOO_LARGE", "Public source exceeded size limit", False)
                return bytes(body), url
    raise ProviderError("SOURCE_REDIRECT_LIMIT", "Too many source redirects", False)


def extract(body, source, final_url):
    events = []
    if source["kind"] in ("rss", "atom"):
        try:
            root = ElementTree.fromstring(body)
        except Exception:
            raise ProviderError("SOURCE_PARSE_FAILED", "Invalid or unsafe XML feed", False) from None
        for node in list(root.findall(".//item"))[:20]:
            title = normalized_text(node.findtext("title", ""))
            content = BeautifulSoup(node.findtext("description", ""), "html.parser").get_text(" ")
            if title and content:
                events.append(dict(subject=title.casefold(), title=title, text=normalized_text(content)[:4000],
                                   published_at=node.findtext("pubDate"), url=node.findtext("link") or final_url,
                                   type=source["extraction"].get("event_type", "Product")))
        for node in list(root.findall("{http://www.w3.org/2005/Atom}entry"))[:20]:
            ns = "{http://www.w3.org/2005/Atom}"
            title = normalized_text(node.findtext(ns + "title", ""))
            content = node.findtext(ns + "summary") or node.findtext(ns + "content", "")
            link = node.find(ns + "link")
            if title and content:
                events.append(dict(subject=title.casefold(), title=title,
                                   text=normalized_text(BeautifulSoup(content, "html.parser").get_text(" "))[:4000],
                                   published_at=node.findtext(ns + "published"),
                                   url=link.get("href", final_url) if link is not None else final_url,
                                   type=source["extraction"].get("event_type", "Product")))
    else:
        soup = BeautifulSoup(body, "html.parser")
        for node in soup.select("script,style,nav,footer,header,aside,noscript,[role=banner],.cookie-banner,.cookie-consent"):
            node.decompose()
        selector = source["extraction"].get("selector", "main")
        root = soup.select_one(selector)
        if root is None:
            raise ProviderError("SOURCE_PARSE_FAILED", "Approved content selector did not match", False)
        content = normalized_text(root.get_text(" "))
        if len(content) < 30:
            raise ProviderError("SOURCE_EMPTY", "Source contains insufficient substantive text", False)
        title_node = root.find(["h1", "h2"])
        title = normalized_text(title_node.get_text(" ")) if title_node else "Official page observation"
        time_node = root.find("time")
        events.append(dict(subject=source["url"], title=title[:300], text=content[:12000],
                           published_at=time_node.get("datetime") if time_node else None, url=final_url,
                           type=source["extraction"].get("event_type", "Product")))
    if not events:
        raise ProviderError("SOURCE_EMPTY", "No usable public events were extracted", False)
    return {"schema_version": 1, "events": events}


def collect_public(run_id, token, company, source):
    settings = get_settings()
    with session() as db:
        run = ensure_active(db, run_id, token)
        mode, scenario = run.mode, run.inputs["replay_scenario"]
        key = digest({"mode": mode, "source": source, "parser": 1})
        prior = db.scalar(select(Snapshot).join(RunSnapshot, RunSnapshot.snapshot_id == Snapshot.id).where(
            RunSnapshot.run_id == run_id, Snapshot.request_key == key))
        if prior:
            return prior, "resumed"
    if mode == "replay":
        fixture = json.loads(files("app").joinpath("fixtures/replay.json").read_text(encoding="utf-8"))
        events = [e for e in fixture["events"] if e["symbol"] == company["symbol"]]
        for event in events:
            event["url"] = "https://replay.invalid/" + company["symbol"]
            if scenario == "changed" and company["symbol"] == "ISAT":
                event["text"] = event["text"].replace("100 XTS", "110 XTS")
            if scenario == "conflict" and company["symbol"] == "ISAT":
                event["text"] += " Conflicting source text: a second excerpt says 90 XTS; price is unverified."
        normalized = {"schema_version": 1, "events": events}
    else:
        with session() as db, db.begin():
            ensure_active(db, run_id, token)
            claimed = db.execute(update(Run).where(
                Run.id == run_id, Run.lease_token == token, Run.external_calls < settings.max_tool_calls,
            ).values(external_calls=Run.external_calls + 1))
            if not claimed.rowcount:
                raise ProviderError("TOOL_BUDGET_EXCEEDED", "External request budget exhausted", False)
        try:
            body, url = safe_fetch(source["url"], company["official_domains"])
            normalized = extract(body, source, url)
        except httpx.HTTPError:
            raise ProviderError("SOURCE_UNAVAILABLE", "Approved source request failed") from None
    snapshot = Snapshot(company_id=company["id"], source_id=source["id"], mode=mode, provider="public",
                        request_key=key, content_hash=digest(normalized), normalized=normalized, url=source["url"])
    with session() as db, db.begin():
        ensure_active(db, run_id, token)
        db.add(snapshot)
        db.flush()
        db.add(RunSnapshot(run_id=run_id, snapshot_id=snapshot.id, outcome="fetched"))
    return snapshot, "fetched"
