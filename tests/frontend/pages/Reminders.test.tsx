import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import Reminders from '@estia/frontend/pages/Reminders.jsx';

describe('<Reminders>', () => {
  it('renders the heading + status tabs; the composer opens on demand', async () => {
    const user = userEvent.setup();
    render(<Reminders />);
    expect(await screen.findByRole('heading', { name: 'תזכורות' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /פתוחות/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /הושלמו/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /בוטלו/ })).toBeInTheDocument();
    // The inline composer is collapsed by default — click the toggle
    // ("הוסף תזכורת") to expand it before the תיאור input is in scope.
    expect(screen.queryByLabelText('תיאור תזכורת')).toBeNull();
    // Multiple "הוסף תזכורת" matches on the page (the empty-state CTA
    // duplicates the header button); pick the first.
    await user.click(screen.getAllByRole('button', { name: /הוסף תזכורת/ })[0]);
    expect(screen.getByLabelText('תיאור תזכורת')).toBeInTheDocument();
  });

  it('shows the EmptyState when the list is empty', async () => {
    render(<Reminders />);
    await waitFor(() => {
      expect(screen.getByText('אין תזכורות פתוחות')).toBeInTheDocument();
    });
  });

  it('filters by status when switching tabs', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    server.use(
      http.get('/api/reminders', ({ request }) => {
        const url = new URL(request.url);
        seen.push(url.searchParams.get('status') ?? '');
        return HttpResponse.json({ items: [] });
      })
    );
    render(<Reminders />);
    await waitFor(() => expect(seen).toContain('PENDING'));
    await user.click(screen.getByRole('tab', { name: /הושלמו/ }));
    await waitFor(() => expect(seen).toContain('COMPLETED'));
    await user.click(screen.getByRole('tab', { name: /בוטלו/ }));
    await waitFor(() => expect(seen).toContain('CANCELLED'));
  });

  it('creates a reminder via the inline form and POSTs to /api/reminders', async () => {
    const user = userEvent.setup();
    let posted: unknown = null;
    server.use(
      http.post('/api/reminders', async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({
          reminder: {
            id: 'rem-1', title: 'שיחה', status: 'PENDING', dueAt: null,
            notes: null, leadId: null, propertyId: null, customerId: null,
          },
        });
      })
    );
    render(<Reminders />);
    // Expand the composer first — the page-level toggle is labelled
    // "הוסף תזכורת" / "סגור טופס"; the form's actual submit button is
    // the differently-named "צור תזכורת".
    await user.click(screen.getAllByRole('button', { name: /הוסף תזכורת/ })[0]);
    const titleInput = await screen.findByLabelText('תיאור תזכורת');
    await user.type(titleInput, 'שיחה');
    await user.click(screen.getByRole('button', { name: /צור תזכורת/ }));
    await waitFor(() => expect(posted).toBeTruthy());
    expect((posted as { title: string }).title).toBe('שיחה');
  });

  it('calls the complete endpoint when clicking הושלם on a pending reminder', async () => {
    const user = userEvent.setup();
    let completedId: string | null = null;
    server.use(
      http.get('/api/reminders', () =>
        HttpResponse.json({
          items: [{
            id: 'rem-1', title: 'להתקשר',
            notes: null, dueAt: null, status: 'PENDING',
            leadId: null, propertyId: null, customerId: null,
            completedAt: null, cancelledAt: null,
          }],
        })
      ),
      http.post('/api/reminders/:id/complete', ({ params }) => {
        completedId = params.id as string;
        return HttpResponse.json({
          reminder: { id: params.id, status: 'COMPLETED' },
        });
      })
    );
    render(<Reminders />);
    const completeBtn = await screen.findByRole('button', { name: /סמן כהושלם/ });
    await user.click(completeBtn);
    await waitFor(() => expect(completedId).toBe('rem-1'));
  });
});
