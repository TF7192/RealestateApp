import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent, act } from '../../setup/test-utils';

// Stub the scan store so we can drive the banner's state from the test.
let currentState: any;
const listeners = new Set<(s: any) => void>();
vi.mock('@estia/frontend/lib/yad2ScanStore.js', () => ({
  getScanState: () => currentState,
  subscribeScan: (fn: any) => { listeners.add(fn); return () => listeners.delete(fn); },
}));

function setState(next: any) {
  currentState = next;
  listeners.forEach((fn) => fn(currentState));
}

import Yad2ScanBanner from '@estia/frontend/components/Yad2ScanBanner.jsx';

beforeEach(() => {
  listeners.clear();
  currentState = {
    status: 'idle', url: null, startedAt: null, finishedAt: null,
    result: null, error: null, quota: null,
  };
});

describe('<Yad2ScanBanner>', () => {
  it('renders nothing when status is idle', () => {
    const { container } = render(<Yad2ScanBanner />);
    expect(container.querySelector('.y2b')).toBeNull();
  });

  it('renders the running banner while a scan is in flight', () => {
    currentState = { ...currentState, status: 'running', url: 'u' };
    render(<Yad2ScanBanner />);
    expect(screen.getByText(/סריקת Yad2 פעילה/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /סריקה פעילה/ })).toBeInTheDocument();
  });

  it('renders the done banner with the listings count', () => {
    currentState = {
      ...currentState, status: 'done',
      result: { listings: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    };
    render(<Yad2ScanBanner />);
    expect(screen.getByText(/הסריקה הסתיימה — 3 נכסים/)).toBeInTheDocument();
  });

  it('renders the error banner with the error message', () => {
    currentState = { ...currentState, status: 'error', error: 'WAF said no' };
    render(<Yad2ScanBanner />);
    expect(screen.getByText(/הסריקה נכשלה/)).toBeInTheDocument();
    expect(screen.getByText(/WAF said no/)).toBeInTheDocument();
  });

  it('reacts to store updates — idle → running → done', () => {
    const { container } = render(<Yad2ScanBanner />);
    expect(container.querySelector('.y2b')).toBeNull();

    act(() => setState({ ...currentState, status: 'running' }));
    expect(screen.getByText(/סריקת Yad2 פעילה/)).toBeInTheDocument();

    act(() => setState({ status: 'done', result: { listings: [{}] }, error: null }));
    expect(screen.getByText(/הסריקה הסתיימה — 1 נכסים/)).toBeInTheDocument();
  });

  it('clicking the X dismisses the done banner', async () => {
    const user = userEvent.setup();
    currentState = {
      ...currentState, status: 'done', result: { listings: [{}] },
    };
    const { container } = render(<Yad2ScanBanner />);
    await user.click(screen.getByRole('button', { name: 'סגור' }));
    expect(container.querySelector('.y2b')).toBeNull();
  });
});
