import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
    },
    include: ['tests/**/*.test.ts'],
    maxWorkers: 1,
    // V00 lifecycle files intentionally start and terminate real local
    // processes. Keep file-level execution serial so their owned-process and
    // port-release assertions cannot observe another lifecycle fixture.
    fileParallelism: false,
    // The full suite runs several disposable PGlite schemas concurrently.
    // Their deterministic startup can exceed Vitest's five-second default
    // without indicating a stalled test or relaxing any assertion.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
