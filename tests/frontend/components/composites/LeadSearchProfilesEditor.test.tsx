import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import LeadSearchProfilesEditor from '@estia/frontend/components/LeadSearchProfilesEditor.jsx';

// Focus of this file is the MLS G1 wiring: the profile's neighborhoods
// field is now a NeighborhoodPicker keyed off the first city in
// profile.cities. Without a city, the picker sits disabled; once a city
// is populated (via the parent form restoring a saved profile), the
// picker enables and suggestions flow from /api/neighborhoods.

beforeEach(() => {
  // Default handlers: one profile with a city populated so the picker
  // activates. Tests override as needed.
  server.use(
    http.get('/api/leads/:leadId/search-profiles', () =>
      HttpResponse.json({
        items: [
          {
            id: 'sp1',
            label: 'חיפוש גבעתיים',
            domain: 'RESIDENTIAL',
            dealType: 'SALE',
            cities: ['גבעתיים'],
            neighborhoods: [],
            propertyTypes: [],
          },
        ],
      })
    ),
  );
});

describe('<LeadSearchProfilesEditor> neighborhood picker wiring', () => {
  it('renders the NeighborhoodPicker scoped to the first city on the profile', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/neighborhoods', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('city')).toBe('גבעתיים');
        return HttpResponse.json({
          items: [{ id: 'n1', city: 'גבעתיים', name: 'ותיקים', aliases: [] }],
        });
      }),
    );
    render(<LeadSearchProfilesEditor leadId="L1" />);
    // Expand the first profile row.
    const toggle = await screen.findByRole('button', { expanded: false });
    await user.click(toggle);
    // The neighborhood picker input carries an aria-label "שכונות".
    const nbhInput = await screen.findByRole('combobox', { name: /שכונות/ });
    expect(nbhInput).not.toBeDisabled();
    await user.type(nbhInput, 'ות');
    const option = await screen.findByRole('option', { name: /ותיקים/ });
    await user.click(option);
    // The chip renders after selection.
    await waitFor(() => {
      expect(screen.getByText('ותיקים')).toBeInTheDocument();
    });
  });

  it('disables the picker when the profile has no city', async () => {
    server.use(
      http.get('/api/leads/:leadId/search-profiles', () =>
        HttpResponse.json({
          items: [
            {
              id: 'sp2',
              label: 'ללא עיר',
              cities: [],
              neighborhoods: [],
              propertyTypes: [],
            },
          ],
        })
      ),
    );
    const user = userEvent.setup();
    render(<LeadSearchProfilesEditor leadId="L1" />);
    const toggle = await screen.findByRole('button', { expanded: false });
    await user.click(toggle);
    const nbhInput = await screen.findByRole('combobox', { name: /שכונות/ });
    expect(nbhInput).toBeDisabled();
  });
});
