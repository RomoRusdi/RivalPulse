"""Explicit, workspace-scoped browse-index repair. No provider or model calls.

Run inside the backend image:
  python scripts/reclassify_findings.py --workspace private-demo
  python scripts/reclassify_findings.py --workspace private-demo --apply --rename-default-watchlist
"""
import argparse
import json

from sqlalchemy import select

from app.db import session
from app.finding_projection import reindex_categories
from app.models import Watchlist


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rename-default-watchlist", action="store_true")
    args = parser.parse_args()
    with session() as db:
        changes = reindex_categories(db, args.workspace)
        renamed = []
        if args.rename_default_watchlist:
            for row in db.scalars(select(Watchlist).where(Watchlist.workspace_id == args.workspace,
                                                        Watchlist.name == "Indonesian telecoms")):
                renamed.append(row.id)
                row.name = "Competitors"
        if args.apply:
            db.commit()
        else:
            db.rollback()
        print(json.dumps({"applied": args.apply, "workspace": args.workspace, "category_changes": changes,
                          "renamed_default_watchlists": renamed, "provider_calls": 0}))


if __name__ == "__main__":
    main()
