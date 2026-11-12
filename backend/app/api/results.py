"""Publication lifecycle after a proposal has received observation data."""

import base64
import binascii
from datetime import datetime, timedelta
from io import BytesIO

from flask import Blueprint, current_app, jsonify, request, send_file
from sqlalchemy.exc import IntegrityError

from app import db
from app.api.auth import token_required
from app.core.seasons import format_beijing_datetime, parse_beijing_datetime
from app.models.models import Proposal, ResearchOutput, ResearchOutputComment

bp = Blueprint('results', __name__)


def _has_data(proposal):
    return any((item.scheduling_feedback or {}).get('data_products') for item in proposal.instruments)


def _ready_for_result(proposal):
    if not _has_data(proposal):
        return False
    name = proposal.proposal_type.name.lower()
    state = proposal.current_state.name if proposal.current_state else ''
    if '研究' in name or 'research' in name:
        return state in {'数据已授权', '已完成'}
    if '机遇' in name or 'opportunity' in name or 'too' in name:
        return state in {'执行反馈', '已完成'}
    return False


def _file(value):
    if not isinstance(value, dict):
        raise ValueError('请上传 PDF、DOC 或 DOCX 文件')
    name = str(value.get('name') or '').strip()
    data_url = str(value.get('data_url') or '')
    suffix = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
    if suffix not in {'pdf', 'doc', 'docx'} or ';base64,' not in data_url:
        raise ValueError('仅支持 PDF、DOC、DOCX 文件')
    try:
        content = base64.b64decode(data_url.split(';base64,', 1)[1], validate=True)
    except (ValueError, binascii.Error):
        raise ValueError('文件内容无效')
    if not content or len(content) > 20 * 1024 * 1024:
        raise ValueError('文件需大于 0 且不超过 20 MB')
    return {'name': name, 'data_url': data_url, 'size': len(content)}


def _date(value):
    return format_beijing_datetime(value) if value else None


def _status(output):
    if output.status == 'feedback_open' and datetime.utcnow() >= output.feedback_deadline:
        return 'revision_pending'
    return output.status


def _event(output, action, user):
    output.history = [*(output.history or []), {
        'action': action, 'by': user.username, 'at': datetime.utcnow().isoformat(),
    }]


def _serialize(output, user, details=False):
    proposal = output.proposal
    status = _status(output)
    owner = proposal.user_id == user.id
    committee = user.has_role('Panel Chair') and not owner
    data = {
        'id': output.id, 'proposal_id': proposal.id, 'proposal_title': proposal.title,
        'proposal_type': proposal.proposal_type.name, 'author': proposal.author.username,
        'title': output.title, 'summary': output.summary, 'status': status,
        'submitted_at': _date(output.submitted_at), 'feedback_deadline': _date(output.feedback_deadline),
        'comment_count': output.comments.count(),
        'can_comment': status == 'feedback_open' and not owner,
        'can_revise': owner and status in {'revision_pending', 'changes_requested'},
        'can_decide': committee and status == 'committee_pending',
        'can_submit_journal': owner and status == 'approved_to_submit',
        'can_publish_final': owner and status == 'journal_submitted',
    }
    if details:
        data.update({
            'draft_file': {'name': output.draft_file['name'], 'size': output.draft_file['size']},
            'revised_file': ({'name': output.revised_file['name'], 'size': output.revised_file['size']}
                             if output.revised_file else None),
            'final_file': ({'name': output.final_file['name'], 'size': output.final_file['size']}
                           if output.final_file else None),
            'revision_note': output.revision_note,
            'committee_note': output.committee_note,
            'committee_decider': output.committee_decider.username if output.committee_decider else None,
            'journal_name': output.journal_name,
            'journal_submitted_at': _date(output.journal_submitted_at),
            'journal_accepted_at': _date(output.journal_accepted_at),
            'publication_reference': output.publication_reference,
            'published_at': _date(output.published_at),
            'comments': [{
                'id': item.id, 'author': item.author.username, 'body': item.body,
                'created_at': _date(item.created_at),
            } for item in output.comments.order_by(ResearchOutputComment.created_at)],
            'history': output.history or [],
        })
    return data


@bp.route('/', methods=['GET'])
@token_required
def list_results(current_user):
    outputs = ResearchOutput.query.order_by(ResearchOutput.submitted_at.desc()).all()
    results = [_serialize(item, current_user) for item in outputs]
    return jsonify({'results': results, 'open_feedback_count': sum(item['status'] == 'feedback_open' for item in results)})


