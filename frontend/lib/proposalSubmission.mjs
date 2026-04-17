export function buildProposalCreatePayload({
  selectedProposalType,
  selectedInstruments,
  phaseState,
  instrumentState,
}) {
  const phase1 = phaseState?.phase1 || { meta: {}, attachments: {} };

  return {
    title: phase1.meta?.title || '',
    abstract: phase1.meta?.abstract || '',
    proposal_type_id: selectedProposalType,
    meta: phase1.meta || {},
    phase_payload: {
      phase1: {
        status: 'draft',
        data: phase1.meta || {},
        attachments: phase1.attachments || {},
      },
    },
    instruments: selectedInstruments.map((code) => ({
      instrument_code: code,
      status: 'submitted',
      form_data: instrumentState?.[code]?.form || {},
      attachments: instrumentState?.[code]?.attachments || {},
    })),
  };
}
