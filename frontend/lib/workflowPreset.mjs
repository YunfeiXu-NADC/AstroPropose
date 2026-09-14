export function createExampleWorkflowPreset() {
  return {
    nodes: [
      { id: 'draft', type: 'stateNode', data: { label: '草稿' }, position: { x: 100, y: 50 } },
      { id: 'submitted', type: 'stateNode', data: { label: '已提交' }, position: { x: 300, y: 50 } },
      { id: 'scheduling', type: 'stateNode', data: { label: '观测编排' }, position: { x: 500, y: 50 } },
      { id: 'confirmed', type: 'stateNode', data: { label: '编排已确认' }, position: { x: 300, y: 180 } },
      { id: 'review', type: 'stateNode', data: { label: '评审中' }, position: { x: 100, y: 180 } },
      { id: 'approved', type: 'stateNode', data: { label: '已通过' }, position: { x: 100, y: 310 } },
    ],
    edges: [
      { id: 'e1', source: 'draft', target: 'submitted', animated: true },
      { id: 'e2', source: 'submitted', target: 'scheduling', animated: true },
      { id: 'e3', source: 'scheduling', target: 'confirmed', animated: true },
      { id: 'e4', source: 'confirmed', target: 'review', animated: true },
      { id: 'e5', source: 'review', target: 'approved', animated: true },
    ],
    initial_state: '草稿',
    transitions: [
      {
        name: 'submit_phase1',
        label: '提交申请',
        from: '草稿',
        to: '已提交',
        roles: ['Proposer'],
        conditions: {
          phase_status: {
            phase: 'phase1',
            status: 'draft',
          },
        },
        effects: {
          phase: 'phase1',
          set_phase_status: 'submitted',
          record_submission_time: true,
        },
      },
      {
        name: 'enter_scheduling',
        label: '进入观测编排',
        from: '已提交',
        to: '观测编排',
        roles: ['Admin'],
      },
      {
        name: 'complete_scheduling',
        label: '完成观测编排',
        from: '观测编排',
        to: '编排已确认',
        roles: ['Instrument Scheduler'],
      },
      {
        name: 'start_review',
        label: '开始评审',
        from: '编排已确认',
        to: '评审中',
        roles: ['Admin', 'Panel Chair'],
      },
      {
        name: 'approve',
        label: '通过提案',
        from: '评审中',
        to: '已通过',
        roles: ['Panel Chair'],
      },
    ],
  };
}
