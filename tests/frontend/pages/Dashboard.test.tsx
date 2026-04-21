import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '../setup/test-utils';
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
});
