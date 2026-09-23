import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  FIXTURE_OFFICES,
  fixtureProjectionForOffice,
} from '../../apps/world-web/src/prototype/fixtures.js';

const entryFlow = readFileSync(
  'apps/world-web/src/prototype/OfficeEntryFlow.tsx',
  'utf8',
);
const fixtureData = readFileSync(
  'apps/world-web/src/prototype/fixtures.ts',
  'utf8',
);
const nationalOverview = readFileSync(
  'apps/world-web/src/prototype/NationalOverview.tsx',
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

describe('fixture entry and G02 national overview', () => {
  it('keeps country and Office selection as an explicit non-authoritative path', () => {
    expect(entryFlow).toContain('Choose your country.');
    expect(entryFlow).toContain('Choose an Office to preview.');
    expect(entryFlow).toContain('does not create an appointment');
    expect(entryFlow).toContain('RETURNING FIXTURE');
    for (const office of [
      'CAPTAIN',
      'CENTRAL_BANK',
      'FINANCE',
      'TRADE',
      'INDUSTRY',
      'SOCIAL',
    ]) {
      expect(fixtureData).toContain(`'${office}'`);
    }
  });

  it('uses a selected fixture Office only as a view lens', () => {
    const socialPreview = fixtureProjectionForOffice('SOCIAL');

    expect(FIXTURE_OFFICES).toHaveLength(6);
    expect(socialPreview.viewer.actingOfficeId).toBe('SOCIAL');
    expect(socialPreview.viewer.offices).toEqual([
      expect.objectContaining({ officeId: 'SOCIAL' }),
    ]);
  });

  it('makes G02 a read-only national context with a route back to G01', () => {
    expect(g01).toContain(
      "{ pageId: 'G02', label: 'Nation overview', implemented: true }",
    );
    expect(g01).toContain('<NationalOverview');
    expect(nationalOverview).toContain('Read the country before acting.');
    expect(nationalOverview).toContain('not rendered as zero or an');
    expect(nationalOverview).toContain('Open G01 Office brief');
    expect(nationalOverview).not.toContain('<input');
    expect(nationalOverview).not.toContain('fetch(');
    expect(nationalOverview).not.toContain('submitCommand');
    expect(nationalOverview).not.toContain('@econmind/core');
  });

  it('keeps the new desktop layouts local, responsive, and accessible', () => {
    expect(styles).toContain('.entry-flow');
    expect(styles).toContain('.national-overview');
    expect(styles).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr))',
    );
    expect(styles).toContain('@media (max-width: 1040px)');
    expect(styles).toContain('@media (forced-colors: active)');
  });
});
