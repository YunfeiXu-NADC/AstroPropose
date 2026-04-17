from flask import Blueprint, jsonify, request
from app import db
from app.models.models import Workflow, WorkflowAction, WorkflowState, WorkflowTransition
from app.api.auth import token_required, admin_required

bp = Blueprint('workflows', __name__)


def _sync_workflow_states_from_definition(workflow, definition):
    """Keep WorkflowState rows aligned with node definitions used by the editor."""
    if not isinstance(definition, dict):
        return

    nodes = definition.get("nodes") or []
    if not isinstance(nodes, list):
        return

    desired_states = []
    for node in nodes:
        data = node.get("data") or {}
        name = data.get("label")
        if not name:
            continue
        desired_states.append(
            {
                "name": name,
                "description": data.get("description"),
                "form_template_id": data.get("formTemplateId"),
                "form_required": bool(data.get("formRequired", False)),
            }
        )

    existing_states = {
        state.name: state
        for state in WorkflowState.query.filter_by(workflow_id=workflow.id).all()
    }
    desired_names = {state["name"] for state in desired_states}

    for state_data in desired_states:
        state = existing_states.get(state_data["name"])
        if state is None:
            state = WorkflowState(name=state_data["name"], workflow=workflow)
            db.session.add(state)
        state.description = state_data["description"]
        state.form_template_id = state_data["form_template_id"]
        state.form_required = state_data["form_required"]

    for state_name, state in existing_states.items():
        if state_name in desired_names:
            continue
        if state.proposals.count() == 0:
            db.session.delete(state)


@bp.route('/', methods=['GET'])
@token_required
def get_workflows(current_user):
    """Returns all available workflows."""
    workflows = Workflow.query.all()
    return jsonify([{'id': w.id, 'name': w.name, 'description': w.description} for w in workflows])


@bp.route('/<int:id>', methods=['GET'])
@token_required
def get_workflow(current_user, id):
    """Returns a single workflow definition."""
    workflow = Workflow.query.get_or_404(id)
    return jsonify({
        'id': workflow.id,
        'name': workflow.name,
        'description': workflow.description,
        'definition': workflow.definition
    })


@bp.route('/', methods=['POST'])
@token_required
@admin_required
def create_workflow(current_user):
    """Creates a new workflow."""
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'message': 'Missing name'}), 400

    new_workflow = Workflow(
        name=data['name'],
        description=data.get('description', ''),
        definition=data.get('definition'),
    )
    db.session.add(new_workflow)
    db.session.flush()
    _sync_workflow_states_from_definition(new_workflow, data.get('definition'))
    db.session.commit()
    return jsonify({'message': 'Workflow created successfully', 'id': new_workflow.id}), 201


@bp.route('/<int:id>', methods=['PUT'])
@token_required
@admin_required
def update_workflow(current_user, id):
    """Updates an existing workflow."""
    workflow = Workflow.query.get_or_404(id)
    data = request.get_json()
    if not data:
        return jsonify({'message': 'No payload provided'}), 400

    workflow.name = data.get('name', workflow.name)
    workflow.description = data.get('description', workflow.description)
    if 'definition' in data:
        workflow.definition = data['definition']
        _sync_workflow_states_from_definition(workflow, data['definition'])
    db.session.commit()
    return jsonify({'message': 'Workflow updated successfully'})


@bp.route('/<int:id>/states', methods=['GET'])
@token_required
def list_workflow_states(current_user, id):
    workflow = Workflow.query.get_or_404(id)
    states = workflow.states.order_by(WorkflowState.id).all()
    return jsonify([{'id': s.id, 'name': s.name} for s in states])


@bp.route('/<int:id>/states', methods=['POST'])
@token_required
@admin_required
def create_workflow_state(current_user, id):
    workflow = Workflow.query.get_or_404(id)
    data = request.get_json() or {}
    name = data.get('name')
    if not name:
        return jsonify({'message': 'name is required'}), 400

    state = WorkflowState(name=name, workflow=workflow)
    db.session.add(state)
    db.session.commit()
    return jsonify({'message': 'State created', 'id': state.id}), 201


@bp.route('/<int:id>/actions', methods=['POST'])
@token_required
@admin_required
def create_workflow_action(current_user, id):
    workflow = Workflow.query.get_or_404(id)
    data = request.get_json() or {}
    name = data.get('name')
    action_type = data.get('action_type')
    if not name or not action_type:
        return jsonify({'message': 'name and action_type are required'}), 400

    action = WorkflowAction(
        workflow=workflow,
        name=name,
        action_type=action_type,
        config=data.get('config', {}),
    )
    db.session.add(action)
    db.session.commit()
    return jsonify({'message': 'Action created', 'id': action.id}), 201


@bp.route('/<int:id>/transitions', methods=['GET'])
@token_required
def list_workflow_transitions(current_user, id):
    workflow = Workflow.query.get_or_404(id)
    transitions = WorkflowTransition.query.filter_by(workflow_id=workflow.id).all()
    return jsonify(
        [
            {
                'id': t.id,
                'name': t.name,
                'from_state': t.from_state.name,
                'to_state': t.to_state.name,
                'allowed_roles': t.allowed_roles,
                'action': t.action.name if t.action else None,
            }
            for t in transitions
        ]
    )


@bp.route('/<int:id>/transitions', methods=['POST'])
@token_required
@admin_required
def create_workflow_transition(current_user, id):
    workflow = Workflow.query.get_or_404(id)
    data = request.get_json() or {}
    name = data.get('name')
    from_state_id = data.get('from_state_id')
    to_state_id = data.get('to_state_id')
    if not name or not from_state_id or not to_state_id:
        return jsonify({'message': 'name, from_state_id and to_state_id are required'}), 400

    from_state = WorkflowState.query.filter_by(id=from_state_id, workflow_id=workflow.id).first()
    to_state = WorkflowState.query.filter_by(id=to_state_id, workflow_id=workflow.id).first()
    if not from_state or not to_state:
        return jsonify({'message': 'States must belong to the workflow'}), 400

    action_id = data.get('action_id')
    action = None
    if action_id:
        action = WorkflowAction.query.filter_by(id=action_id, workflow_id=workflow.id).first()
        if action is None:
            return jsonify({'message': 'Action must belong to the workflow'}), 400

    transition = WorkflowTransition(
        workflow=workflow,
        name=name,
        from_state=from_state,
        to_state=to_state,
        allowed_roles=data.get('allowed_roles', []),
        condition=data.get('condition', {}),
        action=action,
    )
    db.session.add(transition)
    db.session.commit()
    return jsonify({'message': 'Transition created', 'id': transition.id}), 201
