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

// Audit F-2.3 — every fetch gets an AbortController timeout. 20s for
// reads, 60s for writes (uploads live on their own pathway and use a
// bigger budget). Transient 502/503/504/network-error failures on GETs
// retry with exponential backoff (200ms / 400ms / 800ms, 3 attempts
// total). Non-idempotent methods never retry — a flaky POST might
// have already hit the server.
const DEFAULT_TIMEOUT_GET_MS = 20_000;
const DEFAULT_TIMEOUT_WRITE_MS = 60_000;

// F-2.4 — user-facing copy never leaks "HTTP 500" / "Failed to fetch".
// Hebrew short phrases the UI can raise verbatim.
function hebrewFallbackMessage(status) {
  if (status === 0 || status == null) return 'אין חיבור לאינטרנט — נסה שוב בעוד רגע';
  if (status === 401) return 'פג תוקף החיבור — נא להתחבר מחדש';
  if (status === 403) return 'אין לך הרשאה לפעולה הזו';
  if (status === 404) return 'הרשומה לא נמצאה';
  if (status === 409) return 'הפעולה מתנגשת עם רשומה קיימת';
  if (status === 413) return 'הקובץ גדול מדי';
  if (status === 429) return 'יותר מדי בקשות — נסה/י בעוד רגע';
  if (status >= 500) return 'תקלה בשרת — נסה/י שוב';
  return 'משהו השתבש — נסה/י שוב';
}

// F-2.2 — single source of truth for the "session expired" bounce. When
// the server returns 401 on what the client thought was an authed call,
// we clear local auth caches and route the user to /login, preserving
// where they were so they land back after re-auth. Broadcast via event
// so useAuth can react without a circular import.
let _onUnauthHookInstalled = false;
function broadcastUnauthorized() {
  try {
    window.dispatchEvent(new CustomEvent('estia:unauthorized', {
      detail: { pathname: window.location.pathname + window.location.search },
    }));
  } catch { /* non-browser env */ }
}

async function request(path, {
  method = 'GET', body, headers = {}, raw, keepalive,
  timeoutMs, retries,
} = {}) {
  const phId = posthogDistinctId();
  const isWrite = method !== 'GET' && method !== 'HEAD';
  const controller = new AbortController();
  const timeout = timeoutMs ?? (isWrite ? DEFAULT_TIMEOUT_WRITE_MS : DEFAULT_TIMEOUT_GET_MS);
  const timer = setTimeout(() => controller.abort(), timeout);

  const init = {
    method,
    credentials: 'include',
    signal: controller.signal,
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

  // Retry only on idempotent methods + transient failures. Body is
  // already serialized, so re-sending is safe; AbortController is
  // single-use — recreate per attempt.
  const maxAttempts = retries ?? (isWrite ? 1 : 3);
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const attemptInit = attempt === 1 ? init : { ...init, signal: newSignal(timeout) };
      const res = await fetch(`${BASE}${path}`, attemptInit);
      clearTimeout(timer);
      if (raw) return res;
      const text = await res.text();
      const data = text ? safeParse(text) : null;
      if (!res.ok) {
        const err = new Error(data?.error?.message || hebrewFallbackMessage(res.status));
        err.status = res.status;
        err.data = data;
        // 401 triggers global sign-out, but only if the client actually
        // thought it was authenticated. Don't bounce on /auth/login's
        // own 401 (wrong-password) — that's handled in the form UI.
        // Also skip /me: it's the "am I logged in?" probe every mount
        // fires; a fresh visitor hitting a public page (/a/:id, /p/:id,
        // /agents/:slug, /public/p/:token) would otherwise be yanked to
        // /login instead of seeing the public portal.
        if (
          res.status === 401 &&
          !path.startsWith('/auth/') &&
          path !== '/me'
        ) {
          broadcastUnauthorized();
        }
        // Sprint 5.1 — universal premium gate. Any 402 with the
        // `{ error: 'PREMIUM_REQUIRED', feature }` envelope is broadcast
        // to the app root, which mounts the PremiumGateDialog and
        // surfaces a "שדרגו כדי להשתמש ב-{feature}" CTA. The original
        // error still throws so the caller can bail out of whatever
        // flow triggered the gated call.
        if (res.status === 402 && data?.error === 'PREMIUM_REQUIRED') {
          try {
            window.dispatchEvent(new CustomEvent('estia:premium-gate', {
              detail: { feature: data.feature || '' },
            }));
          } catch { /* non-browser env */ }
        }
        // Retry-able server-side hiccups on GETs.
        if (!isWrite && [502, 503, 504].includes(res.status) && attempt < maxAttempts) {
          await sleep(200 * 2 ** (attempt - 1));
          continue;
        }
        throw err;
      }
      return data;
    } catch (e) {
      clearTimeout(timer);
      // Network failure or timeout. Retry on GET, surface on write.
      lastErr = e;
      const isAbort = e?.name === 'AbortError';
      const isNetwork = isAbort || e?.message === 'Failed to fetch' || /network/i.test(e?.message || '');
      if (isNetwork && !isWrite && attempt < maxAttempts) {
        await sleep(200 * 2 ** (attempt - 1));
        continue;
      }
      if (isAbort) {
        const err = new Error('הבקשה חרגה מזמן המענה — נסה/י שוב');
        err.status = 0;
        err.timeout = true;
        throw err;
      }
      if (isNetwork && !e.status) {
        const err = new Error('אין חיבור לשרת — בדוק חיבור אינטרנט');
        err.status = 0;
        err.network = true;
        throw err;
      }
      throw e;
    }
  }
  throw lastErr || new Error('שגיאה לא ידועה');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function newSignal(timeoutMs) {
  const c = new AbortController();
  setTimeout(() => c.abort(), timeoutMs);
  return c.signal;
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return text; }
}

