function stateNode(id, label, x, y, description, formKey = null, formRequired = false) {
  return {
    id,
    type: 'stateNode',
    position: { x, y },
    data: { label, description, formKey, formRequired },
  };
}

function edge(id, source, target) {
  return { id, source, target, animated: true };
}

const researchDefinition = {
  initial_state: '草稿',
  display_stages: ['申请准备', '评审决策', '观测编排', '数据分配与反馈'],
  stage_groups: {
    申请准备: ['草稿', '待修改'],
    评审决策: ['待形式审查', '待技术评审', '待科学评审', '待委员会决策', '已通过', '已驳回'],
    观测编排: ['观测编排', '观测执行'],
    数据分配与反馈: ['数据匹配', '手动数据关联', '数据已授权', '已完成'],
  },
  nodes: [
    stateNode('draft', '草稿', 40, 150, '提案者填写申请；目标可见性分析在提交前按需调用。', 'research_application', true),
    stateNode('format', '待形式审查', 260, 150, '检查信息完整性、附件与格式。'),
    stateNode('technical', '待技术评审', 480, 150, '技术专家评估仪器、观测条件和可执行性。', 'technical_review', true),
    stateNode('science', '待科学评审', 700, 150, '科学专家独立打分并填写评语。', 'scientific_review', true),
    stateNode('committee', '待委员会决策', 920, 150, '汇总技术与科学评审结果并形成最终决策。', 'committee_decision', true),
    stateNode('approved', '已通过', 1140, 80, '研究提案进入观测编排。'),
    stateNode('rejected', '已驳回', 1140, 270, '向提案者反馈最终意见。'),
    stateNode('revision', '待修改', 700, 340, '提案者按意见修改后重新提交。'),
    stateNode('scheduling', '观测编排', 1360, 80, '提案管理员和编排负责人安排观测。'),
    stateNode('observing', '观测执行', 1580, 80, '跟踪观测任务与数据生成状态。'),
    stateNode('matching', '数据匹配', 1800, 80, '系统匹配观测数据与研究提案。'),
    stateNode('manual', '手动数据关联', 1800, 270, '元数据匹配失败时由管理员人工绑定。'),
    stateNode('access', '数据已授权', 2020, 80, '为提案者授予数据集访问权限。'),
    stateNode('completed', '已完成', 2240, 80, '提案者获得摘要、链接并提交反馈。'),
  ],
  edges: [
    edge('r1', 'draft', 'format'), edge('r2', 'format', 'technical'), edge('r3', 'technical', 'science'),
    edge('r4', 'science', 'committee'), edge('r5', 'committee', 'approved'), edge('r6', 'committee', 'rejected'),
    edge('r7', 'format', 'revision'), edge('r8', 'technical', 'revision'), edge('r9', 'committee', 'revision'),
    edge('r10', 'revision', 'format'), edge('r11', 'approved', 'scheduling'), edge('r12', 'scheduling', 'observing'),
    edge('r13', 'observing', 'matching'), edge('r14', 'matching', 'access'), edge('r15', 'matching', 'manual'),
    edge('r16', 'manual', 'access'), edge('r17', 'access', 'completed'),
  ],
  transitions: [
    { name: 'submit', label: '提交形式审查', from: '草稿', to: '待形式审查', roles: ['Proposer'], effects: { phase: 'phase1', set_phase_status: 'submitted', record_submission_time: true } },
    { name: 'format_pass', label: '形式审查通过', from: '待形式审查', to: '待技术评审', roles: ['Admin'] },
    { name: 'format_revision', label: '退回修改', from: '待形式审查', to: '待修改', roles: ['Admin'] },
    { name: 'technical_pass', label: '技术评审通过', from: '待技术评审', to: '待科学评审', roles: ['Technical Expert', 'Admin'] },
    { name: 'technical_revision', label: '技术意见退回', from: '待技术评审', to: '待修改', roles: ['Technical Expert', 'Admin'] },
    { name: 'science_complete', label: '完成科学评审', from: '待科学评审', to: '待委员会决策', roles: ['Reviewer', 'Admin'] },
    { name: 'committee_approve', label: '委员会批准', from: '待委员会决策', to: '已通过', roles: ['Panel Chair', 'Admin'] },
    { name: 'committee_reject', label: '委员会驳回', from: '待委员会决策', to: '已驳回', roles: ['Panel Chair', 'Admin'] },
    { name: 'committee_revision', label: '委员会要求修改', from: '待委员会决策', to: '待修改', roles: ['Panel Chair', 'Admin'] },
    { name: 'resubmit', label: '重新提交', from: '待修改', to: '待形式审查', roles: ['Proposer'] },
    { name: 'schedule', label: '进入观测编排', from: '已通过', to: '观测编排', roles: ['Admin'] },
    { name: 'start_observation', label: '开始观测', from: '观测编排', to: '观测执行', roles: ['Instrument Scheduler', 'Admin'] },
    { name: 'finish_observation', label: '观测完成', from: '观测执行', to: '数据匹配', roles: ['Instrument Scheduler', 'Admin'] },
    { name: 'grant_data', label: '数据匹配并授权', from: '数据匹配', to: '数据已授权', roles: ['Admin'] },
    { name: 'manual_binding', label: '转人工关联', from: '数据匹配', to: '手动数据关联', roles: ['Admin'] },
    { name: 'finish_binding', label: '完成人工关联', from: '手动数据关联', to: '数据已授权', roles: ['Admin'] },
    { name: 'complete', label: '确认完成', from: '数据已授权', to: '已完成', roles: ['Proposer', 'Admin'] },
  ],
};

