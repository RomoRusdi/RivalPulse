"""Protect evidence history and frozen investigation inputs at the database boundary."""
from alembic import op

revision = "20260922_immutable_history"
down_revision = "5484f418611b"
branch_labels = None
depends_on = None

TABLES = ("snapshots", "signal_revisions", "evidence")


def upgrade():
    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.execute("""CREATE FUNCTION rivalpulse_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'immutable research history'; END; $$""")
        for table in TABLES:
            op.execute(f"CREATE TRIGGER immutable_{table} BEFORE UPDATE OR DELETE ON {table} "
                       "FOR EACH ROW EXECUTE FUNCTION rivalpulse_immutable()")
        op.execute("""CREATE FUNCTION rivalpulse_frozen_run() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.inputs::text IS DISTINCT FROM OLD.inputs::text OR NEW.query IS DISTINCT FROM OLD.query
             OR NEW.mode IS DISTINCT FROM OLD.mode OR NEW.watchlist_id IS DISTINCT FROM OLD.watchlist_id
             OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
             RAISE EXCEPTION 'immutable run inputs';
          END IF;
          IF OLD.status IN ('completed', 'partial', 'failed') AND
             (NEW.result::text IS DISTINCT FROM OLD.result::text OR NEW.status IS DISTINCT FROM OLD.status) THEN
             RAISE EXCEPTION 'immutable terminal run';
          END IF;
          RETURN NEW;
        END; $$""")
        op.execute("CREATE TRIGGER frozen_run BEFORE UPDATE ON research_runs FOR EACH ROW EXECUTE FUNCTION rivalpulse_frozen_run()")
    elif dialect == "sqlite":
        for table in TABLES:
            for action in ("UPDATE", "DELETE"):
                op.execute(f"CREATE TRIGGER immutable_{table}_{action.lower()} BEFORE {action} ON {table} "
                           "BEGIN SELECT RAISE(ABORT, 'immutable research history'); END")
        op.execute("""CREATE TRIGGER frozen_run BEFORE UPDATE ON research_runs
        WHEN NEW.inputs IS NOT OLD.inputs OR NEW.query IS NOT OLD.query OR NEW.mode IS NOT OLD.mode
             OR NEW.watchlist_id IS NOT OLD.watchlist_id OR NEW.workspace_id IS NOT OLD.workspace_id
             OR (OLD.status IN ('completed','partial','failed') AND
                 (NEW.result IS NOT OLD.result OR NEW.status IS NOT OLD.status))
        BEGIN SELECT RAISE(ABORT, 'immutable run inputs or result'); END""")


def downgrade():
    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.execute("DROP TRIGGER frozen_run ON research_runs")
        op.execute("DROP FUNCTION rivalpulse_frozen_run()")
        for table in TABLES:
            op.execute(f"DROP TRIGGER immutable_{table} ON {table}")
        op.execute("DROP FUNCTION rivalpulse_immutable()")
    elif dialect == "sqlite":
        op.execute("DROP TRIGGER frozen_run")
        for table in TABLES:
            for action in ("update", "delete"):
                op.execute(f"DROP TRIGGER immutable_{table}_{action}")
