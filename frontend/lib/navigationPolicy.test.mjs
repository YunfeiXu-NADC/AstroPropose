import assert from 'node:assert/strict';
import test from 'node:test';

import { getWorkspaceEntriesForRoles } from './navigationPolicy.mjs';

const labels = (roles) => getWorkspaceEntriesForRoles(roles).map((entry) => entry.label);

test('proposer sees only the two proposal directories', () => {
  assert.deepEqual(labels(['Proposer']), ['研究提案', '机遇观测']);
});

test('technical expert sees assigned review tasks and observation feedback', () => {
  assert.deepEqual(labels(['Technical Expert']), ['评审任务', '观测反馈']);
});

test('reviewer sees only review tasks', () => {
  assert.deepEqual(labels(['Reviewer']), ['评审任务']);
});

test('admin can monitor review tasks in addition to proposal management', () => {
  assert.deepEqual(labels(['Admin']), ['研究提案', '机遇观测', '评审任务', '观测反馈']);
});
