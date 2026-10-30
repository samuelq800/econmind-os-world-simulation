/** Protocol observations only; admission/full economic replay are owned by the
 * actual source guard and the separate native consumer test. */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  parseCanonicalCommand,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
} from '@econmind/core';
import { observePostwarSocialMaterialization } from '../../apps/world-worker/src/persistence/postwar-social-materialization.js';
import { assertCurrentMaterializationObservation } from '../../apps/world-worker/src/persistence/current-materialization-observation.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex'),
  hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
const WORLD = 'WORLD_MATERIALIZATION_TEST',
  COUNTRY = 'COUNTRY_01';
const positionState = { state: 'POSITION_H1' },
  planState = { state: 'SERVICE_H2' },
  matchState = { state: 'SERVICE_H3' };
function frame(
  version: number,
  kind: 'POSITION' | 'PLAN' | 'MATCH',
  state: unknown,
  countryId = COUNTRY,
) {
  const command = parseCanonicalCommand(
    {
      schemaVersion: 'command-v1',
      worldId: WORLD,
      countryId,
      officeId: kind === 'MATCH' ? null : 'SOCIAL',
      commandId: 'COMMAND_MATERIAL_' + version,
      commandType:
        kind === 'POSITION'
          ? 'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1'
          : kind === 'PLAN'
            ? 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1'
            : 'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1',
      actorId: 'ACTOR_TEST',
      authSubject: '11111111-1111-4111-8111-111111111111',
      correlationId: 'CORRELATION_TEST',
      expectedWorldVersion: String(version - 1),
      idempotencyKey: 'IDEM_MATERIAL_' + version,
      simTime: '2000',
      submittedAtReal: '2026-10-29T00:00:00.000Z',
      payload: { testOnlyProtocol: true },
    },
    sha,
  );
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: 'event-v1',
      worldId: WORLD,
      eventId: 'EVENT_MATERIAL_' + version,
      eventType:
        kind === 'POSITION'
          ? 'SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1'
          : kind === 'PLAN'
            ? 'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1'
            : 'SOCIAL_JOB_MATCH_SETTLED_V1',
      worldVersion: String(version),
      sequence: String(version),
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      simTime: '2000',
      recordedAtReal: '2026-10-29T00:00:00.000Z',
      correctsEventId: null,
      payload: { afterStateHash: hash(state) },
    },
    sha,
  );
  const transition = createAuthoritativeTransition({
    command,
    events: [event],
    worldVersionBefore: String(version - 1),
    worldVersionAfter: String(version),
  });
  return {
    command,
    transition,
    receipt: createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: '2026-10-29T00:00:00.000Z',
    }),
    financialPostingBatches: [],
    inventoryPostings: [],
  };
}
const prefix = [
  frame(1, 'POSITION', positionState),
  frame(2, 'PLAN', planState),
  frame(3, 'MATCH', matchState),
];
function executor(options: {
  valueVersion: string | null;
  state: unknown;
  sourceCommand?: string;
  globalVersion?: string;
  bounded?: boolean;
  storedHash?: string;
  failure?: Error;
}) {
  const statements: string[] = [];
  const tx: SqlExecutor = {
    query: async <Row extends object>(sql: string, parameters) => {
      statements.push(sql);
      if (options.failure) throw options.failure;
      let rows: unknown[];
      if (sql.includes('bool_and'))
        rows = [{ bounded: options.bounded ?? true }];
      else if (sql.includes('left join world_v2.current_materialization'))
        rows = [
          {
            world_version: options.globalVersion ?? '3',
            value_world_version: options.valueVersion,
            canonical_payload:
              options.valueVersion === null
                ? null
                : canonicalSerialize(options.state),
            payload_sha256:
              options.valueVersion === null
                ? null
                : (options.storedHash ?? hash(options.state)),
          },
        ];
      else if (sql.startsWith('select source_command_id')) {
        expect(parameters?.slice(2)).toEqual([
          options.valueVersion,
          hash(options.state),
        ]);
        rows = [
          {
            source_command_id:
              options.sourceCommand ??
              'COMMAND_MATERIAL_' + options.valueVersion,
          },
        ];
      } else throw Error('unexpected SQL ' + sql);
      return { rows: rows as Row[], rowCount: rows.length };
    },
  };
  return { tx, statements };
}
describe('Social per-key canonical materialization observation', () => {
  it('observes H1 position and H3 service rows at global H3 without guessing the predecessor', async () => {
    for (const [kind, valueVersion, state] of [
      ['POSITION', '1', positionState],
      ['SERVICE', '3', matchState],
    ] as const) {
      const f = executor({ valueVersion, state });
      const observation = await observePostwarSocialMaterialization({
        executor: f.tx,
        lineage: { worldId: WORLD, headWorldVersion: '3', transitions: prefix },
        countryId: COUNTRY,
        kind,
      });
      expect(observation.valueWorldVersion).toBe(valueVersion);
      expect(observation.observedWorldVersion).toBe('3');
      expect(observation.payloadHash).toBe(hash(state));
      assertCurrentMaterializationObservation({
        observation,
        worldId: observation.worldId,
        key: observation.key,
        expectedWorldVersion: '3',
      });
      expect(f.statements).toHaveLength(3);
    }
  });
  it('a later other-country frame does not invent a new version for this country key', async () => {
    const f = executor({
      valueVersion: '1',
      state: positionState,
      globalVersion: '4',
    });
    const observation = await observePostwarSocialMaterialization({
      executor: f.tx,
      lineage: {
        worldId: WORLD,
        headWorldVersion: '4',
        transitions: [
          ...prefix,
          frame(4, 'POSITION', { country2: true }, 'COUNTRY_02'),
        ],
      },
      countryId: COUNTRY,
      kind: 'POSITION',
    });
    expect(observation.valueWorldVersion).toBe('1');
    expect(observation.observedWorldVersion).toBe('4');
  });
  it('only a truly absent row without a domain origin can use the absent-row CAS', async () => {
    const f = executor({ valueVersion: null, state: null });
    const observation = await observePostwarSocialMaterialization({
      executor: f.tx,
      lineage: { worldId: WORLD, headWorldVersion: '3', transitions: [] },
      countryId: COUNTRY,
      kind: 'POSITION',
    });
    expect(observation.valueWorldVersion).toBeNull();
    expect(f.statements).toHaveLength(2);
    await expect(
      observePostwarSocialMaterialization({
        executor: f.tx,
        lineage: { worldId: WORLD, headWorldVersion: '3', transitions: prefix },
        countryId: COUNTRY,
        kind: 'POSITION',
      }),
    ).rejects.toThrow('CACHE_DIFFERS_FROM_LAST_CANONICAL_DOMAIN_EVENT');
  });
  it('rejects wrong origin hash/version/command, an unbound cache, oversize rows and backend failure', async () => {
    for (const options of [
      { valueVersion: '2', state: planState },
      { valueVersion: '1', state: { tampered: true } },
      {
        valueVersion: '1',
        state: positionState,
        sourceCommand: 'COMMAND_WRONG',
      },
      {
        valueVersion: '1',
        state: positionState,
        storedHash: 'sha256:' + '0'.repeat(64),
      },
      { valueVersion: '1', state: positionState, bounded: false },
    ]) {
      const f = executor(options);
      await expect(
        observePostwarSocialMaterialization({
          executor: f.tx,
          lineage: {
            worldId: WORLD,
            headWorldVersion: '3',
            transitions: prefix,
          },
          countryId: COUNTRY,
          kind: 'POSITION',
        }),
      ).rejects.toThrow();
    }
    const unbound = executor({ valueVersion: '1', state: positionState });
    await expect(
      observePostwarSocialMaterialization({
        executor: unbound.tx,
        lineage: { worldId: WORLD, headWorldVersion: '3', transitions: [] },
        countryId: COUNTRY,
        kind: 'POSITION',
      }),
    ).rejects.toThrow('CACHE_WITHOUT_CANONICAL_DOMAIN_ORIGIN');
    const failure = Error('backend unavailable'),
      f = executor({ valueVersion: '1', state: positionState, failure });
    await expect(
      observePostwarSocialMaterialization({
        executor: f.tx,
        lineage: { worldId: WORLD, headWorldVersion: '3', transitions: prefix },
        countryId: COUNTRY,
        kind: 'POSITION',
      }),
    ).rejects.toBe(failure);
  });
});
