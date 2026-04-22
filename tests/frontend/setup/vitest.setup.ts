// Global Vitest setup for the frontend test project (jsdom).
//
// Runs before every test file. Sets up:
//   - DOM matchers from @testing-library/jest-dom
//   - axe matcher from vitest-axe
//   - browser-API polyfills that jsdom doesn't ship (matchMedia,
//     IntersectionObserver, ResizeObserver, clipboard)
//   - MSW lifecycle so fetch is mocked by default in every test
//   - DOM cleanup + deterministic faker seed + localStorage reset

import '@testing-library/jest-dom/vitest';
import * as matchers from 'vitest-axe/matchers';
import { afterEach, beforeAll, afterAll, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import { faker } from '@faker-js/faker';
import { installBrowserApiMocks } from '../mocks/browser-apis';
import { server } from './msw-server';
// Side-effect import: initializes the app's i18next instance so any
// component that calls useTranslation() during a test resolves keys
// against the real Hebrew bundle. Without this, components render the
// raw key strings (e.g. `auth.fields.email` instead of `אימייל`) and
// assertions on rendered copy fail.
import '@estia/frontend/i18n';


expect.extend(matchers);

// Deterministic faker output — flake-free snapshots + diagnosable failures.
faker.seed(1234);

installBrowserApiMocks();

beforeAll(() => {
  // 'error' surfaces unexpected network calls — every test must either
  // use a default handler from msw-handlers.ts or register one of its
  // own via server.use(). Missing mocks are bugs, not fallthroughs.
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // Clear per-test storage so state doesn't leak.
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* jsdom quirk */ }
  // Reset analytics + page-cache modules if they cached window-level state.
  // (Modules self-initialize; leaving the DOM clean is enough.)
});

afterAll(() => {
  server.close();
});
