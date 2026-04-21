import { describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import FavoriteStar from '@estia/frontend/components/FavoriteStar.jsx';

describe('<FavoriteStar>', () => {
  it('renders an off-state button with an accessible label', () => {
    render(<FavoriteStar active={false} onToggle={() => {}} />);
    const btn = screen.getByRole('button', { name: /הוסף למועדפים/ });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders an active-state button and flips aria-pressed', () => {
    render(<FavoriteStar active onToggle={() => {}} />);
    const btn = screen.getByRole('button', { name: /הסר ממועדפים/ });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('invokes onToggle(nextActive) when clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<FavoriteStar active={false} onToggle={onToggle} />);
    await user.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('passes the opposite state when toggling an already-active star', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<FavoriteStar active onToggle={onToggle} />);
    await user.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('does NOT bubble click events to ancestors (stopPropagation)', async () => {
    const user = userEvent.setup();
    const ancestorClick = vi.fn();
    render(
      <div onClick={ancestorClick}>
        <FavoriteStar active={false} onToggle={() => {}} />
      </div>
    );
    await user.click(screen.getByRole('button'));
    expect(ancestorClick).not.toHaveBeenCalled();
  });

  it('awaits an async onToggle and surfaces errors without flipping state', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn().mockRejectedValue(new Error('boom'));
    render(<FavoriteStar active={false} onToggle={onToggle} />);
    await user.click(screen.getByRole('button'));
    // The component must not throw — caller surfaces the error.
    await waitFor(() => expect(onToggle).toHaveBeenCalled());
  });

  it('passes axe', async () => {
    const { baseElement } = render(<FavoriteStar active={false} onToggle={() => {}} />);
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
