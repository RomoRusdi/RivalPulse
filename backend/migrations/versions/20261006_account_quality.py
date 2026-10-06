"""Verification, temporary session binding and workspace research allowances."""
from alembic import op
import sqlalchemy as sa

revision = "20261006_account_quality"
down_revision = "20260928_integrated_backend"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    # Preserve existing sessions until their normal expiry; new sessions bind to a tab.
    op.add_column("auth_sessions", sa.Column("remembered", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("auth_sessions", sa.Column("tab_hash", sa.String(64), nullable=True))
    op.create_table("pending_registrations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=True),
        sa.Column("workspace_name", sa.String(120), nullable=True),
        sa.Column("user_company", sa.String(12), nullable=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("code_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"))
    op.create_index("ix_pending_registrations_expires_at", "pending_registrations", ["expires_at"])
    op.create_index("ix_pending_registrations_created_at", "pending_registrations", ["created_at"])
    op.create_table("workspace_credits",
        sa.Column("workspace_id", sa.String(80), sa.ForeignKey("workspaces.id"), primary_key=True),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("used", sa.Integer(), nullable=False, server_default="0"))
    # Carry previous workspace spending forward rather than resetting it on deployment.
    op.execute("""INSERT INTO workspace_credits (workspace_id, total, used)
        SELECT w.id, 1000, COALESCE((SELECT SUM(r.credits) FROM research_runs r WHERE r.workspace_id=w.id), 0)
        FROM workspaces w""")


def downgrade():
    op.drop_table("workspace_credits")
    op.drop_table("pending_registrations")
    op.drop_column("auth_sessions", "tab_hash")
    op.drop_column("auth_sessions", "remembered")
    op.drop_column("users", "email_verified_at")
