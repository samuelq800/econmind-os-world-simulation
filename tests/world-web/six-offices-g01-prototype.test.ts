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

describe('Six Offices G01 object-stage preparation surface', () => {
  it('keeps G01 as the only wired page while preserving the complete navigation map', () => {
    expect(prototypeApp).toContain(
      '<SixOfficesG01 state={state} onRetry={retry} />',
    );
    for (const leaf of [
      'G01',
      'G02',
      'G07',
      'G03',
      'G04',
      'G05',
      'G06',
      'T01',
      'T03',
      'T04',
      'T07',
      'T09',
      'ROLE',
    ]) {
      expect(g01).toContain(`pageId: '${leaf}'`);
    }
    expect(g01).toContain('is mapped, not connected');
    expect(g01).toContain('Move from signal to object.');
    expect(g01).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it('puts selection, action, draft, comparison, and progression in one local loop', () => {
    expect(g01).toContain('Supply network · actionable objects');
    expect(g01).toContain('<ObjectInspector');
    expect(g01).toContain('Draft transfer');
    expect(g01).toContain('Compare paths');
    expect(g01).toContain('<GoodsTransferFlow');
    expect(g01).toContain('<ProgressTray');
    expect(g01).not.toContain('scrollIntoView');
  });

  it('preserves isolated browser-only preparation and explicit absence of World writes', () => {
    expect(g01).toContain('Draft only · no World State write');
    expect(g01).toContain('No object, balance, or right changed.');
    expect(g01).not.toContain('fetch(');
    expect(g01).not.toContain('submitCommand');
    expect(g01).not.toContain('@econmind/core');
    expect(g01).not.toContain('supabase');
    expect(EMPTY_PROJECTION.events).toHaveLength(0);
    expect(READY_PROJECTION.events).toHaveLength(3);
  });

  it('uses the live-world token baseline with desktop stage geometry and accessibility fallbacks', () => {
    expect(baseStyles).toContain('--canvas: #07120f');
    expect(baseStyles).toContain('--surface-strong: #1a3329');
    expect(baseStyles).toContain('--accent: #0f8061');
    expect(baseStyles).toContain('Arial');
    expect(baseStyles).not.toContain('Georgia');
    expect(g01Styles).toContain('grid-template-columns: 154px minmax(0, 1fr)');
    expect(g01Styles).toContain('grid-template-columns: minmax(0, 1fr) 320px');
    expect(g01Styles).toContain('min-height: 92px');
    expect(g01Styles).toContain('(prefers-reduced-motion: reduce)');
    expect(g01Styles).toContain('(forced-colors: active)');
  });
});
