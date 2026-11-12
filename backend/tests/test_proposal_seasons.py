from datetime import datetime, timedelta

from app import db
from app.core.seasons import format_beijing_datetime
from app.models.models import (
    Instrument, Proposal, ProposalInstrument, ProposalPhase, ProposalSeason,
    ProposalType, User, Workflow, WorkflowState,
)


def headers(token):
    return {'x-access-token': token}


def test_only_admin_can_create_batch_and_windows_cannot_overlap(app, client, proposer_token, admin_token):
    now = datetime.utcnow()
    payload = {
        'name': '下一年度批次',
        'start_date': format_beijing_datetime(now + timedelta(days=3)),
        'end_date': format_beijing_datetime(now + timedelta(days=4)),
        'data_release_deadline': format_beijing_datetime(now + timedelta(days=5)),
    }
    assert client.post('/api/seasons/', json=payload, headers=headers(proposer_token)).status_code == 403
    response = client.post('/api/seasons/', json=payload, headers=headers(admin_token))
    assert response.status_code == 201, response.get_json()
    assert response.get_json()['status'] == 'upcoming'
    assert client.post('/api/seasons/', json={**payload, 'name': '重叠批次'}, headers=headers(admin_token)).status_code == 409
    invalid = {**payload, 'name': '错误时间', 'data_release_deadline': payload['start_date']}
    assert client.post('/api/seasons/', json=invalid, headers=headers(admin_token)).status_code == 400


def test_new_proposal_belongs_to_open_batch_and_submission_stops_at_deadline(app, client, proposer_token, admin_token):
    with app.app_context():
        type_id = ProposalType.query.first().id
        season = ProposalSeason.query.filter_by(name='测试批次').one()
        season_id = season.id
    response = client.post('/api/proposals/', json={
        'title': '批次内草稿', 'proposal_type_id': type_id, 'save_as_draft': True,
    }, headers=headers(proposer_token))
    assert response.status_code == 201, response.get_json()
    proposal_id = response.get_json()['id']
    detail = client.get(f'/api/proposals/{proposal_id}', headers=headers(proposer_token)).get_json()
    assert detail['season']['id'] == season_id

    updated = client.patch(f'/api/seasons/{season_id}', json={
        'end_date': format_beijing_datetime(datetime.utcnow() - timedelta(minutes=1)),
    }, headers=headers(admin_token))
    assert updated.status_code == 200, updated.get_json()
    season_list = client.get('/api/seasons/', headers=headers(proposer_token)).get_json()
    assert season_list[0]['status'] == 'closed', season_list
    actions = client.get(f'/api/proposals/{proposal_id}/transitions', headers=headers(proposer_token)).get_json()['transitions']
    assert not any(action['name'] == 'submit_phase1' for action in actions)
    rejected = client.post(f'/api/proposals/{proposal_id}/transitions', json={'transition': 'submit_phase1'}, headers=headers(proposer_token))
    assert rejected.status_code == 409


def test_no_open_batch_prevents_new_application(app, client, proposer_token):
    with app.app_context():
        type_id = ProposalType.query.first().id
        ProposalSeason.query.delete()
        db.session.commit()
    response = client.post('/api/proposals/', json={
        'proposal_type_id': type_id, 'save_as_draft': True,
    }, headers=headers(proposer_token))
    assert response.status_code == 409
    assert '批次' in response.get_json()['message']


def test_draft_can_move_only_to_an_open_batch(app, client, proposer_token):
    with app.app_context():
        type_id = ProposalType.query.first().id
        old_season = ProposalSeason.query.filter_by(name='测试批次').one()
        old_season_id = old_season.id
    created = client.post('/api/proposals/', json={
        'title': '待转批次草稿', 'proposal_type_id': type_id, 'season_id': old_season_id,
        'save_as_draft': True,
    }, headers=headers(proposer_token))
    assert created.status_code == 201, created.get_json()
    proposal_id = created.get_json()['id']

    with app.app_context():
        now = datetime.utcnow()
        old_season = db.session.get(ProposalSeason, old_season_id)
        old_season.end_date = now - timedelta(minutes=2)
        db.session.commit()

    url = f'/api/proposals/{proposal_id}'
    assert client.patch(url, json={'season_id': old_season_id}, headers=headers(proposer_token)).status_code == 409

    with app.app_context():
        now = datetime.utcnow()
        new_season = ProposalSeason(
            name='新开放批次',
            start_date=now - timedelta(minutes=1),
            end_date=now + timedelta(days=1),
            data_release_deadline=now + timedelta(days=2),
        )
        db.session.add(new_season)
        db.session.commit()
        new_season_id = new_season.id

    changed = client.patch(url, json={'season_id': new_season_id}, headers=headers(proposer_token))
    assert changed.status_code == 200, changed.get_json()
    detail = client.get(url, headers=headers(proposer_token)).get_json()
    assert detail['season']['id'] == new_season_id


