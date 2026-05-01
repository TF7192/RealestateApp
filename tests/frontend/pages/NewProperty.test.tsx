import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import NewProperty from '@estia/frontend/pages/NewProperty.jsx';

// NewProperty is a 1500-line wizard. These tests focus on the MLS-parity
// fields (J4-J7 + J9) the current lane adds. The step-1 persistence is
// already exercised elsewhere by the existing create test suite.

describe('<NewProperty> — edit mode', () => {
  it('hydrates the property in edit mode and lands on the rich step-2 form', async () => {
    // P-10/P-11 (NewProperty.jsx:1868-1874) — the explicit J4-J7 +
    // J9 fields surfaced as "מצב הנכס" / "שלב הנכס" / "הערות מתווך"
    // were removed. The condition row was a duplicate of the primary
    // "מצב" select earlier in the form (which is now backed by
    // form.renovated with Hebrew option strings rather than a
    // RENOVATED/NEW/etc enum), and the pipeline / broker-notes block
    // was dropped from the create-edit wizard. The fields still ship
    // through the API payload for back-compat (NewProperty.jsx:877).
    // Keep this test honest by only asserting what the post-redesign
    // wizard actually renders: edit-mode hydrates the basics and
    // lands on step 2.
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
            heatingTypes: [],
            imageList: [],
          },
        }),
      ),
    );
    render(<NewProperty />, { route: '/properties/p1/edit', path: '/properties/:id/edit' });
    // Edit-mode lands directly on step 2 ("חבילת שיווק") per
    // NewProperty.jsx:445-450 — no manual nav needed.
    await waitFor(() =>
      expect(screen.getByText(/עריכת נכס|עריכה — חבילת שיווק/)).toBeInTheDocument(),
    );
    // Step 2's page header surfaces the hydrated address as a
    // "{street}, {city}" subtitle below the "עריכה — חבילת שיווק"
    // heading — that's the most stable signal that the property
    // payload landed and the page accepted it. (The step-2 form body
    // doesn't carry street/city inputs; those live on step 1.)
    expect(await screen.findByText(/הרצל 15, רמלה/)).toBeInTheDocument();
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
