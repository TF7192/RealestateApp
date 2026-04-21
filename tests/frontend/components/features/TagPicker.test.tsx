import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import TagPicker from '@estia/frontend/components/TagPicker.jsx';

const TAGS = [
  { id: 't1', name: 'תג ראשון', color: '#D4AF37', scope: 'ALL' },
  { id: 't2', name: 'תג שני',    color: '#3B82F6', scope: 'ALL' },
  { id: 't3', name: 'תג שלישי',  color: null,     scope: 'ALL' },
];

describe('<TagPicker>', () => {
  it('lists assigned tags and marks the empty state when none attached', async () => {
    server.use(
      http.get('/api/tags',     () => HttpResponse.json({ items: TAGS })),
      http.get('/api/tags/for', () => HttpResponse.json({ items: [] })),
    );
    render(<TagPicker entityType="LEAD" entityId="lead-1" />);
    // After the initial fetch resolves, the empty chip is visible.
    await screen.findByText('אין תגים');
    expect(screen.getByRole('button', { name: 'הוסף תג' })).toBeInTheDocument();
  });

  it('shows assigned tags as chips and allows detaching', async () => {
    const user = userEvent.setup();
    let unassignedCalled = false;
    server.use(
      http.get('/api/tags',     () => HttpResponse.json({ items: TAGS })),
      http.get('/api/tags/for', () => HttpResponse.json({ items: [TAGS[0]] })),
      http.delete('/api/tags/:id/assign/:entityType/:entityId', () => {
        unassignedCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    render(<TagPicker entityType="LEAD" entityId="lead-1" />);
    await screen.findByText('תג ראשון');
    await user.click(screen.getByRole('button', { name: /הסר תג תג ראשון/ }));
    await waitFor(() => expect(unassignedCalled).toBe(true));
  });

  it('opens a dropdown of available tags and attaches one on click', async () => {
    const user = userEvent.setup();
    let assignedBody: { entityType?: string; entityId?: string } = {};
    server.use(
      http.get('/api/tags',     () => HttpResponse.json({ items: TAGS })),
      http.get('/api/tags/for', () => HttpResponse.json({ items: [] })),
      http.post('/api/tags/:id/assign', async ({ request }) => {
        assignedBody = (await request.json()) as { entityType?: string; entityId?: string };
        return HttpResponse.json({ ok: true });
      }),
    );
    render(<TagPicker entityType="PROPERTY" entityId="prop-9" />);
    await screen.findByText('אין תגים');
    await user.click(screen.getByRole('button', { name: 'הוסף תג' }));
    // The popover is now a listbox with all 3 catalog tags.
    const opt = await screen.findByRole('option', { name: /תג שני/ });
    await user.click(opt);
    await waitFor(() => {
      expect(assignedBody.entityType).toBe('PROPERTY');
      expect(assignedBody.entityId).toBe('prop-9');
    });
  });

  it('readonly mode hides add / remove controls', async () => {
    server.use(
      http.get('/api/tags',     () => HttpResponse.json({ items: TAGS })),
      http.get('/api/tags/for', () => HttpResponse.json({ items: [TAGS[0]] })),
    );
    render(<TagPicker entityType="LEAD" entityId="lead-1" readonly />);
    await screen.findByText('תג ראשון');
    expect(screen.queryByRole('button', { name: 'הוסף תג' })).toBeNull();
    expect(screen.queryByRole('button', { name: /הסר תג/ })).toBeNull();
  });
});
