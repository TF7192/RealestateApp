// Lane 2 — Owners page favorite-star integration.
// Covers: each owner card in the desktop grid renders a FavoriteStar,
// pre-seeded stars reflect /api/favorites?entityType=OWNER, and a click
// on the star POSTs { entityType: 'OWNER', entityId } to /api/favorites
// without navigating to the owner-detail page.

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import Owners from '@estia/frontend/pages/Owners.jsx';

const sampleOwners = [
  { id: 'o1', name: 'יעל אלון', phone: '050-1111111', email: 'yael@example.com', propertyCount: 2, properties: [] },
  { id: 'o2', name: 'משה לוי', phone: '050-2222222', email: 'moshe@example.com', propertyCount: 1, properties: [] },
];

function mountOwners(items = sampleOwners) {
  server.use(http.get('/api/owners', () => HttpResponse.json({ items })));
}

describe('<Owners> favorite star', () => {
  it('renders a favorite-star button on every owner card', async () => {
    mountOwners();
    render(<Owners />, { route: '/owners' });
    await screen.findByText('יעל אלון');
    // Initially no favorites seeded → each row shows the "add" label.
    const stars = await screen.findAllByRole('button', { name: /הוסף למועדפים/ });
    expect(stars.length).toBe(sampleOwners.length);
  });

  it('reflects pre-seeded favorites from /api/favorites (entityType=OWNER)', async () => {
    mountOwners();
    server.use(
      http.get('/api/favorites', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('entityType')).toBe('OWNER');
        return HttpResponse.json({
          items: [{
            id: 'fv1', agentId: 'a1', entityType: 'OWNER', entityId: 'o2',
            createdAt: '2026-04-10T00:00:00.000Z',
          }],
        });
      }),
    );
    render(<Owners />, { route: '/owners' });
    await screen.findByText('משה לוי');
    // o2 is favorited → shows "remove" label; o1 remains "add".
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /הסר ממועדפים/ }).length).toBe(1);
    });
    expect(screen.getAllByRole('button', { name: /הוסף למועדפים/ }).length).toBe(1);
  });

  it('clicking a star POSTs to /api/favorites with entityType=OWNER and does not navigate', async () => {
    const user = userEvent.setup({ delay: null });
    mountOwners();
    let postedBody = null;
    server.use(
      http.post('/api/favorites', async ({ request }) => {
        postedBody = await request.json();
        return HttpResponse.json({
          favorite: {
            id: 'fv-new', agentId: 'a1', entityType: 'OWNER',
            entityId: postedBody.entityId, createdAt: new Date().toISOString(),
          },
        });
      }),
    );
    render(<Owners />, { route: '/owners' });
    await screen.findByText('יעל אלון');
    const stars = await screen.findAllByRole('button', { name: /הוסף למועדפים/ });
    await user.click(stars[0]);
    await waitFor(() => expect(postedBody).not.toBeNull());
    expect(postedBody).toMatchObject({ entityType: 'OWNER', entityId: 'o1' });
    // The owner-card link should NOT have navigated; the owners list
    // (heading "בעלי נכסים") is still on screen.
    expect(screen.getByRole('heading', { name: 'בעלי נכסים' })).toBeInTheDocument();
  });
});