def test_data_release_deadline_freezes_all_authorization_changes(app, client, proposer_token, admin_token):
    with app.app_context():
        workflow = Workflow(name='批次数据测试流程', definition={'initial_state': '待分配观测数据', 'transitions': []})
        state = WorkflowState(name='待分配观测数据', workflow=workflow)
        proposal_type = ProposalType(name='DSL 研究提案', workflow=workflow)
        owner = User.query.filter_by(username='proposer').one()
        season = ProposalSeason.query.filter_by(name='测试批次').one()
        instrument = Instrument.query.first()
        proposal = Proposal(title='批次内数据分配', abstract='摘要', author=owner, proposal_type=proposal_type, current_state=state, season=season)
        db.session.add_all([workflow, state, proposal_type, proposal])
        db.session.flush()
        db.session.add(ProposalPhase(proposal=proposal, phase='phase1', status='submitted'))
        db.session.add(ProposalInstrument(proposal=proposal, instrument=instrument, phase='phase1'))
        db.session.commit()
        proposal_id, instrument_code, season_id = proposal.id, instrument.code, season.id

    url = f'/api/proposals/{proposal_id}/instruments/{instrument_code}/data-allocation'
    allocated = client.post(url, json={'observation_id': 'OBS-1', 'product_name': '产品一'}, headers=headers(admin_token))
    assert allocated.status_code == 200, allocated.get_json()
    with app.app_context():
        season = db.session.get(ProposalSeason, season_id)
        season.data_release_deadline = datetime.utcnow() - timedelta(minutes=1)
        db.session.commit()

    assert client.post(url, json={'observation_id': 'OBS-2', 'product_name': '产品二'}, headers=headers(admin_token)).status_code == 409
    detail = client.get(f'/api/proposals/{proposal_id}', headers=headers(admin_token)).get_json()
    assert detail['permissions']['can_allocate_data'] is False
    assert detail['permissions']['can_manage_data'] is False
    assert detail['instruments'][0]['scheduling_feedback']['data_products'][0]['name'] == '产品一'
    assert client.post(f'/api/proposals/{proposal_id}/transitions', json={'transition': 'grant_data'}, headers=headers(admin_token)).status_code == 409
    revoked = client.delete(url, json={'product_name': '产品一'}, headers=headers(admin_token))
    assert revoked.status_code == 409, revoked.get_json()
    unchanged = client.get(f'/api/proposals/{proposal_id}', headers=headers(proposer_token)).get_json()
    assert unchanged['instruments'][0]['scheduling_feedback']['data_products'][0]['name'] == '产品一'


def test_observation_feedback_cannot_change_existing_data_authorization(app, client, admin_token):
    with app.app_context():
        workflow = Workflow(name='机遇观测反馈测试流程', definition={'initial_state': '已推送观测编排', 'transitions': []})
        state = WorkflowState(name='已推送观测编排', workflow=workflow)
        proposal_type = ProposalType(name='DSL 机遇观测提案', workflow=workflow)
        owner = User.query.filter_by(username='admin-user').one()
        season = ProposalSeason.query.filter_by(name='测试批次').one()
        season.data_release_deadline = datetime.utcnow() - timedelta(minutes=1)
        instrument = Instrument.query.first()
        proposal = Proposal(title='机遇观测', abstract='摘要', author=owner,
                            proposal_type=proposal_type, current_state=state, season=season)
        entry = ProposalInstrument(proposal=proposal, instrument=instrument, phase='phase1',
                                   scheduling_feedback={'data_products': [{'name': '原产品'}]})
        db.session.add_all([workflow, state, proposal_type, proposal, entry])
        db.session.commit()
        proposal_id, instrument_code = proposal.id, instrument.code

    url = f'/api/proposals/{proposal_id}/instruments/{instrument_code}/feedback'
    changed = client.post(url, json={'payload': {'status': 'completed', 'summary': '执行完成',
                                                  'data_products': [{'name': '新产品'}]}}, headers=headers(admin_token))
    assert changed.status_code == 400
    normal = client.post(url, json={'payload': {'status': 'completed', 'summary': '执行完成'}}, headers=headers(admin_token))
    assert normal.status_code == 200
    detail = client.get(f'/api/proposals/{proposal_id}', headers=headers(admin_token)).get_json()
    assert detail['instruments'][0]['scheduling_feedback']['data_products'] == [{'name': '原产品'}]


