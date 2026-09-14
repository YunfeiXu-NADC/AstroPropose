export const WORKSPACE_ENTRIES = [
  { key: 'research', href: '/dashboard/research', label: '研究提案', roles: ['Proposer', 'Admin'] },
  { key: 'opportunity', href: '/dashboard/opportunity', label: '机遇观测', roles: ['Proposer', 'Admin'] },
  { key: 'reviews', href: '/dashboard/panel', label: '评审任务', roles: ['Technical Expert', 'Reviewer', 'Panel Chair', 'Admin'] },
  { key: 'feedback', href: '/dashboard/feedback', label: '观测反馈', roles: ['Technical Expert', 'Instrument Scheduler', 'Admin'] },
];

export function getWorkspaceEntriesForRoles(roles = []) {
  return WORKSPACE_ENTRIES.filter((entry) => entry.roles.some((role) => roles.includes(role)));
}
