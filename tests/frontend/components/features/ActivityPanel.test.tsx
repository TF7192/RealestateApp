import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import ActivityPanel from '@estia/frontend/components/ActivityPanel.jsx';

describe('<ActivityPanel>', () => {
  it('renders the empty state when no events exist', async () => {
    server.use(http.get('/api/activity', () => HttpResponse.json({ items: [] })));
    render(<ActivityPanel entityType="Lead" entityId="lead-1" />);
    expect(await screen.findByText('אין פעילות עדיין')).toBeInTheDocument();
  });

  it('lists events with the actor + summary', async () => {
    server.use(
      http.get('/api/activity', () =>
        HttpResponse.json({
          items: [
            {
              id: 'a1',
              kind: 'STATUS_CHANGE',
              action: 'עודכן סטטוס',
              actorName: 'יוסי כהן',
              summary: 'הסטטוס שונה ל״חם״',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'a2',
              kind: 'NOTE_ADDED',
              action: 'הוספה הערה',
              actorName: 'מיכל',
              summary: 'הוספה הערה על פגישה',
              createdAt: new Date().toISOString(),
            },
          ],
        })
      )
    );
    render(<ActivityPanel entityType="Lead" entityId="lead-1" />);
    expect(await screen.findByText('הסטטוס שונה ל״חם״')).toBeInTheDocument();
    expect(screen.getByText('הוספה הערה על פגישה')).toBeInTheDocument();
    expect(screen.getByText('יוסי כהן')).toBeInTheDocument();
  });

  it('shows the error banner on a failed fetch', async () => {
    server.use(
      http.get('/api/activity', () =>
        HttpResponse.json({ error: { message: 'bad' } }, { status: 500 })
      )
    );
    render(<ActivityPanel entityType="Lead" entityId="lead-1" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
