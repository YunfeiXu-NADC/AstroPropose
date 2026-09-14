from app import db
from app.models.models import (
    Instrument,
    Proposal,
    ProposalInstrument,
    ProposalPhase,
    ProposalReview,
    ProposalType,
    Role,
    User,
    WorkflowState,
)


def make_user(username, role_name):
    role = Role.query.filter_by(name=role_name).first()
    if role is None:
        role = Role(name=role_name)
        db.session.add(role)
    user = User(username=username, email=f'{username}@example.com', is_active=True)
    user.set_password('password123')
    user.roles.append(role)
    db.session.add(user)
    return user


def login(client, username):
    response = client.post('/api/auth/login', json={'username': username, 'password': 'password123'})
    return response.get_json()['token']


def get_visible(client, token, scope=None):
    query = f'?scope={scope}' if scope else ''
    return client.get(f'/api/proposals/{query}', headers={'x-access-token': token})


def test_proposal_lists_follow_role_visibility(app, client, admin_token):
    with app.app_context():
        proposal_type = ProposalType.query.first()
        workflow = proposal_type.workflow
        draft = WorkflowState.query.filter_by(workflow_id=workflow.id, name='Draft').first()
        review = WorkflowState(name='UnderReview', workflow=workflow)
        alice = make_user('alice', 'Proposer')
        bob = make_user('bob', 'Proposer')
        technical = make_user('technical', 'Technical Expert')
        science_reviewer = make_user('science-reviewer', 'Reviewer')
        mixed_reviewer = make_user('mixed-reviewer', 'Reviewer')
        mixed_reviewer.roles.append(Role.query.filter_by(name='Admin').first())
        db.session.flush()
        alice_proposal = Proposal(title='Alice draft', author=alice, proposal_type=proposal_type, current_state=draft)
        bob_proposal = Proposal(title='Bob review', author=bob, proposal_type=proposal_type, current_state=review)
        other_proposal = Proposal(title='Other review', author=bob, proposal_type=proposal_type, current_state=review)
        db.session.add_all([alice_proposal, bob_proposal, other_proposal])
        db.session.flush()
        db.session.add_all([
            ProposalReview(
                proposal=bob_proposal, reviewer=science_reviewer,
                review_type='scientific', status='assigned',
            ),
            ProposalReview(
                proposal=bob_proposal, reviewer=mixed_reviewer,
                review_type='scientific', status='assigned',
            ),
        ])
        db.session.commit()

    alice_items = get_visible(client, login(client, 'alice')).get_json()
    technical_items = get_visible(client, login(client, 'technical')).get_json()
    reviewer_items = get_visible(client, login(client, 'science-reviewer')).get_json()
    review_tasks = get_visible(client, login(client, 'science-reviewer'), 'review_tasks').get_json()
    mixed_assigned = get_visible(client, login(client, 'mixed-reviewer'), 'assigned_reviews').get_json()
    admin_response = get_visible(client, admin_token, 'admin')

    assert [item['title'] for item in alice_items] == ['Alice draft']
    assert technical_items == []
    assert reviewer_items == []
    assert [item['title'] for item in review_tasks] == ['Bob review']
    assert [item['title'] for item in mixed_assigned] == ['Bob review']
    assert admin_response.status_code == 200
    assert {item['title'] for item in admin_response.get_json()} == {'Bob review', 'Other review'}
    assert client.get(
        f'/api/proposals/{alice_items[0]["id"]}',
        headers={'x-access-token': admin_token},
    ).status_code == 403
    admin_review_tasks = get_visible(client, admin_token, 'review_tasks').get_json()
    assert {item['title'] for item in admin_review_tasks} == {'Bob review', 'Other review'}


