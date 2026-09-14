"""add proposal reviews

Revision ID: 2c71b8e6a4d0
Revises: 9f3b8a1c4d21
Create Date: 2026-09-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = '2c71b8e6a4d0'
down_revision = '9f3b8a1c4d21'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'proposal_review',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('proposal_id', sa.Integer(), nullable=False),
        sa.Column('reviewer_id', sa.Integer(), nullable=False),
        sa.Column('review_type', sa.String(length=32), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('scores', sa.JSON(), nullable=True),
        sa.Column('recommendation', sa.String(length=32), nullable=True),
        sa.Column('comments', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['proposal_id'], ['proposal.id']),
        sa.ForeignKeyConstraint(['reviewer_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'proposal_id', 'reviewer_id', 'review_type',
            name='uq_proposal_reviewer_review_type',
        ),
    )
    op.create_index(
        'ix_proposal_review_queue',
        'proposal_review',
        ['proposal_id', 'review_type', 'status'],
        unique=False,
    )


def downgrade():
    op.drop_index('ix_proposal_review_queue', table_name='proposal_review')
    op.drop_table('proposal_review')
