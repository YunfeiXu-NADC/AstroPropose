"""add proposal manager role

Revision ID: b7a3c1d9e402
Revises: 2c71b8e6a4d0
Create Date: 2026-10-15 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = 'b7a3c1d9e402'
down_revision = '2c71b8e6a4d0'
branch_labels = None
depends_on = None


BUILT_IN_ROLES = (
    'Admin',
    'Proposal Manager',
    'Proposer',
    'Technical Expert',
    'Reviewer',
    'Panel Chair',
    'Instrument Scheduler',
)


def upgrade():
    connection = op.get_bind()
    role = sa.table(
        'role',
        sa.column('id', sa.Integer),
        sa.column('name', sa.String),
        sa.column('is_system', sa.Boolean),
    )
    exists = connection.execute(
        sa.select(role.c.id).where(role.c.name == 'Proposal Manager')
    ).first()
    if exists is None:
        connection.execute(role.insert().values(name='Proposal Manager', is_system=True))
    connection.execute(
        role.update().where(role.c.name.in_(BUILT_IN_ROLES)).values(is_system=True)
    )


def downgrade():
    connection = op.get_bind()
    role = sa.table('role', sa.column('id', sa.Integer), sa.column('name', sa.String))
    roles_users = sa.table(
        'roles_users',
        sa.column('user_id', sa.Integer),
        sa.column('role_id', sa.Integer),
    )
    proposal_manager_id = connection.execute(
        sa.select(role.c.id).where(role.c.name == 'Proposal Manager')
    ).scalar()
    if proposal_manager_id is not None:
        in_use = connection.execute(
            sa.select(roles_users.c.user_id).where(roles_users.c.role_id == proposal_manager_id)
        ).first()
        if in_use is None:
            connection.execute(role.delete().where(role.c.id == proposal_manager_id))
