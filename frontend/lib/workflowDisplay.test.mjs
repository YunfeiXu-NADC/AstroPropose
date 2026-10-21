import assert from 'node:assert/strict';
import test from 'node:test';

import { DSL_WORKFLOW_PRESETS } from './dslWorkflowPresets.mjs';
import {
  getFinalDecisionLabel,
  getProposalKind,
  getProposalProgressPercent,
  getProposalRowStyle,
  getProposalStatusPresentation,
  getProposalTypePresentation,
  getWorkflowDisplayStage,
  getWorkflowStages,
} from './workflowDisplay.mjs';

test('proposal kinds distinguish research and opportunity targets', () => {
  assert.equal(getProposalKind('研究提案'), 'research');
  assert.equal(getProposalKind('机遇目标'), 'opportunity');
  assert.equal(getProposalKind('Target of Opportunity'), 'opportunity');
});

test('proposal status presentation distinguishes action, rejection, and completion', () => {
  assert.deepEqual(getProposalStatusPresentation('草稿'), { tone: 'draft', label: '草稿' });
  assert.deepEqual(getProposalStatusPresentation('待技术评审'), { tone: 'active', label: '待技术评审' });
  assert.deepEqual(getProposalStatusPresentation('待修改'), { tone: 'revision', label: '已退回' });
  assert.deepEqual(getProposalStatusPresentation('已驳回'), { tone: 'rejected', label: '已驳回' });
  assert.deepEqual(getProposalStatusPresentation('执行反馈'), { tone: 'closed', label: '已办结' });
  assert.deepEqual(getProposalStatusPresentation('数据已授权'), { tone: 'closed', label: '已办结' });
});

test('post-decision stages show approval even when review text is hidden', () => {
  const proposal_type = { name: 'DSL 机遇观测提案' };
  assert.equal(getFinalDecisionLabel({ proposal_type, status: '执行反馈', reviews: [] }), '通过');
  assert.equal(getFinalDecisionLabel({ proposal_type: { name: 'DSL 研究提案' }, status: '数据已授权', reviews: [] }), '通过');
  assert.equal(getFinalDecisionLabel({ proposal_type, status: '待最终决策', reviews: [] }), '未记录结论');
  assert.equal(getFinalDecisionLabel({ proposal_type, status: '已驳回', reviews: [] }), '驳回');
});

test('workflow display stages group detailed business states', () => {
  const definition = {
    display_stages: ['申请准备', '评审决策', '观测编排', '数据反馈'],
    stage_groups: {
      申请准备: ['Draft'],
      评审决策: ['PendingTechnicalReview', 'PendingScienceReview'],
      观测编排: ['ObservationScheduling'],
      数据反馈: ['DataAccessGranted'],
    },
  };
  assert.deepEqual(getWorkflowStages(definition), definition.display_stages);
  assert.equal(getWorkflowDisplayStage(definition, 'PendingScienceReview'), '评审决策');
});

test('rejected proposals end at the final decision instead of result confirmation', () => {
  const definition = {
    display_stages: ['申请提交', '最终决策', '观测编排与执行', '结果确认'],
    stage_groups: { 结果确认: ['已驳回', '执行反馈'] },
  };
  assert.equal(getWorkflowDisplayStage(definition, '已驳回'), '最终决策');
});

test('row background length follows workflow progress and fills for terminal outcomes', () => {
  for (const preset of DSL_WORKFLOW_PRESETS) {
    const definition = preset.definition;
    assert.equal(getProposalProgressPercent(definition, '待形式审查'), 29);
    assert.equal(getProposalProgressPercent(definition, '待科学评审'), 57);
    assert.equal(getProposalProgressPercent(definition, '已驳回'), 100);
    assert.equal(getProposalRowStyle(definition, '已驳回').backgroundSize, '100% 100%');
    assert.match(getProposalRowStyle(definition, '已驳回').backgroundImage, /rgba\(245, 227, 231, 0\)/);
    const finishedStatus = preset.key === 'research' ? '数据已授权' : '执行反馈';
    assert.equal(getProposalProgressPercent(definition, finishedStatus), 100);
    assert.equal(getProposalRowStyle(definition, finishedStatus).backgroundSize, '100% 100%');
  }
});

test('proposal presentation keeps type-specific outcomes separate', () => {
  assert.match(getProposalTypePresentation({ name: '研究提案' }).outcome, /待分配观测数据.*数据下载/);
  assert.match(getProposalTypePresentation({ name: '机遇目标' }).outcome, /评审意见推送/);
});

test('workflow stages follow configured edges', () => {
  const definition = {
    initial_state: 'draft',
    nodes: [
      { id: 'review', data: { label: '科学评审' } },
      { id: 'draft', data: { label: '草稿' } },
      { id: 'technical', data: { label: '技术评审' } },
    ],
    edges: [
      { source: 'draft', target: 'technical' },
      { source: 'technical', target: 'review' },
    ],
  };
  assert.deepEqual(getWorkflowStages(definition), ['草稿', '技术评审', '科学评审']);
});
