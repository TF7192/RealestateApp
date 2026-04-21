import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import CustomerFiltersPanel from '@estia/frontend/components/CustomerFiltersPanel.jsx';

function baseProps(overrides = {}) {
  return {
    open: true,
    filters: {},
    onApply: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('<CustomerFiltersPanel>', () => {
  it('renders nothing visible when open=false', () => {
    render(<CustomerFiltersPanel {...baseProps({ open: false })} />);
    // No dialog in the document — the panel portals out to body when open.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.cfp-backdrop')).toBeNull();
  });

  it('renders a modal dialog with aria-modal=true and an accessible title', () => {
    render(<CustomerFiltersPanel {...baseProps()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('סינון מתקדם')).toBeInTheDocument();
  });

  it('closes on Escape (focus trap + onClose)', async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    render(<CustomerFiltersPanel {...baseProps({ onClose })} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the backdrop is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    render(<CustomerFiltersPanel {...baseProps({ onClose })} />);
    const backdrop = document.querySelector('.cfp-backdrop');
    expect(backdrop).toBeTruthy();
    await user.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('applies the assembled filter object when the primary button is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const onApply = vi.fn();
    render(<CustomerFiltersPanel {...baseProps({ onApply })} />);
    // Toggle the "חם" (hot) chip under the lead-heat group.
    await user.click(screen.getByRole('button', { name: /^חם$/ }));
    // And flip a boolean requirement — "מעלית חובה".
    await user.click(screen.getByRole('button', { name: /מעלית/ }));
    // Submit.
    await user.click(screen.getByRole('button', { name: /החל סינון/ }));
    expect(onApply).toHaveBeenCalled();
    const next = onApply.mock.calls[0][0];
    expect(next.heat).toEqual(['HOT']);
    expect(next.elevatorRequired).toBe(true);
  });

  it('pre-fills selected chips from the `filters` prop', () => {
    render(
      <CustomerFiltersPanel
        {...baseProps({
          filters: {
            heat: ['WARM'],
            leadStatus: ['NEW'],
            parkingRequired: true,
          },
        })}
      />
    );
    // Buttons for selected chips should carry aria-pressed=true. Using
    // getByRole('button', {pressed: true}) returns only the selected set.
    const pressed = screen.getAllByRole('button', { pressed: true });
    const pressedLabels = pressed.map((b) => b.textContent?.trim());
    expect(pressedLabels).toEqual(expect.arrayContaining(['חמים', 'חדש', 'חניה']));
  });

  it('clears all filters and re-applies when "נקה" is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const onApply = vi.fn();
    render(
      <CustomerFiltersPanel
        {...baseProps({
          filters: { heat: ['HOT'], parkingRequired: true },
          onApply,
        })}
      />
    );
    await user.click(screen.getByRole('button', { name: /^נקה/ }));
    await user.click(screen.getByRole('button', { name: /החל סינון/ }));
    const next = onApply.mock.calls[onApply.mock.calls.length - 1][0];
    expect(next.heat).toBeUndefined();
    expect(next.parkingRequired).toBeUndefined();
  });

  it('loads the tag library and lets the agent tick tags', async () => {
    const user = userEvent.setup({ delay: null });
    server.use(
      http.get('/api/tags', () =>
        HttpResponse.json({
          items: [
            { id: 't1', name: 'VIP',  color: 'red',  scope: 'LEAD' },
            { id: 't2', name: 'חדש', color: 'blue', scope: 'ALL' },
          ],
        })
      )
    );
    const onApply = vi.fn();
    render(<CustomerFiltersPanel {...baseProps({ onApply })} />);
    // The tag chips render async after the /api/tags fetch.
    const tagChip = await screen.findByRole('button', { name: /^VIP$/ });
    await user.click(tagChip);
    await user.click(screen.getByRole('button', { name: /החל סינון/ }));
    const next = onApply.mock.calls[0][0];
    expect(next.tags).toEqual(['t1']);
  });

  it('captures a price range and an elevator requirement together', async () => {
    const user = userEvent.setup({ delay: null });
    const onApply = vi.fn();
    render(<CustomerFiltersPanel {...baseProps({ onApply })} />);
    // The NumberField exposes itself as a textbox.
    const minInput = screen.getByLabelText('תקציב מינימום');
    const maxInput = screen.getByLabelText('תקציב מקסימום');
    await user.type(minInput, '1000000');
    await user.type(maxInput, '2500000');
    await user.click(screen.getByRole('button', { name: /מעלית/ }));
    await user.click(screen.getByRole('button', { name: /החל סינון/ }));
    const next = onApply.mock.calls[0][0];
    expect(next.minPrice).toBe(1000000);
    expect(next.maxPrice).toBe(2500000);
    expect(next.elevatorRequired).toBe(true);
  });
});
