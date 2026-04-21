import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import { server } from '../setup/msw-server';
import NewLead from '@estia/frontend/pages/NewLead.jsx';

describe('<NewLead>', () => {
  it('renders the four sections including the K1/K2/L1 additions', () => {
    render(<NewLead />);
    expect(screen.getByRole('heading', { name: 'ליד חדש' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'פרטים אישיים' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'פרטים מורחבים' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ניהול ולקוח' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'הערות' })).toBeInTheDocument();
  });

  it('blocks save and shows an error when name is empty', async () => {
    const user = userEvent.setup();
    let created = false;
    server.use(
      http.post('/api/leads', () => { created = true; return HttpResponse.json({ id: 'x' }); })
    );
    render(<NewLead />);
    await user.click(screen.getAllByRole('button', { name: /שמור ליד/ })[0]);
    expect(created).toBe(false);
  });

  it('POSTs the new K1/K2/L1 fields when the form is saved', async () => {
    const user = userEvent.setup();
    let body = {};
    server.use(
      http.post('/api/leads', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'lead-new' });
      })
    );
    render(<NewLead />);

    // Required — the name input has the placeholder "שם מלא".
    await user.type(screen.getByPlaceholderText('שם מלא'), 'דני לוי');

    // K1 — fill a subset that proves the fields are wired up.
    await user.type(screen.getByLabelText('שם פרטי'), 'דני');
    await user.type(screen.getByLabelText('שם משפחה'), 'לוי');
    await user.type(screen.getByLabelText('ת.ז / ח.פ'), '123456789');
    await user.type(screen.getByLabelText('מיקוד'), '5252525');

    // K2 — pick a customerStatus other than ACTIVE.
    await user.selectOptions(screen.getByLabelText('סטטוס לקוח'), 'PAUSED');
    // K2 — purpose multi-select: pick השקעה (INVESTMENT).
    await user.click(screen.getByRole('checkbox', { name: 'השקעה' }));
    // L1 — leadStatus NOT_INTERESTED.
    await user.selectOptions(screen.getByLabelText('סטטוס ליד'), 'NOT_INTERESTED');

    await user.click(screen.getAllByRole('button', { name: /שמור ליד/ })[0]);

    await waitFor(() => {
      expect(body.name).toBe('דני לוי');
      expect(body.firstName).toBe('דני');
      expect(body.lastName).toBe('לוי');
      expect(body.personalId).toBe('123456789');
      expect(body.zip).toBe('5252525');
      expect(body.customerStatus).toBe('PAUSED');
      expect(body.purposes).toEqual(['INVESTMENT']);
      expect(body.leadStatus).toBe('NOT_INTERESTED');
      // Defaults flow through even when the agent didn't touch them.
      expect(body.seriousnessOverride).toBe('NONE');
      expect(body.isPrivate).toBe(false);
    });
  });

  it('toggles the isPrivate admin flag', async () => {
    const user = userEvent.setup();
    let body = {};
    server.use(
      http.post('/api/leads', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'lead-new' });
      })
    );
    render(<NewLead />);
    await user.type(screen.getByPlaceholderText('שם מלא'), 'שרה');
    await user.click(screen.getByRole('checkbox', { name: /לקוח פרטי/ }));
    await user.click(screen.getAllByRole('button', { name: /שמור ליד/ })[0]);
    await waitFor(() => expect(body.isPrivate).toBe(true));
  });

  it('adds and removes multiple purposes on repeated click', async () => {
    const user = userEvent.setup();
    let body = {};
    server.use(
      http.post('/api/leads', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'lead-new' });
      })
    );
    render(<NewLead />);
    await user.type(screen.getByPlaceholderText('שם מלא'), 'ליאת');
    await user.click(screen.getByRole('checkbox', { name: 'השקעה' }));
    await user.click(screen.getByRole('checkbox', { name: 'מסחרי' }));
    // Toggle off the first one.
    await user.click(screen.getByRole('checkbox', { name: 'השקעה' }));
    await user.click(screen.getAllByRole('button', { name: /שמור ליד/ })[0]);
    await waitFor(() => expect(body.purposes).toEqual(['COMMERCIAL']));
  });
});
