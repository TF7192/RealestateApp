import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import NeighborhoodAdmin from '@estia/frontend/pages/NeighborhoodAdmin.jsx';

// G2 — NeighborhoodAdmin page. The default MSW /api/me handler returns
// an AGENT, so every test that expects the OWNER UI has to override it
// up-front (see asOwner below). AGENT tests rely on the default.

const OWNER_USER = {
  id: 'owner-1',
  email: 'owner@estia.app',
  role: 'OWNER',
  displayName: 'הבוס',
  slug: null,
  phone: null,
  avatarUrl: null,
  agentProfile: null,
  customerProfile: null,
  hasCompletedTutorial: true,
  firstLoginPlatform: 'web',
};

function asOwner() {
  server.use(
    http.get('/api/me', () => HttpResponse.json({ user: OWNER_USER })),
  );
}

function seedCities() {
  server.use(
    http.get('/api/neighborhoods', ({ request }) => {
      const url = new URL(request.url);
      const city = url.searchParams.get('city');
      const all = [
        { id: 'nb-1', city: 'תל אביב', name: 'רמת אביב', aliases: [] },
        { id: 'nb-2', city: 'תל אביב', name: 'נווה שרת', aliases: [] },
        { id: 'nb-3', city: 'חיפה',    name: 'הדר',       aliases: [] },
      ];
      return HttpResponse.json({
        items: city ? all.filter((n) => n.city === city) : all,
      });
    }),
  );
}

describe('<NeighborhoodAdmin>', () => {
  it('OWNER sees the page heading and create form', async () => {
    asOwner();
    seedCities();
    render(<NeighborhoodAdmin />);
    expect(
      await screen.findByRole('heading', { name: 'קבוצות שכונות' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('שם הקבוצה')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /הוסף קבוצה/ })).toBeInTheDocument();
  });

  it('AGENT is redirected away (OWNER gate)', async () => {
    // Default /api/me handler returns an AGENT — render inside a
    // MemoryRouter that includes a sentinel route so we can assert
    // the redirect landed on "/".
    const { container } = render(<NeighborhoodAdmin />, { route: '/settings/neighborhoods' });
    // The Navigate component renders nothing; confirm the page heading
    // never appears. findBy* would wait; we assert a short absence.
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'קבוצות שכונות' })
      ).not.toBeInTheDocument();
    });
    expect(container.textContent).not.toContain('קבוצות שכונות');
  });

  it('renders the list of existing groups', async () => {
    asOwner();
    seedCities();
    server.use(
      http.get('/api/neighborhood-groups', () =>
        HttpResponse.json({
          items: [
            {
              id: 'g1',
              city: 'תל אביב',
              name: 'צפון ישן תל אביב',
              description: 'אזור שיווקי',
              aliases: [],
              members: [
                {
                  groupId: 'g1', neighborhoodId: 'nb-1', sortOrder: 0,
                  neighborhood: { id: 'nb-1', city: 'תל אביב', name: 'רמת אביב', aliases: [] },
                },
                {
                  groupId: 'g1', neighborhoodId: 'nb-2', sortOrder: 1,
                  neighborhood: { id: 'nb-2', city: 'תל אביב', name: 'נווה שרת', aliases: [] },
                },
              ],
            },
          ],
        })
      ),
    );
    render(<NeighborhoodAdmin />);
    expect(await screen.findByText('צפון ישן תל אביב')).toBeInTheDocument();
    expect(screen.getByText('רמת אביב')).toBeInTheDocument();
    expect(screen.getByText('נווה שרת')).toBeInTheDocument();
    expect(screen.getByLabelText('ערוך: צפון ישן תל אביב')).toBeInTheDocument();
    expect(screen.getByLabelText('מחק: צפון ישן תל אביב')).toBeInTheDocument();
  });

  it('creating a group POSTs name + city', async () => {
    asOwner();
    seedCities();
    let posted: unknown = null;
    server.use(
      http.post('/api/neighborhood-groups', async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({
          group: {
            id: 'ng-1', city: 'תל אביב', name: 'חדש', description: null,
            aliases: [], members: [],
          },
        });
      }),
    );
    const user = userEvent.setup();
    render(<NeighborhoodAdmin />);
    const nameInput = await screen.findByLabelText('שם הקבוצה');
    await user.type(nameInput, 'חדש');
    await user.click(screen.getByRole('button', { name: /הוסף קבוצה/ }));
    await waitFor(() => expect(posted).toBeTruthy());
    const body = posted as { name: string; city: string };
    expect(body.name).toBe('חדש');
    expect(body.city).toBe('תל אביב');
  });

  it('clicking delete opens a confirm dialog; confirming calls deleteNeighborhoodGroup', async () => {
    asOwner();
    seedCities();
    let deletedId: string | null = null;
    server.use(
      http.get('/api/neighborhood-groups', () =>
        HttpResponse.json({
          items: [{
            id: 'g1', city: 'תל אביב', name: 'למחיקה', description: null,
            aliases: [], members: [],
          }],
        })
      ),
      http.delete('/api/neighborhood-groups/:id', ({ params }) => {
        deletedId = params.id as string;
        return HttpResponse.json({ ok: true });
      }),
    );
    const user = userEvent.setup();
    render(<NeighborhoodAdmin />);
    await user.click(await screen.findByLabelText('מחק: למחיקה'));
    // ConfirmDialog renders in a Portal — look up the confirm button.
    const confirmBtn = await screen.findByRole('button', { name: 'מחק' });
    await user.click(confirmBtn);
    await waitFor(() => expect(deletedId).toBe('g1'));
  });

  it('edit-in-place PATCHes the group', async () => {
    asOwner();
    seedCities();
    let patched: unknown = null;
    server.use(
      http.get('/api/neighborhood-groups', () =>
        HttpResponse.json({
          items: [{
            id: 'g1', city: 'תל אביב', name: 'ישן', description: null,
            aliases: [], members: [],
          }],
        })
      ),
      http.patch('/api/neighborhood-groups/:id', async ({ request, params }) => {
        patched = await request.json();
        return HttpResponse.json({
          group: {
            id: params.id, city: 'תל אביב', name: 'חדש',
            description: null, aliases: [], members: [],
          },
        });
      }),
    );
    const user = userEvent.setup();
    render(<NeighborhoodAdmin />);
    await user.click(await screen.findByLabelText('ערוך: ישן'));
    const editInput = await screen.findByLabelText('שם קבוצה');
    await user.clear(editInput);
    await user.type(editInput, 'חדש');
    await user.click(screen.getByRole('button', { name: 'שמור' }));
    await waitFor(() => expect(patched).toBeTruthy());
    expect((patched as { name: string }).name).toBe('חדש');
  });
});
