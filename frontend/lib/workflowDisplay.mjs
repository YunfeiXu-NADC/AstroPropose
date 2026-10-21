export const DEFAULT_REVIEW_STAGES = [
  '形式审查',
  '技术评审',
  '科学评审',
  '最终决策',
];

export const DEFAULT_PROPOSAL_TYPES = [
  {
    id: 'preview-research',
    name: '研究提案',
    description: '面向预先规划的科学研究任务',
    previewOnly: true,
  },
  {
    id: 'preview-opportunity',
    name: '机遇目标',
    description: '面向突发或时效性观测机会',
    previewOnly: true,
  },
];

export function getProposalKind(name = '') {
  return /机遇|机会|opportunity|\btoo\b/i.test(name) ? 'opportunity' : 'research';
}

export function isProposalClosed(status = '') {
  return ['数据已授权', '执行反馈', '已完成', '已驳回'].includes(status);
}

export function getProposalStatusPresentation(status = '') {
  if (['草稿', 'Draft'].includes(status)) return { tone: 'draft', label: '草稿' };
  if (status === '待修改') return { tone: 'revision', label: '已退回' };
  if (status === '已驳回') return { tone: 'rejected', label: '已驳回' };
  if (['数据已授权', '执行反馈', '已完成'].includes(status)) return { tone: 'closed', label: '已办结' };
  return { tone: 'active', label: status || '状态未知' };
}

export function getFinalDecisionLabel(proposal = {}) {
  if (proposal.final_decision?.outcome === 'reject' || proposal.status === '已驳回') return '驳回';

  const committeeDecision = proposal.reviews?.find(
    (review) => review.review_type === 'committee' && review.status === 'submitted',
  );
  if (committeeDecision?.recommendation === 'pass') return '通过';
  if (committeeDecision?.recommendation === 'reject') return '驳回';

  // Approval is already established by entering a post-decision DSL stage,
  // even when the committee's review text is hidden from the applicant.
  const approvedStages = new Set([
    '已通过', '待分配观测数据', '数据已授权', '已推送观测编排', '执行反馈', '已完成',
  ]);
  if (proposal.proposal_type?.name?.startsWith('DSL ') && approvedStages.has(proposal.status)) {
    return '通过';
  }
  return '未记录结论';
}

const ROW_PROGRESS_COLORS = {
  draft: ['#eff2f6', 'rgba(239, 242, 246, 0)'],
  active: ['#e6eafa', 'rgba(230, 234, 250, 0)'],
  revision: ['#f3eada', 'rgba(243, 234, 218, 0)'],
  rejected: ['#f5e3e7', 'rgba(245, 227, 231, 0)'],
  closed: ['#e1efe7', 'rgba(225, 239, 231, 0)'],
};

export function getProposalProgressPercent(definition, status = '') {
  const tone = getProposalStatusPresentation(status).tone;
  if (tone === 'closed' || tone === 'rejected') return 100;
  const stages = getWorkflowStages(definition);
  if (!stages.length) return 0;

  const displayStage = getWorkflowDisplayStage(definition, status);
  const index = stages.indexOf(displayStage);
  return index < 0 ? 0 : Math.round(((index + 1) / stages.length) * 100);
}

export function getProposalRowStyle(definition, status = '') {
  const tone = getProposalStatusPresentation(status).tone;
  const [start, end] = ROW_PROGRESS_COLORS[tone];
  return {
    backgroundImage: `linear-gradient(to right, ${start}, ${end})`,
    backgroundPosition: 'left top',
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${getProposalProgressPercent(definition, status)}% 100%`,
  };
}

export function getProposalTypePresentation(type = {}) {
  const kind = getProposalKind(type.name);
  const isOpportunity = kind === 'opportunity';

  return {
    kind,
    description:
      type.description ||
      (isOpportunity ? '面向突发或时效性观测机会' : '面向预先规划的科学研究任务'),
    outcome: isOpportunity
      ? '评审意见推送至观测编排负责人'
      : '待分配观测数据 → 数据下载',
    examples: isOpportunity
      ? '太阳活动 · 行星事件 · 瞬变源'
      : '宇宙黑暗时代 · 宇宙黎明 · 全天巡天',
  };
}

export function getWorkflowStages(definition, fallback = DEFAULT_REVIEW_STAGES) {
  const displayStages = Array.isArray(definition?.display_stages) ? definition.display_stages : [];
  if (displayStages.length) {
    return displayStages;
  }

  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  if (!nodes.length) {
    return fallback;
  }

  const labelById = new Map(
    nodes.map((node) => [node.id, node?.data?.label || node?.data?.name || node.id])
  );
  const outgoing = new Map();
  const indegree = new Map(nodes.map((node) => [node.id, 0]));

  (definition?.edges || []).forEach((edge) => {
    if (!labelById.has(edge.source) || !labelById.has(edge.target)) {
      return;
    }
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  });

  const initialNode = nodes.find(
    (node) =>
      node.id === definition?.initial_state ||
      node?.data?.label === definition?.initial_state
  );
  const queue = [];
  if (initialNode) {
    queue.push(initialNode.id);
  }
  nodes.forEach((node) => {
    if ((indegree.get(node.id) || 0) === 0 && node.id !== initialNode?.id) {
      queue.push(node.id);
    }
  });

  const ordered = [];
  const visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);
    ordered.push(labelById.get(id));
    (outgoing.get(id) || []).forEach((target) => {
      indegree.set(target, (indegree.get(target) || 0) - 1);
      if ((indegree.get(target) || 0) <= 0) {
        queue.push(target);
      }
    });
  }

  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      ordered.push(labelById.get(node.id));
    }
  });

  return [...new Set(ordered.filter(Boolean))];
}

export function getWorkflowDisplayStage(definition, currentStage) {
  if (currentStage === '已驳回' && definition?.display_stages?.includes('最终决策')) {
    return '最终决策';
  }
  const groups = definition?.stage_groups;
  if (!groups || typeof groups !== 'object') {
    return currentStage;
  }
  return Object.entries(groups).find(([, states]) => Array.isArray(states) && states.includes(currentStage))?.[0] || currentStage;
}

export function getWorkflowStepState(stages, currentStage, index) {
  const currentIndex = Math.max(
    0,
    stages.findIndex((stage) => String(stage) === String(currentStage))
  );
  if (index < currentIndex) {
    return 'complete';
  }
  if (index === currentIndex) {
    return 'current';
  }
  return 'upcoming';
}
