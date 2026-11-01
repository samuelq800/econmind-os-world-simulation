/** Fixed local/CI automatic rent runtime. Opening rights and a Clock value are
 * never admission/publication authority. Fresh SQL source and automatic grant
 * locks are mandatory before every calculation and again in Atomic's same tx.
 * No source, lease, clock, consumer, grant or production registration is created.
 */
import { createHash } from 'node:crypto';
import {
  BENEFICIAL_HOUSING_RENT_COMMAND,
  BENEFICIAL_HOUSING_RENT_EVENT,
  EVENT_SCHEMA_VERSION,
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  validateCanonicalCommand,
  createBeneficialHousingRentState,
  synchronizeBeneficialHousingRentState,
  prepareBeneficialHousingRent,
  settleBeneficialHousingRent,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  parseWorldWriterLease,
  createWorldWriterCommitAssertion,
  worldId,
  SimTime,
  type CanonicalCommand,
  type AuthoritativeTransition,
  type DecisionResultHead,
  type FinancialPostingBatch,
  type InventoryLedgerPosting,
  type OpeningSeed,
  type BeneficialHousingReclassificationReceipt,
  type BeneficialHousingRentState,
  type FinancialLedgerState,
} from '@econmind/core';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from './atomic-transition-repository.js';
import { decodeBoundedPostwarCanonicalPrefix } from './bounded-postwar-canonical-prefix.js';
import { decodeBoundedPostwarJournal } from './bounded-postwar-fx-postings.js';
import {
  prepareBeneficialHousingRentSource,
  consumeBeneficialHousingRentSource,
  retireBeneficialHousingRentSource,
  type PreparedBeneficialHousingRentSource,
  type BeneficialHousingRentSourceData,
} from './postwar-beneficial-housing-rent-source.js';
import {
  BENEFICIAL_RENT_SOURCE_READER,
  lockBeneficialRentHeaderFrom,
  lockBeneficialRentOriginalFrom,
  invalidBeneficialRentSource as invalid,
  exactRentText as text,
} from './postgres-postwar-beneficial-housing-rent-originals.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import type { DurableConsumptionClock } from '../preparation/durable-command-consumption.js';
import { replayPostwarBeneficialHousingRentMixedFrom } from './postwar-beneficial-housing-rent-mixed-source.js';
export const BENEFICIAL_HOUSING_RENT_SOURCE_PURPOSE =
  'POSTWAR_BENEFICIAL_HOUSING_RENT_SOURCE_RECHECK_V1' as const;
export interface BeneficialHousingRentSourceCommitRequest {
  readonly phase: 'BEFORE_EVENTS';
  readonly purpose: typeof BENEFICIAL_HOUSING_RENT_SOURCE_PURPOSE;
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
export interface BeneficialHousingRentSourceCommitAudit {
  readonly status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
  readonly purpose: typeof BENEFICIAL_HOUSING_RENT_SOURCE_PURPOSE;
  readonly commandFingerprint: string;
  readonly currentHead: DecisionResultHead;
  readonly readBindingFingerprint: string;
  readonly protectionMode: 'HELD_SOURCE_GUARDS';
}
export interface BeneficialHousingRentSourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<BeneficialHousingRentSourceCommitRequest>,
  ): Promise<Readonly<BeneficialHousingRentSourceCommitAudit>>;
}
const ports = new WeakSet<object>(),
  runtimes = new WeakSet<object>();
const runtimeSources = new WeakMap<
  object,
  {
    readonly worldId: string;
    readonly workerId: string;
    readonly workerRole: string;
    readonly database: SqlDatabase;
    readonly clock: DurableConsumptionClock;
    readonly clockBindingRef: string;
    readonly live: () => boolean;
    readonly preparation: () => PreparedBeneficialHousingRentSource;
  }
