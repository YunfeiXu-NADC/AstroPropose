from datetime import datetime
from io import BytesIO
from html import escape
from urllib.parse import quote

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from flask import Blueprint, jsonify, make_response, request
from sqlalchemy.exc import IntegrityError

from app import db
from app.core.workflow_engine import WorkflowEngine
from app.models.models import (
    FormTemplate,
    Instrument,
    InstrumentFeedback,
    Proposal,
    ProposalInstrument,
    ProposalPhase,
    ProposalReview,
    ProposalStateHistory,
    ProposalType,
    User,
    WorkflowState,
)
from app.api.auth import token_required

bp = Blueprint('proposals', __name__)


def _pdf_text_hex(value):
    return str(value or '').encode('utf-16-be').hex().upper()


def _pdf_value(field, value):
    if value is None or value == '':
        return '未填写'
    if field and field.get('type') == 'select':
        options = field.get('options') or []
        return next((str(option.get('label')) for option in options if str(option.get('value')) == str(value)), str(value))
    if value is True:
        return '是'
    if value is False:
        return '否'
    return str(value)


def _pdf_lines(proposal):
    """Build a concise, printable proposal record from the stored form values."""
    lines = [
        '鸿蒙计划 RPS',
        '提案申请记录',
        '',
        f'提案编号：RPS-{proposal.id:05d}',
        f'提案名称：{proposal.title}',
        f'提案类型：{proposal.proposal_type.name}',
        f'申请人：{proposal.author.username}',
        f'当前阶段：{proposal.current_state.name if proposal.current_state else "未设置"}',
        '',
        '研究摘要',
        proposal.abstract or '未填写',
        '',
        '申请表信息',
    ]
    application = proposal.phases.filter_by(phase='phase1').first()
    application_template = None
    if proposal.current_state and proposal.proposal_type.workflow:
        initial_name = (proposal.proposal_type.workflow.definition or {}).get('initial_state')
        initial_state = WorkflowState.query.filter_by(
            workflow_id=proposal.proposal_type.workflow_id, name=initial_name
        ).first()
        application_template = initial_state.form_template if initial_state else None
    application_fields = (application_template.definition or {}).get('fields') if application_template else []
    fields_by_name = {field.get('name'): field for field in application_fields}
    for key, value in ((application.payload or {}) if application else {}).items():
        if key in ('__attachments__', 'rapid_plan'):
            continue
        field = fields_by_name.get(key)
        label = field.get('label', key) if field else key
        if isinstance(value, list):
            lines.append(f'{label}：')
            sub_fields = (field or {}).get('sub_fields') or (field or {}).get('subFields') or []
            sub_fields_by_name = {sub_field.get('name'): sub_field for sub_field in sub_fields}
            for index, item in enumerate(value, start=1):
                if isinstance(item, dict):
                    details = '；'.join(
                        f'{sub_fields_by_name.get(name, {}).get("label", name)}：{_pdf_value(sub_fields_by_name.get(name), content)}'
                        for name, content in item.items()
                    )
                    lines.append(f'  {label} {index}：{details}')
                else:
                    lines.append(f'  {_pdf_value(field, item)}')
        else:
            lines.append(f'{label}：{_pdf_value(field, value)}')
    for item in proposal.instruments.order_by(ProposalInstrument.id):
        lines.extend(['', f'仪器参数：{item.instrument.name}（{item.instrument.code}）'])
        instrument_template = item.instrument.form_templates.order_by(
            FormTemplate.version.desc(), FormTemplate.id.desc()
        ).first()
        instrument_fields = (instrument_template.definition or {}).get('fields') if instrument_template else []
        instrument_fields_by_name = {field.get('name'): field for field in instrument_fields}
        for key, value in (item.form_data or {}).items():
            if key != '__attachments__':
                field = instrument_fields_by_name.get(key)
                lines.append(f'{field.get("label", key) if field else key}：{_pdf_value(field, value)}')
        feedback = item.scheduling_feedback or {}
        if feedback:
            lines.append(f'执行反馈：{feedback.get("summary") or feedback.get("status") or "已更新"}')
            for product in feedback.get('data_products') or []:
                lines.append(f'已授权数据：{product.get("name") or product.get("product_name") or "数据产品"}')
    if proposal.reviews.count():
        lines.extend(['', '评审与决策记录'])
        for review in proposal.reviews.filter_by(status='submitted').order_by(ProposalReview.created_at):
            lines.append(f'{review.review_type} · {review.reviewer.username}：{review.comments or "未填写意见"}')
    return lines


