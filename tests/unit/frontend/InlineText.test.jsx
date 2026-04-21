import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineText from '../../../frontend/src/components/InlineText.jsx';

/**
 * F-6 + F-12 regression tests.
 *
 * We test observable behavior (what the user sees and what commit
 * callbacks receive) — not internal state. A future refactor of
 * InlineText's internals won't break these assertions.
 */

describe('<InlineText>', () => {
  it('renders the placeholder when empty and swaps to the value once set', () => {
    const { rerender } = render(
      <InlineText value="" onCommit={() => {}} placeholder="הוסף" />
    );
    expect(screen.getByRole('button')).toHaveTextContent('הוסף');

    rerender(<InlineText value="רוטשילד 45" onCommit={() => {}} placeholder="הוסף" />);
    expect(screen.getByRole('button')).toHaveTextContent('רוטשילד 45');
  });

  it('enters edit mode on click and commits on Enter', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn().mockResolvedValue();
    render(<InlineText value="old" onCommit={onCommit} />);

    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    // RTL + single-line: Enter commits
    await user.clear(input);
    await user.type(input, 'new value{Enter}');

    expect(onCommit).toHaveBeenCalledWith('new value');
  });

  it('Esc cancels the edit without calling onCommit', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineText value="old" onCommit={onCommit} />);
    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    await user.type(input, 'will-not-save{Escape}');
    expect(onCommit).not.toHaveBeenCalled();
    // Back to display mode with original value
    expect(screen.getByRole('button')).toHaveTextContent('old');
  });

  it('F-6: shows a saving indicator while onCommit is in flight', async () => {
    const user = userEvent.setup();
    // A promise we resolve manually so we can assert the in-flight state
    // BEFORE the commit resolves.
    let resolve;
    const pending = new Promise((r) => { resolve = r; });
    const onCommit = vi.fn().mockReturnValue(pending);
    const { container } = render(<InlineText value="a" onCommit={onCommit} />);

    await user.click(screen.getByRole('button'));
    await user.type(screen.getByRole('textbox'), 'b{Enter}');

    // Saving state is reflected via the is-saving class on the display
    // span. Asserting the class here is acceptable: it's the component's
    // public contract (callers style against it).
    expect(container.querySelector('.inline-text.is-saving')).toBeTruthy();

    resolve();
    await pending;
  });

  it('F-12: honors dir="auto" when the caller asks for it', () => {
    const { container } = render(
      <InlineText value="hello שלום" onCommit={() => {}} multiline dir="auto" />
    );
    const span = container.querySelector('.inline-text');
    expect(span.getAttribute('dir')).toBe('auto');
  });

  it('reverts to the old value if the commit promise rejects', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn().mockRejectedValue(new Error('server said no'));
    render(<InlineText value="old" onCommit={onCommit} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByRole('textbox'), 'new{Enter}');
    // After rejection we fall back to display-mode and the original value
    await screen.findByRole('button');
    expect(screen.getByRole('button')).toHaveTextContent('old');
  });
});
