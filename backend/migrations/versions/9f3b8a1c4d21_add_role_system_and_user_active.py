"""add_role_system_and_user_active

Revision ID: 9f3b8a1c4d21
Revises: 385388bc973d
Create Date: 2026-04-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9f3b8a1c4d21'
down_revision = '385388bc973d'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('role', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_system', sa.Boolean(), nullable=False, server_default=sa.false())
        )

    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true())
        )

    op.execute(
        sa.text(
            "UPDATE role SET is_system = TRUE "
            "WHERE name IN ('Admin', 'Proposer', 'Panel Chair', 'Instrument Scheduler')"
        )
    )


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('is_active')

    with op.batch_alter_table('role', schema=None) as batch_op:
        batch_op.drop_column('is_system')
