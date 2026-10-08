"""Workspace model selection and encrypted, versioned provider credentials."""
from alembic import op
import sqlalchemy as sa

revision = "20261008_workspace_llm"
down_revision = "20261006_account_quality"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("llm_configurations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("workspace_id", sa.String(80), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("cloud_consent", sa.Boolean(), nullable=False),
        sa.Column("encrypted_key", sa.Text(), nullable=True))
    op.create_index("ix_llm_configurations_created_at", "llm_configurations", ["created_at"])
    op.create_index("ix_llm_configurations_workspace_id", "llm_configurations", ["workspace_id"])
    op.create_table("workspace_llm",
        sa.Column("workspace_id", sa.String(80), sa.ForeignKey("workspaces.id"), primary_key=True),
        sa.Column("configuration_id", sa.String(36), sa.ForeignKey("llm_configurations.id"), nullable=False))


def downgrade():
    op.drop_table("workspace_llm")
    op.drop_table("llm_configurations")