>();
/** Server-only immutable DATA and transport identity, not source authority. */
export function readPostwarBeneficialHousingRentRuntimeResources(
  value: Readonly<PostwarBeneficialHousingRentRuntime>,
  world: string,
): Readonly<{
  worldId: string;
  workerId: string;
  workerRole: string;
  database: SqlDatabase;
  clock: DurableConsumptionClock;
  clockBindingRef: string;
}> {
  const data = runtimeSources.get(value);
  if (!data || data.worldId !== world || !data.live())
    invalid('GENUINE_LIVE_RENT_RUNTIME_REQUIRED');
  return Object.freeze({
    worldId: data.worldId,
    workerId: data.workerId,
    workerRole: data.workerRole,
    database: data.database,
    clock: data.clock,
    clockBindingRef: data.clockBindingRef,
  });
}
export function readPostwarBeneficialHousingRentSourcePreparation(
  value: Readonly<PostwarBeneficialHousingRentRuntime>,
  world: string,
): PreparedBeneficialHousingRentSource {
  const data = runtimeSources.get(value);
  if (!data || data.worldId !== world || !data.live())
    invalid('GENUINE_LIVE_RENT_RUNTIME_REQUIRED');
  return data.preparation();
}

export const isPostwarBeneficialHousingRentSourceCommitProtectionPort = (
  value: unknown,
): value is BeneficialHousingRentSourceCommitProtectionPort =>
  !!value && typeof value === 'object' && ports.has(value);
export const isPostwarBeneficialHousingRentRuntime = (
  value: unknown,
): value is PostwarBeneficialHousingRentRuntime =>
  !!value && typeof value === 'object' && runtimes.has(value);
