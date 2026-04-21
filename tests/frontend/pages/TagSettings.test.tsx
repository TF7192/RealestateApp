import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import TagSettings from '@estia/frontend/pages/TagSettings.jsx';

describe('<TagSettings>', () => {
  it('renders the page heading and inline create form', async () => {
    render(<TagSettings />);
    expect(await screen.findByRole('heading', { name: 'תגיות' })).toBeInTheDocument();
    expect(screen.getByLabelText('שם התגית')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /הוסף תגית/ })).toBeInTheDocument();
  });

  it('shows the empty state when there are no tags', async () => {
    render(<TagSettings />);
    await waitFor(() => {
      expect(screen.getByText('עדיין אין תגיות')).toBeInTheDocument();
    });
  });

  it('creating a tag POSTs the name + scope', async () => {
    const user = userEvent.setup();
    let posted: unknown = null;
    server.use(
      http.post('/api/tags', async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({
          tag: { id: 't1', name: 'VIP', color: '#c9a14a', scope: 'LEAD' },
        });
      })
    );
    render(<TagSettings />);
    const nameInput = await screen.findByLabelText('שם התגית');
    await user.type(nameInput, 'VIP');
    await user.selectOptions(screen.getByLabelText('תחום תגית'), 'LEAD');
    await user.click(screen.getByRole('button', { name: /הוסף תגית/ }));
    await waitFor(() => expect(posted).toBeTruthy());
    const body = posted as { name: string; scope: string };
    expect(body.name).toBe('VIP');
    expect(body.scope).toBe('LEAD');
  });

  it('renders existing tags with an edit + delete button per row', async () => {
    server.use(
      http.get('/api/tags', () =>
        HttpResponse.json({
          items: [
            { id: 't1', name: 'VIP',      color: '#ff0000', scope: 'LEAD' },
            { id: 't2', name: 'פרימיום', color: '#00ff00', scope: 'PROPERTY' },
          ],
        })
      )
    );
    render(<TagSettings />);
    expect(await screen.findByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('פרימיום')).toBeInTheDocument();
    expect(screen.getByLabelText('מחק: VIP')).toBeInTheDocument();
    expect(screen.getByLabelText('ערוך: VIP')).toBeInTheDocument();
  });

  it('clicking delete opens a confirm dialog; confirming calls deleteTag', async () => {
    const user = userEvent.setup();
    let deletedId: string | null = null;
    server.use(
      http.get('/api/tags', () =>
        HttpResponse.json({
          items: [{ id: 't1', name: 'VIP', color: '#c9a14a', scope: 'ALL' }],
        })
      ),
      http.delete('/api/tags/:id', ({ params }) => {
        deletedId = params.id as string;
        return HttpResponse.json({ ok: true });
      })
    );
    render(<TagSettings />);
    await user.click(await screen.findByLabelText('מחק: VIP'));
    // ConfirmDialog renders in a Portal — look up from document.
    const confirmBtn = await screen.findByRole('button', { name: 'מחק' });
    await user.click(confirmBtn);
    await waitFor(() => expect(deletedId).toBe('t1'));
  });
});
