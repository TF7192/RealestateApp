import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import OwnerDetail from '@estia/frontend/pages/OwnerDetail.jsx';

const ownerFixture = {
  id: 'o1',
  agentId: 'test-agent-1',
  name: 'דוד לוי',
  phone: '050-1234567',
  email: 'david@example.com',
  notes: '',
  relationship: 'בעל יחיד',
  properties: [],
  propertyCount: 0,
  createdAt: new Date().toISOString(),
};

function renderDetail() {
  return render(<OwnerDetail />, {
    route: '/owners/o1',
    path: '/owners/:id',
  });
}

describe('<OwnerDetail> — J8 multi-phone panel', () => {
  it('mounts the OwnerPhonesPanel with the owner id', async () => {
    // The panel drives a GET /api/owners/:id/phones. Assert on its
    // request URL so the mount path is verified, not just its DOM
    // presence.
    let phonesUrl: string | null = null;
    server.use(
      http.get('/api/owners/o1', () =>
        HttpResponse.json({ owner: ownerFixture })
      ),
      http.get('/api/owners/:id/phones', ({ request, params }) => {
        phonesUrl = new URL(request.url).pathname;
        return HttpResponse.json({
          items: [
            {
              id: 'ph_1',
              ownerId: params.id,
              phone: '050-7777777',
              kind: 'spouse',
              label: null,
              sortOrder: 0,
            },
          ],
        });
      })
    );
    renderDetail();
    await waitFor(() =>
      expect(screen.getByText('מספרי טלפון נוספים')).toBeInTheDocument()
    );
    await waitFor(() => expect(phonesUrl).toBe('/api/owners/o1/phones'));
    expect(screen.getByDisplayValue('050-7777777')).toBeInTheDocument();
  });

  it('shows the EmptyState when the owner has no phones yet', async () => {
    server.use(
      http.get('/api/owners/o1', () =>
        HttpResponse.json({ owner: ownerFixture })
      ),
      http.get('/api/owners/:id/phones', () =>
        HttpResponse.json({ items: [] })
      )
    );
    renderDetail();
    await waitFor(() =>
      expect(screen.getByText('אין מספרים נוספים')).toBeInTheDocument()
    );
  });
});
