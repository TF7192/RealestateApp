// H3 — VoiceReviewDialog tests.
//
// The dialog owns its own transcript + fields state once `result`
// lands; we assert the user can edit values, switch LEAD/PROPERTY
// tabs, save in draft mode (calls createLead/createProperty), and
// save in created mode (just dismisses + passes the entity through).

import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import VoiceReviewDialog from '@estia/frontend/components/VoiceReviewDialog.jsx';

const draftResult = {
  transcript: 'יוסי רוצה 4 חדרים בתל אביב',
  extracted: { name: 'יוסי', city: 'תל אביב', phone: '050-1234567' },
  mode: 'draft' as const,
  traceId: 't-1',
};

describe('<VoiceReviewDialog>', () => {
  it('renders a modal dialog with aria-modal + labelled title', () => {
    render(
      <VoiceReviewDialog
        kind="LEAD"
        onKindChange={() => {}}
        loading={false}
        result={draftResult}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'בדיקה וסגירה' })).toBeInTheDocument();
  });

  it('pre-fills extracted LEAD fields', () => {
    render(
      <VoiceReviewDialog
        kind="LEAD"
        onKindChange={() => {}}
        loading={false}
        result={draftResult}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    expect(screen.getByLabelText('שם הלקוח')).toHaveValue('יוסי');
    expect(screen.getByLabelText('עיר')).toHaveValue('תל אביב');
  });

  it('shows skeleton rows while loading', () => {
    render(
      <VoiceReviewDialog
        kind="LEAD"
        onKindChange={() => {}}
        loading={true}
        result={null}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    // Skeletons are under aria-busy blocks.
    expect(screen.getByLabelText('טוען תמלול')).toBeInTheDocument();
    expect(screen.getByLabelText('טוען שדות')).toBeInTheDocument();
  });

  it('Escape closes the dialog via onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <VoiceReviewDialog
        kind="LEAD"
        onKindChange={() => {}}
        loading={false}
        result={draftResult}
        onClose={onClose}
        onCreated={() => {}}
      />,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('kind Segmented tab fires onKindChange when user picks נכס', async () => {
    const onKindChange = vi.fn();
    const user = userEvent.setup();
    render(
      <VoiceReviewDialog
        kind="LEAD"
        onKindChange={onKindChange}
        loading={false}
        result={draftResult}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'נכס' }));
    expect(onKindChange).toHaveBeenCalledWith('PROPERTY');
  });

  it('Save in draft mode calls createLead and passes the entity to onCreated', async () => {
    server.use(
      http.post('/api/leads', async ({ request }) => {
        const body = await request.json().catch(() => ({})) as any;
        return HttpResponse.json({
          lead: { id: 'lead-99', name: body?.name || 'x' },
        });
      }),
    );
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(
      <VoiceReviewDialog
        kind="LEAD"
        onKindChange={() => {}}
        loading={false}
        result={draftResult}
        onClose={() => {}}
        onCreated={onCreated}
      />,
    );
    await user.click(screen.getByRole('button', { name: /שמור/ }));
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'lead-99' }));
    });
  });

  it('Save in created mode short-circuits and does not POST', async () => {
    let posted = false;
    server.use(
      http.post('/api/leads', () => {
        posted = true;
        return HttpResponse.json({ lead: { id: 'new' } });
      }),
    );
    const createdResult = {
      transcript: 'hi',
      extracted: { name: 'x' },
      mode: 'created' as const,
      created: { id: 'existing-42', name: 'x' },
      traceId: 't-2',
    };
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(
      <VoiceReviewDialog
        kind="LEAD"
        onKindChange={() => {}}
        loading={false}
        result={createdResult}
        onClose={() => {}}
        onCreated={onCreated}
      />,
    );
    await user.click(screen.getByRole('button', { name: /שמור/ }));
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'existing-42' }));
    expect(posted).toBe(false);
  });

  it('transcript toggles into an editable textarea', async () => {
    const user = userEvent.setup();
    render(
      <VoiceReviewDialog
        kind="LEAD"
        onKindChange={() => {}}
        loading={false}
        result={draftResult}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /ערוך תמלול/ }));
    const ta = screen.getByLabelText('תמלול') as HTMLTextAreaElement;
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta.value).toContain('יוסי');
  });
});
