"""One-time, guarded repair of the bundled demonstration proposal snapshots.

This does not create proposals, renumber them, or rewrite application text.
Run only against the demo database after making a SQLite backup.
"""

import os
from datetime import timedelta

from app import create_app, db
from app.models.models import Proposal, ProposalReview, User, WorkflowState
from audit_proposals import DEMO_CATALOG, audit
from seed_dsl_demo_proposals import SAMPLES


CORRECTIONS = {
    3: ('已完成', '数据已授权'),
    17: ('执行反馈', '已推送观测编排'),
    18: ('已完成', '已推送观测编排'),
    22: ('已完成', '待分配观测数据'),
}


def repair():
    database_url = os.environ.get('DATABASE_URL', '')
    if not database_url.endswith('/astropropose-demo.db'):
        raise RuntimeError('只允许修复 astropropose-demo.db')
    app = create_app()
    with app.app_context():
        proposals = {item.id: item for item in Proposal.query.order_by(Proposal.id)}
        if set(proposals) != set(DEMO_CATALOG):
            raise RuntimeError('演示提案数量或编号已改变，停止修复')
        for proposal_id, (title, kind) in DEMO_CATALOG.items():
            proposal = proposals[proposal_id]
            if proposal.title != title or kind not in proposal.proposal_type.name:
                raise RuntimeError(f'RPS-{proposal_id:05d} 标题或类型已改变，停止修复')
        for proposal_id, (old_state, new_state) in CORRECTIONS.items():
            if proposals[proposal_id].current_state.name not in {old_state, new_state}:
                raise RuntimeError(f'RPS-{proposal_id:05d} 状态已改变，停止修复')

        samples = {sample['title']: sample for sample in SAMPLES}
        for proposal_id, (_, new_state) in CORRECTIONS.items():
            proposal = proposals[proposal_id]
            proposal.current_state = WorkflowState.query.filter_by(
                workflow_id=proposal.proposal_type.workflow_id,
                name=new_state,
            ).one()
            if proposal_id in {3, 17}:
                for instrument in proposal.instruments:
                    instrument.scheduling_feedback = samples[proposal.title]['feedback']
                    instrument.status = 'data_ready' if proposal_id == 3 else 'scheduled'
            if proposal_id == 3:
                phase = proposal.phases.filter_by(phase='phase1').one()
                phase.payload = {
                    **(phase.payload or {}),
                    'targets': samples[proposal.title]['application']['targets'],
                }

        for proposal in proposals.values():
            state = proposal.current_state.name
            needs_technical = state in {
                '待科学评审', '待最终决策', '待分配观测数据', '数据已授权',
                '已推送观测编排', '执行反馈', '已完成', '已驳回',
            }
            needs_scientific = state in {
                '待最终决策', '待分配观测数据', '数据已授权',
                '已推送观测编排', '执行反馈', '已完成', '已驳回',
            }
            phase = proposal.phases.filter_by(phase='phase1').one()
            for index, (required, review_type, username) in enumerate((
                (needs_technical, 'technical', 'tech_expert'),
                (needs_scientific, 'scientific', 'reviewer'),
            ), start=1):
                if not required:
                    continue
                existing = proposal.reviews.filter_by(review_type=review_type).all()
                if any(review.status == 'submitted' for review in existing):
                    continue
                if existing:
                    raise RuntimeError(f'RPS-{proposal.id:05d} {review_type} 有未提交意见，停止修复')
                reviewer = User.query.filter_by(username=username).one()
                rejected_science = state == '已驳回' and review_type == 'scientific'
                db.session.add(ProposalReview(
                    proposal=proposal,
                    reviewer=reviewer,
                    review_type=review_type,
                    status='submitted',
                    scores=(
                        {'technical_feasibility': 4, 'instrument_match': 4}
                        if review_type == 'technical' else
                        {'scientific_merit': 2 if rejected_science else 4, 'priority': 2 if rejected_science else 3}
                    ),
                    recommendation='reject' if rejected_science else 'pass',
                    comments=(
                        '演示补录：技术参数与申请目标基本匹配；非专家真实提交记录。'
                        if review_type == 'technical' else
                        '演示补录：科学优先级不足，建议不予批准；非专家真实提交记录。'
                        if rejected_science else
                        '演示补录：科学目标具备评议价值；非专家真实提交记录。'
                    ),
                    submitted_at=phase.submitted_at + timedelta(hours=index),
                ))
        db.session.flush()
        issues = audit(proposals.values(), demo_catalog=True)
        if issues:
            db.session.rollback()
            raise RuntimeError('修复后仍有问题：\n' + '\n'.join(issues))
        db.session.commit()
        print('已核对并修复 25 条演示提案；编号未变，4 条异常状态按实际凭据调整。')


if __name__ == '__main__':
    repair()
