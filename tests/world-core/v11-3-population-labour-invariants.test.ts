import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  applyLabourFacts,
  applyPopulationFacts,
  createE01DailyBoundary,
  validatePopulationLabourInvariants,
  type LabourAggregate,
  type LabourEngineState,
  type LabourFact,
  type LabourPopulationAvailability,
  type PopulationCountryState,
  type PopulationEngineState,
  type PopulationFact,
  type PopulationLabourInvariantInput,
} from '../../packages/core/src/index.js';

const DAY_7 = createE01DailyBoundary('7');

function country(
  countryId: string,
  children0To15: string,
  workingAge16To64: string,
  retired65Plus: string,
): PopulationCountryState {
  return {
    countryId,
    total: (
      BigInt(children0To15) +
      BigInt(workingAge16To64) +
      BigInt(retired65Plus)
    ).toString(),
    children0To15,
    workingAge16To64,
    retired65Plus,
    householdCount: '1',
  };
}

function aggregate(
  status: LabourAggregate['status'],
  skill: LabourAggregate['skill'],
  count: string,
): LabourAggregate {
  return {
    countryId: 'COUNTRY_A',
    locationId: 'LOCATION_A',
    status,
    skill,
    count,
  };
}

function populationSource(): PopulationEngineState {
  return {
    countries: [
      country('COUNTRY_A', '2', '10', '0'),
      country('COUNTRY_B', '1', '5', '0'),
    ],
    appliedFactBindings: [],
  };
}

function labourSource(): LabourEngineState {
  return {
    aggregates: [
      aggregate('STUDENT', 'LOW', '2'),
      aggregate('UNEMPLOYED_SEARCHING', 'MEDIUM', '4'),
      aggregate('EMPLOYED', 'MEDIUM', '2'),
    ],
    positions: [
      {
        positionId: 'POSITION_PRIVATE_A',
        countryId: 'COUNTRY_A',
        locationId: 'LOCATION_A',
        skill: 'MEDIUM',
        owner: 'PRIVATE_SECTOR',
        classificationId: 'MANUFACTURING',
        requiredCount: '2',
        employedCount: '1',
      },
      {
        positionId: 'POSITION_PUBLIC_A',
        countryId: 'COUNTRY_A',
        locationId: 'LOCATION_A',
        skill: 'MEDIUM',
        owner: 'PUBLIC_SERVICE',
        classificationId: 'HEALTHCARE',
        requiredCount: '1',
        employedCount: '1',
      },
    ],
    wageAssertions: [],
    appliedFactBindings: [],
  };
}

const SOURCE_AVAILABILITY: readonly LabourPopulationAvailability[] = [
  {
    countryId: 'COUNTRY_A',
    locationId: 'LOCATION_A',
    workingAgeAvailable: '10',
  },
];

const RESULT_AVAILABILITY: readonly LabourPopulationAvailability[] = [
  {
    countryId: 'COUNTRY_A',
    locationId: 'LOCATION_A',
    workingAgeAvailable: '12',
  },
];

function populationFacts(): readonly PopulationFact[] {
  return [
    {
      kind: 'MIGRATION_DEPARTURE',
      factId: 'FACT_DEPARTURE_B_TO_A',
      migrationId: 'MIGRATION_B_TO_A',
      countryId: 'COUNTRY_B',
      counterpartyCountryId: 'COUNTRY_A',
      cohort: 'WORKING_AGE_16_64',
      count: '2',
      dayIndex: '7',
    },
    {
      kind: 'MIGRATION_ARRIVAL',
      factId: 'FACT_ARRIVAL_B_TO_A',
      migrationId: 'MIGRATION_B_TO_A',
      countryId: 'COUNTRY_A',
      counterpartyCountryId: 'COUNTRY_B',
      cohort: 'WORKING_AGE_16_64',
      count: '2',
      dayIndex: '7',
      migrationLabourHandoff: {
        handoffId: 'HANDOFF_B_TO_A',
        disposition: 'PENDING_V11_2_CLASSIFICATION',
      },
    },
  ];
}

