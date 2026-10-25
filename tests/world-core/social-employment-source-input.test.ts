import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  createOpeningSeed,
  createOpeningSource,
  openingSeedId,
  openingSourceId,
  parseCanonicalCommand,
  worldId,
} from '@econmind/core';
import {
  SOCIAL_SOURCE_MATERIAL_PATHS,
  bindSocialEmploymentSourceInputFrom,
  parseSocialEmploymentSourceInput,
} from '../../apps/world-worker/src/persistence/social-employment-source-input.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import {
  withValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import type { SocialEmploymentRuntimeSnapshotReader } from '../../apps/world-worker/src/persistence/social-job-match-candidate-source.js';

const digest = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const hash = (value: unknown) =>
  canonicalSha256(canonicalHashInput(value), digest);
const command = parseCanonicalCommand(
  {
    schemaVersion: COMMAND_SCHEMA_VERSION,
    actorId: 'ACTOR_SOCIAL',
    authSubject: '11111111-1111-4111-8111-111111111111',
    commandId: 'TEST_SOCIAL_SOURCE_PLAN',
    commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
    correlationId: 'TEST_SOURCE_TRACE',
    countryId: 'COUNTRY_01',
    worldId: 'WORLD_TEST_SOCIAL_SOURCE',
    officeId: 'SOCIAL',
    expectedWorldVersion: '0',
    idempotencyKey: 'TEST_SOURCE_IDEM',
    simTime: '10000',
    submittedAtReal: '2026-10-25T00:00:00.000Z',
    payload: {
      schemaVersion: 'social-employment-service-plan-v1',
      locationId: 'REGION_01_E1',
      skill: 'HIGH',
      positionId: 'TEST_POSITION',
      servicePoolId: 'TEST_HIGH_POOL',
      requestedMatches: '1',
      dueDayIndex: '0',
    },
  },
  digest,
);

/** Sourced synthetic DATA fixture, not operating state or an admission fixture.
 * Its absent original material records deliberately cannot pass a full reader. */
const source = createOpeningSource(
  {
    schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
    sourceId: openingSourceId('TEST_SOCIAL_ORIGINAL'),
    sourceKind: 'DOCUMENTED_ASSUMPTION',
    locator: 'TEST_ONLY_PARSER_DATA',
    sourceVersion: '1',
    payload: { fixture: 'SYNTHETIC_PARSER_ONLY_NOT_ADMITTED' },
  },
  digest,
);
const seed = createOpeningSeed(
  {
    schemaVersion: OPENING_SEED_SCHEMA_VERSION,
    seedId: openingSeedId('TEST_SOCIAL_SEED'),
    worldId: worldId(command.worldId),
    openingWorldVersion: '0',
    replayBinding: CURRENT_REPLAY_BINDING,
    sources: [source],
    inventoryEntries: [],
    financialBatches: [],
  },
  digest,
);
function graph() {
  return {
    schemaVersion: 'SOCIAL_RESOLVED_SOURCE_INPUT_V3',
    scope: {
      worldId: command.worldId,
      countryId: command.countryId,
      commandId: command.commandId,
      commandFingerprint: command.fingerprint,
      headWorldVersion: '0',
      headEventSequence: '0',
      simTime: '10000',
    },
    admittedGenesis: {
      openingSeedId: seed.seedId,
      openingSeedFingerprint: seed.fingerprint,
      modelVersion: seed.replayBinding.modelVersion,
      replayBinding: seed.replayBinding,
      socialSourceId: source.sourceId,
      socialSourcePayloadHash: source.payloadHash,
      semanticRevision: 'SOCIAL_SOURCE_V3',
      adoptionBindingRef: 'TEST_ONLY_ADOPTION_REFERENCE',
      state: {
        schemaVersion: 'social-employment-service-state-v1',
        worldId: command.worldId,
        labour: {
          aggregates: [],
          positions: [],
          wageAssertions: [],
          appliedFactBindings: [],
        },
        servicePools: [],
        plans: [],
        appliedOperations: [],
      },
    },
    currentReadFacts: {
      boundary: { kind: 'E01_DAILY_BOUNDARY', dayIndex: '0' },
      simTime: '10000',
      populationAvailability: [],
      offer: {},
      minimumWage: {},
    },
    historyCoverage: {
      openingVersion: '0',
      heldHead: { worldVersion: '0', eventSequence: '0' },
      taxonomyRevision: 'SOCIAL_SOURCE_EFFECTS_V1',
      completePrefixBinding: hash({
        worldId: command.worldId,
        seedFingerprint: seed.fingerprint,
        transitions: [],
      }),
      sourceRevisionSet: [{ recordId: 'TEST_RECORD', revision: '1' }],
    },
    sourceWitnesses: SOCIAL_SOURCE_MATERIAL_PATHS.map((fieldPath) => ({
      fieldPath,
      sourceId: 'TEST_SOURCE',
      sourceRevision: '1',
      locator: 'TEST_ONLY_MISSING_ORIGINAL',
      payloadHash: hash({ fieldPath }),
      pointer: '/value',
      effectiveBindingRef: 'TEST_EFFECTIVE',
      adoptionOrCommitBindingRef: 'TEST_ADOPTION',
      role:
        fieldPath === '/physicalAttemptEnvelope'
          ? 'PHYSICAL_ORIGINAL_BODY'
          : fieldPath.startsWith('/admittedGenesis/')
            ? 'GENESIS_HISTORICAL'
            : 'CURRENT_EFFECTIVE',
      effectiveFromSimTime: '0',
      effectiveUntilSimTime: null,
      predecessorRevision: null,
      supersededByRevision: null,
      revokedByRevision: null,
    })),
    physicalAttemptEnvelope: { headWorldVersion: '0', headEventSequence: '0' },
  };
}
const parse = (value = graph()) =>
  parseSocialEmploymentSourceInput(canonicalSerialize(value), hash(value));

