"""Retain local provider payloads so original JSON-pointer citations can be resolved."""
from alembic import op
import sqlalchemy as sa

revision = "20260922_provider_payload"
down_revision = "20260922_immutable_history"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("snapshots", sa.Column("raw_payload", sa.JSON(), nullable=True))
    op.create_index("ix_runs_watchlist_created", "research_runs", ["watchlist_id", "created_at"])
    op.create_index("ix_snapshots_source_fetched", "snapshots", ["source_id", "fetched_at"])


def downgrade():
    op.drop_index("ix_snapshots_source_fetched", table_name="snapshots")
    op.drop_index("ix_runs_watchlist_created", table_name="research_runs")
    op.drop_column("snapshots", "raw_payload")
