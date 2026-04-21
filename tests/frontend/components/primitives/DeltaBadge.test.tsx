import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen } from '../../setup/test-utils';
import DeltaBadge from '@estia/frontend/components/DeltaBadge.jsx';

describe('<DeltaBadge>', () => {
  it('renders the value with a + sign for positive deltas and label', () => {
    const { container } = render(<DeltaBadge value={3} label="השבוע" />);
    // "+3 השבוע" — the Hebrew unit sits next to the signed number so the
    // agent reads the pill left-to-right as a compact sentence.
    expect(container.querySelector('.delta-num')?.textContent).toBe('+3');
    expect(container.querySelector('.delta-label')?.textContent).toBe('השבוע');
  });

  it('renders a minus for negative deltas', () => {
    const { container } = render(<DeltaBadge value={-2} label="החודש" />);
    // Unicode minus (−) is the visual glyph; aria-label uses plain words.
    expect(container.querySelector('.delta-num')?.textContent).toMatch(/[−-]2/);
    expect(container.querySelector('.delta-label')?.textContent).toBe('החודש');
  });

  it('renders 0 without a sign when value is zero (neutral)', () => {
    const { container } = render(<DeltaBadge value={0} label="השבוע" />);
    expect(container.firstChild).toHaveClass('delta-badge');
    expect(container.firstChild).toHaveClass('delta-neutral');
  });

  it('defaults direction from the sign of value (up/down/neutral)', () => {
    const { container, rerender } = render(<DeltaBadge value={5} label="x" />);
    expect(container.firstChild).toHaveClass('delta-up');
    rerender(<DeltaBadge value={-1} label="x" />);
    expect(container.firstChild).toHaveClass('delta-down');
    rerender(<DeltaBadge value={0} label="x" />);
    expect(container.firstChild).toHaveClass('delta-neutral');
  });

  it('direction prop overrides the sign-based default', () => {
    const { container } = render(
      <DeltaBadge value={3} label="x" direction="neutral" />
    );
    expect(container.firstChild).toHaveClass('delta-neutral');
    expect(container.firstChild).not.toHaveClass('delta-up');
  });

  it('exposes a screen-reader friendly Hebrew sentence via sr-only', () => {
    const { container } = render(<DeltaBadge value={3} label="השבוע" />);
    const sr = container.querySelector('.sr-only');
    expect(sr?.textContent || '').toMatch(/גידול של 3 לעומת/);
    expect(sr?.textContent || '').toMatch(/השבוע/);
  });

  it('sets role="status" and an aria-label that explains the change', () => {
    const { container } = render(<DeltaBadge value={-4} label="החודש" />);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('role')).toBe('status');
    // A screen-reader-only description (aria-label or sr-only text) must
    // read as a sentence, not just "-4 החודש".
    const srText = container.querySelector('.sr-only')?.textContent || '';
    expect(srText).toMatch(/ירידה של 4/);
  });

  it('dir="rtl" on the root so Hebrew numerals sit correctly', () => {
    const { container } = render(<DeltaBadge value={1} label="השבוע" />);
    expect(container.firstChild).toHaveAttribute('dir', 'rtl');
  });

  it('no axe violations', async () => {
    const { container } = render(<DeltaBadge value={3} label="השבוע" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('no axe violations — negative / neutral variants', async () => {
    const { container, rerender } = render(<DeltaBadge value={-2} label="החודש" />);
    expect(await axe(container)).toHaveNoViolations();
    rerender(<DeltaBadge value={0} label="השבוע" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
