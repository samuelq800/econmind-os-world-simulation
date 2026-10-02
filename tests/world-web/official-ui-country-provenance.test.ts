import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  canonicalDecimal,
  parseLosslessJson,
} from '../../scripts/official-world-opening-mapping.mjs';
import {
  officialFieldUnit,
  syncOfficialUiCountryData,
} from '../../scripts/sync-official-ui-country-data.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outputRoot = path.join(
  root,
  'apps/world-web/public/season1-immersive/countries/data',
);
type Row = Record<string, unknown>;
interface Field {
  exact: string;
  rawToken: string;
  dataset: string;
  rowId: string;
  rowIndex: number;
  field: string;
  sourcePointer: string;
  unit: string;
  unitBasis: string;
  nature: string;
}
interface Collection {
  countExact: string;
  dataset: string;
  sourceRowIds: string[];
  predicate: { countryId: string; scenarioRole?: string };
  rule: string;
  nature: string;
}
interface Country extends Row {
  id: string;
  number: string;
  facilities: Row[];
  resources: Row[];
  regions: Row[];
  profile: Row;
  power: Row;
  officialOpening: Row;
  officialSource: {
    schemaVersion: string;
    authority: string;
    sourcePackageId: string;
    sourceChecksumsSha256: string;
    datasets: Record<
      string,
      { sourcePath: string; sha256: string; recordCountExact: string }
    >;
    fields: Record<string, Field>;
    collections: {
      facilities: Collection;
      resources: Collection;
      historicalDevelopmentOptions: Collection;
    };
  };
}
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const countries = await Promise.all(
  Array.from({ length: 70 }, async (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return JSON.parse(
      await readFile(path.join(outputRoot, `${number}.json`), 'utf8'),
    ) as Country;
  }),
);
const sources = new Map<string, { raw: string; rows: Row[]; exact: Row[] }>();
const firstCountry = countries[0];
if (!firstCountry) throw new Error('Missing country 01');
const requireField = (country: Country, pointer: string): Field => {
  const field = country.officialSource.fields[pointer];
  if (!field)
    throw new Error(`Missing exact field: ${country.number}${pointer}`);
  return field;
};
for (const [dataset, spec] of Object.entries(
  firstCountry.officialSource.datasets,
)) {
  const raw = await readFile(
    path.join(root, 'artifacts/world-balanced-candidate-v1', spec.sourcePath),
    'utf8',
  );
  sources.set(dataset, {
    raw,
    rows: JSON.parse(raw),
    exact: parseLosslessJson(raw, dataset),
  });
}
const fromPointer = (row: unknown, pointer: string): unknown =>
  pointer
    .split('/')
    .slice(1)
    .reduce(
      (value, key) =>
        (value as Row)[key.replace(/~1/g, '/').replace(/~0/g, '~')],
      row,
    );
const numericPointers = (value: unknown, prefix: string): string[] => {
  if (typeof value === 'number') return [prefix];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    numericPointers(child, `${prefix}/${key}`),
  );
};

