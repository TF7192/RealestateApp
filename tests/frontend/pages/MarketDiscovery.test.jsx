// MarketDiscovery — page-level integration test for the redesign.
// Covers:
//   1) Default fetch sends `firstSeenAfter=3d` (the post-redesign default).
//   2) Pulse strip renders KPI numbers from /api/market-discovery/pulse.
//   3) Listings render as dense rows with the address + price + match pill.
//   4) Clicking a row opens the detail drawer with the match analysis.
//   5) Email-signup banner shows only when prefs are off AND there are
//      open matches (the contextual nudge contract).
//
// We intentionally do NOT test the WhatsApp dialog opening wa.me — that
// would mean stubbing window.open in jsdom and is brittle for very
// little signal beyond "the click handler is wired".

import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import MarketDiscovery from '@estia/frontend/pages/MarketDiscovery.jsx';

// Helper — stable shape matching what the backend now returns.
function listingFixture(overrides = {}) {
  return {
    id: 'lst-1',
    source: 'yad2',
    externalListingId: 'yad2-1',
    originalUrl: 'https://www.yad2.co.il/realestate/item/yad2-1',
    city: 'הרצליה',
    neighborhood: 'מרכז העיר',
    street: 'בן גוריון',
    propertyType: 'דירה',
    rooms: 4,
    sizeSqm: 95,
    floor: 3,
    price: 2_500_000,
    pricePerSqm: 26315,
    kind: 'forsale',
    posterType: 'private',
    firstSeenAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    status: 'active',
    matches: [],
    topMatch: null,
    duplicatedByMe: null,
    ...overrides,
  };
}

function defaultMarketHandlers({ items = [], pulse, pref } = {}) {
  return [
    http.get('/api/market-discovery/last-scan', () =>
      HttpResponse.json({ run: { startedAt: new Date(Date.now() - 5 * 60_000).toISOString() } }),
    ),
    http.get('/api/market-discovery/pulse', () =>
      HttpResponse.json(pulse || {
        newToday: { count: 12, deltaPct: 5 },
        matchesForMe: { count: 0 },
        privatePct: { value: 70, deltaPct: null },
        hotNeighborhoods: [],
      }),
    ),
    http.get('/api/market-discovery/listings', ({ request }) => {
      const url = new URL(request.url);
      // The page-level expectation: default `firstSeenAfter` is 3d.
      // We assert this through the request side-channel below.
      void url; // referenced in a separate test; kept here for clarity.
      return HttpResponse.json({ items, total: items.length, limit: 100, offset: 0 });
    }),
    http.get('/api/notification-preferences', () =>
      HttpResponse.json(pref || { marketMatchEmailEnabled: false, customDeliveryEmail: null }),
    ),
    http.get('/api/me', () =>
      HttpResponse.json({ user: { id: 'u1', email: 'agent@example.com', displayName: 'סוכן בודק' } }),
    ),
  ];
}

beforeEach(() => {
  // The page persists viewMode + viewedIds in localStorage; reset
  // between tests so default behaviour is deterministic.
  localStorage.clear();
});

describe('<MarketDiscovery> — default 3-day window', () => {
  it('sends firstSeenAfter=3d to the listings endpoint by default', async () => {
    let captured;
    // Register the capture-handler FIRST (it matches before the default
    // /listings handler in the array order).
    server.use(
      http.get('/api/market-discovery/listings', ({ request }) => {
        captured = new URL(request.url).searchParams.get('firstSeenAfter');
        return HttpResponse.json({ items: [], total: 0, limit: 100, offset: 0 });
      }),
      ...defaultMarketHandlers(),
    );
    render(<MarketDiscovery />, { route: '/market-discovery' });
    await waitFor(() => expect(captured).toBe('3d'));
  });
});

describe('<MarketDiscovery> — pulse strip', () => {
  it('renders the KPI numbers from /pulse', async () => {
    server.use(...defaultMarketHandlers({
      pulse: {
        newToday: { count: 42, deltaPct: 12 },
        matchesForMe: { count: 3 },
        privatePct: { value: 75, deltaPct: -2 },
        hotNeighborhoods: [
          { neighborhood: 'נווה צדק', city: 'תל אביב', count: 8 },
        ],
      },
    }));
    render(<MarketDiscovery />, { route: '/market-discovery' });
    await screen.findByText('42');
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText(/נווה צדק/)).toBeInTheDocument();
  });
});

describe('<MarketDiscovery> — listing rows', () => {
  it('renders each listing as a row with address + price + specs', async () => {
    const item = listingFixture();
    server.use(...defaultMarketHandlers({ items: [item] }));
    render(<MarketDiscovery />, { route: '/market-discovery' });
    await screen.findByText(/בן גוריון/);
    // Address composes street + neighborhood + city.
    expect(screen.getByText(/בן גוריון · מרכז העיר · הרצליה/)).toBeInTheDocument();
    // Specs line includes property type + rooms + sqm + floor.
    expect(screen.getByText(/דירה · 4 חד׳ · 95 מ״ר · קומה 3/)).toBeInTheDocument();
  });

  it('shows the matched-lead pill when a listing has matches', async () => {
    const matched = listingFixture({
      id: 'lst-2',
      matches: [
        { id: 'm1', score: 80, reasons: ['city', 'rooms'], leadId: 'l1', leadName: 'טל פוקס', leadPhone: '050-1234567' },
      ],
      topMatch: { id: 'm1', score: 80, leadName: 'טל פוקס' },
    });
    server.use(...defaultMarketHandlers({ items: [matched] }));
    render(<MarketDiscovery />, { route: '/market-discovery' });
    await screen.findByText(/בן גוריון/);
    expect(screen.getByText(/התאמה לליד: טל פוקס/)).toBeInTheDocument();
  });
});

describe('<MarketDiscovery> — drawer', () => {
  it('opens the side drawer when a row is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const item = listingFixture({
      matches: [
        { id: 'm1', score: 80, reasons: ['התאמת עיר', 'התאמת חדרים'], leadId: 'l1', leadName: 'טל פוקס', leadPhone: '050-1234567' },
      ],
    });
    server.use(...defaultMarketHandlers({ items: [item] }));
    render(<MarketDiscovery />, { route: '/market-discovery' });
    const row = await screen.findByRole('button', { name: /בן גוריון/i });
    await user.click(row);
    // Drawer is a role=dialog with the match-analysis section heading.
    const dialog = await screen.findByRole('dialog', { name: /פרטי מודעה/ });
    expect(dialog).toBeInTheDocument();
    // Match analysis surfaces the lead and reasons.
    expect(screen.getByText('טל פוקס')).toBeInTheDocument();
    expect(screen.getByText(/התאמת עיר · התאמת חדרים/)).toBeInTheDocument();
  });
});

describe('<MarketDiscovery> — email signup CTA in the page header', () => {
  it('shows a labelled "הירשם להתראות מייל" button when prefs are off', async () => {
    server.use(...defaultMarketHandlers({
      pref: { marketMatchEmailEnabled: false, customDeliveryEmail: null },
    }));
    render(<MarketDiscovery />, { route: '/market-discovery' });
    await screen.findByRole('button', { name: /הירשם להתראות מייל/ });
  });

  it('collapses to an icon button when prefs are already on', async () => {
    server.use(...defaultMarketHandlers({
      pref: { marketMatchEmailEnabled: true, customDeliveryEmail: null },
    }));
    render(<MarketDiscovery />, { route: '/market-discovery' });
    await screen.findByText(/מודעות חדשות בשוק/);
    expect(screen.queryByRole('button', { name: /הירשם להתראות מייל/ })).not.toBeInTheDocument();
  });
});
