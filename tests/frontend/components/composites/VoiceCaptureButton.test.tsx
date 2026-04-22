// H3 — VoiceCaptureButton tests.
//
// Inline variant of the voice flow. Unlike the FAB, this one hands
// the extracted JSON back to the caller so NewLead / NewProperty
// can hydrate their own form state.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import VoiceCaptureButton from '@estia/frontend/components/VoiceCaptureButton.jsx';

let getUserMediaImpl: (c: any) => Promise<any>;

class MockMediaRecorder {
  static isTypeSupported = () => true;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  mimeType = 'audio/webm';
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

beforeEach(() => {
  const stream = { getTracks: () => [{ stop: vi.fn() }] };
  getUserMediaImpl = vi.fn(async () => stream);
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: (c: any) => getUserMediaImpl(c) },
  });
  (globalThis as any).MediaRecorder = MockMediaRecorder;

  server.use(
    http.post('/api/ai/voice-lead', () =>
      HttpResponse.json({
        transcript: 'ליד חדש',
        extracted: { name: 'רות', phone: '050-9999999', city: 'רמת גן' },
        mode: 'draft',
        traceId: 't-1',
      })
    ),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).MediaRecorder;
  // @ts-expect-error reset
  delete globalThis.navigator.mediaDevices;
});

describe('<VoiceCaptureButton>', () => {
  it('renders a LEAD-labeled trigger when kind="LEAD"', () => {
    render(<VoiceCaptureButton kind="LEAD" onExtracted={() => {}} />);
    expect(screen.getByRole('button', { name: /ליד/ })).toBeInTheDocument();
  });

  it('renders a PROPERTY-labeled trigger when kind="PROPERTY"', () => {
    render(<VoiceCaptureButton kind="PROPERTY" onExtracted={() => {}} />);
    expect(screen.getByRole('button', { name: /נכס/ })).toBeInTheDocument();
  });

  // N-16 — recording no longer starts on click. The inline voice button
  // is gated by the same "פיצ׳ר פרימיום" dialog as the floating mic FAB,
  // so agents on non-premium plans never reach the AI extraction endpoint
  // until product flips their flag. The original happy-path specs that
  // walked start → stop → review-dialog are obsolete — we keep the
  // "label reflects the kind prop" pieces plus the gate assertion.
  it('N-16 — first click opens the premium-gate dialog instead of recording', async () => {
    const user = userEvent.setup();
    render(<VoiceCaptureButton kind="LEAD" onExtracted={() => {}} />);
    const trigger = screen.getByRole('button', { name: /ליד/ });
    await user.click(trigger);
    expect(await screen.findByText(/פיצ׳ר פרימיום/)).toBeInTheDocument();
  });

  it('N-16 — gate works on PROPERTY kind too', async () => {
    const user = userEvent.setup();
    render(<VoiceCaptureButton kind="PROPERTY" onExtracted={() => {}} />);
    await user.click(screen.getByRole('button', { name: /נכס/ }));
    expect(await screen.findByText(/פיצ׳ר פרימיום/)).toBeInTheDocument();
  });

  it('N-16 — the gate never forwards anything to onExtracted', async () => {
    const onExtracted = vi.fn();
    const user = userEvent.setup();
    render(<VoiceCaptureButton kind="LEAD" onExtracted={onExtracted} />);
    await user.click(screen.getByRole('button', { name: /ליד/ }));
    await screen.findByText(/פיצ׳ר פרימיום/);
    // The AI-extraction path must stay unreachable while the gate is up.
    expect(onExtracted).not.toHaveBeenCalled();
  });
});
