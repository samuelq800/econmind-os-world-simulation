/** One-shot fixed registered-quota issuer. Actual COMMITTED RUN determines
 * audit/scope; caller cannot supply amount, holder, entitlement or sim time. */
import { createHash } from 'node:crypto';
import {
  parseCanonicalCommand,
  canonicalSerialize,
  type CanonicalCommand,
} from '@econmind/core';
import { readIndustryFirstDayWorkState } from '@econmind/core/industry-first-day-work';
import {
  prepareIndustryUtilityExecution,
  parseIndustryUtilityAutomaticWaterGrantIntent,
} from '@econmind/core/industry-utility-execution';
import { prepareIndustryFirstDayWaterExecution } from '@econmind/core/industry-first-day-water-execution';
import {
  consumePostwarIndustryUtilitySource,
  assertPostwarIndustryUtilitySourceFrom,
  utilitySourceForRun,
  type PreparedPostwarIndustryUtilitySource,
} from './postwar-industry-utility-source.js';
import {
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import {
  readPostwarIndustryRunStateFrom,
  consumePostwarIndustryRunStateFrom,
  releasePostwarIndustryRunStateContext,
} from './postwar-industry-run-state.js';
import type { PostwarIndustryWorkPublicationClock } from './postwar-industry-work-publisher.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function fail(s: string): never {
  throw Error('INDUSTRY_WATER_GRANT_PUBLISHER:' + s);
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v) fail('ACTUAL_FIELD_REQUIRED');
  return v;
}
export interface PostwarIndustryWaterGrantPublisher {
  publish(
    scope: Readonly<{ countryId: string; facilityId: string; runId: string }>,
  ): Promise<
    Readonly<{ status: 'QUEUED' | 'FINAL'; command: CanonicalCommand }>
  >;
  close(): Promise<void>;
}
export function createPostwarIndustryWaterGrantPublisher(
  config: Readonly<{
    database: SqlDatabase;
    publicationDatabase: SqlDatabase;
    socialConnection: Readonly<PostwarSocialRuntimeConnection>;
    sourcePreparation: Readonly<PreparedPostwarIndustryUtilitySource>;
    clock: Readonly<PostwarIndustryWorkPublicationClock>;
  }>,
): Readonly<PostwarIndustryWaterGrantPublisher> {
  const source = consumePostwarIndustryUtilitySource(
      config.sourcePreparation,
      config.socialConnection,
    ),
    social = config.socialConnection,
    world = social.worldId,
    worker = social.workerId,
    { workerRole } = readPostwarSocialRuntimeConnectionResources(social);
  if (
    !Object.isFrozen(config.clock) ||
    typeof config.clock.simTime !== 'function' ||
    typeof config.clock.nowReal !== 'function'
  )
    fail('FIXED_SERVER_CLOCK_REQUIRED');
  let closed = false;
  const pending = new Set<Promise<unknown>>();
  async function withReader<T>(
    tx: SqlExecutor,
    read: () => Promise<T>,
  ): Promise<T> {
    const session = await tx.query<{ role_name: string }>(
      'select current_user as role_name',
    );
    if (session.rows.length !== 1 || session.rows[0]?.role_name !== workerRole)
      fail('ACTUAL_WORKER_EXECUTOR_REQUIRED');
    let result: T | undefined, failure: unknown;
    try {
      await tx.query('set local role world_v2_industry_source_reader');
      result = await read();
    } catch (e) {
      failure = e;
    }
    try {
      await tx.query('set local role "' + workerRole + '"');
    } catch (restore) {
      if (failure !== undefined)
        throw new AggregateError(
          [failure, restore],
          'Water grant publisher source role restore failed',
          { cause: restore },
        );
      throw restore;
    }
    if (failure !== undefined) throw failure;
    return result!;
  }
  function published(rows: readonly Record<string, unknown>[]) {
    if (rows.length !== 1) fail('ONE_FIXED_PUBLICATION_REQUIRED');
    const r = rows[0]!,
      command = parseCanonicalCommand(r.command_json, sha);
    parseIndustryUtilityAutomaticWaterGrantIntent(command, sha);
    if (
      command.fingerprint !== r.command_fingerprint ||
      (r.publication_status !== 'QUEUED' && r.publication_status !== 'FINAL')
    )
      fail('ACTUAL_CANONICAL_PUBLICATION_REQUIRED');
    return Object.freeze({
      status: r.publication_status as 'QUEUED' | 'FINAL',
      command,
    });
  }
  return Object.freeze({
    async publish(
      scope: Readonly<{ countryId: string; facilityId: string; runId: string }>,
    ) {
      if (closed) fail('RETIRED');
      consumePostwarIndustryUtilitySource(config.sourcePreparation, social);
      if (
        scope.countryId !== source.compact.countryId ||
        scope.facilityId !== source.compact.facilityId
      )
        fail('EXACT_REGISTERED_SCOPE_REQUIRED');
      const operation = (async () => {
        const old = await config.publicationDatabase.transaction((tx) =>
          tx.query<Record<string, unknown>>(
            'select * from world_v2.read_postwar_industry_water_grant_publication($1,$2)',
            [world, scope.runId],
          ),
        );
        if (old.rows.length) return published(old.rows);
        const sim = await config.clock.simTime(),
          at = config.clock.nowReal();
        if (
          !/^(0|[1-9][0-9]*)$/u.test(sim) ||
          new Date(at).toISOString() !== at
        )
          fail('ACTUAL_SERVER_CLOCK_REQUIRED');
        return config.database.transaction(async (tx) => {
          const held = await withReader(tx, async () => {
            const r = await tx.query<Record<string, unknown>>(
              'select * from world_v2.lock_postwar_industry_work_issue_scope($1,$2,$3::timestamptz,$4)',
              [world, worker, at, sim],
            );
            if (r.rows.length !== 1) fail('ACTUAL_LEASE_HEAD_REQUIRED');
            const head = {
              worldVersion: text(r.rows[0]!.world_version),
              eventSequence: text(r.rows[0]!.event_sequence),
            };
            await assertPostwarIndustryUtilitySourceFrom(tx, {
              preparation: config.sourcePreparation,
              head,
            });
            return head;
          });
          const ctx = await readPostwarIndustryRunStateFrom(tx, {
            socialConnection: social,
            worldId: world,
            countryId: scope.countryId,
            facilityId: scope.facilityId,
            expectedHead: held,
          });
          try {
            const facts = consumePostwarIndustryRunStateFrom(tx, ctx),
              runs = readIndustryFirstDayWorkState(facts.workState).runs.filter(
                (r) =>
                  r.terms.runId === scope.runId &&
                  r.source.facilityId === scope.facilityId &&
                  r.source.countryId === scope.countryId,
              );
            if (
              runs.length !== 1 ||
              BigInt(sim) < BigInt(facts.maxCommandSimTimeTicks)
            )
              fail('ACTUAL_ORDERED_COMMITTED_RUN_REQUIRED');
            const run = runs[0]!,
              waterSource = utilitySourceForRun(
                config.sourcePreparation,
                'WATER',
                scope.runId,
              ),
              id =
                'COMMAND_INDUSTRY_WATER_GRANT_' +
                sha(
                  canonicalSerialize([
                    world,
                    run.frame.command.fingerprint,
                    source.compactSha256,
                    'INDUSTRY_BOUNDED_WATER_GRANT_V1',
                  ]),
                ).toUpperCase(),
              command = parseCanonicalCommand(
                {
                  schemaVersion: 'command-v1',
                  worldId: world,
                  commandId: id,
                  commandType: 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1',
                  actorId: run.frame.command.actorId,
                  authSubject: run.frame.command.authSubject,
                  countryId: scope.countryId,
                  officeId: null,
                  expectedWorldVersion: held.worldVersion,
                  idempotencyKey: id,
                  correlationId: run.frame.command.correlationId,
                  submittedAtReal: at,
                  simTime: sim,
                  payload: {
                    schemaVersion: 'industry-first-day-utility-command-v1',
                    serviceKind: 'WATER',
                    operationRef: id,
                    facilityId: scope.facilityId,
                    runId: scope.runId,
                    sourceRef: waterSource.sourceRef,
                    sourceRawSha256: waterSource.sourceRawSha256,
                    operation: { action: 'GRANT_RIGHT' },
                  },
                },
                sha,
              );
            if (!facts.pagedReplay.result.industryWaterState)
              fail('ACTUAL_COMPLETE_WATER_STATE_REQUIRED');
            prepareIndustryFirstDayWaterExecution(
              {
                preparation: prepareIndustryUtilityExecution(
                  { command, replay: facts.pagedReplay, source: waterSource },
                  sha,
                ),
                state: facts.pagedReplay.result.industryWaterState,
              },
              sha,
            );
            const issued = await config.publicationDatabase.transaction(
              async (p) => {
                await p.query(
                  'set transaction isolation level repeatable read',
                );
                return p.query<Record<string, unknown>>(
                  'select * from world_v2.publish_postwar_industry_water_grant($1,$2,$3,$4,$5,$6::bigint,$7::bigint,$8::timestamptz,$9,$10)',
                  [
                    world,
                    scope.countryId,
                    scope.facilityId,
                    scope.runId,
                    worker,
                    held.worldVersion,
                    held.eventSequence,
                    at,
                    sim,
                    command.fingerprint,
                  ],
                );
              },
            );
            const actual = published(issued.rows);
            if (actual.command.fingerprint !== command.fingerprint)
              fail('SQL_CORE_COMMAND_DIFFERS');
            return actual;
          } finally {
            releasePostwarIndustryRunStateContext(ctx);
          }
        });
      })();
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
      return operation;
    },
    async close() {
      closed = true;
      await Promise.allSettled([...pending]);
    },
  });
}
