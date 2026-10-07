import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  allocateOpeningPeopleLargestRemainder,
  materializeOpeningLabourState,
  createOpeningSocialCapacity,
  type OpeningLabourPositionDemand,
} from '../../packages/core/src/index.js';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import {
  createOfficialLabourSocialOpeningAdoption,
  consumeLabourSocialOpeningAdoption,
  exerciseTestOnlyLabourSocialOpening,
} from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';

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
      Object.keys(mapping.source.dataFiles).map(async (p) => [
        p,
        await read(`artifacts/world-balanced-candidate-v1/${p}`),
      ]),
    ),
  ),
};
// One genuine existing inspection, not a recreated approval/validator or regenerated audit.
const inspected = inspectOfficialOpeningDecisionSource(fixture);
if (inspected.source === null)
  throw new Error(JSON.stringify(inspected.blockers));
const ownerPrefix = 'docs/governance/owner-inputs/2026-10-07/';
const constructorInput = {
  source: inspected.source,
  mappingBytes,
  ownerOriginalBytes: await read(
    `${ownerPrefix}OWNER_NON_HOST_DECISIONS.original.md`,
  ),
  ownerReceiptBytes: await read(
    `${ownerPrefix}OWNER_NON_HOST_DECISION_RECEIPT.json`,
  ),
  datasets: {
    employment: fixture.datasets['data/employment.json']!,
    'population-services': fixture.datasets['data/population-services.json']!,
    regions: fixture.datasets['data/regions.json']!,
    facilities: fixture.datasets['data/facilities.json']!,
  },
};
const adoption = createOfficialLabourSocialOpeningAdoption(constructorInput);
const q = (amount: string, unit = 'person') => ({ amount, unit });

function position(
  id: string,
  requiredCount: string,
  weight = requiredCount,
): OpeningLabourPositionDemand {
  return {
    positionId: id,
    countryId: 'COUNTRY_01',
    locationId: 'REGION_01_E1',
    skill: 'HIGH',
    owner: 'PUBLIC_SERVICE',
    classificationId: 'EDUCATION',
    requiredCount,
    sourceWeight: weight,
    employerId: 'ENTITY_GOVERNMENT_01',
    employerRole: 'GOV',
    occupation: 'TEACHER',
    wageAmount: '2.5',
    wageCurrency: 'GCU',
    wagePeriod: 'SIM_HOUR',
    wageVersion: 'TEST_WAGE_V1',
    payrollFundingRef: 'TEST_PAYROLL_REF',
  };
}
function labourInput() {
  return {
    targets: [
      {
        countryId: 'COUNTRY_01',
        locationId: 'REGION_01_E1',
        skill: 'HIGH' as const,
        count: '5',
      },
    ],
    positions: [
      position('POSITION_A', '2'),
      {
        ...position('POSITION_B', '4'),
        classificationId: 'HEALTHCARE',
        occupation: 'DOCTOR' as const,
      },
    ],
    populationAvailability: [
      {
        countryId: 'COUNTRY_01',
        locationId: 'REGION_01_E1',
        workingAgeAvailable: '6',
      },
    ],
    skillAvailability: [
      {
        countryId: 'COUNTRY_01',
        locationId: 'REGION_01_E1',
        skill: 'HIGH' as const,
        count: '6',
      },
    ],
    nonEmployedAggregates: [
      {
        countryId: 'COUNTRY_01',
        locationId: 'REGION_01_E1',
        skill: 'HIGH' as const,
        status: 'UNEMPLOYED_SEARCHING' as const,
        count: '1',
      },
    ],
    employers: [
      {
        countryId: 'COUNTRY_01',
        role: 'GOV' as const,
        employerId: 'ENTITY_GOVERNMENT_01',
      },
    ],
  };
}
function exerciseInput(): Parameters<
  typeof exerciseTestOnlyLabourSocialOpening
