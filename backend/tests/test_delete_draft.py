from app import db
from app.models.models import Proposal, ProposalType


def test_only_owner_can_delete_unsubmitted_draft(app, client, proposer_token, admin_token):
    with app.app_context():
        proposal_type_id = ProposalType.query.first().id
    headers = {'x-access-token': proposer_token}
    created = client.post('/api/proposals/', json={
        'proposal_type_id': proposal_type_id,
        'save_as_draft': True,
        'title': '待删除草稿',
    }, headers=headers)
    assert created.status_code == 201, created.get_json()
    draft_id = created.get_json()['id']

    assert client.delete(f'/api/proposals/{draft_id}', headers={'x-access-token': admin_token}).status_code == 403
    assert client.delete(f'/api/proposals/{draft_id}', headers=headers).status_code == 200
    assert client.get(f'/api/proposals/{draft_id}', headers=headers).status_code == 404
    with app.app_context():
        assert db.session.get(Proposal, draft_id) is None


def test_submitted_proposal_cannot_be_deleted(app, client, proposer_token):
    with app.app_context():
        proposal_type_id = ProposalType.query.first().id
    headers = {'x-access-token': proposer_token}
    created = client.post('/api/proposals/', json={
        'proposal_type_id': proposal_type_id,
        'save_as_draft': True,
        'title': '待提交提案',
    }, headers=headers)
    assert created.status_code == 201, created.get_json()
    proposal_id = created.get_json()['id']
    updated = client.patch(f'/api/proposals/{proposal_id}', json={
        'abstract': '测试摘要',
        'instruments': [{'instrument_code': 'LF', 'form_data': {}}],
    }, headers=headers)
    assert updated.status_code == 200, updated.get_json()
    submitted = client.post(f'/api/proposals/{proposal_id}/transitions', json={
        'transition': 'submit_phase1',
    }, headers=headers)
    assert submitted.status_code == 200, submitted.get_json()
    assert client.delete(f'/api/proposals/{proposal_id}', headers=headers).status_code == 409
    with app.app_context():
        assert db.session.get(Proposal, proposal_id) is not None