describe('C exact selected-source UI provenance', () => {
  it('reuses lexical parsing and exact canonicalization without float round trips', () => {
    const parsed = parseLosslessJson(
      String.raw`{"unsafe":9007199254740993,"fraction":0.1234567890123456789,"exponent":1.2300e-6,"zero":-0.0,"text":"10960.0 \"2\""}`,
      'fixture',
    );
    expect(parsed).toEqual({
      unsafe: '9007199254740993',
      fraction: '0.1234567890123456789',
      exponent: '1.2300e-6',
      zero: '-0.0',
      text: '10960.0 "2"',
    });
    expect(canonicalDecimal(parsed.unsafe, 'fixture')).toBe('9007199254740993');
    expect(canonicalDecimal(parsed.fraction, 'fixture')).toBe(
      '0.1234567890123456789',
    );
    expect(canonicalDecimal(parsed.exponent, 'fixture')).toBe('0.00000123');
    expect(canonicalDecimal(parsed.zero, 'fixture')).toBe('0');
    expect(() => parseLosslessJson('{"amount":01}', 'fixture')).toThrow(
      'OFFICIAL_WORLD_INVALID_JSON',
    );
    expect(() => canonicalDecimal('NaN', 'fixture')).toThrow(
      'OFFICIAL_WORLD_INVALID_DECIMAL',
    );
  });

  it('binds all 70 records and every numeric field to exact hashed source rows', () => {
    let checkedFields = 0;
    for (const country of countries) {
      const meta = country.officialSource;
      expect(meta).toMatchObject({
        schemaVersion: 'OFFICIAL_UI_FIELD_PROVENANCE_V1',
        authority: 'SELECTED_SOURCE_NOT_RUNTIME',
        sourcePackageId: 'BALANCED_2026_09_28_V1',
        sourceChecksumsSha256:
          '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315',
      });
      expect(country.officialOpening).toMatchObject({
        worldId: null,
        openingSeedCommitted: false,
      });
      for (const [dataset, spec] of Object.entries(meta.datasets)) {
        const source = sources.get(dataset)!;
        expect(spec.sha256, dataset).toBe(sha(source.raw));
        expect(spec.recordCountExact, dataset).toBe(String(source.rows.length));
      }
      for (const [target, field] of Object.entries(meta.fields)) {
        const source = sources.get(field.dataset)!;
        const row = source.rows[field.rowIndex];
        if (!row) throw new Error(`Missing source row: ${field.sourcePointer}`);
        const sourceValue = fromPointer(source.rows, field.sourcePointer);
        expect(typeof sourceValue, target).toBe('number');
        expect(field.rawToken, target).toBe(
          fromPointer(source.exact, field.sourcePointer),
        );
        expect(field.exact, target).toBe(
          canonicalDecimal(field.rawToken, target),
        );
        expect(fromPointer(country, target), target).toBe(sourceValue);
        expect(field.field, target).toBe(
          field.sourcePointer.split('/').slice(2).join('.'),
        );
        expect(field.rowId, target).toBe(
          row.id ??
            row.facilityId ??
            (row.commodityId
              ? `${row.countryId}:${row.commodityId}`
              : row.countryId),
        );
        expect(row.countryId ?? row.id, target).toBe(country.id);
        expect(field.unit.length, target).toBeGreaterThan(0);
        expect(field.nature, target).not.toContain('RUNTIME_STATE');
        checkedFields += 1;
      }
    }
    expect(new Set(countries.map((country) => country.id)).size).toBe(70);
    expect(checkedFields).toBeGreaterThan(15000);
  });

  it('covers all embedded official numeric leaves and HUD aliases without claiming legacy visual fields', () => {
    for (const country of countries) {
      const expected = [
        ...numericPointers(country.officialOpening, '/officialOpening'),
        ...numericPointers(country.regions, '/regions'),
        ...numericPointers(country.power, '/power'),
        ...numericPointers(country.climateMix, '/climateMix'),
        '/areaKm2',
        ...numericPointers(country.profile, '/profile'),
      ];
      country.facilities.forEach((facility, index) => {
        expected.push(
          ...numericPointers(facility.record, `/facilities/${index}/record`),
        );
      });
      country.resources.forEach((resource, index) => {
        expected.push(
          ...numericPointers(resource.deposit, `/resources/${index}/deposit`),
        );
      });
      for (const pointer of expected)
        expect(
          country.officialSource.fields[pointer],
          `${country.number}${pointer}`,
        ).toBeDefined();
      expect(
        country.officialSource.fields['/profile/developmentPaths'],
      ).toBeUndefined();
    }
  });

  it('preserves finance tails and explicit proposal/unit boundaries rather than reconciling or granting them', () => {
    const field = (pointer: string) => requireField(firstCountry, pointer);
    expect(
      field('/officialOpening/finance/householdBankDeposits').rawToken,
    ).toBe('17548540099.199997');
    expect(field('/profile/bankEquityGcu').exact).toBe('2339805346.56');
    expect(field('/profile/bankDepositsGcu')).toMatchObject({
      dataset: 'finance',
      field: 'bankDepositLiabilities',
      rowId: 'visual-territory-01',
      unit: 'GCU_SCENARIO_ACCOUNTING_UNIT',
      unitBasis: 'SOURCE_CURRENCY',
      nature: 'OPENING_INPUT_BLOCKED_ON_SEMANTICS',
    });
    expect(field('/profile/foodDemandTonnesDay')).toMatchObject({
      dataset: 'production-plans',
      rowId: 'visual-territory-01:GRAIN',
      unit: 'tonne/sim-day',
      nature: 'PROPOSAL_READ_ONLY',
    });
    expect(field('/profile/foodAvailableStockTonnes')).toMatchObject({
      rowId: 'STOCK-01-GRAIN',
      unit: 'tonne',
      nature: 'OPENING_INPUT_BLOCKED_ON_OWNERSHIP',
    });
    for (const country of countries) {
      for (const facility of country.facilities)
        expect(facility.record).toMatchObject({
          operational: false,
          sourceStatus: 'UNAPPROVED_SCENARIO_ASSET',
        });
      for (const resource of country.resources)
        expect(resource.tradable).toBe(false);
    }
  });

  it('keeps the 350 historical development options a subset of 1374 source facilities', () => {
    let facilityCount = 0;
    let optionCount = 0;
    let resourceCount = 0;
    for (const country of countries) {
      const { facilities, resources, historicalDevelopmentOptions } =
        country.officialSource.collections;
      for (const collection of [
        facilities,
        resources,
        historicalDevelopmentOptions,
      ]) {
        const expected = sources
          .get(collection.dataset)!
          .rows.filter(
            (row) =>
              row.countryId === country.id &&
              (!collection.predicate.scenarioRole ||
                row.scenarioRole === collection.predicate.scenarioRole),
          );
        expect(collection.sourceRowIds).toEqual(expected.map((row) => row.id));
        expect(collection.countExact).toBe(String(expected.length));
        expect(collection.nature).toBe('DERIVED_SOURCE_COUNT_NOT_RUNTIME');
      }
      expect(facilities.sourceRowIds).toEqual(
        country.facilities.map((row) => row.id),
      );
      expect(resources.sourceRowIds).toEqual(
        country.resources.map((row) => row.id),
      );
      expect(historicalDevelopmentOptions.rule).toBe(
        'FILTER_COUNTRY_ID_AND_SCENARIO_ROLE_DEVELOPMENT_OPTION',
      );
      facilityCount += Number(facilities.countExact);
      optionCount += Number(historicalDevelopmentOptions.countExact);
      resourceCount += Number(resources.countExact);
    }
    expect([facilityCount, optionCount, resourceCount]).toEqual([
      1374, 350, 240,
    ]);
  });

  it('marks undefined units explicitly and preserves facility decimals with trailing zeros', () => {
    expect(
      officialFieldUnit('facilities', { capacityUnit: 'tonne/sim-day' }, [
        'capacity',
      ]),
    ).toEqual({ unit: 'tonne/sim-day', unitBasis: 'SOURCE_CAPACITY_UNIT' });
    expect(
      officialFieldUnit('regions', {}, ['natural', 'droughtExposure']),
    ).toEqual({
      unit: 'UNIT_NOT_SPECIFIED_IN_SOURCE',
      unitBasis: 'NOT_SPECIFIED',
    });
    const country = countries.find((row) => row.number === '44')!;
    const index = country.facilities.findIndex((row) => row.id === 'P01');
    expect(
      country.officialSource.fields[
        `/facilities/${index}/record/maintenanceGcuDay`
      ],
    ).toMatchObject({
      rawToken: '10960.0',
      exact: '10960',
      dataset: 'facilities',
      rowId: 'P01',
      field: 'maintenanceGcuDayProposal',
      unit: 'GCU_SCENARIO_ACCOUNTING_UNIT/sim-day',
      nature: 'PROPOSAL_READ_ONLY',
    });
  });

  it('re-generates twice byte-identically and checks committed outputs without promoting verification status', async () => {
    const bytes = async () =>
      Promise.all(
        countries.map((country) =>
          readFile(path.join(outputRoot, `${country.number}.json`), 'utf8'),
        ),
      );
    const before = await bytes();
    await syncOfficialUiCountryData(root);
    expect(await bytes()).toEqual(before);
    await syncOfficialUiCountryData(root);
    expect(await bytes()).toEqual(before);
    expect(
      await syncOfficialUiCountryData(root, { check: true }),
    ).toMatchObject({
      status: 'CHECKED',
      countries: 70,
      facilities: 1374,
      deposits: 240,
      runtimeConnected: false,
    });
  });

  it('rejects stale precision metadata and mismatched country identity without writing in check mode', async () => {
    const temporary = await mkdtemp(
      path.join(tmpdir(), 'econmind-ui-provenance-'),
    );
    try {
      await symlink(
        path.join(root, 'artifacts'),
        path.join(temporary, 'artifacts'),
        'dir',
      );
      await symlink(
        path.join(root, 'status'),
        path.join(temporary, 'status'),
        'dir',
      );
      const manifest = JSON.parse(
        await readFile(
          path.join(
            root,
            'artifacts/world-balanced-candidate-v1/data/manifest.json',
          ),
          'utf8',
        ),
      ) as { sourceSnapshots: { sourcePath: string }[] };
      for (const { sourcePath } of manifest.sourceSnapshots) {
        const target = path.join(temporary, sourcePath);
        await mkdir(path.dirname(target), { recursive: true });
        await symlink(path.join(root, sourcePath), target);
      }
      const temporaryOutput = path.join(
        temporary,
        'apps/world-web/public/season1-immersive/countries/data',
      );
      await cp(outputRoot, temporaryOutput, { recursive: true });
      const file = path.join(temporaryOutput, '01.json');
      const stale = JSON.parse(await readFile(file, 'utf8')) as Country;
      requireField(stale, '/profile/bankDepositsGcu').rawToken =
        '23398053465.60001';
      await writeFile(file, JSON.stringify(stale, null, 2) + '\n');
      const before = await readFile(file, 'utf8');
      await expect(
        syncOfficialUiCountryData(temporary, { check: true }),
      ).rejects.toThrow('Official UI data is stale');
      expect(await readFile(file, 'utf8')).toBe(before);
      stale.id = 'visual-territory-02';
      await writeFile(file, JSON.stringify(stale, null, 2) + '\n');
      await expect(
        syncOfficialUiCountryData(temporary, { check: true }),
      ).rejects.toThrow('Visual/official country identity mismatch');
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
