import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const industryCommand = readFileSync(
  'apps/world-web/src/prototype/IndustryCommandCenter.tsx',
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

describe('Industry build command surface', () => {
  it('turns Riverside capacity work into a playable project-command loop', () => {
    for (const label of [
      'Build command',
      'Riverside capacity yard',
      'Survey site',
      'Choose build order',
      'Prepare requests',
      'Run preflight',
      'Record work order',
      'Riverside grid relay',
      'Riverside storage yard',
      'Riverside machine hall',
      'Dependency packet',
      'Field replay',
      'Open next build order',
    ]) {
      expect(industryCommand).toContain(label);
    }
    expect(industryCommand).toContain('Choose the next piece of');
    expect(industryCommand).toContain(
      'Capacity only appears through a completed',
    );
    expect(industryCommand).toContain('project pipeline.');
  });

  it('keeps physical requirements and cross-office authority visible', () => {
    expect(industryCommand).toContain(
      'Copper conductor · switchgear · machinery',
    );
    expect(industryCommand).toContain('Grid-scale storage');
    expect(industryCommand).toContain('Industrial Automation');
    expect(industryCommand).toContain('Finance decides release and payment.');
    expect(industryCommand).toContain(
      'Trade owns external sourcing, terms, and contract choice.',
    );
    expect(industryCommand).toContain(
      'Social owns the workforce response and skill pathway.',
    );
    expect(industryCommand).toContain(
      'Industry has not granted any outside approval.',
    );
    expect(industryCommand).toContain(
      'It remains an awaiting-decision draft: no funding, material',
    );
    expect(industryCommand).toContain(
      'delivery, labour, technology right, or construction progress is',
    );
  });

  it('blocks recording until survey, scope, requests, and preflight are complete', () => {
    expect(industryCommand).toContain('if (!siteSurveyed || recorded) return;');
    expect(industryCommand).toContain(
      'if (!selectedOrder || recorded) return;',
    );
    expect(industryCommand).toContain(
      'if (!selectedOrder || !requestsPrepared || recorded) return;',
    );
    expect(industryCommand).toMatch(
      /if \(!selectedOrder \|\| !requestsPrepared \|\| !preflightOpen \|\| recorded\)\s*return;/,
    );
    expect(industryCommand).toContain('No World State changed.');
  });

  it('is a local, non-authoritative front-end rehearsal', () => {
    expect(industryCommand).toContain(
      'No World State changed. No project, facility, or request was',
    );
    expect(industryCommand).not.toContain('fetch(');
    expect(industryCommand).not.toContain('submitCommand');
    expect(industryCommand).not.toContain('@econmind/core');
    expect(industryCommand).not.toContain('supabase');
    expect(industryCommand).not.toContain('Industry Strength');
  });

  it('routes Industry to its dedicated command page while retaining the shared national view', () => {
    expect(g01).toContain('import { IndustryCommandCenter }');
    expect(g01).toContain('INDUSTRY_NAV_GROUPS');
    expect(g01).toContain("actingOffice.officeId === 'INDUSTRY'");
    expect(g01).toContain('<IndustryCommandCenter');
    expect(g01).toContain('<NationalOverview');
    expect(g01).toContain('<LivingNationScene');
  });

  it('uses the existing World visual language with keyboard and motion safeguards', () => {
    expect(styles).toContain('.industry-command');
    expect(styles).toContain('.industry-yard__map');
    expect(styles).toContain('.industry-build-card');
    expect(styles).toContain('.industry-request-grid');
    expect(styles).toContain('.industry-preflight__checks');
    expect(styles).toContain('.industry-button:focus-visible');
    expect(styles).toContain('(prefers-reduced-motion: reduce)');
    expect(styles).toContain('(forced-colors: active)');
  });
});
