import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import PropertyDetail from '@estia/frontend/pages/PropertyDetail.jsx';

// happy-dom walks iframe src. The page embeds a Google Maps iframe —
// stub it so the "unhandled request" MSW guard doesn't abort the test.
beforeEach(() => {
  server.use(
    http.get('https://www.google.com/maps', () => new HttpResponse('', { status: 200 })),
  );
});

const propertyFixture = {
  id: 'p1',
  agentId: 'test-agent-1',
  assetClass: 'RESIDENTIAL',
  category: 'SALE',
  street: 'הרצל 15',
  city: 'רמלה',
  marketingPrice: 2500000,
  sqm: 120,
  type: 'דירה',
  rooms: 4,
  stage: 'IN_PROGRESS',
  agentCommissionPct: 2,
  sellerSeriousness: 'MEDIUM',
  brokerNotes: '',
  images: [],
  imageList: [],
  videos: [],
  marketingActions: {},
};

function renderDetail() {
  return render(<PropertyDetail />, {
    route: '/properties/p1',
    path: '/properties/:id',
  });
}

describe('<PropertyDetail> — MLS parity wiring', () => {
  it('shows the pipeline / adverts / assignees / matching / tags / activity / reminders cards', async () => {
    server.use(
      http.get('/api/properties/:id', () =>
        HttpResponse.json({ property: propertyFixture })
      )
    );
    renderDetail();
    await waitFor(() => expect(screen.getByRole('heading', { name: /הרצל 15/ })).toBeInTheDocument());
    expect(screen.getByText('צנרת תיווך')).toBeInTheDocument();
    expect(screen.getByText('מודעות פרסום')).toBeInTheDocument();
    expect(screen.getByText('שותפים לנכס')).toBeInTheDocument();
    expect(screen.getByText('לקוחות תואמים')).toBeInTheDocument();
    // "תגיות" appears as both the card title and the TagPicker stub label;
    // either is proof the card rendered.
    expect(screen.getAllByText('תגיות').length).toBeGreaterThan(0);
    expect(screen.getByText('תזכורות')).toBeInTheDocument();
    expect(screen.getByText('פעילות')).toBeInTheDocument();
  });

  it('opens the pipeline slide-in panel with the inline editor', async () => {
    server.use(
      http.get('/api/properties/:id', () =>
        HttpResponse.json({ property: propertyFixture })
      )
    );
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => expect(screen.getByRole('heading', { name: /הרצל 15/ })).toBeInTheDocument());
    // The card's action has an aria-label "ערוך צנרת תיווך"; panel opens
    // with the PropertyPipelineBlock.
    await user.click(screen.getByRole('button', { name: 'ערוך צנרת תיווך' }));
    // Block heading comes from the section aria-label; its fields render
    // with the Hebrew label map.
    await waitFor(() => expect(screen.getByLabelText('שלב הנכס')).toBeInTheDocument());
    expect(screen.getByLabelText('הערות מתווך')).toBeInTheDocument();
  });

  it('opens the adverts panel and submits a draft advert', async () => {
    let postBody: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/properties/:id', () =>
        HttpResponse.json({ property: propertyFixture })
      ),
      http.post('/api/properties/:id/adverts', async ({ request }) => {
        postBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ advert: { id: 'new-1', ...postBody } });
      })
    );
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => expect(screen.getByRole('heading', { name: /הרצל 15/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'נהל מודעות פרסום' }));
    // Panel content: click the primary CTA in the empty state.
    const newButtons = await screen.findAllByRole('button', { name: /מודעה חדשה/ });
    await user.click(newButtons[0]);
    await user.selectOptions(screen.getByLabelText('ערוץ המודעה'), 'FACEBOOK');
    await user.click(screen.getByRole('button', { name: 'שמור מודעה' }));
    await waitFor(() => expect(postBody).toBeTruthy());
    expect(postBody!.channel).toBe('FACEBOOK');
  });

  it('opens the assignees panel and lists existing ones from the API', async () => {
    server.use(
      http.get('/api/properties/:id', () =>
        HttpResponse.json({ property: propertyFixture })
      ),
      http.get('/api/properties/:id/assignees', () =>
        HttpResponse.json({
          items: [{
            userId: 'u2', role: 'CO_AGENT',
            user: { id: 'u2', displayName: 'שותפה', email: 'p@estia.app', role: 'AGENT' },
          }],
        })
      )
    );
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => expect(screen.getByRole('heading', { name: /הרצל 15/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'נהל שותפים לנכס' }));
    await waitFor(() => expect(screen.getByText('שותפה')).toBeInTheDocument());
  });
});
