"""Create representative proposal records for role and progress demonstrations."""

from datetime import datetime
from urllib.parse import quote

from app import create_app, db
from app.models.models import (
    Instrument,
    Proposal,
    ProposalInstrument,
    ProposalPhase,
    ProposalReview,
    ProposalType,
    User,
    WorkflowState,
)


SAMPLES = (
    {
        'title': '月球轨道低频阵列试验观测（草稿）',
        'author': 'proposer',
        'type': 'DSL 研究提案',
        'state': '草稿',
        'instruments': ('LF',),
        'draft': True,
    },
    {
        'title': '月球背面低频巡天与宇宙黎明信号探测',
        'author': 'proposer',
        'type': 'DSL 研究提案',
        'state': '待技术评审',
        'instruments': ('LF', 'HF'),
    },
    {
        'title': '太阳低频射电爆发机遇观测',
        'author': 'proposer',
        'type': 'DSL 机遇观测提案',
        'state': '待快速科学评审',
        'instruments': ('HF',),
    },
    {
        'title': '宇宙黑暗时代全局谱深度观测',
        'author': 'proposer',
        'type': 'DSL 研究提案',
        'state': '数据匹配',
        'instruments': ('LF',),
        'feedback': {
            'status': 'data_ready',
            'observation_id': 'DSL-OBS-2026-0031',
            'visibility_window': '2026-11-12 至 2026-11-18',
            'completed_at': '2026-11-19 08:30 UTC',
            'summary': '观测已完成，数据已通过完整性校验并向提案申请人开放。',
            'data_products': [
                {
                    'name': 'DSL-OBS-2026-0031-观测清单.csv',
                    'format': 'CSV',
                    'size': '24 KB',
                    'description': '观测时间、频段、积分时长与质量标记。',
                    'data_url': 'data:text/csv;charset=utf-8,' + quote(
                        'observation_id,start_time,end_time,frequency_mhz,quality\n'
                        'DSL-OBS-2026-0031,2026-11-12T01:00Z,2026-11-12T05:30Z,0.5-25,validated\n'
                    ),
                },
                {
                    'name': 'DSL-OBS-2026-0031-数据说明.txt',
                    'format': 'TXT',
                    'size': '8 KB',
                    'description': '数据版本、标定状态与使用说明。',
                    'data_url': 'data:text/plain;charset=utf-8,' + quote(
                        '鸿蒙计划 DSL 观测数据包\n数据编号：DSL-OBS-2026-0031\n状态：已完成完整性校验\n'
                    ),
                },
            ],
        },
    },
    {
        'title': '木星射电暴快速响应观测',
        'author': 'admin',
        'type': 'DSL 机遇观测提案',
        'state': '已推送观测编排',
        'instruments': ('HF',),
        'feedback': {'status': 'scheduled', 'summary': '已推送观测编排负责人'},
    },
    {
        'title': '全天低频射电巡天数据产品研究',
        'author': 'chair',
        'type': 'DSL 研究提案',
        'state': '待科学评审',
        'instruments': ('LF', 'HF'),
    },
)


