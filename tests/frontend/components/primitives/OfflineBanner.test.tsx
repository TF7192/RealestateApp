import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '../../setup/test-utils';
import OfflineBanner from '@estia/frontend/components/OfflineBanner.jsx';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function setOnline(v: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });
  window.dispatchEvent(new Event(v ? 'online' : 'offline'));
}

describe('<OfflineBanner>', () => {
  it('renders nothing when online and never has been offline', () => {
    setOnline(true);
    const { container } = render(<OfflineBanner />);
    expect(container.querySelector('.offbanner')).toBeNull();
  });

  it('shows the offline copy when navigator goes offline', () => {
    setOnline(true);
    const { container, getByText } = render(<OfflineBanner />);
    act(() => setOnline(false));
    expect(container.querySelector('.offbanner-off')).toBeTruthy();
    expect(getByText(/אין חיבור/)).toBeInTheDocument();
  });

  it('shows the reconnect copy briefly after coming back online', () => {
    vi.useFakeTimers();
    setOnline(true);
    const { container, queryByText } = render(<OfflineBanner />);
    act(() => setOnline(false));
    act(() => setOnline(true));
    expect(container.querySelector('.offbanner-on')).toBeTruthy();
    expect(queryByText(/חזרה לרשת/)).toBeInTheDocument();
    // Disappears after ~2.8s.
    act(() => { vi.advanceTimersByTime(3000); });
    expect(container.querySelector('.offbanner')).toBeNull();
  });
});
