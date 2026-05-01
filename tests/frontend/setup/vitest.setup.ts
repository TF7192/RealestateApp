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
// PERF-004 (commit 789538f, 2026-04-25) removed react-i18next: the
// app is Hebrew-only and the three callers of useTranslation() were
// ported to inline Hebrew copy. The previous side-effect import of
// `@estia/frontend/i18n` here now points at a deleted module and
// breaks every frontend test at module-resolve time.


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
