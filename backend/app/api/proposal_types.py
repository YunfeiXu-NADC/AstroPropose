from flask import Blueprint, jsonify, request
from app import db
from app.models.models import ProposalType, Workflow
from app.api.auth import token_required, admin_required

bp = Blueprint('proposal_types', __name__)

@bp.route('/', methods=['GET'])
@token_required
def get_proposal_types(current_user):
    """Returns all available proposal types."""
    types = ProposalType.query.all()
    return jsonify([
        {
            'id': t.id,
            'name': t.name,
            'description': t.description,
            'workflow_id': t.workflow_id,
            'season_id': t.season_id,
        }
        for t in types
    ])


@bp.route('/', methods=['POST'])
@token_required
@admin_required
def create_proposal_type(current_user):
    data = request.get_json() or {}
    name = data.get('name')
    workflow_id = data.get('workflow_id')

    if not name or not workflow_id:
        return jsonify({'message': 'name and workflow_id are required'}), 400

    workflow = Workflow.query.get(workflow_id)
    if workflow is None:
        return jsonify({'message': 'Workflow not found'}), 404

    if ProposalType.query.filter_by(name=name).first():
        return jsonify({'message': 'Proposal type already exists'}), 409

    proposal_type = ProposalType(
        name=name,
        description=data.get('description', ''),
        workflow_id=workflow_id,
        season_id=data.get('season_id'),
    )
    db.session.add(proposal_type)
    db.session.commit()
    return jsonify({'message': 'Proposal type created', 'id': proposal_type.id}), 201


@bp.route('/<int:id>', methods=['PATCH'])
@token_required
@admin_required
def update_proposal_type(current_user, id):
    proposal_type = ProposalType.query.get_or_404(id)
    data = request.get_json() or {}

    if 'name' in data:
        existing = ProposalType.query.filter_by(name=data['name']).first()
        if existing and existing.id != proposal_type.id:
            return jsonify({'message': 'Proposal type already exists'}), 409
        proposal_type.name = data['name']

    if 'description' in data:
        proposal_type.description = data['description']

    if 'workflow_id' in data:
        workflow = Workflow.query.get(data['workflow_id'])
        if workflow is None:
            return jsonify({'message': 'Workflow not found'}), 404
        proposal_type.workflow_id = data['workflow_id']

    if 'season_id' in data:
        proposal_type.season_id = data['season_id']

    db.session.commit()
    return jsonify({'message': 'Proposal type updated'})
