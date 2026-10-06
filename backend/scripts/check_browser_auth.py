"""Check a browser gateway's signed-out behavior without credentials or provider calls."""

import argparse
import sys
from urllib.parse import urlsplit

import httpx


def check(base_url: str) -> list[str]:
    parts = urlsplit(base_url)
    if (parts.scheme not in ("http", "https") or not parts.hostname or parts.username
            or parts.password or parts.query or parts.fragment or parts.path not in ("", "/")):
        raise ValueError("Use the website origin, such as https://rivalpulse.example.com")
    failures = []
    # A fresh client has no account cookies, tab proof, or Authorization header.
    with httpx.Client(base_url=base_url.rstrip("/"), timeout=15, follow_redirects=False) as client:
        for path in ("/login", "/backend/api/v1/auth/me", "/backend/dashboard"):
            response = client.get(path)
            expected = 200 if path == "/login" else 401
            issues = []
            if response.status_code != expected:
                issues.append(f"expected HTTP {expected}, got {response.status_code}")
            if "www-authenticate" in response.headers:
                issues.append("unexpected HTTP authentication challenge")
            if path == "/login":
                if not response.headers.get("content-type", "").startswith("text/html"):
                    issues.append("login page is not HTML")
            else:
                try:
                    body = response.json()
                except ValueError:
                    body = None
                if not isinstance(body, dict) or body.get("code") != "UNAUTHORIZED":
                    issues.append("expected the account login-required JSON response")
                if response.headers.get("cache-control") != "no-store":
                    issues.append("authentication response must not be cached")
            if issues:
                failures.append(path + ": " + "; ".join(issues))
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8080", help="Website origin, including port if needed")
    args = parser.parse_args()
    try:
        failures = check(args.base_url)
    except (ValueError, httpx.HTTPError):
        # Do not print remote bodies, cookies, credentials, or raw exceptions.
        print("FAIL: Website unreachable or origin invalid. Check the URL, TLS, and running services.")
        return 1
    if failures:
        for failure in failures:
            print("FAIL:", failure)
        return 1
    print("PASS: App login is public; protected requests remain HTTP 401 JSON without a browser auth challenge.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
