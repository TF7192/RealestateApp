// N-series (Sub-3) unit coverage for the Assets-list lane.
// These tests drive the business-logic pieces of N-1..N-17 that don't
// require a rendered card (visual baselines live in Playwright).

import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import Properties from '@estia/frontend/pages/Properties.jsx';

const sampleProperties = [
  {
    id: 'p1', assetClass: 'RESIDENTIAL', category: 'SALE',
    street: 'הרצל', city: 'תל אביב', owner: 'יוסי', ownerPhone: '050-1111111',
    marketingPrice: 2800000, sqm: 90, rooms: 4, type: 'דירה', images: [],
    marketingActions: {},
  },
  {
    id: 'p2', assetClass: 'COMMERCIAL', category: 'RENT',
    street: 'דיזנגוף', city: 'תל אביב', owner: 'רות', ownerPhone: '050-2222222',
    marketingPrice: 9500, sqm: 60, rooms: 2, type: 'משרד', images: [],
    marketingActions: {},
  },
];

function mountProperties(items = sampleProperties, favorites = []) {
  server.use(
    http.get('/api/properties', () => HttpResponse.json({ items })),
    http.get('/api/favorites', () => HttpResponse.json({ items: favorites })),
    http.get('/api/templates', () => HttpResponse.json({ templates: [] })),
    http.get('/api/leads', () => HttpResponse.json({ items: [] })),
  );
}

describe('Properties page — N-series punch list', () => {
  beforeEach(() => {
    // happy-dom mock for clipboard writes (handleGenerateLink uses it).
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.resolve() },
        configurable: true,
      });
    }
  });

  it('N-7 — toolbar exposes "בחירה מרובה" as a direct button (no ⋯ menu)', async () => {
    mountProperties();
    render(<Properties />, { route: '/properties' });
    await screen.findByText(/הרצל, תל אביב/);
    // Button is in the desktop page header actions.
    const btn = screen.getByRole('button', { name: /בחירה מרובה/ });
    expect(btn).toBeInTheDocument();
  });

  it('N-7 — toolbar exposes "קישור ללקוח" as a direct button', async () => {
    mountProperties();
    render(<Properties />, { route: '/properties' });
    await screen.findByText(/הרצל, תל אביב/);
    const btn = screen.getByRole('button', { name: /קישור ללקוח/ });
    expect(btn).toBeInTheDocument();
  });

  it('N-9 — "קישור ללקוח" builds a URL under /agents/:slug (not /share)', async () => {
    const user = userEvent.setup({ delay: null });
    mountProperties();
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (s) => { copied = s; return Promise.resolve(); } },
      configurable: true,
    });
    render(<Properties />, { route: '/properties?cat=SALE&ac=RESIDENTIAL' });
    await screen.findByText(/הרצל, תל אביב/);
    await user.click(screen.getByRole('button', { name: /קישור ללקוח/ }));
    await waitFor(() => expect(copied.length).toBeGreaterThan(0));
    // Must NOT use the broken /share?… route.
    expect(copied).not.toMatch(/\/share\?/);
    // Must land on the public agent portal (slug or legacy id route).
    expect(copied).toMatch(/\/(agents|a)\//);
    // And carry the current filter snapshot.
    expect(copied).toMatch(/category=SALE/);
    expect(copied).toMatch(/assetClass=RESIDENTIAL/);
  });

  it('N-10 — "רק מועדפים" toggle narrows the list to starred properties', async () => {
    const user = userEvent.setup({ delay: null });
    // p1 is pre-favorited; p2 isn't.
    mountProperties(sampleProperties, [{
      id: 'fv-p1', agentId: 'a1', entityType: 'PROPERTY',
      entityId: 'p1', createdAt: '2026-04-20T00:00:00.000Z',
    }]);
    render(<Properties />, { route: '/properties' });
    await screen.findByText(/הרצל, תל אביב/);
    expect(screen.getByText(/דיזנגוף, תל אביב/)).toBeInTheDocument();

    // Toggle on — the unfavorited card disappears.
    const favToggle = await screen.findByRole('button', { name: /^רק מועדפים$/ });
    await user.click(favToggle);
    await waitFor(() => {
      expect(screen.queryByText(/דיזנגוף, תל אביב/)).toBeNull();
    });
    expect(screen.getByText(/הרצל, תל אביב/)).toBeInTheDocument();
  });

  it('N-12 — "נקה סינון" inside the advanced panel also COLLAPSES the panel', async () => {
    const user = userEvent.setup({ delay: null });
    mountProperties();
    // Open the advanced panel via the URL seed so we don't have to click.
    render(<Properties />, { route: '/properties?adv=1&city=%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91' });
    await screen.findByText(/הרצל, תל אביב/);
    // The panel's "נקה סינון" (singular) lives inside AdvancedFilters.
    const clearInsidePanel = await screen.findByRole('button', { name: /^נקה סינון$/ });
    await user.click(clearInsidePanel);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^נקה סינון$/ })).toBeNull();
    });
  });
});
