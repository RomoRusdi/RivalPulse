from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from app.db import engine


def test_clean_migration_roundtrip_and_metadata(env):
    config = Config("alembic.ini")
    command.check(config)
    command.downgrade(config, "base")
    assert "research_runs" not in inspect(engine()).get_table_names()
    command.upgrade(config, "head")
    with engine().connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "20260927_conversation_history"
