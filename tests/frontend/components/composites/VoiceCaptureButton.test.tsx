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

  it('click starts recording; aria-pressed flips true', async () => {
    const user = userEvent.setup();
    render(<VoiceCaptureButton kind="LEAD" onExtracted={() => {}} />);
    const trigger = screen.getByRole('button', { name: /ליד/ });
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'עצור הקלטה' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('after stop, opens review dialog and the extracted name appears', async () => {
    const user = userEvent.setup();
    render(<VoiceCaptureButton kind="LEAD" onExtracted={() => {}} />);
    await user.click(screen.getByRole('button', { name: /ליד/ }));
    await user.click(await screen.findByRole('button', { name: 'עצור הקלטה' }));
    await screen.findByRole('dialog');
    await waitFor(() => {
      expect(screen.getByLabelText('שם הלקוח')).toHaveValue('רות');
    });
  });

  it('dismissing the dialog forwards the extracted payload to onExtracted', async () => {
    const onExtracted = vi.fn();
    const user = userEvent.setup();
    render(<VoiceCaptureButton kind="LEAD" onExtracted={onExtracted} />);
    await user.click(screen.getByRole('button', { name: /ליד/ }));
    await user.click(await screen.findByRole('button', { name: 'עצור הקלטה' }));
    await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByLabelText('שם הלקוח')).toHaveValue('רות'));
    await user.click(screen.getByRole('button', { name: 'בטל' }));
    expect(onExtracted).toHaveBeenCalledWith(expect.objectContaining({ name: 'רות' }));
  });
});
