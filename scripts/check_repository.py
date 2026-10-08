"""Offline release hygiene: local Markdown links, publishable files, obvious secrets.

Checks the current tracked/untracked, non-ignored working tree. Does not stage
files, read ignored credentials, import the app, or contact providers.
This is a lightweight guard, not a substitute for a dedicated secret scanner.
"""
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
LINK = re.compile(r"!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)")
SECRET = re.compile(
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"
    r"|\bsk-(?:proj-|ant-api)[A-Za-z0-9_-]{20,}"
    r"|\bAIza[A-Za-z0-9_-]{35}\b"
    r"|\bgh[pousr]_[A-Za-z0-9]{30,}\b"
)
GENERATED = {"node_modules", ".next", ".venv", "__pycache__", ".pytest_cache", ".ruff_cache"}


def candidates():
    output = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT
    )
    return sorted({Path(name.decode("utf-8")) for name in output.split(b"\0") if name})


def check():
    failures = []
    for relative in candidates():
        path = ROOT / relative
        # Deleted tracked files remain listed until the operator stages them.
        if not path.is_file():
            continue
        name = path.name.lower()
        if (name.startswith(".env") and name != ".env.example") or name in {
            "credentials.json", "secrets.json", "secrets.yaml", "secrets.yml"
        } or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx", ".sqlite3", ".db"}:
            failures.append(f"Private file must not be published: {relative.as_posix()}")
            continue
        if GENERATED.intersection(relative.parts) or name.endswith((".log", ".tsbuildinfo")):
            failures.append(f"Generated artifact must not be published: {relative.as_posix()}")
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if SECRET.search(content):
            # Report filenames only, never the matching value.
            failures.append(f"Possible credential needs review: {relative.as_posix()}")
        if path.suffix.lower() != ".md":
            continue
        for target in LINK.findall(content):
            parsed = urlsplit(target.strip("<>"))
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            destination = path.parent / unquote(parsed.path)
            if not destination.exists():
                failures.append(f"Broken local link in {relative.as_posix()}: {parsed.path}")
    return failures


def main():
    failures = check()
    if failures:
        print("Repository checks failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Repository checks passed: local documentation links, file hygiene, obvious secret patterns.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
