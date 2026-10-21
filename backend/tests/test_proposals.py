from app import db
from app.api.proposals import _build_proposal_pdf
from app.models.models import (
    Instrument, Proposal, ProposalInstrument, ProposalPhase, ProposalType, User, Workflow, WorkflowState,
)


def auth_headers(token):
    return {"x-access-token": token}


def test_create_phase1_proposal(client, proposer_token):
    proposal_type = ProposalType.query.first()
    payload = {
        "title": "DSL Early Release Science",
        "abstract": "Test abstract",
        "proposal_type_id": proposal_type.id,
        "meta": {"title": "DSL Early Release Science", "abstract": "Test abstract"},
        "phase_payload": {
            "phase1": {
                "status": "submitted",
                "data": {
                    "science_objective": "Measure galaxy morphology evolution.",
                    "abstract": "Detailed summary.",
                },
                "attachments": {
                    "science_case": {"name": "science.pdf", "size": 20480, "type": "application/pdf"}
                },
            }
        },
        "instruments": [
            {
                    "instrument_code": "LF",
                "status": "submitted",
                "form_data": {"filter": "F275W", "exposure_time": 1200},
                "attachments": {
                    "finding_chart": {"name": "chart.png", "size": 4096, "type": "image/png"}
                },
            }
        ],
    }

    response = client.post(
        "/api/proposals/",
        json=payload,
        headers=auth_headers(proposer_token),
    )

    assert response.status_code == 201, response.get_json()
    data = response.get_json()
    assert data["message"] == "Proposal created successfully"

    proposal = Proposal.query.get(data["id"])
    assert proposal is not None
    assert proposal.proposal_type_id == proposal_type.id
    assert proposal.current_state.name == "Draft"
    assert proposal.phases.count() == 1
    phase = proposal.phases.first()
    assert phase.status == "submitted"
    assert phase.payload["science_objective"] == "Measure galaxy morphology evolution."
    assert "__attachments__" in phase.payload

    instrument_entry = ProposalInstrument.query.filter_by(proposal_id=proposal.id).first()
    assert instrument_entry is not None
    assert instrument_entry.form_data["filter"] == "F275W"
    assert "__attachments__" in instrument_entry.form_data


def test_long_proposal_pdf_paginates_without_dropping_content(app, proposer_token):
    with app.app_context():
        proposal_type = ProposalType.query.first()
        proposer = User.query.filter_by(username='proposer').first()
        initial_state = WorkflowState.query.filter_by(workflow_id=proposal_type.workflow_id, name='Draft').first()
        proposal = Proposal(
            title='长篇申请排版测试',
            abstract=('研究背景与观测目标。' * 180),
            author=proposer,
            proposal_type=proposal_type,
            current_state=initial_state,
        )
        db.session.add(proposal)
        db.session.add(ProposalPhase(
            proposal=proposal,
            phase='phase1',
            payload={'science_objective': '技术方案与预期成果。' * 450},
        ))
        db.session.flush()

        pdf = _build_proposal_pdf(proposal)
        assert pdf.startswith(b'%PDF-')
        assert len(pdf) > 4000


def test_observation_result_requires_real_feedback_and_then_closes(app, client, proposer_token, admin_token):
    with app.app_context():
        workflow = Workflow(name='Opportunity result', definition={
            'initial_state': '已推送观测编排',
            'transitions': [
                {'name': 'record_feedback', 'from': '已推送观测编排', 'to': '执行反馈', 'roles': ['Admin']},
            ],
        })
        pushed = WorkflowState(name='已推送观测编排', workflow=workflow)
        result = WorkflowState(name='执行反馈', workflow=workflow)
        proposal_type = ProposalType(name='DSL 机遇观测提案', workflow=workflow)
        proposer = User.query.filter_by(username='proposer').first()
        instrument = Instrument.query.filter_by(code='LF').first()
        proposal = Proposal(title='Result test', author=proposer, proposal_type=proposal_type, current_state=pushed)
        db.session.add_all([workflow, pushed, result, proposal_type, proposal])
        db.session.flush()
        db.session.add(ProposalInstrument(proposal_id=proposal.id, instrument_id=instrument.id))
        db.session.commit()
        proposal_id = proposal.id

    url = f'/api/proposals/{proposal_id}'
    admin = auth_headers(admin_token)
    owner = auth_headers(proposer_token)
    assert client.post(f'{url}/transitions', json={'transition': 'record_feedback'}, headers=admin).status_code == 400
    scheduled = {'status': 'scheduled', 'summary': '已安排下周观测窗口'}
    assert client.post(f'{url}/instruments/LF/feedback', json={'payload': scheduled}, headers=admin).status_code == 200
    assert client.post(f'{url}/transitions', json={'transition': 'record_feedback'}, headers=admin).status_code == 400

    final = {'status': 'completed', 'summary': '观测执行完成，结果已提交'}
    assert client.post(f'{url}/instruments/LF/feedback', json={'payload': final}, headers=admin).status_code == 200
    assert client.get(url, headers=owner).get_json()['instruments'][0]['scheduling_feedback']['completed_at']
    assert client.post(f'{url}/transitions', json={'transition': 'record_feedback'}, headers=admin).status_code == 200
    assert client.get(f'{url}/transitions', headers=admin).get_json()['transitions'] == []
    actions = client.get(f'{url}/transitions', headers=owner).get_json()['transitions']
    assert actions == []
    assert client.get(url, headers=owner).get_json()['status'] == '执行反馈'
    assert client.post(f'{url}/transitions', json={'transition': 'complete'}, headers=owner).status_code == 400
    assert client.post(f'{url}/instruments/LF/feedback', json={'payload': final}, headers=admin).status_code == 400
