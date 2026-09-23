import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const socialCommand = readFileSync(
  'apps/world-web/src/prototype/SocialCommandCenter.tsx',
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

describe('Social public-service command surface', () => {
  it('turns an Eastbank service queue into a playable local response loop', () => {
    for (const label of [
      'Hold the care line.',
      'The queue has a shape.',
      'Eastbank service day',
      'Read queue',
      'Name bottleneck',
      'Build cover',
      'Test service day',
      'File plan',
      'Read Eastbank queue',
      'Mark staffing as the bottleneck',
      'Test the local service day',
      'Record local service plan',
      'Open next social desk',
    ]) {
      expect(socialCommand).toContain(label);
    }
    expect(socialCommand).toContain('The limit is the action.');
    expect(socialCommand).toContain(
      'Social drafts the service response; other offices',
    );
  });

  it('makes service delivery a minimum of explicit capacity constraints', () => {
    expect(socialCommand).toContain('Eastbank primary care');
    expect(socialCommand).toContain('CURRENT_BACKLOG = 700');
    expect(socialCommand).toContain('DAILY_DEMAND = 1_000');
    expect(socialCommand).toContain('STAFF_CAPACITY = 800');
    expect(socialCommand).toContain('FACILITY_CAPACITY = 1_200');
    expect(socialCommand).toContain('MATERIAL_CAPACITY = 1_100');
    expect(socialCommand).toContain('BUDGET_CAPACITY = 1_000');
    expect(socialCommand).toContain('Math.min(');
    expect(socialCommand).toContain('DAILY_DEMAND + CURRENT_BACKLOG');
    expect(socialCommand).toContain('CURRENT_BACKLOG + queueChange');
  });

  it('blocks a facilities-only response and directs the player back to staffing', () => {
    expect(socialCommand).toContain('Add 400 treatment slots');
    expect(socialCommand).toContain('Evening triage extension');
    expect(socialCommand).toContain('Regional float team');
    expect(socialCommand).toContain('A room request cannot clear');
    expect(socialCommand).toContain('Return to staffing response');
    expect(socialCommand).toContain('clearFacilitiesOnlyDraft');
    expect(socialCommand).toContain('staffingBoost >= STABILISATION_BOOST');
    expect(socialCommand).toContain('no clinician is deployed yet.');
  });

  it('keeps local Social rehearsal separate from staffing, payments, and service delivery', () => {
    expect(socialCommand).toContain(
      'No staff, budget, facility, payment, or public-service command was submitted.',
    );
    expect(socialCommand).toContain('No world state changed.');
    expect(socialCommand).toContain(
      'Local arithmetic illustration · not a world forecast',
    );
    expect(socialCommand).not.toContain('fetch(');
    expect(socialCommand).not.toContain('submitCommand');
    expect(socialCommand).not.toContain('@econmind/core');
    expect(socialCommand).not.toContain('supabase');
    expect(socialCommand).not.toContain('Happiness Score');
    expect(socialCommand).not.toContain('Service Quality Score');
  });

  it('routes Social through its own desk with accessible World-consistent controls', () => {
    expect(g01).toContain('import { SocialCommandCenter }');
    expect(g01).toContain('SOCIAL_NAV_GROUPS');
    expect(g01).toContain("actingOffice.officeId === 'SOCIAL'");
    expect(g01).toContain('<SocialCommandCenter');
    expect(styles).toContain('.social-command');
    expect(styles).toContain('.social-network__flow');
    expect(styles).toContain('.social-response-card');
    expect(styles).toContain('.social-publish-review');
    expect(styles).toContain('.social-button:focus-visible');
    expect(styles).toContain('(prefers-reduced-motion: reduce)');
  });
});
