export const DEFAULT_REVIEW_STAGES = [
  '形式审查',
  '技术评审',
  '科学评审',
  '科学委员会决策',
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
      : '观测编排 → 数据授权 → 数据下载',
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
