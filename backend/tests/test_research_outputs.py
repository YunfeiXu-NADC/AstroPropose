import base64
from datetime import datetime, timedelta

from app import db
from app.core.seasons import format_beijing_datetime
from app.models.models import Instrument, Proposal, ProposalInstrument, ProposalType, ResearchOutput, Role, User, WorkflowState


FILE = {
    'name': 'paper.pdf',
    'data_url': 'data:application/pdf;base64,' + base64.b64encode(b'%PDF-demo').decode(),
}


def _token(client, username, role=None):
    user = User(username=username, email=f'{username}@example.com', is_active=True)
    user.set_password('password123')
    if role:
        user.roles.append(Role.query.filter_by(name=role).first())
    db.session.add(user)
    db.session.commit()
    return client.post('/api/auth/login', json={'username': username, 'password': 'password123'}).get_json()['token'], user


def _headers(token):
    return {'x-access-token': token}


def _proposal(user, has_data=False):
    proposal_type = ProposalType.query.first()
    proposal_type.name = 'DSL 研究提案'
    state = WorkflowState(name='待分配观测数据', workflow=proposal_type.workflow)
    db.session.add(state)
    proposal = Proposal(title='测试研究提案', user_id=user.id,
                        proposal_type_id=proposal_type.id, current_state_id=state.id)
    db.session.add(proposal)
    db.session.flush()
    db.session.add(ProposalInstrument(proposal_id=proposal.id, instrument_id=Instrument.query.first().id,
                                      scheduling_feedback={'data_products': [{'name': '数据'}]} if has_data else {}))
    db.session.commit()
    return proposal.id


def test_post_data_publication_lifecycle_and_permissions(client, app):
    proposer_token, author = _token(client, 'paper-author')
    reviewer_token, _ = _token(client, 'science-user')
    chair_token, _ = _token(client, 'committee-user', 'Panel Chair')
    proposal_id = _proposal(author)
    url = f'/api/results/proposal/{proposal_id}'

    payload = {'title': '研究成果', 'summary': '发现摘要', 'draft_file': FILE}
    assert client.post(url, headers=_headers(proposer_token), json=payload).status_code == 409
    proposal = Proposal.query.get(proposal_id)
    instrument = proposal.instruments.first()
    instrument.scheduling_feedback = {'data_products': [{'name': '数据'}]}
    proposal.current_state = WorkflowState(name='数据已授权', workflow=proposal.proposal_type.workflow)
    db.session.commit()
    owner_list = client.get('/api/proposals/', headers=_headers(proposer_token)).get_json()
    assert owner_list[0]['can_submit_result'] is True
    assert client.get(url, headers=_headers(proposer_token)).get_json()['can_start'] is True

    assert client.post(url, headers=_headers(reviewer_token), json=payload).status_code == 403
    created = client.post(url, headers=_headers(proposer_token), json=payload)
    assert created.status_code == 201
    assert created.get_json()['output']['status'] == 'feedback_open'
    assert 'data_url' not in str(created.get_json())
    assert client.post(url, headers=_headers(proposer_token), json=payload).status_code == 409
    assert client.get('/api/proposals/', headers=_headers(proposer_token)).get_json()[0]['can_submit_result'] is False
    listed = client.get('/api/results/', headers=_headers(reviewer_token)).get_json()
    assert listed['open_feedback_count'] == 1
    assert listed['results'][0]['title'] == '研究成果'
    assert client.get(f'{url}/files/draft', headers=_headers(reviewer_token)).data == b'%PDF-demo'

    comments_url = f'{url}/comments'
    assert client.post(comments_url, headers=_headers(proposer_token), json={'body': '本人意见'}).status_code == 403
    assert client.post(comments_url, headers=_headers(reviewer_token), json={'body': '建议补充分析'}).status_code == 201
    revision_url = f'{url}/revision'
    revision = {'revision_note': '已补充', 'revised_file': FILE}
    assert client.post(revision_url, headers=_headers(proposer_token), json=revision).status_code == 409
    output = ResearchOutput.query.filter_by(proposal_id=proposal_id).first()
    output.feedback_deadline = datetime.utcnow() - timedelta(minutes=1)
    db.session.commit()
    assert client.post(comments_url, headers=_headers(reviewer_token), json={'body': '过期意见'}).status_code == 409
    assert client.get(url, headers=_headers(proposer_token)).get_json()['output']['status'] == 'revision_pending'
    assert client.post(revision_url, headers=_headers(proposer_token), json=revision).status_code == 200

    decision_url = f'{url}/committee-decision'
    assert client.post(decision_url, headers=_headers(proposer_token), json={'decision': 'approve', 'note': '可发表'}).status_code == 403
    assert client.post(decision_url, headers=_headers(reviewer_token), json={'decision': 'approve', 'note': '可发表'}).status_code == 403
    assert client.post(f'{url}/journal-submission', headers=_headers(proposer_token), json={'journal_name': '测试期刊'}).status_code == 409
    assert client.post(decision_url, headers=_headers(chair_token), json={'decision': 'revise', 'note': '补一张图'}).status_code == 200
    assert client.post(revision_url, headers=_headers(proposer_token), json=revision).status_code == 200
    assert client.post(decision_url, headers=_headers(chair_token), json={'decision': 'approve', 'note': '同意投稿'}).status_code == 200
    assert client.post(f'{url}/journal-submission', headers=_headers(proposer_token), json={'journal_name': '测试期刊'}).status_code == 200
    final = {'journal_accepted_at': format_beijing_datetime(datetime.utcnow())[:10],
             'publication_reference': '测试期刊 2026; DOI:demo', 'final_file': FILE}
    assert client.post(f'{url}/final-publication', headers=_headers(proposer_token), json=final).status_code == 200
    assert client.get(url, headers=_headers(reviewer_token)).get_json()['output']['status'] == 'published'


