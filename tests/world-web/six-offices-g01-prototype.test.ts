import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  EMPTY_PROJECTION,
  READY_PROJECTION,
} from '../../apps/world-web/src/prototype/fixtures.js';

const prototypeApp = readFileSync(
  'apps/world-web/src/prototype/App.tsx',
  'utf8',
);
const g01 = readFileSync(
  'apps/world-web/src/prototype/SixOfficesG01.tsx',
  'utf8',
);
const g01Styles = readFileSync(
  'apps/world-web/src/prototype/six-offices.css',
  'utf8',
);
const baseStyles = readFileSync(
  'apps/world-web/src/prototype/prototype.css',
  'utf8',
);

describe('Six Offices G01 preparation-only surface', () => {
  it('makes G01 the only wired office page while retaining every common sidebar leaf', () => {
    expect(prototypeApp).toContain(
      '<SixOfficesG01 state={state} onRetry={retry} />',
    );
    for (const leaf of ['G01', 'G02', 'G07', 'G03', 'G04', 'G05', 'G06']) {
      expect(g01).toContain(`pageId: '${leaf}'`);
    }
    expect(g01).toContain('authorized query');
    expect(g01).toContain('not wired');
    expect(g01).toContain('Source unknown');
    expect(g01).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it('keeps browser UI read-only and preserves the explicit empty brief', () => {
    expect(g01).toContain('No high-priority offline changes');
    expect(g01).toContain('no invented data');
    expect(g01).not.toContain('fetch(');
    expect(g01).not.toContain('submitCommand');
    expect(g01).not.toContain('@econmind/core');
    expect(g01).not.toContain('supabase');
    expect(EMPTY_PROJECTION.events).toHaveLength(0);
    expect(READY_PROJECTION.events).toHaveLength(3);
  });

  it('uses the approved live-world token baseline locally and supports the narrow-screen drawer', () => {
    expect(baseStyles).toContain('--canvas: #07120f');
    expect(baseStyles).toContain('--surface-strong: #1a3329');
    expect(baseStyles).toContain('--accent: #0f8061');
    expect(baseStyles).toContain('Arial');
    expect(baseStyles).not.toContain('Georgia');
    expect(g01Styles).toContain(
      'grid-template-columns: minmax(0, 1.63fr) minmax(300px, 1fr)',
    );
    expect(g01Styles).toContain('@media (max-width: 840px)');
    expect(g01Styles).toContain('.six-sidebar.is-open');
    expect(g01Styles).toContain('transform: translateX(-105%)');
    expect(g01Styles).toContain('(prefers-reduced-motion: reduce)');
    expect(g01Styles).toContain('(forced-colors: active)');
  });
});
