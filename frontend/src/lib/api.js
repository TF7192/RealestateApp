// Lightweight fetch wrapper for the Estia backend.
// Uses same-origin /api/* via the nginx proxy in prod, and the Vite proxy in dev.

import { getDistinctId as _phDistinctId } from './analytics';
import { Capacitor } from '@capacitor/core';

const BASE = import.meta.env.VITE_API_BASE || '/api';

// Platform tag sent with every call so the backend can log the first
// platform an agent logged in on (used by the onboarding tour gate).
function platformHeader() {
  try { return Capacitor.getPlatform(); } catch { return 'web'; }
}

// Forward the browser's stable PostHog distinct-id so the backend's
// api_request events can attribute anonymous traffic (pre-login) to the
// same person in PostHog that posthog-js already sees. After sign-in the
// server picks the real user id from the JWT instead, so this header is
// only load-bearing for unauthenticated requests.
function posthogDistinctId() {
  const id = _phDistinctId();
  return id && id.length <= 200 ? id : null;
}

async function request(path, { method = 'GET', body, headers = {}, raw, keepalive } = {}) {
  const phId = posthogDistinctId();
  const init = {
    method,
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'X-Estia-Platform': platformHeader(),
      ...(phId ? { 'X-PostHog-Distinct-Id': phId } : null),
      ...headers,
    },
  };
  if (keepalive) init.keepalive = true;
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
  googleNativeExchange: (code) =>
    request('/auth/google/native-exchange', { method: 'POST', body: { code } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/me'),
  // keepalive ensures the POST survives a component unmount / page
  // navigation — without it the tutorial-complete request can get
  // cancelled when the tour component returns null right after the
  // click, which is exactly what the user was seeing.
  completeTutorial: () => request('/me/tutorial/complete', { method: 'POST', keepalive: true }),

  // In-app chat (T11)
  chatMe: () => request('/chat/me'),
  chatSend: (body) => request('/chat/me/messages', { method: 'POST', body: { body } }),
  chatMarkRead: () => request('/chat/me/read', { method: 'POST' }),
  // Admin endpoints
  adminChatList: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/chat/admin/conversations${qs ? `?${qs}` : ''}`);
  },
  adminChatGet: (id) => request(`/chat/admin/conversations/${id}`),
  adminChatSend: (id, body) =>
    request(`/chat/admin/conversations/${id}/messages`, { method: 'POST', body: { body } }),
  adminChatRead: (id) =>
    request(`/chat/admin/conversations/${id}/read`, { method: 'POST' }),
  adminChatArchive: (id) =>
    request(`/chat/admin/conversations/${id}/archive`, { method: 'POST' }),
  adminChatUnarchive: (id) =>
    request(`/chat/admin/conversations/${id}/unarchive`, { method: 'POST' }),
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
  uploadExclusivityAgreement: (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request(`/properties/${id}/agreement`, { method: 'POST', body: fd });
  },
  deleteExclusivityAgreement: (id) =>
    request(`/properties/${id}/agreement`, { method: 'DELETE' }),
  reorderPropertyImages: (id, order) =>
    request(`/properties/${id}/images/reorder`, { method: 'PUT', body: { order } }),

  // Property videos
  listPropertyVideos: (id) => request(`/properties/${id}/videos`),
  uploadPropertyVideo: (id, file, onProgress) => {
    // Use XHR for upload progress (fetch doesn't expose it)
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/properties/${id}/videos`, true);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { resolve({}); }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data?.error?.message || `HTTP ${xhr.status}`));
          } catch { reject(new Error(`HTTP ${xhr.status}`)); }
        }
      };
      xhr.onerror = () => reject(new Error('העלאה נכשלה'));
      const fd = new FormData();
      fd.append('file', file);
      xhr.send(fd);
    });
  },
  addExternalVideo: (id, body) =>
    request(`/properties/${id}/videos/external`, { method: 'POST', body }),
  deletePropertyVideo: (id, videoId) =>
    request(`/properties/${id}/videos/${videoId}`, { method: 'DELETE' }),

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

  // Reverse-geocode (uses Nominatim through our backend so the
  // server-side User-Agent header is set + rate-limit is shared).
  reverseGeocode: (lat, lon) =>
    request(`/geo/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`),

  // SEO public routes
  publicAgent: (agentSlug) => request(`/public/agents/${encodeURIComponent(agentSlug)}`),
  publicProperty: (agentSlug, propertySlug) =>
    request(`/public/agents/${encodeURIComponent(agentSlug)}/properties/${encodeURIComponent(propertySlug)}`),
  // Lookup helper: given an internal property id, returns the slug pair
  // so the dashboard can build a marketable URL. Auth-free.
  lookupPropertySlug: (id) =>
    request(`/public/lookup/property/${encodeURIComponent(id)}`),

  // Owners
  listOwners:        () => request('/owners'),
  getOwner:          (id) => request(`/owners/${id}`),
  createOwner:       (body) => request('/owners', { method: 'POST', body }),
  updateOwner:       (id, body) => request(`/owners/${id}`, { method: 'PATCH', body }),
  deleteOwner:       (id) => request(`/owners/${id}`, { method: 'DELETE' }),
  searchOwners:      (q) => request(`/owners/search?q=${encodeURIComponent(q)}`),

  // Message templates
  listTemplates: () => request('/templates'),
  saveTemplate: (kind, body) =>
    request(`/templates/${kind}`, { method: 'PUT', body: { body } }),
  resetTemplate: (kind) =>
    request(`/templates/${kind}`, { method: 'DELETE' }),

  // Property transfers
  searchAgentByEmail: (email) =>
    request(`/transfers/agents/search?email=${encodeURIComponent(email)}`),
  listTransfers: () => request('/transfers'),
  initiateTransfer: (propertyId, body) =>
    request(`/properties/${propertyId}/transfer`, { method: 'POST', body }),
  logWhatsappTransfer: (propertyId) =>
    request(`/properties/${propertyId}/transfer/whatsapp`, { method: 'POST' }),
  acceptTransfer: (id) => request(`/transfers/${id}/accept`, { method: 'POST' }),
  declineTransfer: (id) => request(`/transfers/${id}/decline`, { method: 'POST' }),
  cancelTransfer: (id) => request(`/transfers/${id}/cancel`, { method: 'POST' }),
};

export default api;
