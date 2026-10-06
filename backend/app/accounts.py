"""Local administrator bootstrap: give a NEW account access to a preserved workspace."""
import argparse
from getpass import getpass

from sqlalchemy import select

from app.auth import Register, hasher
from app.db import session
from app.models import User, Workspace, WorkspaceMembership


def bootstrap(email, name, workspace_id, password):
    body = Register(email=email, name=name, workspace_name="bootstrap", password=password)
    with session() as db, db.begin():
        workspace = db.get(Workspace, workspace_id)
        if not workspace:
            raise ValueError("Workspace does not exist. Run migration and seed first.")
        if db.scalar(select(User).where(User.email == str(body.email))):
            raise ValueError("Email already exists; bootstrap never changes an existing account.")
        user = User(email=str(body.email), name=body.name, password_hash=hasher.hash(body.password))
        db.add(user)
        db.flush()
        db.add(WorkspaceMembership(user_id=user.id, workspace_id=workspace.id, permission="owner"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--workspace", required=True)
    args = parser.parse_args()
    password = getpass("New password (15-128 characters): ")
    if password != getpass("Confirm password: "):
        parser.exit(1, "Passwords do not match.\n")
    try:
        bootstrap(args.email, args.name, args.workspace, password)
    except ValueError:
        parser.exit(1, "Account not created. Check email/name, password length, workspace, and existing accounts.\n")
    print("Account created. Log in through the website.")


if __name__ == "__main__":
    main()
