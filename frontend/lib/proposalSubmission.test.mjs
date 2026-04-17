import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProposalCreatePayload } from './proposalSubmission.mjs';

test('buildProposalCreatePayload keeps phase1 as draft so workflow submit transition remains available', () => {
  const payload = buildProposalCreatePayload({
    selectedProposalType: 7,
    selectedInstruments: ['CSST_IM'],
    phaseState: {
      phase1: {
        meta: {
          title: 'Cycle-1 Test',
          abstract: 'Workflow-aligned submit flow',
          science_goal: 'Verify submit transition',
        },
        attachments: {
          proposal_pdf: { name: 'proposal.pdf', size: 1024, type: 'application/pdf' },
        },
      },
    },
    instrumentState: {
      CSST_IM: {
        form: { target_name: 'M31' },
        attachments: {},
      },
    },
  });

  assert.equal(payload.proposal_type_id, 7);
  assert.equal(payload.phase_payload.phase1.status, 'draft');
  assert.equal(payload.phase_payload.phase1.data.science_goal, 'Verify submit transition');
  assert.equal(payload.instruments[0].instrument_code, 'CSST_IM');
});
