// Dashboard — port of the claude.ai/design DDashboard. The earlier
// test suite asserted on a DeltaBadge-driven KPI grid, a meetings card
// keyed by `dash-meetings-row`, an action-queue with `dash-aq-row`, and
// a "סיכום פעילות יומי" caption — none of which survived the port.
// What the page actually renders today is a time-of-day greeting, four
// labelled KPI tiles, hot-leads + today's-reminders cards, and an AI
// priorities list. This file covers that surface.

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import Dashboard from '@estia/frontend/pages/Dashboard.jsx';

// All four time-of-day greetings the Dashboard might render. Test the
// union so the assertion doesn't drift with the wall clock.
const GREETING_RE = /בוקר טוב|צהריים טובים|ערב טוב|לילה טוב/;

describe('<Dashboard>', () => {
  it('renders the time-of-day greeting + first name once /api/me resolves', async () => {
    render(<Dashboard />);
    // Default /api/me handler returns "יוסי כהן".
    await waitFor(() => {
      const h = screen.getByRole('heading', { name: GREETING_RE });
      expect(h).toBeInTheDocument();
      expect(h.textContent).toMatch(/יוסי/);
    });
  });

  it('does not crash when the dashboard endpoints fail', async () => {
    server.use(
      http.get('/api/dashboard/summary', () =>
        HttpResponse.json({ error: { message: 'boom' } }, { status: 500 }),
      ),
      http.get('/api/dashboard/full', () =>
        HttpResponse.json({ error: { message: 'boom' } }, { status: 500 }),
      ),
      http.get('/api/reports/dashboard', () =>
        HttpResponse.json({ error: { message: 'boom' } }, { status: 500 }),
      ),
    );
    render(<Dashboard />);
    // Greeting is the page header — must still render even when the
    // numbers calls fail.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: GREETING_RE })).toBeInTheDocument(),
    );
  });

  it('renders the four KPI tile labels', async () => {
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: GREETING_RE })).toBeInTheDocument(),
    );
    // Tiles render their Hebrew label in plain text. KPI grid is the
    // post-port replacement for the deprecated DeltaBadge surface.
    for (const label of ['לידים פעילים', 'פגישות השבוע', 'עסקאות פתוחות', 'נכסים פעילים']) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
  });

  it('shows the quick-access link to /activity in the header', async () => {
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: GREETING_RE })).toBeInTheDocument(),
    );
    // Both "פעילות" (mobile) and "יומן פעילות" (desktop) hit /activity;
    // the matchMedia mock keeps us on the desktop label.
    const link = screen.getByRole('link', { name: /יומן פעילות/ });
    expect(link).toHaveAttribute('href', '/activity');
  });

  it('renders an empty hot-leads card when no leads are HOT', async () => {
    server.use(
      http.get('/api/leads', () => HttpResponse.json({ items: [] })),
    );
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: GREETING_RE })).toBeInTheDocument(),
    );
    // Empty-state copy from the hot-leads card.
    await waitFor(() =>
      expect(screen.getByText(/אין לידים חמים כרגע/)).toBeInTheDocument(),
    );
  });

  it('reads KPI counts from the bundled /api/dashboard/full endpoint', async () => {
    // Dashboard.jsx prefers dashboardFull() and only falls back to the
    // separate summary call when /full is missing — so the override has
    // to land on /full, not /summary, for the KPI numbers to appear.
    server.use(
      http.get('/api/dashboard/full', () =>
        HttpResponse.json({
          counts: {
            properties: 7, leads: 12, deals: 3, reminders: 4,
            hotLeadsCount: 2, todayMeetings: 5,
          },
          hotLeads: [],
          todayMeetings: [],
          stuckDeals: [],
          staleProperties: [],
          leads:      { items: [], nextCursor: null },
          properties: { items: [], nextCursor: null },
          deals:      { items: [], nextCursor: null },
          reminders:  { items: [], nextCursor: null },
        }),
      ),
    );
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: GREETING_RE })).toBeInTheDocument(),
    );
    // KPI tile DOM:
    //   <DCard>
    //     <div style="display:flex">
    //       <div>{label}</div>
    //       <span>{icon}</span>
    //     </div>
    //     <div>{value}</div>     <-- number lives here
    //   </DCard>
    // The label is two levels deep inside the tile, so walk up twice
    // to reach the DCard root and assert the number appears within it.
    const tileFor = (label: string) =>
      screen.getByText(label).parentElement!.parentElement!;
    await waitFor(() => {
      expect(tileFor('לידים פעילים').textContent).toMatch(/12/);
      expect(tileFor('פגישות השבוע').textContent).toMatch(/5/);
      expect(tileFor('עסקאות פתוחות').textContent).toMatch(/3/);
      expect(tileFor('נכסים פעילים').textContent).toMatch(/7/);
    });
  });
});
