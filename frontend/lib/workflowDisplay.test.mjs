import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getProposalKind,
  getProposalTypePresentation,
  getWorkflowDisplayStage,
  getWorkflowStages,
} from './workflowDisplay.mjs';

test('proposal kinds distinguish research and opportunity targets', () => {
  assert.equal(getProposalKind('研究提案'), 'research');
  assert.equal(getProposalKind('机遇目标'), 'opportunity');
  assert.equal(getProposalKind('Target of Opportunity'), 'opportunity');
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

test('proposal presentation keeps type-specific outcomes separate', () => {
  assert.match(getProposalTypePresentation({ name: '研究提案' }).outcome, /数据授权/);
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
