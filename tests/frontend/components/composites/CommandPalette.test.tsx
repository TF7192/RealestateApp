// CommandPalette tests — exercises the H1 global-search integration.
//
// The palette merges three content sources:
//  1. Static nav entries (always available, even when offline)
//  2. Async `api.globalSearch(q)` results, debounced 250ms
//  3. Grouped into ניווט / נכסים / לקוחות / בעלים / עסקאות
//
// We stub the server via MSW so tests don't need to mock the api client.

import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../setup/msw-server';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import CommandPalette from '@estia/frontend/components/CommandPalette.jsx';

describe('<CommandPalette>', () => {
  it('renders the search input and static nav entries when opened', () => {
    render(<CommandPalette open={true} onClose={() => {}} />);
    // Placeholder wording is the anchor — stable across Hebrew copy tweaks
    expect(screen.getByPlaceholderText(/חפש/)).toBeInTheDocument();
    // Static nav always visible on first open
    expect(screen.getAllByText('לוח בקרה').length).toBeGreaterThan(0);
    expect(screen.getAllByText('נכסים').length).toBeGreaterThan(0);
  });

  it('closes when ESC is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommandPalette open={true} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls api.globalSearch and renders grouped results (properties, leads, owners, deals)', async () => {
    server.use(
      http.get('/api/search', () =>
        HttpResponse.json({
          query: 'test',
          total: 4,
          properties: [
            { id: 'p1', street: 'אלנבי', number: '10', city: 'תל אביב' },
          ],
          leads: [
            { id: 'l1', name: 'דנה כהן', phone: '050-0000000', city: 'חיפה' },
          ],
          owners: [
            { id: 'o1', name: 'יוסי לוי', phone: '054-1111111' },
          ],
          deals: [
            { id: 'd1', status: 'OPEN', propertyAddress: 'רחוב הרצל 5' },
          ],
        })
      )
    );
    const user = userEvent.setup();
    render(<CommandPalette open={true} onClose={() => {}} />);
    const input = screen.getByPlaceholderText(/חפש/);
    await user.type(input, 'test');
    // Results grouped under the Hebrew section titles — wait for async debounce.
    await waitFor(() => {
      expect(screen.getByText('דנה כהן')).toBeInTheDocument();
    }, { timeout: 2000 });
    expect(screen.getByText('יוסי לוי')).toBeInTheDocument();
    // Section titles visible for at least the dynamic groups
    expect(screen.getByText('לקוחות')).toBeInTheDocument();
    expect(screen.getByText('בעלים')).toBeInTheDocument();
    expect(screen.getByText('עסקאות')).toBeInTheDocument();
  });

  it('arrow keys move selection and Enter triggers navigation + onClose', async () => {
    // Server returns one property — pressing Enter on it should close.
    server.use(
      http.get('/api/search', () =>
        HttpResponse.json({
          query: 'x',
          total: 1,
          properties: [{ id: 'px', street: 'דיזנגוף', number: '1', city: 'תל אביב' }],
          leads: [],
          owners: [],
          deals: [],
        })
      )
    );
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommandPalette open={true} onClose={onClose} />);
    await user.type(screen.getByPlaceholderText(/חפש/), 'x');
    await waitFor(() => {
      expect(screen.getByText(/דיזנגוף/)).toBeInTheDocument();
    }, { timeout: 2000 });
    // ArrowDown a few times then Enter — implementation should land on the
    // property and navigate, which closes the palette.
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows an empty state when the query has no matches', async () => {
    server.use(
      http.get('/api/search', () =>
        HttpResponse.json({
          query: 'zzzz',
          total: 0,
          properties: [],
          leads: [],
          owners: [],
          deals: [],
        })
      )
    );
    const user = userEvent.setup();
    render(<CommandPalette open={true} onClose={() => {}} />);
    await user.type(screen.getByPlaceholderText(/חפש/), 'zzzz');
    await waitFor(() => {
      expect(screen.getByText(/לא נמצאו תוצאות/)).toBeInTheDocument();
    }, { timeout: 2000 });
  });
});
