import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  applyLabourFacts,
  canonicalSerialize,
  createE01DailyBoundary,
  type LabourAggregate,
  type LabourEngineState,
  type LabourFact,
} from '../../packages/core/src/index.js';

const DAY_7 = createE01DailyBoundary('7');
const AVAILABILITY = [
  {
    countryId: 'COUNTRY_A',
    locationId: 'LOCATION_A',
    workingAgeAvailable: '10',
  },
] as const;

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

function state(aggregates: readonly LabourAggregate[] = []): LabourEngineState {
  return {
    aggregates,
    positions: [],
    wageAssertions: [],
    appliedFactBindings: [],
  };
}

function apply(stateValue: LabourEngineState, facts: readonly LabourFact[]) {
  return applyLabourFacts({
    boundary: DAY_7,
    populationAvailability: AVAILABILITY,
    state: stateValue,
    facts,
  });
}

function privateDemand(
  factId: string,
  positionId: string,
  requiredCount: string,
): LabourFact {
  return {
    kind: 'PRIVATE_JOB_DEMAND_SET',
    factId,
    countryId: 'COUNTRY_A',
    locationId: 'LOCATION_A',
    dayIndex: '7',
    positionId,
    sectorId: 'MANUFACTURING',
    skill: 'MEDIUM',
    requiredCount,
  };
}

