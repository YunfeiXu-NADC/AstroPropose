const ROLE_LABELS = {
  Admin: '系统管理员',
  Proposer: '提案者',
  Reviewer: '科学评审专家',
  'Technical Expert': '技术评审专家',
  'Panel Chair': '科学委员会',
  'Instrument Scheduler': '观测编排负责人',
};

const TRANSITION_LABELS = {
  submit_phase1: '提交申请',
  technical_approve: '技术评审通过',
  technical_reject: '技术意见退回',
  scientific_approve: '科学评审通过',
  scientific_reject: '科学意见退回',
  approve: '评审通过',
  reject: '评审退回',
  finalize_decision: '确认最终结果',
  start_scheduling: '进入观测编排',
  complete_scheduling: '完成观测编排',
};

export function translateRole(role) {
  return ROLE_LABELS[role] || role;
}

export function formatRoles(roles = [], separator = '、') {
  return roles.map(translateRole).join(separator);
}

export function translateTransition(action) {
  if (!action) return '';
  return TRANSITION_LABELS[action.name] || action.label || action.name;
}

export function translateRoleType(isSystem) {
  return isSystem ? '系统内置' : '自定义';
}

export function translatePhase(phase) {
  const phases = { phase1: '申请阶段', phase2: '补充材料阶段' };
  return phases[phase] || phase || '通用';
}
