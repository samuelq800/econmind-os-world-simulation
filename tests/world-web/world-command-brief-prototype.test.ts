import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { READY_PROJECTION } from '../../apps/world-web/src/prototype/fixtures.js';
import {
  nextEventIndex,
  readableProjection,
  type PrototypeViewState,
} from '../../apps/world-web/src/prototype/state.js';

const runtimeApp = readFileSync('apps/world-web/src/App.tsx', 'utf8');
const runtimeMain = readFileSync('apps/world-web/src/main.tsx', 'utf8');
const prototypeHtml = readFileSync('apps/world-web/prototype.html', 'utf8');
const prototypeComponent = readFileSync(
  'apps/world-web/src/prototype/WorldCommandBrief.tsx',
  'utf8',
);
const prototypeApp = readFileSync(
  'apps/world-web/src/prototype/App.tsx',
  'utf8',
);
const prototypeStyles = readFileSync(
  'apps/world-web/src/prototype/prototype.css',
  'utf8',
);
const prototypeReadme = readFileSync(
  'apps/world-web/src/prototype/README.md',
  'utf8',
);

describe('World Command Brief preparation-only prototype', () => {
  it('keeps the prototype isolated from the runtime entry', () => {
    expect(runtimeApp).not.toContain('prototype');
    expect(runtimeMain).not.toContain('prototype');
    expect(prototypeHtml).toContain('/src/prototype/main.tsx');
    expect(prototypeHtml).toContain('noindex,nofollow');
    expect(prototypeReadme).toContain('PREPARATION_ONLY_NOT_RUNTIME');
  });

  it('uses an explicit typed mock marker and exact string values', () => {
    expect(READY_PROJECTION.marker).toBe('PREPARATION_ONLY_NOT_RUNTIME');
    expect(READY_PROJECTION.metrics.length).toBeGreaterThan(0);
    for (const metric of READY_PROJECTION.metrics) {
      expect(typeof metric.canonicalValue).toBe('string');
      expect(metric.accessibleSummary.length).toBeGreaterThan(20);
    }
  });

  it('preserves readable context only for the intended UI states', () => {
    const ready: PrototypeViewState = {
      status: 'ready',
      projection: READY_PROJECTION,
    };
    const offline: PrototypeViewState = {
      status: 'offline',
      projection: READY_PROJECTION,
      reason: 'offline',
    };
    const unauthorized: PrototypeViewState = {
      status: 'unauthorized',
      reason: 'denied',
    };

    expect(readableProjection(ready)).toBe(READY_PROJECTION);
    expect(readableProjection(offline)).toBe(READY_PROJECTION);
    expect(readableProjection(unauthorized)).toBeNull();
  });

  it('supports wrapping arrow-key and boundary navigation', () => {
    expect(nextEventIndex(0, 3, 'ArrowDown')).toBe(1);
    expect(nextEventIndex(2, 3, 'ArrowDown')).toBe(0);
    expect(nextEventIndex(0, 3, 'ArrowUp')).toBe(2);
    expect(nextEventIndex(1, 3, 'Home')).toBe(0);
    expect(nextEventIndex(1, 3, 'End')).toBe(2);
    expect(nextEventIndex(1, 3, 'Enter')).toBe(1);
    expect(nextEventIndex(0, 0, 'ArrowDown')).toBe(-1);
  });

  it('makes accessibility and non-command boundaries explicit', () => {
    expect(prototypeComponent).toContain('Skip to World brief');
    expect(prototypeComponent).toContain('aria-pressed={selected}');
    expect(prototypeComponent).toContain('aria-live="polite"');
    expect(prototypeComponent).toContain('Command wiring waits for V10.4');
    expect(prototypeComponent).toContain('No command is created or submitted');
    expect(prototypeComponent).not.toContain('fetch(');
    expect(prototypeComponent).not.toContain('submitCommand');
    expect(prototypeComponent).not.toContain('@econmind/core');
  });

  it('keeps the complete state and responsive accessibility harness reviewable', () => {
    for (const state of [
      'ready',
      'loading',
      'empty',
      'stale',
      'unauthorized',
      'offline',
      'retrying',
    ]) {
      expect(prototypeApp).toContain(`id: '${state}'`);
    }

    expect(prototypeStyles).toContain('min-height: 44px');
    expect(prototypeStyles).toContain('(prefers-reduced-motion: reduce)');
    expect(prototypeStyles).toContain('(forced-colors: active)');
    expect(prototypeStyles).toContain('@media (max-width: 540px)');
  });
});
