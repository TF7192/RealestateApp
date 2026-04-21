import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import LeadSearchProfilesEditor from '@estia/frontend/components/LeadSearchProfilesEditor.jsx';

const PROFILE = {
  id: 'sp-1',
  label: 'גבעתיים 4ח׳',
  domain: 'RESIDENTIAL',
  dealType: 'SALE',
  propertyTypes: [],
  cities: ['גבעתיים'],
  neighborhoods: [],
  streets: [],
  minRoom: 3,
  maxRoom: 5,
  minPrice: 2_000_000,
  maxPrice: 3_500_000,
  minFloor: null, maxFloor: null, minBuilt: null, maxBuilt: null,
  parkingReq: true,
  elevatorReq: false,
  balconyReq: false,
  furnitureReq: false,
  mamadReq: false,
  storeroomReq: false,
};

describe('<LeadSearchProfilesEditor>', () => {
  it('renders the empty state when no profiles exist', async () => {
    server.use(
      http.get('/api/leads/:leadId/search-profiles', () => HttpResponse.json({ items: [] }))
    );
    render(<LeadSearchProfilesEditor leadId="lead-1" />);
    expect(await screen.findByText('אין עדיין פרופילי חיפוש')).toBeInTheDocument();
  });

  it('creates a new profile via the "פרופיל חדש" button', async () => {
    const user = userEvent.setup();
    let createdBody: { label?: string } = {};
    server.use(
      http.get('/api/leads/:leadId/search-profiles', () => HttpResponse.json({ items: [] })),
      http.post('/api/leads/:leadId/search-profiles', async ({ request }) => {
        createdBody = (await request.json()) as { label?: string };
        return HttpResponse.json({
          profile: { id: 'sp-new', label: createdBody.label, cities: [], neighborhoods: [] },
        });
      }),
    );
    render(<LeadSearchProfilesEditor leadId="lead-1" />);
    await screen.findByText('אין עדיין פרופילי חיפוש');
    await user.click(screen.getByRole('button', { name: /פרופיל חדש/ }));
    await waitFor(() => expect(createdBody.label).toBe('חיפוש חדש'));
    // New row is rendered with the default label.
    await screen.findByDisplayValue('חיפוש חדש');
  });

  it('lists existing profiles with their label and expands body on click', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/leads/:leadId/search-profiles', () =>
        HttpResponse.json({ items: [PROFILE] })
      )
    );
    render(<LeadSearchProfilesEditor leadId="lead-1" />);
    await screen.findByDisplayValue('גבעתיים 4ח׳');
    // Body fields aren't rendered until the row is expanded.
    expect(screen.queryByLabelText('ערים')).toBeNull();
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(await screen.findByLabelText('ערים')).toBeInTheDocument();
  });

  it('saves local edits via PATCH on שמור', async () => {
    const user = userEvent.setup();
    let patchBody: { label?: string } = {};
    server.use(
      http.get('/api/leads/:leadId/search-profiles', () =>
        HttpResponse.json({ items: [PROFILE] })
      ),
      http.patch('/api/leads/:leadId/search-profiles/:id', async ({ request }) => {
        patchBody = (await request.json()) as { label?: string };
        return HttpResponse.json({ profile: { id: 'sp-1' } });
      }),
    );
    render(<LeadSearchProfilesEditor leadId="lead-1" />);
    const labelInput = await screen.findByDisplayValue('גבעתיים 4ח׳');
    await user.clear(labelInput);
    await user.type(labelInput, 'תל אביב');
    await user.click(screen.getByRole('button', { name: /שמור פרופיל/ }));
    await waitFor(() => expect(patchBody.label).toBe('תל אביב'));
  });

  it('deletes a profile via the trash button', async () => {
    const user = userEvent.setup();
    let deleted = false;
    server.use(
      http.get('/api/leads/:leadId/search-profiles', () =>
        HttpResponse.json({ items: [PROFILE] })
      ),
      http.delete('/api/leads/:leadId/search-profiles/:id', () => {
        deleted = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    render(<LeadSearchProfilesEditor leadId="lead-1" />);
    await screen.findByDisplayValue('גבעתיים 4ח׳');
    await user.click(screen.getByRole('button', { name: /מחק פרופיל/ }));
    await waitFor(() => expect(deleted).toBe(true));
  });
});
