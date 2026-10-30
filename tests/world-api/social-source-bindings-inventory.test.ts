import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  inspectSocialSourceBindings,
  parseSocialSourceArguments,
  summarizeSocialSourceRows,
} from '../../tools/office-connection/social-source-bindings.mjs';

// Actual pinned selected sources + owner records + branded adoption and both
// new source-binding modules. No fixture admission, SQL, host or fake source.
let inventory: Awaited<ReturnType<typeof inspectSocialSourceBindings>>;
beforeAll(async () => {
  inventory = await inspectSocialSourceBindings();
});

describe('selected Social source bindings inventory — source mapping, not admission', () => {
  it('covers every original country/asset composite gap exactly once with its source identity', () => {
    expect(inventory.denominator).toMatchObject({
      economies: 70,
      sourceCountryObjects: 70,
      sourceFacilityObjects: 366,
      regions: 122,
      originalCompositeGapRows: 1066,
      fieldFamilies: 13,
    });
    expect(inventory.rows).toHaveLength(1066);
    expect(new Set(inventory.rows.map((row) => row.gapKey)).size).toBe(1066);
    expect(inventory.summary.byOriginalGapCode).toEqual({
      INCOMPATIBLE_SKILL_SEMANTICS: 122,
      MISSING_OPERATING_INPUT: 822,
      UNRESOLVED_HOUSING_TITLE: 122,
    });
    expect(inventory.source.provenance).toHaveLength(4);
    for (const source of inventory.source.provenance)
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/u);
    for (const row of inventory.rows) {
      expect(row.countryId).toBe(row.originalGap.countryId);
      expect(
        inventory.idMappings.countries.find(
          (item) => item.countryId === row.countryId,
        )?.sourceCountryId,
      ).toBe(row.sourceCountryId);
      if (row.locationId !== null)
        expect(
          inventory.idMappings.regions.find(
            (item) => item.locationId === row.locationId,
          )?.sourceRegionId,
        ).toBe(row.sourceRegionId);
      if (row.economicEntityId !== null)
        expect(
          inventory.idMappings.entities.find(
            (item) => item.economicEntityId === row.economicEntityId,
          )?.sourceEconomicEntityId,
        ).toBe(row.sourceEconomicEntityId);
      expect(row.sourceVersion).toBe(inventory.source.checksumsSHA256);
      expect(row.sourceObjectId).toBe(row.originalGap.sourceObjectId);
      expect(row.subfields.length).toBeGreaterThan(0);
      for (const subfield of row.subfields)
        expect(subfield.sourceReferences.length).toBeGreaterThan(0);
    }
  });

  it('counts existing mappings separately from new carrier wiring and retains missing/conflicting values', () => {
    expect(inventory.status).toBe('SOURCE_MAPPING_PARTIAL_NOT_OPERATIONAL');
    expect(inventory.summary.fullyClosedCompositeGaps).toBe(0);
    expect(inventory.summary.unresolvedCompositeGaps).toBe(1066);
    expect(
      inventory.summary.subfieldsByMappingOrigin.ALREADY_MAPPED,
    ).toBeGreaterThan(0);
    expect(
      inventory.summary.subfieldsByMappingOrigin.NEWLY_WIRED,
    ).toBeGreaterThan(0);
    expect(inventory.summary.subfieldsByStatus.MISSING).toBeGreaterThan(0);
    expect(inventory.summary.subfieldsByStatus.CONFLICT).toBeGreaterThan(0);
    expect(inventory.summary.newRawSourceValuesIntroduced).toBe(0);
    expect(inventory.capabilities).toEqual({
      sourceBytesChanged: false,
      sourceAdmitted: false,
      actualEmploymentCreated: false,
      queueOrServiceStateInvented: false,
      runtimeConnected: false,
      databaseAccessPerformed: false,
      WorldClock: false,
    });
  });

  it('uses the new teacher demand module while preserving source skill conflicts and unbound employment', () => {
    const teachers = inventory.rows.filter((row) =>
      row.fieldFamily.startsWith('BASIC_EDUCATION:'),
    );
    expect(teachers).toHaveLength(122);
    expect(inventory.moduleStatuses.staffing).toBe(
      'SOURCE_BOUND_TEACHER_DEMAND_TARGETS_NOT_OPERATIONAL',
    );
    for (const row of teachers) {
      expect(row.subfields.find((s) => s.field === 'occupation')).toMatchObject(
        { status: 'DERIVED', value: 'TEACHER', mappingOrigin: 'NEWLY_WIRED' },
      );
      expect(
        row.subfields.find((s) => s.field === 'requiredCount')?.mappingOrigin,
      ).toBe('ALREADY_MAPPED');
      expect(
        row.subfields.find((s) => s.field === 'sourceSkillDemand')?.status,
      ).toBe('CONFLICT');
      expect(
        row.subfields.find((s) => s.field === 'actualEmployedCount'),
      ).toMatchObject({ status: 'MISSING', value: null });
      expect(
        row.subfields.find((s) => s.field === 'payrollFundingRef'),
      ).toMatchObject({ status: 'MISSING', value: null });
      expect(row.fullyClosed).toBe(false);
    }
  });

  it('ordinary housing keeps known capacity/proposals distinct from actual title, tenure and operator', () => {
    const housing = inventory.rows.filter(
      (row) => row.field === 'titleAndTenure',
    );
    expect(housing).toHaveLength(122);
    for (const row of housing) {
      expect(row.economicEntityId).toBeNull();
      expect(
        row.subfields.find((s) => s.field === 'housingUnitCapacity'),
      ).toMatchObject({ status: 'DERIVED', mappingOrigin: 'ALREADY_MAPPED' });
      for (const name of [
        'actualTitleHolderId',
        'titleAndTenure',
        'actualOperatorId',
      ]) {
        const value = row.subfields.find((s) => s.field === name)!;
        expect(value).toMatchObject({
          status: 'MISSING',
          value: null,
          mappingOrigin: 'UNBOUND',
        });
        expect(value.absenceClaimScope).toBe(
          'INSPECTED_SOURCE_PARENTS_ONLY_NOT_GLOBAL_ABSENCE',
        );
      }
      expect(row.fullyClosed).toBe(false);
    }
  });

  it('gives concrete raw parent pointers for missing fields and explicitly derived identities for logical adoption references', () => {
    let raw = 0,
      derived = 0;
    for (const row of inventory.rows)
      for (const subfield of row.subfields)
        for (const reference of subfield.sourceReferences) {
          expect(['DATASET', 'ADOPTION', 'MAPPING', 'OWNER_RULE']).toContain(
            reference.namespace,
          );
          if (reference.namespace === 'DATASET') {
            expect(reference.path).toMatch(
              /^artifacts\/world-balanced-candidate-v1\/data\/[a-z-]+\.json$/u,
            );
            expect(reference.pointer).toMatch(/^\//u);
            expect(reference.sha256).toMatch(/^[a-f0-9]{64}$/u);
            raw++;
          }
          if (reference.namespace === 'ADOPTION') {
            expect(reference.sha256).toBeNull();
            expect(reference.pointer).toMatch(/^\//u);
            derived++;
          }
        }
    expect(raw).toBeGreaterThan(0);
    expect(derived).toBeGreaterThan(0);
    expect(inventory.source.adoptionBinding.meaning).toBe(
      'DERIVED_BINDING_NOT_ORIGINAL_OR_ADMISSION',
    );
  });

  it('rejects duplicate/empty inventories, invented classifications and false full-closure labels', () => {
    const originalGap = inventory.rows[0]!.originalGap;
    const subfield = {
      field: 'actual',
      status: 'MISSING',
      mappingOrigin: 'UNBOUND',
      value: null,
    };
    const row = { originalGap, subfields: [subfield], fullyClosed: false };
    expect(() => summarizeSocialSourceRows([row, row])).toThrow('duplicate');
    expect(() =>
      summarizeSocialSourceRows([{ ...row, subfields: [] }]),
    ).toThrow('empty');
    expect(() =>
      summarizeSocialSourceRows([{ ...row, fullyClosed: true }]),
    ).toThrow('closure contradicts');
    expect(() =>
      summarizeSocialSourceRows([
        { ...row, subfields: [{ ...subfield, status: 'ADMITTED' }] },
      ]),
    ).toThrow('classification');
    expect(summarizeSocialSourceRows([row]).fullyClosedCompositeGaps).toBe(0);
  });

  it('accepts only read-only modes and refuses a source, result, host or mutation override before loading inputs', async () => {
    expect(parseSocialSourceArguments([])).toBe('--summary');
    for (const mode of ['--plan', '--summary', '--check'])
      expect(parseSocialSourceArguments([mode])).toBe(mode);
    for (const args of [
      ['--execute'],
      ['--admit'],
      ['--plan', '--source=foreign'],
      ['--summary', '--result=old.json'],
      ['--host=http://foreign.invalid'],
    ])
      expect(() => parseSocialSourceArguments(args)).toThrow('overrides');
    await expect(
      Reflect.apply(inspectSocialSourceBindings, undefined, [
        { source: 'foreign' },
      ]),
    ).rejects.toThrow('overrides');
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            '../../tools/office-connection/social-source-bindings.mjs',
            import.meta.url,
          ),
        ),
        '--execute',
      ],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'INVENTORY_UNAVAILABLE',
      sourceAdmitted: false,
      databaseAccessPerformed: false,
      WorldClock: false,
    });
  });
});
