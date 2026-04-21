import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import NeighborhoodPicker from '@estia/frontend/components/NeighborhoodPicker.jsx';

// Stateful harness so we can assert onChange in isolation while still
// letting the picker re-render with its new `value` on each mutation.
function Harness({
  city,
  initial = [],
  onChange,
  placeholder,
}: {
  city: string;
  initial?: string[];
  onChange?: (v: string[]) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <NeighborhoodPicker
      city={city}
      value={value}
      onChange={(next: string[]) => { setValue(next); onChange?.(next); }}
      placeholder={placeholder}
    />
  );
}

describe('<NeighborhoodPicker>', () => {
  it('disables the input and shows a prompt when no city is set', () => {
    render(<NeighborhoodPicker city="" value={[]} onChange={() => {}} />);
    const input = screen.getByRole('combobox');
    expect(input).toBeDisabled();
    // The prompt copy is Hebrew — "בחר עיר תחילה".
    expect(input).toHaveAttribute('placeholder', expect.stringContaining('עיר'));
  });

  it('shows suggestions after typing and inserts a chip on select', async () => {
    server.use(
      http.get('/api/neighborhoods', () =>
        HttpResponse.json({
          items: [
            { id: 'n1', city: 'תל אביב', name: 'פלורנטין', aliases: [] },
            { id: 'n2', city: 'תל אביב', name: 'לב העיר',  aliases: [] },
          ],
        })
      ),
    );
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness city="תל אביב" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'פלו');
    // Suggestions appear (debounced 200ms).
    const option = await screen.findByRole('option', { name: /פלורנטין/ }, { timeout: 2000 });
    await user.click(option);
    expect(onChange).toHaveBeenLastCalledWith(['פלורנטין']);
    // The chip renders the selected value.
    expect(screen.getByText('פלורנטין')).toBeInTheDocument();
  });

  it('supports multi-select — accumulates chips and prevents duplicates', async () => {
    server.use(
      http.get('/api/neighborhoods', ({ request }) => {
        const url = new URL(request.url);
        const s = url.searchParams.get('search') || '';
        const catalog = [
          { id: 'n1', city: 'תל אביב', name: 'פלורנטין', aliases: [] },
          { id: 'n2', city: 'תל אביב', name: 'לב העיר', aliases: [] },
          { id: 'n3', city: 'תל אביב', name: 'נווה צדק', aliases: [] },
        ];
        return HttpResponse.json({
          items: catalog.filter((x) => !s || x.name.includes(s)),
        });
      }),
    );
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness city="תל אביב" onChange={onChange} />);
    const input = screen.getByRole('combobox');

    await user.type(input, 'פלו');
    const florentin = await screen.findByRole('option', { name: /פלורנטין/ });
    await user.click(florentin);

    // Clear + type for the second selection.
    await user.clear(input);
    await user.type(input, 'נווה');
    const neve = await screen.findByRole('option', { name: /נווה צדק/ });
    await user.click(neve);

    expect(onChange).toHaveBeenLastCalledWith(['פלורנטין', 'נווה צדק']);
    expect(screen.getByText('פלורנטין')).toBeInTheDocument();
    expect(screen.getByText('נווה צדק')).toBeInTheDocument();

    // Already-picked values must not re-appear in the suggestions list.
    await user.clear(input);
    await user.type(input, 'פלו');
    // After the debounce settles, no option should be offered for
    // פלורנטין because it's already selected.
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: /פלורנטין/ })).toBeNull();
    });
    // And the current selection should still contain exactly one of it.
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.filter((x: string) => x === 'פלורנטין')).toHaveLength(1);
  });

  it('removes a chip when the remove button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Harness
        city="תל אביב"
        initial={['פלורנטין', 'לב העיר']}
        onChange={onChange}
      />
    );
    const removeBtn = screen.getByRole('button', { name: /הסר.*פלורנטין/ });
    await user.click(removeBtn);
    expect(onChange).toHaveBeenLastCalledWith(['לב העיר']);
  });

  it('falls back to adding free-text on Enter when the user bypasses suggestions', async () => {
    // If the agent types a neighborhood that isn't in our catalog, hitting
    // Enter should still accept it. Prevents the picker from being a gate.
    server.use(
      http.get('/api/neighborhoods', () => HttpResponse.json({ items: [] })),
    );
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness city="תל אביב" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'שכונה חדשה');
    // Wait for debounce to settle and the empty result to render.
    await waitFor(() => {
      expect(input).toHaveValue('שכונה חדשה');
    });
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['שכונה חדשה']);
  });

  it('has no accessibility violations on initial render', async () => {
    const { container } = render(
      <NeighborhoodPicker
        city="תל אביב"
        value={['פלורנטין']}
        onChange={() => {}}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
