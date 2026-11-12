"""Add the post-data research output publication process.

Revision ID: e52c6db88910
Revises: c4a7e3d2901b
"""

from alembic import op
import sqlalchemy as sa


revision = 'e52c6db88910'
down_revision = 'c4a7e3d2901b'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'research_output',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('proposal_id', sa.Integer(), sa.ForeignKey('proposal.id'), nullable=False, unique=True),
        sa.Column('title', sa.String(length=240), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('draft_file', sa.JSON(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(), nullable=False),
        sa.Column('feedback_deadline', sa.DateTime(), nullable=False),
        sa.Column('revised_file', sa.JSON()),
        sa.Column('revision_note', sa.Text()),
        sa.Column('revised_at', sa.DateTime()),
        sa.Column('committee_note', sa.Text()),
        sa.Column('committee_decision_by_id', sa.Integer(), sa.ForeignKey('user.id')),
        sa.Column('committee_decided_at', sa.DateTime()),
        sa.Column('journal_name', sa.String(length=240)),
        sa.Column('journal_submitted_at', sa.DateTime()),
        sa.Column('journal_accepted_at', sa.DateTime()),
        sa.Column('publication_reference', sa.Text()),
        sa.Column('final_file', sa.JSON()),
        sa.Column('published_at', sa.DateTime()),
        sa.Column('history', sa.JSON(), nullable=False),
    )
    op.create_table(
        'research_output_comment',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('output_id', sa.Integer(), sa.ForeignKey('research_output.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_research_output_comment_output_id', 'research_output_comment', ['output_id'])


def downgrade():
    op.drop_index('ix_research_output_comment_output_id', table_name='research_output_comment')
    op.drop_table('research_output_comment')
    op.drop_table('research_output')
