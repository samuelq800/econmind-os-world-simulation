import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  applyPopulationFacts,
  canonicalSerialize,
  createE01DailyBoundary,
  type PopulationCountryState,
  type PopulationEngineState,
  type PopulationFact,
} from '../../packages/core/src/index.js';

const DAY_7 = createE01DailyBoundary('7');

function country(
  countryId: string,
  children0To15: string,
  workingAge16To64: string,
  retired65Plus: string,
  householdCount = '1',
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
    householdCount,
  };
}

function initialState(
  countries: readonly PopulationCountryState[] = [
    country('COUNTRY_A', '20', '70', '10', '30'),
    country('COUNTRY_B', '10', '30', '10', '15'),
  ],
): PopulationEngineState {
  return { countries, appliedFactBindings: [] };
}

function migrationFacts(): readonly PopulationFact[] {
  return [
    {
      kind: 'MIGRATION_DEPARTURE',
      factId: 'FACT_MIGRATION_DEPARTURE_A_B',
      migrationId: 'MIGRATION_A_B_1',
      countryId: 'COUNTRY_A',
      counterpartyCountryId: 'COUNTRY_B',
      cohort: 'WORKING_AGE_16_64',
      count: '7',
      dayIndex: '7',
    },
    {
      kind: 'MIGRATION_ARRIVAL',
      factId: 'FACT_MIGRATION_ARRIVAL_A_B',
      migrationId: 'MIGRATION_A_B_1',
      countryId: 'COUNTRY_B',
      counterpartyCountryId: 'COUNTRY_A',
      cohort: 'WORKING_AGE_16_64',
      count: '7',
      dayIndex: '7',
      migrationLabourHandoff: {
        handoffId: 'HANDOFF_MIGRATION_A_B_1',
        disposition: 'PENDING_V11_2_CLASSIFICATION',
      },
    },
  ];
}

