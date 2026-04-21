import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import OwnerPhonesPanel from '@estia/frontend/components/OwnerPhonesPanel.jsx';

describe('<OwnerPhonesPanel>', () => {
  beforeEach(() => {
    // window.confirm is called by the delete path; default to true
    // so the DELETE actually fires unless overridden.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('H — renders the EmptyState when the owner has no phones', async () => {
    render(<OwnerPhonesPanel ownerId="o1" />);
    await waitFor(() =>
      expect(screen.getByText('אין מספרים נוספים')).toBeInTheDocument()
    );
  });

  it('H — adds a phone via the new-phone form', async () => {
    const user = userEvent.setup();
    let postBody: any = null;
    let readCount = 0;
    server.use(
      http.get('/api/owners/:id/phones', () => {
        readCount += 1;
        // First load: empty. After the POST, return the just-added row.
        if (readCount === 1) return HttpResponse.json({ items: [] });
        return HttpResponse.json({
          items: [
            {
              id: 'ph_new',
              ownerId: 'o1',
              phone: '050-9998877',
              kind: 'spouse',
              label: null,
              sortOrder: 0,
            },
          ],
        });
      }),
      http.post('/api/owners/:id/phones', async ({ request }) => {
        postBody = await request.json();
        return HttpResponse.json({
          phone: {
            id: 'ph_new',
            ownerId: 'o1',
            phone: '050-9998877',
            kind: 'spouse',
            label: null,
            sortOrder: 0,
          },
        });
      })
    );

    render(<OwnerPhonesPanel ownerId="o1" />);
    await waitFor(() =>
      expect(screen.getByText('אין מספרים נוספים')).toBeInTheDocument()
    );
    await user.type(screen.getByLabelText('מספר טלפון חדש'), '0509998877');
    await user.selectOptions(
      screen.getByLabelText('סוג הטלפון', { selector: 'select' }),
      'spouse'
    );
    await user.click(screen.getByRole('button', { name: /הוסף מספר/ }));

    await waitFor(() => expect(postBody).toBeTruthy());
    expect(postBody).toMatchObject({ kind: 'spouse' });
    expect((postBody as any).phone.replace(/[^\d]/g, '')).toBe('0509998877');
  });

  it('H — edits a phone inline (PATCH on blur)', async () => {
    const user = userEvent.setup();
    let patchBody: any = null;
    server.use(
      http.get('/api/owners/:id/phones', () =>
        HttpResponse.json({
          items: [
            {
              id: 'ph_1',
              ownerId: 'o1',
              phone: '050-1111111',
              kind: 'primary',
              label: '',
              sortOrder: 0,
            },
          ],
        })
      ),
      http.patch('/api/owner-phones/:id', async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({
          phone: { id: 'ph_1', ownerId: 'o1', ...patchBody },
        });
      })
    );

    render(<OwnerPhonesPanel ownerId="o1" />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('050-1111111')).toBeInTheDocument()
    );
    // Label input: row has placeholder תווית (לדוגמה: בבוקר)
    const labelInput = screen.getByPlaceholderText('תווית (לדוגמה: בבוקר)');
    await user.type(labelInput, 'בבוקר');
    labelInput.blur();
    await waitFor(() => expect(patchBody).toBeTruthy());
    expect(patchBody).toMatchObject({ label: 'בבוקר' });
  });

  it('H — deletes a phone after confirm', async () => {
    const user = userEvent.setup();
    let deleted = false;
    let readCount = 0;
    server.use(
      http.get('/api/owners/:id/phones', () => {
        readCount += 1;
        if (readCount >= 2) return HttpResponse.json({ items: [] });
        return HttpResponse.json({
          items: [
            {
              id: 'ph_1',
              ownerId: 'o1',
              phone: '050-1111111',
              kind: 'primary',
              label: null,
              sortOrder: 0,
            },
          ],
        });
      }),
      http.delete('/api/owner-phones/:id', () => {
        deleted = true;
        return HttpResponse.json({ ok: true });
      })
    );

    render(<OwnerPhonesPanel ownerId="o1" />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('050-1111111')).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('button', { name: /מחק את המספר 050-1111111/ })
    );
    await waitFor(() => expect(deleted).toBe(true));
  });

  it('H — skips delete if confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    let deleted = false;
    server.use(
      http.get('/api/owners/:id/phones', () =>
        HttpResponse.json({
          items: [
            {
              id: 'ph_1',
              ownerId: 'o1',
              phone: '050-1111111',
              kind: 'primary',
              label: null,
              sortOrder: 0,
            },
          ],
        })
      ),
      http.delete('/api/owner-phones/:id', () => {
        deleted = true;
        return HttpResponse.json({ ok: true });
      })
    );
    render(<OwnerPhonesPanel ownerId="o1" />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('050-1111111')).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('button', { name: /מחק את המספר 050-1111111/ })
    );
    // Give the event loop a moment so a runaway DELETE would register.
    await new Promise((r) => setTimeout(r, 50));
    expect(deleted).toBe(false);
  });

  it('E — rolls back on PATCH error', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/owners/:id/phones', () =>
        HttpResponse.json({
          items: [
            {
              id: 'ph_1',
              ownerId: 'o1',
              phone: '050-1111111',
              kind: 'primary',
              label: '',
              sortOrder: 0,
            },
          ],
        })
      ),
      http.patch('/api/owner-phones/:id', () =>
        HttpResponse.json({ error: { message: 'no' } }, { status: 500 })
      )
    );
    render(<OwnerPhonesPanel ownerId="o1" />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('050-1111111')).toBeInTheDocument()
    );
    const labelInput = screen.getByPlaceholderText('תווית (לדוגמה: בבוקר)');
    await user.type(labelInput, 'abc');
    labelInput.blur();
    // After the 500 rolls back, label input should be empty again.
    await waitFor(() =>
      expect((labelInput as HTMLInputElement).value).toBe('')
    );
  });
});
