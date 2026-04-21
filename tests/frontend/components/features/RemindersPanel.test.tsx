import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import RemindersPanel from '@estia/frontend/components/RemindersPanel.jsx';

const BASE = [
  {
    id: 'r1',
    title: 'להתקשר ללקוח',
    dueAt: '2026-05-10T08:00:00.000Z',
    notes: 'לבדוק אם לקח משכנתא',
    status: 'PENDING',
    leadId: 'lead-1',
  },
];

describe('<RemindersPanel>', () => {
  it('shows the empty state when there are no reminders', async () => {
    server.use(http.get('/api/reminders', () => HttpResponse.json({ items: [] })));
    render(<RemindersPanel leadId="lead-1" />);
    await screen.findByText('אין תזכורות פתוחות');
    expect(screen.getByRole('button', { name: /תזכורת חדשה/ })).toBeInTheDocument();
  });

  it('renders an existing reminder with its title + notes', async () => {
    server.use(http.get('/api/reminders', () => HttpResponse.json({ items: BASE })));
    render(<RemindersPanel leadId="lead-1" />);
    expect(await screen.findByText('להתקשר ללקוח')).toBeInTheDocument();
    expect(screen.getByText('לבדוק אם לקח משכנתא')).toBeInTheDocument();
    // "1" reminder count pill.
    expect(screen.getByLabelText('1 תזכורות')).toBeInTheDocument();
  });

  it('opens the compose form, posts a new reminder, and refreshes', async () => {
    const user = userEvent.setup();
    let createdBody: { title?: string; leadId?: string } = {};
    let listCalls = 0;
    server.use(
      http.get('/api/reminders', () => {
        listCalls += 1;
        return HttpResponse.json({ items: listCalls > 1 ? BASE : [] });
      }),
      http.post('/api/reminders', async ({ request }) => {
        createdBody = (await request.json()) as { title?: string; leadId?: string };
        return HttpResponse.json({ reminder: { id: 'r2', ...createdBody, status: 'PENDING' } });
      }),
    );
    render(<RemindersPanel leadId="lead-1" />);
    await screen.findByText('אין תזכורות פתוחות');
    await user.click(screen.getByRole('button', { name: /תזכורת חדשה/ }));
    await user.type(screen.getByLabelText('כותרת'), 'לפגוש ביום חמישי');
    await user.click(screen.getByRole('button', { name: /שמור/ }));
    await waitFor(() => {
      expect(createdBody.title).toBe('לפגוש ביום חמישי');
      expect(createdBody.leadId).toBe('lead-1');
    });
  });

  it('completes a reminder via the check button', async () => {
    const user = userEvent.setup();
    let completedId: string | null = null;
    server.use(
      http.get('/api/reminders', () => HttpResponse.json({ items: BASE })),
      http.post('/api/reminders/:id/complete', ({ params }) => {
        completedId = String(params.id);
        return HttpResponse.json({ reminder: { id: params.id, status: 'COMPLETED' } });
      }),
    );
    render(<RemindersPanel leadId="lead-1" />);
    await screen.findByText('להתקשר ללקוח');
    await user.click(screen.getByRole('button', { name: /סמן "להתקשר ללקוח" כהושלם/ }));
    await waitFor(() => expect(completedId).toBe('r1'));
  });

  it('refuses to create a reminder with an empty title', async () => {
    const user = userEvent.setup();
    let posted = false;
    server.use(
      http.get('/api/reminders', () => HttpResponse.json({ items: [] })),
      http.post('/api/reminders', () => { posted = true; return HttpResponse.json({}); }),
    );
    render(<RemindersPanel leadId="lead-1" />);
    await screen.findByText('אין תזכורות פתוחות');
    await user.click(screen.getByRole('button', { name: /תזכורת חדשה/ }));
    await user.click(screen.getByRole('button', { name: /שמור/ }));
    expect(posted).toBe(false);
  });
});