describe('V11.1 E02 Population Stocks/Flows', () => {
  it('closes country population identity with explicit births, deaths and cohort rolls', () => {
    const result = applyPopulationFacts({
      boundary: DAY_7,
      state: initialState(),
      facts: [
        {
          kind: 'BIRTH',
          factId: 'FACT_BIRTH_A',
          countryId: 'COUNTRY_A',
          dayIndex: '7',
          count: '4',
        },
        {
          kind: 'DEATH',
          factId: 'FACT_DEATH_A',
          countryId: 'COUNTRY_A',
          dayIndex: '7',
          cohort: 'RETIRED_65_PLUS',
          count: '3',
          cause: 'BASELINE',
          mortalityModifierVersion: null,
        },
        {
          kind: 'AGE_COHORT_ROLL',
          factId: 'FACT_AGE_ROLL_A',
          countryId: 'COUNTRY_A',
          dayIndex: '7',
          fromCohort: 'CHILDREN_0_15',
          toCohort: 'WORKING_AGE_16_64',
          count: '5',
        },
      ],
    });

    expect(result.state.countries).toEqual([
      {
        countryId: 'COUNTRY_A',
        total: '101',
        children0To15: '19',
        workingAge16To64: '75',
        retired65Plus: '7',
        householdCount: '30',
      },
      country('COUNTRY_B', '10', '30', '10', '15'),
    ]);
    expect(result.countryTransitions).toEqual([
      expect.objectContaining({
        countryId: 'COUNTRY_A',
        previousTotal: '100',
        births: '4',
        deaths: '3',
        immigration: '0',
        emigration: '0',
        nextTotal: '101',
      }),
      expect.objectContaining({
        countryId: 'COUNTRY_B',
        previousTotal: '50',
        nextTotal: '50',
      }),
    ]);
  });

  it('applies only paired, equal, cross-country migration and preserves handoff as metadata', () => {
    const result = applyPopulationFacts({
      boundary: DAY_7,
      state: initialState(),
      facts: migrationFacts(),
    });

    expect(result.state.countries).toEqual([
      country('COUNTRY_A', '20', '63', '10', '30'),
      country('COUNTRY_B', '10', '37', '10', '15'),
    ]);
    expect(result.countryTransitions).toEqual([
      expect.objectContaining({
        countryId: 'COUNTRY_A',
        emigration: '7',
        immigration: '0',
        previousTotal: '100',
        nextTotal: '93',
      }),
      expect.objectContaining({
        countryId: 'COUNTRY_B',
        emigration: '0',
        immigration: '7',
        previousTotal: '50',
        nextTotal: '57',
      }),
    ]);
    const arrival = result.newlyAppliedFacts.find(
      (fact) => fact.kind === 'MIGRATION_ARRIVAL',
    );
    expect(arrival?.canonicalPayload).toContain('PENDING_V11_2_CLASSIFICATION');
    expect(result.state.countries[1]).not.toHaveProperty('labour');
    expect(result.state.countries[1]).not.toHaveProperty('skill');
    expect(result.state.countries[1]).not.toHaveProperty('wage');
  });

  it('keeps scheduled-not-arrived migration outside population stocks and flows', () => {
    const state = initialState();
    const result = applyPopulationFacts({
      boundary: DAY_7,
      state,
      facts: [],
      scheduledMigrationNotices: [
        {
          migrationId: 'MIGRATION_SCHEDULED_A_B',
          originCountryId: 'COUNTRY_A',
          destinationCountryId: 'COUNTRY_B',
          cohort: 'WORKING_AGE_16_64',
          count: '9',
          scheduledDayIndex: '8',
        },
      ],
    });

    expect(result.state.countries).toEqual([
      country('COUNTRY_A', '20', '70', '10', '30'),
      country('COUNTRY_B', '10', '30', '10', '15'),
    ]);
    expect(result.newlyAppliedFacts).toEqual([]);
    expect(result.scheduledMigrationIds).toEqual(['MIGRATION_SCHEDULED_A_B']);
  });

  it('is deterministic across input order and exact retries, without locale ordering', () => {
    const facts = migrationFacts();
    const localeCompare = String.prototype.localeCompare;
    String.prototype.localeCompare = () => {
      throw new Error(
        'localeCompare must not order authoritative population facts',
      );
    };
    try {
      const first = applyPopulationFacts({
        boundary: DAY_7,
        state: initialState(),
        facts,
      });
      const reordered = applyPopulationFacts({
        boundary: DAY_7,
        state: initialState(),
        facts: [...facts].reverse(),
      });
      const retry = applyPopulationFacts({
        boundary: DAY_7,
        state: first.state,
        facts,
      });

      expect(canonicalSerialize(reordered)).toBe(canonicalSerialize(first));
      expect(retry.state).toEqual(first.state);
      expect(retry.newlyAppliedFacts).toEqual([]);
      expect(retry.idempotentFactIds).toEqual([
        'FACT_MIGRATION_ARRIVAL_A_B',
        'FACT_MIGRATION_DEPARTURE_A_B',
      ]);
    } finally {
      String.prototype.localeCompare = localeCompare;
    }
  });

  it('aggregates same-boundary cohort deltas so immutable fact IDs cannot select period timing', () => {
    const factsWithBirthFirst: readonly PopulationFact[] = [
      {
        kind: 'BIRTH',
        factId: 'FACT_A_BIRTH',
        countryId: 'COUNTRY_A',
        dayIndex: '7',
        count: '5',
      },
      {
        kind: 'AGE_COHORT_ROLL',
        factId: 'FACT_Z_AGE_ROLL',
        countryId: 'COUNTRY_A',
        dayIndex: '7',
        fromCohort: 'CHILDREN_0_15',
        toCohort: 'WORKING_AGE_16_64',
        count: '5',
      },
    ];
    const factsWithAgeFirst: readonly PopulationFact[] = [
      { ...factsWithBirthFirst[0]!, factId: 'FACT_Z_BIRTH' },
      { ...factsWithBirthFirst[1]!, factId: 'FACT_A_AGE_ROLL' },
    ];
    const state = initialState([country('COUNTRY_A', '1', '0', '0')]);

    const first = applyPopulationFacts({
      boundary: DAY_7,
      state,
      facts: factsWithBirthFirst,
    });
    const second = applyPopulationFacts({
      boundary: DAY_7,
      state,
      facts: factsWithAgeFirst,
    });

    expect(first.state.countries).toEqual([
      country('COUNTRY_A', '1', '5', '0'),
    ]);
    expect(second.state.countries).toEqual(first.state.countries);
  });

  it('rejects a unilateral, mismatched, duplicate-identity or underflowing flow before a result exists', () => {
    const unilateral = migrationFacts()[0]!;
    expect(() =>
      applyPopulationFacts({
        boundary: DAY_7,
        state: initialState(),
        facts: [unilateral],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );

    const mismatched = migrationFacts().map((fact) =>
      fact.kind === 'MIGRATION_ARRIVAL' ? { ...fact, count: '8' } : fact,
    );
    expect(() =>
      applyPopulationFacts({
        boundary: DAY_7,
        state: initialState(),
        facts: mismatched,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );

    expect(() =>
      applyPopulationFacts({
        boundary: DAY_7,
        state: initialState([country('COUNTRY_A', '1', '0', '0')]),
        facts: [
          {
            kind: 'DEATH',
            factId: 'FACT_UNDERFLOW_A',
            countryId: 'COUNTRY_A',
            dayIndex: '7',
            cohort: 'CHILDREN_0_15',
            count: '2',
            cause: 'CRISIS_CASUALTY',
            mortalityModifierVersion: 'CRISIS_EVENT_1',
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );

    const first = applyPopulationFacts({
      boundary: DAY_7,
      state: initialState(),
      facts: [
        {
          kind: 'BIRTH',
          factId: 'FACT_CONFLICT_A',
          countryId: 'COUNTRY_A',
          dayIndex: '7',
          count: '1',
        },
      ],
    });
    expect(() =>
      applyPopulationFacts({
        boundary: DAY_7,
        state: first.state,
        facts: [
          {
            kind: 'BIRTH',
            factId: 'FACT_CONFLICT_A',
            countryId: 'COUNTRY_A',
            dayIndex: '7',
            count: '2',
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );

    const migrated = applyPopulationFacts({
      boundary: DAY_7,
      state: initialState(),
      facts: migrationFacts(),
    });
    const replayWithNewFactIds = migrationFacts().map((fact) => ({
      ...fact,
      factId:
        fact.kind === 'MIGRATION_DEPARTURE'
          ? 'FACT_REPLAY_DEPARTURE_A_B'
          : 'FACT_REPLAY_ARRIVAL_A_B',
    }));
    expect(() =>
      applyPopulationFacts({
        boundary: DAY_7,
        state: migrated.state,
        facts: replayWithNewFactIds,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );
  });

  it('keeps household reconciliation and dependency metrics derived from population alone', () => {
    const result = applyPopulationFacts({
      boundary: DAY_7,
      state: initialState([country('COUNTRY_A', '40', '40', '20', '10')]),
      facts: [
        {
          kind: 'HOUSEHOLD_COUNT_UPDATE',
          factId: 'FACT_HOUSEHOLD_A',
          countryId: 'COUNTRY_A',
          dayIndex: '7',
          householdCount: '12',
          populationTotalForReconciliation: '99',
        },
      ],
    });

    expect(result.state.countries).toEqual([
      country('COUNTRY_A', '40', '40', '20', '12'),
    ]);
    expect(result.countryTransitions[0]).toMatchObject({
      previousTotal: '100',
      nextTotal: '100',
      dependencyRatio: { numerator: '3', denominator: '2' },
    });
    expect(result.reconciliationWarnings).toEqual([
      {
        factId: 'FACT_HOUSEHOLD_A',
        countryId: 'COUNTRY_A',
        householdCount: '12',
        suppliedPopulationTotal: '99',
        actualPopulationTotal: '100',
        code: 'HOUSEHOLD_RECONCILIATION_MISMATCH',
      },
    ]);
  });

  it('rejects a state whose stated total is not the sum of its cohorts', () => {
    expect(() =>
      applyPopulationFacts({
        boundary: DAY_7,
        state: {
          countries: [
            {
              ...country('COUNTRY_A', '1', '2', '3'),
              total: '7',
            },
          ],
          appliedFactBindings: [],
        },
        facts: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
      }),
    );
  });
});