export const api = {
  // Sprint 5.1 — public contact form. POSTs { subject, body,
  // fromName?, fromEmail? }; backend mails talfuks1234@gmail.com via
  // SES. No auth required.
  sendContact: (body) => request('/contact', { method: 'POST', body }),

  // Auth
  signup: (body) => request('/auth/signup', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token, password) =>
    request('/auth/reset-password', { method: 'POST', body: { token, password } }),
  googleMock: (body) => request('/auth/google/mock', { method: 'POST', body }),
  googleNativeExchange: (code) =>
    request('/auth/google/native-exchange', { method: 'POST', body: { code } }),
  // Sign in with Apple — native-only. The iOS app calls
  // AuthenticationServices via the @capacitor-community/apple-sign-in
  // plugin and forwards the resulting payload here; the backend
  // verifies Apple's identityToken JWT and sets the session cookie.
  appleNativeExchange: (payload) =>
    request('/auth/apple/native-exchange', { method: 'POST', body: payload }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  // A-1 — soft-deletes the authenticated agent's account. Server sets
  // `deletedAt = NOW()` and clears the session cookie. UI presents this
  // as permanent; the server preserves the row so co-owner agents keep
  // seeing shared properties.
  deleteAccount: () => request('/auth/delete-account', { method: 'POST' }),
  me: () => request('/me'),
  // A-4 — submit first-login onboarding form (license + optional title /
  // agency / phone). On success the server stamps `profileCompletedAt`
  // and the SPA route guard stops redirecting to /onboarding.
  submitOnboarding: (body) => request('/me/profile', { method: 'POST', body }),
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
  // 5.1 — Clones a property into a fresh draft. Backend tags the new
  // row's notes with "(עותק)" and does NOT carry over marketing/viewings.
  duplicateProperty: (id) => request(`/properties/${id}/duplicate`, { method: 'POST' }),

  // 1.5 — Prospect intake
  listProspects:    (propertyId) => request(`/properties/${propertyId}/prospects`),
  createProspect:   (propertyId, body) => request(`/properties/${propertyId}/prospects`, { method: 'POST', body }),
  createProspectDigital: (propertyId, body) =>
    request(`/properties/${propertyId}/prospects/digital`, { method: 'POST', body }),
  deleteProspect:   (propertyId, id) => request(`/properties/${propertyId}/prospects/${id}`, { method: 'DELETE' }),
  // P-3 — signed agreement PDF + lead-link endpoints. The PDF endpoint
  // is a plain HTTP GET — we just expose the URL so it can be used as
  // an anchor `href`, window.open target, or print source.
  prospectAgreementUrl: (prospectId) => `${BASE}/prospects/${prospectId}/agreement.pdf`,
  linkProspectLead:   (prospectId, leadId) =>
    request(`/prospects/${prospectId}/link-lead`, { method: 'POST', body: { leadId } }),
  unlinkProspectLead: (prospectId) =>
    request(`/prospects/${prospectId}/unlink-lead`, { method: 'POST' }),

  // 7.1 — Google Calendar
  calendarStatus:     () => request('/integrations/calendar/status'),
  calendarDisconnect: () => request('/integrations/calendar/disconnect', { method: 'POST' }),
  // connect is a redirect, we navigate directly rather than fetch it.
  calendarConnectUrl: () => `${import.meta.env.VITE_API_URL || '/api'}/integrations/calendar/connect`,

  // Sprint 4 — flat cross-lead meetings list for the /calendar page.
  // Optional `from` / `to` ISO strings bound the window.
  listMeetings: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const s = qs.toString();
    return request(`/meetings${s ? `?${s}` : ''}`);
  },

  // 7.2 — Lead meetings
  listLeadMeetings:  (leadId)       => request(`/integrations/calendar/leads/${leadId}/meetings`),
  createLeadMeeting: (leadId, body) => request(`/integrations/calendar/leads/${leadId}/meetings`, { method: 'POST', body }),
  updateLeadMeeting: (id, body)     => request(`/integrations/calendar/meetings/${id}`, { method: 'PATCH', body }),
  deleteLeadMeeting: (id)           => request(`/integrations/calendar/meetings/${id}`, { method: 'DELETE' }),

  // Sprint 5 / AI — meeting voice summariser. Posts the recorded webm
  // audio to the server; the server uploads to S3 and asks Anthropic
  // for a structured summary (`{ summary, actionItems, nextSteps }`).
  summarizeMeeting: (meetingId, audioFile) => {
    const fd = new FormData();
    // Field name `audio` matches the /api/ai/voice-lead convention so
    // agents handling multipart on the backend stay consistent.
    fd.append('audio', audioFile, audioFile?.name || 'meeting.webm');
    return request(`/meetings/${meetingId}/summarize`, { method: 'POST', body: fd });
  },
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
  getDeal: (id) => request(`/deals/${id}`),
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
  // Download URL for the Agreement PDF. If a signed file is attached
  // the endpoint redirects to its storage URL; otherwise it streams a
  // server-rendered draft PDF. Browser hits this directly.
  agreementPdfUrl: (id) => `${BASE}/agreements/${encodeURIComponent(id)}/pdf`,

  // Sprint 6 / ScreenContract — in-house digital contract e-sign.
  // EXCLUSIVITY / BROKERAGE / OFFER contracts rendered + signed via
  // the reused prospect-pdf path (pdfkit). No DocuSign / HelloSign.
  listContracts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/contracts${qs ? `?${qs}` : ''}`);
  },
  getContract: (id) => request(`/contracts/${id}`),
  createContract: (body) => request('/contracts', { method: 'POST', body }),
  signContract: (id, signatureName) =>
    request(`/contracts/${id}/sign`, { method: 'POST', body: { signatureName } }),
  contractPdfUrl: (id) => `${BASE}/contracts/${id}/pdf`,

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
  // Task 3 · forward-geocode autocomplete for AddressField. `city` is an
  // optional bias hint — when the agent already picked a city the server
  // appends it to the query so Photon ranks local matches first.
  // Task 4 — Yad2 import. Both endpoints 404 when FEATURE_YAD2_IMPORT
  // is off in the deployment environment.
  // Yad2 scraping runs Playwright server-side and occasionally takes
  // 5+ minutes end-to-end (page load + WAF challenge + pagination +
  // image re-host). The default 60s write timeout aborted the fetch
  // mid-crawl, leaving the agent staring at "הבקשה חרגה מזמן המענה"
  // even though the backend was still working. 10-minute cap is a
  // deliberately generous ceiling; the backend caps the crawl itself,
  // so this just prevents the frontend from bailing early.
  yad2Preview: (url) => request('/integrations/yad2/preview', {
    method: 'POST', body: { url }, timeoutMs: 600_000, retries: 1,
  }),
  yad2Import:  (listings) => request('/integrations/yad2/import',  {
    method: 'POST', body: { listings }, timeoutMs: 600_000, retries: 1,
  }),
  // Agency-wide endpoints — preferred. Walks all 3 sections × all
  // pages × server-side image re-host on import.
  //
  // The sync `yad2AgencyPreview` / `yad2AgencyImport` calls below still
  // exist for integration tests, but prod UI uses the *Start + *JobStatus
  // pair: the backend returns a jobId immediately (under CF's 100s edge
  // cap) and the client polls for completion. Without this, a long
  // agency crawl was being killed at the Cloudflare edge mid-flight
  // and surfaced to agents as "אין חיבור לשרת — בדוק חיבור אינטרנט".
  yad2AgencyPreview: (url) => request('/integrations/yad2/agency/preview', {
    method: 'POST', body: { url }, timeoutMs: 600_000, retries: 1,
  }),
  yad2AgencyImport:  (listings) => request('/integrations/yad2/agency/import', {
    method: 'POST', body: { listings }, timeoutMs: 600_000, retries: 1,
  }),
  // Async start endpoints — return { jobId } in <1s. The body payload
  // is small for preview (just a URL) and bounded for import (≤100
  // listings; nginx caps bodies at 120MB which easily fits), so the
  // start call itself is guaranteed to land well under CF's timeout.
  yad2AgencyPreviewStart: (url) => request('/integrations/yad2/agency/preview/start', {
    method: 'POST', body: { url },
  }),
  yad2AgencyImportStart:  (listings) => request('/integrations/yad2/agency/import/start', {
    method: 'POST', body: { listings },
  }),
  // Job status — polled by the scan store until status !== 'running'.
  // Returns { status, kind, result?, error?, startedAt, finishedAt? }.
  yad2JobStatus: (jobId) => request(`/integrations/yad2/jobs/${encodeURIComponent(jobId)}`),
  // Sliding-window quota — { limit, remaining, used, resetAt, msUntilReset }.
  // The Yad2 import screen calls this on mount + after each preview to
  // render the "X/3 left this hour, resets in Y min" chip.
  yad2Quota:         () => request('/integrations/yad2/quota'),

  // Voice-to-lead — sends a recorded audio Blob (webm/ogg/m4a from the
  // browser's MediaRecorder) to the backend, which forwards to the AI
  // orchestrator. Resolves with { transcript, extracted, created, mode,

  // Task 2 — admin users table.
  adminUsers: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const s = qs.toString();
    return request(`/admin/users${s ? `?${s}` : ''}`);
  },
  geoSearch: ({ q, city, limit = 8 } = {}) => {
    const params = new URLSearchParams({ q, limit: String(limit), lang: 'he' });
    if (city) params.set('city', city);
    return request(`/geo/search?${params.toString()}`);
  },

  // SEO public routes
  publicAgent: (agentSlug) => request(`/public/agents/${encodeURIComponent(agentSlug)}`),
  publicProperty: (agentSlug, propertySlug) =>
    request(`/public/agents/${encodeURIComponent(agentSlug)}/properties/${encodeURIComponent(propertySlug)}`),
  // Lookup helper: given an internal property id, returns the slug pair
  // so the dashboard can build a marketable URL. Auth-free.
  lookupPropertySlug: (id) =>
    request(`/public/lookup/property/${encodeURIComponent(id)}`),
  // Per-asset landing-page inquiry form. Public, no auth — called by
  // the /l/:agentSlug/:propertySlug landing page when a prospect
  // submits the contact form. Stored as a PropertyInquiry row.
  submitPropertyInquiry: (agentSlug, propertySlug, body) =>
    request(
      `/public/agents/${encodeURIComponent(agentSlug)}/properties/${encodeURIComponent(propertySlug)}/inquiry`,
      { method: 'POST', body },
    ),

  // Owners
  listOwners:        () => request('/owners'),
  getOwner:          (id) => request(`/owners/${id}`),
  createOwner:       (body) => request('/owners', { method: 'POST', body }),
  updateOwner:       (id, body) => request(`/owners/${id}`, { method: 'PATCH', body }),
  deleteOwner:       (id) => request(`/owners/${id}`, { method: 'DELETE' }),
  searchOwners:      (q) => request(`/owners/search?q=${encodeURIComponent(q)}`),

  // Owner phones (J8 multi-phone)
  listOwnerPhones:   (ownerId) => request(`/owners/${ownerId}/phones`),
  addOwnerPhone:     (ownerId, body) =>
    request(`/owners/${ownerId}/phones`, { method: 'POST', body }),
  updateOwnerPhone:  (id, body) =>
    request(`/owner-phones/${id}`, { method: 'PATCH', body }),
  deleteOwnerPhone:  (id) =>
    request(`/owner-phones/${id}`, { method: 'DELETE' }),

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

  // ─── MLS parity surface ────────────────────────────────────────────────
  // Added as Phase 1 infrastructure for the multi-agent MLS UI build. All
  // endpoints are owner-scoped on the server. Keep these grouped by
  // feature so future renames land in one block.

  // Office (A1)
  getOffice:           () => request('/office'),
  createOffice:        (body) => request('/office', { method: 'POST', body }),
  updateOffice:        (body) => request('/office', { method: 'PATCH', body }),
  addOfficeMember:     (body) => request('/office/members', { method: 'POST', body }),
  removeOfficeMember:  (id) => request(`/office/members/${id}`, { method: 'DELETE' }),
  // A1 fill-in — email-based invites. The server returns a surrogate
  // inviteUrl ({origin}/accept-invite?token=<id>) that the owner can
  // copy/share manually; the invite resolves automatically when the
  // invitee logs in or signs up.
  createOfficeInvite:  (body) => request('/office/invites', { method: 'POST', body }),
  listOfficeInvites:   () => request('/office/invites'),
  revokeOfficeInvite:  (id) => request(`/office/invites/${id}`, { method: 'DELETE' }),

  // Sprint 6 — team scoreboard. Returns
  // { agents: [{ agentId, displayName, avatarUrl, closedDeals,
  //              totalVolume, avgRating, leadsOpen, propertiesActive }],
  //   quarter }
  // scoped to the caller's office. `quarter` is optional ("Qx-yyyy");
  // server defaults to the current quarter when omitted.
  teamScoreboard:      (quarter) => {
    const qs = quarter ? `?${new URLSearchParams({ quarter }).toString()}` : '';
    return request(`/team/scoreboard${qs}`);
  },
  // Full per-agent intel for the /team/:agentId detail page —
  // { agent, properties, leads, deals, totals } scoped to the
  // caller's office; 404 for an unknown id or cross-office access.
  teamAgent:           (agentId) => request(`/team/agents/${agentId}`),

  // Tags (A2)
  listTags:            () => request('/tags'),
  createTag:           (body) => request('/tags', { method: 'POST', body }),
  updateTag:           (id, body) => request(`/tags/${id}`, { method: 'PATCH', body }),
  deleteTag:           (id) => request(`/tags/${id}`, { method: 'DELETE' }),
  assignTag:           (tagId, { entityType, entityId }) =>
    request(`/tags/${tagId}/assign`, { method: 'POST', body: { entityType, entityId } }),
  unassignTag:         (tagId, entityType, entityId) =>
    request(`/tags/${tagId}/assign/${entityType}/${entityId}`, { method: 'DELETE' }),
  listAssignedTags:    (entityType, entityId) => {
    const qs = new URLSearchParams({ entityType, entityId }).toString();
    return request(`/tags/for?${qs}`);
  },

  // Notifications (Sprint 4) — in-app bell + /notifications list page.
  // Server returns { items, unreadCount }; frontend uses both so the
  // badge count is authoritative even when `items` is paginated.
  listNotifications:   (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const s = qs.toString();
    return request(`/notifications${s ? `?${s}` : ''}`);
  },
  markNotificationRead:      (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead:  () => request('/notifications/read-all', { method: 'POST' }),

  // Reminders (D1)
  listReminders:       (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const s = qs.toString();
    return request(`/reminders${s ? `?${s}` : ''}`);
  },
  createReminder:      (body) => request('/reminders', { method: 'POST', body }),
  updateReminder:      (id, body) => request(`/reminders/${id}`, { method: 'PATCH', body }),
  completeReminder:    (id) => request(`/reminders/${id}/complete`, { method: 'POST' }),
  cancelReminder:      (id) => request(`/reminders/${id}/cancel`, { method: 'POST' }),
  deleteReminder:      (id) => request(`/reminders/${id}`, { method: 'DELETE' }),

  // LeadSearchProfile (K4)
  listLeadSearchProfiles:   (leadId) => request(`/leads/${leadId}/search-profiles`),
  createLeadSearchProfile:  (leadId, body) =>
    request(`/leads/${leadId}/search-profiles`, { method: 'POST', body }),
  updateLeadSearchProfile:  (leadId, id, body) =>
    request(`/leads/${leadId}/search-profiles/${id}`, { method: 'PATCH', body }),
  deleteLeadSearchProfile:  (leadId, id) =>
    request(`/leads/${leadId}/search-profiles/${id}`, { method: 'DELETE' }),

  // Matching (C3)
  leadMatches:              (leadId) => request(`/leads/${leadId}/matches`),
  propertyMatchingCustomers: (propertyId) => request(`/properties/${propertyId}/matching-customers`),

  // Sprint 5 — AI smart matcher. Unlike the deterministic /matches
  // endpoints above (hard filter rules), these two ship the full anchor
  // + inventory to Claude and return the top-5 with a 0-100 score + a
  // short Hebrew reason per match. Slower (3-10s) and costs a couple
  // cents per call; gated on ANTHROPIC_API_KEY (503 if unset).
  // Response shape:
  //   match-leads:      { matches: [{ lead:     { id, name, ... }, score, reason }] }
  //   match-properties: { matches: [{ property: { id, city, ... }, score, reason }] }
  aiMatchLeads:      (propertyId) =>
    request(`/ai/match-leads?propertyId=${encodeURIComponent(propertyId)}`, { timeoutMs: 60_000, retries: 1 }),
  aiMatchProperties: (leadId) =>
    request(`/ai/match-properties?leadId=${encodeURIComponent(leadId)}`, { timeoutMs: 60_000, retries: 1 }),

  // Property assignees (J10)
  listPropertyAssignees:    (propertyId) => request(`/properties/${propertyId}/assignees`),
  addPropertyAssignee:      (propertyId, body) =>
    request(`/properties/${propertyId}/assignees`, { method: 'POST', body }),
  removePropertyAssignee:   (propertyId, userId) =>
    request(`/properties/${propertyId}/assignees/${userId}`, { method: 'DELETE' }),

  // Adverts (F1)
  listAdverts:         (propertyId) => request(`/properties/${propertyId}/adverts`),
  createAdvert:        (propertyId, body) =>
    request(`/properties/${propertyId}/adverts`, { method: 'POST', body }),
  updateAdvert:        (id, body) => request(`/adverts/${id}`, { method: 'PATCH', body }),
  deleteAdvert:        (id) => request(`/adverts/${id}`, { method: 'DELETE' }),

  // Global search — cmd-K palette / top-bar search button.
  // Returns { properties, leads, owners, deals } with each bucket
  // capped at 5 (server default) unless `take` is passed explicitly.
  globalSearch:        (q, take) => {
    const qs = new URLSearchParams({ q: q ?? '' });
    if (take !== undefined && take !== null) qs.set('take', String(take));
    return request(`/search?${qs.toString()}`);
  },
  // Sprint 4 — shorter alias. Kept alongside `globalSearch` for existing
  // call sites; new code can use whichever reads better in context.
  search:              (q, take) => {
    const qs = new URLSearchParams({ q: q ?? '' });
    if (take !== undefined && take !== null) qs.set('take', String(take));
    return request(`/search?${qs.toString()}`);
  },

  // Activity feed (H3)
  listActivity:        (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const s = qs.toString();
    return request(`/activity${s ? `?${s}` : ''}`);
  },

  // Reports (E1)
  reportNewProperties:   (params = {}) => request(`/reports/new-properties${qsFrom(params)}`),
  reportNewCustomers:    (params = {}) => request(`/reports/new-customers${qsFrom(params)}`),
  reportDeals:           (params = {}) => request(`/reports/deals${qsFrom(params)}`),
  reportViewings:        (params = {}) => request(`/reports/viewings${qsFrom(params)}`),
  reportMarketingActions: (params = {}) => request(`/reports/marketing-actions${qsFrom(params)}`),
  // B5 — CSV export URLs. Browser downloads need a plain URL (no fetch),
  // so this returns the string and the caller sets window.location or an
  // <a href>. `kind` is one of 'properties' | 'leads' | 'deals'.
  exportUrl:           (kind) => `${BASE}/reports/export/${kind}.csv`,

  // Market context (nadlan.gov.il via Playwright). On-demand refresh —
  // GET returns cached or 204; POST refresh fires the live crawl.
  // `kind` is 'buy' | 'rent'.
  marketContextGet:    (propertyId, kind = 'buy') =>
    request(`/market/property/${propertyId}?kind=${kind}`),
  // Legacy sync refresh — kept for back-compat. Prod traffic uses the
  // start+poll pair below so the long Playwright crawl dodges
  // Cloudflare's 100s edge timeout.
  marketContextRefresh: (propertyId, kind = 'buy') =>
    request(`/market/property/${propertyId}/refresh?kind=${kind}`, { method: 'POST', timeoutMs: 60000 }),
  // Async start — returns { jobId } immediately. Server coalesces
  // repeat clicks on the same (property, kind) into one in-flight job.
  marketContextRefreshStart: (propertyId, kind = 'buy') =>
    request(`/market/property/${propertyId}/refresh/start?kind=${kind}`, { method: 'POST' }),
  // Poll until status !== 'running'. Used by marketScanStore.
  marketJobStatus: (jobId) => request(`/market/jobs/${encodeURIComponent(jobId)}`),

  // Excel / CSV import. `type` is 'leads' or 'properties'.
  startImport: (type, body) => request(`/import/${type}/start`, {
    method: 'POST', body,
    // Imports up to 2,000 rows at a time — give the initial POST a
    // generous timeout since zod validation + the job-spawn can take
    // a second or two on a warm cache miss.
    timeoutMs: 60_000,
  }),
  getImportJob:  (jobId) => request(`/import/jobs/${encodeURIComponent(jobId)}`),
  listImportMappings: (entityType, headerSig) => {
    const qs = new URLSearchParams({ entityType, ...(headerSig ? { headerSig } : {}) }).toString();
    return request(`/import/mappings?${qs}`);
  },
  saveImportMapping: (entityType, headerSig, mapping) =>
    request('/import/mappings', { method: 'PUT', body: { entityType, headerSig, mapping } }),

  // Neighborhoods (G1)
  listNeighborhoods:   (params = {}) => request(`/neighborhoods${qsFrom(params)}`),
  createNeighborhood:  (body) => request('/neighborhoods', { method: 'POST', body }),

  // Neighborhood groups (G2) — OWNER-curated marketable areas that
  // bundle G1 neighborhoods. Public read, OWNER-only mutations (the
  // backend rejects non-OWNER POST/PATCH/DELETE with 403).
  listNeighborhoodGroups:   (params = {}) => request(`/neighborhood-groups${qsFrom(params)}`),
  createNeighborhoodGroup:  (body) => request('/neighborhood-groups', { method: 'POST', body }),
  updateNeighborhoodGroup:  (id, body) => request(`/neighborhood-groups/${id}`, { method: 'PATCH', body }),
  deleteNeighborhoodGroup:  (id) => request(`/neighborhood-groups/${id}`, { method: 'DELETE' }),

  // Saved searches (B3)
  listSavedSearches:   (entityType) => {
    const qs = entityType ? `?${new URLSearchParams({ entityType }).toString()}` : '';
    return request(`/saved-searches${qs}`);
  },
  createSavedSearch:   (body) => request('/saved-searches', { method: 'POST', body }),
  updateSavedSearch:   (id, body) => request(`/saved-searches/${id}`, { method: 'PATCH', body }),
  deleteSavedSearch:   (id) => request(`/saved-searches/${id}`, { method: 'DELETE' }),

  // H3 — voice-to-lead. Uploads raw audio (multipart) to the LLM
  // extraction endpoint and returns either a drafted object (for the
  // caller to review + submit via createLead/createProperty) or a
  // fully-created entity (the backend chose to persist because the
  // extracted fields were complete enough).
  //
  // Response shape:
  //   { transcript, extracted, created?, mode: 'created' | 'draft', traceId }
  //
  // Kept deliberately small because this surface is the main feature
  // of this release — the backend contract is being written by a
  // sibling agent; this method matches the agreed shape.
  voiceLead: (audioBlob, kind = 'LEAD') => {
    const fd = new FormData();
    // Fall back filename so servers that key on upload.filename see
    // something sensible in logs.
    const ext = (audioBlob?.type || '').includes('mp4') ? 'm4a'
              : (audioBlob?.type || '').includes('mpeg') ? 'mp3'
              : 'webm';
    fd.append('audio', audioBlob, `voice-${Date.now()}.${ext}`);
    const k = kind === 'PROPERTY' ? 'PROPERTY' : 'LEAD';
    return request(`/ai/voice-lead?kind=${k}`, {
      method: 'POST',
      body: fd,
      // Voice extraction is slower than a typical write (upload + LLM);
      // bump the timeout so we don't abort before the server responds.
      timeoutMs: 90_000,
    });
  },

  // Sprint 5 — AI property-description generator. Backend calls Claude
  // Opus 4.7 and returns { description, highlights: string[5] }. 503 if
  // ANTHROPIC_API_KEY is missing in the deployment environment.
  generatePropertyDescription: (propertyId) =>
    request('/ai/describe-property', {
      method: 'POST',
      body: { propertyId },
      // Anthropic inference can take 5-15s; default write timeout is
      // already 60s — the explicit value here survives future tweaks to
      // DEFAULT_TIMEOUT_WRITE_MS.
      timeoutMs: 60_000,
      retries: 1,
    }),

  // Sprint 7 — Pre-meeting AI brief. Backend loads the meeting + lead +
  // agent's recent properties and asks Claude for a structured prep
  // card: { brief, checklist: string[], talkingPoints: string[] }.
  // 503 if ANTHROPIC_API_KEY is missing.
  aiMeetingBrief: (meetingId) =>
    request('/ai/meeting-brief', {
      method: 'POST',
      body: { meetingId },
      timeoutMs: 60_000,
      retries: 1,
    }),

  // Sprint 7 — Buyer-offer review. Backend returns
  // { recommendedCounter, confidence: 'low'|'medium'|'high', reasoning }
  // for a given deal + current offer amount. Used by OfferReviewPanel
  // inside DealDetail.
  aiOfferReview: (dealId, offerAmount) =>
    request('/ai/offer-review', {
      method: 'POST',
      body: { dealId, offerAmount },
      timeoutMs: 60_000,
      retries: 1,
    }),

  // Sprint 7 — Estia AI chat. The /ai page keeps the transcript in
  // client state and replays it on every call (no server-side history).
  // `messages` is `[{ role: 'user'|'assistant', content: string }]`.
  // Returns `{ reply }`; 503 if the key is missing.
  aiChat: (messages) =>
    request('/ai/chat', {
      method: 'POST',
      body: { messages },
      timeoutMs: 60_000,
      retries: 1,
    }),

  // Sprint 6 — Documents library. S3-backed /documents page (pdf/dwg/
  // zip/xlsx). `params` accepts `kind` (one of the mime families above)
  // and `tag` (repeatable). Response is { items: [{ id, originalName,
  // mimeType, sizeBytes, tags, kind, createdAt, url }] }.
  listDocuments: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      if (Array.isArray(v)) v.forEach((vv) => qs.append(k, String(vv)));
      else qs.set(k, String(v));
    });
    const s = qs.toString();
    return request(`/documents${s ? `?${s}` : ''}`);
  },
  uploadDocument: (file, tags) => {
    const fd = new FormData();
    fd.append('file', file);
    const list = Array.isArray(tags) ? tags : tags ? [tags] : [];
    for (const t of list) {
      const v = String(t || '').trim();
      if (v) fd.append('tags', v);
    }
    return request('/documents', { method: 'POST', body: fd });
  },
  deleteDocument: (id) => request(`/documents/${id}`, { method: 'DELETE' }),

  // Favorites (B4)
  listFavorites:       (entityType) => {
    const qs = entityType ? `?${new URLSearchParams({ entityType }).toString()}` : '';
    return request(`/favorites${qs}`);
  },
  addFavorite:         (body) => request('/favorites', { method: 'POST', body }),
  removeFavorite:      (entityType, entityId) =>
    request(`/favorites/${entityType}/${entityId}`, { method: 'DELETE' }),

  // Sprint 9 — Marketing hub (/marketing). Lane C owns the frontend; the
  // backend endpoints are built in parallel by the other lanes. The
  // overview aggregates views / inquiries / agreements into KPIs, a
  // top-performer list, and a per-property row set with a 14-day
  // viewsTrend array that the UI renders as an inline SVG sparkline.
  marketingOverview:       () => request('/marketing/overview'),
  listMarketingInquiries:  () => request('/marketing/inquiries'),
  promoteMarketingInquiry: (id) => request(`/marketing/inquiries/${id}/promote`, { method: 'POST' }),
  // Public landing-page view tracker — fire-and-forget POST called once
  // per tab-session by PropertyLandingPage. Body is an empty object so
  // Content-Length stays >0 (some CDNs mis-handle empty POST bodies).
  trackPublicPropertyView: (agentSlug, propertySlug) => request(
    `/public/agents/${encodeURIComponent(agentSlug)}/properties/${encodeURIComponent(propertySlug)}/view`,
    { method: 'POST', body: {} },
  ),
};

// Small querystring helper: drops empty values so `?from=&to=` doesn't
// pollute server logs. Shared by the report endpoints.
function qsFrom(params) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export default api;
