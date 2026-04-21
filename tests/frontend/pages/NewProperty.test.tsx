import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import NewProperty from '@estia/frontend/pages/NewProperty.jsx';

// NewProperty is a 1500-line wizard. These tests focus on the MLS-parity
// fields (J4-J7 + J9) the current lane adds. The step-1 persistence is
// already exercised elsewhere by the existing create test suite.

describe('<NewProperty> — edit mode', () => {
  it('hydrates J4-J7 + J9 fields from the property and shows them in step 2', async () => {
    server.use(
      http.get('/api/properties/:id', ({ params }) =>
        HttpResponse.json({
          property: {
            id: params.id,
            assetClass: 'RESIDENTIAL',
            category: 'SALE',
            street: 'הרצל 15',
            city: 'רמלה',
            marketingPrice: 2500000,
            sqm: 120,
            type: 'דירה',
            rooms: 4,
            // J4-J7 fields below:
            condition: 'RENOVATED',
            heatingTypes: ['gas', 'solar'],
            halfRooms: 1,
            masterBedroom: true,
            bathrooms: 2,
            toilets: 2,
            furnished: true,
            petFriendly: false,
            doormenService: false,
            gym: false,
            pool: false,
            gatedCommunity: false,
            accessibility: true,
            utilityRoom: false,
            listingSource: 'yad2',
            // J9 pipeline
            stage: 'SIGNED_EXCLUSIVE',
            agentCommissionPct: 2,
            primaryAgentId: null,
            exclusivityExpire: '2026-10-01T00:00:00.000Z',
            sellerSeriousness: 'VERY',
            brokerNotes: 'דחוף למכור',
            imageList: [],
          },
        })
      )
    );
    const user = userEvent.setup();
    render(<NewProperty />, { route: '/properties/p1/edit', path: '/properties/:id/edit' });
    // Wait for edit-mode hydration.
    await waitFor(() => expect(screen.getByText(/עריכת נכס|עריכה — חבילת שיווק/)).toBeInTheDocument());
    // Step-2 is the wider form. Click step-2 tab.
    await user.click(screen.getByRole('button', { name: /חבילת שיווק/ }));
    // J4 condition renders as a select with RENOVATED.
    const conditionSelect = await screen.findByLabelText('מצב הנכס') as HTMLSelectElement;
    expect(conditionSelect.value).toBe('RENOVATED');
    // J9 stage via the pipeline block.
    const stageSelect = screen.getByLabelText('שלב הנכס') as HTMLSelectElement;
    expect(stageSelect.value).toBe('SIGNED_EXCLUSIVE');
    // Broker notes hydrate.
    expect((screen.getByLabelText('הערות מתווך') as HTMLTextAreaElement).value).toBe('דחוף למכור');
  });

  it('includes J4-J7 + J9 fields in the PATCH body on step-2 save', async () => {
    let patchBody: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/properties/:id', ({ params }) =>
        HttpResponse.json({
          property: {
            id: params.id,
            assetClass: 'RESIDENTIAL',
            category: 'SALE',
            street: 'הרצל 15', city: 'רמלה',
            marketingPrice: 2500000, sqm: 120, type: 'דירה',
            rooms: 4, heatingTypes: [],
            imageList: [],
          },
        })
      ),
      http.patch('/api/properties/:id', async ({ request }) => {
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ property: { id: 'p1' } });
      })
    );
    const user = userEvent.setup();
    render(<NewProperty />, { route: '/properties/p1/edit', path: '/properties/:id/edit' });
    await waitFor(() => expect(screen.getByText(/עריכת נכס|עריכה — חבילת שיווק/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /חבילת שיווק/ }));
    // Save via the in-form primary button. Multiple buttons share this
    // label (desktop + sticky mobile bar); pick the first.
    const saveButtons = await screen.findAllByRole('button', { name: /שמור שינויים/ });
    await user.click(saveButtons[0]);
    await waitFor(() => expect(patchBody).toBeTruthy());
    // J4-J7
    expect(patchBody!).toHaveProperty('condition');
    expect(patchBody!).toHaveProperty('heatingTypes');
    expect(patchBody!).toHaveProperty('bathrooms');
    expect(patchBody!).toHaveProperty('toilets');
    expect(patchBody!).toHaveProperty('listingSource');
    expect(patchBody!).toHaveProperty('halfRooms');
    expect(patchBody!).toHaveProperty('furnished');
    // J9
    expect(patchBody!).toHaveProperty('stage');
    expect(patchBody!).toHaveProperty('agentCommissionPct');
    expect(patchBody!).toHaveProperty('exclusivityExpire');
    expect(patchBody!).toHaveProperty('sellerSeriousness');
    expect(patchBody!).toHaveProperty('brokerNotes');
  });

  it('toggles a heating type when the checkbox is clicked', async () => {
    server.use(
      http.get('/api/properties/:id', ({ params }) =>
        HttpResponse.json({
          property: {
            id: params.id,
            assetClass: 'RESIDENTIAL', category: 'SALE',
            street: 'הרצל 15', city: 'רמלה',
            marketingPrice: 2500000, sqm: 120, type: 'דירה',
            rooms: 4, heatingTypes: [],
            imageList: [],
          },
        })
      )
    );
    const user = userEvent.setup();
    render(<NewProperty />, { route: '/properties/p1/edit', path: '/properties/:id/edit' });
    await waitFor(() => expect(screen.getByText(/עריכת נכס|עריכה — חבילת שיווק/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /חבילת שיווק/ }));
    const gasCheckbox = await screen.findByRole('checkbox', { name: 'גז' });
    expect(gasCheckbox).not.toBeChecked();
    await user.click(gasCheckbox);
    expect(gasCheckbox).toBeChecked();
  });
});
