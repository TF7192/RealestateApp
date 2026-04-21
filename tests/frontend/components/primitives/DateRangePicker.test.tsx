import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { useState } from 'react';
import { render, screen, userEvent } from '../../setup/test-utils';
import DateRangePicker from '@estia/frontend/components/DateRangePicker.jsx';

function Harness({ initialFrom = '', initialTo = '' } = {}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  return (
    <>
      <DateRangePicker
        from={from}
        to={to}
        onChange={({ from: f, to: t }) => { setFrom(f); setTo(t); }}
      />
      <output data-testid="from">{from}</output>
      <output data-testid="to">{to}</output>
    </>
  );
}

describe('<DateRangePicker>', () => {
  it('renders both date fields and the four quick-range chips', () => {
    render(<Harness />);
    expect(screen.getByLabelText('מתאריך')).toBeInTheDocument();
    expect(screen.getByLabelText('עד תאריך')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7 ימים' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'חודש' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'רבעון' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'שנה' })).toBeInTheDocument();
  });

  it('clicking a quick-range chip sets both from and to to ISO dates', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '7 ימים' }));
    const from = screen.getByTestId('from').textContent || '';
    const to = screen.getByTestId('to').textContent || '';
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 7 days apart, approximately.
    const fromD = new Date(from + 'T00:00:00');
    const toD = new Date(to + 'T00:00:00');
    const days = Math.round((toD.getTime() - fromD.getTime()) / 86_400_000);
    expect(days).toBe(7);
  });

  it('typing into the "from" field updates state via onChange', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const fromInput = screen.getByLabelText('מתאריך') as HTMLInputElement;
    await user.type(fromInput, '2026-01-15');
    expect(screen.getByTestId('from').textContent).toBe('2026-01-15');
  });

  it('shows a clear button only when a value is present, and clearing resets both', async () => {
    const user = userEvent.setup();
    render(<Harness initialFrom="2026-01-01" initialTo="2026-01-31" />);
    const clearBtn = screen.getByRole('button', { name: 'נקה טווח' });
    await user.click(clearBtn);
    expect(screen.getByTestId('from').textContent).toBe('');
    expect(screen.getByTestId('to').textContent).toBe('');
  });

  it('does not render the clear button when both values are empty', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'נקה טווח' })).toBeNull();
  });

  it('no axe violations', async () => {
    const { container } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
