// Sprint 2 C2 + Sprint 7 B3/B4 — Customers page integration test.
// Covers the new Nadlan-parity filter drawer, saved-search menu, and
// favorite-star toggle on each lead row. Existing behavior (search,
// tabs, sort, delete) is covered elsewhere via unit tests of the page's
// helpers + by the mobile-specific composite tests; this file focuses
// on the new feature surface.

import { describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor, within } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import Customers from '@estia/frontend/pages/Customers.jsx';

const sampleLeads = [
  {
    id: 'l1', name: 'דנה אבני', phone: '050-1111111', city: 'תל אביב',
    lookingFor: 'BUY', interestType: 'PRIVATE', status: 'HOT', rooms: 4,
  },
  {
    id: 'l2', name: 'רון כהן', phone: '050-2222222', city: 'חיפה',
    lookingFor: 'RENT', interestType: 'COMMERCIAL', status: 'WARM', rooms: 3,
  },
];

function mountLeads(items = sampleLeads) {
  server.use(
    http.get('/api/leads', () => HttpResponse.json({ items }))
  );
}

describe('<Customers> filter + saved-search + favorite', () => {
  it('renders the lead rows once /api/leads resolves', async () => {
    mountLeads();
    render(<Customers />, { route: '/customers' });
    await screen.findByText('דנה אבני');
    expect(screen.getByText('רון כהן')).toBeInTheDocument();
  });

  it('opens the advanced filter panel when "סינון מתקדם" is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    mountLeads();
    render(<Customers />, { route: '/customers' });
    await screen.findByText('דנה אבני');
    // The filter trigger is visible on desktop; aria-label is the
    // stable anchor across layouts.
    await user.click(screen.getByRole('button', { name: /סינון מתקדם/ }));
    expect(await screen.findByRole('dialog', { name: 'סינון מתקדם' })).toBeInTheDocument();
  });

  it('applying a filter re-fetches /api/leads with the new query', async () => {
    const user = userEvent.setup({ delay: null });
    const requests = [];
    server.use(
      http.get('/api/leads', ({ request }) => {
        const url = new URL(request.url);
        requests.push(url.searchParams.toString());
        return HttpResponse.json({ items: sampleLeads });
      })
    );
    render(<Customers />, { route: '/customers' });
    await screen.findByText('דנה אבני');
    // Initial fetch has no filters.
    expect(requests[0]).toBe('');
    await user.click(screen.getByRole('button', { name: /סינון מתקדם/ }));
    // Pick HOT in lead heat. Scope to the drawer because the page
    // header has its own "חם" quick-filter tab.
    const dialog = await screen.findByRole('dialog', { name: 'סינון מתקדם' });
    const dialogScope = within(dialog);
    await user.click(dialogScope.getByRole('button', { name: /^חם$/ }));
    await user.click(dialogScope.getByRole('button', { name: /החל סינון/ }));
    // Wait for the re-fetch that carries the `heat=HOT` parameter.
    await waitFor(() => {
      expect(requests.some((q) => q.includes('heat=HOT'))).toBe(true);
    });
  });

  it('shows an active-filter count pill on the filter trigger after applying', async () => {
    const user = userEvent.setup({ delay: null });
    mountLeads();
    render(<Customers />, { route: '/customers' });
    await screen.findByText('דנה אבני');
    await user.click(screen.getByRole('button', { name: /סינון מתקדם/ }));
    const dialog = await screen.findByRole('dialog', { name: 'סינון מתקדם' });
    const d = within(dialog);
    await user.click(d.getByRole('button', { name: /^חם$/ }));
    await user.click(d.getByRole('button', { name: /מעלית/ }));
    await user.click(d.getByRole('button', { name: /החל סינון/ }));
    // After apply, the trigger button's accessible name includes the count.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /סינון מתקדם.*2/ })).toBeInTheDocument();
    });
  });

  it('saved-search menu trigger is present in the toolbar', async () => {
    mountLeads();
    render(<Customers />, { route: '/customers' });
    await screen.findByText('דנה אבני');
    expect(screen.getByRole('button', { name: /חיפושים שמורים/ })).toBeInTheDocument();
  });

  it('toggling the star on a row POSTs to /api/favorites', async () => {
    const user = userEvent.setup({ delay: null });
    mountLeads();
    let postedBody = null;
    server.use(
      http.post('/api/favorites', async ({ request }) => {
        postedBody = await request.json();
        return HttpResponse.json({
          favorite: {
            id: 'fav-1', agentId: 'a1', entityType: 'LEAD',
            entityId: postedBody.entityId, createdAt: new Date().toISOString(),
          },
        });
      })
    );
    render(<Customers />, { route: '/customers' });
    await screen.findByText('דנה אבני');
    // Each row renders a FavoriteStar labelled "הוסף למועדפים". Multiple
    // rows → multiple buttons; pick the first one (associated with l1).
    const stars = await screen.findAllByRole('button', { name: /הוסף למועדפים/ });
    expect(stars.length).toBeGreaterThan(0);
    await user.click(stars[0]);
    await waitFor(() => expect(postedBody).not.toBeNull());
    expect(postedBody).toMatchObject({ entityType: 'LEAD', entityId: 'l1' });
  });

  it('"only favorites" toggle filters the list to favorited leads', async () => {
    const user = userEvent.setup({ delay: null });
    server.use(
      http.get('/api/leads', () => HttpResponse.json({ items: sampleLeads })),
      http.get('/api/favorites', () =>
        HttpResponse.json({
          items: [{
            id: 'fv', agentId: 'a1', entityType: 'LEAD', entityId: 'l2',
            createdAt: '2026-04-10T00:00:00.000Z',
          }],
        })
      )
    );
    render(<Customers />, { route: '/customers' });
    await screen.findByText('דנה אבני');
    // Both visible initially.
    expect(screen.getByText('רון כהן')).toBeInTheDocument();
    // Toggle "רק מועדפים"
    await user.click(screen.getByRole('button', { name: /רק מועדפים/ }));
    // l2 (רון כהן) is favorited, l1 should disappear.
    await waitFor(() => {
      expect(screen.queryByText('דנה אבני')).toBeNull();
    });
    expect(screen.getByText('רון כהן')).toBeInTheDocument();
  });

  // ── Phase 4 Lane 3 / Task C4 — seriousness inline popover ──────────
  // The lead card shows a chip with the Hebrew label for
  // `seriousnessOverride` (ללא / סוג של / בינוני / מאוד). Clicking the
  // chip opens a small popover with the four options; picking one
  // patches the lead via api.updateLead and updates the chip
  // optimistically. Failure rolls back + surfaces a toast.
  describe('seriousness chip + popover (C4)', () => {
    const leadsWithSeriousness = [
      { ...sampleLeads[0], seriousnessOverride: 'MEDIUM' },
      { ...sampleLeads[1], seriousnessOverride: 'NONE' },
    ];

    it('renders each lead\'s current seriousness as a chip', async () => {
      mountLeads(leadsWithSeriousness);
      render(<Customers />, { route: '/customers' });
      await screen.findByText('דנה אבני');
      // At minimum, the chip text appears in the page (desktop card view).
      expect(screen.getByRole('button', { name: /רצינות: בינוני/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /רצינות: ללא/ })).toBeInTheDocument();
    });

    it('clicking the chip opens a popover with the four enum options', async () => {
      const user = userEvent.setup({ delay: null });
      mountLeads(leadsWithSeriousness);
      render(<Customers />, { route: '/customers' });
      await screen.findByText('דנה אבני');
      await user.click(screen.getByRole('button', { name: /רצינות: בינוני/ }));
      const pop = await screen.findByRole('dialog', { name: /רצינות/ });
      const p = within(pop);
      expect(p.getByRole('menuitem', { name: 'ללא' })).toBeInTheDocument();
      expect(p.getByRole('menuitem', { name: 'סוג של' })).toBeInTheDocument();
      expect(p.getByRole('menuitem', { name: 'בינוני' })).toBeInTheDocument();
      expect(p.getByRole('menuitem', { name: 'מאוד' })).toBeInTheDocument();
    });

    it('picking a value PATCHes /api/leads/:id and updates the chip optimistically', async () => {
      const user = userEvent.setup({ delay: null });
      mountLeads(leadsWithSeriousness);
      let patchedBody = null;
      server.use(
        http.patch('/api/leads/:id', async ({ request, params }) => {
          patchedBody = await request.json();
          return HttpResponse.json({
            lead: { id: params.id, ...leadsWithSeriousness[0], ...patchedBody },
          });
        }),
      );
      render(<Customers />, { route: '/customers' });
      await screen.findByText('דנה אבני');
      await user.click(screen.getByRole('button', { name: /רצינות: בינוני/ }));
      const pop = await screen.findByRole('dialog', { name: /רצינות/ });
      await user.click(within(pop).getByRole('menuitem', { name: 'מאוד' }));
      await waitFor(() => {
        expect(patchedBody).toEqual({ seriousnessOverride: 'VERY' });
      });
      // Chip updates optimistically to the new label.
      await screen.findByRole('button', { name: /רצינות: מאוד/ });
    });

    it('rolls back the chip if the PATCH fails', async () => {
      const user = userEvent.setup({ delay: null });
      mountLeads(leadsWithSeriousness);
      server.use(
        http.patch('/api/leads/:id', () =>
          HttpResponse.json({ error: 'boom' }, { status: 500 })
        ),
        // The rollback fetches /api/leads again.
        http.get('/api/leads', () => HttpResponse.json({ items: leadsWithSeriousness })),
      );
      render(<Customers />, { route: '/customers' });
      await screen.findByText('דנה אבני');
      await user.click(screen.getByRole('button', { name: /רצינות: בינוני/ }));
      const pop = await screen.findByRole('dialog', { name: /רצינות/ });
      await user.click(within(pop).getByRole('menuitem', { name: 'מאוד' }));
      // After rollback + refetch, the chip is back to בינוני.
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /רצינות: בינוני/ })).toBeInTheDocument();
      });
    });

    it('popover passes axe', async () => {
      const user = userEvent.setup({ delay: null });
      mountLeads(leadsWithSeriousness);
      render(<Customers />, { route: '/customers' });
      await screen.findByText('דנה אבני');
      await user.click(screen.getByRole('button', { name: /רצינות: בינוני/ }));
      // Scope axe to the popover itself — the rest of the Customers
      // page has pre-existing landmark violations that aren't part of
      // this lane's surface.
      const pop = await screen.findByRole('dialog', { name: /רצינות/ });
      expect(await axe(pop)).toHaveNoViolations();
    });
  });

  it('loading a saved search applies its filters and re-fetches', async () => {
    const user = userEvent.setup({ delay: null });
    const requests = [];
    server.use(
      http.get('/api/leads', ({ request }) => {
        const url = new URL(request.url);
        requests.push(url.searchParams.toString());
        return HttpResponse.json({ items: sampleLeads });
      }),
      http.get('/api/saved-searches', () =>
        HttpResponse.json({
          items: [{
            id: 'ss-1', entityType: 'LEAD', name: 'חמים בלבד',
            filters: { heat: ['WARM'] }, createdAt: '2026-04-10T00:00:00.000Z',
          }],
        })
      )
    );
    render(<Customers />, { route: '/customers' });
    await screen.findByText('דנה אבני');
    await user.click(screen.getByRole('button', { name: /חיפושים שמורים/ }));
    await user.click(await screen.findByText('חמים בלבד'));
    await waitFor(() => {
      expect(requests.some((q) => q.includes('heat=WARM'))).toBe(true);
    });
  });
});
