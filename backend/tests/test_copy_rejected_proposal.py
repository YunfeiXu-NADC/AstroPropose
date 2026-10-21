from app import db
from app.models.models import (
    Instrument, Proposal, ProposalInstrument, ProposalPhase, ProposalReview,
    ProposalType, User, Workflow, WorkflowState,
)


def test_owner_can_copy_rejected_application_without_old_records(app, client, proposer_token, admin_token):
    with app.app_context():
        workflow = Workflow(name='Rejected copy test', definition={'initial_state': '草稿', 'transitions': []})
        draft_state = WorkflowState(name='草稿', workflow=workflow)
        rejected_state = WorkflowState(name='已驳回', workflow=workflow)
        proposal_type = ProposalType(name='DSL 研究提案', workflow=workflow)
        owner = User.query.filter_by(username='proposer').one()
        instrument = Instrument.query.filter_by(code='LF').one()
        source = Proposal(title='射电晕观测', abstract='完整摘要', author=owner,
                          proposal_type=proposal_type, current_state=rejected_state,
                          data={'review_visibility': 'visible'})
        db.session.add_all([workflow, draft_state, rejected_state, proposal_type, source])
        db.session.flush()
        db.session.add(ProposalPhase(
            proposal=source, phase='phase1', status='submitted',
            payload={'science_objective': '研究射电晕', '__attachments__': {'file': {'name': 'old.pdf'}},
                     'nested': {'notes': '保留', 'file': {'name': 'old.pdf', 'data_url': 'data:application/pdf;base64,AAAA'}}},
        ))
        db.session.add(ProposalInstrument(
            proposal=source, instrument=instrument, phase='phase1', status='submitted',
            form_data={'frequency': '0.5–25 MHz', '__attachments__': {'chart': {'name': 'old.png'}}},
            scheduling_feedback={'data_products': [{'id': 'old-result'}]},
        ))
        db.session.add(ProposalReview(
            proposal=source, reviewer=owner, review_type='committee', status='submitted',
            recommendation='reject', comments='旧申请的驳回理由',
        ))
        db.session.commit()
        source_id = source.id

    url = f'/api/proposals/{source_id}/copy-as-draft'
    assert client.post(url, json={}, headers={'x-access-token': admin_token}).status_code == 403
    response = client.post(url, json={}, headers={'x-access-token': proposer_token})
    assert response.status_code == 201, response.get_json()
    new_id = response.get_json()['id']
    assert new_id != source_id

    with app.app_context():
        source = db.session.get(Proposal, source_id)
        copied = db.session.get(Proposal, new_id)
        assert source.current_state.name == '已驳回'
        assert copied.current_state.name == '草稿'
        assert copied.user_id == source.user_id
        assert copied.title == source.title
        assert copied.abstract == source.abstract
        assert copied.data == {'copied_from_proposal_id': source_id}
        assert copied.phases.count() == 1
        assert copied.phases.first().status == 'draft'
        assert copied.phases.first().payload == {'science_objective': '研究射电晕', 'nested': {'notes': '保留'}}
        assert copied.instruments.count() == 1
        assert copied.instruments.first().form_data == {'frequency': '0.5–25 MHz'}
        assert not copied.instruments.first().scheduling_feedback
        assert copied.reviews.count() == 0
        assert copied.state_history.count() == 0

    assert client.post(f'/api/proposals/{new_id}/copy-as-draft', json={},
                       headers={'x-access-token': proposer_token}).status_code == 400
