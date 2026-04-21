import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import MatchingList from '@estia/frontend/components/MatchingList.jsx';

describe('<MatchingList>', () => {
  it('lists properties matching a lead with score + reasons', async () => {
    server.use(
      http.get('/api/leads/:id/matches', () =>
        HttpResponse.json({
          items: [
            {
              id: 'm1',
              score: 84,
              reasons: ['עיר תואמת', 'תקציב בטווח'],
              property: { id: 'p1', title: 'דירת 4 חדרים בגבעתיים', price: 3_200_000 },
            },
          ],
        })
      )
    );
    render(<MatchingList leadId="lead-1" />);
    expect(await screen.findByText('דירת 4 חדרים בגבעתיים')).toBeInTheDocument();
    expect(screen.getByText('84')).toBeInTheDocument();
    expect(screen.getByText('עיר תואמת')).toBeInTheDocument();
    expect(screen.getByText('תקציב בטווח')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /דירת 4 חדרים בגבעתיים/ })).toHaveAttribute('href', '/properties/p1');
  });

  it('lists customers matching a property in reverse direction', async () => {
    server.use(
      http.get('/api/properties/:id/matching-customers', () =>
        HttpResponse.json({
          items: [
            {
              id: 'm2',
              score: 62,
              reasons: ['מחפש בעיר'],
              lead: { id: 'lead-9', name: 'דני כהן', phone: '050-1111111' },
            },
          ],
        })
      )
    );
    render(<MatchingList propertyId="prop-1" />);
    expect(await screen.findByText('דני כהן')).toBeInTheDocument();
    expect(screen.getByText('62')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /דני כהן/ })).toHaveAttribute('href', '/customers/lead-9');
  });

  it('renders the empty state when no matches are returned', async () => {
    server.use(http.get('/api/leads/:id/matches', () => HttpResponse.json({ items: [] })));
    render(<MatchingList leadId="lead-1" />);
    expect(await screen.findByText('אין התאמות כרגע')).toBeInTheDocument();
  });

  it('surfaces errors from the backend', async () => {
    server.use(
      http.get('/api/leads/:id/matches', () =>
        HttpResponse.json({ error: { message: 'התאמות נפלו' } }, { status: 500 })
      )
    );
    render(<MatchingList leadId="lead-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/נכשלה|התאמות נפלו/);
  });
});
