import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  inspectOfficialOpeningDecisionSource,
  isVerifiedOfficialOpeningDecisionSource,
  OFFICIAL_OPENING_RECONCILIATION_PINS,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';

const root = path.resolve(import.meta.dirname, '../..');
const proposalPath =
  '/Users/samuel/Documents/econclub/artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md';
const read = (file: string) => readFile(path.join(root, file), 'utf8');
const mappingBytes = await read(
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
);
const mapping = JSON.parse(mappingBytes) as {
  source: { dataFiles: Record<string, unknown> };
};
const fixture: OfficialOpeningSourceBytes = {
  mappingBytes,
  checksumsBytes: await read(
    'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
  ),
  coverageBytes: await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
  ),
  proposalBytes: await readFile(proposalPath, 'utf8'),
  datasets: Object.fromEntries(
    await Promise.all(
      Object.keys(mapping.source.dataFiles).map(async (sourcePath) => [
        sourcePath,
        await read(`artifacts/world-balanced-candidate-v1/${sourcePath}`),
      ]),
    ),
  ),
};

describe('frozen official opening source reconciliation (not adoption)', () => {
  it('validates the actual frozen 70-country source without regenerating reports', () => {
    const result = inspectOfficialOpeningDecisionSource(fixture);
    expect(result.status).toBe('VALIDATED_SOURCE_NOT_ADOPTION');
    if (result.source === null)
      throw new Error(JSON.stringify(result.blockers));
    expect(result.source.countryIds).toHaveLength(70);
    expect(new Set(result.source.countryIds).size).toBe(70);
    expect(result.source.countryIds).toContain('COUNTRY_54');
    expect(result.source.financeOriginals).toHaveLength(70);
    expect(result.source.stocks).toHaveLength(840);
    expect(result.source.domains).toHaveLength(34);
    expect(result.source.pins).toEqual(OFFICIAL_OPENING_RECONCILIATION_PINS);
    expect(isVerifiedOfficialOpeningDecisionSource(result.source)).toBe(true);
    expect(Object.isFrozen(result.source)).toBe(true);
    expect(Object.isFrozen(result.source.financeOriginals[0])).toBe(true);
    expect(result).not.toHaveProperty('manifest');
    expect(result).not.toHaveProperty('seed');
    expect(result.source).not.toHaveProperty('worldId');
  });

  it('preserves exact lexemes and separates original L/E from reported expectations', () => {
    const result = inspectOfficialOpeningDecisionSource(fixture);
    if (result.source === null)
      throw new Error(JSON.stringify(result.blockers));
    const original = result.source.financeOriginals.find(
      (row) => row.countryId === 'visual-territory-01',
    );
    const reported = result.source.financeReportedReconciliation.find(
      (row) => row.coreCountryId === 'COUNTRY_01',
    );
    expect(original).toMatchObject({
      householdBankDeposits: '17548540099.199997',
      bankDepositLiabilities: '23398053465.6',
      bankEquity: '2339805346.56',
      bankLoanAssets: '0',
    });
    expect(reported).toMatchObject({
      expectedDepositLiabilities: '23398053465.599997',
      expectedBankEquity: '2339805346.560003',
      correctedOrRounded: false,
    });
    expect(original).not.toHaveProperty('adoptedDepositLiabilities');
    expect(
      result.source.financeOriginals.find(
        (row) => row.countryId === 'visual-territory-20',
      )?.cashRunwayDays,
    ).toBe('660.0');
    expect(result.source.stockOriginals).toHaveLength(840);
    expect(result.source.stocks[0]).toMatchObject({
      unit: 'barrel',
      titleHolderId: null,
      riskBearerId: null,
    });
  });

  it('keeps source-only domains and proposals non-operational', () => {
    const result = inspectOfficialOpeningDecisionSource(fixture);
    if (result.source === null)
      throw new Error(JSON.stringify(result.blockers));
    for (const name of [
      'facilities',
      'deposits',
      'water-allocations',
      'power',
      'employment',
      'population-services',
    ]) {
      expect(
        result.source.domains.find((row) => row.dataset === name),
      ).toMatchObject({ adoptionStatus: 'PROPOSAL_ONLY' });
    }
    expect(
      result.source.domains.find((row) => row.dataset === 'finance'),
    ).toMatchObject({
      adoptionStatus: 'SOURCE_ONLY_NOT_ADOPTED',
      sourceSha256:
        '4f30d7dd43aa2190604d4fb73c776a8d4aaa263653dc783def6f7c2c5cc80805',
      countryIds: result.source.countryIds,
      sourceDeclaredUnits: ['GCU_SCENARIO_ACCOUNTING_UNIT'],
      unitAuthority: 'EXPLICIT_SOURCE_FIELDS_ONLY',
    });
    expect(isVerifiedOfficialOpeningDecisionSource({ ...result.source })).toBe(
      false,
    );
  });

  it.each([
    'mappingBytes',
    'coverageBytes',
    'checksumsBytes',
    'proposalBytes',
  ] as const)('rejects changed pinned %s with a field blocker', (field) => {
    const result = inspectOfficialOpeningDecisionSource({
      ...fixture,
      [field]: fixture[field] + '\n',
    });
    expect(result).toMatchObject({
      status: 'INVALID_SOURCE',
      source: null,
      blockers: [{ field }],
    });
  });

  it('rejects rounded source, even when JSON still parses and total counts are unchanged', () => {
    const sourcePath = 'data/finance.json';
    const bytes = fixture.datasets[sourcePath];
    if (bytes === undefined) throw new Error('Missing finance fixture');
    const result = inspectOfficialOpeningDecisionSource({
      ...fixture,
      datasets: {
        ...fixture.datasets,
        [sourcePath]: bytes.replace('17548540099.199997', '17548540099.20'),
      },
    });
    expect(result).toMatchObject({ status: 'INVALID_SOURCE', source: null });
    expect(result.blockers[0]?.field).toBe(
      'datasets/data/finance.json/identity',
    );
  });

  it('rejects missing/extra datasets instead of trusting aggregate coverage counts', () => {
    const { ['data/power.json']: missing, ...datasets } = fixture.datasets;
    expect(missing).toBeDefined();
    expect(
      inspectOfficialOpeningDecisionSource({ ...fixture, datasets }),
    ).toMatchObject({
      status: 'INVALID_SOURCE',
      blockers: [{ field: 'datasets/paths' }],
      source: null,
    });
    expect(
      inspectOfficialOpeningDecisionSource({
        ...fixture,
        datasets: { ...fixture.datasets, 'data/other.json': '[]' },
      }),
    ).toMatchObject({ status: 'INVALID_SOURCE', source: null });
  });

  it('rejects duplicated/cross-bound countries or replaced units in the immutable mapping', () => {
    for (const [from, to] of [
      ['COUNTRY_01', 'COUNTRY_02'],
      ['barrel', 'tonne'],
    ]) {
      if (from === undefined || to === undefined)
        throw new Error('Invalid case');
      const result = inspectOfficialOpeningDecisionSource({
        ...fixture,
        mappingBytes: fixture.mappingBytes.replace(from, to),
      });
      expect(result).toMatchObject({
        status: 'INVALID_SOURCE',
        blockers: [{ field: 'mappingBytes' }],
        source: null,
      });
    }
  });
});
