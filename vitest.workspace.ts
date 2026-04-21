// Vitest workspace — multi-project layout so we can run unit-only,
// integration-only, frontend-only, or the full lot.
//
// Use:
//   vitest run --project unit              # pure-logic backend units
//   vitest run --project unit-frontend     # pure-logic frontend units (no DOM)
//   vitest run --project frontend          # component/hook tests (jsdom + MSW)
//   vitest run --project integration       # real DB + Fastify
//   vitest run                             # all projects
import { defineWorkspace } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('./', import.meta.url));
const backendRoot = path.join(repoRoot, 'backend');
const frontendRoot = path.join(repoRoot, 'frontend');

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      environment: 'node',
      include: ['tests/unit/backend/**/*.test.ts'],
      setupFiles: ['tests/setup/unit.setup.ts'],
    },
  },
  {
    plugins: [(await import('@vitejs/plugin-react')).default()],
    test: {
      name: 'unit-frontend',
      environment: 'jsdom',
      include: ['tests/unit/frontend/**/*.test.{js,jsx}'],
      setupFiles: ['tests/setup/frontend.setup.ts'],
    },
  },
  {
    // Root = frontend/ so node resolution finds react-router-dom,
    // @capacitor/core, lucide-react, etc. from frontend/node_modules
    // (workspace-scoped; not hoisted to the repo root). The test files
    // live outside this root, so we pass their paths in explicitly.
    root: frontendRoot,
    plugins: [(await import('@vitejs/plugin-react')).default()],
    resolve: {
      // Alias each frontend-only package to its directory in
      // frontend/node_modules. Vite then honours each package's
      // exports / main / module field. Without these, Vite walks up
      // from tests/frontend/setup/* and never finds packages that
      // aren't hoisted to the repo root.
      alias: [
        // Absolute paths for React force every caller (test-utils at
        // /tests/frontend/setup and frontend source inside the frontend
        // root) onto the same React instance. Without these, Vite
        // evaluates React twice across the outside-root boundary and
        // contexts stop matching.
        { find: /^react$/,                 replacement: path.join(repoRoot, 'node_modules/react/index.js') },
        { find: /^react\/jsx-runtime$/,    replacement: path.join(repoRoot, 'node_modules/react/jsx-runtime.js') },
        { find: /^react\/jsx-dev-runtime$/, replacement: path.join(repoRoot, 'node_modules/react/jsx-dev-runtime.js') },
        { find: /^react-dom$/,             replacement: path.join(repoRoot, 'node_modules/react-dom/index.js') },
        { find: /^react-dom\/client$/,     replacement: path.join(repoRoot, 'node_modules/react-dom/client.js') },

        { find: /^react-router-dom$/, replacement: path.join(frontendRoot, 'node_modules/react-router-dom') },
        { find: /^react-router$/,     replacement: path.join(frontendRoot, 'node_modules/react-router') },
        { find: /^@capacitor\/core$/, replacement: path.join(frontendRoot, 'node_modules/@capacitor/core') },
        { find: /^lucide-react$/,     replacement: path.join(frontendRoot, 'node_modules/lucide-react') },
        // Canonical `@estia/frontend/*` path for the frontend app source.
        // Tests import through this alias so Vite doesn't evaluate the
        // same module twice under different relative paths.
        { find: /^@estia\/frontend\//, replacement: path.join(frontendRoot, 'src/') },
      ],
      dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    server: {
      fs: {
        // Allow Vite to read files outside the frontend root — our test
        // utilities live in tests/frontend/.
        allow: [repoRoot],
      },
    },
    test: {
      name: 'frontend',
      // happy-dom instead of jsdom because jsdom ships its own
      // AbortController/AbortSignal which clashes with undici's fetch
      // type-check — real app code (api.js uses AbortController) was
      // failing every save with "Expected signal to be an instance of
      // AbortSignal". happy-dom shares Node globals cleanly.
      environment: 'happy-dom',
      include: [path.join(repoRoot, 'tests/frontend/**/*.test.{ts,tsx,js,jsx}')],
      exclude: [
        path.join(repoRoot, 'tests/frontend/setup/**'),
        path.join(repoRoot, 'tests/frontend/mocks/**'),
        path.join(repoRoot, 'tests/frontend/fixtures/**'),
      ],
      setupFiles: [path.join(repoRoot, 'tests/frontend/setup/vitest.setup.ts')],
      environmentOptions: { 'happy-dom': { url: 'http://localhost:5174/' } },
      testTimeout: 10_000,
    },
  },
  {
    // Root = backend/ so node resolution picks up @prisma/client, argon2,
    // fastify, etc. from backend/node_modules.
    root: backendRoot,
    resolve: {
      alias: {
        '@prisma/client': path.join(backendRoot, 'node_modules/@prisma/client/index.js'),
        '.prisma/client/default': path.join(backendRoot, 'node_modules/.prisma/client/default.js'),
        argon2: path.join(backendRoot, 'node_modules/argon2/argon2.cjs'),
      },
    },
    test: {
      name: 'integration',
      environment: 'node',
      include: [path.join(repoRoot, 'tests/integration/**/*.test.ts')],
      globalSetup: [path.join(repoRoot, 'tests/setup/integration.global-setup.ts')],
      setupFiles: [path.join(repoRoot, 'tests/setup/integration.setup.ts')],
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      testTimeout: 15_000,
    },
  },
]);
