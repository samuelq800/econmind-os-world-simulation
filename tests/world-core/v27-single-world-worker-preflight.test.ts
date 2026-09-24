import { describe, expect, it } from 'vitest';

import { SimTime, countryId, worldId } from '@econmind/core';

import { getWorkerFoundationStatus } from '../../apps/world-worker/src/index.js';
import {
  inspectSingleWorldWorkerPreparation,
  type WorkerSingleWorldPreflightInput,
} from '../../apps/world-worker/src/preparation/single-world-preflight.js';
import {
  COUNTRY_SEED_PROVENANCE_SCHEMA,
  parseCountrySeedProvenance,
} from '../../packages/core/src/opening/country-seed-provenance-preparation.js';
import { V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION } from '../../packages/core/src/calibration/country-input-closure.js';

const WORLD = worldId('WORLD_V27_WORKER_TEST');
const COUNTRY_IDS = Array.from(
  { length: 70 },
  (_, index) => `COUNTRY_${String(index + 1).padStart(2, '0')}`,
);
const DOMAINS = [
  ['POPULATION', 'COUNT', 'person'],
  ['RESOURCES', 'QUANTITY', 'tonne'],
  ['FACILITIES', 'COUNT', 'facility'],
  ['TECHNOLOGY', 'COUNT', 'license'],
  ['ACCOUNTS', 'MONEY', 'GCU'],
  ['TRADE_DEPENDENCY', 'SHARE', 'ratio'],
] as const;

function provenance() {
  return parseCountrySeedProvenance({
    schemaVersion: COUNTRY_SEED_PROVENANCE_SCHEMA,
    worldId: WORLD,
    seasonRef: 'LEGACY_PROVENANCE_AUDIT_REF',
    configuredCountryIds: COUNTRY_IDS,
    sources: [],
    countries: COUNTRY_IDS.map((country, index) => ({
      countryId: country,
      fields: DOMAINS.map(([domain, numericKind, unit]) => ({
        status: 'MISSING',
        domain,
        metricRef: `${domain}_BASELINE`,
        subjectRef: null,
        counterpartyCountryId:
          domain === 'TRADE_DEPENDENCY'
            ? COUNTRY_IDS[(index + 1) % COUNTRY_IDS.length]
            : null,
        numericKind,
        unit,
        reason: 'SOURCE_NOT_AVAILABLE',
        sourceRef: null,
      })),
    })),
  });
}

function input(): WorkerSingleWorldPreflightInput {
  return {
    worldId: WORLD,
    initialSimTime: SimTime.fromTicks('0'),
    provenance: provenance(),
    calibration: {
      schemaVersion: V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION,
      expectedCountryCount: '70',
      sources: [],
      countries: [],
    },
    npcInputs: [
      {
        worldId: WORLD,
        countryId: countryId(COUNTRY_IDS[0]!),
        worldVersion: '0',
        simTime: SimTime.fromTicks('0'),
        model: null,
        officeContext: null,
        approval: null,
        funding: null,
        inventory: null,
      },
    ],
  };
}

describe('V27 single-World worker preparation preflight', () => {
  it('executes the existing validators once and reports explicit blockers without bootstrap', () => {
    const first = inspectSingleWorldWorkerPreparation(input());
    const replay = inspectSingleWorldWorkerPreparation(input());
    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      status: 'PREPARATION_ONLY',
      initializationAuthorized: false,
      workerDispatchAllowed: false,
      worldId: WORLD,
      initialSimTime: '0',
      countryCount: '70',
      provenanceCalibrationStatus: 'UNAVAILABLE',
    });
    expect(first.npcScreenings).toEqual([
      {
        countryId: COUNTRY_IDS[0],
        status: 'UNAVAILABLE',
        reason: 'MODEL_UNAVAILABLE',
        fingerprint: null,
      },
    ]);
    expect(first.blockers).toEqual(
      expect.arrayContaining([
        'CALIBRATION_INPUT_INCOMPLETE',
        'CALIBRATION_PROVENANCE_UNAVAILABLE',
        'NPC_INTENT_UNAVAILABLE',
        'V27_DEPENDENCY_AND_ADR_GATE_OPEN',
      ]),
    );
    expect(first).not.toHaveProperty('openingSeed');
    expect(first).not.toHaveProperty('command');
    expect(first).not.toHaveProperty('event');
    expect(getWorkerFoundationStatus().simulationEnabled).toBe(false);
  });

  it('rejects cross-World, cross-country, wrong-clock and duplicate NPC inputs', () => {
    const valid = input();
    expect(() =>
      inspectSingleWorldWorkerPreparation({
        ...valid,
        worldId: worldId('WORLD_OTHER'),
      }),
    ).toThrow('same World');
    expect(() =>
      inspectSingleWorldWorkerPreparation({
        ...valid,
        npcInputs: [
          { ...valid.npcInputs[0]!, countryId: countryId('COUNTRY_OTHER') },
        ],
      }),
    ).toThrow('World/country/SimTime');
    expect(() =>
      inspectSingleWorldWorkerPreparation({
        ...valid,
        npcInputs: [
          { ...valid.npcInputs[0]!, simTime: SimTime.fromTicks('1') },
        ],
      }),
    ).toThrow('World/country/SimTime');
    expect(() =>
      inspectSingleWorldWorkerPreparation({
        ...valid,
        npcInputs: [valid.npcInputs[0]!, valid.npcInputs[0]!],
      }),
    ).toThrow('World/country/SimTime');
  });

  it('reports missing NPC input rather than silently controlling unclaimed countries', () => {
    const result = inspectSingleWorldWorkerPreparation({
      ...input(),
      npcInputs: [],
    });
    expect(result.npcScreenings).toEqual([]);
    expect(result.blockers).toContain('NPC_INPUT_UNAVAILABLE');
    expect(result.workerDispatchAllowed).toBe(false);
  });

  it('returns immutable evidence independent of caller-owned arrays', () => {
    const source = input();
    const result = inspectSingleWorldWorkerPreparation(source);
    const originalHash = result.hashInput;
    const originalFingerprint = result.fingerprint;
    const screenings = source.npcInputs as Array<
      WorkerSingleWorldPreflightInput['npcInputs'][number]
    >;
    screenings.pop();
    expect(result.npcScreenings).toHaveLength(1);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.npcScreenings)).toBe(true);
    expect(Object.isFrozen(result.npcScreenings[0])).toBe(true);
    expect(result.hashInput).toBe(originalHash);
    expect(result.fingerprint).toBe(originalFingerprint);
  });
});
