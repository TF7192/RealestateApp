import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import ActivityLog from '@estia/frontend/pages/ActivityLog.jsx';

describe('<ActivityLog>', () => {
  it('renders the empty state when the feed has no entries', async () => {
    render(<ActivityLog />);
    expect(await screen.findByRole('heading', { name: 'יומן פעילות' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('אין פעילות להצגה')).toBeInTheDocument();
    });
  });

  it('renders activity items with action + summary + formatted timestamp', async () => {
    server.use(
      http.get('/api/activity', () =>
        HttpResponse.json({
          items: [
            {
              id: 'a1',
              entityType: 'PROPERTY',
              entityId: 'p1',
              action: 'יצירה',
              summary: 'נוסף נכס חדש',
              actorName: 'יוסי',
              createdAt: '2026-04-20T10:00:00Z',
            },
          ],
        })
      )
    );
    render(<ActivityLog />);
    expect(await screen.findByText('יצירה')).toBeInTheDocument();
    expect(screen.getByText('נוסף נכס חדש')).toBeInTheDocument();
    expect(screen.getByText(/על ידי/)).toBeInTheDocument();
  });

  it('filtering by entityType forwards the chosen type as a query param', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    server.use(
      http.get('/api/activity', ({ request }) => {
        const url = new URL(request.url);
        seen.push(url.searchParams.get('entityType') ?? '');
        return HttpResponse.json({ items: [] });
      })
    );
    render(<ActivityLog />);
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: 'נכסים' }));
    await waitFor(() => expect(seen).toContain('PROPERTY'));
  });

  it('changing the limit dropdown refetches with the new value', async () => {
    const user = userEvent.setup();
    const seenLimits: string[] = [];
    server.use(
      http.get('/api/activity', ({ request }) => {
        const url = new URL(request.url);
        seenLimits.push(url.searchParams.get('limit') ?? '');
        return HttpResponse.json({ items: [] });
      })
    );
    render(<ActivityLog />);
    await waitFor(() => expect(seenLimits).toContain('50'));
    const select = screen.getByLabelText('מספר שורות');
    await user.selectOptions(select, '100');
    await waitFor(() => expect(seenLimits).toContain('100'));
  });
});
