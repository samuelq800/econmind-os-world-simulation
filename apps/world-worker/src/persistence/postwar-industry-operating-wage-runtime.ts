/** Fixed automatic actual-WORK wage source/candidate. No arbitrary source,
 * candidate callback, Clock issuance, admission, arbitrary queue publication or DB grant. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  validateCanonicalCommand,
  parseCanonicalCommand,
  createFinalCommandReceipt,
  createWorldWriterCommitAssertion,
  parseWorldWriterLease,
  worldId,
  DomainError,
  DOMAIN_ERROR_CODES,
  type CanonicalCommand,
  type DecisionResultHead,
  type AuthoritativeTransition,
  type FinancialPostingBatch,
  type InventoryLedgerPosting,
} from '@econmind/core';
import {
  INDUSTRY_OPERATING_WAGE_COMMAND,
  INDUSTRY_OPERATING_WAGE_POLICY,
  prepareIndustryOperatingWagePayment,
} from '@econmind/core/industry-operating-wage-payment';
import {
  readIndustryCompletedWork,
  readIndustryFirstDayWorkState,
} from '@econmind/core/industry-first-day-work';
import {
  readFinanceSocialSourceBinding,
  type FinanceSocialSourceBinding,
} from '../runtime-preparation/finance-social-runtime-connection.js';
import {
  readPostwarSocialRuntimeConnectionResources,
  readPostwarSocialRuntimeFinancialReplayBase,
} from '../runtime-preparation/social-runtime-connection.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import {
  readRegisteredWorldExecutionFrom,
  registeredWorldExecutionClockScope,
} from '../time/registered-world-execution-state.js';
import { lockPostwarSourceRevocationFencesFrom } from './postwar-source-revocation-fence.js';
import { readPostwarIndustryCompletedWorkOriginalFrom } from './postwar-industry-completed-work-original.js';
import {
  readPostwarIndustryRunStateFrom,
  consumePostwarIndustryRunStateFrom,
  releasePostwarIndustryRunStateContext,
} from './postwar-industry-run-state.js';
import { projectPostwarIndustryOperatingWageSource } from './postwar-industry-operating-wage-originals.js';
import { readPostwarBeneficialHousingRentMixedOriginalsForSocialBase } from './postwar-beneficial-housing-rent-mixed-source.js';
import { createPostwarSocialSourceRoleScope } from './postwar-social-position-runtime.js';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from './atomic-transition-repository.js';
import type { SqlExecutor, SqlDatabase } from './sql-database.js';
export const INDUSTRY_OPERATING_WAGE_SOURCE_PURPOSE =
  'INDUSTRY_OPERATING_WAGE_PAYMENT_SOURCE_RECHECK_V1' as const;
export interface IndustryOperatingWageSourceCommitRequest {
  readonly phase: 'BEFORE_EVENTS';
  readonly purpose: typeof INDUSTRY_OPERATING_WAGE_SOURCE_PURPOSE;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly currentHead: DecisionResultHead;
  readonly observedAtReal: string;
  readonly readBinding: unknown;
  readonly commitAuthorization: null;
  readonly inventoryPostings: readonly InventoryLedgerPosting[];
  readonly financialPostingBatches: readonly FinancialPostingBatch[];
  readonly currentMaterializations: readonly unknown[];
}
export interface IndustryOperatingWageSourceCommitAudit {
  readonly status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
  readonly purpose: typeof INDUSTRY_OPERATING_WAGE_SOURCE_PURPOSE;
  readonly commandFingerprint: string;
  readonly currentHead: DecisionResultHead;
  readonly readBindingFingerprint: string;
  readonly protectionMode: 'HELD_SOURCE_GUARDS';
}
export interface IndustryOperatingWageSourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<IndustryOperatingWageSourceCommitRequest>,
  ): Promise<Readonly<IndustryOperatingWageSourceCommitAudit>>;
}
export interface IndustryWagePublicationScope {
  readonly countryId: string;
  readonly facilityId: string;
  readonly runId: string;
}
export interface PostwarIndustryOperatingWageRuntime {
  publishDue(
    scope: IndustryWagePublicationScope,
  ): Promise<
    Readonly<{ status: 'QUEUED' | 'FINAL'; command: CanonicalCommand }>
  >;
  readonly worldId: string;
  readonly candidateFactory: Readonly<AtomicTransitionCandidateFactory>;
  readonly sourceCommitProtectionPort: Readonly<IndustryOperatingWageSourceCommitProtectionPort>;
  assertSourceBeforeClaim(input: {
    command: CanonicalCommand;
    observedAtReal: string;
  }): Promise<void>;
  close(): Promise<void>;
}
const ports = new WeakMap<object, () => boolean>(),
  runtimes = new WeakMap<object, () => boolean>();
export function isPostwarIndustryOperatingWageSourceCommitProtectionPort(
  value: unknown,
): value is Readonly<IndustryOperatingWageSourceCommitProtectionPort> {
  return !!value && typeof value === 'object' && ports.get(value)?.() === true;
}
export function isPostwarIndustryOperatingWageRuntime(
  value: unknown,
): value is Readonly<PostwarIndustryOperatingWageRuntime> {
  return (
    !!value && typeof value === 'object' && runtimes.get(value)?.() === true
  );
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha),
  same = (a: unknown, b: unknown) =>
    canonicalSerialize(a) === canonicalSerialize(b);
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'INDUSTRY_OPERATING_WAGE_RUNTIME:' + s,
  );
}
function string(v: unknown): string {
  if (typeof v !== 'string' || !v) invalid('EXACT_METADATA_REQUIRED');
  return v;
}
function time(v: unknown) {
  return v instanceof Date ? v.toISOString() : string(v);
}
function observation(c: CanonicalCommand, real: string) {
  if (
    !Number.isFinite(Date.parse(real)) ||
    new Date(real).toISOString() !== real ||
    real < c.submittedAtReal
  )
    invalid('EXACT_REAL_OBSERVATION_REQUIRED');
}
function intent(c: CanonicalCommand) {
  const p = JSON.parse(c.canonicalPayload) as Record<string, unknown>;
  if (
    c.commandType !== INDUSTRY_OPERATING_WAGE_COMMAND ||
    c.officeId !== null ||
    c.expectedWorldVersion === null ||
    !p ||
    typeof p !== 'object' ||
    Array.isArray(p) ||
    Object.keys(p).sort().join('|') !==
      ['schemaVersion', 'workEventId', 'workEventFingerprint', 'policyVersion']
        .sort()
        .join('|') ||
    p.schemaVersion !== 'industry-operating-wage-payment-v1' ||
    p.policyVersion !== INDUSTRY_OPERATING_WAGE_POLICY.version ||
    typeof p.workEventId !== 'string' ||
    typeof p.workEventFingerprint !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/u.test(p.workEventFingerprint)
  )
    invalid('FIXED_AUTOMATIC_WORK_WAGE_INTENT_REQUIRED');
  return {
    workEventId: p.workEventId,
    workEventFingerprint: p.workEventFingerprint,
  };
}
export function createPostwarIndustryOperatingWageRuntime(input: {
  sharedBinding: FinanceSocialSourceBinding;
  publicationDatabase?: SqlDatabase;
}): Readonly<PostwarIndustryOperatingWageRuntime> {
  const bound = readFinanceSocialSourceBinding(input.sharedBinding),
    resources = readPostwarSocialRuntimeConnectionResources(
      bound.socialConnection,
    ),
    world = bound.worldId,
    scope = registeredWorldExecutionClockScope(bound.clock),
    env = bound.environment.ECONMIND_ENV;
  if (
    !['local', 'ci', 'staging', 'production'].includes(String(env)) ||
    !/^[-a-z0-9_]+$/u.test(resources.workerRole)
  )
    invalid('FIXED_SHARED_TRANSPORT_REQUIRED');
  if ((env === 'staging' || env === 'production') && !scope)
    invalid('GENUINE_REGISTERED_CLOCK_REQUIRED');
  if (
    scope &&
    (scope.database !== bound.socialConnection.database ||
      scope.worldId !== world ||
      scope.workerId !== bound.workerId)
  )
    invalid('EXACT_REGISTERED_TRANSPORT_REQUIRED');
  let closed = false,
    closing: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>(),
    active = new WeakSet<object>(),
    roles = createPostwarSocialSourceRoleScope({
      workerRole: resources.workerRole,
    });
  const live = () => {
    if (closed) return false;
    try {
      const now = readFinanceSocialSourceBinding(input.sharedBinding);
      return (
        now.worldId === bound.worldId &&
        now.workerId === bound.workerId &&
        now.database === bound.database &&
        now.clock === bound.clock &&
        now.socialConnection === bound.socialConnection
      );
    } catch {
      return false;
    }
  };
  const track = <T>(action: () => Promise<T>): Promise<T> => {
    if (!live())
      return Promise.reject(
        new DomainError(
          DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
          'INDUSTRY_OPERATING_WAGE_RUNTIME:RETIRED',
        ),
      );
    const p = Promise.resolve().then(action);
    pending.add(p);
    void p.then(
      () => pending.delete(p),
      () => pending.delete(p),
    );
    return p;
  };
  async function withIndustryReader<T>(
    tx: SqlExecutor,
    read: () => Promise<T>,
  ): Promise<T> {
    const before = await tx.query<{ role_name: string }>(
      'select current_user as role_name',
    );
    if (
      before.rows.length !== 1 ||
      before.rows[0]?.role_name !== resources.workerRole
    )
      invalid('ACTUAL_WORKER_BEFORE_INDUSTRY_SCOPE_REQUIRED');
    let value: T | undefined, error: unknown;
    try {
      await tx.query('set local role world_v2_industry_source_reader');
      value = await read();
    } catch (e) {
      error = e;
    }
    try {
      await tx.query('set local role "' + resources.workerRole + '"');
    } catch (e) {
      if (error !== undefined)
        throw new AggregateError(
          [error, e],
          'WAGE source role restore failed',
          { cause: e },
        );
      throw e;
    }
    if (error !== undefined) throw error;
    return value!;
  }
  function published(
    row: Record<string, unknown>,
  ): Readonly<{ status: 'QUEUED' | 'FINAL'; command: CanonicalCommand }> {
    const command = parseCanonicalCommand(
      JSON.parse(string(row.command_json)) as unknown,
      sha,
    );
    intent(command);
    if (
      command.worldId !== world ||
      command.fingerprint !== row.command_fingerprint ||
      !['QUEUED', 'FINAL'].includes(string(row.publication_status))
    )
      invalid('ACTUAL_SQL_PUBLISHED_WAGE_REQUIRED');
    return Object.freeze({
      status: row.publication_status === 'FINAL' ? 'FINAL' : 'QUEUED',
      command,
    });
  }
  async function derive(
    tx: SqlExecutor,
    c: CanonicalCommand,
    observedAtReal: string,
    requireClaim: boolean,
    publicationMode = false,
  ) {
    const command = validateCanonicalCommand(c, sha),
      p = intent(command);
    observation(command, observedAtReal);
    if (command.worldId !== world) invalid('EXACT_WORLD_REQUIRED');
    await roles.withSourceReaderFrom(tx, () =>
      lockPostwarSourceRevocationFencesFrom(tx, { worldId: world }),
    );
    const session = await tx.query<{ role_name: string }>(
      'select current_user as role_name',
    );
    if (
      session.rows.length !== 1 ||
      session.rows[0]?.role_name !== resources.workerRole
    )
      invalid('ACTUAL_WORKER_EXECUTOR_REQUIRED');
    const l = await tx.query<Record<string, unknown>>(
      'select world_id,holder_id,fencing_token::text,acquired_at_real,renewed_at_real,lease_expires_at_real from world_v2.world_writer_lease where world_id=$1 and holder_id=$2 and lease_expires_at_real>$3::timestamptz for share',
      [world, bound.workerId, observedAtReal],
    );
    if (l.rows.length !== 1 || !l.rows[0])
      invalid('ACTUAL_CURRENT_WRITER_LEASE_REQUIRED');
    const row = l.rows[0];
    const lease = parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: string(row.world_id),
      holderId: string(row.holder_id),
      fencingToken: string(row.fencing_token),
      acquiredAtReal: time(row.acquired_at_real),
      renewedAtReal: time(row.renewed_at_real),
      expiresAtReal: time(row.lease_expires_at_real),
    });
    const h = await tx.query<{ world_version: string; event_sequence: string }>(
      'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
      [world],
    );
    if (
      h.rows.length !== 1 ||
      !h.rows[0] ||
      h.rows[0].world_version !== command.expectedWorldVersion
    )
      invalid('ACTUAL_CURRENT_HEAD_REQUIRED');
    const head: DecisionResultHead = Object.freeze({
      worldId: worldId(world),
      worldVersion: h.rows[0].world_version,
      eventSequence: h.rows[0].event_sequence,
    });
    const registered = scope
        ? await readRegisteredWorldExecutionFrom(tx, bound.clock)
        : null,
      clock = registered
        ? registered.simTime
        : await bound.clock.simTime(world);
    if (clock !== command.simTime.toCanonicalValue())
      invalid('EXACT_ACTUAL_BOUND_CLOCK_REQUIRED');
    if (
      registered &&
      (registered.workerId !== bound.workerId ||
        registered.consumerRole !== resources.workerRole ||
        observedAtReal < registered.validFromReal ||
        observedAtReal >= registered.validUntilReal)
    )
      invalid('ACTUAL_CURRENT_REGISTERED_CONTROL_REQUIRED');
    let publication: Record<string, unknown> | undefined;
    if (!publicationMode) {
      const q = await tx.query<Record<string, unknown>>(
          'select authority_kind,queue_state,claimed_by,claim_fencing_token::text,available_at_sim_time::text from world_v2.command_queue where world_id=$1 and command_id=$2 for share',
          [world, command.commandId],
        ),
        claim = q.rows[0];
      if (
        q.rows.length !== 1 ||
        !claim ||
        claim.authority_kind !== 'VERSIONED_AUTOMATIC' ||
        !['PENDING', 'CLAIMED'].includes(string(claim.queue_state)) ||
        BigInt(string(claim.available_at_sim_time)) > command.simTime.ticks ||
        (requireClaim && claim.queue_state !== 'CLAIMED') ||
        (claim.queue_state === 'PENDING' &&
          (claim.claimed_by !== null || claim.claim_fencing_token !== null)) ||
        (claim.queue_state === 'CLAIMED' &&
          (claim.claimed_by !== lease.holderId ||
            claim.claim_fencing_token !== lease.fencingToken))
      )
        invalid('EXACT_AUTOMATIC_QUEUE_AND_FENCE_REQUIRED');
      const stored = await tx.query<{
        command_fingerprint: string;
        payload_sha256: string;
      }>(
        'select command_fingerprint,payload_sha256 from world_v2.command_submission where world_id=$1 and command_id=$2',
        [world, command.commandId],
      );
      if (
        stored.rows.length !== 1 ||
        stored.rows[0]?.command_fingerprint !== command.fingerprint ||
        stored.rows[0].payload_sha256 !== command.payloadHash
      )
        invalid('EXACT_PERSISTED_AUTOMATIC_COMMAND_REQUIRED');

      publication = await withIndustryReader(tx, async () => {
        const r = await tx.query<Record<string, unknown>>(
          'select * from world_v2.lock_postwar_industry_wage_publication($1,$2,$3)',
          [world, command.commandId, command.fingerprint],
        );
        if (r.rows.length !== 1 || !r.rows[0])
          invalid('ACTUAL_FIXED_WAGE_PUBLICATION_REQUIRED');
        return r.rows[0];
      });
      if (
        publication.work_event_id !== p.workEventId ||
        publication.work_event_fingerprint !== p.workEventFingerprint ||
        publication.policy_version !== INDUSTRY_OPERATING_WAGE_POLICY.version
      )
        invalid('ACTUAL_WAGE_ISSUER_ORIGIN_DIFFERS');
    }
    const base = readPostwarSocialRuntimeFinancialReplayBase(
        bound.socialConnection,
        world,
      ),
      b = consumePreparedPostwarSocialFinancialReplayBase(base);
    const workOriginal = await roles.withSourceReaderFrom(tx, () =>
      readPostwarIndustryCompletedWorkOriginalFrom(tx, {
        baseline: base,
        worldId: world,
        hostCountryId: command.countryId,
        officeId: 'SOCIAL',
        sourceCountryId: command.countryId,
        workEventId: p.workEventId,
        workEventFingerprint: p.workEventFingerprint,
        expectedHead: head,
      }),
    );
    const context = await readPostwarIndustryRunStateFrom(tx, {
      socialConnection: bound.socialConnection,
      worldId: world,
      countryId: command.countryId,
      facilityId: workOriginal.body.facilityId,
      expectedHead: head,
    });
    try {
      const facts = consumePostwarIndustryRunStateFrom(tx, context);
      if (
        !facts.wageState ||
        facts.seedPins.seedId !== b.pins.seedRef ||
        facts.seedPins.seedFingerprint !== b.pins.contentHash ||
        facts.seedPins.admissionRef !== b.pins.admissionRef ||
        (registered &&
          (registered.seedId !== facts.seedPins.seedId ||
            registered.seedFingerprint !== facts.seedPins.seedFingerprint ||
            registered.admissionRef !== facts.seedPins.admissionRef))
      )
        invalid('CURRENT_PAIRED_WAGE_STATE_AND_ADMISSION_REQUIRED');
      if (
        publication &&
        (publication.seed_fingerprint !== facts.seedPins.seedFingerprint ||
          publication.admission_ref !== facts.seedPins.admissionRef ||
          publication.source_ref !== facts.firstdayOriginal.sourceRef)
      )
        invalid('ACTUAL_PUBLICATION_SOURCE_OR_ADMISSION_DIFFERS');
      const selected = facts.completedWorks.filter((t) => {
        const w = readIndustryCompletedWork(t);
        return (
          w.frame.events[0]?.eventId === p.workEventId &&
          w.frame.events[0]?.fingerprint === p.workEventFingerprint
        );
      });
      if (selected.length !== 1)
        invalid('ACTUAL_CURRENT_COMPLETED_WORK_REQUIRED');
      const work = selected[0]!,
        actual = readIndustryCompletedWork(work);
      if (
        !same(actual.data, workOriginal.body) ||
        actual.frame.command.commandId !== workOriginal.commandId ||
        actual.frame.command.fingerprint !== workOriginal.commandFingerprint ||
        command.actorId !== actual.frame.command.actorId ||
        command.authSubject !== actual.frame.command.authSubject
      )
        invalid('EXACT_WORK_ORIGIN_AND_FROZEN_ACTOR_REQUIRED');
      const runs = readIndustryFirstDayWorkState(facts.workState).runs.filter(
        (r) =>
          r.source.countryId === command.countryId &&
          r.source.facilityId === actual.data.facilityId &&
          r.terms.runId === actual.data.runId &&
          r.frame.command.fingerprint ===
            actual.data.schedule.commandFingerprint,
      );
      if (
        runs.length !== 1 ||
        !same(runs[0]!.terms.maximumExpense, workOriginal.maximumExpense)
      )
        invalid('ACTUAL_RUN_CEILING_REQUIRED');
      const source = projectPostwarIndustryOperatingWageSource({
        baseline: facts.baseline,
        firstdayOriginal: facts.firstdayOriginal,
        workData: actual.data,
        maximumExpense: runs[0]!.terms.maximumExpense,
      });
      const beneficiary =
        readPostwarBeneficialHousingRentMixedOriginalsForSocialBase(
          facts.baseline,
        )?.filter((r) => r.countryId === command.countryId);
      if (beneficiary && beneficiary.length !== 1)
        invalid('EXACT_BENEFICIAL_MAPPING_REQUIRED');
      const result = prepareIndustryOperatingWagePayment({
        command,
        source,
        work,
        state: facts.wageState,
        financial: facts.financial,
        ...(beneficiary ? { beneficialReceipt: beneficiary[0]! } : {}),
        eventSequence: (BigInt(head.eventSequence) + 1n).toString(),
        observedAtReal,
        sha256Hex: sha,
      });
      const binding = Object.freeze({
        schemaVersion: 'industry-operating-wage-source-binding-v1',
        purpose: INDUSTRY_OPERATING_WAGE_SOURCE_PURPOSE,
        commandFingerprint: command.fingerprint,
        head,
        seedPins: facts.seedPins,
        firstdaySourceRef: facts.firstdayOriginal.sourceRef,
        firstdaySourceSha256: facts.firstdayOriginal.rawSha256,
        workEventId: p.workEventId,
        workEventFingerprint: p.workEventFingerprint,
        workCommandFingerprint: actual.frame.command.fingerprint,
        completePrefixFingerprint: facts.prefixFingerprint,
        pageChainFingerprint: facts.pageChainFingerprint,
        stateBeforeHash: hash(facts.wageState),
        financialBeforeHash: hash(facts.financial),
        sourceHash: hash(source),
        registeredControl:
          registered === null
            ? null
            : {
                registrationRef: registered.registrationRef,
                clockSourceRef: registered.clockSourceRef,
                controlSourceRef: registered.controlSourceRef,
                soleConsumerRef: registered.soleConsumerRef,
                simTime: registered.simTime,
              },
        lease: { holderId: lease.holderId, fencingToken: lease.fencingToken },
      });
      return { head, lease, binding, result };
    } finally {
      releasePostwarIndustryRunStateContext(context);
    }
  }
  const port: Readonly<IndustryOperatingWageSourceCommitProtectionPort> =
    Object.freeze({
      assertCurrentFrom(
        tx: SqlExecutor,
        request: Readonly<IndustryOperatingWageSourceCommitRequest>,
      ): Promise<Readonly<IndustryOperatingWageSourceCommitAudit>> {
        return track(async () => {
          if (active.has(tx)) invalid('NON_REENTRANT_GUARD_REQUIRED');
          active.add(tx);
          try {
            if (
              request.phase !== 'BEFORE_EVENTS' ||
              request.purpose !== INDUSTRY_OPERATING_WAGE_SOURCE_PURPOSE ||
              request.commitAuthorization !== null ||
              !Array.isArray(request.currentMaterializations) ||
              request.currentMaterializations.length
            )
              invalid('EXACT_AUTOMATIC_NULL_PROOF_REQUIRED');
            const fresh = await derive(
              tx,
              request.command,
              request.observedAtReal,
              true,
            );
            if (
              !same(fresh.head, request.currentHead) ||
              !same(fresh.binding, request.readBinding) ||
              !same(fresh.result.step.transition, request.transition) ||
              !same(
                fresh.result.step.financialPostingBatches,
                request.financialPostingBatches,
              ) ||
              !same(request.inventoryPostings, [])
            )
              invalid('FRESH_SOURCE_TRANSITION_AND_JOURNAL_REQUIRED');
            return Object.freeze({
              status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
              purpose: INDUSTRY_OPERATING_WAGE_SOURCE_PURPOSE,
              commandFingerprint: request.command.fingerprint,
              currentHead: fresh.head,
              readBindingFingerprint: hash(fresh.binding),
              protectionMode: 'HELD_SOURCE_GUARDS',
            });
          } finally {
            active.delete(tx);
          }
        });
      },
    });
  const candidateFactory: Readonly<AtomicTransitionCandidateFactory> =
    Object.freeze({
      prepare(
        request: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
      ): Promise<AtomicTransitionDraft> {
        return track(() =>
          bound.database.transaction(async (tx) => {
            if (request.commitAuthorization !== null)
              invalid('AUTOMATIC_WAGE_CANNOT_BORROW_USER_PROOF');
            const fresh = await derive(
              tx,
              request.command,
              request.observedAtReal,
              true,
            );
            return Object.freeze({
              transition: fresh.result.step.transition,
              financialPostingBatches:
                fresh.result.step.financialPostingBatches,
              inventoryPostings: [],
              outboxMessages: [],
              currentMaterializations: [],
              receipt: createFinalCommandReceipt({
                command: request.command,
                transition: fresh.result.step.transition,
                outcome: 'COMMITTED',
                reasonCode: null,
                simTime: request.command.simTime,
                recordedAtReal: request.observedAtReal,
              }),
              authorityKind: 'VERSIONED_AUTOMATIC',
              commitAssertion: createWorldWriterCommitAssertion(
                fresh.lease,
                fresh.head.worldVersion,
              ),
              observedAtReal: request.observedAtReal,
              officeOperatingSourceReadBinding: fresh.binding,
            });
          }),
        );
      },
    });
  const runtime: Readonly<PostwarIndustryOperatingWageRuntime> = Object.freeze({
    worldId: world,
    candidateFactory,
    sourceCommitProtectionPort: port,
    publishDue(
      request: IndustryWagePublicationScope,
    ): Promise<
      Readonly<{ status: 'QUEUED' | 'FINAL'; command: CanonicalCommand }>
    > {
      return track(async () => {
        const publicationDb = input.publicationDatabase;
        if (
          !publicationDb ||
          publicationDb === bound.database ||
          publicationDb === bound.socialConnection.database
        )
          invalid('SEPARATE_FIXED_INDUSTRY_PUBLICATION_DATABASE_REQUIRED');
        const recover = () =>
          publicationDb.transaction(async (pub) => {
            await pub.query('set transaction isolation level repeatable read');
            const rows = await pub.query<Record<string, unknown>>(
              'select * from world_v2.read_postwar_industry_wage_publication($1,$2,$3,$4)',
              [world, request.countryId, request.facilityId, request.runId],
            );
            if (rows.rows.length > 1)
              invalid('UNIQUE_WORK_PUBLICATION_REQUIRED');
            return rows.rows[0] ? published(rows.rows[0]) : null;
          });
        const prior = await recover();
        if (prior) return prior;
        return bound.database.transaction(async (tx) => {
          const at = bound.clock.nowReal();
          await roles.withSourceReaderFrom(tx, () =>
            lockPostwarSourceRevocationFencesFrom(tx, { worldId: world }),
          );
          const lease = await tx.query<{ n: string }>(
            'select fencing_token::text n from world_v2.world_writer_lease where world_id=$1 and holder_id=$2 and lease_expires_at_real>$3::timestamptz for share',
            [world, bound.workerId, at],
          );
          if (lease.rows.length !== 1) invalid('ACTUAL_CURRENT_LEASE_REQUIRED');
          const h = await tx.query<{
            world_version: string;
            event_sequence: string;
          }>(
            'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
            [world],
          );
          if (h.rows.length !== 1 || !h.rows[0])
            invalid('ACTUAL_PUBLICATION_HEAD_REQUIRED');
          const head = {
            worldVersion: h.rows[0].world_version,
            eventSequence: h.rows[0].event_sequence,
          };
          const state = scope
              ? await readRegisteredWorldExecutionFrom(tx, bound.clock)
              : null,
            sim = state ? state.simTime : await bound.clock.simTime(world);
          const ctx = await readPostwarIndustryRunStateFrom(tx, {
            socialConnection: bound.socialConnection,
            worldId: world,
            countryId: request.countryId,
            facilityId: request.facilityId,
            expectedHead: head,
          });
          let command: CanonicalCommand;
          try {
            const facts = consumePostwarIndustryRunStateFrom(tx, ctx),
              works = facts.completedWorks.filter((t) => {
                const d = readIndustryCompletedWork(t).data;
                return (
                  d.countryId === request.countryId &&
                  d.facilityId === request.facilityId &&
                  d.runId === request.runId
                );
              });
            if (works.length !== 1)
              invalid('UNIQUE_ACTUAL_COMPLETED_RUN_WORK_REQUIRED');
            const work = readIndustryCompletedWork(works[0]!),
              event = work.frame.events[0]!;
            const key = canonicalSha256(
              canonicalSerialize([
                world,
                facts.seedPins.seedFingerprint,
                event.fingerprint,
                INDUSTRY_OPERATING_WAGE_POLICY.version,
              ]),
              sha,
            )
              .slice(7)
              .toUpperCase();
            command = parseCanonicalCommand(
              {
                schemaVersion: 'command-v1',
                commandId: 'COMMAND_INDUSTRY_WAGE_' + key,
                commandType: INDUSTRY_OPERATING_WAGE_COMMAND,
                worldId: world,
                countryId: request.countryId,
                officeId: null,
                actorId: work.frame.command.actorId,
                authSubject: work.frame.command.authSubject,
                expectedWorldVersion: head.worldVersion,
                idempotencyKey: 'INDUSTRY_WAGE_' + key,
                correlationId: work.frame.command.correlationId,
                simTime: sim,
                submittedAtReal: at,
                payload: {
                  schemaVersion: 'industry-operating-wage-payment-v1',
                  workEventId: event.eventId,
                  workEventFingerprint: event.fingerprint,
                  policyVersion: INDUSTRY_OPERATING_WAGE_POLICY.version,
                },
              },
              sha,
            );
          } finally {
            releasePostwarIndustryRunStateContext(ctx);
          }
          // Re-derive from fresh fixed WORK/source data on this same held tx.
          await derive(tx, command, at, false, true);
          return publicationDb.transaction(async (pub) => {
            await pub.query('set transaction isolation level repeatable read');
            const rows = await pub.query<Record<string, unknown>>(
              'select * from world_v2.publish_postwar_industry_wage_due($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9)',
              [
                world,
                intent(command).workEventId,
                intent(command).workEventFingerprint,
                bound.workerId,
                head.worldVersion,
                head.eventSequence,
                at,
                sim,
                command.fingerprint,
              ],
            );
            if (rows.rows.length !== 1 || !rows.rows[0])
              invalid('ONE_ACTUAL_SQL_WAGE_PUBLICATION_REQUIRED');
            const result = published(rows.rows[0]);
            if (result.command.fingerprint !== command.fingerprint)
              invalid('SQL_ISSUER_DIFFERS_FROM_CURRENT_CORE_WORK');
            return result;
          });
        });
      });
    },
    assertSourceBeforeClaim(request: {
      command: CanonicalCommand;
      observedAtReal: string;
    }): Promise<void> {
      return track(() =>
        bound.database.transaction(async (tx) => {
          await derive(tx, request.command, request.observedAtReal, false);
        }),
      );
    },
    close(): Promise<void> {
      if (closing) return closing;
      closed = true;
      closing = (async () => {
        await Promise.allSettled([...pending]);
        ports.delete(port);
        runtimes.delete(runtime);
      })();
      return closing;
    },
  });
  ports.set(port, live);
  runtimes.set(runtime, live);
  return runtime;
}
