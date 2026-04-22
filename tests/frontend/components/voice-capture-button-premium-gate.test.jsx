// N-16 — <VoiceCaptureButton> is the inline voice shortcut at the top
// of NewLead / NewProperty. Until this change it started recording
// immediately while the premium gate only lived on <VoiceCaptureFab>.
// The fix: tapping the inline button opens the SAME "פיצ׳ר פרימיום"
// dialog on both entry points, never starting a recording.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '../setup/test-utils';
import VoiceCaptureButton from '@estia/frontend/components/VoiceCaptureButton.jsx';

// The hook is mocked so the test doesn't touch real MediaRecorder /
// getUserMedia. The point is that even when `start` exists, the button
// never calls it — the gate intercepts the click first.
vi.mock('@estia/frontend/hooks/useMediaRecorder.js', () => ({
  default: () => ({
    state: 'idle',
    blob: null,
    error: null,
    durationMs: 0,
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  }),
}));

describe('N-16 — VoiceCaptureButton premium gate', () => {
  it('opens the premium-gate dialog on LEAD kind', async () => {
    const user = userEvent.setup({ delay: null });
    render(<VoiceCaptureButton kind="LEAD" onExtracted={() => {}} />);
    await user.click(screen.getByRole('button', { name: /דבר במקום להקליד — ליד/ }));
    expect(await screen.findByText(/פיצ׳ר פרימיום/)).toBeInTheDocument();
  });

  it('opens the premium-gate dialog on PROPERTY kind', async () => {
    const user = userEvent.setup({ delay: null });
    render(<VoiceCaptureButton kind="PROPERTY" onExtracted={() => {}} />);
    await user.click(screen.getByRole('button', { name: /דבר במקום להקליד — נכס/ }));
    expect(await screen.findByText(/פיצ׳ר פרימיום/)).toBeInTheDocument();
  });

  it('clicking "צור קשר עם התמיכה" fires a mailto to support', async () => {
    const user = userEvent.setup({ delay: null });
    // happy-dom doesn't actually navigate — writes to location.href land
    // on a writable string we can inspect.
    let navigatedTo = '';
    Object.defineProperty(window, 'location', {
      value: {
        get href() { return navigatedTo; },
        set href(v) { navigatedTo = v; },
      },
      writable: true,
      configurable: true,
    });

    render(<VoiceCaptureButton kind="LEAD" onExtracted={() => {}} />);
    await user.click(screen.getByRole('button', { name: /דבר במקום להקליד — ליד/ }));
    await user.click(await screen.findByRole('button', { name: /צור קשר עם התמיכה/ }));

    await waitFor(() => expect(navigatedTo).toMatch(/^mailto:support@estia\.app/));
    // Subject + body carry the Hebrew copy percent-encoded; looking for
    // the distinctive 'Estia' tail in the subject is plenty of proof.
    expect(navigatedTo).toMatch(/Estia/);
  });
});
