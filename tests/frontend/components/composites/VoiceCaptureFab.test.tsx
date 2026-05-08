// H3 — VoiceCaptureFab tests.
//
// Exercises:
//   1. Renders a visible mic button with the Hebrew aria-label.
//   2. Hidden on login / public portals / agent catalog routes.
//   3. First click starts recording (is-recording class + aria-pressed).
//   4. Second click stops and opens the review dialog.
//   5. Permission denial surfaces a toast; FAB stays in idle state.
//
// MediaRecorder + getUserMedia are mocked on globalThis at module scope
// so the hook's state machine executes as-is.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, userEvent, waitFor } from '../../setup/test-utils';
import { server } from '../../setup/msw-server';
import VoiceCaptureFab from '@estia/frontend/components/VoiceCaptureFab.jsx';

let getUserMediaImpl: (c: any) => Promise<any>;
let lastRecorder: any;

class MockMediaRecorder {
  static isTypeSupported = (_m: string) => true;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  mimeType: string;
  constructor(_s: any, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType || 'audio/webm';
    lastRecorder = this;
  }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

beforeEach(() => {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  getUserMediaImpl = vi.fn(async () => stream);
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: (c: any) => getUserMediaImpl(c) },
  });
  (globalThis as any).MediaRecorder = MockMediaRecorder;

  // Default voice-lead handler returns a LEAD draft — the dialog then
  // renders the extracted fields so the user can confirm.
  server.use(
    http.post('/api/ai/voice-lead', () =>
      HttpResponse.json({
        transcript: 'יוסי צריך דירת 4 חדרים בתל אביב עד 3 מיליון',
        extracted: { name: 'יוסי', city: 'תל אביב', roomsMin: 4, priceMax: 3000000 },
        mode: 'draft',
        traceId: 't-1',
      })
    ),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).MediaRecorder;
  // @ts-expect-error — reset mediaDevices between tests
  delete globalThis.navigator.mediaDevices;
});

describe('<VoiceCaptureFab>', () => {
  it('renders a mic trigger on the dashboard', () => {
    render(<VoiceCaptureFab />, { route: '/' });
    expect(screen.getByRole('button', { name: 'הקלטת מתעניין' })).toBeInTheDocument();
  });

  it('is hidden on /login', () => {
    render(<VoiceCaptureFab />, { route: '/login' });
    expect(screen.queryByRole('button', { name: /הקלטת/ })).not.toBeInTheDocument();
  });

  it('is hidden on public agent portal routes', () => {
    render(<VoiceCaptureFab />, { route: '/agents/some-slug' });
    expect(screen.queryByRole('button', { name: /הקלטת/ })).not.toBeInTheDocument();
  });

  it('first click starts recording; aria-pressed flips true', async () => {
    const user = userEvent.setup();
    render(<VoiceCaptureFab />, { route: '/' });
    const trigger = screen.getByRole('button', { name: 'הקלטת מתעניין' });
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'עצור הקלטה' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('second click stops and opens the premium-gate dialog (free tier)', async () => {
    // VC-6 (frontend/src/components/VoiceCaptureFab.jsx:64-74) — voice
    // extraction was moved behind the premium gate. When recording
    // finishes the FAB opens a "פיצ׳ר פרימיום" ConfirmDialog instead
    // of uploading to the AI endpoint. The full review-dialog flow
    // (with extracted-field inputs) is now exercised end-to-end only
    // for premium users; this test covers the free-tier path.
    const user = userEvent.setup();
    render(<VoiceCaptureFab />, { route: '/' });
    await user.click(screen.getByRole('button', { name: 'הקלטת מתעניין' }));
    const stopBtn = await screen.findByRole('button', { name: 'עצור הקלטה' });
    await user.click(stopBtn);
    // Premium upsell shows up after the blob arrives.
    expect(await screen.findByText('פיצ׳ר פרימיום')).toBeInTheDocument();
    expect(
      screen.getByText(/הקלטת מתעניין קולית.*זמינה במסלולי פרימיום/),
    ).toBeInTheDocument();
    // The "create lead" review surface must NOT have rendered.
    expect(screen.queryByLabelText('שם הלקוח')).not.toBeInTheDocument();
  });

  it('permission denial surfaces a toast and stays idle', async () => {
    getUserMediaImpl = vi.fn(async () => {
      const e: any = new Error('denied');
      e.name = 'NotAllowedError';
      throw e;
    });
    const user = userEvent.setup();
    render(<VoiceCaptureFab />, { route: '/' });
    await user.click(screen.getByRole('button', { name: 'הקלטת מתעניין' }));
    // Toast copy matches useMediaRecorder's Hebrew message.
    expect(await screen.findByText(/אין גישה למיקרופון/)).toBeInTheDocument();
    // Still showing the idle mic label (not "עצור הקלטה").
    expect(screen.getByRole('button', { name: 'הקלטת מתעניין' })).toBeInTheDocument();
  });
});
