import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import Office from '@estia/frontend/pages/Office.jsx';

const OWNER = {
  id: 'test-agent-1',
  email: 'agent.demo@estia.app',
  role: 'OWNER',
  displayName: 'יוסי כהן',
  slug: 'יוסי-כהן',
  phone: '050-1234567',
  avatarUrl: null,
  agentProfile: { agency: 'Acme', title: '', bio: '' },
  customerProfile: null,
  hasCompletedTutorial: true,
  firstLoginPlatform: 'web',
};

function asOwner() {
  server.use(http.get('/api/me', () => HttpResponse.json({ user: OWNER })));
}

describe('<Office>', () => {
  it('as OWNER with no office, shows the create form', async () => {
    asOwner();
    render(<Office />);
    expect(await screen.findByRole('heading', { name: 'משרד' })).toBeInTheDocument();
    expect(screen.getByLabelText('שם המשרד')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /צור משרד/ })).toBeInTheDocument();
  });

  it('creating an office POSTs and reloads', async () => {
    asOwner();
    const user = userEvent.setup();
    let posted: unknown = null;
    server.use(
      http.post('/api/office', async ({ request }) => {
        posted = await request.json();
        // After creation, swap getOffice to return the new office.
        server.use(
          http.get('/api/office', () =>
            HttpResponse.json({
              office: { id: 'o1', name: 'נדלן הגולן' },
              members: [{ id: OWNER.id, email: OWNER.email, displayName: OWNER.displayName, role: 'OWNER' }],
            })
          )
        );
        return HttpResponse.json({ office: { id: 'o1', name: 'נדלן הגולן' } });
      })
    );
    render(<Office />);
    const input = await screen.findByLabelText('שם המשרד');
    await user.type(input, 'נדלן הגולן');
    await user.click(screen.getByRole('button', { name: /צור משרד/ }));
    await waitFor(() => expect(posted).toBeTruthy());
    expect((posted as { name: string }).name).toBe('נדלן הגולן');
  });

  it('renders the office name + members when the office exists', async () => {
    asOwner();
    server.use(
      http.get('/api/office', () =>
        HttpResponse.json({
          office: { id: 'o1', name: 'נדלן הגולן' },
          members: [
            { id: 'u1', email: 'owner@estia.app',   displayName: 'יוסי', role: 'OWNER' },
            { id: 'u2', email: 'member@estia.app',  displayName: 'דני',  role: 'MEMBER' },
          ],
        })
      )
    );
    render(<Office />);
    expect(await screen.findByRole('heading', { name: 'נדלן הגולן' })).toBeInTheDocument();
    expect(screen.getByText('יוסי')).toBeInTheDocument();
    expect(screen.getByText('דני')).toBeInTheDocument();
    expect(screen.getByLabelText(/הסר את דני/)).toBeInTheDocument();
  });

  it('invite form looks up the agent by email and POSTs the userId', async () => {
    asOwner();
    const user = userEvent.setup();
    let invited: unknown = null;
    server.use(
      http.get('/api/office', () =>
        HttpResponse.json({
          office: { id: 'o1', name: 'Acme' },
          members: [{ id: 'u1', email: 'owner@estia.app', displayName: 'יוסי', role: 'OWNER' }],
        })
      ),
      http.get('/api/transfers/agents/search', () =>
        HttpResponse.json({ agent: { id: 'u9', email: 'new@estia.app', displayName: 'חדש' } })
      ),
      http.post('/api/office/members', async ({ request }) => {
        invited = await request.json();
        return HttpResponse.json({ member: { id: 'm9', userId: 'u9', role: 'MEMBER' } });
      })
    );
    render(<Office />);
    const emailInput = await screen.findByLabelText('אימייל הסוכן');
    await user.type(emailInput, 'new@estia.app');
    await user.click(screen.getByRole('button', { name: /הזמן/ }));
    await waitFor(() => expect(invited).toBeTruthy());
    expect((invited as { userId: string }).userId).toBe('u9');
  });

  it('email-invite mode POSTs to /office/invites and shows the copy link', async () => {
    asOwner();
    const user = userEvent.setup();
    let sent: unknown = null;
    server.use(
      http.get('/api/office', () =>
        HttpResponse.json({
          office: { id: 'o1', name: 'Acme' },
          members: [{ id: 'u1', email: 'owner@estia.app', displayName: 'יוסי', role: 'OWNER' }],
        })
      ),
      http.post('/api/office/invites', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          invite: {
            id: 'inv-7',
            email: (sent as { email: string }).email,
            inviteUrl: 'https://example.test/accept-invite?token=inv-7',
          },
        });
      })
    );
    render(<Office />);
    // Switch into "email" mode.
    await user.click(await screen.findByRole('radio', { name: /הזמן לפי אימייל/ }));
    const emailInput = await screen.findByLabelText('אימייל להזמנה');
    await user.type(emailInput, 'newperson@example.com');
    await user.click(screen.getByRole('button', { name: /הזמן/ }));
    await waitFor(() => expect(sent).toBeTruthy());
    expect((sent as { email: string }).email).toBe('newperson@example.com');
    // Copy-link UI surfaces the returned URL.
    expect(
      await screen.findByDisplayValue('https://example.test/accept-invite?token=inv-7')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /העתק קישור/ })).toBeInTheDocument();
  });

  it('copy button writes the invite URL to the clipboard', async () => {
    asOwner();
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    server.use(
      http.get('/api/office', () =>
        HttpResponse.json({
          office: { id: 'o1', name: 'Acme' },
          members: [{ id: 'u1', email: 'owner@estia.app', displayName: 'יוסי', role: 'OWNER' }],
        })
      ),
      http.post('/api/office/invites', () =>
        HttpResponse.json({
          invite: {
            id: 'inv-9',
            email: 'copy@example.com',
            inviteUrl: 'https://example.test/accept-invite?token=inv-9',
          },
        })
      )
    );
    render(<Office />);
    await user.click(await screen.findByRole('radio', { name: /הזמן לפי אימייל/ }));
    await user.type(await screen.findByLabelText('אימייל להזמנה'), 'copy@example.com');
    await user.click(screen.getByRole('button', { name: /הזמן/ }));
    const copyBtn = await screen.findByRole('button', { name: /העתק קישור/ });
    await user.click(copyBtn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      'https://example.test/accept-invite?token=inv-9'
    ));
  });

  it('renders pending invites + revoke button when OWNER has invites', async () => {
    asOwner();
    const user = userEvent.setup();
    let revoked: string | null = null;
    server.use(
      http.get('/api/office', () =>
        HttpResponse.json({
          office: { id: 'o1', name: 'Acme' },
          members: [{ id: 'u1', email: 'owner@estia.app', displayName: 'יוסי', role: 'OWNER' }],
        })
      ),
      http.get('/api/office/invites', () =>
        HttpResponse.json({
          items: [
            {
              id: 'inv-1',
              email: 'pending@example.com',
              inviteUrl: 'https://example.test/accept-invite?token=inv-1',
            },
          ],
        })
      ),
      http.delete('/api/office/invites/:id', ({ params }) => {
        revoked = params.id as string;
        return HttpResponse.json({ ok: true });
      })
    );
    render(<Office />);
    expect(await screen.findByText('pending@example.com')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /בטל הזמנה ל-pending@example.com/ })
    );
    await waitFor(() => expect(revoked).toBe('inv-1'));
  });
});
