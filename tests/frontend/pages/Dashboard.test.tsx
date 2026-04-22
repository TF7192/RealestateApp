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

  it('D-2 — meetings card shows reminders in the next 7 days, capped at 5, with the full-list link', async () => {
    // Seed 6 PENDING reminders with dueAt inside [today, today+7d] and
    // one outside the window — card should show 5 and hide the 6th +
    // the out-of-window one, and render the "צפה בכל הפגישות" link.
    const now = Date.now();
    const HOUR = 3600_000;
    const items = [
      { id: 'r1', title: 'פגישה 1', dueAt: new Date(now + 1 * HOUR).toISOString(), status: 'PENDING' },
      { id: 'r2', title: 'פגישה 2', dueAt: new Date(now + 2 * HOUR).toISOString(), status: 'PENDING' },
      { id: 'r3', title: 'פגישה 3', dueAt: new Date(now + 3 * HOUR).toISOString(), status: 'PENDING' },
      { id: 'r4', title: 'פגישה 4', dueAt: new Date(now + 4 * HOUR).toISOString(), status: 'PENDING' },
      { id: 'r5', title: 'פגישה 5', dueAt: new Date(now + 5 * HOUR).toISOString(), status: 'PENDING' },
      { id: 'r6', title: 'פגישה 6', dueAt: new Date(now + 6 * HOUR).toISOString(), status: 'PENDING' },
      { id: 'r-far', title: 'פגישה רחוקה', dueAt: new Date(now + 30 * 24 * HOUR).toISOString(), status: 'PENDING' },
    ];
    server.use(
      http.get('/api/reminders', () => HttpResponse.json({ items })),
      // Seed at least one lead so the grid renders (it's hidden when
      // hasAnyContent is false).
      http.get('/api/leads', () =>
        HttpResponse.json({ items: [{ id: 'l1', name: 'דן', status: 'HOT' }] })
      ),
    );
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'פגישות השבוע' })).toBeInTheDocument()
    );
    // Exactly 5 meeting rows visible — the 6th and the far-future one
    // must both be hidden from the card.
    await waitFor(() => {
      const rows = document.querySelectorAll('.dash-meetings-row');
      expect(rows.length).toBe(5);
    });
    // "פגישה רחוקה" is outside the 7-day window and must not appear.
    expect(screen.queryByText('פגישה רחוקה')).not.toBeInTheDocument();
    // Full-list link exists with the Hebrew label and /reminders href.
    const more = await screen.findByRole('link', { name: /צפה בכל הפגישות/ });
    expect(more).toHaveAttribute('href', '/reminders');
  });

  it('D-2 — meetings card renders the empty state when there are no reminders this week', async () => {
    server.use(
      http.get('/api/reminders', () => HttpResponse.json({ items: [] })),
      http.get('/api/leads', () =>
        HttpResponse.json({ items: [{ id: 'l1', name: 'דן', status: 'HOT' }] })
      ),
    );
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'פגישות השבוע' })).toBeInTheDocument()
    );
    await waitFor(() => {
      expect(screen.getByText('אין פגישות השבוע')).toBeInTheDocument();
    });
  });

  it('D-4 — action queue caps at 5 rows with a "צפה בהכול" link to /activity', async () => {
    // Seed 7 stale leads — beyond the 5-row cap so the overflow link
    // has to render.
    const tenDaysAgoIso = new Date(Date.now() - 40 * 86400000).toISOString();
    const leads = Array.from({ length: 7 }, (_, i) => ({
      id: `l${i}`,
      name: `ליד ${i}`,
      status: 'WARM',
      lastContact: tenDaysAgoIso,
    }));
    server.use(
      http.get('/api/leads', () => HttpResponse.json({ items: leads })),
    );
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /שלום/ })).toBeInTheDocument()
    );
    // At most 5 action-queue rows visible.
    await waitFor(() => {
      const rows = document.querySelectorAll('.dash-aq-row');
      expect(rows.length).toBe(5);
    });
    // Overflow link — Hebrew text + /activity href.
    const overflow = await screen.findByRole('link', { name: /צפה בהכול/ });
    expect(overflow).toHaveAttribute('href', '/activity');
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
