import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import TransferPropertyDialog from '@estia/frontend/components/TransferPropertyDialog.jsx';

const property = {
  id: 'p1', street: 'רוטשילד', city: 'ת״א',
  assetClass: 'RESIDENTIAL', category: 'SALE',
  marketingPrice: 2_500_000, sqm: 95, rooms: 4, floor: 2, totalFloors: 5,
  parking: true, storage: false, ac: true, elevator: true, safeRoom: true,
};

describe('<TransferPropertyDialog>', () => {
  it('renders the header + tabs + the in-app form by default', () => {
    render(<TransferPropertyDialog property={property} onClose={() => {}} onDone={() => {}} />);
    expect(screen.getByRole('heading', { name: /העברת נכס/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /העברה לסוכן במערכת/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /שליחת פרטים בוואטסאפ/ })).toBeInTheDocument();
    // Search button is present when the in-app tab is active.
    expect(screen.getByRole('button', { name: /חפש/ })).toBeInTheDocument();
  });

  it('search: unknown email shows the "not found" error', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/transfers/agents/search', () => HttpResponse.json({ agent: null }))
    );
    render(<TransferPropertyDialog property={property} onClose={() => {}} onDone={() => {}} />);
    await user.type(screen.getByPlaceholderText('agent@example.com'), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: /חפש/ }));
    expect(await screen.findByText(/לא נמצא סוכן רשום/)).toBeInTheDocument();
  });

  it('search: {self:true} shows the self-transfer error', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/transfers/agents/search', () => HttpResponse.json({ agent: null, self: true }))
    );
    render(<TransferPropertyDialog property={property} onClose={() => {}} onDone={() => {}} />);
    await user.type(screen.getByPlaceholderText('agent@example.com'), 'me@example.com');
    await user.click(screen.getByRole('button', { name: /חפש/ }));
    expect(await screen.findByText(/לא ניתן להעביר לעצמך/)).toBeInTheDocument();
  });

  it('search found → renders the agent card + enables the "שלח בקשת העברה" button', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/transfers/agents/search', () =>
        HttpResponse.json({ agent: { id: 'a2', email: 'a@b.com', displayName: 'רחל לוי', agency: 'Acme' } })
      )
    );
    render(<TransferPropertyDialog property={property} onClose={() => {}} onDone={() => {}} />);
    await user.type(screen.getByPlaceholderText('agent@example.com'), 'a@b.com');
    await user.click(screen.getByRole('button', { name: /חפש/ }));
    expect(await screen.findByText('רחל לוי')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: /שלח בקשת העברה/ });
    expect(submit).toBeEnabled();
  });

  it('tab switch — clicking the WhatsApp tab reveals the message textarea', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TransferPropertyDialog property={property} onClose={() => {}} onDone={() => {}} />
    );
    await user.click(screen.getByRole('button', { name: /שליחת פרטים בוואטסאפ/ }));
    // The <label> isn't htmlFor-linked (app-level minor a11y gap) — query
    // the textarea directly. Auto-populated brief should include the
    // property's street name.
    // Portal renders into document.body, not the RTL container.
    const ta = document.querySelector('textarea.tpd-textarea') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.value).toContain('רוטשילד');
    expect(screen.getByRole('button', { name: /פתח בוואטסאפ/ })).toBeInTheDocument();
  });

  it('close button fires onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TransferPropertyDialog property={property} onClose={onClose} onDone={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'סגור' }));
    expect(onClose).toHaveBeenCalled();
  });
});
