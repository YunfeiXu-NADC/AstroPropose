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


def test_revoking_reviewer_role_removes_assigned_review_access(app, client, admin_token):
    with app.app_context():
        proposal_type = ProposalType.query.first()
        owner = make_user('revocation-owner', 'Proposer')
        reviewer = make_user('revocation-reviewer', 'Reviewer')
        stage = WorkflowState(name='待科学评审', workflow=proposal_type.workflow)
        proposal = Proposal(title='Revocation check', author=owner, proposal_type=proposal_type, current_state=stage)
        db.session.add(proposal)
        db.session.flush()
        db.session.add(ProposalReview(proposal=proposal, reviewer=reviewer, review_type='scientific', status='assigned'))
        db.session.commit()
        reviewer_id = reviewer.id
        proposal_id = proposal.id

    headers = {'x-access-token': login(client, 'revocation-reviewer')}
    assert [item['title'] for item in client.get('/api/proposals/?scope=assigned_reviews', headers=headers).get_json()] == ['Revocation check']

    response = client.patch(
        f'/api/admin/users/{reviewer_id}', headers={'x-access-token': admin_token}, json={'role_ids': []},
    )
    assert response.status_code == 200
    assert response.get_json()['roles'] == ['Proposer']
    assert client.get('/api/proposals/?scope=assigned_reviews', headers=headers).get_json() == []
    assert client.get(f'/api/proposals/{proposal_id}', headers=headers).status_code == 403


def test_review_forms_are_scoped_to_role_and_stage(app, client):
    with app.app_context():
        proposal_type = ProposalType.query.first()
        workflow = proposal_type.workflow
        technical_state = WorkflowState(name='待技术评审', workflow=workflow)
        science_state = WorkflowState(name='待科学评审', workflow=workflow)
        proposer = make_user('stage-owner', 'Proposer')
        technical = make_user('stage-technical', 'Technical Expert')
        scheduler_role = Role.query.filter_by(name='Instrument Scheduler').first()
        if scheduler_role is None:
            scheduler_role = Role(name='Instrument Scheduler')
            db.session.add(scheduler_role)
        technical.roles.append(scheduler_role)
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
    assert client.get(f'/api/proposals/{technical_id}', headers=technical_headers).status_code == 200
    assert client.get('/api/proposals/?scope=feedback', headers=technical_headers).get_json() == []
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


def test_panel_chair_with_admin_role_sees_only_assigned_review_tasks(app, client):
    with app.app_context():
        proposal_type = ProposalType.query.first()
        workflow = proposal_type.workflow
        decision_state = WorkflowState(name='待最终决策', workflow=workflow)
        technical_state = WorkflowState(name='待技术评审', workflow=workflow)
        owner = make_user('committee-owner', 'Proposer')
        chair = make_user('committee-chair', 'Panel Chair')
        chair.roles.append(Role.query.filter_by(name='Admin').first())
        db.session.flush()
        assigned = Proposal(title='Assigned decision', author=owner, proposal_type=proposal_type, current_state=decision_state)
        unrelated = Proposal(title='Unrelated technical task', author=owner, proposal_type=proposal_type, current_state=technical_state)
        db.session.add_all([assigned, unrelated])
        db.session.flush()
        db.session.add(ProposalReview(proposal=assigned, reviewer=chair, review_type='committee', status='assigned'))
        db.session.commit()
        assigned_id = assigned.id

    headers = {'x-access-token': login(client, 'committee-chair')}
    tasks = client.get('/api/proposals/?scope=review_tasks', headers=headers)
    assert tasks.status_code == 200
    assert [item['title'] for item in tasks.get_json()] == ['Assigned decision']
    detail = client.get(f'/api/proposals/{assigned_id}', headers=headers).get_json()
    assert detail['permissions']['can_review'] is True
    assert detail['permissions']['review_type'] == 'committee'


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


