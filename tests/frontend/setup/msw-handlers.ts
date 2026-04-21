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

  // Owner phones (J8 multi-phone)
  http.get('/api/owners/:id/phones', () => HttpResponse.json({ items: [] })),
  http.post('/api/owners/:id/phones', async ({ request }) => {
    const body: any = await request.json().catch(() => ({}));
    return HttpResponse.json({
      phone: {
        id: `ph_${Date.now()}`,
        ownerId: 'owner-1',
        phone: body.phone ?? '',
        kind: body.kind ?? 'primary',
        label: body.label ?? null,
        sortOrder: body.sortOrder ?? 0,
      },
    });
  }),
  http.patch('/api/owner-phones/:id', async ({ params, request }) => {
    const body: any = await request.json().catch(() => ({}));
    return HttpResponse.json({
      phone: { id: params.id, ownerId: 'owner-1', ...body },
    });
  }),
  http.delete('/api/owner-phones/:id', () => HttpResponse.json({ ok: true })),

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

  // ─── MLS parity surface ───────────────────────────────────────────────
  // Default handlers return empty / minimal shapes so component tests
  // render their empty states cleanly. Tests that need populated data
  // override with `server.use(...)`.

  // Office (A1)
  http.get('/api/office', () => HttpResponse.json({ office: null, members: [] })),
  http.post('/api/office', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    return HttpResponse.json({ office: { id: 'office-1', name: body?.name ?? 'משרד' } });
  }),
  http.patch('/api/office', () =>
    HttpResponse.json({ office: { id: 'office-1', name: 'משרד' } })
  ),
  http.post('/api/office/members', () =>
    HttpResponse.json({ member: { id: 'm1', userId: 'u1', role: 'MEMBER' } })
  ),
  http.delete('/api/office/members/:id', () => HttpResponse.json({ ok: true })),

  // Tags (A2)
  http.get('/api/tags', () => HttpResponse.json({ items: [] })),
  http.post('/api/tags', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string; color?: string; scope?: string;
    };
    return HttpResponse.json({
      tag: {
        id: 'tag-1',
        name: body?.name ?? 'תג',
        color: body?.color ?? null,
        scope: body?.scope ?? 'ALL',
      },
    });
  }),
  http.patch('/api/tags/:id', ({ params }) =>
    HttpResponse.json({ tag: { id: params.id, name: 'תג', color: null, scope: 'ALL' } })
  ),
  http.delete('/api/tags/:id', () => HttpResponse.json({ ok: true })),
  http.post('/api/tags/:id/assign', () => HttpResponse.json({ ok: true })),
  http.delete('/api/tags/:id/assign/:entityType/:entityId', () =>
    HttpResponse.json({ ok: true })
  ),
  http.get('/api/tags/for', () => HttpResponse.json({ items: [] })),

  // Reminders (D1)
  http.get('/api/reminders', () => HttpResponse.json({ items: [] })),
  http.post('/api/reminders', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      title?: string; dueAt?: string; notes?: string;
      leadId?: string; propertyId?: string; customerId?: string;
    };
    return HttpResponse.json({
      reminder: {
        id: 'rem-1',
        title: body?.title ?? '',
        notes: body?.notes ?? null,
        dueAt: body?.dueAt ?? null,
        status: 'PENDING',
        completedAt: null,
        cancelledAt: null,
        leadId: body?.leadId ?? null,
        propertyId: body?.propertyId ?? null,
        customerId: body?.customerId ?? null,
      },
    });
  }),
  http.patch('/api/reminders/:id', ({ params }) =>
    HttpResponse.json({ reminder: { id: params.id, status: 'PENDING' } })
  ),
  http.post('/api/reminders/:id/complete', ({ params }) =>
    HttpResponse.json({
      reminder: { id: params.id, status: 'COMPLETED', completedAt: new Date().toISOString() },
    })
  ),
  http.post('/api/reminders/:id/cancel', ({ params }) =>
    HttpResponse.json({
      reminder: { id: params.id, status: 'CANCELLED', cancelledAt: new Date().toISOString() },
    })
  ),
  http.delete('/api/reminders/:id', () => HttpResponse.json({ ok: true })),

  // Lead search profiles (K4)
  http.get('/api/leads/:leadId/search-profiles', () => HttpResponse.json({ items: [] })),
  http.post('/api/leads/:leadId/search-profiles', ({ params }) =>
    HttpResponse.json({ profile: { id: 'sp-1', leadId: params.leadId } })
  ),
  http.patch('/api/leads/:leadId/search-profiles/:id', ({ params }) =>
    HttpResponse.json({ profile: { id: params.id, leadId: params.leadId } })
  ),
  http.delete('/api/leads/:leadId/search-profiles/:id', () =>
    HttpResponse.json({ ok: true })
  ),

  // Matching (C3)
  http.get('/api/leads/:id/matches', () => HttpResponse.json({ items: [] })),
  http.get('/api/properties/:id/matching-customers', () => HttpResponse.json({ items: [] })),

  // Property assignees (J10)
  http.get('/api/properties/:id/assignees', () => HttpResponse.json({ items: [] })),
  http.post('/api/properties/:id/assignees', ({ params }) =>
    HttpResponse.json({
      assignee: {
        propertyId: params.id,
        userId: 'u1',
        role: 'CO_AGENT',
        assignedAt: new Date().toISOString(),
        user: { id: 'u1', displayName: 'שותף', email: 'partner@estia.app', role: 'AGENT' },
      },
    })
  ),
  http.delete('/api/properties/:id/assignees/:userId', () =>
    HttpResponse.json({ ok: true })
  ),

  // Adverts (F1)
  http.get('/api/properties/:propertyId/adverts', () => HttpResponse.json({ items: [] })),
  http.post('/api/properties/:propertyId/adverts', ({ params }) =>
    HttpResponse.json({
      advert: {
        id: 'ad-1',
        agentId: DEMO_AGENT.id,
        propertyId: params.propertyId,
        channel: 'YAD2',
        status: 'DRAFT',
        title: null,
        body: null,
        publishedPrice: null,
        externalUrl: null,
        externalId: null,
        publishedAt: null,
        expiresAt: null,
      },
    })
  ),
  http.patch('/api/adverts/:id', ({ params }) =>
    HttpResponse.json({ advert: { id: params.id, status: 'DRAFT' } })
  ),
  http.delete('/api/adverts/:id', () => HttpResponse.json({ ok: true })),

  // Global search (H1)
  http.get('/api/search', ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      query: url.searchParams.get('q') ?? '',
      total: 0,
      properties: [],
      leads: [],
      owners: [],
      deals: [],
    });
  }),

  // Activity (H3)
  http.get('/api/activity', () => HttpResponse.json({ items: [] })),

  // Reports (E1)
  http.get('/api/reports/new-properties', () => HttpResponse.json({ items: [], count: 0 })),
  http.get('/api/reports/new-customers', () => HttpResponse.json({ items: [], count: 0 })),
  http.get('/api/reports/viewings', () => HttpResponse.json({ items: [], count: 0 })),
  http.get('/api/reports/marketing-actions', () =>
    HttpResponse.json({ items: [], count: 0 })
  ),
  http.get('/api/reports/deals', () =>
    HttpResponse.json({ items: [], count: 0, totalCommission: 0, byStatus: {} })
  ),

  // CSV export (B5) — returns text/csv so fetch.text() works; api.exportUrl
  // itself never fetches, but MSW still needs a handler for anything that
  // does (e.g. a component fetching the CSV blob directly).
  http.get('/api/reports/export/:kind.csv', () =>
    new HttpResponse('id,name\n', {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    })
  ),

  // Neighborhoods (G1)
  http.get('/api/neighborhoods', () => HttpResponse.json({ items: [] })),
  http.post('/api/neighborhoods', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      city?: string; name?: string; aliases?: string[];
    };
    return HttpResponse.json({
      neighborhood: {
        id: 'nb-1',
        city: body?.city ?? '',
        name: body?.name ?? '',
        aliases: body?.aliases ?? [],
      },
    });
  }),

  // Neighborhood groups (G2)
  http.get('/api/neighborhood-groups', () => HttpResponse.json({ items: [] })),
  http.post('/api/neighborhood-groups', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      city?: string; name?: string; description?: string;
      aliases?: string[]; memberIds?: string[];
    };
    return HttpResponse.json({
      group: {
        id: 'ng-1',
        city: body?.city ?? '',
        name: body?.name ?? '',
        description: body?.description ?? null,
        aliases: body?.aliases ?? [],
        members: (body?.memberIds ?? []).map((nid, i) => ({
          groupId: 'ng-1',
          neighborhoodId: nid,
          sortOrder: i,
          neighborhood: { id: nid, city: body?.city ?? '', name: nid, aliases: [] },
        })),
      },
    });
  }),
  http.patch('/api/neighborhood-groups/:id', async ({ params, request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      city?: string; name?: string; description?: string;
      aliases?: string[]; memberIds?: string[];
    };
    return HttpResponse.json({
      group: {
        id: params.id,
        city: body?.city ?? '',
        name: body?.name ?? '',
        description: body?.description ?? null,
        aliases: body?.aliases ?? [],
        members: (body?.memberIds ?? []).map((nid, i) => ({
          groupId: params.id,
          neighborhoodId: nid,
          sortOrder: i,
          neighborhood: { id: nid, city: body?.city ?? '', name: nid, aliases: [] },
        })),
      },
    });
  }),
  http.delete('/api/neighborhood-groups/:id', () => HttpResponse.json({ ok: true })),

  // Saved searches (B3)
  http.get('/api/saved-searches', () => HttpResponse.json({ items: [] })),
  http.post('/api/saved-searches', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      entityType?: string; name?: string; filters?: unknown;
    };
    return HttpResponse.json({
      savedSearch: {
        id: 'ss-1',
        agentId: DEMO_AGENT.id,
        entityType: body?.entityType ?? 'PROPERTY',
        name: body?.name ?? '',
        filters: body?.filters ?? {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  }),
  http.patch('/api/saved-searches/:id', ({ params }) =>
    HttpResponse.json({ savedSearch: { id: params.id } })
  ),
  http.delete('/api/saved-searches/:id', () => HttpResponse.json({ ok: true })),

  // Favorites (B4)
  http.get('/api/favorites', () => HttpResponse.json({ items: [] })),
  http.post('/api/favorites', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      entityType?: string; entityId?: string;
    };
    return HttpResponse.json({
      favorite: {
        id: 'fav-1',
        agentId: DEMO_AGENT.id,
        entityType: body?.entityType ?? 'PROPERTY',
        entityId: body?.entityId ?? '',
        createdAt: new Date().toISOString(),
      },
    });
  }),
  http.delete('/api/favorites/:entityType/:entityId', () =>
    HttpResponse.json({ ok: true })
  ),
];
