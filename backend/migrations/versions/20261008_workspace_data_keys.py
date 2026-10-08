"""Per-workspace Sectors API keys, encrypted; the server key stays the default."""
from alembic import op
import sqlalchemy as sa

revision = "20261008_workspace_data_keys"
down_revision = "20261008_workspace_llm"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("workspace_data_keys",
        sa.Column("workspace_id", sa.String(80), sa.ForeignKey("workspaces.id"), primary_key=True),
        sa.Column("provider", sa.String(20), primary_key=True),
        sa.Column("encrypted_key", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("workspace_data_keys")
