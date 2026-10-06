"""Accounts and sessions; preserve existing workspace identifiers and research history."""
from alembic import op
import sqlalchemy as sa

revision = "20260927_accounts"
down_revision = "20260922_provider_payload"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("job_title", sa.String(80), nullable=False),
        sa.Column("timezone", sa.String(80), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True)))
    op.create_index("ix_users_created_at", "users", ["created_at"])
    op.create_table("workspaces",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.execute("""INSERT INTO workspaces (id, name, created_at)
        SELECT workspace_id, workspace_id, CURRENT_TIMESTAMP FROM (
            SELECT workspace_id FROM watchlists UNION SELECT workspace_id FROM research_runs
            UNION SELECT workspace_id FROM signals
        ) AS existing_workspaces""")
    op.create_table("workspace_memberships",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("workspace_id", sa.String(80), sa.ForeignKey("workspaces.id"), primary_key=True),
        sa.Column("permission", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("auth_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("csrf_hash", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("workspace_id", sa.String(80), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False))
    for column in ("created_at", "user_id", "expires_at"):
        op.create_index(f"ix_auth_sessions_{column}", "auth_sessions", [column])
    # PostgreSQL can add these without rewriting rows protected by immutable-history triggers.
    # SQLite tests retain the original tables to preserve their triggers too.
    if op.get_bind().dialect.name == "postgresql":
        for table in ("watchlists", "research_runs", "signals"):
            op.create_foreign_key(f"fk_{table}_workspace", table, "workspaces", ["workspace_id"], ["id"])


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        for table in ("watchlists", "research_runs", "signals"):
            op.drop_constraint(f"fk_{table}_workspace", table, type_="foreignkey")
    op.drop_table("auth_sessions")
    op.drop_table("workspace_memberships")
    op.drop_table("workspaces")
    op.drop_table("users")
