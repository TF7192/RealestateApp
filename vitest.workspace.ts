// Vitest workspace — multi-project layout so we can run unit-only,
// integration-only, or the full lot depending on the command.
//
// Use:
//   vitest run --project unit
//   vitest run --project integration
//   vitest run --project unit-frontend
//   vitest run                            # all projects
import { defineWorkspace } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('./', import.meta.url));
const backendRoot = path.join(repoRoot, 'backend');

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
    // Root = backend/ so node resolution picks up @prisma/client, argon2,
    // fastify, etc. from backend/node_modules (not hoisted to repo root
    // because argon2 has a native binary). @prisma/client has to be
    // externalized so Vitest hands it to the Node CJS loader — otherwise
    // Prisma's internal `require('.prisma/client/default')` looks up from
    // a virtual path and fails.
    root: backendRoot,
    resolve: {
      alias: {
        // Anchor these to the backend's node_modules so Vite/Vitest
        // resolves them consistently regardless of the calling module's
        // own path. Without this, Prisma's internal
        // `require('.prisma/client/default')` walks up from the virtual
        // Vite module path and misses the real client directory.
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
