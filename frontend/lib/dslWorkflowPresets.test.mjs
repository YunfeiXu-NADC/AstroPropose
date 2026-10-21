import assert from 'node:assert/strict';
import test from 'node:test';

import { DSL_WORKFLOW_PRESETS } from './dslWorkflowPresets.mjs';

test('DSL presets provide distinct research and opportunity outcomes', () => {
  assert.equal(DSL_WORKFLOW_PRESETS.length, 2);
  const research = DSL_WORKFLOW_PRESETS.find((item) => item.key === 'research');
  const opportunity = DSL_WORKFLOW_PRESETS.find((item) => item.key === 'opportunity');

  assert.ok(research.definition.nodes.some((node) => node.data.label === '数据已授权'));
  assert.ok(research.definition.nodes.some((node) => node.data.label === '待分配观测数据'));
  assert.ok(!research.definition.display_stages.some((stage) => stage.includes('观测编排') || stage.includes('观测执行')));
  assert.ok(!research.definition.transitions.some((action) => action.name === 'schedule' || action.name === 'start_observation'));
  assert.equal(research.definition.transitions.find((action) => action.name === 'committee_approve').to, '待分配观测数据');
  assert.equal(research.definition.transitions.find((action) => action.name === 'grant_data').from, '待分配观测数据');
  assert.ok(opportunity.definition.nodes.some((node) => node.data.label === '已推送观测编排'));
  assert.ok(opportunity.definition.display_stages.includes('观测编排与执行'));
  assert.ok(opportunity.definition.display_stages.includes('执行结果'));
  assert.ok(!opportunity.definition.nodes.some((node) => node.data.label === '数据已授权'));
  assert.ok(!research.definition.display_stages.includes('结果确认'));
  assert.ok(!opportunity.definition.display_stages.includes('结果确认'));
  assert.ok(!research.definition.transitions.some((action) => action.name === 'complete'));
  assert.ok(!opportunity.definition.transitions.some((action) => action.name === 'complete'));
  assert.deepEqual(research.definition.stage_groups.数据授权, ['数据已授权', '已完成']);
  assert.deepEqual(opportunity.definition.stage_groups.执行结果, ['执行反馈', '已完成']);
});

test('visibility analysis stays outside approval states', () => {
  for (const preset of DSL_WORKFLOW_PRESETS) {
    const stateNames = preset.definition.nodes.map((node) => node.data.label);
    assert.ok(!stateNames.includes('可见性计算'));
    assert.equal(preset.definition.initial_state, '草稿');
  }
});

