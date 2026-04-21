// Default MSW handlers — the safety net that lets most component tests
// run without manually mocking every endpoint they touch. Tests with
// specific needs override with `server.use(...)`.
//
// The handlers return the minimum shape that each API client helper
// expects (see frontend/src/lib/api.js). If the real API changes shape,
// update these here so the shared-surface bugs get caught by the tests.

import { http, HttpResponse } from 'msw';

const DEMO_AGENT = {
  id: 'test-agent-1',
  email: 'agent.demo@estia.app',
  role: 'AGENT',
  displayName: 'יוסי כהן',
  slug: 'יוסי-כהן',
  phone: '050-1234567',
  avatarUrl: null,
  agentProfile: { agency: 'Acme Realty', title: 'סוכן', bio: '' },
  customerProfile: null,
  hasCompletedTutorial: true,
  firstLoginPlatform: 'web',
};

export const defaultHandlers = [
  // Auth / session
  http.get('/api/me', () => HttpResponse.json({ user: DEMO_AGENT })),
  http.post('/api/auth/login', () =>
    HttpResponse.json({ user: DEMO_AGENT, token: 'test-token' })
  ),
  http.post('/api/auth/logout', () => HttpResponse.json({ ok: true })),

  // Chat bootstrap — Layout + ChatWidget poll these on mount.
  http.get('/api/chat/me', () =>
    HttpResponse.json({ conversation: { id: 'c1', userId: DEMO_AGENT.id }, messages: [] })
  ),

  // Properties
  http.get('/api/properties', () => HttpResponse.json({ items: [] })),
  http.get('/api/properties/:id', ({ params }) =>
    HttpResponse.json({ property: { id: params.id, agentId: DEMO_AGENT.id, images: [] } })
  ),

  // Leads / customers
  http.get('/api/leads', () => HttpResponse.json({ items: [] })),
  http.get('/api/leads/:id', ({ params }) =>
    HttpResponse.json({ lead: { id: params.id, agentId: DEMO_AGENT.id } })
  ),

  // Owners
  http.get('/api/owners', () => HttpResponse.json({ items: [] })),
  http.get('/api/owners/:id', ({ params }) =>
    HttpResponse.json({ owner: { id: params.id, agentId: DEMO_AGENT.id, properties: [] } })
  ),
  http.get('/api/owners/search', () => HttpResponse.json({ items: [] })),

  // Deals
  http.get('/api/deals', () => HttpResponse.json({ items: [] })),

  // Transfers
  http.get('/api/transfers', () => HttpResponse.json({ items: [] })),

  // Templates
  http.get('/api/templates', () =>
    HttpResponse.json({
      templates: [
        { kind: 'BUY_PRIVATE', body: 'דוגמה', updatedAt: null, custom: false },
      ],
    })
  ),

  // Lookups (cities, streets)
  http.get('/api/lookups/cities', () => HttpResponse.json({ items: [] })),
  http.get('/api/lookups/streets', () => HttpResponse.json({ items: [] })),

  // Reports (dashboard KPIs)
  http.get('/api/reports/dashboard', () =>
    HttpResponse.json({
      activeProperties: 0, activeLeads: 0, openDeals: 0, revenueMonth: 0,
    })
  ),

  // Yad2 integration
  http.get('/api/integrations/yad2/quota', () =>
    HttpResponse.json({ limit: 3, remaining: 3, used: 0, resetAt: null, msUntilReset: 0 })
  ),

  // Calendar integration
  http.get('/api/integrations/calendar/status', () =>
    HttpResponse.json({ connected: false, expiresAt: null, configured: false })
  ),

  // Admin (most components render an empty state when not admin)
  http.get('/api/admin/users', () => HttpResponse.json({ users: [] })),

  // Public portal reads
  http.get('/api/public/agents/:slug', () =>
    HttpResponse.json({ agent: DEMO_AGENT, properties: [] })
  ),

  // Agent / property legacy routes
  http.get('/api/agents/:id/public', () => HttpResponse.json({ agent: DEMO_AGENT })),
  http.get('/api/agents/:id/properties', () => HttpResponse.json({ items: [] })),

  // Geo / address autocomplete (Photon + Nominatim proxies)
  http.get('/api/geo/autocomplete', () => HttpResponse.json({ items: [] })),
  http.get('/api/geo/reverse', () => HttpResponse.json({ address: null })),
];
