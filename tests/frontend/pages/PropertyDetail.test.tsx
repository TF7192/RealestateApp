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

describe('<PropertyDetail> — V1 Refined layout', () => {
  it('renders the KPI hero and the four relationship tabs', async () => {
    server.use(
      http.get('/api/properties/:id', () =>
        HttpResponse.json({ property: propertyFixture })
      )
    );
    renderDetail();
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { name: /הרצל 15/ }).length).toBeGreaterThan(0),
    );
    // KPI hero — 5 tiles labelled by uppercase eyebrow. "מתעניינים"
    // shows up twice (KPI eyebrow + tab label) so use getAllBy.
    expect(screen.getByText('מחיר ביקוש')).toBeInTheDocument();
    expect(screen.getAllByText('מתעניינים').length).toBeGreaterThan(0);
    expect(screen.getByText('הצעה פעילה')).toBeInTheDocument();
    // Tabs — relationships. "הנכס" is a substring of "בעל הנכס" so use
    // exact name matchers via the tab-list role pattern.
    expect(screen.getByRole('tab', { name: 'הנכס' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'בעל הנכס' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /מתעניינים/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'פעילות' })).toBeInTheDocument();
    // More pills — secondary surfaces (פאנל פעולות שיווק was removed
    // with the ניהול שיווקי cull on 2026-06-02).
    expect(screen.getByRole('button', { name: /ניהול מדיה/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /גלול אל הסכמי תיווך/ })).toBeInTheDocument();
  });

  it('switches to the בעל הנכס tab when clicked', async () => {
    server.use(
      http.get('/api/properties/:id', () =>
        HttpResponse.json({ property: propertyFixture })
      )
    );
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { name: /הרצל 15/ }).length).toBeGreaterThan(0),
    );
    const ownerTab = screen.getByRole('tab', { name: 'בעל הנכס' });
    await user.click(ownerTab);
    await waitFor(() => expect(ownerTab).toHaveAttribute('aria-selected', 'true'));
  });
});
