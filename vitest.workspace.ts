// Vitest workspace — multi-project layout so we can run unit-only,
// integration-only, or the full lot depending on the command.
//
// Use:
//   vitest run --project unit
//   vitest run --project integration
//   vitest run --project unit-frontend
//   vitest run                            # all projects
import { defineWorkspace } from 'vitest/config';

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
    test: {
      name: 'unit-frontend',
      environment: 'jsdom',
      include: ['tests/unit/frontend/**/*.test.{js,jsx}'],
      setupFiles: ['tests/setup/frontend.setup.ts'],
    },
  },
  {
    test: {
      name: 'integration',
      environment: 'node',
      include: ['tests/integration/**/*.test.ts'],
      globalSetup: ['tests/setup/integration.global-setup.ts'],
      setupFiles: ['tests/setup/integration.setup.ts'],
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      testTimeout: 15_000,
    },
  },
]);
