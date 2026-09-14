from datetime import datetime

from flask import Blueprint, jsonify, request
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


def _can_view_proposal(current_user, proposal):
    if proposal.user_id == current_user.id:
        return True
    if current_user.has_role('Admin'):
        return _is_submitted_proposal(proposal)
    if current_user.has_role('Instrument Scheduler'):
        return True
    review_type = _review_type(proposal)
    if review_type and ProposalReview.query.filter_by(
        proposal_id=proposal.id,
        reviewer_id=current_user.id,
        review_type=review_type,
    ).first():
        return True
    return False


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
        ]
    elif scope == 'review_tasks':
        if current_user.has_role('Admin'):
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
            ]
    elif scope == 'feedback':
        if not any(current_user.has_role(role) for role in ('Admin', 'Technical Expert', 'Instrument Scheduler')):
            return jsonify({'message': '当前角色无权查看观测反馈'}), 403
        proposals = [proposal for proposal in Proposal.query.all() if _is_submitted_proposal(proposal)]
    elif scheduler_mode:
        instrument = Instrument.query.filter_by(code=instrument_code).first()
        if instrument is None:
            return jsonify({'message': '未找到对应仪器'}), 404
        assignments = ProposalInstrument.query.filter_by(instrument_id=instrument.id).all()
        proposals = [assignment.proposal for assignment in assignments]
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


@bp.route('/', methods=['POST'])
@token_required
def create_proposal(current_user):
    """Creates a new proposal with Phase 1 payload and instrument selections."""
    data = request.get_json() or {}
    title = data.get('title')
    proposal_type_id = data.get('proposal_type_id')

    if not title:
        return jsonify({'message': '请填写提案名称'}), 400
    if not proposal_type_id:
        return jsonify({'message': '请选择提案类型'}), 400

    proposal_type = ProposalType.query.get(proposal_type_id)
    if proposal_type is None:
        return jsonify({'message': '提案类型无效'}), 400

    initial_state = _resolve_initial_state(proposal_type)

    proposal = Proposal(
        title=title,
        abstract=data.get('abstract', ''),
        data=data.get('meta', {}),
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
    if not instruments_payload:
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
    is_privileged = current_user.has_role('Admin') or current_user.has_role('Panel Chair')
    visible_reviews = []
    for review in proposal.reviews.order_by(ProposalReview.created_at):
        if review.status == 'submitted' and (
            is_privileged or review.reviewer_id == current_user.id or review_type is None
        ):
            visible_reviews.append(_serialize_review(review))

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
                    'roles': [role.name for role in item.reviewer.roles],
                },
            }
            for item in proposal.reviews.order_by(ProposalReview.created_at)
            if item.review_type == review_type
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
            'review_type': review_type,
        },
    }
    return jsonify(proposal_data)


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
    if recommendation not in ('pass', 'revise', 'reject'):
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
        return jsonify({'message': '提案申请人不能评审自己的提案'}), 400

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
    if not title:
        return jsonify({'message': '请填写提案名称'}), 400
    proposal.title = title
    proposal.abstract = data.get('abstract', proposal.abstract)

    phase_payload = data.get('phase_payload')
    if phase_payload is not None:
        phase = proposal.phases.filter_by(phase='phase1').first()
        if phase is None:
            phase = ProposalPhase(proposal=proposal, phase='phase1', status='draft')
            db.session.add(phase)
        phase.payload = phase_payload

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
    instrument = Instrument.query.filter_by(code=instrument_code).first()
    if instrument is None:
        return jsonify({'message': 'Instrument not found'}), 404

    proposal_instrument = proposal.instruments.filter_by(instrument_id=instrument.id).first()
    if proposal_instrument is None:
        return jsonify({'message': 'Proposal instrument entry not found'}), 404

    data = request.get_json() or {}
    feedback = InstrumentFeedback(
        proposal_instrument=proposal_instrument,
        scheduler=current_user,
        payload=data.get('payload', {}),
        comment=data.get('comment'),
        status=data.get('status', 'submitted'),
        submitted_at=datetime.utcnow(),
    )
    proposal_instrument.scheduling_feedback = data.get('payload', {})
    proposal_instrument.status = data.get('status', proposal_instrument.status)
    db.session.add(feedback)
    db.session.commit()

    return jsonify({'message': 'Feedback submitted'})


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


@bp.route('/<int:id>/transitions', methods=['GET'])
@token_required
def list_transitions(current_user, id):
    proposal = Proposal.query.get_or_404(id)
    if not _can_view_proposal(current_user, proposal):
        return jsonify({'message': '无权查看此提案的流程操作'}), 403

    engine = WorkflowEngine(db.session)
    transitions = engine.get_allowed_actions(proposal.id, current_user)
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

    engine = WorkflowEngine(db.session)
    try:
        result = engine.execute_transition(
            proposal_id=proposal.id,
            action_name=transition_name,
            actor=current_user,
            context=data.get('context', {}),
        )
    except PermissionError as exc:
        return jsonify({
            'message': str(exc),
            'error_type': 'permission_denied'
        }), 403
    except ValueError as exc:
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
        return jsonify({
            'message': f'Unexpected error: {str(exc)}',
            'error_type': 'internal_error'
        }), 500

    return jsonify(result)
