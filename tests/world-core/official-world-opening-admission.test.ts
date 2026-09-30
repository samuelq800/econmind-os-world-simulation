import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  OfficialWorldOpeningBootstrapper,
  inspectOfficialWorldOpeningAdmission,
} from '../../apps/world-worker/src/preparation/official-world-opening-admission.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';

const root = path.resolve(import.meta.dirname, '../..');
const packageRoot = path.join(
  root,
  'artifacts/world-balanced-candidate-v1/data',
);
const checksum =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

interface SourceCountry {
  readonly id: string;
  readonly number: string;
  readonly population: number;
}

interface SourceStock {
  readonly countryId: string;
  readonly commodityId: string;
  readonly unit: string;
  readonly available: number;
}

function canonicalReport(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalReport(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalReport(record[key])}`)
    .join(',')}}`;
}

function withFingerprint<T extends Record<string, unknown>, F extends string>(
  body: T,
  field: F,
): T & Record<F, string> {
  return {
    ...body,
    [field]: `sha256:${sha256Hex(canonicalReport(body))}`,
  } as T & Record<F, string>;
}

async function blockedSourceFixture() {
  const selectionBytes = await readFile(
    path.join(root, 'status/world-data-selection.json'),
    'utf8',
  );
  const countries = JSON.parse(
    await readFile(path.join(packageRoot, 'countries.json'), 'utf8'),
  ) as SourceCountry[];
  const stocks = JSON.parse(
    await readFile(path.join(packageRoot, 'stocks.json'), 'utf8'),
  ) as SourceStock[];
  const core = (source: string) => `COUNTRY_${source.slice(-2)}`;
  const mapping = withFingerprint(
    {
      schemaVersion: 'OFFICIAL_WORLD_OPENING_MAPPING_V1',
      source: {
        selectionSha256: sha256Hex(selectionBytes),
        packageId: 'BALANCED_2026_09_28_V1',
        checksumsSha256: checksum,
      },
      authority: {
        officialSelectedSourceDataset: true,
        proposalRecordsExecuted: false,
        workerStarted: false,
        openingSeedReady: false,
      },
      invariants: {
        countryCount: countries.length,
        populationTotal: String(
          countries.reduce((sum, country) => sum + country.population, 0),
        ),
        stockCellCount: stocks.length,
        positiveStockCellCount: stocks.filter((stock) => stock.available > 0)
          .length,
        financeRowCount: countries.length,
      },
      mappings: {
        countries: countries.map((country) => ({
          sourceCountryId: country.id,
          coreCountryId: core(country.id),
        })),
      },
      records: {
        stocks: stocks.map((stock) => ({
          sourceCountryId: stock.countryId,
          coreCountryId: core(stock.countryId),
          commodityId: stock.commodityId,
          unit: stock.unit,
          available: String(stock.available),
          reserved: '0',
          inTransit: '0',
          total: String(stock.available),
          titleHolderId: null,
          riskBearerId: null,
        })),
        finance: countries.map((country) => ({
          coreCountryId: core(country.id),
          coreSettlementCurrency: null,
        })),
      },
      countryReports: countries.map((country) => ({
        sourceCountryId: country.id,
        coreCountryId: core(country.id),
        population: String(country.population),
      })),
    },
    'mappingFingerprint',
  );
  const gaps = withFingerprint(
    {
      schemaVersion: 'OFFICIAL_WORLD_OPENING_GAPS_V1',
      sourcePackageId: 'BALANCED_2026_09_28_V1',
      sourceChecksumsSha256: checksum,
      mappingFingerprint: mapping.mappingFingerprint,
      openingSeedReady: false,
      globalGaps: [
        {
          code: 'WORLD_ID_BINDING_REQUIRED',
          blockingTarget: 'OPENING_SEED',
        },
      ],
      countries: countries.map((country) => ({
        coreCountryId: core(country.id),
        gaps: [
          {
            code: 'OWNER_LEGAL_ENTITY_BINDING_REQUIRED',
            blockingTarget: 'OPENING_SEED_INVENTORY',
          },
          {
            code: 'TEAM_ASSIGNMENT_DEFERRED',
            blockingTarget: 'TEAM_AND_ROLE_ASSIGNMENT',
          },
        ],
      })),
    },
    'gapsFingerprint',
  );
  return { selectionBytes, mapping, gaps };
}

