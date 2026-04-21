import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import SavedSearchMenu from '@estia/frontend/components/SavedSearchMenu.jsx';

const exampleSaved = [
  {
    id: 'ss-1', entityType: 'LEAD', name: 'קונים בתל אביב',
    filters: { cities: ['תל אביב'], lookingFor: 'BUY' },
    createdAt: '2026-04-10T00:00:00.000Z',
  },
  {
    id: 'ss-2', entityType: 'LEAD', name: 'דחוף',
    filters: { seriousness: ['VERY'] },
    createdAt: '2026-04-12T00:00:00.000Z',
  },
];

function renderMenu(overrides: Partial<React.ComponentProps<typeof SavedSearchMenu>> = {}) {
  const props = {
    entityType: 'LEAD' as const,
    currentFilters: { cities: ['רמת גן'] },
    onLoad: vi.fn(),
    ...overrides,
  };
  render(<SavedSearchMenu {...props} />);
  return props;
}

describe('<SavedSearchMenu>', () => {
  it('renders a closed trigger button labelled "חיפושים שמורים"', () => {
    renderMenu();
    expect(screen.getByRole('button', { name: /חיפושים שמורים/ })).toBeInTheDocument();
  });

  it('opens the dropdown on click and fetches the list', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/saved-searches', () =>
        HttpResponse.json({ items: exampleSaved })
      )
    );
    renderMenu();
    await user.click(screen.getByRole('button', { name: /חיפושים שמורים/ }));
    expect(await screen.findByText('קונים בתל אביב')).toBeInTheDocument();
    expect(screen.getByText('דחוף')).toBeInTheDocument();
  });

  it('shows an empty hint when nothing is saved yet', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: /חיפושים שמורים/ }));
    expect(await screen.findByText(/אין עדיין חיפושים שמורים/)).toBeInTheDocument();
  });

  it('loads a search via onLoad when an item is clicked', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/saved-searches', () =>
        HttpResponse.json({ items: exampleSaved })
      )
    );
    const props = renderMenu();
    await user.click(screen.getByRole('button', { name: /חיפושים שמורים/ }));
    await user.click(await screen.findByText('קונים בתל אביב'));
    expect(props.onLoad).toHaveBeenCalledWith(
      expect.objectContaining({ cities: ['תל אביב'], lookingFor: 'BUY' })
    );
  });

  it('saves the current filters under a name via POST /saved-searches', async () => {
    const user = userEvent.setup();
    let captured: any = null;
    server.use(
      http.get('/api/saved-searches', () => HttpResponse.json({ items: [] })),
      http.post('/api/saved-searches', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          savedSearch: { id: 'ss-new', ...captured },
        });
      })
    );
    const props = renderMenu({ currentFilters: { cities: ['חיפה'], minPrice: 1000000 } });
    await user.click(screen.getByRole('button', { name: /חיפושים שמורים/ }));
    const input = await screen.findByPlaceholderText(/שם לחיפוש/);
    await user.type(input, 'חיפה זול');
    await user.click(screen.getByRole('button', { name: /^שמור$/ }));
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured).toMatchObject({
      entityType: 'LEAD',
      name: 'חיפה זול',
      filters: { cities: ['חיפה'], minPrice: 1000000 },
    });
    // The new entry should appear in the list after save.
    expect(await screen.findByText('חיפה זול')).toBeInTheDocument();
  });

  it('deletes a saved search via the trash button', async () => {
    const user = userEvent.setup();
    let deleted = false;
    server.use(
      http.get('/api/saved-searches', () =>
        HttpResponse.json({ items: exampleSaved })
      ),
      http.delete('/api/saved-searches/ss-2', () => {
        deleted = true;
        return HttpResponse.json({ ok: true });
      })
    );
    renderMenu();
    await user.click(screen.getByRole('button', { name: /חיפושים שמורים/ }));
    await screen.findByText('דחוף');
    // Each row has a trash button with aria-label "מחק <name>".
    await user.click(screen.getByRole('button', { name: /מחק דחוף/ }));
    await waitFor(() => expect(deleted).toBe(true));
    // The row should be removed from the list.
    await waitFor(() => expect(screen.queryByText('דחוף')).toBeNull());
  });

  it('filters the list by the entityType prop', async () => {
    const user = userEvent.setup();
    const capture = vi.fn();
    server.use(
      http.get('/api/saved-searches', ({ request }) => {
        const url = new URL(request.url);
        capture(url.searchParams.get('entityType'));
        return HttpResponse.json({ items: [] });
      })
    );
    renderMenu({ entityType: 'LEAD' });
    await user.click(screen.getByRole('button', { name: /חיפושים שמורים/ }));
    await waitFor(() => expect(capture).toHaveBeenCalledWith('LEAD'));
  });
});
