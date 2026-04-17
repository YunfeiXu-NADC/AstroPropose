export function createExampleWorkflowPreset() {
  return {
    nodes: [
      { id: 'draft', type: 'stateNode', data: { label: 'Draft' }, position: { x: 100, y: 50 } },
      { id: 'submitted', type: 'stateNode', data: { label: 'Submitted' }, position: { x: 300, y: 50 } },
      { id: 'scheduling', type: 'stateNode', data: { label: 'Scheduling' }, position: { x: 500, y: 50 } },
      { id: 'confirmed', type: 'stateNode', data: { label: 'Phase1Confirmed' }, position: { x: 300, y: 180 } },
      { id: 'review', type: 'stateNode', data: { label: 'Under Review' }, position: { x: 100, y: 180 } },
      { id: 'approved', type: 'stateNode', data: { label: 'Approved' }, position: { x: 100, y: 310 } },
    ],
    edges: [
      { id: 'e1', source: 'draft', target: 'submitted', animated: true },
      { id: 'e2', source: 'submitted', target: 'scheduling', animated: true },
      { id: 'e3', source: 'scheduling', target: 'confirmed', animated: true },
      { id: 'e4', source: 'confirmed', target: 'review', animated: true },
      { id: 'e5', source: 'review', target: 'approved', animated: true },
    ],
    initial_state: 'Draft',
    transitions: [
      {
        name: 'submit_phase1',
        label: 'Submit Phase-1',
        from: 'Draft',
        to: 'Submitted',
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
        label: 'Enter Scheduling',
        from: 'Submitted',
        to: 'Scheduling',
        roles: ['Admin'],
      },
      {
        name: 'complete_scheduling',
        label: 'Complete Scheduling',
        from: 'Scheduling',
        to: 'Phase1Confirmed',
        roles: ['Instrument Scheduler'],
      },
      {
        name: 'start_review',
        label: 'Start Review',
        from: 'Phase1Confirmed',
        to: 'Under Review',
        roles: ['Admin', 'Panel Chair'],
      },
      {
        name: 'approve',
        label: 'Approve Proposal',
        from: 'Under Review',
        to: 'Approved',
        roles: ['Panel Chair'],
      },
    ],
  };
}