describe('selected official World opening admission', () => {
  it('binds 70 countries and 840 stock cells but reports only opening blockers', async () => {
    const fixture = await blockedSourceFixture();
    const result = inspectOfficialWorldOpeningAdmission({
      ...fixture,
      sha256Hex,
    });
    expect(result).toMatchObject({
      status: 'BLOCKED',
      packageId: 'BALANCED_2026_09_28_V1',
      checksumsSha256: checksum,
    });
    expect(result.countryIds).toHaveLength(70);
    expect(result.stocks).toHaveLength(840);
    expect(result.finance).toHaveLength(70);
    expect(result.blockerCodes).toEqual([
      'OWNER_LEGAL_ENTITY_BINDING_REQUIRED',
      'WORLD_ID_BINDING_REQUIRED',
    ]);
    expect(result.deferredCodes).toEqual(['TEAM_ASSIGNMENT_DEFERRED']);
  });

  it('rejects a changed source amount, missing country or forged ready state', async () => {
    const fixture = await blockedSourceFixture();
    const changed = structuredClone(fixture.mapping);
    changed.records.stocks[0]!.available = '999999';
    expect(() =>
      inspectOfficialWorldOpeningAdmission({
        ...fixture,
        mapping: changed,
        sha256Hex,
      }),
    ).toThrow('mappingFingerprint');
    const missing = structuredClone(fixture.mapping);
    missing.mappings.countries.pop();
    const missingMapping = withFingerprint(
      Object.fromEntries(
        Object.entries(missing).filter(([key]) => key !== 'mappingFingerprint'),
      ),
      'mappingFingerprint',
    );
    const missingGaps = structuredClone(fixture.gaps);
    missingGaps.mappingFingerprint = missingMapping.mappingFingerprint;
    const reboundGaps = withFingerprint(
      Object.fromEntries(
        Object.entries(missingGaps).filter(
          ([key]) => key !== 'gapsFingerprint',
        ),
      ),
      'gapsFingerprint',
    );
    expect(() =>
      inspectOfficialWorldOpeningAdmission({
        selectionBytes: fixture.selectionBytes,
        mapping: missingMapping,
        gaps: reboundGaps,
        sha256Hex,
      }),
    ).toThrow('does not bind the selected 70-country package');
    const forgedMapping = structuredClone(fixture.mapping);
    const forgedGaps = structuredClone(fixture.gaps);
    forgedMapping.authority.openingSeedReady = true;
    forgedGaps.openingSeedReady = true;
    const resignedMapping = withFingerprint(
      Object.fromEntries(
        Object.entries(forgedMapping).filter(
          ([key]) => key !== 'mappingFingerprint',
        ),
      ),
      'mappingFingerprint',
    );
    forgedGaps.mappingFingerprint = resignedMapping.mappingFingerprint;
    const resignedGaps = withFingerprint(
      Object.fromEntries(
        Object.entries(forgedGaps).filter(([key]) => key !== 'gapsFingerprint'),
      ),
      'gapsFingerprint',
    );
    expect(() =>
      inspectOfficialWorldOpeningAdmission({
        selectionBytes: fixture.selectionBytes,
        mapping: resignedMapping,
        gaps: resignedGaps,
        sha256Hex,
      }),
    ).toThrow('readiness contradicts');
  });

  it('fails before any database write when the actual opening handoff is blocked', async () => {
    const fixture = await blockedSourceFixture();
    const database = createPGliteV09AtomicTestDatabase();
    try {
      const service = new OfficialWorldOpeningBootstrapper({
        database,
        sha256Hex,
      });
      await expect(
        service.bootstrap({
          ...fixture,
          expectedMappingFingerprint: fixture.mapping.mappingFingerprint,
          expectedGapsFingerprint: fixture.gaps.gapsFingerprint,
          expectedSeedFingerprint: 'sha256:NOT_AN_APPROVED_SEED',
          seed: null,
          bootstrappedAtReal: '2026-09-30T00:00:00.000Z',
        }),
      ).rejects.toThrow('Official opening is blocked');
    } finally {
      await database.close();
    }
  });
});
