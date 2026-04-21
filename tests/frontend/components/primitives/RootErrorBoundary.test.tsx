import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, userEvent } from '../../setup/test-utils';
import RootErrorBoundary from '@estia/frontend/components/RootErrorBoundary.jsx';

afterEach(() => { vi.restoreAllMocks(); });

function Exploder(): JSX.Element {
  throw new Error('boom');
}

describe('<RootErrorBoundary>', () => {
  it('renders children in the happy path', () => {
    render(<RootErrorBoundary><div>ok</div></RootErrorBoundary>);
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('renders the fallback UI (משהו השתבש) when a child throws', () => {
    // Silence the expected React error log.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RootErrorBoundary>
        <Exploder />
      </RootErrorBoundary>
    );
    expect(screen.getByRole('heading', { name: 'משהו השתבש' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /רענן את העמוד/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /חזור לדשבורד/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /נסה שוב בלי לרענן/ })).toBeInTheDocument();
  });

  it('"נסה שוב" retries rendering after a reset', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // A child that throws only on the first render, then succeeds after a
    // state flip — simulates "transient exception" recovery.
    let throws = true;
    function Maybe() {
      if (throws) throw new Error('fail');
      return <div>recovered</div>;
    }
    const user = userEvent.setup();
    render(
      <RootErrorBoundary>
        <Maybe />
      </RootErrorBoundary>
    );
    // Flip the flag so the next render succeeds, then click retry.
    throws = false;
    await user.click(screen.getByRole('button', { name: /נסה שוב בלי לרענן/ }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('attempts a PostHog capture when a child throws (if window.posthog exists)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const capture = vi.fn();
    (window as any).posthog = { capture };
    render(
      <RootErrorBoundary>
        <Exploder />
      </RootErrorBoundary>
    );
    expect(capture).toHaveBeenCalledWith(
      'frontend_exception',
      expect.objectContaining({ message: 'boom' })
    );
    delete (window as any).posthog;
  });
});