function labourFacts(handoffId = 'HANDOFF_B_TO_A'): readonly LabourFact[] {
  return [
    {
      kind: 'EDUCATION_SKILL_TRANSITION',
      factId: 'FACT_EDUCATION_LOW_TO_MEDIUM',
      countryId: 'COUNTRY_A',
      locationId: 'LOCATION_A',
      dayIndex: '7',
      educationTransitionVersion: 'EDUCATION_TRANSITION_V1',
      sourceSkill: 'LOW',
      targetSkill: 'MEDIUM',
      count: '1',
    },
    {
      kind: 'MIGRATION_LABOUR_ENTRY',
      factId: 'FACT_MIGRATION_ENTRY_B_TO_A',
      countryId: 'COUNTRY_A',
      locationId: 'LOCATION_A',
      dayIndex: '7',
      migrationHandoffId: handoffId,
      workRightsVersion: 'WORK_RIGHTS_V1',
      skill: 'HIGH',
      count: '1',
    },
  ];
}

function prepared(handoffId = 'HANDOFF_B_TO_A'): {
  readonly input: PopulationLabourInvariantInput;
  readonly sourceLabour: LabourEngineState;
} {
  const sourcePopulation = populationSource();
  const sourceLabour = labourSource();
  const appliedPopulation = applyPopulationFacts({
    boundary: DAY_7,
    state: sourcePopulation,
    facts: populationFacts(),
  });
  const appliedLabour = applyLabourFacts({
    boundary: DAY_7,
    populationAvailability: RESULT_AVAILABILITY,
    state: sourceLabour,
    facts: labourFacts(handoffId),
  });
  return {
    sourceLabour,
    input: {
      source: {
        population: {
          label: {
            snapshotId: 'SNAPSHOT_SOURCE',
            dayIndex: '7',
            callerTimeLabel: 'CALLER_TIME_SOURCE',
          },
          state: sourcePopulation,
        },
        labour: {
          label: {
            snapshotId: 'SNAPSHOT_SOURCE',
            dayIndex: '7',
            callerTimeLabel: 'CALLER_TIME_SOURCE',
          },
          state: sourceLabour,
          populationAvailability: SOURCE_AVAILABILITY,
        },
      },
      result: {
        population: {
          label: {
            snapshotId: 'SNAPSHOT_RESULT',
            dayIndex: '7',
            callerTimeLabel: 'CALLER_TIME_RESULT',
          },
          state: appliedPopulation.state,
        },
        labour: {
          label: {
            snapshotId: 'SNAPSHOT_RESULT',
            dayIndex: '7',
            callerTimeLabel: 'CALLER_TIME_RESULT',
          },
          state: appliedLabour.state,
          populationAvailability: RESULT_AVAILABILITY,
        },
      },
      populationEvidence: appliedPopulation.newlyAppliedFacts,
      labourEvidence: appliedLabour.newlyAppliedFacts,
    },
  };
}

function expectInvalid(action: () => unknown): void {
  expect(action).toThrowError(
    expect.objectContaining({
      code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
    }),
  );
}

