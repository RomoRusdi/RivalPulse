from alembic import context
from sqlalchemy import create_engine, pool

from app.config import get_settings
from app.db import Base
from app import models  # noqa: F401

config = context.config
url = get_settings().database_url


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "foreign_key_constraint" and name and name.startswith("fk_") and name.endswith("_workspace"):
        return not url.startswith("sqlite")
    return True


def run_migrations_offline():
    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = create_engine(url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        if connection.dialect.name == "sqlite":
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()
        context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True, include_object=include_object)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