@bp.route('/proposal/<int:proposal_id>', methods=['GET'])
@token_required
def get_result(current_user, proposal_id):
    proposal = Proposal.query.get_or_404(proposal_id)
    output = proposal.research_output
    if output:
        return jsonify({'output': _serialize(output, current_user, details=True)})
    if proposal.user_id != current_user.id:
        return jsonify({'message': '成果尚未公开'}), 404
    return jsonify({'output': None, 'can_start': _ready_for_result(proposal),
                    'proposal': {'id': proposal.id, 'title': proposal.title}})


@bp.route('/proposal/<int:proposal_id>', methods=['POST'])
@token_required
def create_result(current_user, proposal_id):
    proposal = Proposal.query.get_or_404(proposal_id)
    if proposal.user_id != current_user.id:
        return jsonify({'message': '仅提案申请人可提交研究成果'}), 403
    if not _ready_for_result(proposal):
        return jsonify({'message': '提案须先办结并获得数据授权，才能提交研究成果'}), 409
    if proposal.research_output:
        return jsonify({'message': '该提案已有研究成果'}), 409
    data = request.get_json(silent=True) or {}
    title = str(data.get('title') or '').strip()
    summary = str(data.get('summary') or '').strip()
    if not title or not summary:
        return jsonify({'message': '请填写成果标题和摘要'}), 400
    try:
        draft_file = _file(data.get('draft_file'))
    except ValueError as exc:
        return jsonify({'message': str(exc)}), 400
    now = datetime.utcnow()
    output = ResearchOutput(proposal=proposal, title=title, summary=summary,
                            draft_file=draft_file, submitted_at=now,
                            feedback_deadline=now + timedelta(days=current_app.config.get('RESULT_FEEDBACK_DAYS', 7)))
    _event(output, 'submit_draft', current_user)
    db.session.add(output)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'message': '该提案已有研究成果'}), 409
    return jsonify({'output': _serialize(output, current_user, details=True)}), 201


@bp.route('/proposal/<int:proposal_id>/comments', methods=['POST'])
@token_required
def comment_result(current_user, proposal_id):
    output = ResearchOutput.query.filter_by(proposal_id=proposal_id).first_or_404()
    if output.proposal.user_id == current_user.id:
        return jsonify({'message': '成果作者不能给自己的成果提交公开反馈'}), 403
    if _status(output) != 'feedback_open':
        return jsonify({'message': '公开征求意见期已结束'}), 409
    body = str((request.get_json(silent=True) or {}).get('body') or '').strip()
    if not body or len(body) > 5000:
        return jsonify({'message': '请填写 1 至 5000 字的反馈意见'}), 400
    db.session.add(ResearchOutputComment(output=output, author=current_user, body=body))
    db.session.commit()
    return jsonify({'output': _serialize(output, current_user, details=True)}), 201


@bp.route('/proposal/<int:proposal_id>/revision', methods=['POST'])
@token_required
def revise_result(current_user, proposal_id):
    output = ResearchOutput.query.filter_by(proposal_id=proposal_id).first_or_404()
    if output.proposal.user_id != current_user.id:
        return jsonify({'message': '仅成果作者可提交修改稿'}), 403
    if _status(output) not in {'revision_pending', 'changes_requested'}:
        return jsonify({'message': '当前尚不能提交修改稿'}), 409
    data = request.get_json(silent=True) or {}
    note = str(data.get('revision_note') or '').strip()
    if not note:
        return jsonify({'message': '请说明对反馈意见的修改情况'}), 400
    try:
        revised_file = _file(data.get('revised_file'))
    except ValueError as exc:
        return jsonify({'message': str(exc)}), 400
    output.revised_file = revised_file
    output.revision_note = note
    output.revised_at = datetime.utcnow()
    output.status = 'committee_pending'
    _event(output, 'submit_revision', current_user)
    db.session.commit()
    return jsonify({'output': _serialize(output, current_user, details=True)})


