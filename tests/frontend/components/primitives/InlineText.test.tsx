import { describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, userEvent } from '../../setup/test-utils';
import InlineText from '@estia/frontend/components/InlineText.jsx';

describe('<InlineText>', () => {
  it('shows the placeholder when empty and swaps to the value', () => {
    const { rerender } = render(
      <InlineText value="" onCommit={() => {}} placeholder="הוסף" />
    );
    expect(screen.getByRole('button')).toHaveTextContent('הוסף');
    rerender(<InlineText value="רוטשילד 45" onCommit={() => {}} placeholder="הוסף" />);
    expect(screen.getByRole('button')).toHaveTextContent('רוטשילד 45');
  });

  it('Enter commits a single-line edit', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<InlineText value="old" onCommit={onCommit} />);
    await user.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'new value{Enter}');
    expect(onCommit).toHaveBeenCalledWith('new value');
  });

  it('Esc cancels', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineText value="old" onCommit={onCommit} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByRole('textbox'), 'nope{Escape}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveTextContent('old');
  });

  it('blur reverts (S17)', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <>
        <InlineText value="old" onCommit={onCommit} />
        <button>sink</button>
      </>
    );
    await user.click(screen.getAllByRole('button')[0]);
    await user.type(screen.getByRole('textbox'), 'maybe');
    await user.click(screen.getByRole('button', { name: 'sink' }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('F-6 saving indicator while onCommit is in-flight', async () => {
    const user = userEvent.setup();
    let resolve: () => void;
    const pending = new Promise<void>((r) => { resolve = r; });
    const onCommit = vi.fn().mockReturnValue(pending);
    const { container } = render(<InlineText value="a" onCommit={onCommit} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByRole('textbox'), 'b{Enter}');
    expect(container.querySelector('.inline-text.is-saving')).toBeTruthy();
    resolve!();
    await pending;
  });

  it('F-12 honours dir="auto"', () => {
    const { container } = render(
      <InlineText value="hello שלום" onCommit={() => {}} multiline dir="auto" />
    );
    expect(container.querySelector('.inline-text')?.getAttribute('dir')).toBe('auto');
  });

  it('reverts to the previous value when onCommit rejects', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn().mockRejectedValue(new Error('server said no'));
    render(<InlineText value="old" onCommit={onCommit} />);
    await user.click(screen.getByRole('button'));
    await user.type(screen.getByRole('textbox'), 'new{Enter}');
    await screen.findByRole('button');
    expect(screen.getByRole('button')).toHaveTextContent('old');
  });

  it('no axe violations', async () => {
    const { container } = render(<InlineText value="x" onCommit={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