def _build_proposal_pdf(proposal, visible_reviews=None):
    """Build a branded, printable proposal record from all visible form data."""
    pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    navy, blue, pale, ink, muted, line = (
        colors.HexColor('#071528'), colors.HexColor('#3347B8'), colors.HexColor('#EEF2FF'),
        colors.HexColor('#13213A'), colors.HexColor('#66758C'), colors.HexColor('#D9E1EE'),
    )
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm)
    styles = getSampleStyleSheet()
    body = ParagraphStyle('rps-body', parent=styles['BodyText'], fontName='STSong-Light', fontSize=9, leading=13.5, textColor=ink, wordWrap='CJK')
    title = ParagraphStyle('rps-title', parent=body, fontSize=20, leading=28, textColor=colors.white)
    small = ParagraphStyle('rps-small', parent=body, fontSize=8, leading=11, textColor=muted)
    section = ParagraphStyle('rps-section', parent=body, fontSize=12, leading=18, textColor=ink)

    def p(value, style=body):
        return Paragraph(escape(str(value or '未填写')).replace('\n', '<br/>'), style)

    def table_rows(rows):
        if not rows:
            return p('未填写信息。', small)
        rendered = [[p(label, ParagraphStyle('label', parent=small, textColor=muted)), p(value)] for label, value in rows]
        table = Table(rendered, colWidths=[42 * mm, 130 * mm], hAlign='LEFT', repeatRows=0, splitInRow=1)
        table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 0), (-1, -1), 0.45, line),
            ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        return table

    def add_section(story, heading, rows=None, content=None):
        story.append(Spacer(1, 4 * mm))
        heading_table = Table([[p(heading, section)]], colWidths=[172 * mm], style=TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), pale), ('LINEBEFORE', (0, 0), (0, 0), 2.5, blue),
            ('LEFTPADDING', (0, 0), (-1, -1), 9), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        heading_table.keepWithNext = True
        story.append(heading_table)
        story.append(Spacer(1, 3 * mm))
        story.append(content if content is not None else table_rows(rows or []))

    story = []
    story.append(Table([[p('鸿蒙计划 RPS', ParagraphStyle('brand', parent=small, textColor=colors.HexColor('#B7C5FF')))], [p(proposal.title, title)]], colWidths=[172 * mm], style=TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), navy), ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10), ('BOTTOMPADDING', (0, -1), (-1, -1), 12),
    ])))
    stage = proposal.current_state.name if proposal.current_state else '未设置'
    metadata = [
        [p('提案编号', small), p('申请人', small), p('提案类型', small), p('当前阶段', small)],
        [p(f'RPS-{proposal.id:05d}'), p(proposal.author.username), p(proposal.proposal_type.name), p(stage)],
    ]
    story.append(Table(metadata, colWidths=[43 * mm] * 4, style=TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F7F9FC')), ('BOX', (0, 0), (-1, -1), 0.45, line),
        ('INNERGRID', (0, 0), (-1, -1), 0.35, line), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
    ])))
    rejection = _rejection_notice(proposal)
    if rejection:
        add_section(story, '最终决策', [
            ('结论', '驳回'),
            ('决策机构', rejection['decided_by']),
            ('综合优先级', f"{rejection['priority']} / 5" if rejection['priority'] is not None else '未记录'),
            ('决策理由', rejection['reason'] or '未记录决策理由'),
        ])
    add_section(story, '摘要', content=p(proposal.abstract or '未填写摘要。'))

    application = proposal.phases.filter_by(phase='phase1').first()
    initial_name = (proposal.proposal_type.workflow.definition or {}).get('initial_state') if proposal.proposal_type.workflow else None
    initial_state = WorkflowState.query.filter_by(workflow_id=proposal.proposal_type.workflow_id, name=initial_name).first()
    application_fields = ((initial_state.form_template.definition or {}).get('fields') if initial_state and initial_state.form_template else [])
    app_fields = {field.get('name'): field for field in application_fields}
    application_rows, target_stories = [], []
    for key, value in ((application.payload or {}) if application else {}).items():
        if key in ('__attachments__', 'rapid_plan'):
            continue
        field = app_fields.get(key)
        label = field.get('label', key) if field else key
        if isinstance(value, list):
            sub_fields = {item.get('name'): item for item in ((field or {}).get('sub_fields') or (field or {}).get('subFields') or [])}
            for index, entry in enumerate(value, start=1):
                if isinstance(entry, dict):
                    target_stories.append(Table([[p(f'{label} {index}', ParagraphStyle('target-title', parent=body, textColor=blue))]], colWidths=[172 * mm], style=TableStyle([('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F7F9FC')), ('LEFTPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5)])))
                    target_stories.append(table_rows([(sub_fields.get(name, {}).get('label', name), _pdf_value(sub_fields.get(name), item)) for name, item in entry.items()]))
            continue
        application_rows.append((label, _pdf_value(field, value)))
    add_section(story, '申请内容', application_rows)
    story.extend(target_stories)

    for item in proposal.instruments.order_by(ProposalInstrument.id):
        template = item.instrument.form_templates.order_by(FormTemplate.version.desc(), FormTemplate.id.desc()).first()
        fields = {field.get('name'): field for field in ((template.definition or {}).get('fields') if template else [])}
        rows = [(fields.get(key, {}).get('label', key), _pdf_value(fields.get(key), value)) for key, value in (item.form_data or {}).items() if key != '__attachments__']
        add_section(story, f'所选仪器：{item.instrument.name}（{item.instrument.code}）', rows)

    attachments = []
    for payload in [application.payload if application else {}, *[item.form_data for item in proposal.instruments.all()]]:
        attachments.extend(file.get('name') for file in (payload or {}).get('__attachments__', {}).values() if file and file.get('name'))
    if attachments:
        add_section(story, '附件', [('文件', name) for name in attachments])
    reviews = visible_reviews if visible_reviews is not None else proposal.reviews.filter_by(status='submitted').order_by(ProposalReview.created_at).all()
    if rejection:
        reviews = [review for review in reviews if review.review_type != 'committee']
    if reviews:
        add_section(story, '已提交评审意见', [(f'{review.review_type} · {review.reviewer.username}', review.comments or '未填写意见') for review in reviews])

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('STSong-Light', 8)
        canvas.setFillColor(muted)
        canvas.drawString(18 * mm, 10 * mm, '鸿蒙计划 RPS · 提案记录')
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f'第 {doc.page} 页')
        canvas.restoreState()

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()


def _review_type(proposal):
    state_name = proposal.current_state.name if proposal.current_state else ''
    normalized = state_name.lower()
    if '技术评审' in state_name or 'technical' in normalized:
        return 'technical'
    if '科学评审' in state_name or 'science' in normalized or 'review' in normalized:
        return 'scientific'
    if '决策' in state_name or 'committee' in normalized or 'decision' in normalized:
        return 'committee'
    return None


def _is_review_task(proposal):
    return _review_type(proposal) is not None


def _is_submitted_proposal(proposal):
    state_name = proposal.current_state.name if proposal.current_state else ''
    phase = proposal.phases.filter_by(phase='phase1').first()
    return state_name not in ('草稿', 'Draft') and (phase is None or phase.status != 'draft')


def _is_research_proposal(proposal):
    type_name = (proposal.proposal_type.name if proposal.proposal_type else '').lower()
    return '研究' in type_name or 'research' in type_name


def _is_opportunity_proposal(proposal):
    type_name = (proposal.proposal_type.name if proposal.proposal_type else '').lower()
    return '机遇' in type_name or 'opportunity' in type_name or 'too' in type_name


def _is_dsl_proposal(proposal):
    return bool(proposal.proposal_type and proposal.proposal_type.name.startswith('DSL '))


def _is_review_stage(proposal):
    return (proposal.current_state.name if proposal.current_state else '') in {
        '待技术评审', '待科学评审', '待最终决策',
    }


def _is_review_stage_return(proposal, transition_name):
    if not (_is_dsl_proposal(proposal) and _is_review_stage(proposal)):
        return False
    state = proposal.current_state.name
    return any(
        transition.get('name') == transition_name
        and transition.get('from') == state
        and transition.get('to') == '待修改'
        for transition in (proposal.proposal_type.workflow.definition or {}).get('transitions', [])
    )


def _is_data_allocation_candidate(proposal):
    if not _is_submitted_proposal(proposal) or not _is_research_proposal(proposal):
        return False
    state_name = proposal.current_state.name if proposal.current_state else ''
    return state_name in {
        '待分配观测数据', '数据已授权', '已完成',
    }


def _can_allocate_data(proposal):
    if not _is_data_allocation_candidate(proposal):
        return False
    state_name = proposal.current_state.name if proposal.current_state else ''
    return state_name in {'待分配观测数据', '数据已授权', '已完成'}


def _can_review(current_user, proposal, review_type=None):
    review_type = review_type or _review_type(proposal)
    if proposal.user_id == current_user.id or review_type is None:
        return False
    assignment = ProposalReview.query.filter_by(
        proposal_id=proposal.id,
        reviewer_id=current_user.id,
        review_type=review_type,
    ).first()
    if assignment is None:
        return False
    if review_type == 'technical':
        return current_user.has_role('Technical Expert')
    if review_type == 'scientific':
        return current_user.has_role('Reviewer')
    if review_type == 'committee':
        return current_user.has_role('Panel Chair')
    return False


def _can_view_scheduling_proposal(current_user, proposal):
    return current_user.has_role('Instrument Scheduler') and _is_opportunity_proposal(proposal) and (
        proposal.current_state is not None
        and proposal.current_state.name in {'已推送观测编排', '执行反馈', '已完成'}
    )


def _can_view_proposal(current_user, proposal):
    if proposal.user_id == current_user.id:
        return True
    if current_user.has_role('Admin'):
        return _is_submitted_proposal(proposal)
    review_type = _review_type(proposal)
    if review_type and _can_review(current_user, proposal, review_type):
        return True
    if current_user.has_role('Proposal Manager'):
        return _is_data_allocation_candidate(proposal)
    return _can_view_scheduling_proposal(current_user, proposal)


def _reviews_released_to_applicant(proposal):
    return (proposal.data or {}).get('review_visibility') == 'visible'


def _visible_reviews_for_user(current_user, proposal):
    full_access = current_user.has_role('Admin') or current_user.has_role('Panel Chair')
    scheduler_access = _can_view_scheduling_proposal(current_user, proposal)
    owner_access = proposal.user_id == current_user.id and _reviews_released_to_applicant(proposal)
    return [
        review for review in proposal.reviews.order_by(ProposalReview.created_at)
        if review.status == 'submitted' and (
            full_access or scheduler_access or owner_access or review.reviewer_id == current_user.id
        )
    ]


def _rejection_notice(proposal):
    if not proposal.current_state or proposal.current_state.name != '已驳回':
        return None
    decision = proposal.reviews.filter_by(
        review_type='committee', status='submitted', recommendation='reject'
    ).order_by(ProposalReview.submitted_at.desc()).first()
    return {
        'outcome': 'reject',
        'decided_by': '科学委员会',
        'decided_at': decision.submitted_at.isoformat() if decision and decision.submitted_at else None,
        'priority': (decision.scores or {}).get('overall_priority') if decision else None,
        'reason': decision.comments if decision else None,
    }


def _review_progress(proposal):
    review_type = _review_type(proposal)
    if review_type not in {'technical', 'scientific'}:
        return None
    assignments = proposal.reviews.filter_by(review_type=review_type).all()
    submitted = sum(item.status == 'submitted' for item in assignments)
    return {
        'review_type': review_type,
        'assigned': len(assignments),
        'submitted': submitted,
        'pending': len(assignments) - submitted,
        'ready_to_advance': bool(assignments) and submitted == len(assignments),
    }


def _serialize_template(template):
    if template is None:
        return None
    return {
        'id': template.id,
        'name': template.name,
        'phase': template.phase,
        'version': template.version,
        'instrument': template.instrument.code if template.instrument else None,
        'definition': template.definition or {'fields': []},
    }


def _serialize_review(review):
    return {
        'id': review.id,
        'review_type': review.review_type,
        'status': review.status,
        'scores': review.scores or {},
        'recommendation': review.recommendation,
        'comments': review.comments,
        'reviewer': {
            'id': review.reviewer.id,
            'username': review.reviewer.username,
        },
        'submitted_at': review.submitted_at.isoformat() if review.submitted_at else None,
    }


@bp.route('/', methods=['GET'])
@token_required
def get_proposals(current_user):
    """Returns proposals for the current user or instrument queues."""
    instrument_code = request.args.get('instrument_code')
    scope = request.args.get('scope')
    scheduler_mode = instrument_code and (
        current_user.has_role('Instrument Scheduler') or current_user.has_role('Admin')
    )

    if scope == 'admin':
        if not current_user.has_role('Admin'):
            return jsonify({'message': '仅系统管理员可查看全部提案'}), 403
        proposals = [proposal for proposal in Proposal.query.all() if _is_submitted_proposal(proposal)]
    elif scope == 'assigned_reviews':
        assignments = ProposalReview.query.filter_by(reviewer_id=current_user.id).all()
        proposals = [
            assignment.proposal for assignment in assignments
            if assignment.review_type == _review_type(assignment.proposal)
            and assignment.status in ('assigned', 'submitted')
            and _can_review(current_user, assignment.proposal, assignment.review_type)
        ]
    elif scope == 'review_tasks':
        has_review_role = any(current_user.has_role(role) for role in ('Technical Expert', 'Reviewer', 'Panel Chair'))
        if current_user.has_role('Admin') and not has_review_role:
            proposals = [
                proposal for proposal in Proposal.query.all()
                if _is_submitted_proposal(proposal) and _is_review_task(proposal)
            ]
        else:
            assignments = ProposalReview.query.filter_by(reviewer_id=current_user.id).all()
            proposals = [
                assignment.proposal for assignment in assignments
                if assignment.review_type == _review_type(assignment.proposal)
                and assignment.status in ('assigned', 'submitted')
                and _can_review(current_user, assignment.proposal, assignment.review_type)
            ]
    elif scope == 'data_allocation':
        if not current_user.has_role('Proposal Manager') and not current_user.has_role('Admin'):
            return jsonify({'message': '仅提案管理员可执行观测数据分配'}), 403
        proposals = [
            proposal for proposal in Proposal.query.all()
            if _is_data_allocation_candidate(proposal)
        ]
    elif scope == 'feedback':
        if not any(current_user.has_role(role) for role in ('Admin', 'Technical Expert', 'Instrument Scheduler')):
            return jsonify({'message': '当前角色无权查看观测反馈'}), 403
        proposals = [
            proposal for proposal in Proposal.query.all()
            if _is_submitted_proposal(proposal)
            and (not current_user.has_role('Instrument Scheduler')
                 or current_user.has_role('Admin')
                 or _can_view_scheduling_proposal(current_user, proposal))
        ]
    elif scheduler_mode:
        instrument = Instrument.query.filter_by(code=instrument_code).first()
        if instrument is None:
            return jsonify({'message': '未找到对应仪器'}), 404
        assignments = ProposalInstrument.query.filter_by(instrument_id=instrument.id).all()
        proposals = [assignment.proposal for assignment in assignments if _can_view_proposal(current_user, assignment.proposal)]
    else:
        proposals = Proposal.query.filter_by(user_id=current_user.id).all()

    output = []
    for proposal in proposals:
        proposal_data = {
            'id': proposal.id,
            'title': proposal.title,
            'abstract': proposal.abstract,
            'author': {
                'id': proposal.author.id,
                'username': proposal.author.username,
                'email': proposal.author.email,
            },
            'status': proposal.current_state.name if proposal.current_state else 'N/A',
            'proposal_type': {
                'id': proposal.proposal_type.id,
                'name': proposal.proposal_type.name,
                'description': proposal.proposal_type.description,
            },
            'workflow': {
                'id': proposal.proposal_type.workflow.id,
                'name': proposal.proposal_type.workflow.name,
                'definition': proposal.proposal_type.workflow.definition,
            },
            'phases': [
                {
                    'phase': phase.phase,
                    'status': phase.status,
                    'submitted_at': phase.submitted_at.isoformat() if phase.submitted_at else None,
                }
                for phase in proposal.phases.order_by(ProposalPhase.id)
            ],
            'instruments': [
                {
                    'instrument': pi.instrument.code,
                    'status': pi.status,
                    'phase': pi.phase,
                    'confirmed_at': pi.confirmed_at.isoformat() if pi.confirmed_at else None,
                    'scheduling_feedback': pi.scheduling_feedback or {},
                }
                for pi in proposal.instruments.order_by(ProposalInstrument.id)
            ],
        }
        if scheduler_mode:
            assignment = proposal.instruments.filter_by(instrument_id=instrument.id).first()
            proposal_data['assignment'] = {
                'status': assignment.status,
                'form_data': assignment.form_data,
                'scheduling_feedback': assignment.scheduling_feedback,
            }
        output.append(proposal_data)
    return jsonify(output)


def _resolve_initial_state(proposal_type: ProposalType):
    initial = (
        WorkflowState.query.filter_by(workflow_id=proposal_type.workflow_id)
        .order_by(WorkflowState.id)
        .first()
    )
    if initial is None:
        raise ValueError('Workflow has no states configured')
    return initial


def _copy_without_uploads(value):
    """Keep form answers but require original files to be uploaded again."""
    if isinstance(value, dict):
        if 'data_url' in value and ('name' in value or 'type' in value):
            return None
        return {
            key: copied
            for key, item in value.items()
            if key != '__attachments__'
            for copied in [_copy_without_uploads(item)]
            if copied is not None
        }
    if isinstance(value, list):
        return [copied for item in value for copied in [_copy_without_uploads(item)] if copied is not None]
    return value


@bp.route('/', methods=['POST'])
@token_required
def create_proposal(current_user):
    """Creates a new proposal with Phase 1 payload and instrument selections."""
    data = request.get_json() or {}
    title = data.get('title')
    proposal_type_id = data.get('proposal_type_id')
    save_as_draft = data.get('save_as_draft') is True

    if not title and not save_as_draft:
        return jsonify({'message': '请填写提案名称'}), 400
    if not proposal_type_id:
        return jsonify({'message': '请选择提案类型'}), 400

    proposal_type = ProposalType.query.get(proposal_type_id)
    if proposal_type is None:
        return jsonify({'message': '提案类型无效'}), 400

    initial_state = _resolve_initial_state(proposal_type)
    metadata = dict(data.get('meta') or {})
    # Review disclosure is controlled only by the administrator endpoint.
    metadata.pop('review_visibility', None)

    proposal = Proposal(
        title=str(title or '未命名提案').strip() or '未命名提案',
        abstract=data.get('abstract', ''),
        data=metadata,
        author=current_user,
        proposal_type=proposal_type,
        current_state_id=initial_state.id,
    )
    db.session.add(proposal)

    # Phase payloads（支持多阶段结构）
    raw_phase_payload = data.get('phase_payload', {}) or {}
    if 'phase1' in raw_phase_payload or 'phase2' in raw_phase_payload:
        phase_items = raw_phase_payload.items()
    else:
        phase_items = [('phase1', raw_phase_payload)]

    for phase_name, phase_data in phase_items:
        status = phase_data.get('status', 'draft')
        submitted = datetime.utcnow() if status == 'submitted' else None
        deadline = phase_data.get('deadline')
        if isinstance(deadline, str):
            try:
                deadline = datetime.fromisoformat(deadline)
            except ValueError:
                deadline = None
        payload_data = phase_data.get('data', {}) or {}
        attachments = phase_data.get('attachments')
        if attachments:
            payload_data = dict(payload_data)
            payload_data['__attachments__'] = attachments
        phase = ProposalPhase(
            proposal=proposal,
            phase=phase_name,
            status=status,
            opened_at=datetime.utcnow(),
            submitted_at=submitted,
            payload=payload_data,
            notes=phase_data.get('notes'),
            deadline=deadline,
        )
        db.session.add(phase)

    # Instrument entries
    instruments_payload = data.get('instruments', [])
    if not instruments_payload and not save_as_draft:
        return jsonify({'message': '请至少选择一项仪器设备'}), 400

    try:
        for instrument_entry in instruments_payload:
            code = instrument_entry.get('instrument_code')
            instrument = Instrument.query.filter_by(code=code).first()
            if instrument is None:
                raise ValueError(f'Instrument {code} not found')

            form_data = instrument_entry.get('form_data', {}) or {}
            attachments = instrument_entry.get('attachments')
            if attachments:
                form_data['__attachments__'] = attachments

            proposal_instrument = ProposalInstrument(
                proposal=proposal,
                instrument=instrument,
                phase='phase1',
                status=instrument_entry.get('status', 'submitted'),
                form_data=form_data,
            )
            db.session.add(proposal_instrument)
    except ValueError as exc:
        db.session.rollback()
        return jsonify({'message': str(exc)}), 400

    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        return jsonify({'message': 'Failed to create proposal', 'detail': str(exc)}), 500

    return (
        jsonify(
            {
                'message': 'Proposal created successfully',
                'id': proposal.id,
                'initial_state': initial_state.name,
            }
        ),
        201,
    )


@bp.route('/<int:id>/copy-as-draft', methods=['POST'])
@token_required
def copy_rejected_proposal(current_user, id):
    """Create a new private draft from the owner's rejected DSL application."""
    source = Proposal.query.get_or_404(id)
    if source.user_id != current_user.id:
        return jsonify({'message': '只能复制本人提案'}), 403
    if not source.current_state or source.current_state.name != '已驳回':
        return jsonify({'message': '只能基于已驳回提案重新申请'}), 400
    if not source.proposal_type.name.startswith('DSL '):
        return jsonify({'message': '当前提案类型不支持复制申请'}), 400
    source_phase = source.phases.filter_by(phase='phase1').first()
    if source_phase is None:
        return jsonify({'message': '原提案缺少申请内容，无法复制'}), 409

    draft = Proposal(
        title=source.title,
        abstract=source.abstract,
        author=current_user,
        proposal_type=source.proposal_type,
        current_state=WorkflowState.query.filter_by(
            workflow_id=source.proposal_type.workflow_id, name='草稿'
        ).one(),
        data={'copied_from_proposal_id': source.id},
    )
    db.session.add(draft)
    db.session.add(ProposalPhase(
        proposal=draft,
        phase='phase1',
        status='draft',
        opened_at=datetime.utcnow(),
        payload=_copy_without_uploads(source_phase.payload or {}),
    ))
    for original in source.instruments.filter_by(phase='phase1').all():
        db.session.add(ProposalInstrument(
            proposal=draft,
            instrument=original.instrument,
            phase='phase1',
            status='draft',
            form_data=_copy_without_uploads(original.form_data or {}),
        ))
    db.session.commit()
    return jsonify({'id': draft.id, 'source_id': source.id, 'message': '新草稿已创建，请核对内容并重新上传附件'}), 201


@bp.route('/<int:id>', methods=['GET'])
@token_required
def get_proposal(current_user, id):
    """Gets a single proposal, ensuring the user has access."""
    proposal = Proposal.query.get_or_404(id)

    if not _can_view_proposal(current_user, proposal):
        return jsonify({'message': '无权查看此提案'}), 403

    workflow = proposal.proposal_type.workflow
    application_phase = proposal.phases.filter_by(phase='phase1').first()
    workflow_definition = workflow.definition or {}
    initial_state_name = workflow_definition.get('initial_state')
    initial_state = WorkflowState.query.filter_by(
        workflow_id=workflow.id, name=initial_state_name
    ).first()
    instrument_forms = {}
    for proposal_instrument in proposal.instruments.order_by(ProposalInstrument.id):
        template = FormTemplate.query.filter_by(
            instrument_id=proposal_instrument.instrument_id,
            phase=proposal_instrument.phase,
        ).order_by(FormTemplate.version.desc()).first()
        instrument_forms[proposal_instrument.instrument.code] = _serialize_template(template)

    review_type = _review_type(proposal)
    visible_reviews = [_serialize_review(review) for review in _visible_reviews_for_user(current_user, proposal)]

    assignments = []
    if current_user.has_role('Admin'):
        assignments = [
            {
                'id': item.id,
                'review_type': item.review_type,
                'status': item.status,
                'reviewer': {
                    'id': item.reviewer.id,
                    'username': item.reviewer.username,
                    'email': item.reviewer.email,
                    'roles': [role.name for role in item.reviewer.roles],
                },
            }
            for item in proposal.reviews.order_by(ProposalReview.created_at)
        ]

    proposal_data = {
        'id': proposal.id,
        'title': proposal.title,
        'abstract': proposal.abstract,
        'submitted_at': (
            application_phase.submitted_at.isoformat()
            if application_phase and application_phase.submitted_at else None
        ),
        'author': {
            'id': proposal.author.id,
            'username': proposal.author.username,
            'email': proposal.author.email,
        },
        'data': proposal.data,
        'status': proposal.current_state.name if proposal.current_state else 'N/A',
        'proposal_type': {
            'id': proposal.proposal_type.id,
            'name': proposal.proposal_type.name,
            'description': proposal.proposal_type.description,
        },
        'workflow': {
            'id': workflow.id,
            'name': workflow.name,
            'definition': workflow_definition,
        },
        'phases': [
            {
                'id': phase.id,
                'phase': phase.phase,
                'status': phase.status,
                'payload': phase.payload,
                'submitted_at': phase.submitted_at.isoformat() if phase.submitted_at else None,
            }
            for phase in proposal.phases.order_by(ProposalPhase.id)
        ],
        'instruments': [
            {
                'id': pi.id,
                'instrument': {'code': pi.instrument.code, 'name': pi.instrument.name},
                'status': pi.status,
                'phase': pi.phase,
                'form_data': pi.form_data,
                'scheduling_feedback': pi.scheduling_feedback,
                'confirmed_at': pi.confirmed_at.isoformat() if pi.confirmed_at else None,
            }
            for pi in proposal.instruments.order_by(ProposalInstrument.id)
        ],
        'forms': {
            'application': _serialize_template(initial_state.form_template if initial_state else None),
            'current_state': _serialize_template(
                proposal.current_state.form_template if proposal.current_state else None
            ),
            'instruments': instrument_forms,
        },
        'history': [
            {
                'id': item.id,
                'from_state': item.from_state,
                'to_state': item.to_state,
                'transition_name': item.transition_name,
                'acted_by': item.acted_by,
                'acted_at': item.acted_at.isoformat() if item.acted_at else None,
            }
            for item in proposal.state_history.order_by(ProposalStateHistory.acted_at)
        ],
        'reviews': visible_reviews,
        'final_decision': _rejection_notice(proposal),
        'review_visibility': 'visible' if _reviews_released_to_applicant(proposal) else 'hidden',
        'review_progress': _review_progress(proposal),
        'assignments': assignments,
        'permissions': {
            'is_owner': proposal.user_id == current_user.id,
            'is_admin': current_user.has_role('Admin'),
            'can_manage': current_user.has_role('Admin'),
            'can_edit': proposal.user_id == current_user.id and (
                proposal.current_state is None
                or proposal.current_state.name in ('草稿', '待修改', 'Draft')
                or any(phase.status == 'draft' for phase in proposal.phases.all())
            ),
            'can_download': True,
            'can_review': _can_review(current_user, proposal, review_type),
            'can_manage_data': (
                (current_user.has_role('Proposal Manager') or current_user.has_role('Admin'))
                and _is_data_allocation_candidate(proposal)
            ),
            'can_allocate_data': (
                (current_user.has_role('Proposal Manager') or current_user.has_role('Admin'))
                and _can_allocate_data(proposal)
            ),
            'review_type': review_type,
        },
    }
    return jsonify(proposal_data)


@bp.route('/<int:id>/document', methods=['GET'])
@token_required
def download_proposal_document(current_user, id):
    """Download the system-generated proposal record as a PDF."""
    proposal = Proposal.query.get_or_404(id)
    if not _can_view_proposal(current_user, proposal):
        return jsonify({'message': '无权下载此提案文件'}), 403
    response = make_response(_build_proposal_pdf(proposal, _visible_reviews_for_user(current_user, proposal)))
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = (
        f'attachment; filename="RPS-{proposal.id:05d}-proposal.pdf"'
    )
    response.headers['Cache-Control'] = 'no-store'
    return response


@bp.route('/<int:id>/reviews', methods=['POST'])
@token_required
def submit_review(current_user, id):
    """Save the current expert's structured review without advancing the workflow."""
    proposal = Proposal.query.get_or_404(id)
    review_type = _review_type(proposal)
    if not _can_review(current_user, proposal, review_type):
        return jsonify({'message': '当前角色不能评审此阶段的提案'}), 403

    data = request.get_json() or {}
    scores = data.get('scores') or {}
    if not isinstance(scores, dict) or not scores:
        return jsonify({'message': '请至少填写一项评分'}), 400
    try:
        normalized_scores = {key: int(value) for key, value in scores.items()}
    except (TypeError, ValueError):
        return jsonify({'message': '评分必须为整数'}), 400
    if any(score < 1 or score > 5 for score in normalized_scores.values()):
        return jsonify({'message': '评分须在 1 至 5 分之间'}), 400

    recommendation = data.get('recommendation')
    allowed_recommendations = ('pass', 'reject') if _is_dsl_proposal(proposal) else ('pass', 'revise', 'reject')
    if recommendation not in allowed_recommendations:
        return jsonify({'message': '请选择评审建议'}), 400
    comments = str(data.get('comments') or '').strip()
    if not comments:
        return jsonify({'message': '请填写评审意见'}), 400

    review = ProposalReview.query.filter_by(
        proposal_id=proposal.id,
        reviewer_id=current_user.id,
        review_type=review_type,
    ).first()
    if review is None:
        review = ProposalReview(
            proposal=proposal,
            reviewer=current_user,
            review_type=review_type,
        )
        db.session.add(review)
    review.status = 'submitted'
    review.scores = normalized_scores
    review.recommendation = recommendation
    review.comments = comments
    review.submitted_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': '评审意见已提交', 'review': _serialize_review(review)})


@bp.route('/<int:id>/reviews/visibility', methods=['PATCH'])
@token_required
def set_review_visibility(current_user, id):
    """Let an administrator explicitly release or hide submitted reviews for the applicant."""
    if not current_user.has_role('Admin'):
        return jsonify({'message': '仅系统管理员可设置评审意见公开范围'}), 403
    proposal = Proposal.query.get_or_404(id)
    if not _is_submitted_proposal(proposal):
        return jsonify({'message': '草稿不需要公开评审意见'}), 400
    visible = (request.get_json() or {}).get('visible')
    if not isinstance(visible, bool):
        return jsonify({'message': 'visible 必须为布尔值'}), 400
    proposal.data = {**(proposal.data or {}), 'review_visibility': 'visible' if visible else 'hidden'}
    db.session.commit()
    return jsonify({'message': '评审意见公开范围已更新', 'review_visibility': proposal.data['review_visibility']})


@bp.route('/<int:id>/reviewers', methods=['POST'])
@token_required
def assign_reviewer(current_user, id):
    """Assign the current review stage to one eligible expert."""
    if not current_user.has_role('Admin'):
        return jsonify({'message': '仅系统管理员可分配评审专家'}), 403
    proposal = Proposal.query.get_or_404(id)
    review_type = _review_type(proposal)
    if review_type is None:
        return jsonify({'message': '当前提案不在可分配的评审或决策阶段'}), 400

    data = request.get_json() or {}
    reviewer = User.query.get(data.get('reviewer_id'))
    if reviewer is None:
        return jsonify({'message': '未找到评审用户'}), 404
    required_role = {
        'technical': 'Technical Expert',
        'scientific': 'Reviewer',
        'committee': 'Panel Chair',
    }[review_type]
    if not reviewer.has_role(required_role):
        return jsonify({'message': '所选用户不具备当前阶段所需角色'}), 400
    if reviewer.id == proposal.user_id:
        return jsonify({'message': '提案者不能评审自己的提案'}), 400

    assignment = ProposalReview.query.filter_by(
        proposal_id=proposal.id,
        reviewer_id=reviewer.id,
        review_type=review_type,
    ).first()
    if assignment is None:
        assignment = ProposalReview(
            proposal=proposal,
            reviewer=reviewer,
            review_type=review_type,
            status='assigned',
        )
        db.session.add(assignment)
    db.session.commit()
    return jsonify({'message': '评审专家已分配', 'assignment': {
        'id': assignment.id,
        'review_type': assignment.review_type,
        'status': assignment.status,
        'reviewer': {'id': reviewer.id, 'username': reviewer.username},
    }})


@bp.route('/<int:id>', methods=['PATCH'])
@token_required
def update_proposal(current_user, id):
    """Allow an owner to edit an unsubmitted or revision-stage proposal."""
    proposal = Proposal.query.get_or_404(id)
    editable = proposal.user_id == current_user.id and (
        proposal.current_state is None
        or proposal.current_state.name in ('草稿', '待修改', 'Draft')
        or any(phase.status == 'draft' for phase in proposal.phases.all())
    )
    if not editable:
        return jsonify({'message': '当前状态下不能编辑此提案'}), 403

    data = request.get_json() or {}
    title = str(data.get('title', proposal.title)).strip()
    if not title and proposal.current_state and proposal.current_state.name not in ('草稿', 'Draft'):
        return jsonify({'message': '请填写提案名称'}), 400
    proposal.title = title or '未命名提案'
    proposal.abstract = data.get('abstract', proposal.abstract)

    phase_payload = data.get('phase_payload')
    if phase_payload is not None:
        phase = proposal.phases.filter_by(phase='phase1').first()
        if phase is None:
            phase = ProposalPhase(proposal=proposal, phase='phase1', status='draft')
            db.session.add(phase)
        phase.payload = phase_payload

    draft_state = proposal.current_state and proposal.current_state.name in ('草稿', 'Draft')
    if draft_state and 'instruments' in data:
        requested = data['instruments'] or []
        requested_codes = [entry.get('instrument_code') for entry in requested]
        if len(requested_codes) != len(set(requested_codes)):
            return jsonify({'message': '同一仪器不能重复选择'}), 400
        for existing in proposal.instruments.all():
            if existing.instrument.code not in requested_codes:
                db.session.delete(existing)
        for entry in requested:
            code = entry.get('instrument_code')
            instrument = Instrument.query.filter_by(code=code).first()
            if instrument is None:
                return jsonify({'message': f'未找到仪器 {code}'}), 400
            if not proposal.instruments.filter_by(instrument_id=instrument.id).first():
                db.session.add(ProposalInstrument(
                    proposal=proposal, instrument=instrument, phase='phase1',
                    status='draft', form_data={},
                ))
        db.session.flush()

    for entry in data.get('instruments', []):
        code = entry.get('instrument_code')
        proposal_instrument = next(
            (item for item in proposal.instruments.all() if item.instrument.code == code),
            None,
        )
        if proposal_instrument is not None and 'form_data' in entry:
            proposal_instrument.form_data = entry['form_data'] or {}

    db.session.commit()
    return jsonify({'message': '提案草稿已保存'})


@bp.route('/<int:id>/phase', methods=['PATCH'])
@token_required
def update_phase(current_user, id):
    """Update Phase payload or confirmation status."""
    proposal = Proposal.query.get_or_404(id)
    if proposal.user_id != current_user.id:
        return jsonify({'message': '无权修改此提案'}), 403

    data = request.get_json() or {}
    phase_name = data.get('phase')
    if not phase_name:
        return jsonify({'message': 'phase is required'}), 400

    phase = proposal.phases.filter_by(phase=phase_name).first()
    if phase is None:
        return jsonify({'message': f'Phase {phase_name} not found'}), 404

    status = data.get('status')
    if status:
        phase.status = status
        if status == 'submitted' and phase.submitted_at is None:
            phase.submitted_at = datetime.utcnow()
    payload = data.get('payload')
    if payload is not None:
        phase.payload = payload
    phase.notes = data.get('notes', phase.notes)

    db.session.commit()
    return jsonify({'message': 'Phase updated successfully'})


@bp.route('/<int:id>/instruments/<string:instrument_code>/feedback', methods=['POST'])
@token_required
def submit_instrument_feedback(current_user, id, instrument_code):
    """Instrument schedulers submit scheduling feedback."""
    if not current_user.has_role('Instrument Scheduler') and not current_user.has_role('Admin'):
        return jsonify({'message': 'Instrument Scheduler role required'}), 403

    proposal = Proposal.query.get_or_404(id)
    if not _is_opportunity_proposal(proposal):
        return jsonify({'message': '仅机遇观测提案需要观测编排与执行反馈'}), 400
    if not proposal.current_state or proposal.current_state.name != '已推送观测编排':
        return jsonify({'message': '仅观测编排阶段可记录安排或提交执行结果'}), 400
    instrument = Instrument.query.filter_by(code=instrument_code).first()
    if instrument is None:
        return jsonify({'message': 'Instrument not found'}), 404

    proposal_instrument = proposal.instruments.filter_by(instrument_id=instrument.id).first()
    if proposal_instrument is None:
        return jsonify({'message': 'Proposal instrument entry not found'}), 404

    data = request.get_json() or {}
    payload = dict(data.get('payload') or {})
    status = payload.get('status')
    if status not in {'scheduled', 'completed', 'unable'}:
        return jsonify({'message': '请选择观测状态'}), 400
    if not str(payload.get('summary') or '').strip():
        return jsonify({'message': '请填写观测安排或最终执行结果'}), 400
    if status == 'completed':
        payload['completed_at'] = datetime.utcnow().isoformat()
    else:
        payload.pop('completed_at', None)
    feedback = InstrumentFeedback(
        proposal_instrument=proposal_instrument,
        scheduler=current_user,
        payload=payload,
        comment=data.get('comment'),
        status=status,
        submitted_at=datetime.utcnow(),
    )
    proposal_instrument.scheduling_feedback = payload
    proposal_instrument.status = status
    db.session.add(feedback)
    db.session.commit()

    return jsonify({'message': 'Feedback submitted'})


@bp.route('/<int:id>/instruments/<string:instrument_code>/data-allocation', methods=['POST'])
@token_required
def allocate_instrument_data(current_user, id, instrument_code):
    """Proposal managers link observation products and grant proposer access."""
    if not current_user.has_role('Proposal Manager') and not current_user.has_role('Admin'):
        return jsonify({'message': '仅提案管理员可分配观测数据'}), 403

    proposal = Proposal.query.get_or_404(id)
    if not _can_allocate_data(proposal):
        return jsonify({'message': '仅可向等待分配观测数据的研究提案分配数据'}), 400

    instrument = Instrument.query.filter_by(code=instrument_code).first()
    if instrument is None:
        return jsonify({'message': '未找到对应仪器'}), 404
    proposal_instrument = proposal.instruments.filter_by(instrument_id=instrument.id).first()
    if proposal_instrument is None:
        return jsonify({'message': '此提案未申请该仪器'}), 404

    data = request.get_json() or {}
    observation_id = str(data.get('observation_id') or '').strip()
    product_name = str(data.get('product_name') or '').strip()
    if not observation_id or not product_name:
        return jsonify({'message': '请填写数据编号和数据产品名称'}), 400

    data_url = str(data.get('data_url') or '').strip()
    if not data_url:
        csv_content = (
            'proposal_id,observation_id,instrument,status\n'
            f'{proposal.id},{observation_id},{instrument.code},temporary_demo_data\n'
        )
        data_url = 'data:text/csv;charset=utf-8,' + quote(csv_content)

    product = {
        'name': product_name,
        'observation_id': observation_id,
        'summary': str(data.get('summary') or '观测数据已完成关联，并向提案者开放访问。').strip(),
        'format': str(data.get('format') or 'CSV').strip(),
        'size': str(data.get('size') or '演示数据').strip(),
        'description': str(data.get('description') or '原型确认使用的临时观测数据。').strip(),
        'data_url': data_url,
    }
    existing = dict(proposal_instrument.scheduling_feedback or {})
    products = list(existing.get('data_products') or [])
    products = [item for item in products if item.get('name') != product_name]
    products.append(product)
    feedback = {
        **existing,
        'status': 'data_ready',
        'observation_id': observation_id,
        'summary': str(data.get('summary') or '观测数据已完成关联，并向提案者开放访问。').strip(),
        'visibility_window': str(data.get('visibility_window') or existing.get('visibility_window') or '—'),
        'completed_at': str(data.get('completed_at') or existing.get('completed_at') or datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')),
        'allocated_at': datetime.utcnow().isoformat(),
        'allocated_by': current_user.username,
        'data_products': products,
    }
    proposal_instrument.scheduling_feedback = feedback
    proposal_instrument.status = 'data_ready'
    db.session.flush()

    transition_by_state = {
        '待分配观测数据': 'grant_data',
    }
    transition_name = transition_by_state.get(proposal.current_state.name if proposal.current_state else '')
    if transition_name:
        engine = WorkflowEngine(db.session)
        allowed_names = {item['name'] for item in engine.get_allowed_actions(proposal.id, current_user)}
        if transition_name in allowed_names:
            engine.execute_transition(proposal.id, transition_name, current_user)
        else:
            db.session.commit()
    else:
        db.session.commit()

    return jsonify({
        'message': '观测数据已分配并向提案者开放',
        'feedback': feedback,
        'proposal_state': proposal.current_state.name if proposal.current_state else None,
    })


@bp.route('/<int:id>/instruments/<string:instrument_code>/data-allocation', methods=['DELETE'])
@token_required
def revoke_instrument_data(current_user, id, instrument_code):
    """Revoke one product; reopen data allocation when no products remain."""
    if not current_user.has_role('Proposal Manager') and not current_user.has_role('Admin'):
        return jsonify({'message': '仅提案管理员可取消数据分配'}), 403

    proposal = Proposal.query.get_or_404(id)
    if not _can_allocate_data(proposal):
        return jsonify({'message': '当前提案不能取消数据分配'}), 400

    instrument = Instrument.query.filter_by(code=instrument_code).first()
    if instrument is None:
        return jsonify({'message': '未找到对应仪器'}), 404
    proposal_instrument = proposal.instruments.filter_by(instrument_id=instrument.id).first()
    if proposal_instrument is None:
        return jsonify({'message': '此提案未申请该仪器'}), 404

    product_name = str((request.get_json(silent=True) or {}).get('product_name') or '').strip()
    if not product_name:
        return jsonify({'message': '请选择要取消分配的数据产品'}), 400
    feedback = dict(proposal_instrument.scheduling_feedback or {})
    products = list(feedback.get('data_products') or [])
    remaining = [item for item in products if item.get('name') != product_name]
    if len(remaining) == len(products):
        return jsonify({'message': '未找到已分配的数据产品'}), 404

    if remaining:
        feedback['data_products'] = remaining
        latest_observation_id = remaining[-1].get('observation_id')
        if latest_observation_id:
            feedback['observation_id'] = latest_observation_id
        if remaining[-1].get('summary'):
            feedback['summary'] = remaining[-1]['summary']
        proposal_instrument.scheduling_feedback = feedback
    else:
        # Keep unrelated instrument feedback, but remove all allocation-only details.
        for key in ('status', 'observation_id', 'summary', 'visibility_window', 'completed_at',
                    'allocated_at', 'allocated_by', 'data_products'):
            feedback.pop(key, None)
        proposal_instrument.scheduling_feedback = feedback
        proposal_instrument.status = 'scheduled'

    db.session.flush()
    previous_state = proposal.current_state.name if proposal.current_state else None
    if not _has_allocated_data(proposal) and previous_state in {'数据已授权', '已完成'}:
        waiting_state = WorkflowState.query.filter_by(
            workflow_id=proposal.proposal_type.workflow_id, name='待分配观测数据'
        ).first()
        if waiting_state is None:
            db.session.rollback()
            return jsonify({'message': '流程缺少待分配观测数据状态，取消失败'}), 409
        proposal.current_state = waiting_state
    db.session.add(ProposalStateHistory(
        proposal=proposal,
        from_state=previous_state,
        to_state=proposal.current_state.name if proposal.current_state else previous_state,
        transition_name='revoke_data',
        acted_by=current_user.username,
        meta={'instrument_code': instrument_code, 'product_name': product_name},
    ))
    db.session.commit()
    return jsonify({
        'message': '数据分配已取消',
        'feedback': proposal_instrument.scheduling_feedback,
        'proposal_state': proposal.current_state.name if proposal.current_state else None,
    })


@bp.route('/<int:id>/instruments/<string:instrument_code>/confirm', methods=['POST'])
@token_required
def confirm_instrument_allocation(current_user, id, instrument_code):
    """Proposer confirms instrument scheduling."""
    proposal = Proposal.query.get_or_404(id)
    if proposal.user_id != current_user.id:
        return jsonify({'message': '无权执行此操作'}), 403

    instrument = Instrument.query.filter_by(code=instrument_code).first()
    if instrument is None:
        return jsonify({'message': 'Instrument not found'}), 404

    proposal_instrument = proposal.instruments.filter_by(instrument_id=instrument.id).first()
    if proposal_instrument is None:
        return jsonify({'message': 'Proposal instrument entry not found'}), 404

    data = request.get_json() or {}
    proposal_instrument.status = data.get('status', 'confirmed')
    proposal_instrument.confirmed_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'message': 'Instrument allocation confirmed'})


def _has_final_observation_feedback(proposal):
    instruments = list(proposal.instruments)
    return bool(instruments) and all(
        feedback.get('status') in {'completed', 'unable'}
        and str(feedback.get('summary') or '').strip()
        for item in instruments
        for feedback in [item.scheduling_feedback or {}]
    )


def _has_allocated_data(proposal):
    return any(
        (item.scheduling_feedback or {}).get('data_products')
        for item in proposal.instruments
    )


_DECISION_OUTCOMES = {
    'committee_approve': 'pass',
    'committee_reject': 'reject',
    'committee_revision': 'revise',
    'decision_approve': 'pass',
    'decision_reject': 'reject',
    'decision_revision': 'revise',
}


@bp.route('/<int:id>/transitions', methods=['GET'])
@token_required
def list_transitions(current_user, id):
    proposal = Proposal.query.get_or_404(id)
    if not _can_view_proposal(current_user, proposal):
        return jsonify({'message': '无权查看此提案的流程操作'}), 403

    engine = WorkflowEngine(db.session)
    transitions = engine.get_allowed_actions(proposal.id, current_user)
    state = proposal.current_state.name if proposal.current_state else ''
    transitions = [item for item in transitions if not _is_review_stage_return(proposal, item['name'])]
    if proposal.user_id != current_user.id:
        transitions = [item for item in transitions if item['name'] not in {'submit', 'submit_phase1', 'resubmit'}]
    if state in {'待技术评审', '待科学评审'}:
        progress = _review_progress(proposal)
        transitions = [item for item in transitions if item['name'] not in {'technical_pass', 'science_complete'} or (
            current_user.has_role('Admin') and progress and progress['ready_to_advance']
        )]
    if proposal.proposal_type.name.startswith('DSL '):
        transitions = [item for item in transitions if item['name'] != 'complete']
    if state == '待最终决策' and not _can_review(current_user, proposal, 'committee'):
        transitions = [item for item in transitions if item['name'] not in _DECISION_OUTCOMES]
    return jsonify({'transitions': transitions})


@bp.route('/<int:id>/transitions', methods=['POST'])
@token_required
def trigger_transition(current_user, id):
    proposal = Proposal.query.get_or_404(id)
    if not _can_view_proposal(current_user, proposal):
        return jsonify({'message': '无权执行此提案的流程操作'}), 403

    data = request.get_json() or {}
    transition_name = data.get('transition')
    if not transition_name:
        return jsonify({'message': 'transition is required'}), 400

    if transition_name in {'submit', 'submit_phase1', 'resubmit'} and proposal.user_id != current_user.id:
        return jsonify({'message': '仅申请人可提交本人提案'}), 403

    state = proposal.current_state.name if proposal.current_state else ''
    if transition_name == 'complete' and proposal.proposal_type.name.startswith('DSL '):
        return jsonify({'message': '该提案已在数据授权或最终执行结果发布时办结，无需申请人确认'}), 400
    if _is_review_stage_return(proposal, transition_name):
        return jsonify({'message': '评审和最终决策阶段不能退回修改；只有形式审查可退回申请人'}), 400
    if state in {'待技术评审', '待科学评审'} and transition_name in {'technical_pass', 'science_complete'}:
        if not current_user.has_role('Admin'):
            return jsonify({'message': '仅系统管理员可在本阶段评审全部提交后推进流程'}), 403
        progress = _review_progress(proposal)
        if not progress or not progress['ready_to_advance']:
            return jsonify({'message': '请先分配评审专家，并等待本阶段所有专家提交评审意见'}), 400
    if state in {'草稿', 'Draft'} and transition_name in {'submit', 'submit_phase1'}:
        if not proposal.title.strip() or proposal.title == '未命名提案' or not proposal.abstract.strip() or proposal.instruments.count() == 0:
            return jsonify({'message': '请填写提案名称、摘要并选择仪器后再正式提交'}), 400
        for instrument_entry in proposal.instruments:
            instrument_entry.status = 'submitted'
    if transition_name == 'record_feedback' and state == '已推送观测编排' and not _has_final_observation_feedback(proposal):
        return jsonify({'message': '请先填写最终执行结果，再发布并办结提案'}), 400
    if transition_name == 'grant_data' and state == '待分配观测数据' and not _has_allocated_data(proposal):
        return jsonify({'message': '请先选择数据产品并授权'}), 400
    if transition_name in _DECISION_OUTCOMES and state == '待最终决策':
        if not _can_review(current_user, proposal, 'committee'):
            return jsonify({'message': '仅获分配的科学委员会委员可提交最终决策'}), 403
        decision = (data.get('context') or {}).get('decision') or {}
        comments = str(decision.get('comments') or '').strip()
        try:
            priority = int(decision.get('priority'))
        except (TypeError, ValueError):
            priority = 0
        if priority not in range(1, 6) or not comments:
            return jsonify({'message': '请选择综合优先级并填写决策理由'}), 400
        review = ProposalReview.query.filter_by(
            proposal_id=proposal.id,
            reviewer_id=current_user.id,
            review_type='committee',
        ).first()
        review.status = 'submitted'
        review.scores = {'overall_priority': priority}
        review.recommendation = _DECISION_OUTCOMES[transition_name]
        review.comments = comments
        review.submitted_at = datetime.utcnow()

    engine = WorkflowEngine(db.session)
    try:
        result = engine.execute_transition(
            proposal_id=proposal.id,
            action_name=transition_name,
            actor=current_user,
            context=data.get('context', {}),
        )
    except PermissionError as exc:
        db.session.rollback()
        return jsonify({
            'message': str(exc),
            'error_type': 'permission_denied'
        }), 403
    except ValueError as exc:
        db.session.rollback()
        # 检查是否是验证错误
        error_msg = str(exc)
        if 'Validation failed' in error_msg or 'validation' in error_msg.lower():
            return jsonify({
                'message': error_msg,
                'error_type': 'validation_failed',
                'details': error_msg.split('\n')[1:] if '\n' in error_msg else []
            }), 400
        return jsonify({
            'message': error_msg,
            'error_type': 'workflow_error'
        }), 400
    except Exception as exc:
        db.session.rollback()
        return jsonify({
            'message': f'Unexpected error: {str(exc)}',
            'error_type': 'internal_error'
        }), 500

    return jsonify(result)
