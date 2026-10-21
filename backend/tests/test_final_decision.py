from app import db
from app.models.models import Proposal, ProposalReview, ProposalType, Role, User, Workflow, WorkflowState


def test_assigned_committee_member_records_outcome_and_reason_atomically(app, client, proposer_token, admin_token):
    with app.app_context():
        workflow = Workflow(name='Decision test workflow', definition={
            'initial_state': '待最终决策',
            'transitions': [
                {'name': 'decision_approve', 'from': '待最终决策', 'to': '已通过', 'roles': ['Panel Chair', 'Admin']},
                {'name': 'decision_reject', 'from': '待最终决策', 'to': '已驳回', 'roles': ['Panel Chair', 'Admin']},
                {'name': 'decision_revision', 'from': '待最终决策', 'to': '待修改', 'roles': ['Panel Chair', 'Admin']},
            ],
        })
        pending = WorkflowState(name='待最终决策', workflow=workflow)
        targets = [WorkflowState(name=name, workflow=workflow) for name in ('已通过', '已驳回', '待修改')]
        proposal_type = ProposalType(name='DSL 机遇观测提案', workflow=workflow)
        proposer = User.query.filter_by(username='proposer').first()
        chair = User(username='decision-chair', email='decision-chair@example.com', is_active=True)
        chair.set_password('password123')
        chair.roles.append(Role.query.filter_by(name='Panel Chair').first())
        proposal = Proposal(title='Decision test', author=proposer, proposal_type=proposal_type, current_state=pending)
        db.session.add_all([workflow, pending, *targets, proposal_type, chair, proposal])
        db.session.flush()
        review = ProposalReview(proposal=proposal, reviewer=chair, review_type='committee', status='assigned')
        db.session.add(review)
        db.session.commit()
        proposal_id = proposal.id

    token = client.post('/api/auth/login', json={
        'username': 'decision-chair', 'password': 'password123',
    }).get_json()['token']
    chair_headers = {'x-access-token': token}
    admin_headers = {'x-access-token': admin_token}
    url = f'/api/proposals/{proposal_id}/transitions'

    assert client.get(url, headers=admin_headers).get_json()['transitions'] == []
    assert client.post(url, json={'transition': 'decision_approve'}, headers=admin_headers).status_code == 403
    assert len(client.get(url, headers=chair_headers).get_json()['transitions']) == 2
    assert client.post(url, json={'transition': 'decision_approve'}, headers=chair_headers).status_code == 400
    assert client.post(url, json={
        'transition': 'decision_revision',
        'context': {'decision': {'priority': '3', 'comments': '需要补充目标可见性依据。'}},
    }, headers=chair_headers).status_code == 400
    response = client.post(url, json={
        'transition': 'decision_approve',
        'context': {'decision': {'priority': '3', 'comments': '评审条件满足。'}},
    }, headers=chair_headers)
    assert response.status_code == 200, response.get_json()

    with app.app_context():
        proposal = Proposal.query.get(proposal_id)
        review = ProposalReview.query.filter_by(proposal_id=proposal_id, review_type='committee').first()
        assert proposal.current_state.name == '已通过'
        assert review.status == 'submitted'
        assert review.recommendation == 'pass'
        assert review.scores == {'overall_priority': 3}
        assert review.comments == '评审条件满足。'