@bp.route('/proposal/<int:proposal_id>/committee-decision', methods=['POST'])
@token_required
def decide_result(current_user, proposal_id):
    output = ResearchOutput.query.filter_by(proposal_id=proposal_id).first_or_404()
    if not current_user.has_role('Panel Chair') or output.proposal.user_id == current_user.id:
        return jsonify({'message': '仅非作者的科学委员会成员可作出认定'}), 403
    if output.status != 'committee_pending':
        return jsonify({'message': '当前成果不在科学委员会认定阶段'}), 409
    data = request.get_json(silent=True) or {}
    decision = data.get('decision')
    note = str(data.get('note') or '').strip()
    if decision not in {'approve', 'revise', 'reject'} or not note:
        return jsonify({'message': '请选择认定结果并填写意见'}), 400
    output.status = {'approve': 'approved_to_submit', 'revise': 'changes_requested', 'reject': 'rejected'}[decision]
    output.committee_note = note
    output.committee_decider = current_user
    output.committee_decided_at = datetime.utcnow()
    _event(output, f'committee_{decision}', current_user)
    db.session.commit()
    return jsonify({'output': _serialize(output, current_user, details=True)})


@bp.route('/proposal/<int:proposal_id>/journal-submission', methods=['POST'])
@token_required
def submit_to_journal(current_user, proposal_id):
    output = ResearchOutput.query.filter_by(proposal_id=proposal_id).first_or_404()
    if output.proposal.user_id != current_user.id:
        return jsonify({'message': '仅成果作者可登记投稿'}), 403
    if output.status != 'approved_to_submit':
        return jsonify({'message': '须经科学委员会同意后才能登记投稿'}), 409
    journal_name = str((request.get_json(silent=True) or {}).get('journal_name') or '').strip()
    if not journal_name:
        return jsonify({'message': '请填写投稿期刊'}), 400
    output.journal_name = journal_name
    output.journal_submitted_at = datetime.utcnow()
    output.status = 'journal_submitted'
    _event(output, 'journal_submitted', current_user)
    db.session.commit()
    return jsonify({'output': _serialize(output, current_user, details=True)})


@bp.route('/proposal/<int:proposal_id>/final-publication', methods=['POST'])
@token_required
def publish_final(current_user, proposal_id):
    output = ResearchOutput.query.filter_by(proposal_id=proposal_id).first_or_404()
    if output.proposal.user_id != current_user.id:
        return jsonify({'message': '仅成果作者可提交最终发表版'}), 403
    if output.status != 'journal_submitted':
        return jsonify({'message': '请先登记经批准的期刊投稿'}), 409
    data = request.get_json(silent=True) or {}
    reference = str(data.get('publication_reference') or '').strip()
    date_text = str(data.get('journal_accepted_at') or '').strip()
    try:
        accepted_at = parse_beijing_datetime(
            f'{date_text}T00:00' if len(date_text) == 10 else date_text
        )
    except (ValueError, TypeError):
        accepted_at = None
    accepted_day = _date(accepted_at)[:10] if accepted_at else None
    today = _date(datetime.utcnow())[:10]
    if not accepted_at or not reference or accepted_day > today:
        return jsonify({'message': '请填写有效的期刊接收时间及发表信息'}), 400
    if output.journal_submitted_at and accepted_day < _date(output.journal_submitted_at)[:10]:
        return jsonify({'message': '接收时间不能早于投稿时间'}), 400
    try:
        final_file = _file(data.get('final_file'))
    except ValueError as exc:
        return jsonify({'message': str(exc)}), 400
    output.journal_accepted_at = accepted_at
    output.publication_reference = reference
    output.final_file = final_file
    output.published_at = datetime.utcnow()
    output.status = 'published'
    _event(output, 'publish_final', current_user)
    db.session.commit()
    return jsonify({'output': _serialize(output, current_user, details=True)})


@bp.route('/proposal/<int:proposal_id>/files/<string:kind>', methods=['GET'])
@token_required
def download_file(current_user, proposal_id, kind):
    output = ResearchOutput.query.filter_by(proposal_id=proposal_id).first_or_404()
    if kind not in {'draft', 'revised', 'final'}:
        return jsonify({'message': '文件类型不存在'}), 404
    file_data = getattr(output, f'{kind}_file')
    if not file_data:
        return jsonify({'message': '文件尚未提交'}), 404
    content = base64.b64decode(file_data['data_url'].split(';base64,', 1)[1])
    return send_file(BytesIO(content), as_attachment=True, download_name=file_data['name'],
                     mimetype='application/octet-stream')
