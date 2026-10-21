"""Guard the identity and evidence checks for bundled demo proposals."""

from datetime import datetime, timedelta
from types import SimpleNamespace

from audit_proposals import DEMO_CATALOG, audit
from seed_dsl_demo_proposals import SAMPLES


class Collection:
    def __init__(self, items):
        self.items = items

    def all(self):
        return self.items

    def filter_by(self, **values):
        return Collection([
            item for item in self.items
            if all(getattr(item, key) == value for key, value in values.items())
        ])


def proposal(state='待科学评审', *, prior_review=True, data_product=False):
    now = datetime(2026, 10, 19, 0, 0)
    reviews = [SimpleNamespace(review_type='scientific', status='assigned', submitted_at=None)]
    if prior_review:
        reviews.append(SimpleNamespace(review_type='technical', status='submitted', submitted_at=now - timedelta(days=1)))
    return SimpleNamespace(
        id=21,
        title='宇宙黎明信号搜索',
        current_state=SimpleNamespace(name=state, workflow_id=1),
        proposal_type=SimpleNamespace(name='DSL 研究提案', workflow_id=1),
        phases=Collection([SimpleNamespace(phase='phase1', status='submitted', submitted_at=now - timedelta(days=2))]),
        instruments=Collection([SimpleNamespace(
            scheduling_feedback={'data_products': [{'name': 'demo.csv'}]} if data_product else {},
            applicant_confirmed_at=None,
        )]),
        reviews=Collection(reviews),
    )


def test_demo_catalog_has_one_stable_identity_per_sample():
    titles = [sample['title'] for sample in SAMPLES]
    assert len(titles) == len(set(titles)) == len(DEMO_CATALOG) == 25
    assert set(titles) == {title for title, _ in DEMO_CATALOG.values()}
    assert DEMO_CATALOG[8][0] == '后发座星系团射电晕观测'


def test_opportunity_demo_includes_a_completed_observation_result():
    completed = [
        sample for sample in SAMPLES
        if '机遇' in sample['type'] and sample['state'] == '执行反馈'
    ]
    assert len(completed) == 1
    result = completed[0]['feedback']
    assert result['status'] == 'completed'
    assert result['completed_at']
    assert result['summary'].startswith('模拟执行结果')


def test_audit_catches_missing_prior_review():
    issues = audit([proposal(prior_review=False)], now=datetime(2026, 10, 19))
    assert any('缺少已提交的 technical 意见' in issue for issue in issues)


def test_audit_catches_data_authorization_without_product():
    issues = audit([proposal(state='数据已授权')], now=datetime(2026, 10, 19))
    assert any('未分配数据产品' in issue for issue in issues)


def test_audit_accepts_consistent_review_stage():
    assert audit([proposal()], now=datetime(2026, 10, 19)) == []
