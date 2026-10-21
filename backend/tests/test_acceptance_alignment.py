from datetime import datetime

from app import db
from app.models.models import (
    Proposal, ProposalPhase, ProposalReview, ProposalType, Role, User,
    Workflow, WorkflowState,
)


def make_user(username, role):
    user = User(username=username, email=f'{username}@example.com', is_active=True)
    user.set_password('password123')
    user.roles.append(Role.query.filter_by(name=role).one())
    db.session.add(user)
    return user


def token(client, username):
    response = client.post('/api/auth/login', json={'username': username, 'password': 'password123'})
    return {'x-access-token': response.get_json()['token']}


def test_account_draft_can_be_resumed_and_is_private(app, client, proposer_token, admin_token):
    proposer_headers = {'x-access-token': proposer_token}
    admin_headers = {'x-access-token': admin_token}
    proposal_type_id = ProposalType.query.first().id
    created = client.post('/api/proposals/', json={
        'proposal_type_id': proposal_type_id,
        'save_as_draft': True,
        'phase_payload': {'phase1': {'status': 'draft', 'data': {'science_objective': '初步目标'}}},
        'instruments': [],
    }, headers=proposer_headers)
    assert created.status_code == 201
    proposal_id = created.get_json()['id']
    assert client.get(f'/api/proposals/{proposal_id}', headers=admin_headers).status_code == 403
    assert all(item['id'] != proposal_id for item in client.get('/api/proposals/?scope=admin', headers=admin_headers).get_json())

    saved = client.patch(f'/api/proposals/{proposal_id}', json={
        'title': '可恢复的研究提案',
        'abstract': '摘要',
        'phase_payload': {'science_objective': '更新后的目标'},
        'instruments': [{'instrument_code': 'LF', 'form_data': {'band': '1-10 MHz'}}],
    }, headers=proposer_headers)
    assert saved.status_code == 200
    detail = client.get(f'/api/proposals/{proposal_id}', headers=proposer_headers).get_json()
    assert detail['title'] == '可恢复的研究提案'
    assert detail['phases'][0]['payload']['science_objective'] == '更新后的目标'
    assert detail['instruments'][0]['instrument']['code'] == 'LF'

    submitted = client.post(f'/api/proposals/{proposal_id}/transitions', json={
        'transition': 'submit_phase1',
    }, headers=proposer_headers)
    assert submitted.status_code == 200
    assert submitted.get_json()['new_state'] == 'Submitted'
    assert client.patch(f'/api/proposals/{proposal_id}', json={'title': '违规改动'}, headers=proposer_headers).status_code == 403


def test_all_assigned_experts_must_submit_before_admin_advances(app, client, proposer_token, admin_token):
    with app.app_context():
        workflow = Workflow(name='Two-expert review', definition={
            'initial_state': '待技术评审',
            'transitions': [{'name': 'technical_pass', 'from': '待技术评审', 'to': '待科学评审', 'roles': ['Technical Expert', 'Admin']}],
        })
        technical = WorkflowState(name='待技术评审', workflow=workflow)
        scientific = WorkflowState(name='待科学评审', workflow=workflow)
        proposal_type = ProposalType(name='DSL 研究提案', workflow=workflow)
        owner = User.query.filter_by(username='proposer').one()
        expert_one = make_user('reviewer-one', 'Technical Expert')
        expert_two = make_user('reviewer-two', 'Technical Expert')
        proposal = Proposal(title='双专家评审', abstract='摘要', author=owner, proposal_type=proposal_type, current_state=technical)
        db.session.add_all([workflow, technical, scientific, proposal_type, proposal])
        db.session.flush()
        db.session.add(ProposalPhase(proposal=proposal, phase='phase1', status='submitted'))
        db.session.add_all([
            ProposalReview(proposal=proposal, reviewer=expert_one, review_type='technical', status='assigned'),
            ProposalReview(proposal=proposal, reviewer=expert_two, review_type='technical', status='assigned'),
        ])
        db.session.commit()
        proposal_id = proposal.id

    first_headers = token(client, 'reviewer-one')
    second_headers = token(client, 'reviewer-two')
    url = f'/api/proposals/{proposal_id}/transitions'
    assert client.get(url, headers={'x-access-token': admin_token}).get_json()['transitions'] == []
    assert client.post(url, json={'transition': 'technical_pass'}, headers=first_headers).status_code == 403
    review = {'scores': {'technical_feasibility': 4}, 'recommendation': 'pass', 'comments': '技术可行。'}
    assert client.post(f'/api/proposals/{proposal_id}/reviews', json={**review, 'recommendation': 'revise'}, headers=first_headers).status_code == 400
    assert client.post(f'/api/proposals/{proposal_id}/reviews', json=review, headers=first_headers).status_code == 200
    admin_headers = {'x-access-token': admin_token}
    assert client.post(url, json={'transition': 'technical_pass'}, headers=admin_headers).status_code == 400
    assert client.post(f'/api/proposals/{proposal_id}/reviews', json=review, headers=second_headers).status_code == 200
    assert [item['name'] for item in client.get(url, headers=admin_headers).get_json()['transitions']] == ['technical_pass']
    assert client.post(url, json={'transition': 'technical_pass'}, headers=admin_headers).get_json()['new_state'] == '待科学评审'


