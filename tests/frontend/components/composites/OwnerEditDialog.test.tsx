import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import OwnerEditDialog from '@estia/frontend/components/OwnerEditDialog.jsx';

describe('<OwnerEditDialog> — create mode', () => {
  it('renders the "בעל נכס חדש" heading + empty fields', () => {
    render(<OwnerEditDialog onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByRole('heading', { name: /בעל נכס חדש/ })).toBeInTheDocument();
    expect((screen.getByPlaceholderText('ישראל ישראלי') as HTMLInputElement).value).toBe('');
  });

  it('rejects empty name with an inline error', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<OwnerEditDialog onClose={() => {}} onSaved={onSaved} />);
    await user.click(screen.getByRole('button', { name: /צור בעל נכס/ }));
    expect(screen.getByText(/שם הוא שדה חובה/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('rejects empty phone with an inline error', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<OwnerEditDialog onClose={() => {}} onSaved={onSaved} />);
    await user.type(screen.getByPlaceholderText('ישראל ישראלי'), 'ישראל');
    await user.click(screen.getByRole('button', { name: /צור בעל נכס/ }));
    expect(screen.getByText(/טלפון הוא שדה חובה/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('POSTs to /api/owners and calls onSaved with the created owner', async () => {
    const user = userEvent.setup();
    let received: any = null;
    server.use(
      http.post('/api/owners', async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ owner: { id: 'new-1', ...received } });
      })
    );
    const onSaved = vi.fn();
    render(<OwnerEditDialog onClose={() => {}} onSaved={onSaved} />);
    await user.type(screen.getByPlaceholderText('ישראל ישראלי'), 'דן');
    await user.type(screen.getByPlaceholderText('050-1234567'), '0501234567');
    await user.click(screen.getByRole('button', { name: /צור בעל נכס/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    // PhoneField auto-formats raw digits to "050-1234567" before the
    // value reaches the save handler.
    expect(received).toMatchObject({ name: 'דן', phone: '050-1234567' });
    expect(onSaved.mock.calls[0][0]).toMatchObject({ id: 'new-1', name: 'דן' });
  });

  it('surfaces a server error without calling onSaved', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/owners', () =>
        HttpResponse.json({ error: { message: 'טלפון כפול' } }, { status: 409 })
      )
    );
    const onSaved = vi.fn();
    render(<OwnerEditDialog onClose={() => {}} onSaved={onSaved} />);
    await user.type(screen.getByPlaceholderText('ישראל ישראלי'), 'ד');
    await user.type(screen.getByPlaceholderText('050-1234567'), '0501234567');
    await user.click(screen.getByRole('button', { name: /צור בעל נכס/ }));
    expect(await screen.findByText(/טלפון כפול/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('close button fires onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OwnerEditDialog onClose={onClose} onSaved={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'סגור' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the backdrop fires onClose; clicking inside the dialog does not', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OwnerEditDialog onClose={onClose} onSaved={() => {}} />);
    await user.click(screen.getByPlaceholderText('ישראל ישראלי'));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(document.querySelector('.owner-dialog-backdrop') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no axe violations', async () => {
    const { baseElement } = render(<OwnerEditDialog onClose={() => {}} onSaved={() => {}} />);
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('<OwnerEditDialog> — edit mode', () => {
  it('prefills form from the owner prop and PATCHes on save', async () => {
    const user = userEvent.setup();
    let patchedId: string | null = null;
    let patchedBody: any = null;
    server.use(
      http.patch('/api/owners/:id', async ({ request, params }) => {
        patchedId = params.id as string;
        patchedBody = await request.json();
        return HttpResponse.json({ owner: { id: patchedId, ...patchedBody } });
      })
    );
    const onSaved = vi.fn();
    render(
      <OwnerEditDialog
        owner={{ id: 'o1', name: 'old', phone: '0501234567', email: '', notes: '' }}
        onClose={() => {}}
        onSaved={onSaved}
      />
    );
    expect(screen.getByRole('heading', { name: /עריכת בעל נכס/ })).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText('ישראל ישראלי') as HTMLInputElement;
    expect(nameInput.value).toBe('old');
    await user.clear(nameInput);
    await user.type(nameInput, 'new');
    await user.click(screen.getByRole('button', { name: /שמור שינויים/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(patchedId).toBe('o1');
    expect(patchedBody).toMatchObject({ name: 'new' });
  });
});
