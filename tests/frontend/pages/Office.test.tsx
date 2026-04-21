import { describe, it, expect } from 'vitest';
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
});
