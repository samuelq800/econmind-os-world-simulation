import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION,
  V27_2_REQUIRED_COUNTRY_COUNT,
  V27_2_REQUIRED_COUNTRY_COUNT_VALUE,
  validateV27_2CalibrationPreparation,
  v27_2CountryConfigurationRef,
} from '../../packages/core/src/calibration/index.js';
import { DOMAIN_ERROR_CODES } from '../../packages/core/src/errors.js';
import {
  openingSeedId,
  openingSourceId,
  worldId,
} from '../../packages/core/src/ids.js';
import { SimTime } from '../../packages/core/src/numeric/sim-time.js';
import {
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  createOpeningSeed,
  createOpeningSource,
} from '../../packages/core/src/opening/opening-seed.js';
import { SINGLE_WORLD_CONFIGURATION_VERSION } from '../../packages/core/src/orchestration/single-world-configuration.js';
import { prepareSharedCoreOpeningInput } from '../../packages/core/src/orchestration/shared-core-opening-input.js';
import { CURRENT_REPLAY_BINDING } from '../../packages/core/src/replay/replay.js';
import { SIMULATION_CLOCK_VERSION } from '../../packages/core/src/time/simulation-clock.js';
import { WORLD_MODEL_VERSION } from '../../packages/core/src/versions.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const SOURCE_REF = 'source.synthetic-fixture';
const ASSUMPTION_REF = 'assumption.synthetic-fixture';

function quantity(amount: string, unit: string) {
  const changeToken = `${unit}-${amount}`.replace(/[^A-Za-z0-9.-]/gu, '-');
  return {
    amount,
    unit,
    sourceUnit: unit,
    sourceRef: SOURCE_REF,
    assumptionRef: ASSUMPTION_REF,
    changes: [
      {
        changeRef: `change.${changeToken}`,
        before: '0',
        delta: amount,
        after: amount,
        unit,
        sourceRef: SOURCE_REF,
        assumptionRef: ASSUMPTION_REF,
      },
    ],
  };
}

function country(index: number) {
  const suffix = String(index).padStart(2, '0');
  const countryId = `COUNTRY_${suffix}`;
  return {
    countryId,
    archetypeRef: `archetype.fixture-${suffix}`,
    financialBatches: [
      {
        batchRef: `batch.finance-${suffix}`,
        legs: [
          {
            legRef: `leg.cash-${suffix}`,
            accountRef: `account.cash-${suffix}`,
            direction: 'DEBIT',
            quantity: quantity('100', 'LC_MINOR'),
            counterpartLegRef: `leg.equity-${suffix}`,
          },
          {
            legRef: `leg.equity-${suffix}`,
            accountRef: `account.equity-${suffix}`,
            direction: 'CREDIT',
            quantity: quantity('100', 'LC_MINOR'),
            counterpartLegRef: `leg.cash-${suffix}`,
          },
        ],
      },
    ],
    inventoryClosures: [
      {
        commodityId: 'GRAIN',
        total: quantity('10', 'tonne'),
        buckets: {
          available: quantity('4', 'tonne'),
          reserved: quantity('3', 'tonne'),
          strategic: quantity('2', 'tonne'),
          inTransit: quantity('1', 'tonne'),
        },
      },
    ],
    geologicalClosures: [
      {
        resourceId: 'IRON_ORE',
        total: quantity('10', 'tonne'),
        layers: {
          undiscovered: quantity('2', 'tonne'),
          discoveredUnrecoverable: quantity('2', 'tonne'),
          recoverableUndeveloped: quantity('2', 'tonne'),
          developedRemaining: quantity('2', 'tonne'),
          cumulativeExtracted: quantity('2', 'tonne'),
        },
      },
    ],
    facilities: [
      {
        facilityId: `FACILITY_${suffix}`,
        installedCapacity: quantity('10', 'tonne/day'),
        operationalCapacity: quantity('8', 'tonne/day'),
        staffRequired: quantity('10', 'person'),
        staffAssigned: quantity('8', 'person'),
      },
    ],
    supplyChains: [
      {
        commodityId: 'GRAIN',
        supplierShares: [
          {
            supplierCountryId: countryId,
            share: quantity('1', 'ratio'),
          },
        ],
      },
    ],
  };
}

