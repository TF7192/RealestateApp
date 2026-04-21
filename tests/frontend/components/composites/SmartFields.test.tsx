import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { axe } from 'vitest-axe';
import { render, screen, userEvent } from '../../setup/test-utils';
import {
  NumberField,
  PhoneField,
  SelectField,
  Segmented,
  PriceRange,
} from '@estia/frontend/components/SmartFields.jsx';

// Controlled-input wrappers: the app components only render correctly
// when the parent re-renders with the new value. Wrapping in a stateful
// harness mirrors real-world usage and lets userEvent drive them.
function NumberHarness(props: any) {
  const [v, setV] = useState<number | null>(props.initial ?? null);
  return <NumberField {...props} value={v} onChange={(n: number | null) => { setV(n); props.onChange?.(n); }} />;
}
function PhoneHarness(props: any) {
  const [v, setV] = useState<string>(props.initial ?? '');
  return <PhoneField {...props} value={v} onChange={(x: string) => { setV(x); props.onChange?.(x); }} />;
}

describe('<NumberField>', () => {
  it('renders formatted display value', () => {
    render(<NumberField value={2500000} onChange={() => {}} aria-label="price" />);
    const input = screen.getByLabelText('price') as HTMLInputElement;
    expect(input.value).toBe('2,500,000');
  });

  it('typing digits fires onChange with the parsed integer', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberHarness onChange={onChange} aria-label="n" />);
    await user.type(screen.getByLabelText('n'), '123');
    expect(onChange).toHaveBeenLastCalledWith(123);
  });

  it('expands "2m" shorthand on the fly', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberHarness onChange={onChange} aria-label="n" />);
    await user.type(screen.getByLabelText('n'), '2m');
    expect(onChange).toHaveBeenLastCalledWith(2_000_000);
  });

  it('expands "1.5m" shorthand when pasted as a whole (decimal drops during live typing)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberHarness onChange={onChange} aria-label="n" />);
    const input = screen.getByLabelText('n');
    await user.click(input);
    await user.paste('1.5m');
    expect(onChange).toHaveBeenLastCalledWith(1_500_000);
  });

  it('expands "850k" shorthand', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberHarness onChange={onChange} aria-label="n" />);
    await user.type(screen.getByLabelText('n'), '850k');
    expect(onChange).toHaveBeenLastCalledWith(850_000);
  });

  it('clamps to max', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberHarness onChange={onChange} max={100} aria-label="n" />);
    await user.type(screen.getByLabelText('n'), '999');
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it('clears to null when input is emptied', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberHarness initial={1000} onChange={onChange} aria-label="n" />);
    const input = screen.getByLabelText('n') as HTMLInputElement;
    await user.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('no axe violations', async () => {
    const { container } = render(<NumberField value={1000} onChange={() => {}} aria-label="price" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('<PhoneField>', () => {
  it('formats raw digits as the user types (10 digits → "050-1234567")', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PhoneHarness onChange={onChange} aria-label="phone" />);
    await user.type(screen.getByLabelText('phone'), '0501234567');
    expect(onChange).toHaveBeenLastCalledWith('050-1234567');
  });

  it('shows the "valid" state for a complete Israeli number', () => {
    const { container } = render(
      <PhoneField value="050-1234567" onChange={() => {}} aria-label="p" />
    );
    expect(container.querySelector('.sf-valid')).toBeTruthy();
  });

  it('shows the "invalid" state once enough digits are typed but the prefix is wrong', () => {
    const { container } = render(
      <PhoneField value="123-4567890" onChange={() => {}} aria-label="p" />
    );
    expect(container.querySelector('.sf-invalid')).toBeTruthy();
  });

  it('dir="ltr" on the input so the number reads left-to-right in RTL pages', () => {
    render(<PhoneField value="" onChange={() => {}} aria-label="p" />);
    expect(screen.getByLabelText('p')).toHaveAttribute('dir', 'ltr');
  });
});

describe('<SelectField>', () => {
  it('renders the placeholder as a disabled first option', () => {
    const { container } = render(
      <SelectField
        value=""
        onChange={() => {}}
        placeholder="בחר…"
        options={['a', 'b']}
        aria-label="select"
      />
    );
    const placeholderOpt = container.querySelector('option[disabled]');
    expect(placeholderOpt?.textContent).toBe('בחר…');
  });

  it('supports grouped options via the `groups` prop', () => {
    const { container } = render(
      <SelectField
        value=""
        onChange={() => {}}
        groups={[
          { label: 'G1', options: ['a', 'b'] },
          { label: 'G2', options: [{ value: 'x', label: 'X' }] },
        ]}
        aria-label="grouped"
      />
    );
    expect(container.querySelectorAll('optgroup')).toHaveLength(2);
  });

  it('onChange fires with the chosen value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SelectField value="a" onChange={onChange} options={['a', 'b', 'c']} aria-label="s" />
    );
    await user.selectOptions(screen.getByLabelText('s'), 'b');
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('<Segmented>', () => {
  const opts = [
    { value: 'BUY',  label: 'קנייה' },
    { value: 'RENT', label: 'שכירות' },
  ];

  it('renders as a radiogroup with aria-checked on the selected option', () => {
    render(<Segmented value="BUY" onChange={() => {}} options={opts} ariaLabel="type" />);
    const group = screen.getByRole('radiogroup', { name: 'type' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'קנייה' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'שכירות' })).toHaveAttribute('aria-checked', 'false');
  });

  it('onChange fires with the clicked value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Segmented value="BUY" onChange={onChange} options={opts} ariaLabel="t" />);
    await user.click(screen.getByRole('radio', { name: 'שכירות' }));
    expect(onChange).toHaveBeenCalledWith('RENT');
  });

  it('no axe violations', async () => {
    const { container } = render(
      <Segmented value="BUY" onChange={() => {}} options={opts} ariaLabel="type" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('<PriceRange>', () => {
  it('shows a Hebrew summary under the min/max pair', () => {
    render(
      <PriceRange
        minVal={1_500_000}
        maxVal={2_200_000}
        onChangeMin={() => {}}
        onChangeMax={() => {}}
      />
    );
    expect(screen.getByText(/₪1\.5M\s*—\s*₪2\.2M/)).toBeInTheDocument();
  });

  it('renders "/חודש" suffix when perMonth=true', () => {
    render(
      <PriceRange
        minVal={5000}
        maxVal={8000}
        onChangeMin={() => {}}
        onChangeMax={() => {}}
        perMonth
      />
    );
    expect(screen.getByText(/חודש/)).toBeInTheDocument();
  });
});
