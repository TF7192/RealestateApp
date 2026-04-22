import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildPopoutUrl,
  isPopoutWindow,
  popoutCurrentRoute,
} from '../../../frontend/src/lib/popout.js';

describe('buildPopoutUrl', () => {
  it('adds popout=1 to a URL with no query string', () => {
    expect(buildPopoutUrl('https://estia.co.il/properties/abc')).toBe(
      'https://estia.co.il/properties/abc?popout=1',
    );
  });

  it('appends popout=1 alongside existing query params', () => {
    const out = buildPopoutUrl('https://estia.co.il/customers/x?tab=notes');
    const u = new URL(out);
    expect(u.searchParams.get('tab')).toBe('notes');
    expect(u.searchParams.get('popout')).toBe('1');
  });

  it('leaves other query params untouched when popout is already set', () => {
    const out = buildPopoutUrl('https://estia.co.il/owners/1?popout=1&foo=bar');
    const u = new URL(out);
    expect(u.searchParams.get('popout')).toBe('1');
    expect(u.searchParams.get('foo')).toBe('bar');
  });

  it('preserves the URL hash', () => {
    const out = buildPopoutUrl('https://estia.co.il/properties/abc#hero');
    expect(out.endsWith('#hero')).toBe(true);
    expect(new URL(out).searchParams.get('popout')).toBe('1');
  });
});

describe('isPopoutWindow', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  const setHref = (href) => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href },
    });
  };

  it('returns false when the URL has no popout param', () => {
    setHref('http://localhost/customers/1');
    expect(isPopoutWindow()).toBe(false);
  });

  it('returns true when popout=1 is present', () => {
    setHref('http://localhost/customers/1?popout=1');
    expect(isPopoutWindow()).toBe(true);
  });

  it('returns false for popout=0 or other values', () => {
    setHref('http://localhost/customers/1?popout=0');
    expect(isPopoutWindow()).toBe(false);
    setHref('http://localhost/customers/1?popout=yes');
    expect(isPopoutWindow()).toBe(false);
  });
});

describe('popoutCurrentRoute', () => {
  const originalLocation = window.location;
  const originalOpen = window.open;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'http://localhost/properties/abc' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    window.open = originalOpen;
  });

  it('calls window.open with the popout URL + 900x700 + noopener', () => {
    const spy = vi.fn(() => ({ focus: () => {} }));
    window.open = spy;
    popoutCurrentRoute();
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, target, features] = spy.mock.calls[0];
    expect(url).toBe('http://localhost/properties/abc?popout=1');
    expect(target).toBe('_blank');
    expect(features).toMatch(/width=900/);
    expect(features).toMatch(/height=700/);
    expect(features).toMatch(/noopener/);
  });

  it('returns the handle that window.open returned (null if blocked)', () => {
    window.open = vi.fn(() => null);
    expect(popoutCurrentRoute()).toBeNull();
  });
});

// Detail pages should all import popoutCurrentRoute.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));

describe('detail pages wire in popoutCurrentRoute', () => {
  for (const page of ['PropertyDetail', 'CustomerDetail', 'OwnerDetail']) {
    it(`${page}.jsx imports popoutCurrentRoute`, () => {
      const src = readFileSync(
        path.join(here, `../../../frontend/src/pages/${page}.jsx`),
        'utf8',
      );
      expect(src).toMatch(/popoutCurrentRoute/);
    });
  }
});
