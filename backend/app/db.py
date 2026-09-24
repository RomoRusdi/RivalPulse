from datetime import datetime, timezone
from functools import lru_cache
from uuid import uuid4

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings


def utcnow():
    return datetime.now(timezone.utc)


def iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat() if value else None


def uid():
    return str(uuid4())


class Base(DeclarativeBase):
    pass


@lru_cache
def engine():
    url = get_settings().database_url
    result = create_engine(url, pool_pre_ping=True, **(
        {"connect_args": {"check_same_thread": False, "timeout": 30}} if url.startswith("sqlite") else {}
    ))
    if url.startswith("sqlite"):
        @event.listens_for(result, "connect")
        def sqlite_fk(conn, _):
            conn.execute("PRAGMA foreign_keys=ON")
    return result


def session():
    return sessionmaker(engine(), expire_on_commit=False)()


def get_db():
    with session() as db:
        yield db
