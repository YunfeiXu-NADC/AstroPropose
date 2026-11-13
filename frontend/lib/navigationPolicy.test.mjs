import assert from 'node:assert/strict';
import test from 'node:test';

import { getWorkspaceEntriesForRoles } from './navigationPolicy.mjs';

const labels = (roles) => getWorkspaceEntriesForRoles(roles).map((entry) => entry.label);

test('proposal applications and research results are available to signed-in users', () => {
  assert.deepEqual(labels(['Proposer']), ['提案申请', '科研成果公示']);
  assert.equal(getWorkspaceEntriesForRoles(['Proposer'])[0].href, '/dashboard/proposals');
  assert.equal(getWorkspaceEntriesForRoles(['Proposer'])[1].href, '/dashboard/results');
  assert.deepEqual(getWorkspaceEntriesForRoles([], true).map((entry) => entry.label), ['提案申请', '科研成果公示']);
  assert.deepEqual(getWorkspaceEntriesForRoles([], false), []);
});

test('technical expert keeps proposal directories alongside specialist tasks', () => {
  assert.deepEqual(labels(['Technical Expert']), ['提案申请', '科研成果公示', '评审任务', '观测编排']);
});

test('scientific reviewer keeps proposal directories alongside review tasks', () => {
  assert.deepEqual(labels(['Reviewer']), ['提案申请', '科研成果公示', '评审任务']);
});

test('admin can monitor review tasks in addition to proposal management', () => {
  assert.deepEqual(labels(['Admin']), ['提案申请', '科研成果公示', '评审任务', '观测编排', '数据分配']);
});

test('proposal manager keeps proposal directories alongside data allocation', () => {
  assert.deepEqual(labels(['Proposal Manager']), ['提案申请', '科研成果公示', '数据分配']);
});

test('review permission adds tasks without hiding proposal workspaces', () => {
  assert.deepEqual(labels(['Proposer', 'Reviewer']), ['提案申请', '科研成果公示', '评审任务']);
});

test('committee and scheduler also keep their own proposal directories', () => {
  assert.deepEqual(labels(['Panel Chair']), ['提案申请', '科研成果公示', '评审任务']);
  assert.deepEqual(labels(['Instrument Scheduler']), ['提案申请', '科研成果公示', '观测编排']);
});
