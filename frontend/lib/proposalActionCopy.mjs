const PANEL_COPY = {
  草稿: ['提交申请', '核对申请内容和上传材料后，提交给提案管理员审查。'],
  待修改: ['重新提交申请', '保存修改后的内容，再重新提交形式审查。'],
  待形式审查: ['形式审查结论', '提案管理员核对申请信息及材料，选择通过或退回修改。'],
  待技术评审: ['技术评审', ''],
  待科学评审: ['科学评审', ''],
  待最终决策: ['最终决策', '科学委员会结合评审意见，选择批准或驳回。'],
  已通过: ['交付观测编排', '将获批的机遇观测申请交给观测编排负责人。'],
  已推送观测编排: ['记录观测安排与执行结果', '观测编排负责人可先保存安排；完成或无法执行时提交最终结果。'],
  执行反馈: ['执行结果', '最终执行结果已提交，提案已办结。'],
  待分配观测数据: ['分配观测数据', '提案管理员选择已处理的数据产品，并向提案者开放访问。'],
  数据已授权: ['数据授权', '观测数据已授权，提案已办结。'],
};

const BUTTON_COPY = {
  submit: '提交申请，进入形式审查',
  format_pass: '通过，进入技术评审',
  format_revision: '退回提案者修改',
  technical_pass: '进入科学评审',
  technical_revision: '退回提案者修改',
  science_complete: '进入最终决策',
  committee_approve: '批准，等待数据分配',
  committee_reject: '驳回申请',
  committee_revision: '退回提案者修改',
  decision_approve: '批准，进入观测编排',
  decision_reject: '驳回申请',
  decision_revision: '退回提案者修改',
  resubmit: '提交修改，重新进入形式审查',
  push_scheduler: '推送给观测编排负责人',
  record_feedback: '填写观测安排或执行结果',
  grant_data: '选择数据并授权',
};

export function getActionPanelCopy(status) {
  const [title, description] = PANEL_COPY[status] || [status || '流程处理', '请选择本阶段的处理结果。'];
  return { title, description };
}

export function getActionButtonLabel(action, kind) {
  return BUTTON_COPY[action.name] || action.label || action.name;
}
