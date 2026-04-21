const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

async function fetcher(path, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  if (token) {
    headers['x-access-token'] = token;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const error = new Error(
      (data && typeof data === 'object' && data.message) ||
        'An error occurred while fetching the data.'
    );
    error.info = data;
    error.status = res.status;
    throw error;
  }

  return data;
}

function post(path, body) {
  return fetcher(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function put(path, body) {
  return fetcher(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

function patch(path, body) {
  return fetcher(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function del(path) {
  return fetcher(path, {
    method: 'DELETE',
  });
}

// --- Auth ---
export async function login(credentials) {
  return post('/api/auth/login', credentials);
}

export async function register(userData) {
  return post('/api/auth/register', userData);
}

export async function getCurrentUser() {
  return fetcher('/api/auth/me');
}

export async function changePassword(payload) {
  return post('/api/auth/change-password', payload);
}

// --- Proposals ---
export async function getProposals(params = {}) {
  return fetcher(`/api/proposals/${buildQuery(params)}`);
}

export async function createProposal(proposalData) {
  return post('/api/proposals/', proposalData);
}

export async function listProposalTransitions(proposalId) {
  return fetcher(`/api/proposals/${proposalId}/transitions`);
}

export async function triggerProposalTransition(proposalId, payload) {
  return post(`/api/proposals/${proposalId}/transitions`, payload);
}

export async function submitInstrumentFeedbackAPI(proposalId, instrumentCode, payload) {
  return post(`/api/proposals/${proposalId}/instruments/${instrumentCode}/feedback`, payload);
}

// --- Workflow ---
export async function getWorkflows() {
  return fetcher('/api/workflows/');
}

export async function getWorkflow(id) {
  return fetcher(`/api/workflows/${id}`);
}

export async function saveWorkflow(id, definition) {
  return put(`/api/workflows/${id}`, definition);
}

export async function createWorkflow(payload) {
  return post('/api/workflows/', payload);
}

// --- Proposal Types ---
export async function getProposalTypes() {
  return fetcher('/api/proposal-types/');
}

export async function createProposalType(payload) {
  return post('/api/proposal-types/', payload);
}

export async function updateProposalType(id, payload) {
  return patch(`/api/proposal-types/${id}`, payload);
}

// --- Admin Users ---
export async function listAdminUsers() {
  return fetcher('/api/admin/users');
}

export async function createAdminUser(payload) {
  return post('/api/admin/users', payload);
}

export async function updateAdminUser(id, payload) {
  return patch(`/api/admin/users/${id}`, payload);
}

export async function resetAdminUserPassword(id, payload) {
  return post(`/api/admin/users/${id}/reset-password`, payload);
}

// --- Admin Roles ---
export async function listAdminRoles() {
  return fetcher('/api/admin/roles');
}

export async function createAdminRole(payload) {
  return post('/api/admin/roles', payload);
}

export async function updateAdminRole(id, payload) {
  return patch(`/api/admin/roles/${id}`, payload);
}

export async function deleteAdminRole(id) {
  return del(`/api/admin/roles/${id}`);
}

// --- Form Templates ---
export async function listFormTemplates(params = {}) {
  return fetcher(`/api/form-templates/${buildQuery(params)}`);
}

export async function getFormTemplate(id) {
  return fetcher(`/api/form-templates/${id}`);
}

export async function createFormTemplate(payload) {
  return post('/api/form-templates/', payload);
}

export async function updateFormTemplate(id, payload) {
  return put(`/api/form-templates/${id}`, payload);
}

// --- Instruments ---
export async function listInstruments() {
  return fetcher('/api/instruments/');
}

export async function createInstrument(payload) {
  return post('/api/instruments/', payload);
}

export async function updateInstrument(code, payload) {
  return patch(`/api/instruments/${code}`, payload);
}

// --- External Tools ---
export async function listExternalTools() {
  return fetcher('/api/external-tools/');
}

export async function getExternalTool(toolId) {
  return fetcher(`/api/external-tools/${toolId}`);
}

export async function createExternalTool(payload) {
  return post('/api/external-tools/', payload);
}

export async function updateExternalTool(toolId, payload) {
  return patch(`/api/external-tools/${toolId}`, payload);
}

export async function refreshExternalToolSpec(toolId) {
  return post(`/api/external-tools/${toolId}/refresh-spec`, {});
}

export async function createToolOperation(toolId, payload) {
  return post(`/api/external-tools/${toolId}/operations`, payload);
}

export async function updateToolOperation(operationId, payload) {
  return patch(`/api/external-tools/operations/${operationId}`, payload);
}

export async function testToolOperation(operationId, params = {}) {
  return post(`/api/external-tools/operations/${operationId}/test`, { params });
}

export async function executeToolOperationFromForm(operationId, context = {}) {
  return post(`/api/external-tools/operations/${operationId}/execute`, { context });
}