const opportunityDefinition = {
  initial_state: '草稿',
  display_stages: ['申请准备', '快速评审', '推送观测编排', '结果反馈'],
  stage_groups: {
    申请准备: ['草稿', '待修改'],
    快速评审: ['待形式审查', '待技术评审', '待快速科学评审', '待快速决策', '已通过', '已驳回'],
    推送观测编排: ['已推送观测编排'],
    结果反馈: ['执行反馈', '已完成'],
  },
  nodes: [
    stateNode('draft', '草稿', 40, 150, '填写机遇目标；可见性分析在提交前按需调用。', 'opportunity_application', true),
    stateNode('format', '待形式审查', 260, 150, '快速检查必填信息、目标与附件。'),
    stateNode('technical', '待技术评审', 480, 150, '技术专家快速确认观测可执行性。', 'technical_review', true),
    stateNode('science', '待快速科学评审', 700, 150, '科学专家按时效要求完成快速评审。', 'rapid_scientific_review', true),
    stateNode('decision', '待快速决策', 920, 150, '汇总意见并做出在线决策。', 'committee_decision', true),
    stateNode('approved', '已通过', 1140, 80, '准备推送观测编排负责人。'),
    stateNode('rejected', '已驳回', 1140, 270, '向提案者反馈意见。'),
    stateNode('revision', '待修改', 700, 340, '补充信息后重新提交。'),
    stateNode('pushed', '已推送观测编排', 1360, 80, '编排负责人查看提案和全部评审意见。'),
    stateNode('feedback', '执行反馈', 1580, 80, '更新编排、执行或无法执行的反馈。'),
    stateNode('completed', '已完成', 1800, 80, '提案者查看最终反馈；不自动分配数据。'),
  ],
  edges: [
    edge('o1', 'draft', 'format'), edge('o2', 'format', 'technical'), edge('o3', 'technical', 'science'),
    edge('o4', 'science', 'decision'), edge('o5', 'decision', 'approved'), edge('o6', 'decision', 'rejected'),
    edge('o7', 'format', 'revision'), edge('o8', 'technical', 'revision'), edge('o9', 'decision', 'revision'),
    edge('o10', 'revision', 'format'), edge('o11', 'approved', 'pushed'), edge('o12', 'pushed', 'feedback'),
    edge('o13', 'feedback', 'completed'),
  ],
  transitions: [
    { name: 'submit', label: '提交形式审查', from: '草稿', to: '待形式审查', roles: ['Proposer'], effects: { phase: 'phase1', set_phase_status: 'submitted', record_submission_time: true } },
    { name: 'format_pass', label: '形式审查通过', from: '待形式审查', to: '待技术评审', roles: ['Admin'] },
    { name: 'format_revision', label: '退回修改', from: '待形式审查', to: '待修改', roles: ['Admin'] },
    { name: 'technical_pass', label: '技术评审通过', from: '待技术评审', to: '待快速科学评审', roles: ['Technical Expert', 'Admin'] },
    { name: 'technical_revision', label: '技术意见退回', from: '待技术评审', to: '待修改', roles: ['Technical Expert', 'Admin'] },
    { name: 'science_complete', label: '完成快速科学评审', from: '待快速科学评审', to: '待快速决策', roles: ['Reviewer', 'Admin'] },
    { name: 'decision_approve', label: '批准机遇观测', from: '待快速决策', to: '已通过', roles: ['Panel Chair', 'Admin'] },
    { name: 'decision_reject', label: '驳回机遇观测', from: '待快速决策', to: '已驳回', roles: ['Panel Chair', 'Admin'] },
    { name: 'decision_revision', label: '要求补充信息', from: '待快速决策', to: '待修改', roles: ['Panel Chair', 'Admin'] },
    { name: 'resubmit', label: '重新提交', from: '待修改', to: '待形式审查', roles: ['Proposer'] },
    { name: 'push_scheduler', label: '推送观测编排', from: '已通过', to: '已推送观测编排', roles: ['Admin'] },
    { name: 'record_feedback', label: '录入执行反馈', from: '已推送观测编排', to: '执行反馈', roles: ['Instrument Scheduler', 'Admin'] },
    { name: 'complete', label: '完成反馈', from: '执行反馈', to: '已完成', roles: ['Instrument Scheduler', 'Admin'] },
  ],
};

