import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/world-core/cb1-omo-source-draft.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
