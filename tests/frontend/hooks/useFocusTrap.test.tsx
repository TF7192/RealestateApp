import { describe, it, expect, afterEach } from 'vitest';
import { useRef } from 'react';
import { render, screen, userEvent, cleanup } from '../setup/test-utils';
// eslint-disable-next-line import/no-relative-packages
import { useFocusTrap } from '@estia/frontend/hooks/useFocusTrap.js';

afterEach(() => cleanup());

function DialogFixture({ onEscape }: { onEscape?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { onEscape });
  return (
    <div>
      <button>before</button>
      <div ref={ref} role="dialog" aria-modal="true">
        <button>first</button>
        <input aria-label="middle" />
        <button>last</button>
      </div>
      <button>after</button>
    </div>
  );
}

async function afterRaf() {
  return new Promise((r) => requestAnimationFrame(() => r(null)));
}

describe('useFocusTrap', () => {
  it('focuses the first focusable element on mount', async () => {
    render(<DialogFixture />);
    await afterRaf();
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('wraps Tab from the last element to the first', async () => {
    const user = userEvent.setup();
    render(<DialogFixture />);
    await afterRaf();

    screen.getByRole('button', { name: 'last' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('wraps Shift+Tab from the first element to the last', async () => {
    const user = userEvent.setup();
    render(<DialogFixture />);
    await afterRaf();

    screen.getByRole('button', { name: 'first' }).focus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'last' })).toHaveFocus();
  });

  it('calls onEscape when Escape is pressed', async () => {
    const user = userEvent.setup();
    let escCount = 0;
    render(<DialogFixture onEscape={() => { escCount += 1; }} />);
    await afterRaf();
    await user.keyboard('{Escape}');
    expect(escCount).toBe(1);
  });
});
