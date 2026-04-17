// Lightweight fetch wrapper for the Estia backend.
// Uses same-origin /api/* via the nginx proxy in prod, and the Vite proxy in dev.

const BASE = import.meta.env.VITE_API_BASE || '/api';

async function request(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const init = {
    method,
    credentials: 'include',
    headers: { 'Accept': 'application/json', ...headers },
  };
  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }
  const res = await fetch(`${BASE}${path}`, init);
  if (raw) return res;
  const text = await res.text();
  const data = text ? safeParse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return text; }
}

export const api = {
  // Auth
  signup: (body) => request('/auth/signup', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  googleMock: (body) => request('/auth/google/mock', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/me'),
  updateMe: (body) => request('/me', { method: 'PATCH', body }),
  uploadAvatar: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/me/avatar', { method: 'POST', body: fd });
  },

  // Resources
  listProperties: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/properties${qs ? `?${qs}` : ''}`);
  },
  getProperty: (id) => request(`/properties/${id}`),
  createProperty: (body) => request('/properties', { method: 'POST', body }),
  updateProperty: (id, body) => request(`/properties/${id}`, { method: 'PATCH', body }),
  deleteProperty: (id) => request(`/properties/${id}`, { method: 'DELETE' }),
  toggleMarketingAction: (id, body) =>
    request(`/properties/${id}/marketing-actions`, { method: 'PUT', body }),
  uploadPropertyImage: (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request(`/properties/${id}/images`, { method: 'POST', body: fd });
  },
  deletePropertyImage: (id, imageId) =>
    request(`/properties/${id}/images/${imageId}`, { method: 'DELETE' }),
  reorderPropertyImages: (id, order) =>
    request(`/properties/${id}/images/reorder`, { method: 'PUT', body: { order } }),

  listLeads: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/leads${qs ? `?${qs}` : ''}`);
  },
  getLead: (id) => request(`/leads/${id}`),
  createLead: (body) => request('/leads', { method: 'POST', body }),
  updateLead: (id, body) => request(`/leads/${id}`, { method: 'PATCH', body }),
  deleteLead: (id) => request(`/leads/${id}`, { method: 'DELETE' }),

  listDeals: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/deals${qs ? `?${qs}` : ''}`);
  },
  createDeal: (body) => request('/deals', { method: 'POST', body }),
  updateDeal: (id, body) => request(`/deals/${id}`, { method: 'PATCH', body }),

  listAgreements: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/agreements${qs ? `?${qs}` : ''}`);
  },
  sendAgreement: (body) => request('/agreements/send', { method: 'POST', body }),
  uploadAgreement: (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request(`/agreements/${id}/upload`, { method: 'POST', body: fd });
  },

  dashboard: () => request('/reports/dashboard'),
  propertyWeekly: (id) => request(`/reports/property/${id}/weekly`),
  resolveLocation: (q) =>
    request(`/lookups/resolve?q=${encodeURIComponent(q)}`),
  cities: () => request('/lookups/cities'),
  streets: (city) => request(`/lookups/streets${city ? `?city=${encodeURIComponent(city)}` : ''}`),

  // Public agent storefront (no auth)
  getAgentPublic: (agentId) => request(`/agents/${agentId}/public`),
  listAgentProperties: (agentId, params = {}) => {
    const qs = new URLSearchParams({ agentId, ...params }).toString();
    return request(`/properties?${qs}`);
  },
};

export default api;
