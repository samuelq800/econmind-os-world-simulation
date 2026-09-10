import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FixtureTransport,
  addDecimal,
  buildCalibrationPackage,
  calibrationAdapters,
  canonicalJson,
  comtradeAdapter,
  createSnapshotMetadata,
  deterministicCandidateOrder,
  divideDecimalExactly,
  multiplyDecimal,
  normalizeRecord,
  retrieveSnapshot,
  sha256Bytes,
  subtractDecimal,
  validateAndSummarizeFlows,
  verifyCalibrationPackage,
  verifySnapshot,
  wdiAdapter,
  wtoAdapter,
} from '../../packages/calibration/src/index.js';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const fixture = (name: string): Promise<Buffer> =>
  readFile(path.join(root, 'data/calibration/fixtures', name));

describe('Calibration Foundation V1 exactness and hashing', () => {
  it('canonicalizes object key order and hashes exact bytes', () => {
    expect(canonicalJson({ z: '0.10', a: [2, 1] })).toBe(
      '{"a":[2,1],"z":"0.10"}',
    );
    expect(sha256Bytes(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('uses exact string-backed decimal arithmetic and rejects implicit rounding', () => {
    expect(addDecimal('0.1', '0.2')).toBe('0.3');
    expect(subtractDecimal('28.1', '30.6')).toBe('-2.5');
    expect(multiplyDecimal('2.5', '4')).toBe('10');
    expect(divideDecimalExactly('3', '6')).toBe('0.5');
    expect(() => divideDecimalExactly('1', '3')).toThrow(
      'CALIBRATION_ROUNDING_POLICY_REQUIRED',
    );
  });

  it('binds calibration package identity to sorted immutable inputs', () => {
    const packageValue = buildCalibrationPackage({
      packageId: 'pilot-foundation-v1',
      schemaVersion: 'calibration-package.v1',
      calibrationVersion: '1.0.0',
      status: 'DEVELOPMENT_NON_AUTHORITATIVE',
      asOfDate: '2026-09-10',
      sourceSnapshotSet: ['snap-b', 'snap-a'],
      transformationVersions: ['z@1', 'a@1'],
      variableRegistryVersion: '2.0.0',
      countryArchetypeVersion: '1.0.0-design',
      tradeCalibrationVersion: '1.0.0-design',
      generatorVersion: 'not-implemented',
    });
    expect(packageValue.sourceSnapshotSet).toEqual(['snap-a', 'snap-b']);
    expect(verifyCalibrationPackage(packageValue)).toBe(true);
    expect(
      verifyCalibrationPackage({ ...packageValue, asOfDate: '2026-09-11' }),
    ).toBe(false);
  });
});

describe('Calibration source adapters and snapshots', () => {
  it('has unique adapter IDs and deterministic request parameter ordering', () => {
    expect(
      new Set(calibrationAdapters.map((adapter) => adapter.sourceId)).size,
    ).toBe(3);
    expect(
      wdiAdapter.buildRequest({
        indicator: 'SP.POP.TOTL',
        economy: 'USA',
        date: '2020:2023',
      }).url,
    ).toContain('date=2020%3A2023&format=json&per_page=20000');
  });

  it('parses a WDI fixture without converting decimal text to a float', async () => {
    const bytes = await fixture('wdi.gdp.usa-chn.2022-2023.json');
    const records = wdiAdapter.parse(bytes);
    expect(records).toHaveLength(4);
    expect(records[0]?.value).toBe('27292170793297.5');
    expect(records[3]?.value).toBeNull();
  });

  it('parses WTO CSV including source flags', async () => {
    const records = wtoAdapter.parse(await fixture('wto.tariff.sample.csv'));
    expect(records[0]).toMatchObject({
      geographyId: 'USA',
      value: '3.4',
      sourceUnit: 'PERCENT',
    });
    expect(records[1]?.qualityFlags).toEqual(['WTO_FLAG:E']);
  });

  it('parses UN Comtrade bilateral values and marks aggregates', async () => {
    const records = comtradeAdapter.parse(
      await fixture('comtrade.bilateral.sample.json'),
    );
    expect(records[0]).toMatchObject({
      geographyId: 'USA',
      value: '147806742110',
    });
    expect(records[0]?.qualityFlags).toEqual(['COMTRADE_AGGREGATE']);
  });

  it('creates and verifies immutable content-addressed snapshot metadata', async () => {
    const bytes = await fixture('wto.tariff.sample.csv');
    const request = wtoAdapter.buildRequest({
      indicator: 'TP_A_0010',
      reporter: 'USA',
      year: '2023',
    });
    const input = {
      snapshotId: 'snap-wto-fixture-001',
      retrievedAt: '2026-09-10T00:00:00.000Z',
      sourceAsOf: '2023',
      providerVersion: 'fixture-v1',
      status: 'FIXTURE' as const,
    };
    const metadata = createSnapshotMetadata(request, bytes, input);
    expect(verifySnapshot(metadata, bytes)).toBe(true);
    expect(verifySnapshot(metadata, Buffer.from('changed'))).toBe(false);
    expect(Object.isFrozen(metadata)).toBe(true);
    const retrieved = await retrieveSnapshot(
      request,
      new FixtureTransport({ WTO_TIMESERIES_V1: bytes }),
      input,
    );
    expect(retrieved.metadata.sha256).toBe(metadata.sha256);
  });

  it('keeps every committed fixture bound to its manifest hash and byte length', async () => {
    const manifest = JSON.parse(
      await readFile(
        path.join(root, 'data/calibration/fixtures/manifest.v1.json'),
        'utf8',
      ),
    ) as {
      fixtures: Array<{ path: string; sha256: string; byteLength: number }>;
    };
    for (const entry of manifest.fixtures) {
      const bytes = await fixture(entry.path);
      expect(bytes.byteLength).toBe(entry.byteLength);
      expect(sha256Bytes(bytes)).toBe(entry.sha256);
    }
  });

  it('normalizes deterministically with observed provenance', async () => {
    const bytes = await fixture('wto.tariff.sample.csv');
    const request = wtoAdapter.buildRequest({
      indicator: 'TP_A_0010',
      reporter: 'USA',
      year: '2023',
    });
    const snapshot = createSnapshotMetadata(request, bytes, {
      snapshotId: 'snap-wto-fixture-001',
      retrievedAt: '2026-09-10T00:00:00.000Z',
      sourceAsOf: '2023',
      providerVersion: 'fixture-v1',
      status: 'FIXTURE',
    });
    const record = wtoAdapter.parse(bytes)[0];
    expect(record).toBeDefined();
    const plan = {
      variableId: 'applied_tariff_pct',
      canonicalUnit: 'PERCENT',
      acceptedSourceUnit: 'PERCENT',
      transformationId: 'IDENTITY_DECIMAL',
      transformationVersion: '1.0.0',
    };
    const first = normalizeRecord(record!, snapshot, plan);
    const second = normalizeRecord(record!, snapshot, plan);
    expect(first).toEqual(second);
    expect(first.dataClass).toBe('OBSERVED');
    expect(first.provenance).toEqual([
      'snap-wto-fixture-001',
      record!.sourceObservationKey,
    ]);
  });
});

describe('Calibration registries, archetypes, trade, and runtime boundary', () => {
  it('verifies the committed development package example hash', async () => {
    const packageValue = JSON.parse(
      await readFile(
        path.join(
          root,
          'data/calibration/examples/calibration_package.development.json',
        ),
        'utf8',
      ),
    );
    expect(verifyCalibrationPackage(packageValue)).toBe(true);
  });

  it('has unique source IDs, official URLs, explicit status, and no embedded secret field', async () => {
    const registry = JSON.parse(
      await readFile(
        path.join(root, 'data/calibration/source_registry.v2.json'),
        'utf8',
      ),
    ) as { sources: Array<Record<string, unknown>> };
    const ids = registry.sources.map((source) => source['sourceId']);
    expect(new Set(ids).size).toBe(ids.length);
    for (const source of registry.sources) {
      expect(String(source['officialUrl'])).toMatch(/^https:\/\//);
      expect(String(source['status'])).toMatch(/FIXTURE|INTERFACE/);
      expect(
        Object.keys(source).some((key) => /secret|token|apiKey/i.test(key)),
      ).toBe(false);
    }
  });

  it('has unique variable IDs, explicit units/classes, and valid source mappings', async () => {
    const [sourceRegistry, variableRegistry] = await Promise.all([
      readFile(
        path.join(root, 'data/calibration/source_registry.v2.json'),
        'utf8',
      ),
      readFile(
        path.join(root, 'data/calibration/variable_registry.v2.json'),
        'utf8',
      ),
    ]);
    const sources = JSON.parse(sourceRegistry) as {
      sources: Array<{ sourceId: string }>;
    };
    const variables = JSON.parse(variableRegistry) as {
      variables: Array<{
        variableId: string;
        canonicalUnit: string;
        dataClass: string;
        preferredSourceId: string;
      }>;
    };
    const sourceIds = new Set(sources.sources.map(({ sourceId }) => sourceId));
    const variableIds = variables.variables.map(({ variableId }) => variableId);
    expect(new Set(variableIds).size).toBe(variableIds.length);
    for (const variable of variables.variables) {
      expect(variable.canonicalUnit.length).toBeGreaterThan(0);
      expect([
        'OBSERVED',
        'DERIVED',
        'SYNTHETIC_CALIBRATION',
        'PLACEHOLDER',
      ]).toContain(variable.dataClass);
      expect(sourceIds.has(variable.preferredSourceId)).toBe(true);
    }
  });

  it('orders archetype candidates reproducibly by seed without creating a final world', () => {
    const candidates = ['candidate-c', 'candidate-a', 'candidate-b'];
    expect(deterministicCandidateOrder('season-1-pilot', candidates)).toEqual(
      deterministicCandidateOrder('season-1-pilot', [...candidates].reverse()),
    );
    expect(
      deterministicCandidateOrder('season-1-pilot', candidates),
    ).not.toEqual(deterministicCandidateOrder('season-2-pilot', candidates));
  });

  it('rejects self-trade and emits exact deterministic reconciliation diagnostics', () => {
    expect(() =>
      validateAndSummarizeFlows([
        { exporterId: 'a', importerId: 'a', sectorId: 'food', value: '1' },
      ]),
    ).toThrow('Self-flow');
    expect(
      validateAndSummarizeFlows([
        { exporterId: 'b', importerId: 'a', sectorId: 'food', value: '0.2' },
        { exporterId: 'a', importerId: 'b', sectorId: 'food', value: '0.1' },
      ]),
    ).toEqual([
      {
        countryId: 'a',
        sectorId: 'food',
        exportTotal: '0.1',
        importTotal: '0.2',
      },
      {
        countryId: 'b',
        sectorId: 'food',
        exportTotal: '0.2',
        importTotal: '0.1',
      },
    ]);
  });

  it('keeps live fetch adapters outside World Core packages', async () => {
    const coreFiles = await readdir(path.join(root, 'packages/core/src'), {
      recursive: true,
    });
    const files = coreFiles.filter((name) => name.endsWith('.ts'));
    for (const file of files) {
      const content = await readFile(
        path.join(root, 'packages/core/src', file),
        'utf8',
      );
      expect(content).not.toMatch(
        /@econmind\/calibration|packages\/calibration|api\.worldbank|api\.wto|comtradeapi/,
      );
    }
  });

  it('registers calibration as an isolated architecture owner', async () => {
    const ownership = await readFile(
      path.join(root, 'scripts/architecture-ownership.mjs'),
      'utf8',
    );
    expect(ownership).toContain("CALIBRATION_DATA: 'CALIBRATION_DATA'");
    expect(ownership).toContain(
      "['packages/calibration', OWNERS.CALIBRATION_DATA]",
    );
    expect(ownership).toContain('target.owner === OWNERS.CALIBRATION_DATA');
  });
});
