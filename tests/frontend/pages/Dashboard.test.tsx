import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import Dashboard from '@estia/frontend/pages/Dashboard.jsx';

describe('<Dashboard>', () => {
  it('renders the greeting once /api/me + /reports/dashboard resolve', async () => {
    server.use(
      http.get('/api/reports/dashboard', () =>
        HttpResponse.json({
          activeProperties: 4, activeLeads: 3, openDeals: 1, revenueMonth: 10000,
        })
      )
    );
    render(<Dashboard />);
    // Greeting uses the user's first name from /api/me (default handler
    // returns "יוסי כהן").
    await waitFor(() => expect(screen.getByRole('heading', { name: /שלום/ })).toBeInTheDocument());
    expect(screen.getByText(/סיכום פעילות יומי/)).toBeInTheDocument();
  });

  it('does not crash when the reports endpoint fails (shows a safe empty state)', async () => {
    server.use(
      http.get('/api/reports/dashboard', () =>
        HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })
      )
    );
    render(<Dashboard />);
    // The page should still render its header/greeting even if the
    // numbers API fails.
    await waitFor(() => expect(screen.getByRole('heading', { name: /שלום/ })).toBeInTheDocument());
  });

  it('B2 — renders DeltaBadge counters next to KPI tiles on mount', async () => {
    server.use(
      http.get('/api/reports/new-properties', () =>
        HttpResponse.json({ items: [], count: 5 })
      ),
      http.get('/api/reports/new-customers', () =>
        HttpResponse.json({ items: [], count: 4 })
      ),
      http.get('/api/reports/deals', () =>
        HttpResponse.json({ items: [], count: 2, totalCommission: 0, byStatus: {} })
      )
    );
    render(<Dashboard />);
    // Wait for the KPI grid to render, then the pills arrive after
    // the delta fan-out settles.
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /שלום/ })
      ).toBeInTheDocument()
    );
    await waitFor(() => {
      // At least one of the delta pills should be visible; the pill
      // announces a full Hebrew sentence via its sr-only span, so we
      // can match on that deterministically.
      const matches = screen.getAllByText(/גידול של \d+ לעומת השבוע הקודם/);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it('B2 — switching the period re-labels the delta pills', async () => {
    server.use(
      http.get('/api/reports/new-properties', () =>
        HttpResponse.json({ items: [], count: 1 })
      ),
      http.get('/api/reports/new-customers', () =>
        HttpResponse.json({ items: [], count: 1 })
      ),
      http.get('/api/reports/deals', () =>
        HttpResponse.json({ items: [], count: 1, totalCommission: 0, byStatus: {} })
      )
    );
    const user = userEvent.setup();
    render(<Dashboard />);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /שלום/ })
      ).toBeInTheDocument()
    );
    // Pills start in "week" mode.
    await waitFor(() => {
      expect(screen.getAllByText(/לעומת השבוע הקודם/).length).toBeGreaterThan(0);
    });
    // Click the "חודש" segment in the period switcher.
    const monthBtn = screen.getByRole('radio', { name: 'חודש' });
    await user.click(monthBtn);
    await waitFor(() => {
      expect(screen.getAllByText(/לעומת החודש הקודם/).length).toBeGreaterThan(0);
    });
  });

  it('D-1 — the משפך המרה (conversion funnel) card is no longer rendered', async () => {
    server.use(
      http.get('/api/properties', () =>
        HttpResponse.json({ items: [{ id: 'p1', street: 'הרצל', city: 'תא', marketingActions: { mkt1: true } }] })
      ),
      http.get('/api/leads', () =>
        HttpResponse.json({ items: [{ id: 'l1', name: 'דן', status: 'HOT' }] })
      ),
    );
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /שלום/ })).toBeInTheDocument()
    );
    // Card used to render <h3>משפך המרה</h3> — assert it's gone.
    expect(screen.queryByRole('heading', { name: 'משפך המרה' })).not.toBeInTheDocument();
    // Card had a signature "עסקאות חתומות" row — assert that's gone too.
    expect(screen.queryByText('עסקאות חתומות')).not.toBeInTheDocument();
  });

  it('B2 — a failing sub-call degrades gracefully (KPI total still renders)', async () => {
    server.use(
      http.get('/api/reports/new-properties', () =>
        HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })
      ),
      http.get('/api/reports/new-customers', () =>
        HttpResponse.json({ items: [], count: 3 })
      ),
      http.get('/api/reports/deals', () =>
        HttpResponse.json({ items: [], count: 1, totalCommission: 0, byStatus: {} })
      )
    );
    render(<Dashboard />);
    // KPI labels themselves are driven by /api/reports/dashboard and
    // should still render regardless of which delta endpoint is down.
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /שלום/ })
      ).toBeInTheDocument()
    );
    await waitFor(() => {
      expect(screen.getByText(/נכסי מגורים פעילים/)).toBeInTheDocument();
    });
    // And at least the customers delta should still announce itself —
    // one broken endpoint must not blank the whole counters row.
    await waitFor(() => {
      expect(screen.getAllByText(/גידול של 3 לעומת השבוע הקודם/).length).toBeGreaterThan(0);
    });
  });
});
