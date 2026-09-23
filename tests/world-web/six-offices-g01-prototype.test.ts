import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { prototypeStateMessage } from '../../apps/world-web/src/prototype/SixOfficesG01.js';

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
const livingNationScene = readFileSync(
  'apps/world-web/src/prototype/LivingNationScene.tsx',
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

describe('Six Offices Living Nation preparation surface', () => {
  it('wires G01 and G02 while preserving the complete navigation map', () => {
    expect(prototypeApp).toContain('<SixOfficesG01');
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
    expect(g01).toContain('<LivingNationScene');
    expect(g01).toContain('<NationalOverview');
    expect(g01).toContain('G01 and G02 are local fixture routes');
    expect(g01).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it('gives every office a distinct national object loop without changing appointment', () => {
    for (const office of [
      'CAPTAIN',
      'CENTRAL_BANK',
      'FINANCE',
      'TRADE',
      'INDUSTRY',
      'SOCIAL',
    ]) {
      expect(livingNationScene).toContain(`id: '${office}'`);
    }
    for (const page of ['C03', 'B03', 'F08', 'T03', 'I07', 'S07']) {
      expect(livingNationScene).toContain(`nextPage: '${page}'`);
    }
    expect(livingNationScene).toContain(
      'production requires appointment verification',
    );
    expect(livingNationScene).toContain('toBoundOfficeId');
    expect(livingNationScene).toContain('projection.viewer.actingOfficeId');
    expect(livingNationScene).not.toContain('setActiveOfficeId');
    expect(livingNationScene).toContain('Northstar national scene');
    expect(livingNationScene).toContain('Action consequence');
    expect(g01).toContain('<GoodsTransferFlow');
    expect(livingNationScene).not.toContain('scrollIntoView');
  });

  it('makes replay and relations interactive while keeping the boundary local', () => {
    expect(livingNationScene).toContain('National replay');
    expect(livingNationScene).toContain('the world clock keeps running');
    expect(livingNationScene).toContain(
      'Relationship map · not to geographic scale',
    );
    expect(livingNationScene).toContain('Open trade relation');
    expect(livingNationScene).toContain('Command contract not attached.');
    for (const source of [g01, livingNationScene]) {
      expect(source).not.toContain('fetch(');
      expect(source).not.toContain('submitCommand');
      expect(source).not.toContain('@econmind/core');
      expect(source).not.toContain('supabase');
    }
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
    expect(g01Styles).toContain('grid-template-columns: minmax(0, 1fr) 346px');
    expect(g01Styles).toContain('min-height: 542px');
    expect(g01Styles).toContain('(prefers-reduced-motion: reduce)');
    expect(g01Styles).toContain('(forced-colors: active)');
    expect(g01Styles).toMatch(
      /@media \(max-width: 840px\) \{\s*\.six-offices--gameplay \.six-topbar \{[^}]+\}\s*\.six-offices--gameplay \.six-layout \{\s*grid-template-columns: minmax\(0, 1fr\)/,
    );
  });

  it('announces loading, revoked access, and offline recovery distinctly', () => {
    expect(prototypeStateMessage({ status: 'loading' })).toMatchObject({
      liveRegion: 'status',
      detail: 'Waiting for the scoped fixture projection.',
    });
    expect(
      prototypeStateMessage({
        status: 'unauthorized',
        reason: 'Office access revoked.',
      }),
    ).toMatchObject({
      liveRegion: 'alert',
      detail: 'Office access revoked. No Office action is available.',
    });
    expect(
      prototypeStateMessage({
        status: 'offline',
        projection: null,
        reason: 'No cached projection.',
      }),
    ).toMatchObject({
      title: 'Projection offline',
      detail: 'No cached projection. No live action is available.',
    });
    expect(g01).toContain('mainRef.current?.focus()');
    expect(g01).toContain(
      'Supplied snapshot only. Live actions are unavailable',
    );
  });
});
