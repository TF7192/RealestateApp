import { defineConfig } from 'vitest/config';

// Vitest config — projects via workspace file instead of inline
// `test.projects` (simpler, worked in earlier Vitest versions too).
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    passWithNoTests: false,
    testTimeout: 15_000,
  },
});
