const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

async function fetcher(path, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['x-access-token'] = token;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data.message || 'An error occurred while fetching the data.');
    error.info = data;
    error.status = res.status;
    throw error;
  }

  return data;
}

// --- Auth ---
export async function login(credentials) {
  return fetcher('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function register(userData) {
  return fetcher('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
}

export async function getCurrentUser() {
  return fetcher('/api/auth/me');
}


// --- Proposals ---
export async function getProposals() {
  return fetcher('/api/proposals');
}

export async function createProposal(proposalData) {
    return fetcher('/api/proposals', {
        method: 'POST',
        body: JSON.stringify(proposalData),
    });
}

// --- Workflows ---
export async function getWorkflows() {
    return fetcher('/api/workflows');
}

export async function getWorkflow(id) {
    return fetcher(`/api/workflows/${id}`);
}

export async function saveWorkflow(id, definition) {
  return fetcher(`/api/workflows/${id}`, {
    method: 'PUT',
    body: JSON.stringify(definition),
  });
}

// --- Form Templates ---
export async function getFormTemplate(id) {
    return fetcher(`/api/form-templates/${id}`);
}
