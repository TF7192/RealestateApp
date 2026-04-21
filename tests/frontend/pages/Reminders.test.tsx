import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import Reminders from '@estia/frontend/pages/Reminders.jsx';

describe('<Reminders>', () => {
  it('renders the heading, inline form and the three status tabs', async () => {
    render(<Reminders />);
    expect(await screen.findByRole('heading', { name: 'תזכורות' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /פתוחות/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /הושלמו/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /בוטלו/ })).toBeInTheDocument();
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
    const titleInput = await screen.findByLabelText('תיאור תזכורת');
    await user.type(titleInput, 'שיחה');
    await user.click(screen.getByRole('button', { name: /הוסף תזכורת/ }));
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
