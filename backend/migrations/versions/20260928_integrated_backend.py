"""Merge account and conversation branches without changing existing revision ancestry."""
from alembic import op

revision = "20260928_integrated_backend"
down_revision = ("20260927_accounts", "20260927_conversation_history")
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""INSERT INTO workspaces (id, name, created_at)
        SELECT DISTINCT workspace_id, workspace_id, CURRENT_TIMESTAMP FROM conversations
        WHERE workspace_id NOT IN (SELECT id FROM workspaces)""")
    if op.get_bind().dialect.name == "postgresql":
        op.create_foreign_key("fk_conversations_workspace", "conversations", "workspaces", ["workspace_id"], ["id"])


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint("fk_conversations_workspace", "conversations", type_="foreignkey")
    # Preserve workspace records; they may own research added after the merge.
