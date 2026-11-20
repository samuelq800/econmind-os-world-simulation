/** Finite explicit server operation: actual committed run + elapsed source-clock
 * + distinct current workers -> one canonical due task. No Clock/consumer loop. */
import { createHash } from 'node:crypto';
import {
  WorldDecimal,
  parseCanonicalCommand,
  canonicalSerialize,
  type CanonicalCommand,
} from '@econmind/core';
import {
  readIndustryFirstDayWorkState,
  prepareIndustryFirstDayWorkFrame,
  INDUSTRY_FIRST_DAY_WORK_COMMAND,
  type IndustryFirstDayWorkAllocation,
  type IndustryFirstDayWorkState,
} from '@econmind/core/industry-first-day-work';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import {
  readPostwarIndustryRunStateFrom,
  consumePostwarIndustryRunStateFrom,
  releasePostwarIndustryRunStateContext,
} from './postwar-industry-run-state.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function fail(s: string): never {
  throw Error('INDUSTRY_WORK_PUBLISHER:' + s);
}
function text(x: unknown): string {
  if (typeof x !== 'string' || !x) fail('EXACT_ACTUAL_FIELD_REQUIRED');
  return x;
}
export interface PostwarIndustryWorkPublicationClock {
  nowReal(): string;
  simTime(): Promise<string>;
}
export interface PostwarIndustryWorkPublisher {
  publishDue(
    scope: Readonly<{ countryId: string; facilityId: string; runId: string }>,
  ): Promise<
    Readonly<{ status: 'QUEUED' | 'FINAL'; command: CanonicalCommand }>
  >;
  close(): Promise<void>;
}
export function createPostwarIndustryWorkPublisher(
  config: Readonly<{
    database: SqlDatabase;
    publicationDatabase: SqlDatabase;
    socialConnection: Readonly<PostwarSocialRuntimeConnection>;
    clock: Readonly<PostwarIndustryWorkPublicationClock>;
  }>,
): Readonly<PostwarIndustryWorkPublisher> {
  const social = config.socialConnection;
  if (
    !isPostwarSocialRuntimeConnection(social, social?.worldId) ||
    !Object.isFrozen(config.clock) ||
    typeof config.clock.nowReal !== 'function' ||
    typeof config.clock.simTime !== 'function'
  )
    fail('GENUINE_SOURCE_AND_FIXED_SERVER_CLOCK_REQUIRED');
  const world = social.worldId,
    worker = social.workerId,
    { workerRole } = readPostwarSocialRuntimeConnectionResources(social);
  let closed = false;
  const pending = new Set<Promise<unknown>>();
  async function withReader<T>(
    tx: SqlExecutor,
    run: () => Promise<T>,
  ): Promise<T> {
    const s = await tx.query<{ role_name: string }>(
      'select current_user as role_name',
    );
    if (s.rows.length !== 1 || s.rows[0]?.role_name !== workerRole)
      fail('ACTUAL_WORKER_EXECUTOR_REQUIRED');
    let value: T | undefined, error: unknown;
    try {
      await tx.query('set local role world_v2_industry_source_reader');
      value = await run();
    } catch (e) {
      error = e;
    }
    try {
      await tx.query('set local role "' + workerRole + '"');
    } catch (restore) {
      if (error !== undefined)
        throw new AggregateError(
          [error, restore],
          'WORK publisher source role restoration failed',
          { cause: restore },
        );
      throw restore;
    }
    if (error !== undefined) throw error;
    return value!;
  }
  const api: Readonly<PostwarIndustryWorkPublisher> = Object.freeze({
    async publishDue(
      scope: Readonly<{ countryId: string; facilityId: string; runId: string }>,
    ) {
      if (closed || !isPostwarSocialRuntimeConnection(social, world))
        fail('RETIRED');
      const operation = (async () => {
        const sim = await config.clock.simTime(),
          at = config.clock.nowReal();
        if (
          !/^(0|[1-9][0-9]*)$/u.test(sim) ||
          new Date(at).toISOString() !== at
        )
          fail('ACTUAL_SERVER_TIME_REQUIRED');
        const recovered = await config.publicationDatabase.transaction((p) =>
          p.query<Record<string, unknown>>(
            'select * from world_v2.read_postwar_industry_work_publication_for_run($1,$2,$3,$4)',
            [world, scope.countryId, scope.facilityId, scope.runId],
          ),
        );
        if (recovered.rows.length > 1)
          fail('UNIQUE_ACTUAL_RUN_PUBLICATION_REQUIRED');
        if (recovered.rows[0]) return published(recovered.rows[0]);
        return config.database.transaction(async (tx) => {
          const rows = await withReader(tx, () =>
            tx.query<Record<string, unknown>>(
              'select * from world_v2.lock_postwar_industry_work_issue_scope($1,$2,$3::timestamptz,$4)',
              [world, worker, at, sim],
            ),
          );
          if (rows.rows.length !== 1 || !rows.rows[0])
            fail('ACTUAL_LEASE_AND_HEAD_REQUIRED');
          const head = {
            worldVersion: text(rows.rows[0].world_version),
            eventSequence: text(rows.rows[0].event_sequence),
          };
          const context = await readPostwarIndustryRunStateFrom(tx, {
            socialConnection: social,
            worldId: world,
            countryId: scope.countryId,
            facilityId: scope.facilityId,
            expectedHead: head,
          });
          try {
            const facts = consumePostwarIndustryRunStateFrom(tx, context),
              state = readIndustryFirstDayWorkState(facts.workState),
              runs = state.runs.filter(
                (r) =>
                  r.terms.runId === scope.runId &&
                  r.source.countryId === scope.countryId &&
                  r.source.facilityId === scope.facilityId,
              );
            if (runs.length !== 1) fail('ACTUAL_COMMITTED_RUN_REQUIRED');
            const run = runs[0]!;
            // Recover an already issued FINAL/queued task before computing any work.
            const existing = await config.publicationDatabase.transaction((p) =>
              p.query<Record<string, unknown>>(
                'select * from world_v2.read_postwar_industry_work_publication($1,$2)',
                [world, run.frame.command.commandId],
              ),
            );
            if (existing.rows.length > 1)
              fail('UNIQUE_WORK_PUBLICATION_REQUIRED');
            if (existing.rows.length === 1) return published(existing.rows[0]!);
            if (BigInt(sim) < BigInt(facts.maxCommandSimTimeTicks))
              fail('SERVER_TIME_PRECEDES_ACTUAL_PREFIX');
            const allocations = derivePostwarIndustryRunWorkAllocations({
              state: facts.workState,
              countryId: scope.countryId,
              facilityId: scope.facilityId,
              runId: scope.runId,
              currentEmployment: facts.currentEmployment,
              simTime: sim,
            });
            const id =
              'COMMAND_INDUSTRY_WORK_' +
              sha(
                canonicalSerialize([
                  world,
                  run.frame.command.fingerprint,
                  'INDUSTRY_FIRST_DAY_WORK_RULE_V1',
                ]),
              ).toUpperCase();
            const command = parseCanonicalCommand(
              {
                schemaVersion: 'command-v1',
                worldId: world,
                commandId: id,
                commandType: INDUSTRY_FIRST_DAY_WORK_COMMAND,
                actorId: run.frame.command.actorId,
                authSubject: run.frame.command.authSubject,
                countryId: scope.countryId,
                officeId: null,
                expectedWorldVersion: head.worldVersion,
                idempotencyKey: id,
                correlationId: run.frame.command.correlationId,
                simTime: sim,
                submittedAtReal: at,
                payload: {
                  schemaVersion: 'postwar-industry-work-command-v1',
                  runId: scope.runId,
                  scheduleCommandFingerprint: run.frame.command.fingerprint,
                  allocations,
                },
              },
              sha,
            );
            prepareIndustryFirstDayWorkFrame(
              { state: facts.workState, command, head, observedAtReal: at },
              sha,
            );
            const output = await config.publicationDatabase.transaction(
              async (p) => {
                await p.query(
                  'set transaction isolation level repeatable read',
                );
                return p.query<Record<string, unknown>>(
                  'select * from world_v2.publish_postwar_industry_work_due($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9)',
                  [
                    world,
                    run.frame.command.commandId,
                    worker,
                    head.worldVersion,
                    head.eventSequence,
                    at,
                    sim,
                    command.canonicalPayload,
                    command.fingerprint,
                  ],
                );
              },
            );
            if (output.rows.length !== 1)
              fail('ONE_ACTUAL_WORK_PUBLICATION_REQUIRED');
            const result = published(output.rows[0]!);
            if (!sameCommand(command, result.command))
              fail('SQL_ISSUED_COMMAND_DIFFERS_FROM_GENUINE_CORE_DERIVATION');
            return result;
          } finally {
            releasePostwarIndustryRunStateContext(context);
          }
        });
      })();
      pending.add(operation);
      try {
        return await operation;
      } finally {
        pending.delete(operation);
      }
    },
    async close() {
      closed = true;
      await Promise.allSettled([...pending]);
    },
  });
  return api;
}
function sameCommand(a: CanonicalCommand, b: CanonicalCommand) {
  return canonicalSerialize(a) === canonicalSerialize(b);
}
function published(
  r: Record<string, unknown>,
): Readonly<{ status: 'QUEUED' | 'FINAL'; command: CanonicalCommand }> {
  const c = parseCanonicalCommand(
    {
      schemaVersion: r.schema_version,
      worldId: r.world_id,
      commandId: r.command_id,
      commandType: r.command_type,
      actorId: r.actor_id,
      authSubject: r.auth_subject,
      countryId: r.country_id,
      officeId: r.office_id,
      expectedWorldVersion: String(r.expected_world_version),
      idempotencyKey: r.idempotency_key,
      correlationId: r.correlation_id,
      simTime: String(r.sim_time),
      submittedAtReal:
        r.submitted_at_real instanceof Date
          ? r.submitted_at_real.toISOString()
          : r.submitted_at_real,
      payload: JSON.parse(text(r.canonical_payload)),
    },
    sha,
  );
  if (
    c.fingerprint !== r.command_fingerprint ||
    c.payloadHash !== r.payload_sha256 ||
    c.commandType !== INDUSTRY_FIRST_DAY_WORK_COMMAND ||
    c.officeId !== null ||
    !['QUEUED', 'FINAL'].includes(text(r.publication_status))
  )
    fail('EXACT_ACTUAL_CANONICAL_PUBLICATION_REQUIRED');
  return Object.freeze({
    status: r.publication_status === 'FINAL' ? 'FINAL' : 'QUEUED',
    command: c,
  });
}

