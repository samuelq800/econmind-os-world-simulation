import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
    },
    include: ['tests/**/*.test.ts'],
    // The full suite runs several disposable PGlite schemas concurrently.
    // Their deterministic startup can exceed Vitest's five-second default
    // without indicating a stalled test or relaxing any assertion.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