>[0] {
  return {
    adoption,
    environment: 'local' as const,
    countryId: 'COUNTRY_01',
    locationId: 'REGION_01_E1',
    labour: labourInput(),
    education: {
      applicants: q('8'),
      seats: q('7'),
      teacherSupportedSeats: q('6'),
      budgetSupportedSeats: q('5'),
      enrolled: q('4'),
      dropoutRate: { amount: '0', unit: 'ratio' },
      completionRate: { amount: '1', unit: 'ratio' },
      durationReached: false,
    },
    healthcare: {
      newDemand: q('5', 'case'),
      priorBacklog: q('2', 'case'),
      staffCapacity: q('4', 'case'),
      facilityCapacity: q('6', 'case'),
      supplyCapacity: q('3', 'case'),
      budgetCapacity: q('5', 'case'),
    },
    occupiedBeds: '2',
  };
}

describe('C D04 source-bound labour/social opening constructor and public Worker consumer', () => {
  it('consumes all 70 countries and exact 122×3 same-asset capacities without 50/50 or duplicate stocks', () => {
    const consumed = consumeLabourSocialOpeningAdoption(adoption);
    expect(adoption.countryIds).toHaveLength(70);
    expect(adoption.employmentTargets).toHaveLength(70);
    expect(adoption.populationAvailability).toHaveLength(122);
    expect(adoption.skillAvailability).toHaveLength(366);
    expect(adoption.totalPopulation).toBe('14712146434');
    expect(consumed.openingCapacities).toHaveLength(366);
    expect(new Set(consumed.openingCapacities.map((c) => c.assetId)).size).toBe(
      366,
    );
    expect(adoption.unbuiltExcluded).toHaveLength(12);
    expect(
      adoption.unbuiltExcluded.every(
        (u) =>
          !adoption.capacities.some(
            (c) => c.sourceFacilityId === u.sourceFacilityId,
          ),
      ),
    ).toBe(true);
    for (const target of adoption.employmentTargets) {
      expect(BigInt(target.teachers) + BigInt(target.medicalWorkers)).toBe(
        BigInt(target.educationAndHealth),
      );
      expect(target.formalJobs).toBeNull();
    }
    expect(adoption.employmentTargets[0]).toMatchObject({
      countryId: 'COUNTRY_01',
      teachers: '771012',
      medicalWorkers: '369274',
      educationAndHealth: '1140286',
      employed: '34571592',
    });
    expect(
      adoption.capacities.find(
        (c) =>
          c.core.locationId === 'REGION_01_E1' && c.core.kind === 'EDUCATION',
      ),
    ).toMatchObject({
      sourceProjectId: 'PROJECT-31',
      sourceUnit: 'student-seat',
      rawCapacity: '21048617.0',
      core: { capacity: q('21048617') },
      requiredStaffTarget: '771012',
    });
    expect(
      adoption.capacities
        .filter((c) => c.core.kind === 'HOUSING')
        .every((c) => c.titleHolderId === null),
    ).toBe(true);
    expect(
      adoption.capacities
        .filter((c) => c.core.kind !== 'HOUSING')
        .every((c) => c.titleHolderId !== null),
    ).toBe(true);
    expect(
      adoption.capacities.every(
        (c) =>
          c.core.actualEnrollment === null &&
          c.core.occupiedBeds === null &&
          c.core.deliveredCare === null &&
          c.core.occupiedHousingUnits === null &&
          c.core.welfarePaid === null &&
          c.core.actualEmployedStaff === null,
      ),
    ).toBe(true);
    expect(consumed).toMatchObject({
      status: 'ADOPTED_CAPACITY_AND_TARGETS_NOT_READY',
      authoritativeLabourState: null,
      operationalServiceState: null,
      seedAdmissionReady: false,
      generatedHiringOrServiceEvents: false,
    });
    expect(Object.isFrozen(adoption.capacities[0]!.core.capacity)).toBe(true);
    expect(createOfficialLabourSocialOpeningAdoption(constructorInput)).toEqual(
      adoption,
    );
  });

  it('reports exact country/object/field gaps instead of zero wages, automatic public housing, or invented employment', () => {
    expect(adoption.gaps).toHaveLength(1066); // 70×10 country gaps + 122×3 asset gaps.
    for (const country of adoption.countryIds) {
      const gaps = adoption.gaps.filter((g) => g.countryId === country);
      for (const field of [
        'employmentByRegionAndSkill',
        'wageAmountCurrencyPeriodVersion',
        'payrollFundingAndObligation',
        'educationInitialQueueAndProgramme',
        'healthcareInitialDemandAndBacklog',
        'housingOccupancyHabitabilityAndRent',
        'welfareEligibilityRulesAndPayments',
        'publicSafetyPositionsAndInitialQueue',
      ])
        expect(gaps.some((g) => g.field === field)).toBe(true);
      expect(
        gaps.every(
          (g) =>
            g.sourcePath.startsWith('data/') &&
            /^\/\d+$/u.test(g.sourcePointer),
        ),
      ).toBe(true);
    }
    expect(
      adoption.gaps.filter((g) => g.code === 'INCOMPATIBLE_SKILL_SEMANTICS'),
    ).toHaveLength(122);
    expect(
      adoption.gaps.filter((g) => g.code === 'UNRESOLVED_HOUSING_TITLE'),
    ).toHaveLength(122);
  });

  it('rejects changed raw source, mapping, fake source and caller-forged Owner receipt', () => {
    for (const field of [
      'ownerOriginalBytes',
      'ownerReceiptBytes',
      'mappingBytes',
    ] as const)
      expect(() =>
        createOfficialLabourSocialOpeningAdoption({
          ...constructorInput,
          [field]: constructorInput[field] + '\n',
        }),
      ).toThrow('bytes differ');
    for (const field of [
      'employment',
      'population-services',
      'regions',
      'facilities',
    ] as const)
      expect(() =>
        createOfficialLabourSocialOpeningAdoption({
          ...constructorInput,
          datasets: {
            ...constructorInput.datasets,
            [field]: constructorInput.datasets[field] + '\n',
          },
        }),
      ).toThrow('bytes differ');
    expect(() =>
      createOfficialLabourSocialOpeningAdoption({
        ...constructorInput,
        source: { ...constructorInput.source },
      }),
    ).toThrow('fabricated');
    expect(() => consumeLabourSocialOpeningAdoption({ ...adoption })).toThrow(
      'Untrusted',
    );
    expect(() =>
      createOfficialLabourSocialOpeningAdoption({
        ...constructorInput,
        ownerReceiptBytes: JSON.stringify({
          owner_approved: true,
          decisions: [{ id: 'D04', state: 'DECISION_ADOPTED' }],
        }),
      }),
    ).toThrow('bytes differ');
  });

  it('exercises real E03/E04/E05 from complete explicit TEST_ONLY facts without promoting official gaps', () => {
    const result = exerciseTestOnlyLabourSocialOpening(exerciseInput());
    expect(result.scope).toBe(
      'TEST_ONLY_NOT_OFFICIAL_OPENING_OR_RUNTIME_ACCEPTANCE',
    );
    expect(result.labour.state.positions.map((p) => p.employedCount)).toEqual([
      '2',
      '3',
    ]);
    expect(result.labour.state.appliedFactBindings).toEqual([]);
    expect(result.labour).toMatchObject({
      wagesPaid: false,
      generatedHiringEvents: false,
      unmatched: '0',
    });
    expect(result.education).toMatchObject({
      actualEnrollment: q('4'),
      enrollmentCapacity: q('5'),
      graduates: q('0'),
      skillTransition: null,
    });
    expect(result.healthcare).toEqual({
      deliveredCare: q('3', 'case'),
      nextBacklog: q('4', 'case'),
    });
    expect(result).toMatchObject({
      persisted: false,
      seedAdmissionReady: false,
      officialStatus: 'ADOPTED_CAPACITY_AND_TARGETS_NOT_READY',
    });
    expect(
      consumeLabourSocialOpeningAdoption(adoption).authoritativeLabourState,
    ).toBeNull();
    expect(adoption.gaps).toHaveLength(1066);
  });

  it('rejects TEST_ONLY wrong country/employer/environment, missing staff, excess enrollment or bed occupancy', () => {
    const input = exerciseInput();
    expect(() =>
      exerciseTestOnlyLabourSocialOpening({
        ...input,
        labour: {
          ...input.labour,
          skillAvailability: [
            { ...input.labour.skillAvailability[0]!, count: '3930275' },
          ],
        },
      }),
    ).toThrow('skill pool exceeds source');
    expect(() =>
      exerciseTestOnlyLabourSocialOpening({
        ...input,
        countryId: 'COUNTRY_02',
      }),
    ).toThrow();
    expect(() =>
      exerciseTestOnlyLabourSocialOpening({
        ...input,
        environment: 'production' as 'local',
      }),
    ).toThrow('local/CI');
    expect(() =>
      exerciseTestOnlyLabourSocialOpening({
        ...input,
        labour: {
          ...input.labour,
          employers: [
            {
              countryId: 'COUNTRY_01',
              role: 'GOV',
              employerId: 'ENTITY_GOVERNMENT_02',
            },
          ],
        },
      }),
    ).toThrow('employer identity');
    expect(() =>
      exerciseTestOnlyLabourSocialOpening({
        ...input,
        education: { ...input.education, enrolled: q('6') },
      }),
    ).toThrow();
    expect(() =>
      exerciseTestOnlyLabourSocialOpening({ ...input, occupiedBeds: '316522' }),
    ).toThrow();
    expect(() =>
      exerciseTestOnlyLabourSocialOpening({
        ...input,
        labour: {
          ...input.labour,
          positions: input.labour.positions.map((p) => ({
            ...p,
            classificationId: 'HEALTHCARE',
            occupation: 'DOCTOR',
          })),
        },
      }),
    ).toThrow('no employed teachers');
  });
});

