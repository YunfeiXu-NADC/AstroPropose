import test from 'node:test';
import assert from 'node:assert/strict';

import { createExampleWorkflowPreset } from './workflowPreset.mjs';

test('example workflow preset includes a real submit_phase1 workflow effect', () => {
  const preset = createExampleWorkflowPreset();
  const submitTransition = preset.transitions.find((transition) => transition.name === 'submit_phase1');

  assert.ok(submitTransition);
  assert.deepEqual(submitTransition.conditions, {
    phase_status: {
      phase: 'phase1',
      status: 'draft',
    },
  });
  assert.deepEqual(submitTransition.effects, {
    phase: 'phase1',
    set_phase_status: 'submitted',
    record_submission_time: true,
  });
});