def test_proposal_manager_can_allocate_temporary_observation_data(app, client):
    with app.app_context():
        proposal_type = ProposalType.query.first()
        proposal_type.name = 'DSL Research Proposal'
        workflow = proposal_type.workflow
        data_state = WorkflowState(name='待分配观测数据', workflow=workflow)
        authorized_state = WorkflowState(name='数据已授权', workflow=workflow)
        workflow.definition = {
            **workflow.definition,
            'transitions': [
                *workflow.definition['transitions'],
                {'name': 'grant_data', 'from': '待分配观测数据', 'to': '数据已授权', 'roles': ['Proposal Manager']},
            ],
        }
        owner = make_user('data-owner', 'Proposer')
        manager = make_user('proposal-manager', 'Proposal Manager')
        instrument = Instrument.query.first()
        db.session.flush()
        proposal = Proposal(
            title='Approved research proposal',
            author=owner,
            proposal_type=proposal_type,
            current_state=data_state,
        )
        db.session.add(proposal)
        db.session.flush()
        db.session.add_all([
            ProposalPhase(proposal=proposal, phase='phase1', status='submitted'),
            ProposalInstrument(proposal=proposal, instrument=instrument, phase='phase1', status='scheduled'),
        ])
        db.session.commit()
        proposal_id = proposal.id
        instrument_code = instrument.code

    manager_headers = {'x-access-token': login(client, 'proposal-manager')}
    owner_headers = {'x-access-token': login(client, 'data-owner')}
    queue = get_visible(client, manager_headers['x-access-token'], 'data_allocation')
    assert queue.status_code == 200
    assert [item['title'] for item in queue.get_json()] == ['Approved research proposal']
    waiting_detail = client.get(f'/api/proposals/{proposal_id}', headers=manager_headers).get_json()
    assert waiting_detail['permissions']['can_manage_data'] is True
    assert waiting_detail['permissions']['can_allocate_data'] is True

    allocation = client.post(
        f'/api/proposals/{proposal_id}/instruments/{instrument_code}/data-allocation',
        headers=manager_headers,
        json={
            'observation_id': 'DSL-OBS-TEMP-0001',
            'product_name': 'LF-观测清单.csv',
            'summary': '原型确认临时数据已开放。',
        },
    )
    assert allocation.status_code == 200
    feedback = allocation.get_json()['feedback']
    assert feedback['status'] == 'data_ready'
    assert feedback['data_products'][0]['data_url'].startswith('data:text/csv')
    assert allocation.get_json()['proposal_state'] == '数据已授权'

    owner_detail = client.get(f'/api/proposals/{proposal_id}', headers=owner_headers).get_json()
    owner_feedback = owner_detail['instruments'][0]['scheduling_feedback']
    assert owner_feedback['observation_id'] == 'DSL-OBS-TEMP-0001'
    assert owner_feedback['data_products'][0]['name'] == 'LF-观测清单.csv'

    second = client.post(
        f'/api/proposals/{proposal_id}/instruments/{instrument_code}/data-allocation',
        headers=manager_headers,
        json={'observation_id': 'DSL-OBS-TEMP-0002', 'product_name': 'LF-质量报告.txt'},
    )
    assert second.status_code == 200
    allocation_url = f'/api/proposals/{proposal_id}/instruments/{instrument_code}/data-allocation'
    assert client.delete(allocation_url, headers=owner_headers, json={'product_name': 'LF-观测清单.csv'}).status_code == 403
    assert client.delete(allocation_url, headers=manager_headers, json={'product_name': '不存在.csv'}).status_code == 404

    first_revoke = client.delete(allocation_url, headers=manager_headers, json={'product_name': 'LF-观测清单.csv'})
    assert first_revoke.status_code == 200
    assert first_revoke.get_json()['proposal_state'] == '数据已授权'
    remaining = client.get(f'/api/proposals/{proposal_id}', headers=owner_headers).get_json()
    assert [product['name'] for product in remaining['instruments'][0]['scheduling_feedback']['data_products']] == ['LF-质量报告.txt']

    last_revoke = client.delete(allocation_url, headers=manager_headers, json={'product_name': 'LF-质量报告.txt'})
    assert last_revoke.status_code == 200
    assert last_revoke.get_json()['proposal_state'] == '待分配观测数据'
    waiting = client.get(f'/api/proposals/{proposal_id}', headers=owner_headers).get_json()
    assert waiting['instruments'][0]['scheduling_feedback'] == {}
    assert waiting['status'] == '待分配观测数据'
    assert waiting['history'][-1]['transition_name'] == 'revoke_data'


def test_proposal_document_downloads_as_pdf(app, client):
    with app.app_context():
        proposal_type = ProposalType.query.first()
        owner = make_user('pdf-owner', 'Proposer')
        draft = WorkflowState.query.filter_by(
            workflow_id=proposal_type.workflow_id, name='Draft'
        ).one()
        proposal = Proposal(
            title='PDF proposal record',
            abstract='A printable proposal record.',
            author=owner,
            proposal_type=proposal_type,
            current_state=draft,
        )
        db.session.add(proposal)
        db.session.flush()
        db.session.add(ProposalPhase(proposal=proposal, phase='phase1', payload={'objective': 'verify PDF'}))
        db.session.commit()
        proposal_id = proposal.id

    headers = {'x-access-token': login(client, 'pdf-owner')}
    response = client.get(f'/api/proposals/{proposal_id}/document', headers=headers)
    assert response.status_code == 200
    assert response.content_type == 'application/pdf'
    assert response.data.startswith(b'%PDF-1.4')


def test_proposal_document_accepts_download_token_query(app, client):
    with app.app_context():
        proposal_type = ProposalType.query.first()
        owner = make_user('pdf-query-owner', 'Proposer')
        draft = WorkflowState.query.filter_by(
            workflow_id=proposal_type.workflow_id, name='Draft'
        ).one()
        proposal = Proposal(
            title='PDF query proposal record', abstract='Query-token PDF download.',
            author=owner, proposal_type=proposal_type, current_state=draft,
        )
        db.session.add(proposal)
        db.session.commit()
        proposal_id = proposal.id
    token = login(client, 'pdf-query-owner')
    response = client.get(f'/api/proposals/{proposal_id}/document?access_token={token}')
    assert response.status_code == 200
    assert response.content_type == 'application/pdf'
