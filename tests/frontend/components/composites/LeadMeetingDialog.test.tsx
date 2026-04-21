import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import LeadMeetingDialog from '@estia/frontend/components/LeadMeetingDialog.jsx';

const lead = { id: 'l1', name: 'דן כהן', email: 'dan@example.com' };

describe('<LeadMeetingDialog>', () => {
  it('renders the header + prefills the title with the lead name', () => {
    render(<LeadMeetingDialog lead={lead} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('תזמון פגישה')).toBeInTheDocument();
    const title = screen.getByDisplayValue(/פגישה עם דן כהן/);
    expect(title).toBeInTheDocument();
  });

  it('probes /api/integrations/calendar/status on mount', async () => {
    const capture = vi.fn();
    server.use(
      http.get('/api/integrations/calendar/status', () => {
        capture();
        return HttpResponse.json({ connected: true, expiresAt: null, configured: true });
      })
    );
    render(<LeadMeetingDialog lead={lead} onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(capture).toHaveBeenCalled());
  });

  it('rejects empty title with inline error', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<LeadMeetingDialog lead={lead} onClose={() => {}} onCreated={onCreated} />);
    const title = screen.getByDisplayValue(/פגישה עם דן כהן/);
    await user.clear(title);
    await user.click(screen.getByRole('button', { name: /קבע פגישה/ }));
    expect(screen.getByText(/הכנס כותרת/)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('saves via POST /api/integrations/calendar/leads/:id/meetings and invokes onCreated', async () => {
    const user = userEvent.setup();
    let captured: any = null;
    server.use(
      http.post('/api/integrations/calendar/leads/:id/meetings', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ meeting: { id: 'm1', ...captured } });
      })
    );
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<LeadMeetingDialog lead={lead} onClose={onClose} onCreated={onCreated} />);
    await user.click(screen.getByRole('button', { name: /קבע פגישה/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(captured).toMatchObject({
      title: expect.stringContaining('פגישה'),
      attendeeEmail: 'dan@example.com',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces the "calendar_not_connected" error without calling onCreated', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/integrations/calendar/leads/:id/meetings', () =>
        HttpResponse.json({ error: { code: 'calendar_not_connected', message: 'not connected' } }, { status: 409 })
      )
    );
    const onCreated = vi.fn();
    render(<LeadMeetingDialog lead={lead} onClose={() => {}} onCreated={onCreated} />);
    await user.click(screen.getByRole('button', { name: /קבע פגישה/ }));
    // The same string also appears in the top-of-dialog nudge when
    // calendar isn't connected; scope to the error banner via class.
    const err = await screen.findByText(/Google Calendar לא מחובר — אפשר לבטל/);
    expect(err).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('Escape key fires onClose (via useFocusTrap)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<LeadMeetingDialog lead={lead} onClose={onClose} onCreated={() => {}} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
