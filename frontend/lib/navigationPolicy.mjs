export const WORKSPACE_ENTRIES = [
  { key: 'proposals', href: '/dashboard/proposals', label: '提案申请', baseline: true },
  { key: 'reviews', href: '/dashboard/panel', label: '评审任务', roles: ['Technical Expert', 'Reviewer', 'Panel Chair', 'Admin'] },
  { key: 'feedback', href: '/dashboard/feedback', label: '观测编排', roles: ['Technical Expert', 'Instrument Scheduler', 'Admin'] },
  { key: 'dataAllocation', href: '/dashboard/data-allocation', label: '数据分配', roles: ['Proposal Manager', 'Admin'] },
];

export function getWorkspaceEntriesForRoles(roles = [], isLoggedIn = roles.length > 0) {
  return WORKSPACE_ENTRIES.filter((entry) => entry.baseline ? isLoggedIn : entry.roles.some((role) => roles.includes(role)));
}
