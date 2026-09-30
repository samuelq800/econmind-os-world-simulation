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
const mapManifestSha =
  '9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f';
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
  const checksumsBytes = await readFile(
    path.join(root, 'artifacts/world-balanced-candidate-v1/CHECKSUMS.json'),
    'utf8',
  );
  const mapManifestBytes = await readFile(
    path.join(root, 'artifacts/world-map-files-v1/manifest.json'),
    'utf8',
  );
  const regionsBytes = await readFile(
    path.join(packageRoot, 'regions.json'),
    'utf8',
  );
  const sourceRegions = JSON.parse(regionsBytes) as Array<{
    id: string;
    countryId: string;
  }>;
  const checksumRows = JSON.parse(checksumsBytes) as Array<{
    path: string;
    sha256: string;
    bytes: number;
  }>;
  const mapManifest = JSON.parse(mapManifestBytes) as {
    files: Array<{ path: string; sha256: string; bytes: number }>;
  };
  const dataFiles = Object.fromEntries(
    checksumRows
      .filter(
        (row) => row.path.startsWith('data/') && row.path.endsWith('.json'),
      )
      .map((row) => [row.path, { sha256: row.sha256, bytes: row.bytes }]),
  );
  const allOfficialDatasets = Object.entries(dataFiles).map(
    ([sourcePath, sourceFile]) => ({
      dataset: sourcePath.slice('data/'.length, -'.json'.length),
      sourcePath,
      sourceSha256: sourceFile.sha256,
      sourceBytes: sourceFile.bytes,
      structuredMappingStatus: 'FULL_SOURCE_RECORDS_INCLUDED_LOSSLESS',
      records:
        sourcePath === 'data/seasonal-water.json'
          ? [
              {
                regionBindings: [
                  {
                    sourceRegionId: 'visual-territory-01-E1',
                    normalizedRegionId: 'REGION_01_E1',
                  },
                ],
                countryBindings: [
                  {
                    sourceCountryId: 'visual-territory-01',
                    coreCountryId: 'COUNTRY_01',
                  },
                ],
              },
            ]
          : [{}],
    }),
  );
  const core = (source: string) => `COUNTRY_${source.slice(-2)}`;
  const mapping = withFingerprint(
    {
      schemaVersion: 'OFFICIAL_WORLD_OPENING_MAPPING_V2',
      source: {
        selectionSha256: sha256Hex(selectionBytes),
        packageId: 'BALANCED_2026_09_28_V1',
        checksumsSha256: checksum,
        checksumEntries: 86,
        verifiedArtifactsIncludingChecksumManifest: 87,
        dataFiles,
        mapPackage: {
          packageId: 'WORLD_MAP_FILES_V1_2026_09_28',
          manifestSha256: mapManifestSha,
          filesVerified: 203,
          authority: 'VERSIONED_FILE_ASSETS_ONLY_NOT_WORLD_STATE',
        },
      },
      authority: {
        officialSelectedSourceDataset: true,
        sourceProposalLabelsPreserved: true,
        proposalRecordsExecuted: false,
        workerStarted: false,
        productionDatabaseMutated: false,
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
        completeStructuredDatasetCount: 34,
        candidateArtifactsEnumerated: 87,
        mapPackageFilesEnumerated: 203,
      },
      mappings: {
        countries: countries.map((country) => ({
          sourceCountryId: country.id,
          coreCountryId: core(country.id),
        })),
        regions: sourceRegions.map((region) => ({
          sourceRegionId: region.id,
          normalizedRegionId: region.id
            .replace('visual-territory-', 'REGION_')
            .replace('-E', '_E'),
          sourceCountryId: region.countryId,
          coreCountryId: core(region.countryId),
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
        allOfficialDatasets,
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
  const coverage = withFingerprint(
    {
      schemaVersion: 'OFFICIAL_WORLD_COMPLETE_COVERAGE_V1',
      mappingFingerprint: mapping.mappingFingerprint,
      gapsFingerprint: gaps.gapsFingerprint,
      counts: {
        checksumManifestEntries: 86,
        sourceArtifactsIncludingChecksumManifest: 87,
        structuredJsonDatasets: 34,
        mapPackageFiles: 203,
        countries: 70,
        omittedSourceArtifacts: 0,
        omittedStructuredDatasets: 0,
        omittedMapPackageFiles: 0,
      },
      sourceArtifacts: [
        ...checksumRows.map((row) => ({
          sourcePath: row.path,
          sha256: row.sha256,
          bytes: row.bytes,
          repositoryOriginalVerified: true,
          proposalExecuted: false,
        })),
        {
          sourcePath: 'CHECKSUMS.json',
          sha256: checksum,
          bytes: Buffer.byteLength(checksumsBytes, 'utf8'),
          repositoryOriginalVerified: true,
          proposalExecuted: false,
        },
      ],
      structuredDatasets: allOfficialDatasets.map((dataset) => ({
        sourcePath: dataset.sourcePath,
        sourceSha256: dataset.sourceSha256,
        sourceBytes: dataset.sourceBytes,
        sourceRecordsIncludedInMappingV2: true,
      })),
      mapAssets: mapManifest.files.map((file) => {
        const match = file.path.match(
          /\/(?:country-detail|country-scenes)\/(\d{2})[^/]*\.(?:svg|png)$/,
        );
        return {
          path: file.path,
          sha256: file.sha256,
          bytes: String(file.bytes),
          stableVersionedPath: file.path,
          repositoryOriginalVerified: true,
          worldStateAuthority: 'NONE_DISPLAY_OR_SOURCE_ONLY',
          sourceCountryId: match ? `visual-territory-${match[1]}` : null,
          coreCountryId: match ? `COUNTRY_${match[1]}` : null,
        };
      }),
      countries: countries.map((country) => ({
        sourceCountryId: country.id,
        coreCountryId: core(country.id),
        versionedMapAssets: mapManifest.files
          .filter((file) =>
            new RegExp(
              `/(?:country-detail|country-scenes)/${country.number}[^/]*\\.(?:svg|png)$`,
            ).test(file.path),
          )
          .map((file) => file.path),
        versionedMapAssetCount: 2,
        structuredDatasets: country.number === '01' ? ['seasonal-water'] : [],
        structuredDatasetCount: country.number === '01' ? 1 : 0,
      })),
      omissions: {
        sourceArtifacts: [],
        structuredDatasets: [],
        mapPackageFiles: [],
      },
    },
    'coverageFingerprint',
  );
  return {
    selectionBytes,
    checksumsBytes,
    mapManifestBytes,
    regionsBytes,
    mapping,
    gaps,
    coverage,
  };
}

function rebindCoverage(
  coverage: Record<string, unknown>,
  mappingFingerprint: string,
  gapsFingerprint: string,
) {
  const body = Object.fromEntries(
    Object.entries(coverage).filter(([key]) => key !== 'coverageFingerprint'),
  );
  return withFingerprint(
    { ...body, mappingFingerprint, gapsFingerprint },
    'coverageFingerprint',
  );
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
    expect(result.coverageFingerprint).toBe(
      fixture.coverage.coverageFingerprint,
    );
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
        ...fixture,
        mapping: missingMapping,
        gaps: reboundGaps,
        coverage: rebindCoverage(
          fixture.coverage,
          missingMapping.mappingFingerprint,
          reboundGaps.gapsFingerprint,
        ),
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
        ...fixture,
        mapping: resignedMapping,
        gaps: resignedGaps,
        coverage: rebindCoverage(
          fixture.coverage,
          resignedMapping.mappingFingerprint,
          resignedGaps.gapsFingerprint,
        ),
        sha256Hex,
      }),
    ).toThrow('readiness contradicts');
  });

  it('rejects a re-fingerprinted coverage ledger with one map asset missing', async () => {
    const fixture = await blockedSourceFixture();
    const changed = structuredClone(fixture.coverage);
    changed.mapAssets.pop();
    const body = Object.fromEntries(
      Object.entries(changed).filter(([key]) => key !== 'coverageFingerprint'),
    );
    expect(() =>
      inspectOfficialWorldOpeningAdmission({
        ...fixture,
        coverage: withFingerprint(body, 'coverageFingerprint'),
        sha256Hex,
      }),
    ).toThrow('complete coverage ledger');
  });

  it('rejects empty source evidence even when the artifact count is unchanged', async () => {
    const fixture = await blockedSourceFixture();
    const changed = structuredClone(fixture.coverage);
    changed.sourceArtifacts[0] = {} as (typeof changed.sourceArtifacts)[number];
    expect(() =>
      inspectOfficialWorldOpeningAdmission({
        ...fixture,
        coverage: rebindCoverage(
          changed,
          fixture.mapping.mappingFingerprint,
          fixture.gaps.gapsFingerprint,
        ),
        sha256Hex,
      }),
    ).toThrow('Covered source artifact path is not a non-empty string');
  });

  it('rejects replacing one map path with a duplicate at the same count', async () => {
    const fixture = await blockedSourceFixture();
    const changed = structuredClone(fixture.coverage);
    changed.mapAssets[1] = structuredClone(changed.mapAssets[0]!);
    expect(() =>
      inspectOfficialWorldOpeningAdmission({
        ...fixture,
        coverage: rebindCoverage(
          changed,
          fixture.mapping.mappingFingerprint,
          fixture.gaps.gapsFingerprint,
        ),
        sha256Hex,
      }),
    ).toThrow('map asset coverage differs from trusted map manifest');
  });

  it('rejects an empty map asset at the same manifest count', async () => {
    const fixture = await blockedSourceFixture();
    const changed = structuredClone(fixture.coverage);
    changed.mapAssets[0] = {} as (typeof changed.mapAssets)[number];
    expect(() =>
      inspectOfficialWorldOpeningAdmission({
        ...fixture,
        coverage: rebindCoverage(
          changed,
          fixture.mapping.mappingFingerprint,
          fixture.gaps.gapsFingerprint,
        ),
        sha256Hex,
      }),
    ).toThrow('Covered map asset path is not a non-empty string');
  });

  it('rejects a consistently forged country assignment for a trusted map path', async () => {
    const fixture = await blockedSourceFixture();
    const changed = structuredClone(fixture.coverage);
    const path = 'apps/world-web/src/assets/country-scenes/01.png';
    const asset = changed.mapAssets.find((item) => item.path === path);
    const first = changed.countries.find(
      (country) => country.coreCountryId === 'COUNTRY_01',
    );
    const second = changed.countries.find(
      (country) => country.coreCountryId === 'COUNTRY_02',
    );
    if (asset === undefined || first === undefined || second === undefined) {
      throw new Error('Missing map association fixture');
    }
    asset.coreCountryId = 'COUNTRY_02';
    asset.sourceCountryId = 'visual-territory-02';
    first.versionedMapAssets = first.versionedMapAssets.filter(
      (candidate) => candidate !== path,
    );
    first.versionedMapAssetCount = first.versionedMapAssets.length;
    second.versionedMapAssets.push(path);
    second.versionedMapAssetCount = second.versionedMapAssets.length;
    expect(() =>
      inspectOfficialWorldOpeningAdmission({
        ...fixture,
        coverage: rebindCoverage(
          changed,
          fixture.mapping.mappingFingerprint,
          fixture.gaps.gapsFingerprint,
        ),
        sha256Hex,
      }),
    ).toThrow('map asset country differs from its trusted path');
  });

  it('rejects assigning a global support asset to a country', async () => {
    const fixture = await blockedSourceFixture();
    const changed = structuredClone(fixture.coverage);
    const global = changed.mapAssets.find(
      (asset) =>
        asset.path === 'apps/world-web/src/assets/continent-scenes/index.json',
    );
    if (global === undefined) throw new Error('Missing global map fixture');
    global.coreCountryId = 'COUNTRY_01';
    global.sourceCountryId = 'visual-territory-01';
    expect(() =>
      inspectOfficialWorldOpeningAdmission({
        ...fixture,
        coverage: rebindCoverage(
          changed,
          fixture.mapping.mappingFingerprint,
          fixture.gaps.gapsFingerprint,
        ),
        sha256Hex,
      }),
    ).toThrow('global map asset is assigned to a country');
  });

  it('rejects a duplicated country row at the same country count', async () => {
    const fixture = await blockedSourceFixture();
    const changed = structuredClone(fixture.coverage);
    changed.countries[1] = structuredClone(changed.countries[0]!);
    expect(() =>
      inspectOfficialWorldOpeningAdmission({
        ...fixture,
        coverage: rebindCoverage(
          changed,
          fixture.mapping.mappingFingerprint,
          fixture.gaps.gapsFingerprint,
        ),
        sha256Hex,
      }),
    ).toThrow('country coverage differs from mapped assets');
  });

  it('rejects a region-only record missing its derived country association', async () => {
    const fixture = await blockedSourceFixture();
    const changed = structuredClone(fixture.mapping);
    const seasonal = changed.records.allOfficialDatasets.find(
      (dataset) => dataset.sourcePath === 'data/seasonal-water.json',
    );
    if (seasonal === undefined) throw new Error('Missing seasonal fixture');
    const record = seasonal.records[0] as { countryBindings?: unknown[] };
    record.countryBindings = [];
    const remapped = withFingerprint(
      Object.fromEntries(
        Object.entries(changed).filter(([key]) => key !== 'mappingFingerprint'),
      ),
      'mappingFingerprint',
    );
    const updatedGaps = withFingerprint(
      {
        ...Object.fromEntries(
          Object.entries(fixture.gaps).filter(
            ([key]) => key !== 'gapsFingerprint',
          ),
        ),
        mappingFingerprint: remapped.mappingFingerprint,
      },
      'gapsFingerprint',
    );
    expect(() =>
      inspectOfficialWorldOpeningAdmission({
        ...fixture,
        mapping: remapped,
        gaps: updatedGaps,
        coverage: rebindCoverage(
          fixture.coverage,
          remapped.mappingFingerprint,
          updatedGaps.gapsFingerprint,
        ),
        sha256Hex,
      }),
    ).toThrow('region record is missing its country association');
  });

  it('rejects a region record attributed to the wrong mapped country', async () => {
    const fixture = await blockedSourceFixture();
    const changed = structuredClone(fixture.mapping);
    const seasonal = changed.records.allOfficialDatasets.find(
      (dataset) => dataset.sourcePath === 'data/seasonal-water.json',
    );
    if (seasonal === undefined) throw new Error('Missing seasonal fixture');
    const record = seasonal.records[0] as {
      countryBindings?: Array<{
        sourceCountryId: string;
        coreCountryId: string;
      }>;
    };
    record.countryBindings = [
      { sourceCountryId: 'visual-territory-02', coreCountryId: 'COUNTRY_02' },
    ];
    const remapped = withFingerprint(
      Object.fromEntries(
        Object.entries(changed).filter(([key]) => key !== 'mappingFingerprint'),
      ),
      'mappingFingerprint',
    );
    const updatedGaps = withFingerprint(
      {
        ...Object.fromEntries(
          Object.entries(fixture.gaps).filter(
            ([key]) => key !== 'gapsFingerprint',
          ),
        ),
        mappingFingerprint: remapped.mappingFingerprint,
      },
      'gapsFingerprint',
    );
    expect(() =>
      inspectOfficialWorldOpeningAdmission({
        ...fixture,
        mapping: remapped,
        gaps: updatedGaps,
        coverage: rebindCoverage(
          fixture.coverage,
          remapped.mappingFingerprint,
          updatedGaps.gapsFingerprint,
        ),
        sha256Hex,
      }),
    ).toThrow('region record is missing its country association');
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
          expectedCoverageFingerprint: fixture.coverage.coverageFingerprint,
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
