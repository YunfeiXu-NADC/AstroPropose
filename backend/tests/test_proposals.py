from app import db
from app.models.models import Proposal, ProposalInstrument, ProposalType


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
