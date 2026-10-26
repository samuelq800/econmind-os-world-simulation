import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '.seed-validation/**',
      '.vite-env-test-*/**',
      'artifacts/world-seed-delivery-v1/**',
      'artifacts/world-runtime-environment-2026-10-09/**',
      'artifacts/world-runtime-postgres/**',
      'artifacts/world-runtime-actions/**',
      'apps/world-web/public/**',
      'supabase/.temp/**',
      'supabase/functions/world-v2-official-read/lib/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['apps/world-web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
);