describe('V11.3 E02/E03 population-labour invariants', () => {
  it('replays exact explicit E02/E03 evidence without choosing a snapshot ordering rule', () => {
    const receipt = validatePopulationLabourInvariants(prepared().input);

    expect(receipt).toEqual({
      populationFactIds: ['FACT_ARRIVAL_B_TO_A', 'FACT_DEPARTURE_B_TO_A'],
      labourFactIds: [
        'FACT_EDUCATION_LOW_TO_MEDIUM',
        'FACT_MIGRATION_ENTRY_B_TO_A',
      ],
      migrationHandoffIds: ['HANDOFF_B_TO_A'],
    });
  });

  it('rejects mismatched caller-selected E02/E03 snapshot labels', () => {
    const candidate = prepared().input;
    expectInvalid(() =>
      validatePopulationLabourInvariants({
        ...candidate,
        result: {
          ...candidate.result,
          labour: {
            ...candidate.result.labour,
            label: {
              ...candidate.result.labour.label,
              callerTimeLabel: 'CALLER_TIME_OTHER',
            },
          },
        },
      }),
    );
  });

  it('rejects direct labour or skill creation not reproduced by E03 evidence', () => {
    const candidate = prepared().input;
    expectInvalid(() =>
      validatePopulationLabourInvariants({
        ...candidate,
        result: {
          ...candidate.result,
          labour: {
            ...candidate.result.labour,
            state: {
              ...candidate.result.labour.state,
              aggregates: candidate.result.labour.state.aggregates.map((row) =>
                row.status === 'UNEMPLOYED_SEARCHING' && row.skill === 'HIGH'
                  ? { ...row, count: '2' }
                  : row,
              ),
            },
          },
        },
      }),
    );
  });

  it('rejects E03 location availability whose country total exceeds the E02 working-age cohort', () => {
    const candidate = prepared().input;
    expectInvalid(() =>
      validatePopulationLabourInvariants({
        ...candidate,
        result: {
          ...candidate.result,
          labour: {
            ...candidate.result.labour,
            populationAvailability: [
              ...RESULT_AVAILABILITY,
              {
                countryId: 'COUNTRY_A',
                locationId: 'LOCATION_B',
                workingAgeAvailable: '1',
              },
            ],
          },
        },
      }),
    );
  });

  it('rejects a labour migration entry without its exact working-age E02 arrival handoff', () => {
    expectInvalid(() =>
      validatePopulationLabourInvariants(prepared('HANDOFF_OTHER').input),
    );
  });

  it('rejects labour entries that exceed the linked E02 arrival count', () => {
    const candidate = prepared();
    const overused = applyLabourFacts({
      boundary: DAY_7,
      populationAvailability: RESULT_AVAILABILITY,
      state: candidate.sourceLabour,
      facts: labourFacts().map((fact) =>
        fact.kind === 'MIGRATION_LABOUR_ENTRY' ? { ...fact, count: '3' } : fact,
      ),
    });
    expectInvalid(() =>
      validatePopulationLabourInvariants({
        ...candidate.input,
        result: {
          ...candidate.input.result,
          labour: {
            ...candidate.input.result.labour,
            state: overused.state,
          },
        },
        labourEvidence: overused.newlyAppliedFacts,
      }),
    );
  });

  it('fails closed on malformed evidence and remains deterministic across evidence order', () => {
    const candidate = prepared().input;
    const reordered = validatePopulationLabourInvariants({
      ...candidate,
      populationEvidence: [...candidate.populationEvidence].reverse(),
      labourEvidence: [...candidate.labourEvidence].reverse(),
    });
    expect(reordered).toEqual(validatePopulationLabourInvariants(candidate));

    expectInvalid(() =>
      validatePopulationLabourInvariants({
        ...candidate,
        labourEvidence: [
          {
            ...candidate.labourEvidence[0]!,
            canonicalPayload: '{}',
          },
          ...candidate.labourEvidence.slice(1),
        ],
      }),
    );
  });

  it('rejects result states that break V11.2 private/public employment reconciliation', () => {
    const candidate = prepared().input;
    expectInvalid(() =>
      validatePopulationLabourInvariants({
        ...candidate,
        result: {
          ...candidate.result,
          labour: {
            ...candidate.result.labour,
            state: {
              ...candidate.result.labour.state,
              aggregates: candidate.result.labour.state.aggregates.map((row) =>
                row.status === 'EMPLOYED' && row.skill === 'MEDIUM'
                  ? { ...row, count: '3' }
                  : row,
              ),
            },
          },
        },
      }),
    );
  });
});
