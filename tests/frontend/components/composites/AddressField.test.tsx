import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import AddressField from '@estia/frontend/components/AddressField.jsx';

// The AddressField already handles the street typeahead via Photon; the
// G1 addition is an optional `neighborhood` value + `onNeighborhoodChange`
// callback that fires a second suggestions list from /api/neighborhoods,
// scoped to the city on the component. Only exercised when the parent
// opts in by rendering a secondary field (a new "שכונה" input the picker
// surfaces beneath the street box).

function Harness({ city = 'תל אביב' }: { city?: string }) {
  const [val, setVal] = useState('');
  const [nb, setNb] = useState('');
  return (
    <AddressField
      value={val}
      onChange={setVal}
      city={city}
      neighborhood={nb}
      onNeighborhoodChange={setNb}
      showNeighborhood
      aria-label="כתובת"
    />
  );
}

describe('<AddressField> neighborhood autocomplete', () => {
  it('does not fetch neighborhoods when no city is set', async () => {
    let called = false;
    server.use(
      http.get('/api/neighborhoods', () => {
        called = true;
        return HttpResponse.json({ items: [] });
      }),
    );
    const { rerender } = render(
      <AddressField
        value=""
        onChange={() => {}}
        neighborhood=""
        onNeighborhoodChange={() => {}}
        showNeighborhood
        aria-label="כתובת"
      />
    );
    // No city prop at all — neighborhood input is there but disabled.
    const nbInput = screen.getByLabelText('שכונה') as HTMLInputElement;
    expect(nbInput).toBeDisabled();
    // Re-render passing an empty string city — still disabled, still no call.
    rerender(
      <AddressField
        value=""
        onChange={() => {}}
        city=""
        neighborhood=""
        onNeighborhoodChange={() => {}}
        showNeighborhood
        aria-label="כתובת"
      />
    );
    expect(screen.getByLabelText('שכונה')).toBeDisabled();
    await new Promise((r) => setTimeout(r, 250));
    expect(called).toBe(false);
  });

  it('fires the neighborhood fetch only after a city is set + user types', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/neighborhoods', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('city')).toBe('תל אביב');
        return HttpResponse.json({
          items: [
            { id: 'n1', city: 'תל אביב', name: 'פלורנטין', aliases: [] },
          ],
        });
      }),
    );
    render(<Harness />);
    const nbInput = screen.getByLabelText('שכונה');
    expect(nbInput).not.toBeDisabled();
    await user.type(nbInput, 'פלו');
    // Suggestions list appears.
    expect(
      await screen.findByRole('option', { name: /פלורנטין/ }, { timeout: 2000 })
    ).toBeInTheDocument();
  });

  it('commits the picked neighborhood via onNeighborhoodChange', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/neighborhoods', () =>
        HttpResponse.json({
          items: [{ id: 'n1', city: 'תל אביב', name: 'פלורנטין', aliases: [] }],
        })
      ),
    );
    const onNeighborhoodChange = vi.fn();
    render(
      <AddressField
        value=""
        onChange={() => {}}
        city="תל אביב"
        neighborhood=""
        onNeighborhoodChange={onNeighborhoodChange}
        showNeighborhood
        aria-label="כתובת"
      />
    );
    const nbInput = screen.getByLabelText('שכונה');
    await user.type(nbInput, 'פלו');
    const option = await screen.findByRole('option', { name: /פלורנטין/ });
    await user.click(option);
    expect(onNeighborhoodChange).toHaveBeenLastCalledWith('פלורנטין');
  });

  it('keeps free-text input when the user ignores suggestions', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/neighborhoods', () => HttpResponse.json({ items: [] })),
    );
    const onNeighborhoodChange = vi.fn();
    render(
      <AddressField
        value=""
        onChange={() => {}}
        city="תל אביב"
        neighborhood=""
        onNeighborhoodChange={onNeighborhoodChange}
        showNeighborhood
        aria-label="כתובת"
      />
    );
    const nbInput = screen.getByLabelText('שכונה');
    await user.type(nbInput, 'שכונה חדשה');
    await waitFor(() => {
      expect((nbInput as HTMLInputElement).value).toBe('שכונה חדשה');
    });
    // Free text propagates via onNeighborhoodChange as the user types
    // — the parent stores it even without a suggestion pick.
    expect(onNeighborhoodChange).toHaveBeenCalledWith('שכונה חדשה');
  });

  it('still works when showNeighborhood is not passed — no regression for existing callers', () => {
    // This is the existing contract: AddressField with no neighborhood
    // props still renders its street input and nothing else.
    render(
      <AddressField
        value=""
        onChange={() => {}}
        city="תל אביב"
        aria-label="כתובת"
      />
    );
    expect(screen.queryByLabelText('שכונה')).toBeNull();
    // Street input is present as always.
    expect(screen.getByLabelText('כתובת')).toBeInTheDocument();
  });
});
