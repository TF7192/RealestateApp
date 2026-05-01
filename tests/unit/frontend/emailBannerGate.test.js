// emailBannerGate — the "should we show the soft email-pref nudge"
// decision. Lives in its own module so tests can hit pure logic
// without rendering the banner component.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  shouldShowEmailBanner,
  rememberEmailBannerDismissal,
} from '../../../frontend/src/pages/marketDiscovery/emailBannerGate.js';

const KEY = 'marketDiscovery.emailBannerDismissedAt';
const NOW = new Date('2026-05-01T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('shouldShowEmailBanner', () => {
  it('false when emailPref is null (still loading)', () => {
    expect(shouldShowEmailBanner(null, 5)).toBe(false);
  });

  it('false when emailPref.enabled is true', () => {
    expect(shouldShowEmailBanner({ enabled: true }, 5)).toBe(false);
  });

  it('false when there are no matches', () => {
    expect(shouldShowEmailBanner({ enabled: false }, 0)).toBe(false);
    expect(shouldShowEmailBanner({ enabled: false }, undefined)).toBe(false);
  });

  it('true when pref disabled, has matches, never dismissed', () => {
    expect(shouldShowEmailBanner({ enabled: false }, 3)).toBe(true);
  });

  it('false when dismissed within the last 30 days', () => {
    localStorage.setItem(KEY, String(NOW - 5 * 24 * 3600 * 1000));
    expect(shouldShowEmailBanner({ enabled: false }, 3)).toBe(false);
  });

  it('true again once 30 days have elapsed since dismissal', () => {
    localStorage.setItem(KEY, String(NOW - 31 * 24 * 3600 * 1000));
    expect(shouldShowEmailBanner({ enabled: false }, 3)).toBe(true);
  });
});

describe('rememberEmailBannerDismissal', () => {
  it('writes the current timestamp to localStorage', () => {
    rememberEmailBannerDismissal();
    expect(Number(localStorage.getItem(KEY))).toBe(NOW);
  });
});