describe('C pure genesis labour constructor, capped integer allocation and capacity carriers', () => {
  it('uses stable tie IDs, exact huge person counts, caps and input-order independence', () => {
    const allocate = allocateOpeningPeopleLargestRemainder;
    const demands = [
      { id: 'DEMAND_C', weight: '1', capacity: '9' },
      { id: 'DEMAND_B', weight: '1', capacity: '9' },
      { id: 'DEMAND_A', weight: '1', capacity: '9' },
    ];
    expect(
      allocate({ total: '2', demands }).assignments.map((a) => a.count),
    ).toEqual(['1', '1', '0']);
    expect(allocate({ total: '2', demands: [...demands].reverse() })).toEqual(
      allocate({ total: '2', demands }),
    );
    expect(
      allocate({
        total: '5',
        demands: [
          { id: 'DEMAND_A', weight: '100', capacity: '1' },
          { id: 'DEMAND_B', weight: '1', capacity: '9' },
        ],
      }).assignments.map((a) => a.count),
    ).toEqual(['1', '4']);
    expect(
      allocate({
        total: '9007199254740993',
        demands: [
          { id: 'DEMAND_A', weight: '1', capacity: '9007199254740993' },
        ],
      }).assignments[0]!.count,
    ).toBe('9007199254740993');
    expect(
      allocate({
        total: '4',
        demands: [{ id: 'DEMAND_A', weight: '0', capacity: '5' }],
      }).unmatched,
    ).toBe('4');
    expect(() => allocate({ total: '0.5', demands })).toThrow();
    expect(() =>
      allocate({ total: '1', demands: [...demands, demands[0]!] }),
    ).toThrow('Duplicate');
  });

  it('validates exact occupation/skill, employer, wage/funding, full skill conservation and existing E03 population bound', () => {
    const input = labourInput();
    const state = materializeOpeningLabourState(input);
    expect(state.employerBindings.map((b) => b.employerId)).toEqual([
      'ENTITY_GOVERNMENT_01',
      'ENTITY_GOVERNMENT_01',
    ]);
    expect(Object.isFrozen(state.employerBindings[0]!.wageAmount)).toBe(true);
    const privateState = materializeOpeningLabourState({
      ...input,
      employers: [
        {
          countryId: 'COUNTRY_01',
          role: 'OP',
          employerId: 'ENTITY_OPERATOR_01',
        },
      ],
      positions: input.positions.map((p) => ({
        ...p,
        employerRole: 'OP',
        employerId: 'ENTITY_OPERATOR_01',
        owner: 'PRIVATE_SECTOR',
        classificationId: 'MANUFACTURING',
        occupation: 'GENERAL',
      })),
    });
    expect(
      privateState.employerBindings.every((b) => b.employerRole === 'OP'),
    ).toBe(true);
    expect(
      state.state.aggregates.reduce((n, a) => n + BigInt(a.count), 0n),
    ).toBe(6n);
    expect(() =>
      materializeOpeningLabourState({
        ...input,
        positions: input.positions.map((p) => ({ ...p, wageAmount: '0' })),
      }),
    ).toThrow('positive wage');
    expect(() =>
      materializeOpeningLabourState({
        ...input,
        positions: input.positions.map((p) => ({
          ...p,
          payrollFundingRef: '',
        })),
      }),
    ).toThrow();
    expect(() =>
      materializeOpeningLabourState({
        ...input,
        positions: input.positions.map((p) => ({
          ...p,
          employerRole: 'INVALID' as 'GOV',
        })),
      }),
    ).toThrow();
    expect(() =>
      materializeOpeningLabourState({
        ...input,
        positions: input.positions.map((p) => ({
          ...p,
          employerId: 'ENTITY_GOVERNMENT_02',
        })),
      }),
    ).toThrow();
    expect(() =>
      materializeOpeningLabourState({
        ...input,
        positions: [
          { ...input.positions[0]!, skill: 'LOW' },
          input.positions[1]!,
        ],
      }),
    ).toThrow('compatible');
    expect(() =>
      materializeOpeningLabourState({
        ...input,
        nonEmployedAggregates: [
          { ...input.nonEmployedAggregates[0]!, count: '2' },
        ],
      }),
    ).toThrow('skill pool');
    expect(() =>
      materializeOpeningLabourState({
        ...input,
        populationAvailability: [
          { ...input.populationAvailability[0]!, workingAgeAvailable: '5' },
        ],
      }),
    ).toThrow('working-age');
    expect(() =>
      materializeOpeningLabourState({
        ...input,
        targets: [{ ...input.targets[0]!, count: '7' }],
      }),
    ).toThrow('Unmatched');
    expect(() =>
      materializeOpeningLabourState({
        ...input,
        targets: [...input.targets, input.targets[0]!],
      }),
    ).toThrow('Duplicate');
    expect(() =>
      materializeOpeningLabourState({
        ...input,
        positions: [...input.positions, input.positions[0]!],
      }),
    ).toThrow('Duplicate');
    expect(
      materializeOpeningLabourState({
        ...input,
        positions: [...input.positions].reverse(),
      }),
    ).toEqual(state);
  });

  it('does not turn physical capacity into actual service; rejects fractional capacity and wrong units', () => {
    const input = {
      assetId: 'CAPACITY_A',
      countryId: 'COUNTRY_01',
      locationId: 'REGION_01_E1',
      kind: 'EDUCATION' as const,
      capacity: q('10'),
    };
    expect(createOpeningSocialCapacity(input)).toMatchObject({
      capacity: q('10'),
      actualEnrollment: null,
      actualEmployedStaff: null,
      generatedServiceEvents: false,
    });
    expect(() =>
      createOpeningSocialCapacity({ ...input, capacity: q('1.5') }),
    ).toThrow();
    expect(() =>
      createOpeningSocialCapacity({ ...input, capacity: q('10', 'bed') }),
    ).toThrow();
    expect(() =>
      createOpeningSocialCapacity({
        ...input,
        kind: 'HOUSING',
        capacity: q('10', 'person'),
      }),
    ).toThrow();
  });
});
