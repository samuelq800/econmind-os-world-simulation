import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import { createOfficialSocialStaffingTargets } from '../../apps/world-worker/src/preparation/official-social-staffing-targets.js';

const root = path.resolve(import.meta.dirname, '../..');
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
  proposalBytes: await read(
    'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
  ),
  datasets: Object.fromEntries(
    await Promise.all(
      Object.keys(mapping.source.dataFiles).map(async (name) => [
        name,
        await read(`artifacts/world-balanced-candidate-v1/${name}`),
      ]),
    ),
  ),
};
const inspected = inspectOfficialOpeningDecisionSource(fixture);
if (!inspected.source) throw new Error(JSON.stringify(inspected.blockers));
const ownerPrefix = 'docs/governance/owner-inputs/2026-10-07/';
const ownerOriginalBytes = await read(
  `${ownerPrefix}OWNER_NON_HOST_DECISIONS.original.md`,
);
const adoption = createOfficialLabourSocialOpeningAdoption({
  source: inspected.source,
  mappingBytes,
  ownerOriginalBytes,
  ownerReceiptBytes: await read(
    `${ownerPrefix}OWNER_NON_HOST_DECISION_RECEIPT.json`,
  ),
  datasets: {
    employment: fixture.datasets['data/employment.json']!,
    'population-services': fixture.datasets['data/population-services.json']!,
    regions: fixture.datasets['data/regions.json']!,
    facilities: fixture.datasets['data/facilities.json']!,
  },
});
const targets = createOfficialSocialStaffingTargets(adoption);
const resolve = (value: unknown, pointer: string): unknown =>
  pointer
    .split('/')
    .slice(1)
    .reduce<unknown>(
      (item, token) => (item as Record<string, unknown>)[token],
      value,
    );

