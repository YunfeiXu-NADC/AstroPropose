from app.models.models import FormTemplate, Proposal, ProposalType, WorkflowState


def auth_headers(token):
    return {"x-access-token": token}


def test_workflow_definition_save_syncs_workflow_states(client, admin_token):
    template = FormTemplate.query.first()

    create_response = client.post(
        "/api/workflows/",
        json={"name": "E2E Workflow", "description": "Workflow created in test"},
        headers=auth_headers(admin_token),
    )
    assert create_response.status_code == 201, create_response.get_json()
    workflow_id = create_response.get_json()["id"]

    definition = {
        "initial_state": "Draft",
        "nodes": [
            {
                "id": "draft",
                "type": "stateNode",
                "data": {
                    "label": "Draft",
                    "description": "Draft description",
                    "formTemplateId": template.id,
                    "formRequired": True,
                },
                "position": {"x": 0, "y": 0},
            },
            {
                "id": "submitted",
                "type": "stateNode",
                "data": {
                    "label": "Submitted",
                    "description": "Submitted description",
                },
                "position": {"x": 200, "y": 0},
            },
        ],
        "edges": [
            {"id": "edge-1", "source": "draft", "target": "submitted", "animated": True}
        ],
        "transitions": [
            {
                "name": "submit_phase1",
                "label": "Submit Phase-1",
                "from": "Draft",
                "to": "Submitted",
                "roles": ["Proposer"],
                "conditions": {"phase_status": {"phase": "phase1", "status": "draft"}},
                "effects": {
                    "phase": "phase1",
                    "set_phase_status": "submitted",
                    "record_submission_time": True,
                },
            }
        ],
    }

    update_response = client.put(
        f"/api/workflows/{workflow_id}",
        json={"name": "E2E Workflow", "description": "Workflow created in test", "definition": definition},
        headers=auth_headers(admin_token),
    )
    assert update_response.status_code == 200, update_response.get_json()

    states = WorkflowState.query.filter_by(workflow_id=workflow_id).order_by(WorkflowState.id).all()
    assert [state.name for state in states] == ["Draft", "Submitted"]
    assert states[0].form_template_id == template.id
    assert states[0].form_required is True
    assert states[0].description == "Draft description"
    assert states[1].description == "Submitted description"


def test_admin_can_publish_workflow_and_proposer_can_submit_through_it(client, admin_token, proposer_token):
    form_response = client.post(
        "/api/form-templates/",
        json={
            "name": "E2E General Form",
            "phase": "phase1",
            "definition": {
                "fields": [
                    {"name": "science_goal", "label": "Science Goal", "type": "textarea", "required": True}
                ]
            },
        },
        headers=auth_headers(admin_token),
    )
    assert form_response.status_code == 201, form_response.get_json()
    form_template_id = form_response.get_json()["id"]

    create_workflow = client.post(
        "/api/workflows/",
        json={"name": "Published Workflow", "description": "Workflow for publish flow"},
        headers=auth_headers(admin_token),
    )
    assert create_workflow.status_code == 201, create_workflow.get_json()
    workflow_id = create_workflow.get_json()["id"]

    definition = {
        "initial_state": "Draft",
        "nodes": [
            {
                "id": "draft",
                "type": "stateNode",
                "data": {"label": "Draft", "formTemplateId": form_template_id, "formRequired": False},
                "position": {"x": 0, "y": 0},
            },
            {
                "id": "submitted",
                "type": "stateNode",
                "data": {"label": "Submitted"},
                "position": {"x": 200, "y": 0},
            },
        ],
        "edges": [
            {"id": "edge-1", "source": "draft", "target": "submitted", "animated": True}
        ],
        "transitions": [
            {
                "name": "submit_phase1",
                "label": "Submit Phase-1",
                "from": "Draft",
                "to": "Submitted",
                "roles": ["Proposer"],
                "conditions": {"phase_status": {"phase": "phase1", "status": "draft"}},
                "effects": {
                    "phase": "phase1",
                    "set_phase_status": "submitted",
                    "record_submission_time": True,
                },
            }
        ],
    }

    update_workflow = client.put(
        f"/api/workflows/{workflow_id}",
        json={"name": "Published Workflow", "description": "Workflow for publish flow", "definition": definition},
        headers=auth_headers(admin_token),
    )
    assert update_workflow.status_code == 200, update_workflow.get_json()

    create_type = client.post(
        "/api/proposal-types/",
        json={
            "name": "Published Proposal Type",
            "description": "Available to proposers after publish",
            "workflow_id": workflow_id,
        },
        headers=auth_headers(admin_token),
    )
    assert create_type.status_code == 201, create_type.get_json()
    proposal_type_id = create_type.get_json()["id"]

    types_response = client.get(
        "/api/proposal-types/",
        headers=auth_headers(proposer_token),
    )
    assert types_response.status_code == 200, types_response.get_json()
    assert any(item["id"] == proposal_type_id for item in types_response.get_json())

    create_proposal = client.post(
        "/api/proposals/",
        json={
            "title": "E2E Workflow Submission",
            "abstract": "Testing full publish and submit flow",
            "proposal_type_id": proposal_type_id,
            "meta": {"title": "E2E Workflow Submission", "science_goal": "Verify end-to-end publish flow"},
            "phase_payload": {
                "phase1": {
                    "status": "draft",
                    "data": {"science_goal": "Verify end-to-end publish flow"},
                }
            },
            "instruments": [
                {
                    "instrument_code": "MCI",
                    "status": "submitted",
                    "form_data": {"filter": "F275W", "exposure_time": 600},
                }
            ],
        },
        headers=auth_headers(proposer_token),
    )
    assert create_proposal.status_code == 201, create_proposal.get_json()
    proposal_id = create_proposal.get_json()["id"]

    allowed_actions = client.get(
        f"/api/proposals/{proposal_id}/transitions",
        headers=auth_headers(proposer_token),
    )
    assert allowed_actions.status_code == 200, allowed_actions.get_json()
    transitions = allowed_actions.get_json()["transitions"]
    assert {item["name"] for item in transitions} == {"submit_phase1"}

    execute_transition = client.post(
        f"/api/proposals/{proposal_id}/transitions",
        json={"transition": "submit_phase1"},
        headers=auth_headers(proposer_token),
    )
    assert execute_transition.status_code == 200, execute_transition.get_json()
    assert execute_transition.get_json()["new_state"] == "Submitted"

    proposal = Proposal.query.get(proposal_id)
    assert proposal.current_state.name == "Submitted"
    assert proposal.proposal_type_id == proposal_type_id
    phase = proposal.phases.filter_by(phase="phase1").first()
    assert phase.status == "submitted"
    assert phase.submitted_at is not None

    published_type = ProposalType.query.get(proposal_type_id)
    assert published_type.workflow_id == workflow_id
