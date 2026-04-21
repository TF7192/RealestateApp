import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import PropertyAssigneesPanel from '@estia/frontend/components/PropertyAssigneesPanel.jsx';

describe('<PropertyAssigneesPanel>', () => {
  it('renders the EmptyState when the property has no assignees', async () => {
    render(<PropertyAssigneesPanel propertyId="p1" />);
    await waitFor(() => expect(screen.getByText('אין שותפים משויכים')).toBeInTheDocument());
  });

  it('renders the list of existing assignees + their role label', async () => {
    server.use(
      http.get('/api/properties/:id/assignees', () =>
        HttpResponse.json({
          items: [
            {
              userId: 'u2', role: 'CO_AGENT',
              user: { id: 'u2', displayName: 'שותפה', email: 'partner@estia.app', role: 'AGENT' },
            },
            {
              userId: 'u3', role: 'OBSERVER',
              user: { id: 'u3', displayName: 'צופה', email: 'obs@estia.app', role: 'AGENT' },
            },
          ],
        })
      )
    );
    render(<PropertyAssigneesPanel propertyId="p1" />);
    await waitFor(() => expect(screen.getByText('שותפה')).toBeInTheDocument());
    // Both role labels appear in the rendered list. "שותף" and "צופה"
    // also appear as <option>s inside the add form — getAllByText is
    // the safe cross-source match.
    expect(screen.getAllByText('צופה').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('שותף').length).toBeGreaterThanOrEqual(2);
  });

  it('resolves email → userId then POSTs with the chosen role', async () => {
    const user = userEvent.setup();
    let postBody: unknown = null;
    server.use(
      http.get('/api/transfers/agents/search', () =>
        HttpResponse.json({
          agent: {
            id: 'u9', email: 'x@estia.app',
            displayName: 'איקס', phone: null, avatarUrl: null, agency: null,
          },
        })
      ),
      http.post('/api/properties/:id/assignees', async ({ request }) => {
        postBody = await request.json();
        return HttpResponse.json({ assignee: { propertyId: 'p1', userId: 'u9', role: 'OBSERVER' } });
      })
    );
    render(<PropertyAssigneesPanel propertyId="p1" />);
    await waitFor(() => expect(screen.getByText('אין שותפים משויכים')).toBeInTheDocument());
    await user.type(screen.getByLabelText('אימייל שותף'), 'x@estia.app');
    await user.selectOptions(screen.getByLabelText('תפקיד השותף'), 'OBSERVER');
    await user.click(screen.getByRole('button', { name: /הוסף שותף/ }));
    await waitFor(() => expect(postBody).toBeTruthy());
    expect(postBody).toMatchObject({ userId: 'u9', role: 'OBSERVER' });
  });

  it('surfaces Hebrew error when the email is not found', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/transfers/agents/search', () => HttpResponse.json({ agent: null }))
    );
    const errs: string[] = [];
    const toast = { success: () => {}, info: () => {}, error: (m: string) => { errs.push(m); } };
    render(<PropertyAssigneesPanel propertyId="p1" toast={toast} />);
    await waitFor(() => expect(screen.getByText('אין שותפים משויכים')).toBeInTheDocument());
    await user.type(screen.getByLabelText('אימייל שותף'), 'nope@estia.app');
    await user.click(screen.getByRole('button', { name: /הוסף שותף/ }));
    await waitFor(() => expect(errs.length).toBeGreaterThan(0));
    expect(errs[0]).toMatch(/לא נמצא/);
  });

  it('removes an assignee when clicking the per-row remove button', async () => {
    const user = userEvent.setup();
    let removedId: string | null = null;
    server.use(
      http.get('/api/properties/:id/assignees', () =>
        HttpResponse.json({
          items: [{
            userId: 'u2', role: 'CO_AGENT',
            user: { id: 'u2', displayName: 'שותפה', email: 'p@estia.app', role: 'AGENT' },
          }],
        })
      ),
      http.delete('/api/properties/:id/assignees/:userId', ({ params }) => {
        removedId = params.userId as string;
        return HttpResponse.json({ ok: true });
      })
    );
    render(<PropertyAssigneesPanel propertyId="p1" />);
    await waitFor(() => expect(screen.getByText('שותפה')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /הסר את שותפה/ }));
    await waitFor(() => expect(removedId).toBe('u2'));
  });

  it('has no axe violations', async () => {
    const { baseElement } = render(<PropertyAssigneesPanel propertyId="p1" />);
    await waitFor(() => expect(screen.getByText('אין שותפים משויכים')).toBeInTheDocument());
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