export const DSL_WORKFLOW_PRESETS = [
  {
    key: 'research',
    workflowName: 'DSL 研究提案流程',
    proposalTypeName: 'DSL 研究提案',
    description: '完整科学评审、观测编排、数据匹配与访问授权流程。',
    definition: researchDefinition,
  },
  {
    key: 'opportunity',
    workflowName: 'DSL 机遇观测提案流程',
    proposalTypeName: 'DSL 机遇观测提案',
    description: '面向突发或时效目标的快速评审与观测编排推送流程。',
    definition: opportunityDefinition,
  },
];

const scoreOptions = [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} 分` }));

export const DSL_FORM_PRESETS = [
  {
    key: 'research_application',
    name: 'DSL 研究提案申请表',
    phase: 'phase1',
    definition: {
      fields: [
        { name: 'science_category', label: '研究方向', type: 'select', required: true, options: [
          { value: 'dark_ages', label: '黑暗时代' }, { value: 'cosmic_dawn', label: '宇宙黎明' },
          { value: 'all_sky', label: '全天巡天' }, { value: 'solar_planetary', label: '太阳 / 行星' },
        ] },
        { name: 'science_objective', label: '科学目标与预期成果', type: 'textarea', required: true, rows: 5 },
        { name: 'targets', label: '观测目标', type: 'repeatable', required: true, min_entries: 1, sub_fields: [
          { name: 'target_name', label: '目标名称', type: 'text', required: true },
          { name: 'coordinates', label: '坐标 / 天区', type: 'text', required: true },
          { name: 'observation_window', label: '期望观测时间范围', type: 'text', required: true },
          { name: 'visibility_note', label: '可见性计算结果', type: 'textarea', required: false },
        ] },
        { name: 'technical_summary', label: '观测方案与技术说明', type: 'textarea', required: true, rows: 5 },
        { name: 'data_plan', label: '数据使用与产出计划', type: 'textarea', required: true, rows: 4 },
        { name: 'proposal_document', label: '科学提案正文', type: 'file', required: true, help_text: '支持 PDF、DOCX 等申请材料。' },
      ],
    },
  },
  {
    key: 'opportunity_application',
    name: 'DSL 机遇观测申请表',
    phase: 'phase1',
    definition: {
      fields: [
        { name: 'event_type', label: '机遇事件类型', type: 'select', required: true, options: [
          { value: 'solar', label: '太阳爆发' }, { value: 'planetary', label: '行星射电事件' },
          { value: 'transient', label: '暂现源 / 瞬变事件' }, { value: 'other', label: '其他时效目标' },
        ] },
        { name: 'urgency', label: '响应时限', type: 'select', required: true, options: [
          { value: '24h', label: '24 小时内' }, { value: '72h', label: '72 小时内' }, { value: '7d', label: '7 天内' },
        ] },
        { name: 'trigger_and_value', label: '触发依据与科学价值', type: 'textarea', required: true, rows: 5 },
        { name: 'targets', label: '观测目标', type: 'repeatable', required: true, min_entries: 1, sub_fields: [
          { name: 'target_name', label: '目标名称', type: 'text', required: true },
          { name: 'coordinates', label: '坐标 / 天区', type: 'text', required: true },
          { name: 'observation_window', label: '最早与最晚观测时间', type: 'text', required: true },
          { name: 'visibility_note', label: '可见性计算结果', type: 'textarea', required: false },
        ] },
        { name: 'rapid_plan', label: '快速观测方案', type: 'textarea', required: true, rows: 4 },
        { name: 'proposal_document', label: '机遇观测说明文件', type: 'file', required: true },
      ],
    },
  },
  {
    key: 'lf_parameters',
    name: 'DSL LF 低频成像参数表',
    phase: 'phase1',
    instrument_code: 'LF',
    definition: { fields: [
      { name: 'frequency_band', label: '成像频段', type: 'text', required: true, help_text: '范围：0.1–30 MHz' },
      { name: 'integration_hours', label: '总积分时间（小时）', type: 'number', required: true },
      { name: 'angular_resolution', label: '期望角分辨率', type: 'text', required: true },
      { name: 'imaging_mode', label: '成像模式', type: 'select', required: true, options: [
        { value: 'snapshot', label: '快照成像' }, { value: 'deep', label: '深度积分' }, { value: 'survey', label: '巡天拼接' },
      ] },
      { name: 'finding_chart', label: '目标示意图 / 补充附件', type: 'file', required: false },
    ] },
  },
  {
    key: 'hf_parameters',
    name: 'DSL HF 频谱观测参数表',
    phase: 'phase1',
    instrument_code: 'HF',
    definition: { fields: [
      { name: 'frequency_band', label: '频谱范围', type: 'text', required: true, help_text: '范围：0.1–120 MHz' },
      { name: 'time_resolution', label: '时间分辨率', type: 'text', required: true },
      { name: 'spectral_resolution', label: '频率分辨率', type: 'text', required: true },
      { name: 'polarization', label: '极化模式', type: 'select', required: true, options: [
        { value: 'total', label: '总强度' }, { value: 'full', label: '全极化' },
      ] },
      { name: 'supporting_file', label: '补充参数文件', type: 'file', required: false },
    ] },
  },
  {
    key: 'technical_review', name: 'DSL 技术评审表', phase: 'review', definition: { fields: [
      { name: 'technical_feasibility', label: '技术可行性', type: 'select', required: true, options: scoreOptions },
      { name: 'instrument_match', label: '仪器与参数匹配度', type: 'select', required: true, options: scoreOptions },
      { name: 'comments', label: '技术评审意见', type: 'textarea', required: true },
    ] },
  },
  {
    key: 'scientific_review', name: 'DSL 科学评审表', phase: 'review', definition: { fields: [
      { name: 'scientific_merit', label: '科学价值', type: 'select', required: true, options: scoreOptions },
      { name: 'priority', label: '观测优先级', type: 'select', required: true, options: scoreOptions },
      { name: 'comments', label: '科学评审意见', type: 'textarea', required: true },
    ] },
  },
  {
    key: 'rapid_scientific_review', name: 'DSL 快速科学评审表', phase: 'review', definition: { fields: [
      { name: 'scientific_merit', label: '科学价值', type: 'select', required: true, options: scoreOptions },
      { name: 'urgency', label: '时效必要性', type: 'select', required: true, options: scoreOptions },
      { name: 'comments', label: '快速评审意见', type: 'textarea', required: true },
    ] },
  },
  {
    key: 'committee_decision', name: 'DSL 委员会决策表', phase: 'decision', definition: { fields: [
      { name: 'overall_priority', label: '综合优先级', type: 'select', required: true, options: scoreOptions },
      { name: 'comments', label: '决策意见', type: 'textarea', required: true },
    ] },
  },
];

export function bindDslForms(definition, formIds = {}) {
  return {
    ...definition,
    nodes: (definition.nodes || []).map((node) => ({
      ...node,
      data: {
        ...node.data,
        formTemplateId: node.data?.formKey ? formIds[node.data.formKey] || null : null,
      },
    })),
  };
}