def seed():
    app = create_app()
    with app.app_context():
        for sample in SAMPLES:
            author = User.query.filter_by(username=sample['author']).one()
            proposal_type = ProposalType.query.filter_by(name=sample['type']).one()
            current_state = WorkflowState.query.filter_by(
                workflow_id=proposal_type.workflow_id,
                name=sample['state'],
            ).one()
            proposal = Proposal.query.filter_by(title=sample['title']).first()
            if proposal is None:
                proposal = Proposal(title=sample['title'], author=author, proposal_type=proposal_type)
                db.session.add(proposal)
            proposal.abstract = '面向鸿蒙计划超长波观测能力的 DSL 演示提案，用于验证申请、评审、编排及反馈全流程。'
            proposal.author = author
            proposal.proposal_type = proposal_type
            proposal.current_state = current_state

            phase = proposal.phases.filter_by(phase='phase1').first()
            if phase is None:
                phase = ProposalPhase(proposal=proposal, phase='phase1', opened_at=datetime.utcnow())
                db.session.add(phase)
            phase.status = 'draft' if sample.get('draft') else 'submitted'
            phase.submitted_at = None if sample.get('draft') else (phase.submitted_at or datetime.utcnow())
            is_opportunity = '机遇' in sample['type']
            document_name = f"{sample['title']}-申请正文.txt"
            document_text = f"{sample['title']}\n\n鸿蒙计划 DSL 研究提案演示附件。"
            phase.payload = {
                **(
                    {
                        'event_type': 'solar' if '太阳' in sample['title'] else 'planetary',
                        'urgency': '72h',
                        'trigger_and_value': '目标具有明显时效性，需要在有效观测窗口内快速响应。',
                        'rapid_plan': '使用 HF 频谱仪进行连续动态频谱观测，并及时反馈执行结果。',
                    }
                    if is_opportunity else
                    {
                        'science_category': 'dark_ages' if '黑暗' in sample['title'] else 'all_sky',
                        'science_objective': '研究低频射电天空及宇宙早期信号，形成可复用的科学数据产品。',
                        'technical_summary': '结合绕月编队轨道与遮蔽窗口安排多频段积分观测。',
                        'data_plan': '完成标定、成像或频谱提取后形成阶段性数据产品。',
                    }
                ),
                'targets': [{
                    'target_name': '主要观测目标',
                    'coordinates': '赤经 12h 30m，赤纬 +18° 20′',
                    'observation_window': '2026-11-12 至 2026-11-18',
                    'visibility_note': '已完成初步可见性计算，可用窗口约 18.6 小时。',
                }],
                '__attachments__': {
                    'proposal_document': {
                        'name': document_name,
                        'size': len(document_text.encode('utf-8')),
                        'type': 'text/plain',
                        'data_url': f"data:text/plain;charset=utf-8,{quote(document_text)}",
                    }
                },
            }

            for code in sample['instruments']:
                instrument = Instrument.query.filter_by(code=code).one()
                entry = proposal.instruments.filter_by(instrument_id=instrument.id, phase='phase1').first()
                if entry is None:
                    entry = ProposalInstrument(proposal=proposal, instrument=instrument, phase='phase1')
                    db.session.add(entry)
                entry.status = 'scheduled' if sample.get('feedback') else 'submitted'
                entry.form_data = (
                    {
                        'frequency_band': '0.5–25 MHz',
                        'integration_hours': 48,
                        'angular_resolution': '约 10 角分',
                        'imaging_mode': 'deep',
                    }
                    if code == 'LF' else
                    {
                        'frequency_band': '1–120 MHz',
                        'time_resolution': '1 秒',
                        'spectral_resolution': '10 kHz',
                        'polarization': 'full',
                    }
                )
                entry.scheduling_feedback = sample.get('feedback', {})

            review_type = None
            reviewer_name = None
            if sample['state'] == '待技术评审':
                review_type, reviewer_name = 'technical', 'tech_expert'
            elif sample['state'] in ('待科学评审', '待快速科学评审'):
                review_type, reviewer_name = 'scientific', 'reviewer'
            elif sample['state'] in ('待委员会决策', '待快速决策'):
                review_type, reviewer_name = 'committee', 'chair'
            if review_type:
                db.session.flush()
                reviewer = User.query.filter_by(username=reviewer_name).one()
                assignment = ProposalReview.query.filter_by(
                    proposal_id=proposal.id,
                    reviewer_id=reviewer.id,
                    review_type=review_type,
                ).first()
                if assignment is None:
                    db.session.add(ProposalReview(
                        proposal=proposal,
                        reviewer=reviewer,
                        review_type=review_type,
                        status='assigned',
                    ))
        db.session.commit()
        print('DSL demo proposals seeded')


if __name__ == '__main__':
    seed()