/** Actual durable reader implementation over a read-only SQL protocol fixture.
 * No mocked/forged view, native isolation or source authority is claimed. */
function protocol() {
  const queries: string[] = [];
  const { fingerprint: _fingerprint, ...seedIntent } = seed;
  void _fingerprint;
  const executor: SqlExecutor = {
    async query<Row>(sql: string) {
      queries.push(sql);
      let rows: unknown[];
      if (sql.includes('from world_v2.world_head'))
        rows = [{ world_version: '0', event_sequence: '0' }];
      else if (sql.includes('from world_v2.opening_seed'))
        rows = [
          {
            world_id: seed.worldId,
            seed_id: seed.seedId,
            opening_world_version: '0',
            replay_binding: canonicalSerialize(seed.replayBinding),
            canonical_payload: canonicalSerialize(seedIntent),
            seed_fingerprint: seed.fingerprint,
          },
        ];
      else if (
        sql.includes('from world_v2.authoritative_event') ||
        sql.includes('from world_v2.command_receipt') ||
        sql.includes('from world_v2.inventory_posting') ||
        sql.includes('from world_v2.financial_posting_batch')
      )
        rows = [];
      else throw new Error('Unexpected fixture SQL');
      return { rows: rows as Row[], rowCount: rows.length };
    },
  };
  const database: SqlDatabase = {
    query: executor.query,
    transaction: async (body) => body(executor),
  };
  return {
    executor,
    database,
    queries,
    reader: new DurableV08LedgerLineageReader({ database, sha256Hex: digest }),
  };
}

