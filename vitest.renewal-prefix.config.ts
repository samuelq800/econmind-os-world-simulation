import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/world-core/renewal-frozen-migration-fixture.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