function fixture() {
  const countries = Array.from(
    { length: V27_2_REQUIRED_COUNTRY_COUNT },
    (_, index) => country(index + 1),
  );
  const worldId = 'WORLD_CALIBRATION_TEST';
  return {
    schemaVersion: V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION,
    worldId,
    countryConfigurationRef: v27_2CountryConfigurationRef(
      { worldId, countryIds: countries.map((item) => item.countryId) },
      sha256,
    ),
    expectedCountryCount: V27_2_REQUIRED_COUNTRY_COUNT_VALUE,
    sources: [
      {
        sourceRef: SOURCE_REF,
        classification: 'SYNTHETIC_CALIBRATION',
        locator: 'tests/world-core/v27-2-synthetic-fixture',
        sourceVersion: 'fixture-v1',
        contentHash: `sha256:${'a'.repeat(64)}`,
      },
    ],
    countries,
  };
}

function openingSeed(
  sourceKind:
    'AUTHORITATIVE_DATASET' | 'TEST_FIXTURE' = 'AUTHORITATIVE_DATASET',
  seedWorldId = 'WORLD_CALIBRATION_TEST',
) {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_SHARED_CORE_OPENING'),
      sourceKind,
      locator: 'dataset://opening/shared-core-preparation',
      sourceVersion: '2026-09-24',
      payload: { dataset: 'shared-core-opening-preparation' },
    },
    sha256,
  );
  return createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_SHARED_CORE_OPENING'),
      worldId: worldId(seedWorldId),
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha256,
  );
}

function sharedCoreInput() {
  const calibration = fixture();
  return {
    calibration,
    configuration: {
      schemaVersion: SINGLE_WORLD_CONFIGURATION_VERSION,
      worldId: calibration.worldId,
      modelVersion: WORLD_MODEL_VERSION,
      countryCount: '70',
      countryConfigurationRef: calibration.countryConfigurationRef,
      clockVersion: SIMULATION_CLOCK_VERSION,
      economicExpiryClock: 'SIM_TIME',
    },
    openingSeed: openingSeed(),
    initialSimTime: SimTime.fromTicks('0'),
    sha256Hex: sha256,
  };
}

function expectInvalid(operation: () => unknown): void {
  expect(operation).toThrowError(
    expect.objectContaining({ code: DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID }),
  );
}

