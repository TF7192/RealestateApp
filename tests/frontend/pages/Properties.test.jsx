// Sprint 7 B3/B4 — Properties list polish: favorite-star on each card
// plus a saved-search dropdown in the page header. The rest of the page
// (filter tabs, delete flow, quick-edit, etc.) is covered by the
// composite/unit tests that accompany each of those features; this file
// focuses on the new wiring added to Properties.jsx.

import { describe, it, expect } from 'vitest';
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

function mountProperties(items = sampleProperties) {
  server.use(
    http.get('/api/properties', () => HttpResponse.json({ items }))
  );
}

describe('<Properties> list polish — favorites + saved search', () => {
  it('renders the property cards once /api/properties resolves', async () => {
    mountProperties();
    render(<Properties />, { route: '/properties' });
    await screen.findByText(/הרצל, תל אביב/);
    expect(screen.getByText(/דיזנגוף, תל אביב/)).toBeInTheDocument();
  });

  it('renders a FavoriteStar on each property card', async () => {
    mountProperties();
    render(<Properties />, { route: '/properties' });
    await screen.findByText(/הרצל, תל אביב/);
    // Unfavorited stars use the "הוסף למועדפים" label; one per card.
    const stars = await screen.findAllByRole('button', { name: /הוסף למועדפים/ });
    expect(stars.length).toBe(sampleProperties.length);
  });

  it('tapping the star POSTs to /api/favorites with entityType PROPERTY', async () => {
    const user = userEvent.setup({ delay: null });
    mountProperties();
    let postedBody = null;
    server.use(
      http.post('/api/favorites', async ({ request }) => {
        postedBody = await request.json();
        return HttpResponse.json({
          favorite: {
            id: 'fav-p1', agentId: 'a1', entityType: 'PROPERTY',
            entityId: postedBody.entityId, createdAt: new Date().toISOString(),
          },
        });
      })
    );
    render(<Properties />, { route: '/properties' });
    await screen.findByText(/הרצל, תל אביב/);
    const stars = await screen.findAllByRole('button', { name: /הוסף למועדפים/ });
    await user.click(stars[0]);
    await waitFor(() => expect(postedBody).not.toBeNull());
    expect(postedBody).toMatchObject({ entityType: 'PROPERTY', entityId: 'p1' });
  });

  it('seeds favorite state from /api/favorites so the star starts active', async () => {
    server.use(
      http.get('/api/properties', () => HttpResponse.json({ items: sampleProperties })),
      http.get('/api/favorites', () =>
        HttpResponse.json({
          items: [{
            id: 'fv-p1', agentId: 'a1', entityType: 'PROPERTY',
            entityId: 'p1', createdAt: '2026-04-10T00:00:00.000Z',
          }],
        })
      )
    );
    render(<Properties />, { route: '/properties' });
    await screen.findByText(/הרצל, תל אביב/);
    // The pre-favorited property (p1) exposes the "remove" label. Wait
    // for the listFavorites request to resolve and seed state.
    const removeBtn = await screen.findByRole('button', { name: /הסר ממועדפים/ });
    expect(removeBtn).toBeInTheDocument();
  });

  it('renders a SavedSearchMenu trigger in the properties header', async () => {
    mountProperties();
    render(<Properties />, { route: '/properties' });
    await screen.findByText(/הרצל, תל אביב/);
    expect(screen.getByRole('button', { name: /חיפושים שמורים/ })).toBeInTheDocument();
  });

  it('saving the current filters POSTs entityType: PROPERTY + filter snapshot', async () => {
    const user = userEvent.setup({ delay: null });
    let captured = null;
    server.use(
      http.get('/api/properties', () => HttpResponse.json({ items: sampleProperties })),
      http.get('/api/saved-searches', ({ request }) => {
        const url = new URL(request.url);
        // Also assert the list query is scoped by entityType=PROPERTY.
        expect(url.searchParams.get('entityType')).toBe('PROPERTY');
        return HttpResponse.json({ items: [] });
      }),
      http.post('/api/saved-searches', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          savedSearch: { id: 'ss-new', ...captured },
        });
      })
    );
    // Seed the URL with a filter so the snapshot has something to capture.
    render(<Properties />, { route: '/properties?ac=RESIDENTIAL&cat=SALE' });
    await screen.findByText(/הרצל, תל אביב/);
    await user.click(screen.getByRole('button', { name: /חיפושים שמורים/ }));
    const input = await screen.findByPlaceholderText(/שם לחיפוש/);
    await user.type(input, 'דירות למכירה');
    await user.click(screen.getByRole('button', { name: /^שמור$/ }));
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured).toMatchObject({
      entityType: 'PROPERTY',
      name: 'דירות למכירה',
      filters: expect.objectContaining({
        assetClass: 'RESIDENTIAL',
        category: 'SALE',
      }),
    });
  });

  it('loading a saved search applies its filters to the list', async () => {
    const user = userEvent.setup({ delay: null });
    server.use(
      http.get('/api/properties', () => HttpResponse.json({ items: sampleProperties })),
      http.get('/api/saved-searches', () =>
        HttpResponse.json({
          items: [{
            id: 'ss-1', entityType: 'PROPERTY', name: 'מסחרי להשכרה',
            filters: {
              assetClass: 'COMMERCIAL',
              category: 'RENT',
              city: '',
              search: '',
            },
            createdAt: '2026-04-10T00:00:00.000Z',
          }],
        })
      )
    );
    render(<Properties />, { route: '/properties' });
    await screen.findByText(/הרצל, תל אביב/);
    // Both cards visible initially.
    expect(screen.getByText(/דיזנגוף, תל אביב/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /חיפושים שמורים/ }));
    await user.click(await screen.findByText('מסחרי להשכרה'));

    // After load, RESIDENTIAL/SALE card (p1, הרצל) should be filtered
    // out; the commercial rental (p2, דיזנגוף) remains.
    await waitFor(() => {
      expect(screen.queryByText(/הרצל, תל אביב/)).toBeNull();
    });
    expect(screen.getByText(/דיזנגוף, תל אביב/)).toBeInTheDocument();
  });
});
