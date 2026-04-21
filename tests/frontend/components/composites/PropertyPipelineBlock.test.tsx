import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import PropertyPipelineBlock from '@estia/frontend/components/PropertyPipelineBlock.jsx';

describe('<PropertyPipelineBlock>', () => {
  it('renders the Hebrew stage + seriousness labels', () => {
    render(<PropertyPipelineBlock property={{ id: 'p1', stage: 'IN_PROGRESS', sellerSeriousness: 'VERY' }} />);
    const stage = screen.getByLabelText('שלב הנכס') as HTMLSelectElement;
    expect(stage.value).toBe('IN_PROGRESS');
    // Segmented/select labels from the mlsLabels map should render.
    expect(screen.getByRole('option', { name: 'בתהליך' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'חתום — בלעדי' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'מאוד' })).toBeInTheDocument();
  });

  it('controlled mode calls onChange for every field, never saves', async () => {
    const user = userEvent.setup();
    const changes: Array<[string, unknown]> = [];
    const form = {
      stage: 'WATCHING',
      agentCommissionPct: null,
      primaryAgentId: null,
      exclusivityExpire: '',
      sellerSeriousness: 'NONE',
      brokerNotes: '',
    };
    render(<PropertyPipelineBlock form={form} onChange={(k, v) => changes.push([k, v])} />);
    // No save button in controlled mode.
    expect(screen.queryByRole('button', { name: 'שמור' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('שלב הנכס'), 'SIGNED_EXCLUSIVE');
    expect(changes.at(-1)).toEqual(['stage', 'SIGNED_EXCLUSIVE']);
    await user.type(screen.getByLabelText('הערות מתווך'), 'a');
    expect(changes.find(([k]) => k === 'brokerNotes')?.[1]).toBe('a');
  });

  it('inline edit mode saves via api.updateProperty on button click', async () => {
    const user = userEvent.setup();
    let patchBody: unknown = null;
    server.use(
      http.patch('/api/properties/:id', async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ property: { id: 'p1' } });
      })
    );
    let savedCalled = 0;
    render(
      <PropertyPipelineBlock
        property={{ id: 'p1', stage: 'IN_PROGRESS', agentCommissionPct: 2.5, brokerNotes: 'hi', sellerSeriousness: 'MEDIUM' }}
        onSaved={() => { savedCalled += 1; }}
      />
    );
    await user.selectOptions(screen.getByLabelText('שלב הנכס'), 'SIGNED_EXCLUSIVE');
    await user.click(screen.getByRole('button', { name: 'שמור' }));
    await waitFor(() => expect(patchBody).toBeTruthy());
    expect((patchBody as { stage: string }).stage).toBe('SIGNED_EXCLUSIVE');
    expect((patchBody as { sellerSeriousness: string }).sellerSeriousness).toBe('MEDIUM');
    await waitFor(() => expect(savedCalled).toBe(1));
  });

  it('looks up primary agent by email and shows the matched agent', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/transfers/agents/search', () =>
        HttpResponse.json({
          agent: {
            id: 'u2', email: 'partner@estia.app',
            displayName: 'שותף', phone: null, avatarUrl: null, agency: null,
          },
        })
      )
    );
    render(<PropertyPipelineBlock property={{ id: 'p1' }} />);
    const emailInput = screen.getByLabelText('אימייל של הסוכן הראשי');
    await user.type(emailInput, 'partner@estia.app');
    await user.click(screen.getByRole('button', { name: 'חפש' }));
    await waitFor(() => expect(screen.getByText('שותף')).toBeInTheDocument());
  });

  it('renders without axe violations', async () => {
    const { baseElement } = render(
      <PropertyPipelineBlock property={{ id: 'p1', stage: 'WATCHING' }} />
    );
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