describe('V27.2 deterministic calibration closure preparation', () => {
  it('closes a complete 70-country synthetic test candidate without authorizing generation', () => {
    const result = validateV27_2CalibrationPreparation(fixture(), sha256);
    expect(result).toMatchObject({
      status: 'PREPARATION_INPUT_CLOSED',
      generationAuthorized: false,
      countryCount: 70,
      issues: [],
      fingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
    if (result.status !== 'PREPARATION_INPUT_CLOSED') {
      throw new Error('expected closed preparation input');
    }
    expect(result.candidate.countries).toHaveLength(70);
    expect(JSON.stringify(result.candidate)).not.toMatch(
      /buff|multiplier|perTurn|perTick/iu,
    );
  });

  it('canonicalizes source and country order deterministically', () => {
    const ordered = fixture();
    const reversed = fixture();
    reversed.countries.reverse();
    const first = validateV27_2CalibrationPreparation(ordered, sha256);
    const second = validateV27_2CalibrationPreparation(reversed, sha256);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(
      v27_2CountryConfigurationRef(
        {
          worldId: ordered.worldId,
          countryIds: ordered.countries.map((item) => item.countryId),
        },
        sha256,
      ),
    ).toBe(
      v27_2CountryConfigurationRef(
        {
          worldId: reversed.worldId,
          countryIds: reversed.countries.map((item) => item.countryId),
        },
        sha256,
      ),
    );
  });

  it('binds one World and exact country identity set while rejecting old or forged schemas', () => {
    const original = fixture();
    const closed = validateV27_2CalibrationPreparation(original, sha256);
    expect(closed.status).toBe('PREPARATION_INPUT_CLOSED');
    if (closed.status !== 'PREPARATION_INPUT_CLOSED') return;
    expect(closed.candidate.worldId).toBe(original.worldId);
    expect(closed.candidate.countryConfigurationRef).toBe(
      original.countryConfigurationRef,
    );
    const differentWorld = fixture();
    differentWorld.worldId = 'WORLD_OTHER';
    differentWorld.countryConfigurationRef = v27_2CountryConfigurationRef(
      {
        worldId: differentWorld.worldId,
        countryIds: differentWorld.countries.map((item) => item.countryId),
      },
      sha256,
    );
    expect(
      validateV27_2CalibrationPreparation(differentWorld, sha256).fingerprint,
    ).not.toBe(closed.fingerprint);

    const oldSchema = {
      ...fixture(),
      schemaVersion: 'v27.2-country-calibration-preparation-v1',
    };
    expectInvalid(() => validateV27_2CalibrationPreparation(oldSchema, sha256));
    const missingBinding = { ...fixture() } as Record<string, unknown>;
    delete missingBinding.countryConfigurationRef;
    expectInvalid(() =>
      validateV27_2CalibrationPreparation(missingBinding, sha256),
    );
    const wrongWorld = { ...fixture(), worldId: 'WORLD_OTHER' };
    expectInvalid(() =>
      validateV27_2CalibrationPreparation(wrongWorld, sha256),
    );
    const wrongRef = {
      ...fixture(),
      countryConfigurationRef: `sha256:${'b'.repeat(64)}`,
    };
    expect(() => validateV27_2CalibrationPreparation(wrongRef, sha256)).toThrow(
      'countryConfigurationRef does not bind World and country IDs',
    );
    const wrongSet = fixture();
    wrongSet.countries[0]!.countryId = 'COUNTRY_99';
    expectInvalid(() => validateV27_2CalibrationPreparation(wrongSet, sha256));
  });

  it('reports missing countries and domain inputs as incomplete', () => {
    const missingCountry = fixture();
    missingCountry.countries.pop();
    expect(
      validateV27_2CalibrationPreparation(missingCountry, sha256),
    ).toMatchObject({
      status: 'PREPARATION_INCOMPLETE',
      generationAuthorized: false,
      countryCount: 69,
      fingerprint: null,
      issues: [expect.stringContaining('expected 70 countries')],
    });

    const missingDomain = fixture();
    missingDomain.countries[0]!.facilities = [];
    const result = validateV27_2CalibrationPreparation(missingDomain, sha256);
    expect(result.status).toBe('PREPARATION_INCOMPLETE');
    expect(result.issues).toContain(
      'COUNTRY_01 is missing required facility/staffing input',
    );
  });

  it('reports placeholder evidence as incomplete instead of fabricating a value', () => {
    const input = fixture();
    input.sources[0]!.classification = 'PLACEHOLDER';
    const result = validateV27_2CalibrationPreparation(input, sha256);
    expect(result).toMatchObject({
      status: 'PREPARATION_INCOMPLETE',
      generationAuthorized: false,
      fingerprint: null,
    });
    expect(result.issues).toContain(`source ${SOURCE_REF} remains PLACEHOLDER`);
  });

  it('rejects duplicate countries and foreign source references', () => {
    const duplicate = fixture();
    duplicate.countries[1] = structuredClone(duplicate.countries[0]!);
    expectInvalid(() => validateV27_2CalibrationPreparation(duplicate, sha256));

    const foreignSource = fixture();
    foreignSource.countries[0]!.facilities[0]!.installedCapacity.sourceRef =
      'source.unknown';
    expectInvalid(() =>
      validateV27_2CalibrationPreparation(foreignSource, sha256),
    );
  });

  it('rejects 0-100 index substitution and all implicit unit conversion', () => {
    const indexInput = fixture();
    indexInput.countries[0]!.inventoryClosures[0]!.total.unit = 'INDEX_0_100';
    indexInput.countries[0]!.inventoryClosures[0]!.total.sourceUnit =
      'INDEX_0_100';
    expectInvalid(() =>
      validateV27_2CalibrationPreparation(indexInput, sha256),
    );

    const conversion = fixture();
    conversion.countries[0]!.inventoryClosures[0]!.total.sourceUnit =
      'kilogram';
    expectInvalid(() =>
      validateV27_2CalibrationPreparation(conversion, sha256),
    );
  });

  it('rejects financial, inventory, and geological imbalance exactly', () => {
    const financial = fixture();
    financial.countries[0]!.financialBatches[0]!.legs[1]!.quantity = quantity(
      '99',
      'LC_MINOR',
    );
    expectInvalid(() => validateV27_2CalibrationPreparation(financial, sha256));

    const inventory = fixture();
    inventory.countries[0]!.inventoryClosures[0]!.total = quantity(
      '11',
      'tonne',
    );
    expectInvalid(() => validateV27_2CalibrationPreparation(inventory, sha256));

    const geology = fixture();
    geology.countries[0]!.geologicalClosures[0]!.total = quantity(
      '11',
      'tonne',
    );
    expectInvalid(() => validateV27_2CalibrationPreparation(geology, sha256));
  });

  it('rejects a financial leg without a reciprocal opposite counterpart', () => {
    const input = fixture();
    input.countries[0]!.financialBatches[0]!.legs[0]!.counterpartLegRef =
      'leg.missing';
    expectInvalid(() => validateV27_2CalibrationPreparation(input, sha256));
  });

  it('rejects impossible facility and staffing bounds', () => {
    const capacity = fixture();
    capacity.countries[0]!.facilities[0]!.operationalCapacity = quantity(
      '11',
      'tonne/day',
    );
    expectInvalid(() => validateV27_2CalibrationPreparation(capacity, sha256));

    const staffing = fixture();
    staffing.countries[0]!.facilities[0]!.staffAssigned = quantity(
      '11',
      'person',
    );
    expectInvalid(() => validateV27_2CalibrationPreparation(staffing, sha256));
  });

  it('rejects unclosed or foreign supply-chain shares', () => {
    const unclosed = fixture();
    unclosed.countries[0]!.supplyChains[0]!.supplierShares[0]!.share = quantity(
      '0.9',
      'ratio',
    );
    expectInvalid(() => validateV27_2CalibrationPreparation(unclosed, sha256));

    const foreign = fixture();
    foreign.countries[0]!.supplyChains[0]!.supplierShares[0]!.supplierCountryId =
      'COUNTRY_71';
    expectInvalid(() => validateV27_2CalibrationPreparation(foreign, sha256));
  });

  it('requires exact traceable changes and explicit assumptions for synthetic values', () => {
    const missingAssumption = fixture();
    missingAssumption.countries[0]!.facilities[0]!.installedCapacity.assumptionRef =
      null;
    expectInvalid(() =>
      validateV27_2CalibrationPreparation(missingAssumption, sha256),
    );

    const brokenTrace = fixture();
    brokenTrace.countries[0]!.facilities[0]!.installedCapacity.changes[0]!.after =
      '9';
    expectInvalid(() =>
      validateV27_2CalibrationPreparation(brokenTrace, sha256),
    );
  });

  it('rejects observed values that hide assumptions or calibration changes', () => {
    const observed = fixture();
    observed.sources[0]!.classification = 'OBSERVED';
    expectInvalid(() => validateV27_2CalibrationPreparation(observed, sha256));
  });

  it('rejects archetype buff fields through exact runtime shapes', () => {
    const input = fixture();
    Object.assign(input.countries[0]!, {
      perTurnBuff: { productionMultiplier: '1.15' },
    });
    expectInvalid(() => validateV27_2CalibrationPreparation(input, sha256));
  });
});

describe('V27 to V28 neutral shared-Core opening input', () => {
  it('binds matching World/config/count/opening identities but never authorizes initialization', () => {
    const first = prepareSharedCoreOpeningInput(sharedCoreInput());
    const replay = prepareSharedCoreOpeningInput(sharedCoreInput());
    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      status: 'PREPARATION_ONLY',
      initializationAuthorized: false,
      orchestratorSelected: false,
      worldIdStatus: 'V27_V28_OPENING_MATCHED',
      configurationRefStatus: 'V27_V28_ONLY',
      worldId: 'WORLD_CALIBRATION_TEST',
      countryCount: '70',
      initialSimTime: '0',
      blockers: [
        'V27_1_PROVENANCE_LINK_UNVERIFIED',
        'COUNTRY_CONFIGURATION_AUTHORITY_UNVERIFIED',
        'OPENING_DURABILITY_UNVERIFIED',
        'OPENING_CONFIGURATION_BINDING_UNAVAILABLE',
        'CALIBRATION_OPENING_LINEAGE_UNVERIFIED',
        'V27_V28_DEPENDENCY_AND_ADR_GATE_OPEN',
      ],
    });
    expect(first.countryConfigurationRef).toBe(
      sharedCoreInput().calibration.countryConfigurationRef,
    );
    expect(first.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.blockers)).toBe(true);
    expect(first).not.toHaveProperty('command');
    expect(first).not.toHaveProperty('event');
  });

  it('rejects mismatched World, configuration ref, count and nonzero clock', () => {
    const refMismatch = sharedCoreInput();
    refMismatch.configuration.countryConfigurationRef = `sha256:${'b'.repeat(64)}`;
    expectInvalid(() => prepareSharedCoreOpeningInput(refMismatch));

    const worldMismatch = sharedCoreInput();
    worldMismatch.configuration.worldId = 'WORLD_OTHER';
    expectInvalid(() => prepareSharedCoreOpeningInput(worldMismatch));

    const countMismatch = sharedCoreInput();
    countMismatch.configuration.countryCount = '69';
    expectInvalid(() => prepareSharedCoreOpeningInput(countMismatch));

    const nonzero = sharedCoreInput();
    nonzero.initialSimTime = SimTime.fromTicks('1');
    expectInvalid(() => prepareSharedCoreOpeningInput(nonzero));

    const openingWorldMismatch = sharedCoreInput();
    openingWorldMismatch.openingSeed = openingSeed(
      'AUTHORITATIVE_DATASET',
      'WORLD_OTHER',
    );
    expectInvalid(() => prepareSharedCoreOpeningInput(openingWorldMismatch));
  });

  it('rejects incomplete calibration, forged opening and fixture provenance', () => {
    const incomplete = sharedCoreInput();
    incomplete.calibration.countries.pop();
    expectInvalid(() => prepareSharedCoreOpeningInput(incomplete));

    const forged = sharedCoreInput();
    forged.openingSeed = {
      ...forged.openingSeed,
      fingerprint: `sha256:${'b'.repeat(64)}`,
    } as typeof forged.openingSeed;
    expect(() => prepareSharedCoreOpeningInput(forged)).toThrow();

    const fixtureSource = sharedCoreInput();
    fixtureSource.openingSeed = openingSeed('TEST_FIXTURE');
    expectInvalid(() => prepareSharedCoreOpeningInput(fixtureSource));
  });
});
