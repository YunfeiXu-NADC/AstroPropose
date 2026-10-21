"""Check proposal numbering and workflow evidence without changing records.

Run from backend/: python audit_proposals.py [--demo-catalog]
The optional catalog check protects the 25 bundled demonstration identities.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone

from app import create_app
from app.models.models import Proposal


DEMO_CATALOG = {
    1: ('月球背面低频巡天与宇宙黎明信号探测', '研究'),
    2: ('太阳低频射电爆发机遇观测', '机遇'),
    3: ('宇宙黑暗时代全局谱深度观测', '研究'),
    4: ('木星射电暴快速响应观测', '机遇'),
    5: ('全天低频射电巡天数据产品研究', '研究'),
    6: ('月球轨道低频阵列试验观测（草稿）', '研究'),
    7: ('低频背景辐射巡天', '研究'),
    8: ('后发座星系团射电晕观测', '研究'),
    9: ('星际介质低频成像', '研究'),
    10: ('月背射电源目录', '研究'),
    11: ('超长波天空模型', '研究'),
    12: ('暗弱源统计研究', '研究'),
    13: ('太阳活动区突发监测', '机遇'),
    14: ('脉冲星异常爆发跟踪', '机遇'),
    15: ('行星磁层扰动观测', '机遇'),
    16: ('短时射电暂现源', '机遇'),
    17: ('日冕物质抛射追踪', '机遇'),
    18: ('木星射电风暴后评估', '机遇'),
    19: ('低优先级射电触发', '机遇'),
    20: ('月面射电环境建模', '研究'),
    21: ('宇宙黎明信号搜索', '研究'),
    22: ('银河系低频巡天产品', '研究'),
    23: ('太阳射电爆发预警', '机遇'),
    24: ('月球遮蔽窗口观测', '机遇'),
    25: ('射电暂现源补充申请', '机遇'),
}


def audit(proposals, *, demo_catalog=False, now=None):
    """Return human-readable integrity issues for a proposal collection."""
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    proposals = list(proposals)
    issues = []
    ids = Counter(proposal.id for proposal in proposals)
    for proposal_id, count in ids.items():
        if count != 1:
            issues.append(f'RPS-{proposal_id:05d}: 编号重复（{count} 条）')
    for proposal in proposals:
        if not (proposal.title or '').strip():
            issues.append(f'RPS-{proposal.id:05d}: 标题缺失')
    if demo_catalog:
        for proposal_id, (title, kind) in DEMO_CATALOG.items():
            match = next((item for item in proposals if item.id == proposal_id), None)
            if match is None:
                issues.append(f'RPS-{proposal_id:05d}: 演示提案缺失（{title}）')
            elif match.title != title or kind not in match.proposal_type.name:
                issues.append(f'RPS-{proposal_id:05d}: 标题或类型与演示目录不符')
    for proposal in proposals:
        number = f'RPS-{proposal.id:05d}'
        state = proposal.current_state.name if proposal.current_state else ''
        kind = proposal.proposal_type.name if proposal.proposal_type else ''
        phases = proposal.phases.filter_by(phase='phase1').all()
        instruments = proposal.instruments.all()
        reviews = proposal.reviews.all()
        if proposal.id < 1 or not state or not kind:
            issues.append(f'{number}: 编号、状态或类型缺失')
            continue
        if proposal.current_state.workflow_id != proposal.proposal_type.workflow_id:
            issues.append(f'{number}: 状态不属于该提案类型的流程')
        if len(phases) != 1:
            issues.append(f'{number}: 申请阶段记录应恰好一条，实际 {len(phases)} 条')
        else:
            phase = phases[0]
            if state == '草稿':
                if phase.status != 'draft' or phase.submitted_at:
                    issues.append(f'{number}: 草稿与提交记录不一致')
            elif phase.status != 'submitted' or not phase.submitted_at:
                issues.append(f'{number}: 已提交状态缺少提交记录')
        if not instruments:
            issues.append(f'{number}: 未选择仪器')
        submitted = {review.review_type for review in reviews if review.status == 'submitted'}
        active_review = {
            '待技术评审': 'technical',
            '待科学评审': 'scientific',
            '待最终决策': 'committee',
        }.get(state)
        if demo_catalog and proposal.id in DEMO_CATALOG and active_review and not any(review.review_type == active_review for review in reviews):
            issues.append(f'{number}: {state}但未分配本阶段评审人')
        needs_technical = state in {
            '待科学评审', '待最终决策', '待分配观测数据', '数据已授权',
            '已推送观测编排', '执行反馈', '已完成', '已驳回',
        }
        needs_scientific = state in {
            '待最终决策', '待分配观测数据', '数据已授权',
            '已推送观测编排', '执行反馈', '已完成', '已驳回',
        }
        needs_decision = state in {
            '待分配观测数据', '数据已授权', '已推送观测编排',
            '执行反馈', '已完成', '已驳回',
        }
        for needed, review_type in (
            (needs_technical, 'technical'),
            (needs_scientific, 'scientific'),
            (needs_decision, 'committee'),
        ):
            if needed and review_type not in submitted:
                issues.append(f'{number}: {state}缺少已提交的 {review_type} 意见')
        decisions = [review for review in reviews if review.review_type == 'committee' and review.status == 'submitted']
        if needs_decision:
            expected = 'reject' if state == '已驳回' else 'pass'
            if not any(review.recommendation == expected for review in decisions):
                issues.append(f'{number}: 决策结果与状态不一致')
            if state == '已驳回' and not any((review.comments or '').strip() for review in decisions):
                issues.append(f'{number}: 驳回缺少理由')
        feedbacks = [item.scheduling_feedback or {} for item in instruments]
        if '研究' in kind and state in {'数据已授权', '已完成'}:
            if not any(feedback.get('data_products') for feedback in feedbacks):
                issues.append(f'{number}: {state}但未分配数据产品')
        if '机遇' in kind and state in {'执行反馈', '已完成'}:
            if not any(feedback.get('status') == 'completed' and feedback.get('summary') for feedback in feedbacks):
                issues.append(f'{number}: {state}但缺少最终执行结果')
        for review in reviews:
            if review.submitted_at and review.submitted_at > now:
                issues.append(f'{number}: 评审提交时间在未来')
        for feedback in feedbacks:
            completed_at = feedback.get('completed_at')
            if completed_at:
                try:
                    completed = datetime.fromisoformat(completed_at.replace(' UTC', '').replace('Z', ''))
                except ValueError:
                    issues.append(f'{number}: 完成时间格式无法识别')
                else:
                    if completed > now:
                        issues.append(f'{number}: 完成时间在未来')
        for item in instruments:
            if item.applicant_confirmed_at and item.applicant_confirmed_at > now:
                issues.append(f'{number}: 申请人确认时间在未来')
    return issues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--demo-catalog', action='store_true')
    args = parser.parse_args()
    app = create_app()
    with app.app_context():
        proposals = Proposal.query.order_by(Proposal.id).all()
        issues = audit(proposals, demo_catalog=args.demo_catalog)
        print(f'检查 {len(proposals)} 条提案；问题 {len(issues)} 项')
        for issue in issues:
            print(' -', issue)
    raise SystemExit(1 if issues else 0)


if __name__ == '__main__':
    main()
