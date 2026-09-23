import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const captainCommand = readFileSync(
  'apps/world-web/src/prototype/CaptainCommandCenter.tsx',
  'utf8',
);
const g01 = readFileSync(
  'apps/world-web/src/prototype/SixOfficesG01.tsx',
  'utf8',
);
const styles = readFileSync(
  'apps/world-web/src/prototype/six-offices.css',
  'utf8',
);

describe('Captain command preparation surface', () => {
  it('makes a national map the Captain gameplay surface with a readable mission loop', () => {
    for (const label of [
      'National command turn',
      'NORTHSTAR OPERATIONS MAP',
      'Capital District',
      'Eastbank Granary',
      'Treasury Quarter',
      'Reserve Hill',
      'South Coast Port',
      'National telemetry',
      'Read Treasury guardrail',
      'Call the Cabinet package',
      'Back the harbour route',
      'Authorize the response',
      'Three fronts. One turn.',
      'Choose the line.',
      'Political Capital',
      'Set the tempo.',
      'What your move unlocked.',
    ]) {
      expect(captainCommand).toContain(label);
    }
    expect(captainCommand).toContain('fiscal space stays with Finance');
    expect(captainCommand).toContain('Central Bank instrument.');
  });

  it('keeps the causal mission actions interactive and explicitly local', () => {
    for (const action of [
      'Read cash-window guardrail',
      'Request revision',
      'Call joint package',
      'Reject local draft',
      'Clear seat',
      'Commit 4 PC to the route',
      'Authorize food buffer package',
      'Open next turn',
      'Pin to the map',
    ]) {
      expect(captainCommand).toContain(action);
    }
    expect(captainCommand).toContain("missionPhase !== 'CABINET'");
    expect(captainCommand).toContain("missionPhase !== 'SUPPORTED'");
    expect(captainCommand).toContain('financeGuardrailRead');
    expect(captainCommand).toContain('no proposal, approval, or command is');
    expect(captainCommand).toContain('submitted.');
    expect(captainCommand).not.toContain('fetch(');
    expect(captainCommand).not.toContain('submitCommand');
    expect(captainCommand).not.toContain('@econmind/core');
  });

  it('routes the Captain lens to its own command surface and preserves all other lenses', () => {
    expect(g01).toContain('import { CaptainCommandCenter }');
    expect(g01).toContain("actingOffice.officeId === 'CAPTAIN'");
    expect(g01).toContain('CAPTAIN_NAV_GROUPS');
    expect(g01).toContain('<LivingNationScene');
  });

  it('uses the desktop gameplay system with visible focus and reduced-motion fallbacks', () => {
    expect(styles).toContain('.captain-map-command');
    expect(styles).toContain('.captain-map-stage');
    expect(styles).toContain('.captain-map-marker');
    expect(styles).toContain('.captain-map-file');
    expect(styles).toContain('.captain-map-stage__telemetry');
    expect(styles).toContain('.captain-mission-route');
    expect(styles).toContain('--captain-paper: var(--surface)');
    expect(styles).toContain('(prefers-reduced-motion: reduce)');
    expect(styles).toContain('(forced-colors: active)');
  });
});
