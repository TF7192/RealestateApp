import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import AdvertsPanel from '@estia/frontend/components/AdvertsPanel.jsx';

describe('<AdvertsPanel>', () => {
  it('renders the empty state when the property has no adverts', async () => {
    render(<AdvertsPanel propertyId="p1" />);
    await waitFor(() => expect(screen.getByText('אין עדיין מודעות')).toBeInTheDocument());
  });

  it('renders each advert with its channel + status labels', async () => {
    server.use(
      http.get('/api/properties/:id/adverts', () =>
        HttpResponse.json({
          items: [
            {
              id: 'a1', channel: 'YAD2', status: 'PUBLISHED',
              title: '4 חד׳ ברח׳ הרצל', publishedPrice: 2500000,
              externalUrl: 'https://yad2.example', externalId: 'y1',
              publishedAt: '2026-04-01T00:00:00Z', expiresAt: null,
            },
            {
              id: 'a2', channel: 'FACEBOOK', status: 'DRAFT',
              title: null, publishedPrice: null,
              externalUrl: null, externalId: null,
              publishedAt: null, expiresAt: null,
            },
          ],
        })
      )
    );
    render(<AdvertsPanel propertyId="p1" />);
    await waitFor(() => expect(screen.getByText('יד2')).toBeInTheDocument());
    expect(screen.getByText('פייסבוק')).toBeInTheDocument();
    expect(screen.getByText('4 חד׳ ברח׳ הרצל')).toBeInTheDocument();
  });

  it('creates a draft advert with the selected channel + title', async () => {
    const user = userEvent.setup();
    let postBody: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/properties/:id/adverts', async ({ request }) => {
        postBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ advert: { id: 'new-1', ...postBody } });
      })
    );
    render(<AdvertsPanel propertyId="p1" />);
    await waitFor(() => expect(screen.getByText('אין עדיין מודעות')).toBeInTheDocument());
    // Click the empty-state primary CTA ("מודעה חדשה").
    const newBtns = screen.getAllByRole('button', { name: /מודעה חדשה/ });
    await user.click(newBtns[0]);
    await user.type(screen.getByLabelText('כותרת'), 'דירת 4 חדרים');
    await user.selectOptions(screen.getByLabelText('ערוץ המודעה'), 'ONMAP');
    await user.click(screen.getByRole('button', { name: 'שמור מודעה' }));
    await waitFor(() => expect(postBody).toBeTruthy());
    expect(postBody!.channel).toBe('ONMAP');
    expect(postBody!.title).toBe('דירת 4 חדרים');
    expect(postBody!.status).toBe('DRAFT');
  });

  it('transitions status from DRAFT to PUBLISHED via the inline select', async () => {
    const user = userEvent.setup();
    let patchBody: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/properties/:id/adverts', () =>
        HttpResponse.json({
          items: [
            {
              id: 'a1', channel: 'YAD2', status: 'DRAFT',
              title: 't', publishedPrice: 2500000,
              externalUrl: null, externalId: null,
              publishedAt: null, expiresAt: null,
            },
          ],
        })
      ),
      http.patch('/api/adverts/:id', async ({ request }) => {
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ advert: { id: 'a1', status: patchBody!.status } });
      })
    );
    render(<AdvertsPanel propertyId="p1" />);
    await waitFor(() => expect(screen.getByText('יד2')).toBeInTheDocument());
    const statusSelect = screen.getByLabelText(/שנה סטטוס למודעה ביד2/) as HTMLSelectElement;
    await user.selectOptions(statusSelect, 'PUBLISHED');
    await waitFor(() => expect(patchBody).toBeTruthy());
    expect(patchBody!.status).toBe('PUBLISHED');
    expect(typeof patchBody!.publishedAt).toBe('string');
  });

  it('removes an advert when the per-row remove button is clicked', async () => {
    const user = userEvent.setup();
    let deletedId: string | null = null;
    server.use(
      http.get('/api/properties/:id/adverts', () =>
        HttpResponse.json({
          items: [{
            id: 'a1', channel: 'YAD2', status: 'DRAFT',
            title: 't', publishedPrice: null,
            externalUrl: null, externalId: null,
            publishedAt: null, expiresAt: null,
          }],
        })
      ),
      http.delete('/api/adverts/:id', ({ params }) => {
        deletedId = params.id as string;
        return HttpResponse.json({ ok: true });
      })
    );
    render(<AdvertsPanel propertyId="p1" />);
    await waitFor(() => expect(screen.getByText('יד2')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /הסר את המודעה ביד2/ }));
    await waitFor(() => expect(deletedId).toBe('a1'));
  });

  it('has no axe violations', async () => {
    const { baseElement } = render(<AdvertsPanel propertyId="p1" />);
    await waitFor(() => expect(screen.getByText('אין עדיין מודעות')).toBeInTheDocument());
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