def test_review_forms_are_scoped_to_role_and_stage(app, client):
    with app.app_context():
        proposal_type = ProposalType.query.first()
        workflow = proposal_type.workflow
        technical_state = WorkflowState(name='待技术评审', workflow=workflow)
        science_state = WorkflowState(name='待科学评审', workflow=workflow)
        proposer = make_user('stage-owner', 'Proposer')
        technical = make_user('stage-technical', 'Technical Expert')
        reviewer = make_user('stage-reviewer', 'Reviewer')
        unassigned = make_user('unassigned-reviewer', 'Reviewer')
        db.session.flush()
        technical_proposal = Proposal(
            title='Technical stage', author=proposer,
            proposal_type=proposal_type, current_state=technical_state,
        )
        science_proposal = Proposal(
            title='Science stage', author=proposer,
            proposal_type=proposal_type, current_state=science_state,
        )
        db.session.add_all([technical_proposal, science_proposal])
        db.session.flush()
        db.session.add_all([
            ProposalReview(
                proposal=technical_proposal, reviewer=technical,
                review_type='technical', status='assigned',
            ),
            ProposalReview(
                proposal=science_proposal, reviewer=reviewer,
                review_type='scientific', status='assigned',
            ),
        ])
        db.session.commit()
        technical_id = technical_proposal.id
        science_id = science_proposal.id

    technical_token = login(client, 'stage-technical')
    reviewer_token = login(client, 'stage-reviewer')
    unassigned_token = login(client, 'unassigned-reviewer')
    technical_headers = {'x-access-token': technical_token}
    reviewer_headers = {'x-access-token': reviewer_token}
    unassigned_headers = {'x-access-token': unassigned_token}

    assert client.get(f'/api/proposals/{technical_id}', headers=reviewer_headers).status_code == 403
    assert client.get(f'/api/proposals/{science_id}', headers=unassigned_headers).status_code == 403

    science_detail = client.get(f'/api/proposals/{science_id}', headers=reviewer_headers).get_json()
    assert science_detail['permissions']['can_review'] is True
    assert science_detail['permissions']['review_type'] == 'scientific'

    assert client.get(f'/api/proposals/{science_id}', headers=technical_headers).status_code == 403

    review_payload = {
        'scores': {'technical_feasibility': 5, 'instrument_match': 4},
        'recommendation': 'pass',
        'comments': '技术条件完整，可进入科学评审。',
    }
    denied = client.post(
        f'/api/proposals/{technical_id}/reviews', json=review_payload, headers=reviewer_headers,
    )
    accepted = client.post(
        f'/api/proposals/{technical_id}/reviews', json=review_payload, headers=technical_headers,
    )
    assert denied.status_code == 403
    assert accepted.status_code == 200
    assert accepted.get_json()['review']['scores']['technical_feasibility'] == 5


def test_owner_can_edit_draft_but_cannot_see_review_form(app, client):
    with app.app_context():
        proposal_type = ProposalType.query.first()
        workflow = proposal_type.workflow
        draft = WorkflowState.query.filter_by(workflow_id=workflow.id, name='Draft').first()
        owner = make_user('draft-owner', 'Proposer')
        instrument = Instrument.query.first()
        instrument_code = instrument.code
        proposal = Proposal(
            title='Editable draft', author=owner,
            proposal_type=proposal_type, current_state=draft,
        )
        db.session.add(proposal)
        db.session.flush()
        db.session.add_all([
            ProposalPhase(proposal=proposal, phase='phase1', status='draft', payload={'objective': 'old'}),
            ProposalInstrument(proposal=proposal, instrument=instrument, phase='phase1', form_data={'band': 'old'}),
        ])
        db.session.commit()
        proposal_id = proposal.id

    headers = {'x-access-token': login(client, 'draft-owner')}
    detail = client.get(f'/api/proposals/{proposal_id}', headers=headers).get_json()
    assert detail['permissions']['is_owner'] is True
    assert detail['permissions']['can_edit'] is True
    assert detail['permissions']['can_review'] is False

    response = client.patch(f'/api/proposals/{proposal_id}', headers=headers, json={
        'title': 'Updated draft',
        'abstract': 'Updated abstract',
        'phase_payload': {'objective': 'new'},
        'instruments': [{'instrument_code': instrument_code, 'form_data': {'band': 'new'}}],
    })
    assert response.status_code == 200

    with app.app_context():
        updated = Proposal.query.get(proposal_id)
        assert updated.title == 'Updated draft'
        assert updated.phases.filter_by(phase='phase1').first().payload['objective'] == 'new'