describe('V11.2 E03 Labour/Skill/Jobs/Wages', () => {
  it('keeps population availability read-only and admits skill only through explicit education or migration facts', () => {
    const empty = apply(state(), []);
    expect(empty.state.aggregates).toEqual([]);

    expect(() =>
      apply(state(), [
        {
          kind: 'EDUCATION_SKILL_TRANSITION',
          factId: 'FACT_EDUCATION_NO_STUDENT',
          countryId: 'COUNTRY_A',
          locationId: 'LOCATION_A',
          dayIndex: '7',
          educationTransitionVersion: 'EDUCATION_V1',
          sourceSkill: 'LOW',
          targetSkill: 'MEDIUM',
          count: '1',
        },
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );

    const educated = apply(state([aggregate('STUDENT', 'LOW', '4')]), [
      {
        kind: 'EDUCATION_SKILL_TRANSITION',
        factId: 'FACT_EDUCATION_MEDIUM',
        countryId: 'COUNTRY_A',
        locationId: 'LOCATION_A',
        dayIndex: '7',
        educationTransitionVersion: 'EDUCATION_V1',
        sourceSkill: 'LOW',
        targetSkill: 'MEDIUM',
        count: '4',
      },
    ]);
    expect(educated.state.aggregates).toEqual([
      aggregate('STUDENT', 'LOW', '0'),
      aggregate('UNEMPLOYED_SEARCHING', 'MEDIUM', '4'),
    ]);

    const migrant = apply(state(), [
      {
        kind: 'MIGRATION_LABOUR_ENTRY',
        factId: 'FACT_MIGRATION_WORK_RIGHTS',
        countryId: 'COUNTRY_A',
        locationId: 'LOCATION_A',
        dayIndex: '7',
        migrationHandoffId: 'MIGRATION_HANDOFF_A',
        workRightsVersion: 'WORK_RIGHTS_V1',
        skill: 'HIGH',
        count: '2',
      },
    ]);
    expect(migrant.state.aggregates).toEqual([
      aggregate('UNEMPLOYED_SEARCHING', 'HIGH', '2'),
    ]);
  });

  it('matches private and public positions against one shared unemployed pool without duplicate employment', () => {
    const initial = state([aggregate('UNEMPLOYED_SEARCHING', 'MEDIUM', '5')]);
    const withPrivatePosition = apply(initial, [
      privateDemand('FACT_PRIVATE_DEMAND', 'POSITION_PRIVATE_A', '4'),
    ]);
    const privatelyMatched = apply(withPrivatePosition.state, [
      {
        kind: 'JOB_MATCH',
        factId: 'FACT_PRIVATE_MATCH',
        countryId: 'COUNTRY_A',
        locationId: 'LOCATION_A',
        dayIndex: '7',
        positionId: 'POSITION_PRIVATE_A',
        skill: 'MEDIUM',
        count: '3',
      },
    ]);
    const withPublicPosition = apply(privatelyMatched.state, [
      {
        kind: 'PUBLIC_POSITION_SET',
        factId: 'FACT_PUBLIC_DEMAND',
        countryId: 'COUNTRY_A',
        locationId: 'LOCATION_A',
        dayIndex: '7',
        positionId: 'POSITION_PUBLIC_A',
        publicService: 'HEALTHCARE',
        skill: 'MEDIUM',
        requiredCount: '2',
      },
    ]);
    const publiclyOccupied = apply(withPublicPosition.state, [
      {
        kind: 'PUBLIC_SERVICE_OCCUPATION',
        factId: 'FACT_PUBLIC_OCCUPATION',
        countryId: 'COUNTRY_A',
        locationId: 'LOCATION_A',
        dayIndex: '7',
        positionId: 'POSITION_PUBLIC_A',
        skill: 'MEDIUM',
        count: '2',
      },
    ]);

    expect(publiclyOccupied.state.aggregates).toEqual([
      aggregate('EMPLOYED', 'MEDIUM', '5'),
      aggregate('UNEMPLOYED_SEARCHING', 'MEDIUM', '0'),
    ]);
    expect(publiclyOccupied.state.positions).toEqual([
      expect.objectContaining({
        positionId: 'POSITION_PRIVATE_A',
        owner: 'PRIVATE_SECTOR',
        employedCount: '3',
        requiredCount: '4',
      }),
      expect.objectContaining({
        positionId: 'POSITION_PUBLIC_A',
        owner: 'PUBLIC_SERVICE',
        classificationId: 'HEALTHCARE',
        employedCount: '2',
        requiredCount: '2',
      }),
    ]);
  });

  it('rejects skill/location/owner mismatch, vacancy overfill, separation underflow and same-batch timing chains', () => {
    const withPrivatePosition = apply(
      state([aggregate('UNEMPLOYED_SEARCHING', 'MEDIUM', '2')]),
      [privateDemand('FACT_PRIVATE_DEMAND_B', 'POSITION_PRIVATE_B', '1')],
    );

    expect(() =>
      apply(withPrivatePosition.state, [
        {
          kind: 'JOB_MATCH',
          factId: 'FACT_MATCH_WRONG_SKILL',
          countryId: 'COUNTRY_A',
          locationId: 'LOCATION_A',
          dayIndex: '7',
          positionId: 'POSITION_PRIVATE_B',
          skill: 'LOW',
          count: '1',
        },
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );

    expect(() =>
      apply(withPrivatePosition.state, [
        {
          kind: 'PUBLIC_SERVICE_OCCUPATION',
          factId: 'FACT_OCCUPY_PRIVATE_POSITION',
          countryId: 'COUNTRY_A',
          locationId: 'LOCATION_A',
          dayIndex: '7',
          positionId: 'POSITION_PRIVATE_B',
          skill: 'MEDIUM',
          count: '1',
        },
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );

    expect(() =>
      apply(withPrivatePosition.state, [
        {
          kind: 'JOB_MATCH',
          factId: 'FACT_MATCH_OVERFILL',
          countryId: 'COUNTRY_A',
          locationId: 'LOCATION_A',
          dayIndex: '7',
          positionId: 'POSITION_PRIVATE_B',
          skill: 'MEDIUM',
          count: '2',
        },
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );

    expect(() =>
      apply(withPrivatePosition.state, [
        {
          kind: 'LABOUR_SEPARATION',
          factId: 'FACT_SEPARATION_UNDERFLOW',
          countryId: 'COUNTRY_A',
          locationId: 'LOCATION_A',
          dayIndex: '7',
          positionId: 'POSITION_PRIVATE_B',
          skill: 'MEDIUM',
          count: '1',
        },
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );

    expect(() =>
      apply(state([aggregate('UNEMPLOYED_SEARCHING', 'MEDIUM', '1')]), [
        privateDemand('FACT_CHAIN_DEMAND', 'POSITION_CHAIN_A', '1'),
        {
          kind: 'JOB_MATCH',
          factId: 'FACT_CHAIN_MATCH',
          countryId: 'COUNTRY_A',
          locationId: 'LOCATION_A',
          dayIndex: '7',
          positionId: 'POSITION_CHAIN_A',
          skill: 'MEDIUM',
          count: '1',
        },
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );
  });

  it('requires an explicit canonical non-negative wage version for an existing position and never computes a wage', () => {
    const withPosition = apply(state(), [
      privateDemand('FACT_WAGE_DEMAND', 'POSITION_WAGE_A', '1'),
    ]);
    const wageFact: LabourFact = {
      kind: 'WAGE_ASSERTION',
      factId: 'FACT_WAGE_ASSERTION_A',
      countryId: 'COUNTRY_A',
      locationId: 'LOCATION_A',
      dayIndex: '7',
      positionId: 'POSITION_WAGE_A',
      wageVersion: 'WAGE_VERSION_A',
      wageAmount: '12.5',
    };
    const asserted = apply(withPosition.state, [wageFact]);
    expect(asserted.state.wageAssertions).toEqual([
      {
        positionId: 'POSITION_WAGE_A',
        wageVersion: 'WAGE_VERSION_A',
        wageAmount: '12.5',
      },
    ]);
    expect(asserted.state).not.toHaveProperty('minimumWage');
    expect(asserted.state).not.toHaveProperty('payroll');

    expect(() =>
      apply(withPosition.state, [
        { ...wageFact, factId: 'FACT_WAGE_NEGATIVE', wageAmount: '-1' },
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );
    expect(() =>
      apply(withPosition.state, [
        { ...wageFact, factId: 'FACT_WAGE_NONCANONICAL', wageAmount: '12.50' },
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );
    expect(() =>
      apply(asserted.state, [
        { ...wageFact, factId: 'FACT_WAGE_DUPLICATE_VERSION' },
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );
  });

  it('is deterministic across independent fact order and preserves exact fact retries', () => {
    const facts = [
      privateDemand('FACT_DEMAND_A', 'POSITION_A', '2'),
      {
        kind: 'PUBLIC_POSITION_SET' as const,
        factId: 'FACT_DEMAND_B',
        countryId: 'COUNTRY_A',
        locationId: 'LOCATION_A',
        dayIndex: '7',
        positionId: 'POSITION_B',
        publicService: 'EDUCATION' as const,
        skill: 'LOW' as const,
        requiredCount: '1',
      },
    ] as const satisfies readonly LabourFact[];
    const first = apply(state(), facts);
    const reordered = apply(state(), [...facts].reverse());
    expect(canonicalSerialize(reordered)).toBe(canonicalSerialize(first));

    const retry = apply(first.state, facts);
    expect(retry.state).toEqual(first.state);
    expect(retry.newlyAppliedFacts).toEqual([]);
    expect(retry.idempotentFactIds).toEqual(['FACT_DEMAND_A', 'FACT_DEMAND_B']);
  });

  it('fails closed for fact conflicts, restored factId aliases, bad aggregate reconciliation and labour above population availability', () => {
    const first = apply(state(), [
      privateDemand('FACT_RESTORED_DEMAND', 'POSITION_RESTORED_A', '1'),
    ]);
    const payload = first.state.appliedFactBindings[0]!.canonicalPayload;

    expect(() =>
      apply(
        {
          ...first.state,
          appliedFactBindings: [
            { factId: 'FACT_OUTER_ALIAS_A', canonicalPayload: payload },
          ],
        },
        [privateDemand('FACT_RESTORED_DEMAND', 'POSITION_RESTORED_A', '1')],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );

    expect(() =>
      apply(first.state, [
        privateDemand('FACT_RESTORED_DEMAND', 'POSITION_RESTORED_A', '2'),
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );

    expect(() =>
      apply(
        {
          ...first.state,
          aggregates: [aggregate('EMPLOYED', 'MEDIUM', '1')],
        },
        [],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );

    expect(() =>
      applyLabourFacts({
        boundary: DAY_7,
        populationAvailability: [
          {
            countryId: 'COUNTRY_A',
            locationId: 'LOCATION_A',
            workingAgeAvailable: '1',
          },
        ],
        state: state(),
        facts: [
          {
            kind: 'MIGRATION_LABOUR_ENTRY',
            factId: 'FACT_OVER_AVAILABLE_POPULATION',
            countryId: 'COUNTRY_A',
            locationId: 'LOCATION_A',
            dayIndex: '7',
            migrationHandoffId: 'MIGRATION_HANDOFF_OVER',
            workRightsVersion: 'WORK_RIGHTS_V1',
            skill: 'HIGH',
            count: '2',
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );
  });
});
