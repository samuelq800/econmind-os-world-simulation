import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@econmind/core': fileURLToPath(
        new URL('./tests/support/cb1-core-composition.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['tests/world-core/cb1-omo-source-draft.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
