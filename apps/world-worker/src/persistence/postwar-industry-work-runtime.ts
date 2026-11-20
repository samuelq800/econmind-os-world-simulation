/** Fixed automatic WORK candidate/cutoff over the actual claimed task and
 * complete current same-executor run state. No HTTP, consumer or clock loop. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  canonicalSha256,
  canonicalHashInput,
  validateCanonicalCommand,
  parseWorldWriterLease,
  createWorldWriterCommitAssertion,
  type CanonicalCommand,
} from '@econmind/core';
import {
  INDUSTRY_FIRST_DAY_WORK_COMMAND,
  prepareIndustryFirstDayWorkFrame,
  readIndustryFirstDayWorkState,
  readIndustryCompletedWork,
} from '@econmind/core/industry-first-day-work';
import {
  isPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeFinancialReplayBase,
  readPostwarSocialRuntimeConnectionResources,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import {
  readPostwarIndustryRunStateFrom,
  consumePostwarIndustryRunStateFrom,
  releasePostwarIndustryRunStateContext,
} from './postwar-industry-run-state.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import { requirePostwarSocialSourceRevocationFence } from './postwar-social-position-runtime.js';
import type { IndustryRunSourceCommitRequest } from './postwar-industry-run-runtime.js';
import {
  createPostwarIndustryWorkPublisher,
  type PostwarIndustryWorkPublicationClock,
  type PostwarIndustryWorkPublisher,
} from './postwar-industry-work-publisher.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from './atomic-transition-repository.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function fail(s: string): never {
  throw Error('INDUSTRY_WORK:' + s);
}
function text(x: unknown): string {
  if (typeof x !== 'string' || !x) fail('ACTUAL_SCOPE_FIELD_REQUIRED');
  return x;
}
export const INDUSTRY_WORK_SOURCE_PURPOSE =
  'POSTWAR_INDUSTRY_WORK_SOURCE_RECHECK_V1' as const;
export const INDUSTRY_WORK_SCOPE_QUERY =
  'select * from world_v2.lock_postwar_industry_work_scope($1,$2,$3,$4,$5::timestamptz,$6)';
export type IndustryWorkSourceCommitRequest = Omit<
  IndustryRunSourceCommitRequest,
  'purpose'
> & { readonly purpose: typeof INDUSTRY_WORK_SOURCE_PURPOSE };
export interface IndustryWorkSourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<IndustryWorkSourceCommitRequest>,
  ): Promise<
    Readonly<{
      status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
      purpose: typeof INDUSTRY_WORK_SOURCE_PURPOSE;
      commandFingerprint: string;
      currentHead: IndustryWorkSourceCommitRequest['currentHead'];
      readBindingFingerprint: string;
      protectionMode: 'HELD_SOURCE_GUARDS';
    }>
  >;
}
export interface PostwarIndustryWorkRuntime {
  readonly worldId: string;
  readonly database: SqlDatabase;
  readonly candidateFactory: Readonly<AtomicTransitionCandidateFactory>;
  readonly sourceCommitProtectionPort: Readonly<IndustryWorkSourceCommitProtectionPort>;
  publishDueWork(
    scope: Parameters<PostwarIndustryWorkPublisher['publishDue']>[0],
  ): ReturnType<PostwarIndustryWorkPublisher['publishDue']>;
  close(): Promise<void>;
}
const runtimes = new WeakMap<object, () => boolean>(),
  guards = new WeakMap<object, () => boolean>();
export function isPostwarIndustryWorkRuntime(
  v: unknown,
): v is Readonly<PostwarIndustryWorkRuntime> {
  return !!v && typeof v === 'object' && runtimes.get(v)?.() === true;
}
export function isPostwarIndustryWorkSourceCommitProtectionPort(
  v: unknown,
): v is Readonly<IndustryWorkSourceCommitProtectionPort> {
  return !!v && typeof v === 'object' && guards.get(v)?.() === true;
}
export function createPostwarIndustryWorkRuntime(
  config: Readonly<{
    database: SqlDatabase;
    socialConnection: Readonly<PostwarSocialRuntimeConnection>;
    publication?: Readonly<{
      database: SqlDatabase;
      clock: Readonly<PostwarIndustryWorkPublicationClock>;
    }>;
  }>,
): Readonly<PostwarIndustryWorkRuntime> {
  const social = config.socialConnection;
  if (!isPostwarSocialRuntimeConnection(social, social?.worldId))
    fail('GENUINE_SOCIAL_CONNECTION_REQUIRED');
  const world = social.worldId,
    worker = social.workerId,
    { workerRole } = readPostwarSocialRuntimeConnectionResources(social);
  requirePostwarSocialSourceRevocationFence(social.database, world);
  const publisher =
    config.publication === undefined
      ? undefined
      : createPostwarIndustryWorkPublisher({
          database: config.database,
          socialConnection: social,
          publicationDatabase: config.publication.database,
          clock: config.publication.clock,
        });
  let closed = false;
  const pending = new Set<Promise<unknown>>(),
    active = new WeakSet<object>();
  const live = () => !closed && isPostwarSocialRuntimeConnection(social, world);
  function track<T>(run: () => Promise<T>): Promise<T> {
    if (!live()) return Promise.reject(Error('INDUSTRY_WORK_RETIRED'));
    const p = Promise.resolve().then(run);
    pending.add(p);
    void p.then(
      () => pending.delete(p),
      () => pending.delete(p),
    );
    return p;
  }
  async function derive(
    tx: SqlExecutor,
    command: CanonicalCommand,
    at: string,
  ) {
    if (!live()) fail('LIVE_SOURCE_REQUIRED');
    const c = validateCanonicalCommand(command, sha);
    if (
      c.worldId !== world ||
      c.officeId !== null ||
      c.commandType !== INDUSTRY_FIRST_DAY_WORK_COMMAND ||
      c.expectedWorldVersion === null ||
      c.idempotencyKey === null ||
      new Date(at).toISOString() !== at
    )
      fail('FIXED_VERSIONED_AUTOMATIC_WORK_REQUIRED');
    const session = await tx.query<{ role_name: string }>(
      'select current_user as role_name',
    );
    if (session.rows.length !== 1 || session.rows[0]?.role_name !== workerRole)
      fail('ACTUAL_WORKER_EXECUTOR_REQUIRED');
    let rows: readonly Record<string, unknown>[] = [];
    let failure: unknown;
    try {
      await tx.query('set local role world_v2_industry_source_reader');
      rows = (
        await tx.query<Record<string, unknown>>(INDUSTRY_WORK_SCOPE_QUERY, [
          world,
          c.commandId,
          c.fingerprint,
          worker,
          at,
          c.simTime.toCanonicalValue(),
        ])
      ).rows;
    } catch (error) {
      failure = error;
    }
    try {
      await tx.query('set local role "' + workerRole + '"');
    } catch (restore) {
      if (failure !== undefined)
        throw new AggregateError(
          [failure, restore],
          'Industry WORK scope restore failed',
          { cause: restore },
        );
      throw restore;
    }
    if (failure !== undefined) throw failure;
    if (rows.length !== 1 || !rows[0])
      fail('ACTUAL_FENCED_CLAIM_LEASE_HEAD_REQUIRED');
    const r = rows[0],
      head = {
        worldId: world,
        worldVersion: text(r.world_version),
        eventSequence: text(r.event_sequence),
      };
    const payload: unknown = JSON.parse(c.canonicalPayload);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      fail('EXACT_WORK_INTENT_REQUIRED');
    const intent = payload as Record<string, unknown>;
    if (
      !Array.isArray(intent.allocations) ||
      intent.allocations.length === 0 ||
      intent.allocations.length > 2048
    )
      fail('BOUNDED_ACTUAL_ALLOCATIONS_REQUIRED');
    // Facility comes from the actual firstday registered run, not a new HTTP ref.
    // The first allocation must name one actual private E03 industrial position.
    const first = intent.allocations[0];
    if (!first || typeof first !== 'object' || Array.isArray(first))
      fail('ACTUAL_POSITION_REQUIRED');
    const positionId = text((first as Record<string, unknown>).positionId);
    const b = consumePreparedPostwarSocialFinancialReplayBase(
      readPostwarSocialRuntimeFinancialReplayBase(social, world),
    );
    const positions = b.document.inputs.sourcePositions.filter(
      (p) =>
        p.positionId === positionId &&
        p.countryId === c.countryId &&
        (p.sourceBucket === 'INDUSTRY' || p.sourceBucket === 'POWER') &&
        p.employerRole === 'OP',
    );
    if (positions.length !== 1)
      fail('ACTUAL_INDUSTRIAL_POSITION_ORIGINAL_REQUIRED');
    const facility = text(positions[0]!.sourceObjectId),
      context = await readPostwarIndustryRunStateFrom(tx, {
        socialConnection: social,
        worldId: world,
        countryId: c.countryId,
        facilityId: facility,
        expectedHead: head,
      });
    try {
      const facts = consumePostwarIndustryRunStateFrom(tx, context),
        run = readIndustryFirstDayWorkState(facts.workState).runs.filter(
          (x) =>
            x.terms.runId === intent.runId &&
            x.source.countryId === c.countryId &&
            x.source.facilityId === facility,
        );
      if (
        run.length !== 1 ||
        run[0]!.frame.command.fingerprint !== intent.scheduleCommandFingerprint
      )
        fail('ACTUAL_COMMITTED_RUN_REQUIRED');
      // Opening duties are not completed labour. Current filled range is an
      // eligibility bound, while the Core state checks actual cross-run time.
      for (const allocation of intent.allocations) {
        if (
          !allocation ||
          typeof allocation !== 'object' ||
          Array.isArray(allocation)
        )
          fail('ACTUAL_ALLOCATION_REQUIRED');
        const a = allocation as Record<string, unknown>,
          site = facts.siteSources[0]!.positions.find(
            (p) => p.positionId === a.positionId,
          ),
          current = facts.currentEmployment.find(
            (p) => p.positionId === a.positionId,
          );
        if (
          !site ||
          !current ||
          typeof a.sourceStartOrdinal !== 'string' ||
          typeof a.count !== 'string' ||
          !/^(0|[1-9][0-9]*)$/u.test(a.sourceStartOrdinal) ||
          !/^[1-9][0-9]*$/u.test(a.count) ||
          BigInt(a.sourceStartOrdinal) < BigInt(site.sourceStartOrdinal) ||
          BigInt(a.sourceStartOrdinal) + BigInt(a.count) >
            BigInt(site.sourceStartOrdinal) + BigInt(current.employedCount)
        )
          fail('CURRENT_DISTINCT_EMPLOYED_RANGE_REQUIRED');
      }
      if (c.simTime.ticks < BigInt(facts.maxCommandSimTimeTicks))
        fail('COMMAND_PRECEDES_ACTUAL_PREFIX');
      const prepared = prepareIndustryFirstDayWorkFrame(
        { state: facts.workState, command: c, head, observedAtReal: at },
        sha,
      );
      if (!prepared.work) fail('GENUINE_COMPLETED_WORK_REQUIRED');
      const work = readIndustryCompletedWork(prepared.work),
        binding = Object.freeze({
          schemaVersion: 'postwar-industry-work-current-binding-v1',
          commandFingerprint: c.fingerprint,
          observedAtReal: at,
          head,
          seedPins: facts.seedPins,
          sourceRef: facts.firstdayOriginal.sourceRef,
          sourceRawSha256: facts.firstdayOriginal.rawSha256,
          pageChainFingerprint: facts.pageChainFingerprint,
          scheduleCommandFingerprint: run[0]!.frame.command.fingerprint,
          workEventFingerprint: work.frame.events[0]!.fingerprint,
        });
      const lease = parseWorldWriterLease({
        schemaVersion: 'world-writer-lease-v1',
        worldId: world,
        holderId: text(r.holder_id),
        fencingToken: text(r.fencing_token),
        acquiredAtReal: text(r.acquired_at_real),
        renewedAtReal: text(r.renewed_at_real),
        expiresAtReal: text(r.lease_expires_at_real),
      });
      return {
        frame: prepared.frame,
        binding,
        head,
        commitAssertion: createWorldWriterCommitAssertion(
          lease,
          head.worldVersion,
        ),
      };
    } finally {
      releasePostwarIndustryRunStateContext(context);
    }
  }
  const port: Readonly<IndustryWorkSourceCommitProtectionPort> = Object.freeze({
    async assertCurrentFrom(
      tx: SqlExecutor,
      request: Readonly<IndustryWorkSourceCommitRequest>,
    ) {
      if (
        !live() ||
        active.has(tx) ||
        request.phase !== 'BEFORE_EVENTS' ||
        request.purpose !== INDUSTRY_WORK_SOURCE_PURPOSE ||
        request.commitAuthorization !== null ||
        request.financialPostingBatches.length !== 0 ||
        request.inventoryPostings.length !== 0
      )
        fail('FIXED_AUTOMATIC_WORK_CUTOFF_REQUIRED');
      active.add(tx);
      try {
        const fresh = await derive(tx, request.command, request.observedAtReal);
        if (
          !same(fresh.head, request.currentHead) ||
          !same(fresh.frame.transition, request.transition) ||
          !same(fresh.binding, request.readBinding)
        )
          fail('CURRENT_WORK_SOURCE_OR_EFFECT_CHANGED');
        return Object.freeze({
          status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
          purpose: INDUSTRY_WORK_SOURCE_PURPOSE,
          commandFingerprint: request.command.fingerprint,
          currentHead: request.currentHead,
          readBindingFingerprint: hash(fresh.binding),
          protectionMode: 'HELD_SOURCE_GUARDS',
        });
      } finally {
        active.delete(tx);
      }
    },
  });
  guards.set(port, live);
  const candidateFactory: Readonly<AtomicTransitionCandidateFactory> =
    Object.freeze({
      async prepare(
        input: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
      ): Promise<AtomicTransitionDraft> {
        if (input.commitAuthorization !== null)
          fail('AUTOMATIC_WORK_HAS_NO_USER_PROOF');
        return track(async () => {
          const fresh = await config.database.transaction((tx) =>
            derive(tx, input.command, input.observedAtReal),
          );
          return Object.freeze({
            transition: fresh.frame.transition,
            receipt: fresh.frame.receipt,
            inventoryPostings: Object.freeze([]),
            financialPostingBatches: Object.freeze([]),
            outboxMessages: Object.freeze([]),
            currentMaterializations: Object.freeze([]),
            authorityKind: 'VERSIONED_AUTOMATIC',
            commitAssertion: fresh.commitAssertion,
            observedAtReal: input.observedAtReal,
            officeOperatingSourceReadBinding: fresh.binding,
          });
        });
      },
    });
  const runtime: Readonly<PostwarIndustryWorkRuntime> = Object.freeze({
    worldId: world,
    database: config.database,
    candidateFactory,
    sourceCommitProtectionPort: port,
    publishDueWork(
      scope: Parameters<PostwarIndustryWorkPublisher['publishDue']>[0],
    ) {
      if (!live()) return Promise.reject(Error('INDUSTRY_WORK_RETIRED'));
      if (!publisher)
        return Promise.reject(Error('INDUSTRY_WORK_PUBLISHER_NOT_INSTALLED'));
      return publisher.publishDue(scope);
    },
    async close() {
      closed = true;
      await Promise.allSettled([...pending]);
      await publisher?.close();
    },
  });
  runtimes.set(runtime, live);
  return runtime;
}
