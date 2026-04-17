import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePhase1TemplateId, resolveWorkflowNode } from './proposalFormConfig.mjs';

test('resolveWorkflowNode finds the node matching the state label', () => {
  const definition = {
    nodes: [
      { data: { label: 'Draft', formTemplateId: 11 } },
      { data: { label: 'Submitted', formTemplateId: 22 } },
    ],
  };

  assert.deepEqual(resolveWorkflowNode(definition, 'Submitted'), {
    data: { label: 'Submitted', formTemplateId: 22 },
  });
});

test('resolvePhase1TemplateId returns the initial state form template id', () => {
  const definition = {
    initial_state: 'Draft',
    nodes: [
      { data: { label: 'Draft', formTemplateId: 101 } },
      { data: { label: 'Submitted', formTemplateId: 202 } },
    ],
  };

  assert.equal(resolvePhase1TemplateId(definition), 101);
});

test('resolvePhase1TemplateId returns null when the workflow has no bound form', () => {
  const definition = {
    initial_state: 'Draft',
    nodes: [{ data: { label: 'Draft' } }],
  };

  assert.equal(resolvePhase1TemplateId(definition), null);
});
