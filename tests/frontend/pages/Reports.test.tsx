import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import Reports from '@estia/frontend/pages/Reports.jsx';

describe('<Reports>', () => {
  it('renders the page heading + default counts once endpoints resolve', async () => {
    render(<Reports />);
    expect(await screen.findByRole('heading', { name: 'דוחות' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('נכסים חדשים')).toBeInTheDocument();
    });
  });

  it('surfaces the populated counts from each report endpoint', async () => {
    server.use(
      http.get('/api/reports/new-properties', () =>
        HttpResponse.json({ items: [], count: 4 })
      ),
      http.get('/api/reports/new-customers', () =>
        HttpResponse.json({ items: [], count: 7 })
      ),
      http.get('/api/reports/deals', () =>
        HttpResponse.json({
          items: [], count: 2, totalCommission: 125_000,
          byStatus: { OPEN: 1, WON: 1 },
        })
      ),
      http.get('/api/reports/viewings', () =>
        HttpResponse.json({ items: [], count: 9 })
      ),
      http.get('/api/reports/marketing-actions', () =>
        HttpResponse.json({ items: [], count: 3 })
      ),
    );
    render(<Reports />);
    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument());
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    // Total commission tile sub-line
    expect(screen.getByText(/עמלה כוללת/)).toBeInTheDocument();
    // byStatus breakdown rendered
    expect(await screen.findByRole('heading', { name: 'עסקאות לפי סטטוס' })).toBeInTheDocument();
    expect(screen.getByText('פתוחה')).toBeInTheDocument();
    expect(screen.getByText('נסגרה')).toBeInTheDocument();
  });

  it('changing the date range refires the endpoints with from/to', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    server.use(
      http.get('/api/reports/new-properties', ({ request }) => {
        const url = new URL(request.url);
        seen.push(`${url.searchParams.get('from') ?? ''}|${url.searchParams.get('to') ?? ''}`);
        return HttpResponse.json({ items: [], count: 0 });
      })
    );
    render(<Reports />);
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const initial = seen.length;
    const fromInput = screen.getByLabelText('מתאריך');
    await user.type(fromInput, '2026-01-01');
    // Change should trigger a refetch.
    await waitFor(() => expect(seen.length).toBeGreaterThan(initial));
    expect(seen.some((s) => s.startsWith('2026-01-01'))).toBe(true);
  });

  it('renders CSV export anchors that point at api.exportUrl for each kind', () => {
    render(<Reports />);
    const propsA = screen.getByTestId('csv-properties') as HTMLAnchorElement;
    const leadsA = screen.getByTestId('csv-leads') as HTMLAnchorElement;
    const dealsA = screen.getByTestId('csv-deals') as HTMLAnchorElement;
    expect(propsA.getAttribute('href')).toBe('/api/reports/export/properties.csv');
    expect(leadsA.getAttribute('href')).toBe('/api/reports/export/leads.csv');
    expect(dealsA.getAttribute('href')).toBe('/api/reports/export/deals.csv');
    expect(propsA).toHaveAttribute('download');
  });

  it('viewings + marketing-actions CSV buttons render disabled with an in-progress tooltip', () => {
    render(<Reports />);
    const viewings = screen.getByTestId('csv-viewings') as HTMLButtonElement;
    const marketing = screen.getByTestId('csv-marketing-actions') as HTMLButtonElement;
    // Disabled state avoids shipping dead links — the backend endpoints
    // don't exist yet.
    expect(viewings.tagName).toBe('BUTTON');
    expect(marketing.tagName).toBe('BUTTON');
    expect(viewings).toBeDisabled();
    expect(marketing).toBeDisabled();
    expect(viewings).toHaveAttribute('aria-disabled', 'true');
    expect(marketing).toHaveAttribute('aria-disabled', 'true');
    expect(viewings.getAttribute('title')).toContain('בפיתוח');
    expect(marketing.getAttribute('title')).toContain('בפיתוח');
    // Visible label still says "ייצוא X" so the feature is recognisable.
    expect(viewings.textContent).toContain('צפיות');
    expect(marketing.textContent).toContain('פעולות שיווק');
  });
});
