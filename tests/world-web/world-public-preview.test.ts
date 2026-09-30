import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const runtimeApp = readFileSync('apps/world-web/src/App.tsx', 'utf8');
const atlasPage = readFileSync(
  'apps/world-web/src/map-explorer/WorldExplorer.tsx',
  'utf8',
);
const commandPage = readFileSync('apps/world-web/command.html', 'utf8');
const viteConfig = readFileSync('apps/world-web/vite.config.ts', 'utf8');
const deploymentWorkflow = readFileSync(
  '.github/workflows/deploy-world-web.yml',
  'utf8',
);
const candidateWorkflow = readFileSync(
  '.github/workflows/world-web-atlas-candidate.yml',
  'utf8',
);
const landingPage = readFileSync('apps/world-web/index.html', 'utf8');

describe('public World preview deployment', () => {
  it('opens the atlas at the root and retains the selected national page', () => {
    expect(runtimeApp).toContain('atlas === null');
    expect(runtimeApp).toContain('<WorldExplorer />');
    expect(atlasPage).toContain('data-mosaic-country={territory.number}');
    expect(atlasPage).toContain('visibleDetailMaps.map((map) =>');
    expect(atlasPage).toContain('放大后按需叠加 70 国地理细图');
    expect(atlasPage).toContain(
      './season1-immersive/?role=finance&country=01#country',
    );
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
    expect(deploymentWorkflow).toContain('      - main');
    expect(landingPage).toContain('<div id="root"></div>');
    expect(landingPage).toContain('src="/src/main.tsx"');
    expect(landingPage).toContain(
      'season1-immersive/?role=finance&amp;country=01#country',
    );
    expect(landingPage).not.toContain('http-equiv="refresh"');
    expect(deploymentWorkflow).toContain(
      'pnpm --filter @econmind/world-web build',
    );
    expect(deploymentWorkflow).toContain('path: apps/world-web/dist');
    expect(deploymentWorkflow).not.toContain('SUPABASE');
    expect(deploymentWorkflow).not.toContain('WORLD_API_');
  });

  it('keeps atlas candidate CI separate from Pages deployment', () => {
    expect(candidateWorkflow).toContain('pull_request:');
    expect(candidateWorkflow).toContain('contents: read');
    expect(candidateWorkflow).toContain('pnpm install --frozen-lockfile');
    expect(candidateWorkflow).toContain('pnpm test:authoritative-ui');
    expect(candidateWorkflow).not.toContain('deploy-pages');
    expect(candidateWorkflow).not.toContain('SUPABASE');
    expect(candidateWorkflow).not.toContain('secrets.');
  });
});
