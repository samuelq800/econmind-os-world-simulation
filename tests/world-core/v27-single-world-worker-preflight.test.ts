import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  SimTime,
  countryId,
  createOpeningSeed,
  createOpeningSource,
  openingSeedId,
  openingSourceId,
  worldId,
} from '@econmind/core';

import { getWorkerFoundationStatus } from '../../apps/world-worker/src/index.js';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import { inspectExistingSingleWorldOpening } from '../../apps/world-worker/src/preparation/existing-opening-read.js';
import {
  inspectSingleWorldWorkerPreparation,
  type WorkerSingleWorldPreflightInput,
} from '../../apps/world-worker/src/preparation/single-world-preflight.js';
import {
  COUNTRY_SEED_PROVENANCE_SCHEMA,
  parseCountrySeedProvenance,
} from '../../packages/core/src/opening/country-seed-provenance-preparation.js';
import {
  V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION,
  v27_2CountryConfigurationRef,
} from '../../packages/core/src/calibration/country-input-closure.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import type { V09AtomicTestDatabase } from '../support/v09-atomic-contract.js';

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
const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

async function openingDatabase(): Promise<V09AtomicTestDatabase> {
  const database = createPGliteV09AtomicTestDatabase();
  const root = path.resolve(import.meta.dirname, '../..');
  for (const migration of [
    '0001_world_v2_namespace.sql',
    '0002_world_v2_command_event_ledger.sql',
    '0016_world_v2_opening_seed.sql',
  ]) {
    await database.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  return database;
}

function openingSeed() {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_V27_OPENING_READ'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'dataset://opening/v27-read',
      sourceVersion: '2026-09-24',
      payload: { dataset: 'v27-existing-opening-read' },
    },
    sha256Hex,
  );
  return createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_V27_OPENING_READ'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha256Hex,
  );
}

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
      worldId: WORLD,
      countryConfigurationRef: v27_2CountryConfigurationRef(
        { worldId: WORLD, countryIds: COUNTRY_IDS },
        sha256Hex,
      ),
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

describe('V27 worker-only existing opening read', () => {
  it('pairs a durable WorldVersion-zero opening with separate candidate evidence without writing', async () => {
    const database = await openingDatabase();
    try {
      const opening = openingSeed();
      await database.query(
        `insert into world_v2.world_head (world_id, world_version, event_sequence)
         values ($1, 0, 0)`,
        [WORLD],
      );
      const setupStore = new WorldOpeningSeedStore({ database, sha256Hex });
      await setupStore.bootstrap({
        seed: opening,
        bootstrappedAtReal: '2026-09-24T00:00:00.000Z',
      });
      const readStatements: string[] = [];
      const readOnlyDatabase: SqlDatabase = {
        query: async <Row extends object>(
          statement: string,
          parameters?: readonly unknown[],
        ) => {
          if (!/^\s*select\b/iu.test(statement)) {
            throw new Error('Opening inspection attempted a write');
          }
          readStatements.push(statement);
          return database.query<Row>(statement, parameters);
        },
        transaction: async () => {
          throw new Error('Opening inspection attempted a transaction');
        },
      };
      const store = new WorldOpeningSeedStore({
        database: readOnlyDatabase,
        sha256Hex,
      });
      const before = await database.query(
        'select count(*)::text as count from world_v2.opening_seed',
      );
      const first = await inspectExistingSingleWorldOpening({
        openingStore: store,
        preflightInput: input(),
      });
      const repeat = await inspectExistingSingleWorldOpening({
        openingStore: store,
        preflightInput: input(),
      });
      const after = await database.query(
        'select count(*)::text as count from world_v2.opening_seed',
      );
      expect(first).toEqual(repeat);
      expect(first).toMatchObject({
        status: 'EXISTING_OPENING_READ_ONLY',
        preparationStatus: 'PREPARATION_ONLY',
        initializationAuthorized: false,
        workerDispatchAllowed: false,
        candidateBoundToOpening: false,
        worldId: WORLD,
        openingSeedId: opening.seedId,
        openingSeedFingerprint: opening.fingerprint,
        openingWorldVersion: '0',
      });
      expect(first.preflightFingerprint).toBe(
        inspectSingleWorldWorkerPreparation(input()).fingerprint,
      );
      expect(first.preflightFingerprint).not.toBe(first.openingSeedFingerprint);
      expect(first.preflightBlockers).toContain(
        'V27_DEPENDENCY_AND_ADR_GATE_OPEN',
      );
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.preflightBlockers)).toBe(true);
      expect(readStatements).toHaveLength(2);
      expect(after.rows).toEqual(before.rows);
      expect(
        (
          await database.query(
            'select world_version::text from world_v2.world_head where world_id = $1',
            [WORLD],
          )
        ).rows[0],
      ).toMatchObject({ world_version: '0' });
    } finally {
      await database.close();
    }
  });

  it('fails closed when no durable opening exists', async () => {
    const database = await openingDatabase();
    try {
      const store = new WorldOpeningSeedStore({ database, sha256Hex });
      await expect(
        inspectExistingSingleWorldOpening({
          openingStore: store,
          preflightInput: input(),
        }),
      ).rejects.toThrow('No immutable opening seed exists for World');
    } finally {
      await database.close();
    }
  });

  it('rejects nonzero opening SimTime before reading persisted state', async () => {
    const database = await openingDatabase();
    try {
      const candidate = input();
      const store = new WorldOpeningSeedStore({ database, sha256Hex });
      await expect(
        inspectExistingSingleWorldOpening({
          openingStore: store,
          preflightInput: {
            ...candidate,
            initialSimTime: SimTime.fromTicks('1'),
            npcInputs: [
              { ...candidate.npcInputs[0]!, simTime: SimTime.fromTicks('1') },
            ],
          },
        }),
      ).rejects.toThrow('opening SimTime zero');
    } finally {
      await database.close();
    }
  });
});
