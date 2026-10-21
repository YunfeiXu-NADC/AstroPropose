export const ROLE_GUIDE = {
  Admin: {
    responsibility: '维护系统、用户、角色、表单、仪器和流程配置。',
    capabilities: ['查看所有已提交提案', '分配评审任务', '处理流程异常', '代管数据分配'],
  },
  'Proposal Manager': {
    responsibility: '跟踪已通过的研究提案，在数据处理完成后分配数据并授权申请人访问。',
    capabilities: ['查看待分配研究提案', '登记数据产品', '向提案者开放数据'],
  },
  Proposer: {
    responsibility: '创建并提交研究提案或机遇观测申请，跟踪本人提案进度。',
    capabilities: ['保存和编辑草稿', '使用可见性计算', '提交申请', '查看反馈并下载已授权数据'],
  },
  'Technical Expert': {
    responsibility: '对分配给自己的提案进行技术可行性审查。',
    capabilities: ['查看提案与附件', '下载申请材料', '填写技术意见', '提交通过或退回建议'],
  },
  Reviewer: {
    responsibility: '对进入科学评审阶段且分配给自己的提案进行科学评价。',
    capabilities: ['查看提案与附件', '下载申请材料', '填写评分与评语', '提交科学评审意见'],
  },
  'Panel Chair': {
    responsibility: '汇总技术和科学评审结果，组织科学委员会形成最终意见。',
    capabilities: ['查看评审汇总', '查阅提案材料', '填写委员会意见', '确认最终决策'],
  },
  'Instrument Scheduler': {
    responsibility: '接收通过评审的机遇观测申请，安排观测并反馈执行状态。',
    capabilities: ['查看待编排提案', '维护观测窗口', '更新执行状态', '提交观测反馈'],
  },
};

export const BUILT_IN_ROLE_ORDER = [
  'Admin',
  'Proposal Manager',
  'Proposer',
  'Technical Expert',
  'Reviewer',
  'Panel Chair',
  'Instrument Scheduler',
];

export function getRoleGuide(roleName) {
  return ROLE_GUIDE[roleName] || {
    responsibility: '由系统管理员根据具体流程节点配置职责。',
    capabilities: ['权限取决于用户分配和流程配置'],
  };
}