describe('Social closed source parser and data-only binding', () => {
  it('owns canonical parsed data without asserting operating/admission readiness', () => {
    const input = graph(),
      parsed = parse(input);
    expect(parsed.classification).toBe('PARSED_UNTRUSTED_SOCIAL_SOURCE_DATA');
    Reflect.set(input.scope, 'worldId', 'WORLD_MUTATED');
    expect(parsed.data.scope.worldId).toBe(command.worldId);
    expect(Object.isFrozen(parsed.data.sourceWitnesses[0])).toBe(true);
    expect(Reflect.set(parsed.data.scope, 'worldId', 'WORLD_MUTATED')).toBe(
      false,
    );
    for (const key of [
      'readFrom',
      'status',
      'provenance',
      'sourceAdmitted',
      'runtimeReady',
    ])
      expect(Object.hasOwn(parsed, key)).toBe(false);
    // @ts-expect-error Parsed data cannot implement the formal reader port.
    const reader: SocialEmploymentRuntimeSnapshotReader = parsed;
    expect(reader).toBe(parsed);
  });
  it.each(['sourceAdmitted', 'adopted', 'readFrom', 'WorldClock'])(
    'rejects caller authority field %s',
    (key) => {
      expect(() => parse({ ...graph(), [key]: true })).toThrow(
        'missing/unknown',
      );
    },
  );
  it('rejects noncanonical, duplicate-key, corrupted and candidate bytes', () => {
    const value = graph(),
      canonical = canonicalSerialize(value);
    expect(() =>
      parseSocialEmploymentSourceInput(canonical + '\n', hash(value)),
    ).toThrow();
    expect(() =>
      parseSocialEmploymentSourceInput(canonical, hash({ other: '1' })),
    ).toThrow();
    expect(() =>
      parseSocialEmploymentSourceInput(
        '{"schemaVersion":"A","schemaVersion":"B"}',
        hash({ schemaVersion: 'B' }),
      ),
    ).toThrow();
    expect(() =>
      parseSocialEmploymentSourceInput(
        '{"status":"CANDIDATE_CONSUMED"}',
        hash({ status: 'CANDIDATE_CONSUMED' }),
      ),
    ).toThrow();
  });
  it.each([
    'role',
    'duplicate',
    'unknownPath',
    'interval',
    'badRevision',
    'missing',
  ])('rejects invalid witness %s', (kind) => {
    const value = graph();
    if (kind === 'role') value.sourceWitnesses[0]!.role = 'CURRENT_EFFECTIVE';
    if (kind === 'duplicate')
      value.sourceWitnesses[1] = value.sourceWitnesses[0]!;
    if (kind === 'unknownPath')
      Object.assign(value.sourceWitnesses[0]!, { fieldPath: '/notMaterial' });
    if (kind === 'interval')
      Object.assign(value.sourceWitnesses[0]!, {
        effectiveFromSimTime: '10',
        effectiveUntilSimTime: '9',
      });
    if (kind === 'badRevision')
      Object.assign(value.sourceWitnesses[0]!, { predecessorRevision: '01' });
    if (kind === 'missing') value.sourceWitnesses.pop();
    expect(() => parse(value)).toThrow();
  });
  it('binds only actual accessible data via a genuine reader-created view; no original/source grant', async () => {
    const f = protocol();
    let escaped: ValidatedCanonicalLineageView | undefined;
    await withValidatedCanonicalLineageFrom(
      { reader: f.reader, executor: f.executor, worldId: command.worldId },
      async (view) => {
        escaped = view;
        const bound = bindSocialEmploymentSourceInputFrom(
          f.executor,
          view,
          command,
          parse(),
        );
        expect(bound.classification).toBe(
          'DATA_BINDING_MATCH_NOT_AUTHENTICATED',
        );
        expect(bound.lineage.seed.fingerprint).toBe(seed.fingerprint);
        expect(Object.hasOwn(bound, 'provenance')).toBe(false);
        expect(() =>
          bindSocialEmploymentSourceInputFrom(
            { query: f.executor.query },
            view,
            command,
            parse(),
          ),
        ).toThrow('another executor');
        const changed = graph();
        changed.scope.headWorldVersion = '1';
        expect(() =>
          bindSocialEmploymentSourceInputFrom(
            f.executor,
            view,
            command,
            parse(changed),
          ),
        ).toThrow('mixed');
        const wrong = graph();
        wrong.historyCoverage.completePrefixBinding = hash({ wrong: 'prefix' });
        expect(() =>
          bindSocialEmploymentSourceInputFrom(
            f.executor,
            view,
            command,
            parse(wrong),
          ),
        ).toThrow('prefix');
      },
    );
    expect(f.queries.some((q) => q.includes('command_receipt'))).toBe(true);
    expect(() =>
      bindSocialEmploymentSourceInputFrom(
        f.executor,
        escaped!,
        command,
        parse(),
      ),
    ).toThrow('expired');
    expect(() =>
      bindSocialEmploymentSourceInputFrom(
        f.executor,
        {} as ValidatedCanonicalLineageView,
        command,
        parse(),
      ),
    ).toThrow('forged');
  });
  it('rejects a forged parsed wrapper even when copied data has matching metadata', async () => {
    const f = protocol(),
      parsed = parse();
    await withValidatedCanonicalLineageFrom(
      { reader: f.reader, executor: f.executor, worldId: command.worldId },
      async (view) => {
        expect(() =>
          bindSocialEmploymentSourceInputFrom(f.executor, view, command, {
            ...parsed,
          }),
        ).toThrow('actual parsed data');
      },
    );
  });
});
