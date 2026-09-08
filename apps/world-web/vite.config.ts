import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

import { assertSafeViteEnvironment } from '../../scripts/vite-environment-policy.mjs';

const worldWebRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  assertSafeViteEnvironment(
    loadEnv(mode, worldWebRoot, 'VITE_'),
    `world-web Vite mode ${mode}`,
  );

  return {
    envDir: worldWebRoot,
    plugins: [react()],
    root: worldWebRoot,
  };
});
