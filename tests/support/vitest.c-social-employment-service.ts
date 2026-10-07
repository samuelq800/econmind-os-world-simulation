import path from 'node:path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  cacheDir: path.resolve(
    import.meta.dirname,
    '../../node_modules/.vite/c-social-employment-service',
  ),
  resolve: {
    alias: {
      '@econmind/core': path.resolve(
        import.meta.dirname,
        '../../packages/core/src/index.ts',
      ),
    },
  },
  test: {
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
