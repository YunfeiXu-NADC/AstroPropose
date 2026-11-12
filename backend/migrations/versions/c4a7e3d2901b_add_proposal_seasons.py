"""Link proposals to annual batches and add the data-release deadline.

Revision ID: c4a7e3d2901b
Revises: b7a3c1d9e402
"""

from alembic import op
import sqlalchemy as sa


revision = 'c4a7e3d2901b'
down_revision = 'b7a3c1d9e402'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('proposal_season', sa.Column('data_release_deadline', sa.DateTime(), nullable=True))
    op.add_column('proposal_season', sa.Column('is_legacy', sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table('proposal') as batch_op:
        batch_op.add_column(sa.Column('season_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_proposal_season', 'proposal_season', ['season_id'], ['id'])
        batch_op.create_index('ix_proposal_season_id', ['season_id'])

    connection = op.get_bind()
    existing = connection.execute(sa.text('SELECT COUNT(*) FROM proposal')).scalar()
    if existing:
        result = connection.execute(sa.text(
            "INSERT INTO proposal_season (name, is_legacy) VALUES ('历史提案（未设置批次）', 1)"
        ))
        connection.execute(sa.text('UPDATE proposal SET season_id = :season_id'), {'season_id': result.lastrowid})


def downgrade():
    with op.batch_alter_table('proposal') as batch_op:
        batch_op.drop_index('ix_proposal_season_id')
        batch_op.drop_constraint('fk_proposal_season', type_='foreignkey')
        batch_op.drop_column('season_id')
    op.drop_column('proposal_season', 'is_legacy')
    op.drop_column('proposal_season', 'data_release_deadline')