def test_review_disclosure_controls_detail_and_pdf(app, client, proposer_token, admin_token, monkeypatch):
    with app.app_context():
        proposal_type = ProposalType.query.first()
        state = WorkflowState(name='已完成', workflow=proposal_type.workflow)
        owner = User.query.filter_by(username='proposer').one()
        reviewer = make_user('finished-reviewer', 'Reviewer')
        proposal = Proposal(title='评审意见公开控制', author=owner, proposal_type=proposal_type, current_state=state)
        db.session.add_all([state, proposal])
        db.session.flush()
        db.session.add(ProposalPhase(proposal=proposal, phase='phase1', status='submitted'))
        db.session.add(ProposalReview(
            proposal=proposal, reviewer=reviewer, review_type='scientific',
            status='submitted', scores={'scientific_merit': 5}, recommendation='pass', comments='仅内部可见的评语',
        ))
        db.session.commit()
        proposal_id = proposal.id

    monkeypatch.setattr('app.api.proposals._build_proposal_pdf', lambda proposal, reviews: '|'.join(item.comments for item in reviews).encode())
    owner_headers = {'x-access-token': proposer_token}
    admin_headers = {'x-access-token': admin_token}
    url = f'/api/proposals/{proposal_id}'
    assert client.get(url, headers=owner_headers).get_json()['reviews'] == []
    assert len(client.get(url, headers=admin_headers).get_json()['reviews']) == 1
    assert client.get(f'{url}/document', headers=owner_headers).data == b''
    assert client.patch(f'{url}/reviews/visibility', json={'visible': True}, headers=owner_headers).status_code == 403
    assert client.patch(f'{url}/reviews/visibility', json={'visible': True}, headers=admin_headers).status_code == 200
    assert len(client.get(url, headers=owner_headers).get_json()['reviews']) == 1
    assert client.get(f'{url}/document', headers=owner_headers).data == '仅内部可见的评语'.encode()
    assert client.patch(f'{url}/reviews/visibility', json={'visible': False}, headers=admin_headers).status_code == 200
    assert client.get(f'{url}/document', headers=owner_headers).data == b''


def test_creation_metadata_cannot_release_internal_reviews(app, client, proposer_token, admin_token, monkeypatch):
    owner_headers = {'x-access-token': proposer_token}
    admin_headers = {'x-access-token': admin_token}
    created = client.post('/api/proposals/', json={
        'title': 'Private review metadata',
        'proposal_type_id': ProposalType.query.first().id,
        'save_as_draft': True,
        'meta': {'review_visibility': 'visible', 'category': 'research'},
    }, headers=owner_headers)
    assert created.status_code == 201
    proposal_id = created.get_json()['id']
    proposal = Proposal.query.get(proposal_id)
    proposal.current_state = WorkflowState.query.filter_by(name='Submitted').one()
    proposal.phases.first().status = 'submitted'
    reviewer = make_user('private-reviewer', 'Reviewer')
    db.session.add(ProposalReview(
        proposal=proposal, reviewer=reviewer, review_type='scientific',
        status='submitted', scores={'scientific_merit': 4},
        recommendation='pass', comments='Internal review',
    ))
    db.session.commit()
    monkeypatch.setattr('app.api.proposals._build_proposal_pdf',
                        lambda proposal, reviews: '|'.join(item.comments for item in reviews).encode())
    url = f'/api/proposals/{proposal_id}'
    assert client.get(url, headers=owner_headers).get_json()['reviews'] == []
    assert client.get(f'{url}/document', headers=owner_headers).data == b''
    assert proposal.data == {'category': 'research'}
    assert client.patch(f'{url}/reviews/visibility', json={'visible': True}, headers=owner_headers).status_code == 403
    assert client.patch(f'{url}/reviews/visibility', json={'visible': True}, headers=admin_headers).status_code == 200
    assert len(client.get(url, headers=owner_headers).get_json()['reviews']) == 1
    assert client.get(f'{url}/document', headers=owner_headers).data == b'Internal review'


def test_rejection_reason_is_official_result_even_when_reviews_are_hidden(app, client, proposer_token, admin_token):
    with app.app_context():
        proposal_type = ProposalType.query.first()
        rejected = WorkflowState(name='已驳回', workflow=proposal_type.workflow)
        owner = User.query.filter_by(username='proposer').one()
        chair = make_user('decision-chair', 'Panel Chair')
        proposal = Proposal(title='已驳回的机遇观测', author=owner, proposal_type=proposal_type, current_state=rejected)
        db.session.add_all([rejected, proposal])
        db.session.flush()
        db.session.add(ProposalPhase(proposal=proposal, phase='phase1', status='submitted'))
        db.session.add(ProposalReview(
            proposal=proposal, reviewer=chair, review_type='committee', status='submitted',
            scores={'overall_priority': 2}, recommendation='reject',
            comments='触发证据不足，未达到机遇观测优先级。', submitted_at=datetime.utcnow(),
        ))
        db.session.commit()
        proposal_id = proposal.id

    detail = client.get(f'/api/proposals/{proposal_id}', headers={'x-access-token': proposer_token}).get_json()
    assert detail['reviews'] == []
    assert detail['final_decision']['outcome'] == 'reject'
    assert detail['final_decision']['priority'] == 2
    assert detail['final_decision']['reason'] == '触发证据不足，未达到机遇观测优先级。'
    assert client.get(f'/api/proposals/{proposal_id}/document', headers={'x-access-token': proposer_token}).data.startswith(b'%PDF')