def test_opportunity_receives_data_before_close_and_becomes_read_only_after_close(client, app):
    manager_token, _ = _token(client, 'data-manager', 'Proposal Manager')
    scheduler_token, _ = _token(client, 'schedule-user', 'Instrument Scheduler')
    author_token, author = _token(client, 'opportunity-author')
    workflow = ProposalType.query.first().workflow
    workflow.definition = {'initial_state': '已推送观测编排', 'transitions': [
        {'name': 'record_feedback', 'from': '已推送观测编排', 'to': '执行反馈',
         'roles': ['Instrument Scheduler']},
    ]}
    proposal_type = ProposalType(name='DSL 机遇观测提案', workflow=workflow)
    state = WorkflowState(name='已推送观测编排', workflow=workflow)
    closed_state = WorkflowState(name='执行反馈', workflow=workflow)
    db.session.add_all([proposal_type, state, closed_state])
    db.session.flush()
    proposal = Proposal(title='机遇观测成果', user_id=author.id,
                        proposal_type_id=proposal_type.id, current_state_id=state.id)
    db.session.add(proposal)
    db.session.flush()
    original_feedback = {'status': 'completed', 'summary': '观测完成', 'completed_at': '2026-10-20'}
    db.session.add(ProposalInstrument(proposal_id=proposal.id, instrument_id=Instrument.query.first().id,
                                      status='completed', scheduling_feedback=original_feedback))
    db.session.commit()
    url = f'/api/proposals/{proposal.id}/instruments/LF/data-allocation'
    assert proposal.id in [item['id'] for item in client.get('/api/proposals/?scope=data_allocation', headers=_headers(manager_token)).get_json()]
    assert client.post(f'/api/results/proposal/{proposal.id}', headers=_headers(author_token), json={
        'title': '成果', 'summary': '摘要', 'draft_file': FILE,
    }).status_code == 409
    transition_url = f'/api/proposals/{proposal.id}/transitions'
    assert client.post(transition_url, headers=_headers(scheduler_token), json={'transition': 'record_feedback'}).status_code == 409
    response = client.post(url, headers=_headers(manager_token), json={
        'observation_id': 'OBS-1', 'product_name': '观测数据',
    })
    assert response.status_code == 200
    feedback = proposal.instruments.first().scheduling_feedback
    assert feedback['status'] == 'completed'
    assert feedback['summary'] == '观测完成'
    assert feedback['data_products'][0]['name'] == '观测数据'
    assert client.post(f'/api/results/proposal/{proposal.id}', headers=_headers(author_token), json={
        'title': '成果', 'summary': '摘要', 'draft_file': FILE,
    }).status_code == 409
    assert client.post(transition_url, headers=_headers(scheduler_token), json={'transition': 'record_feedback'}).status_code == 200
    assert proposal.current_state.name == '执行反馈'
    assert client.post(f'/api/results/proposal/{proposal.id}', headers=_headers(author_token), json={
        'title': '成果', 'summary': '摘要', 'draft_file': FILE,
    }).status_code == 201
    assert client.post(url, headers=_headers(manager_token), json={
        'observation_id': 'OBS-2', 'product_name': '补充分配',
    }).status_code == 409
    assert client.delete(url, headers=_headers(manager_token), json={'product_name': '观测数据'}).status_code == 409
    assert proposal.instruments.first().scheduling_feedback == feedback