export interface PostwarBeneficialHousingRentPreparation {
  readonly parentSeed: Readonly<OpeningSeed>;
  readonly seed: Readonly<OpeningSeed>;
  readonly receipts: readonly BeneficialHousingReclassificationReceipt[];
}
export interface PostwarBeneficialHousingRentCurrentReceipt {
  readonly classification: 'CORE_REPLAYED_RENT_RECEIPT_DATA_NOT_EXECUTION_AUTHORITY';
  readonly status: 'PAID' | 'UNPAID';
  readonly head: DecisionResultHead;
  readonly seedFingerprint: string;
  readonly registrationRef: string;
  readonly receipt: Readonly<BeneficialHousingRentState['paid'][number]> | null;
}
export interface PostwarBeneficialHousingRentRuntime {
  readonly candidateFactory: AtomicTransitionCandidateFactory;
  readonly sourceCommitProtectionPort: BeneficialHousingRentSourceCommitProtectionPort;
  prepare(input: PostwarBeneficialHousingRentPreparation): Promise<void>;
  assertSourceBeforeClaim(input: {
    readonly command: CanonicalCommand;
    readonly observedAtReal: string;
  }): Promise<void>;
  readCurrentReceipt(input: {
    readonly countryId: string;
    readonly leaseId: string;
    readonly periodIndex: string;
  }): Promise<Readonly<PostwarBeneficialHousingRentCurrentReceipt>>;
  close(): Promise<void>;
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function intent(command: CanonicalCommand) {
  const c = validateCanonicalCommand(command, sha),
    p: unknown = JSON.parse(c.canonicalPayload);
  if (
    c.commandType !== BENEFICIAL_HOUSING_RENT_COMMAND ||
    c.officeId !== null ||
    !p ||
    typeof p !== 'object' ||
    Array.isArray(p)
  )
    invalid('EXACT_AUTOMATIC_RENT_FAMILY_REQUIRED');
  const r = p as Record<string, unknown>;
  if (
    Object.keys(r).sort().join('|') !==
      'genesisReceiptFingerprint|leaseId|periodIndex|schemaVersion' ||
    r.schemaVersion !== 'beneficial-housing-rent-command.v1'
  )
    invalid('EXACT_RENT_INTENT_REQUIRED');
  const period = text(r.periodIndex);
  if (!/^(?:0|[1-9]\d*)$/u.test(period))
    invalid('CANONICAL_RENT_PERIOD_REQUIRED');
  return {
    command: c,
    leaseId: text(r.leaseId),
    periodIndex: period,
    receiptFingerprint: text(r.genesisReceiptFingerprint),
  };
}
const WORKER_ROLE_QUERY = `select current_user as role_name,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,pg_has_role(current_user,'world_v2_beneficial_rent_source_reader','MEMBER')as source_member,pg_has_role(current_user,'world_v2_beneficial_rent_source_owner','MEMBER')as owner_member,pg_has_role(current_user,'world_v2_beneficial_rent_source_publisher','MEMBER')as publisher_member from pg_roles r where r.rolname=current_user`;
function roleScope(workerRole: string) {
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(workerRole) ||
    workerRole.startsWith('pg_') ||
    [
      'postgres',
      'anon',
      'authenticated',
      'service_role',
      BENEFICIAL_RENT_SOURCE_READER,
      'world_v2_beneficial_rent_source_owner',
      'world_v2_beneficial_rent_source_publisher',
    ].includes(workerRole)
  )
    invalid('SEPARATED_WORKER_ROLE_REQUIRED');
  async function check(tx: SqlExecutor) {
    const r = await tx.query<Record<string, unknown>>(WORKER_ROLE_QUERY),
      v = r.rows[0];
    if (
      r.rows.length !== 1 ||
      !v ||
      v.role_name !== workerRole ||
      v.rolsuper !== false ||
      v.rolbypassrls !== false ||
      v.rolcreaterole !== false ||
      v.rolcreatedb !== false ||
      v.rolreplication !== false ||
      v.source_member !== true ||
      v.owner_member !== false ||
      v.publisher_member !== false
    )
      invalid('ACTUAL_SEPARATED_WORKER_ROLE_REQUIRED');
  }
  return async <T>(tx: SqlExecutor, read: () => Promise<T>): Promise<T> => {
    await check(tx);
    await tx.query('set local role ' + BENEFICIAL_RENT_SOURCE_READER);
    let result: { ok: true; value: T } | { ok: false; error: unknown };
    try {
      result = { ok: true, value: await read() };
    } catch (error) {
      result = { ok: false, error };
    }
    try {
      await tx.query('set local role ' + workerRole);
      await check(tx);
    } catch (error) {
      if (!result.ok)
        throw new AggregateError(
          [result.error, error],
          'rent role restoration failed; transaction must rollback',
          { cause: error },
        );
      throw error;
    }
    if (!result.ok) throw result.error;
    return result.value;
  };
}
function checkBase(
  b: BeneficialHousingRentSourceData,
  row: Readonly<Record<string, unknown>>,
) {
  if (
    row.world_id !== b.worldId ||
    row.seed_id !== b.seedId ||
    row.seed_fingerprint !== b.seedFingerprint ||
    row.parent_seed_fingerprint !== b.parentSeedFingerprint ||
    row.canonical_seed_sha256 !== b.canonicalSeedSha256 ||
    row.bundle_sha256 !== b.bundleSha256
  )
    invalid('EXACT_ADMITTED_SOURCE_BINDING_REQUIRED');
}
function replay(
  b: BeneficialHousingRentSourceData,
  prefix: ReturnType<typeof decodeBoundedPostwarCanonicalPrefix>,
) {
  let financial: Readonly<FinancialLedgerState> = b.openingFinancial,
    lastSim = 0n;
  const states = new Map(
    b.receipts.map((r) => [r.countryId, createBeneficialHousingRentState(r)]),
  );
  for (const frame of prefix.frames) {
    // A mixed replay integration must explicitly derive every additional family.
    // Until installed, no non-rent frame can be hidden/rebased or treated as no-op.
    if (frame.command.commandType !== BENEFICIAL_HOUSING_RENT_COMMAND)
      invalid('COMPLETE_MIXED_RENT_REPLAY_NOT_INSTALLED');
    const p = intent(frame.command),
      receipt = b.receipts.find((r) => r.countryId === frame.command.countryId);
    if (
      !receipt ||
      p.receiptFingerprint !== receipt.fingerprint ||
      frame.command.simTime.ticks < lastSim
    )
      invalid('HISTORICAL_RENT_SCOPE_OR_TIME_REQUIRED');
    const state = synchronizeBeneficialHousingRentState(
      { receipt, state: states.get(receipt.countryId)!, financial },
      sha,
    );
    const applied = settleBeneficialHousingRent(
      {
        receipt,
        state,
        financialBefore: financial,
        command: frame.command,
        transition: frame.transition,
        leaseId: p.leaseId,
        periodIndex: p.periodIndex,
      },
      sha,
    );
    if (
      applied.outcome !== 'APPLIED' ||
      !applied.posting ||
      !same(frame.inventoryPostings, []) ||
      !same(frame.financialPostingBatches, [applied.posting])
    )
      invalid('EXACT_HISTORICAL_RENT_EFFECT_REQUIRED');
    financial = applied.financial;
    states.set(receipt.countryId, applied.state);
    lastSim = frame.command.simTime.ticks;
  }
  if (financial.worldVersion !== prefix.head.worldVersion)
    invalid('COMPLETE_FINANCIAL_HEAD_REQUIRED');
  return { financial, states, lastSim };
}
export function createPostwarBeneficialHousingRentRuntime(config: {
  readonly database: SqlDatabase;
  readonly worldId: string;
  readonly workerId: string;
  readonly workerRole: string;
  readonly environment: 'local' | 'ci';
  readonly clock: DurableConsumptionClock;
  readonly clockBindingRef: string;
}): Readonly<PostwarBeneficialHousingRentRuntime> {
  const world = worldId(config.worldId),
    withReader = roleScope(config.workerRole);
  if (config.environment !== 'local' && config.environment !== 'ci')
    invalid('FORMAL_CLOCK_SOURCE_CONTROL_NOT_REGISTERED');
  let prepared: PreparedBeneficialHousingRentSource | undefined,
    closed = false,
    closing: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>(),
    active = new WeakSet<object>();
  const run = <T>(op: () => Promise<T>): Promise<T> => {
    if (closed) return Promise.reject(Error('BENEFICIAL_RENT_RUNTIME_RETIRED'));
    const p = Promise.resolve().then(op);
    pending.add(p);
    void p.then(
      () => pending.delete(p),
      () => pending.delete(p),
    );
    return p;
  };
  const base = () => {
    if (!prepared) invalid('SOURCE_NOT_PREPARED');
    return consumeBeneficialHousingRentSource(prepared);
  };
  async function currentFrom(
    tx: SqlExecutor,
    countryId: string,
    b: BeneficialHousingRentSourceData,
    prefix: ReturnType<typeof decodeBoundedPostwarCanonicalPrefix>,
    admissionRef?: string,
  ) {
    if (!prepared) invalid('SOURCE_NOT_PREPARED');
    const mixed = await replayPostwarBeneficialHousingRentMixedFrom({
      runtime,
      preparation: prepared,
      executor: tx,
      countryId,
      prefix,
      ...(admissionRef === undefined ? {} : { admissionRef }),
    });
    if (!mixed) return replay(b, prefix);
    const origins = mixed.beneficialHousingRentOrigins;
    if (
      !origins ||
      origins.length !== b.receipts.length ||
      origins.some(
        (o) =>
          !b.receipts.some(
            (r) =>
              r.countryId === o.countryId &&
              r.fingerprint === o.receipt.fingerprint,
          ),
      ) ||
      mixed.financial.worldVersion !== prefix.head.worldVersion
    )
      invalid('GENUINE_COMPLETE_RENT_DOMAIN_AND_FINANCIAL_HEAD_REQUIRED');
    return {
      financial: mixed.financial,
      states: new Map(origins.map((o) => [o.countryId, o.state])),
      lastSim: prefix.frames.at(-1)?.command.simTime.ticks ?? 0n,
    };
  }
  async function derive(
    tx: SqlExecutor,
    command: CanonicalCommand,
    observedAtReal: string,
  ) {
    const p = intent(command),
      b = base();
    if (p.command.worldId !== world) invalid('EXACT_WORLD_REQUIRED');
    const clockSim = await config.clock.simTime(world);
    SimTime.fromTicks(clockSim);
    if (clockSim !== p.command.simTime.toCanonicalValue())
      invalid('EXACT_BOUND_HOST_CLOCK_REQUIRED');
    const read = await withReader(tx, async () => {
      const original = await lockBeneficialRentOriginalFrom(tx, {
        worldId: world,
        countryId: p.command.countryId,
        commandId: p.command.commandId,
        commandFingerprint: p.command.fingerprint,
        observedAtReal,
      });
      checkBase(b, {
        world_id: original.worldId,
        seed_id: original.seedId,
        seed_fingerprint: original.seedFingerprint,
        parent_seed_fingerprint: original.parentSeedFingerprint,
        canonical_seed_sha256: original.canonicalSeedSha256,
        bundle_sha256: original.bundleSha256,
      });
      if (
        original.clockSimTime !== clockSim ||
        original.clockBindingRef !== config.clockBindingRef ||
        original.workerId !== config.workerId ||
        original.receiptFingerprint !== p.receiptFingerprint
      )
        invalid('EXACT_PUBLISHED_CLOCK_AND_RIGHTS_REQUIRED');
      const prefix = decodeBoundedPostwarCanonicalPrefix({
        worldId: world,
        prefixRow: original.prefixRow,
        journal: decodeBoundedPostwarJournal(original.journal),
      });
      if (
        !same(prefix.head, original.head) ||
        p.command.expectedWorldVersion !== original.head.worldVersion
      )
        invalid('EXACT_HELD_CURRENT_HEAD_REQUIRED');
      return { original, prefix };
    });
    const current = await currentFrom(
        tx,
        p.command.countryId,
        b,
        read.prefix,
        read.original.admissionRef,
      ),
      receipt = b.receipts.find((r) => r.countryId === p.command.countryId);
    if (!receipt || receipt.fingerprint !== p.receiptFingerprint)
      invalid('EXACT_COUNTRY_RIGHTS_ORIGINAL_REQUIRED');
    if (p.command.simTime.ticks < current.lastSim)
      invalid('COMMAND_PRECEDES_ACTUAL_PREFIX');
    const state = synchronizeBeneficialHousingRentState(
      {
        receipt,
        state: current.states.get(receipt.countryId)!,
        financial: current.financial,
      },
      sha,
    );
    const quote = prepareBeneficialHousingRent(
      {
        receipt,
        state,
        financialBefore: current.financial,
        leaseId: p.leaseId,
        periodIndex: p.periodIndex,
        simTime: p.command.simTime,
      },
      sha,
    );
    const head: DecisionResultHead = Object.freeze({
      worldId: world,
      ...read.prefix.head,
    });
    const event = parseAuthoritativeEvent(
      {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventId: 'BENEFICIAL_RENT_EVENT_' + p.command.commandId,
        eventType: BENEFICIAL_HOUSING_RENT_EVENT,
        worldId: world,
        causationCommandId: p.command.commandId,
        correlationId: p.command.correlationId,
        worldVersion: (BigInt(head.worldVersion) + 1n).toString(),
        sequence: (BigInt(head.eventSequence) + 1n).toString(),
        simTime: p.command.simTime.toCanonicalValue(),
        recordedAtReal: observedAtReal,
        correctsEventId: null,
        payload: quote.eventPayload,
      },
      sha,
    );
    const transition = createAuthoritativeTransition({
      command: p.command,
      events: [event],
      worldVersionBefore: head.worldVersion,
      worldVersionAfter: event.worldVersion,
    });
    const applied = settleBeneficialHousingRent(
      {
        receipt,
        state,
        financialBefore: current.financial,
        command: p.command,
        transition,
        leaseId: p.leaseId,
        periodIndex: p.periodIndex,
      },
      sha,
    );
    if (applied.outcome !== 'APPLIED' || !applied.posting)
      invalid('FRESH_CORE_RENT_POSTING_REQUIRED');
    const binding = freeze({
      schemaVersion: 'beneficial-housing-rent-source-binding-v1',
      purpose: BENEFICIAL_HOUSING_RENT_SOURCE_PURPOSE,
      commandFingerprint: p.command.fingerprint,
      head,
      registrationRef: read.original.registrationRef,
      admissionRef: read.original.admissionRef,
      seedFingerprint: b.seedFingerprint,
      parentSeedFingerprint: b.parentSeedFingerprint,
      bundleSha256: b.bundleSha256,
      receiptFingerprint: receipt.fingerprint,
      publicationRef: read.original.publicationRef,
      clockBindingRef: read.original.clockBindingRef,
      workerId: config.workerId,
      clockSimTime: clockSim,
      completePrefixFingerprint: hash(read.prefix.frames),
      financialBeforeHash: hash(current.financial),
      stateBeforeHash: hash(state),
    });
    return {
      head,
      binding,
      transition,
      posting: applied.posting,
      state: applied.state,
      financial: applied.financial,
    };
  }
  const port: BeneficialHousingRentSourceCommitProtectionPort = Object.freeze({
    async assertCurrentFrom(
      tx: SqlExecutor,
      request: Readonly<BeneficialHousingRentSourceCommitRequest>,
    ): Promise<Readonly<BeneficialHousingRentSourceCommitAudit>> {
      return run(async () => {
        if (active.has(tx)) invalid('NON_REENTRANT_SOURCE_GUARD_REQUIRED');
        active.add(tx);
        try {
          if (
            request.phase !== 'BEFORE_EVENTS' ||
            request.purpose !== BENEFICIAL_HOUSING_RENT_SOURCE_PURPOSE ||
            request.commitAuthorization !== null ||
            !Array.isArray(request.currentMaterializations) ||
            request.currentMaterializations.length !== 0
          )
            invalid('EXACT_AUTOMATIC_NULL_PROOF_CUTOFF_REQUIRED');
          const fresh = await derive(
            tx,
            request.command,
            request.observedAtReal,
          );
          if (
            !same(request.currentHead, fresh.head) ||
            !same(request.readBinding, fresh.binding) ||
            !same(request.transition, fresh.transition) ||
            !same(request.inventoryPostings, []) ||
            !same(request.financialPostingBatches, [fresh.posting])
          )
            invalid('FRESH_SOURCE_TRANSITION_AND_POSTINGS_REQUIRED');
          return Object.freeze({
            status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
            purpose: BENEFICIAL_HOUSING_RENT_SOURCE_PURPOSE,
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
  ports.add(port);
  const candidateFactory: AtomicTransitionCandidateFactory = Object.freeze({
    async prepare(
      request: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
    ): Promise<AtomicTransitionDraft> {
      return run(() =>
        config.database.transaction(async (tx) => {
          if (request.commitAuthorization !== null)
            invalid('AUTOMATIC_RENT_CANNOT_BORROW_USER_PROOF');
          const fresh = await derive(
            tx,
            request.command,
            request.observedAtReal,
          );
          const l = await tx.query<Record<string, unknown>>(
            'select world_id,holder_id,fencing_token::text,acquired_at_real,renewed_at_real,lease_expires_at_real from world_v2.world_writer_lease where world_id=$1 and holder_id=$2 and lease_expires_at_real>$3::timestamptz for share',
            [world, config.workerId, request.observedAtReal],
          );
          if (l.rows.length !== 1) invalid('ACTUAL_WRITER_LEASE_REQUIRED');
          const row = l.rows[0]!;
          const time = (v: unknown) =>
            v instanceof Date ? v.toISOString() : text(v);
          const lease = parseWorldWriterLease({
            schemaVersion: 'world-writer-lease-v1',
            worldId: text(row.world_id),
            holderId: text(row.holder_id),
            fencingToken: text(row.fencing_token),
            acquiredAtReal: time(row.acquired_at_real),
            renewedAtReal: time(row.renewed_at_real),
            expiresAtReal: time(row.lease_expires_at_real),
          });
          const q = await tx.query<Record<string, unknown>>(
            'select authority_kind,queue_state,claimed_by,claim_fencing_token::text,available_at_sim_time::text from world_v2.command_queue where world_id=$1 and command_id=$2 for share',
            [world, request.command.commandId],
          );
          const claim = q.rows[0];
          if (
            q.rows.length !== 1 ||
            !claim ||
            claim.authority_kind !== 'VERSIONED_AUTOMATIC' ||
            claim.queue_state !== 'CLAIMED' ||
            claim.claimed_by !== lease.holderId ||
            claim.claim_fencing_token !== lease.fencingToken ||
            BigInt(text(claim.available_at_sim_time)) >
              request.command.simTime.ticks
          )
            invalid('ACTUAL_AUTOMATIC_CLAIM_AND_FENCE_REQUIRED');
          return freeze({
            transition: fresh.transition,
            financialPostingBatches: [fresh.posting],
            inventoryPostings: [],
            outboxMessages: [],
            currentMaterializations: [],
            receipt: createFinalCommandReceipt({
              command: request.command,
              transition: fresh.transition,
              outcome: 'COMMITTED',
              reasonCode: null,
              simTime: request.command.simTime,
              recordedAtReal: request.observedAtReal,
            }),
            authorityKind: 'VERSIONED_AUTOMATIC',
            commitAssertion: createWorldWriterCommitAssertion(
              lease,
              fresh.head.worldVersion,
            ),
            observedAtReal: request.observedAtReal,
            officeOperatingSourceReadBinding: fresh.binding,
          });
        }),
      );
    },
  });
  const runtime: Readonly<PostwarBeneficialHousingRentRuntime> = Object.freeze({
    candidateFactory,
    sourceCommitProtectionPort: port,
    prepare(input: PostwarBeneficialHousingRentPreparation): Promise<void> {
      return run(async () => {
        if (prepared) invalid('SOURCE_ALREADY_PREPARED');
        const token = prepareBeneficialHousingRentSource(input);
        try {
          const b = consumeBeneficialHousingRentSource(token);
          if (b.worldId !== world) invalid('EXACT_WORLD_REQUIRED');
          await config.database.transaction((tx) =>
            withReader(tx, async () => {
              const row = await lockBeneficialRentHeaderFrom(
                tx,
                world,
                b.receipts[0]!.countryId,
              );
              checkBase(b, row);
            }),
          );
          if (closed) invalid('RUNTIME_RETIRED_DURING_PREPARATION');
          prepared = token;
        } finally {
          if (prepared !== token) retireBeneficialHousingRentSource(token);
        }
      });
    },
    assertSourceBeforeClaim(
      input: Parameters<
        PostwarBeneficialHousingRentRuntime['assertSourceBeforeClaim']
      >[0],
    ): Promise<void> {
      return run(() =>
        config.database.transaction(async (tx) => {
          await derive(tx, input.command, input.observedAtReal);
        }),
      );
    },
    readCurrentReceipt(
      input: Parameters<
        PostwarBeneficialHousingRentRuntime['readCurrentReceipt']
      >[0],
    ): Promise<Readonly<PostwarBeneficialHousingRentCurrentReceipt>> {
      return run(() =>
        config.database.transaction(async (tx) => {
          const b = base();
          const { row, prefix } = await withReader(tx, async () => {
            const r = await tx.query<Record<string, unknown>>(
              'select * from world_v2.read_postwar_beneficial_rent_current($1,$2)',
              [world, input.countryId],
            );
            if (r.rows.length !== 1)
              invalid('REGISTERED_ADMITTED_SOURCE_MISSING');
            const row = r.rows[0]!;
            checkBase(b, row);
            const prefix = decodeBoundedPostwarCanonicalPrefix({
              worldId: world,
              prefixRow: row.prefix,
              journal: decodeBoundedPostwarJournal(row.journal),
            });
            return { row, prefix };
          });
          // Restore the actual worker before any fixed sibling-source delegation.
          const current = await currentFrom(tx, input.countryId, b, prefix),
            rights = b.receipts.find((r) => r.countryId === input.countryId);
          if (
            !rights ||
            !rights.leases.some((l) => l.leaseId === input.leaseId) ||
            !/^(?:0|[1-9]\d*)$/u.test(input.periodIndex)
          )
            invalid('EXACT_LEASE_PERIOD_REQUIRED');
          const paid =
            current.states
              .get(input.countryId)!
              .paid.find(
                (p) =>
                  p.leaseId === input.leaseId &&
                  p.periodIndex === input.periodIndex,
              ) ?? null;
          return freeze<Readonly<PostwarBeneficialHousingRentCurrentReceipt>>({
            classification:
              'CORE_REPLAYED_RENT_RECEIPT_DATA_NOT_EXECUTION_AUTHORITY',
            status: paid ? 'PAID' : 'UNPAID',
            head: { worldId: world, ...prefix.head },
            seedFingerprint: b.seedFingerprint,
            registrationRef: text(row.registration_ref),
            receipt: paid,
          });
        }),
      );
    },
    close() {
      if (closing) return closing;
      closed = true;
      closing = Promise.allSettled([...pending]).then(() => {
        if (prepared) retireBeneficialHousingRentSource(prepared);
        prepared = undefined;
      });
      return closing;
    },
  });
  runtimes.add(runtime);
  runtimeSources.set(
    runtime,
    Object.freeze({
      worldId: world,
      workerId: config.workerId,
      workerRole: config.workerRole,
      database: config.database,
      clock: config.clock,
      clockBindingRef: config.clockBindingRef,
      live: () => !closed,
      preparation: () => {
        base();
        if (!prepared) invalid('SOURCE_NOT_PREPARED');
        return prepared;
      },
    }),
  );
  return runtime;
}
