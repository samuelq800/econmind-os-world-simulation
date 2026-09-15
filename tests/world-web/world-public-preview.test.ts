import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const runtimeApp = readFileSync('apps/world-web/src/App.tsx', 'utf8');
const commandPage = readFileSync('apps/world-web/command.html', 'utf8');
const viteConfig = readFileSync('apps/world-web/vite.config.ts', 'utf8');
const deploymentWorkflow = readFileSync(
  '.github/workflows/deploy-world-web.yml',
  'utf8',
);

describe('public World preview deployment', () => {
  it('keeps the runtime landing page isolated while linking to the command preview', () => {
    expect(runtimeApp).toContain('Open national command');
    expect(runtimeApp).toContain('./command.html');
    expect(runtimeApp).toContain('does not connect to World State');
    expect(runtimeApp).not.toContain('fetch(');
    expect(runtimeApp).not.toContain('@econmind/core');
    expect(commandPage).toContain('/src/prototype/main.tsx');
    expect(commandPage).toContain('noindex,nofollow');
  });

  it('builds both public HTML entries and deploys only static web output', () => {
    expect(viteConfig).toContain("resolve(worldWebRoot, 'command.html')");
    expect(viteConfig).toContain("'/econmind-os-world-simulation/'");
    expect(deploymentWorkflow).toContain('workflow_dispatch:');
    expect(deploymentWorkflow).toContain(
      'pnpm --filter @econmind/world-web build',
    );
    expect(deploymentWorkflow).toContain('path: apps/world-web/dist');
    expect(deploymentWorkflow).not.toContain('SUPABASE');
    expect(deploymentWorkflow).not.toContain('WORLD_API_');
  });
});
