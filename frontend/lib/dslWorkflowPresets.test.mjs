import assert from 'node:assert/strict';
import test from 'node:test';

import { DSL_WORKFLOW_PRESETS } from './dslWorkflowPresets.mjs';

test('DSL presets provide distinct research and opportunity outcomes', () => {
  assert.equal(DSL_WORKFLOW_PRESETS.length, 2);
  const research = DSL_WORKFLOW_PRESETS.find((item) => item.key === 'research');
  const opportunity = DSL_WORKFLOW_PRESETS.find((item) => item.key === 'opportunity');

  assert.ok(research.definition.nodes.some((node) => node.data.label === '数据已授权'));
  assert.ok(research.definition.nodes.some((node) => node.data.label === '手动数据关联'));
  assert.ok(opportunity.definition.nodes.some((node) => node.data.label === '已推送观测编排'));
  assert.ok(!opportunity.definition.nodes.some((node) => node.data.label === '数据已授权'));
});

test('visibility analysis stays outside approval states', () => {
  for (const preset of DSL_WORKFLOW_PRESETS) {
    const stateNames = preset.definition.nodes.map((node) => node.data.label);
    assert.ok(!stateNames.includes('可见性计算'));
    assert.equal(preset.definition.initial_state, '草稿');
  }
});

