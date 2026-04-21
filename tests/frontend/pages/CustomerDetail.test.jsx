import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import CustomerDetail from '@estia/frontend/pages/CustomerDetail.jsx';

function seedLead(overrides = {}) {
  return {
    id: 'lead-1',
    name: 'דני לוי',
    phone: '050-1111111',
    email: null,
    status: 'WARM',
    interestType: 'PRIVATE',
    lookingFor: 'BUY',
    city: 'תל אביב',
    street: '',
    rooms: '4',
    budget: 2_800_000,
    sector: 'כללי',
    createdAt: '2026-04-01T00:00:00.000Z',
    customerStatus: 'ACTIVE',
    leadStatus: 'NEW',
    purposes: [],
    isPrivate: false,
    seriousnessOverride: 'NONE',
    firstName: '',
    lastName:  '',
    ...overrides,
  };
}

function mountLead(lead) {
  // The real backend returns the lead object directly (no envelope),
  // so mirror that here — a {lead: ...} wrap breaks CustomerDetail's
  // `fetched.name` path.
  server.use(
    http.get('/api/leads/:id', () => HttpResponse.json(lead)),
    http.get('/api/leads', () => HttpResponse.json({ items: [lead] })),
  );
}

describe('<CustomerDetail>', () => {
  it('renders the lead header and the MLS-parity side panels', async () => {
    mountLead(seedLead());
    render(<CustomerDetail />, { route: '/customers/lead-1', path: '/customers/:id' });

    // The crumb + name appear once the lead resolves.
    await screen.findByText('דני לוי');
    // Shared panels mount with their own section headings. Some may
    // appear more than once because the parent page re-fetches after a
    // save; we only care that each panel appears at least once.
    expect((await screen.findAllByRole('heading', { name: /תזכורות/ })).length).toBeGreaterThan(0);
    expect((await screen.findAllByRole('heading', { name: /נכסים תואמים/ })).length).toBeGreaterThan(0);
    expect((await screen.findAllByRole('heading', { name: /יומן פעילות/ })).length).toBeGreaterThan(0);
    expect((await screen.findAllByRole('heading', { name: /פרופילי חיפוש/ })).length).toBeGreaterThan(0);
    // Tags region and "הוסף" attach button.
    expect((await screen.findAllByRole('button', { name: 'הוסף תג' }))[0]).toBeInTheDocument();
  });

  it('attaches a tag via TagPicker', async () => {
    mountLead(seedLead());
    let assignedForId = null;
    server.use(
      http.get('/api/tags', () =>
        HttpResponse.json({ items: [{ id: 't1', name: 'חם ביותר', color: '#D4AF37' }] })
      ),
      http.get('/api/tags/for', () => HttpResponse.json({ items: [] })),
      http.post('/api/tags/:id/assign', async ({ params, request }) => {
        assignedForId = String(params.id);
        await request.json(); // drain
        return HttpResponse.json({ ok: true });
      }),
    );
    const user = userEvent.setup();
    render(<CustomerDetail />, { route: '/customers/lead-1', path: '/customers/:id' });
    await screen.findByText('דני לוי');
    await user.click(await screen.findByRole('button', { name: 'הוסף תג' }));
    const opt = await screen.findByRole('option', { name: /חם ביותר/ });
    await user.click(opt);
    await waitFor(() => expect(assignedForId).toBe('t1'));
  });

  it('creates a reminder through the embedded RemindersPanel', async () => {
    mountLead(seedLead());
    let body = {};
    server.use(
      http.get('/api/reminders', () => HttpResponse.json({ items: [] })),
      http.post('/api/reminders', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ reminder: { id: 'r-new', ...body, status: 'PENDING' } });
      }),
    );
    const user = userEvent.setup();
    render(<CustomerDetail />, { route: '/customers/lead-1', path: '/customers/:id' });
    await screen.findByText('דני לוי');
    await user.click(await screen.findByRole('button', { name: /תזכורת חדשה/ }));
    await user.type(screen.getByLabelText('כותרת'), 'לחזור בחמישי');
    // Exact match "שמור" — the "שמור שינויים" button on the edit form
    // must not match.
    await user.click(screen.getByRole('button', { name: 'שמור' }));
    await waitFor(() => {
      expect(body.title).toBe('לחזור בחמישי');
      expect(body.leadId).toBe('lead-1');
    });
  });

  it('renders property matches in the MatchingList panel', async () => {
    mountLead(seedLead());
    server.use(
      http.get('/api/leads/:id/matches', () =>
        HttpResponse.json({
          items: [{
            id: 'm1',
            score: 77,
            reasons: ['עיר תואמת'],
            property: { id: 'p1', title: '4ח׳ בגבעתיים', price: 2_900_000 },
          }],
        })
      ),
    );
    render(<CustomerDetail />, { route: '/customers/lead-1', path: '/customers/:id' });
    expect(await screen.findByText('4ח׳ בגבעתיים')).toBeInTheDocument();
    expect(screen.getByText('77')).toBeInTheDocument();
  });

  it('updates K1/K2/L1 fields via PATCH /api/leads/:id', async () => {
    mountLead(seedLead());
    let patchBody = {};
    server.use(
      http.patch('/api/leads/:id', async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ lead: { id: 'lead-1', ...patchBody } });
      }),
    );
    const user = userEvent.setup();
    render(<CustomerDetail />, { route: '/customers/lead-1', path: '/customers/:id' });
    await screen.findByText('דני לוי');
    // Toggle isPrivate (exists in the K2 block).
    await user.click(screen.getByRole('checkbox', { name: /לקוח פרטי/ }));
    // Set a lead-status.
    await user.selectOptions(screen.getByLabelText('סטטוס ליד'), 'IN_PROGRESS');
    await user.click(screen.getAllByRole('button', { name: /שמור שינויים/ })[0]);
    await waitFor(() => {
      expect(patchBody.isPrivate).toBe(true);
      expect(patchBody.leadStatus).toBe('IN_PROGRESS');
    });
  });

  it('lists search profiles and lets the agent add one', async () => {
    mountLead(seedLead());
    let created = false;
    let listCalls = 0;
    server.use(
      http.get('/api/leads/:leadId/search-profiles', () => {
        listCalls += 1;
        return HttpResponse.json({ items: [] });
      }),
      http.post('/api/leads/:leadId/search-profiles', () => {
        created = true;
        return HttpResponse.json({ profile: { id: 'sp-new', label: 'חיפוש חדש', cities: [] } });
      }),
    );
    const user = userEvent.setup();
    render(<CustomerDetail />, { route: '/customers/lead-1', path: '/customers/:id' });
    await screen.findByText('דני לוי');
    await user.click(await screen.findByRole('button', { name: /פרופיל חדש/ }));
    await waitFor(() => expect(created).toBe(true));
    expect(listCalls).toBeGreaterThanOrEqual(1);
  });
});