/** Conditional DATA allocation only. Actual source/elapsed clock is supplied by
 * the fixed protected publisher; this function never commits completed WORK. */
export function derivePostwarIndustryRunWorkAllocations(
  input: Readonly<{
    state: IndustryFirstDayWorkState;
    countryId: string;
    facilityId: string;
    runId: string;
    simTime: string;
    currentEmployment: readonly Readonly<{
      positionId: string;
      employedCount: string;
    }>[];
  }>,
): readonly IndustryFirstDayWorkAllocation[] {
  const state = readIndustryFirstDayWorkState(input.state),
    runs = state.runs.filter(
      (r) =>
        r.source.countryId === input.countryId &&
        r.source.facilityId === input.facilityId &&
        r.terms.runId === input.runId,
    );
  if (runs.length !== 1 || !/^(0|[1-9][0-9]*)$/u.test(input.simTime))
    fail('ACTUAL_RUN_AND_EXACT_ELAPSED_TIME_REQUIRED');
  const run = runs[0]!,
    required = new WorldDecimal(run.terms.quantity.amount)
      .mul(run.source.labourPersonDaysPerOutput)
      .mul('28800000');
  if (!required.isInteger() || !required.greaterThan('0'))
    fail('EXACT_SIM_MILLISECOND_WORK_QUANTUM_REQUIRED');
  let remaining =
    BigInt(required.toFixed(0)) - BigInt(run.performedPersonMilliseconds);
  if (remaining <= 0n) fail('ACTUAL_RUN_WORK_ALREADY_COMPLETED');
  const start = BigInt(run.terms.startsAtSimTime),
    end =
      BigInt(input.simTime) < BigInt(run.terms.endsAtSimTime)
        ? BigInt(input.simTime)
        : BigInt(run.terms.endsAtSimTime);
  if (end <= start) fail('NOT_DUE_ELAPSED_WORK_WINDOW');
  const allocations: IndustryFirstDayWorkAllocation[] = [];
  for (const p of [...run.source.positions].sort((a, b) =>
    a.positionId.localeCompare(b.positionId),
  )) {
    const matches = input.currentEmployment.filter(
      (c) => c.positionId === p.positionId,
    );
    if (
      matches.length !== 1 ||
      !/^(0|[1-9][0-9]*)$/u.test(matches[0]!.employedCount)
    )
      fail('ACTUAL_CURRENT_EMPLOYMENT_REQUIRED');
    const lower = BigInt(p.startOrdinal),
      count = BigInt(matches[0]!.employedCount),
      upper = lower + count;
    if (count > BigInt(p.count))
      fail('CURRENT_EMPLOYMENT_EXCEEDS_ORIGINAL_RANGE');
    const prior = state.bookings.filter(
      (b) =>
        b.regionId === p.regionId &&
        BigInt(b.startOrdinal) < upper &&
        lower < BigInt(b.startOrdinal) + BigInt(b.count),
    );
    const cuts = [
      ...new Set([
        lower,
        upper,
        ...prior.flatMap((b) => [
          BigInt(b.startOrdinal) > lower ? BigInt(b.startOrdinal) : lower,
          BigInt(b.startOrdinal) + BigInt(b.count) < upper
            ? BigInt(b.startOrdinal) + BigInt(b.count)
            : upper,
        ]),
      ]),
    ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (cuts.length > 8192)
      fail('BOUNDED_ACTUAL_BOOKING_FRAGMENTATION_REQUIRED');
    for (let i = 0; i < cuts.length - 1 && remaining > 0n; i++) {
      const ordinal = cuts[i]!,
        groupCount = cuts[i + 1]! - ordinal;
      if (groupCount <= 0n) continue;
      const occupied = prior
        .filter(
          (b) =>
            BigInt(b.startOrdinal) <= ordinal &&
            ordinal < BigInt(b.startOrdinal) + BigInt(b.count),
        )
        .map((b) => ({
          start: BigInt(b.startsAtSimTime),
          end: BigInt(b.endsAtSimTime),
        }))
        .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
      let daily =
          28800000n - occupied.reduce((n, b) => n + b.end - b.start, 0n),
        cursor = start;
      if (daily <= 0n) continue;
      const append = (
        absolute: bigint,
        n: bigint,
        from: bigint,
        duration: bigint,
      ) => {
        if (n <= 0n || duration <= 0n) return;
        const last = allocations.at(-1);
        if (
          last &&
          last.positionId === p.positionId &&
          last.endsAtSimTime === (from + duration).toString() &&
          last.startsAtSimTime === from.toString() &&
          BigInt(last.startOrdinal) + BigInt(last.count) === absolute
        ) {
          const total = BigInt(last.count) + n,
            personMs = total * duration;
          allocations[allocations.length - 1] = Object.freeze({
            ...last,
            count: total.toString(),
            personMilliseconds: personMs.toString(),
            personMinutes: {
              numerator: personMs.toString(),
              denominator: '60000' as const,
            },
          });
          return;
        }
        if (allocations.length >= 2048)
          fail('BOUNDED_ACTUAL_BOOKING_FRAGMENTATION_REQUIRED');
        const personMs = n * duration;
        allocations.push(
          Object.freeze({
            positionId: p.positionId,
            poolId: p.poolId,
            sourceStartOrdinal: (
              BigInt(p.sourceStartOrdinal) +
              absolute -
              lower
            ).toString(),
            populationLineage: 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1',
            regionId: p.regionId,
            cohortRef: p.cohortRef,
            startOrdinal: absolute.toString(),
            count: n.toString(),
            skill: p.skill,
            startsAtSimTime: from.toString(),
            endsAtSimTime: (from + duration).toString(),
            personMilliseconds: personMs.toString(),
            personMinutes: {
              numerator: personMs.toString(),
              denominator: '60000' as const,
            },
          }),
        );
      };
      for (const block of [...occupied, { start: end, end }]) {
        if (block.end <= cursor) continue;
        const through = block.start < end ? block.start : end;
        if (through > cursor && remaining > 0n && daily > 0n) {
          const duration = through - cursor < daily ? through - cursor : daily,
            capacity = groupCount * duration;
          if (remaining >= capacity) {
            append(ordinal, groupCount, cursor, duration);
            remaining -= capacity;
            daily -= duration;
          } else {
            const complete = remaining / duration,
              remainder = remaining % duration;
            append(ordinal, complete, cursor, duration);
            append(
              ordinal + complete,
              remainder > 0n ? 1n : 0n,
              cursor,
              remainder,
            );
            remaining = 0n;
          }
        }
        if (block.end > cursor) cursor = block.end;
        if (cursor >= end || remaining === 0n || daily === 0n) break;
      }
    }
    if (remaining === 0n) break;
  }
  if (remaining !== 0n) fail('NOT_DUE_ACTUAL_DISTINCT_ELAPSED_WORK_CAPACITY');
  return Object.freeze(allocations);
}
