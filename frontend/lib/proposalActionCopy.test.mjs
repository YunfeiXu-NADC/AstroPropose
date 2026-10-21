import assert from 'node:assert/strict';
import test from 'node:test';

import { DSL_WORKFLOW_PRESETS } from './dslWorkflowPresets.mjs';
import { getActionButtonLabel, getActionPanelCopy } from './proposalActionCopy.mjs';

test('every DSL transition has a concrete stage task and action name', () => {
  for (const preset of DSL_WORKFLOW_PRESETS) {
    for (const transition of preset.definition.transitions) {
      const panel = getActionPanelCopy(transition.from);
      const button = getActionButtonLabel(transition, preset.key);
      assert.notEqual(panel.title, transition.from);
      assert.equal(typeof panel.description, 'string');
      assert.ok(button.length > 0);
      assert.doesNotMatch(`${panel.title} ${button}`, /可执行操作|完成反馈/);
    }
  }
});