describe('official selected-source teacher staffing demand targets', () => {
  it('joins all 122 school aliases across 70 countries to exact source teacher counts and GOV employers', () => {
    expect(targets.records).toHaveLength(122);
    expect(targets.summary.countryCount).toBe(70);
    expect(targets.summary.teacherRequiredCount).toBe('107511900');
    expect(
      new Set(targets.records.map((row) => row.positionDemand.positionId)).size,
    ).toBe(122);
    for (const row of targets.records) {
      expect(row.sourceProjectId).toBe('PROJECT-31');
      expect(row.serviceGrain).toBe('REGIONAL_EDUCATION_AGGREGATE');
      expect(row.positionDemand).toMatchObject({
        countryId: row.countryId,
        locationId: row.locationId,
        occupation: 'TEACHER',
        skill: 'HIGH',
        owner: 'PUBLIC_SERVICE',
        classificationId: 'EDUCATION',
        employerRole: 'GOV',
      });
      for (const ref of [row.provenance.facility, row.provenance.service]) {
        expect(ref.namespace).toBe('DATASET');
        const bytes = fixture.datasets[ref.path]!;
        expect(ref.sha256).toBe(
          createHash('sha256').update(bytes).digest('hex'),
        );
        expect(String(resolve(JSON.parse(bytes), ref.pointer!))).toBe(
          row.positionDemand.requiredCount,
        );
      }
      expect(row.positionDemand.sourceWeight).toBe(
        row.positionDemand.requiredCount,
      );
      const employer = row.subfields.find(
        (field) => field.field === 'employerId',
      )!;
      const ref = employer.sourceReferences.find(
        (ref) => ref.namespace === 'ADOPTION',
      )!;
      expect(ref.sha256).toBeNull();
      expect(resolve(adoption, ref.pointer!)).toBe(
        row.positionDemand.employerId,
      );
      const owner = employer.sourceReferences.find(
        (ref) => ref.namespace === 'OWNER_RULE',
      )!;
      expect(owner.sha256).toBe(
        createHash('sha256').update(ownerOriginalBytes).digest('hex'),
      );
      expect(owner.pointer).toBeNull();
    }
    for (const country of adoption.employmentTargets) {
      const total = targets.records
        .filter((row) => row.countryId === country.countryId)
        .reduce(
          (sum, row) => sum + BigInt(row.positionDemand.requiredCount),
          0n,
        );
      expect(total.toString()).toBe(country.teachers);
      expect(BigInt(country.teachers) + BigInt(country.medicalWorkers)).toBe(
        BigInt(country.educationAndHealth),
      );
    }
  });

  it('retains the original generic skill bytes and every unresolved conflict while exposing exact demand differences', () => {
    expect(targets.preservedOpeningGaps).toBe(adoption.gaps);
    expect(targets.preservedOpeningGaps).toHaveLength(1066);
    expect(targets.summary.preservedSkillConflictCount).toBe(122);
    expect(targets.summary.sourceSkillDemand).toEqual({
      LOW: '61281787',
      MEDIUM: '37629164',
      HIGH: '8600949',
    });
    expect(targets.summary.teacherOccupationDemand).toEqual({
      LOW: '0',
      MEDIUM: '0',
      HIGH: '107511900',
    });
    expect(targets.summary.unresolvedDemandDifference).toEqual({
      LOW: '-61281787',
      MEDIUM: '-37629164',
      HIGH: '98910951',
    });
    for (const row of targets.records) {
      const raw = resolve(
        JSON.parse(fixture.datasets[row.provenance.genericSkills.path]!),
        row.provenance.genericSkills.pointer!,
      ) as Record<string, number>;
      for (const skill of ['LOW', 'MEDIUM', 'HIGH'] as const) {
        expect(row.sourceSkillDemand[skill]).toBe(
          String(raw[skill.toLowerCase()]),
        );
        expect(
          BigInt(row.teacherOccupationDemand[skill]) -
            BigInt(row.sourceSkillDemand[skill]),
        ).toBe(BigInt(row.unresolvedDemandDifference[skill]));
      }
      expect(
        Object.values(row.unresolvedDemandDifference).reduce(
          (sum, value) => sum + BigInt(value),
          0n,
        ),
      ).toBe(0n);
      expect(adoption.gaps).toContain(row.preservedSkillConflict);
      expect(row.preservedSkillConflict.code).toBe(
        'INCOMPATIBLE_SKILL_SEMANTICS',
      );
      expect(row.fullGapClosed).toBe(false);
      expect(
        row.subfields.filter((field) => field.classification === 'CONFLICT'),
      ).toHaveLength(2);
    }
  });

  it('exposes a source pool bound without allocating teachers, paying wages, or emitting service/employment state', () => {
    expect(targets).toMatchObject({
      authoritativeLabourState: null,
      operationalServiceState: null,
      seedAdmissionReady: false,
      generatedHiringOrServiceEvents: false,
      wagesPaid: false,
    });
    for (const row of targets.records) {
      const pool = resolve(
        adoption,
        row.sourceHighSkillPool.adoptionPointer,
      ) as {
        count: string;
        skill: string;
        countryId: string;
        locationId: string;
      };
      expect(pool).toMatchObject({
        skill: 'HIGH',
        countryId: row.countryId,
        locationId: row.locationId,
        count: row.sourceHighSkillPool.count,
      });
      expect(row.sourceHighSkillPool.purpose).toBe(
        'TOTAL_SOURCE_SKILL_POOL_NOT_IDLE_OR_EMPLOYED_WORKERS',
      );
      expect(row.sourceHighSkillPool.teacherDemandExceedsPool).toBe(
        BigInt(row.positionDemand.requiredCount) > BigInt(pool.count),
      );
      expect(row.materializationReady).toBe(false);
      expect(row.materializationMissing).toEqual(
        expect.arrayContaining([
          'wageAmount',
          'wageCurrency',
          'wagePeriod',
          'wageVersion',
          'payrollFundingRef',
          'employedTargetsByRegionAndSkill',
          'nonEmployedAggregatesByStatusAndSkill',
          'resolvedSchoolStaffingSkillSemantics',
        ]),
      );
      expect(Object.values(row.unbound).every((value) => value === null)).toBe(
        true,
      );
      expect(row.positionDemand).not.toHaveProperty('employedCount');
      for (const field of Object.keys(row.unbound)) {
        expect(row.positionDemand).not.toHaveProperty(field);
        expect(
          row.subfields.find((subfield) => subfield.field === field),
        ).toMatchObject({
          classification: 'MISSING',
          connection: 'UNBOUND',
          value: null,
        });
      }
    }
  });

  it('accepts only the genuine existing adoption and leaves the selected sources and adoption unchanged', () => {
    const before = JSON.stringify(adoption);
    expect(() => createOfficialSocialStaffingTargets({ ...adoption })).toThrow(
      'Untrusted adoption object',
    );
    expect(() =>
      createOfficialSocialStaffingTargets(JSON.parse(before)),
    ).toThrow('Untrusted adoption object');
    expect(createOfficialSocialStaffingTargets(adoption)).toEqual(targets);
    expect(JSON.stringify(adoption)).toBe(before);
    expect(Object.isFrozen(targets)).toBe(true);
    expect(Object.isFrozen(targets.records[0]!.positionDemand)).toBe(true);
    expect(Object.isFrozen(targets.records[0]!.subfields)).toBe(true);
    expect(Object.isFrozen(targets.records[0]!.sourceSkillDemand)).toBe(true);
  });
});