def _formal_review_proposal(app):
    with app.app_context():
        workflow = Workflow(name='形式审查退回测试流程', definition={
            'initial_state': '待形式审查',
            'transitions': [
                {'name': 'format_revision', 'from': '待形式审查', 'to': '待修改', 'roles': ['Admin']},
                {'name': 'resubmit', 'from': '待修改', 'to': '待形式审查', 'roles': ['Proposer']},
            ],
        })
        formal = WorkflowState(name='待形式审查', workflow=workflow)
        returned = WorkflowState(name='待修改', workflow=workflow)
        proposal_type = ProposalType(name='DSL 研究提案', workflow=workflow)
        owner = User.query.filter_by(username='proposer').one()
        season = ProposalSeason.query.filter_by(name='测试批次').one()
        proposal = Proposal(title='形式审查退回', abstract='摘要', author=owner,
                            proposal_type=proposal_type, current_state=formal, season=season)
        db.session.add_all([workflow, formal, returned, proposal_type, proposal])
        db.session.commit()
        return proposal.id, season.id


def test_formal_return_defaults_to_batch_deadline_and_admin_can_shorten_it(app, client, proposer_token, admin_token):
    proposal_id, season_id = _formal_review_proposal(app)
    with app.app_context():
        season = db.session.get(ProposalSeason, season_id)
        beyond_batch = format_beijing_datetime(season.end_date + timedelta(minutes=1))
        earlier = format_beijing_datetime(datetime.utcnow() + timedelta(hours=1))

    url = f'/api/proposals/{proposal_id}/transitions'
    assert client.post(url, json={'transition': 'format_revision', 'context': {'formal_return_deadline': beyond_batch}}, headers=headers(admin_token)).status_code == 400
    assert client.post(url, json={'transition': 'format_revision'}, headers=headers(proposer_token)).status_code == 403
    returned = client.post(url, json={'transition': 'format_revision'}, headers=headers(admin_token))
    assert returned.status_code == 200, returned.get_json()
    detail = client.get(f'/api/proposals/{proposal_id}', headers=headers(proposer_token)).get_json()
    assert detail['status'] == '待修改'
    assert detail['formal_return_deadline'] == detail['season']['end_date']

    deadline_url = f'/api/proposals/{proposal_id}/formal-return-deadline'
    assert client.patch(deadline_url, json={'deadline': earlier}, headers=headers(proposer_token)).status_code == 403
    assert client.patch(deadline_url, json={'deadline': beyond_batch}, headers=headers(admin_token)).status_code == 400
    updated = client.patch(deadline_url, json={'deadline': earlier}, headers=headers(admin_token))
    assert updated.status_code == 200, updated.get_json()
    assert updated.get_json()['formal_return_deadline'] == earlier
    actions = client.get(url, headers=headers(proposer_token)).get_json()['transitions']
    assert any(item['name'] == 'resubmit' for item in actions)


def test_returned_proposal_cannot_resubmit_after_its_earlier_deadline(app, client, proposer_token, admin_token):
    proposal_id, _ = _formal_review_proposal(app)
    url = f'/api/proposals/{proposal_id}/transitions'
    assert client.post(url, json={'transition': 'format_revision'}, headers=headers(admin_token)).status_code == 200
    with app.app_context():
        proposal = db.session.get(Proposal, proposal_id)
        proposal.data = {**(proposal.data or {}), 'formal_return_deadline': (datetime.utcnow() - timedelta(minutes=1)).isoformat()}
        db.session.commit()
    actions = client.get(url, headers=headers(proposer_token)).get_json()['transitions']
    assert not any(item['name'] == 'resubmit' for item in actions)
    rejected = client.post(url, json={'transition': 'resubmit'}, headers=headers(proposer_token))
    assert rejected.status_code == 409
    assert '最晚提交时间' in rejected.get_json()['message']


def test_admin_can_set_earlier_deadline_while_returning_proposal(app, client, proposer_token, admin_token):
    proposal_id, _ = _formal_review_proposal(app)
    earlier = format_beijing_datetime(datetime.utcnow() + timedelta(hours=1))
    returned = client.post(f'/api/proposals/{proposal_id}/transitions', json={
        'transition': 'format_revision', 'context': {'formal_return_deadline': earlier},
    }, headers=headers(admin_token))
    assert returned.status_code == 200, returned.get_json()
    detail = client.get(f'/api/proposals/{proposal_id}', headers=headers(proposer_token)).get_json()
    assert detail['formal_return_deadline'] == earlier
