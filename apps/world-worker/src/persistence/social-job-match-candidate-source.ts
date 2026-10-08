// Isolated SOC-1 increment. No startup/dispatcher/automatic publisher registration.
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  EVENT_SCHEMA_VERSION,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createOutboxMessage,
  createWorldWriterCommitAssertion,
  isCommitAuthorizationProof,
  parseAuthoritativeEvent,
  parseSocialEmploymentServiceCommand,
  parseWorldWriterLease,
  prepareSocialEmploymentServiceOperation,
  reauthorizeCommitAuthorizationProof,
  SOCIAL_EMPLOYMENT_SERVICE_CAPABILITY,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_EVENT,
  workerId,
  type CanonicalCommand,
  type CanonicalSha256,
  type Sha256Hex,
  type SocialEmploymentReadFacts,
  type SocialEmploymentServiceState,
  type WorldWriterCommitAssertion,
} from '@econmind/core';
import {
  consumeLabourSocialOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from '../preparation/official-labour-social-opening-adoption.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from './atomic-transition-repository.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

/** Root implements this inside its ONE admitted-opening + committed-event reader.
 * Materializations/projections are not allowed as authoritative inputs. TEST_ONLY
 * fixtures implement this same port but never grant official readiness. */
export interface SocialEmploymentRuntimeSnapshotReader {
  readFrom(input: {
    readonly transaction: SqlExecutor;
    readonly command: CanonicalCommand;
    readonly headWorldVersion: string;
    readonly headEventSequence: string;
    readonly observedAtReal: string;
  }): Promise<
    | { readonly status: 'MISSING_OPERATING_STATE' }
    | {
        readonly status: 'REPLAYED';
        readonly provenance: 'ADMITTED_OPENING_AND_EVENTS' | 'TEST_ONLY';
        readonly openingSeedHash: CanonicalSha256;
        readonly worldId: string;
        readonly headWorldVersion: string;
        readonly headEventSequence: string;
        readonly state: SocialEmploymentServiceState;
        readonly stateHash: CanonicalSha256;
        readonly readFacts: SocialEmploymentReadFacts;
        readonly readFactsHash: CanonicalSha256;
      }
  >;
}

/** Required server-only Root port: real durable publisher/grant, original-plan
 * causation, versioned rule and clock boundary. Payload syntax is NOT authority.
 * There is deliberately no default implementation or boolean override. */
export interface SocialAutomaticJobMatchAuthorityPort {
  assertFrom(input: {
    readonly transaction: SqlExecutor;
    readonly command: CanonicalCommand;
    readonly originalPlan: CanonicalCommand;
    readonly headWorldVersion: string;
    readonly headEventSequence: string;
    readonly observedAtReal: string;
  }): Promise<void>;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `SOC-1: ${message}`,
  );
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.length)
    invalid('Missing durable text');
  return value;
}
function integer(value: unknown): string {
  const v = string(value);
  if (!/^(?:0|[1-9]\d*)$/u.test(v)) invalid('Invalid durable integer');
  return v;
}
function timestamp(value: unknown): string {
  const v = value instanceof Date ? value.toISOString() : string(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    invalid('Canonical server Real time required');
  return v;
}
function only<T>(rows: readonly T[], label: string): T {
  if (rows.length !== 1 || rows[0] === undefined)
    invalid(`${label} must resolve exactly once`);
  return rows[0];
}
const hash = (value: unknown, digest: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(value), digest);
function frozenCopy<T>(value: T): T {
  const copy: T = JSON.parse(canonicalSerialize(value));
  function freeze(v: unknown): void {
    if (v && typeof v === 'object') {
      for (const child of Object.values(v)) freeze(child);
      Object.freeze(v);
    }
  }
  freeze(copy);
  return copy;
}
type Row = Readonly<Record<string, unknown>>;

export class SocialOperatingStateMissingError extends Error {
  readonly status = 'NOT_READY' as const;
  readonly seedAdmissionReady = false;
  readonly gaps: ReturnType<typeof consumeLabourSocialOpeningAdoption>['gaps'];
  constructor(adoption: OfficialLabourSocialOpeningAdoption) {
    const opening = consumeLabourSocialOpeningAdoption(adoption);
    super(
      'SOC-1 operating state is missing; approved capacity/targets do not invent unemployment, positions, wages or service slots',
    );
    this.name = 'SocialOperatingStateMissingError';
    this.gaps = opening.gaps;
  }
}

declare const privatePreparation: unique symbol;
export interface SocialJobMatchPreparation {
  readonly [privatePreparation]: true;
  readonly command: CanonicalCommand;
  readonly state: SocialEmploymentServiceState;
  readonly readFacts: SocialEmploymentReadFacts;
  readonly commitAssertion: WorldWriterCommitAssertion;
  readonly eventSequence: string;
  readonly observedAtReal: string;
}
const preparations = new WeakSet<object>();

/** Read-only existing SQL, submission→original plan→lease→head→queue lock order.
 * Root retains claim algorithm, reader, intake, dispatcher, publisher and writes. */
export interface SqlSocialJobMatchCandidateSourceInput {
  /** Server construction mode, never an intent field or automatic grant. */
  readonly mode: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL';
  readonly database: SqlDatabase;
  readonly workerId: string;
  readonly sha256Hex: Sha256Hex;
  readonly openingAdoption: OfficialLabourSocialOpeningAdoption;
  readonly snapshotReader: SocialEmploymentRuntimeSnapshotReader | null;
  readonly automaticAuthority: SocialAutomaticJobMatchAuthorityPort | null;
}
export class SqlSocialJobMatchCandidateSource {
  readonly #input: SqlSocialJobMatchCandidateSourceInput;
  readonly #lineage: DurableV08LedgerLineageReader;
  constructor(input: SqlSocialJobMatchCandidateSourceInput) {
    if (!['OFFICIAL_RUNTIME', 'TEST_ONLY_LOCAL'].includes(input.mode))
      invalid('Explicit server construction mode required');
    this.#input = { ...input, workerId: workerId(input.workerId) };
    // Genuine existing public opening consumer; no recreated approval checker.
    consumeLabourSocialOpeningAdoption(input.openingAdoption);
    this.#lineage = new DurableV08LedgerLineageReader(input);
  }
  async load(input: {
    readonly command: CanonicalCommand;
    readonly observedAtReal: string;
  }): Promise<SocialJobMatchPreparation> {
    const observedAtReal = timestamp(input.observedAtReal),
      digest = this.#input.sha256Hex;
    const parsed = parseSocialEmploymentServiceCommand(input.command, digest);
    if (this.#input.snapshotReader === null)
      throw new SocialOperatingStateMissingError(this.#input.openingAdoption);
    const reader = this.#input.snapshotReader;
    return this.#input.database.transaction(async (transaction) => {
      only(
        (
          await transaction.query<Row>(
            'select command_id from world_v2.command_submission where world_id=$1 and command_id=$2 for update',
            [input.command.worldId, input.command.commandId],
          )
        ).rows,
        'Submission lock',
      );
      const command = await this.#lineage.readCommandFrom(
        transaction,
        input.command.worldId,
        input.command.commandId,
      );
      if (canonicalSerialize(command) !== canonicalSerialize(input.command))
        invalid('Mixed durable canonical submission');
      let originalPlan: CanonicalCommand | null = null;
      if (parsed.kind === 'MATCH') {
        originalPlan = await this.#lineage.readCommandFrom(
          transaction,
          command.worldId,
          parsed.intent.planCommandId,
        );
        const original = parseSocialEmploymentServiceCommand(
          originalPlan,
          digest,
        );
        if (
          original.kind !== 'PLAN' ||
          originalPlan.fingerprint !== parsed.intent.planFingerprint ||
          originalPlan.countryId !== command.countryId ||
          original.intent.dueDayIndex !== parsed.intent.dueDayIndex
        )
          invalid('Due does not bind original durable plan');
      }
      const l = only(
        (
          await transaction.query<Row>(
            `select world_id, holder_id, fencing_token::text, acquired_at_real, renewed_at_real, lease_expires_at_real
         from world_v2.world_writer_lease where world_id=$1 and holder_id=$2 and lease_expires_at_real>$3::timestamptz for share`,
            [command.worldId, this.#input.workerId, observedAtReal],
          )
        ).rows,
        'Active writer lease',
      );
      const lease = parseWorldWriterLease({
        schemaVersion: 'world-writer-lease-v1',
        worldId: string(l.world_id),
        holderId: string(l.holder_id),
        fencingToken: string(l.fencing_token),
        acquiredAtReal: timestamp(l.acquired_at_real),
        renewedAtReal: timestamp(l.renewed_at_real),
        expiresAtReal: timestamp(l.lease_expires_at_real),
      });
      if (
        lease.worldId !== command.worldId ||
        lease.holderId !== this.#input.workerId ||
        lease.expiresAtReal <= observedAtReal ||
        lease.renewedAtReal > observedAtReal
      )
        invalid('Mixed or stale writer lease');
      const h = only(
        (
          await transaction.query<Row>(
            'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
            [command.worldId],
          )
        ).rows,
        'Head',
      );
      const headWorldVersion = integer(h.world_version),
        headEventSequence = integer(h.event_sequence);
      if (command.expectedWorldVersion !== headWorldVersion)
        invalid('Stale expected WorldVersion');
      const q = only(
        (
          await transaction.query<Row>(
            `select s.command_type,q.authority_kind,q.queue_state,q.available_at_sim_time::text,q.claimed_by,q.claim_fencing_token::text
         from world_v2.command_queue q
         join world_v2.command_submission s on s.world_id=q.world_id and s.command_id=q.command_id
         where q.world_id=$1 and q.command_id=$2 for share of q`,
            [command.worldId, command.commandId],
          )
        ).rows,
        'Claimed queue',
      );
      if (
        q.command_type !== command.commandType ||
        q.authority_kind !==
          (parsed.kind === 'PLAN'
            ? 'DISCRETIONARY_USER'
            : 'VERSIONED_AUTOMATIC') ||
        q.queue_state !== 'CLAIMED' ||
        q.claimed_by !== lease.holderId ||
        q.claim_fencing_token !== lease.fencingToken ||
        BigInt(integer(q.available_at_sim_time)) > command.simTime.ticks
      )
        invalid('Wrong authority/claim/fence or unavailable SimTime');
      const snapshot = frozenCopy(
        await reader.readFrom({
          transaction,
          command,
          headWorldVersion,
          headEventSequence,
          observedAtReal,
        }),
      );
      if (snapshot.status === 'MISSING_OPERATING_STATE')
        throw new SocialOperatingStateMissingError(this.#input.openingAdoption);
      if (
        (snapshot.provenance !== 'ADMITTED_OPENING_AND_EVENTS' &&
          !(
            this.#input.mode === 'TEST_ONLY_LOCAL' &&
            snapshot.provenance === 'TEST_ONLY'
          )) ||
        !/^sha256:[0-9a-f]{64}$/u.test(snapshot.openingSeedHash) ||
        snapshot.worldId !== command.worldId ||
        snapshot.headWorldVersion !== headWorldVersion ||
        snapshot.headEventSequence !== headEventSequence ||
        hash(snapshot.state, digest) !== snapshot.stateHash ||
        hash(snapshot.readFacts, digest) !== snapshot.readFactsHash ||
        snapshot.state.worldId !== command.worldId ||
        snapshot.readFacts.simTime !== command.simTime.toCanonicalValue()
      )
        invalid('Reader returned mixed head/world/hash/clock snapshot');
      if (originalPlan !== null) {
        const plan = snapshot.state.plans.find(
          (p) => p.planCommandId === originalPlan!.commandId,
        );
        if (!plan || plan.planFingerprint !== originalPlan.fingerprint)
          invalid('Replayed state lacks durable causal plan');
        if (this.#input.automaticAuthority === null)
          invalid('Root automatic authority is not connected');
        await this.#input.automaticAuthority.assertFrom({
          transaction,
          command,
          originalPlan,
          headWorldVersion,
          headEventSequence,
          observedAtReal,
        });
      }
      const preparation = Object.freeze({
        command,
        state: snapshot.state,
        readFacts: snapshot.readFacts,
        commitAssertion: createWorldWriterCommitAssertion(
          lease,
          headWorldVersion,
        ),
        eventSequence: (BigInt(headEventSequence) + 1n).toString(),
        observedAtReal,
      }) as SocialJobMatchPreparation;
      preparations.add(preparation);
      return preparation;
    });
  }
}

/** Real Core matching/events and existing atomic shape, not persistence/activation. */
export function prepareSocialJobMatchAtomicDraft(input: {
  readonly preparation: SocialJobMatchPreparation;
  readonly sha256Hex: Sha256Hex;
}): AtomicTransitionDraft {
  const p = input.preparation;
  if (!preparations.has(p))
    invalid('Preparation was not issued by the server SQL source');
  const parsed = parseSocialEmploymentServiceCommand(
    p.command,
    input.sha256Hex,
  );
  const operation = prepareSocialEmploymentServiceOperation({
    command: p.command,
    state: p.state,
    readFacts: p.readFacts,
    sha256Hex: input.sha256Hex,
  });
  if (operation.source !== 'APPLIED')
    invalid('Final command/operation replay cannot become a fresh candidate');
  const after = (BigInt(p.command.expectedWorldVersion!) + 1n).toString();
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: `SOCIAL_EVENT_${p.command.commandId}`,
      eventType:
        parsed.kind === 'PLAN'
          ? SOCIAL_SERVICE_PLAN_EVENT
          : SOCIAL_JOB_MATCH_EVENT,
      worldId: p.command.worldId,
      causationCommandId: p.command.commandId,
      correlationId: p.command.correlationId,
      worldVersion: after,
      sequence: p.eventSequence,
      simTime: p.command.simTime.toCanonicalValue(),
      recordedAtReal: p.observedAtReal,
      correctsEventId: null,
      payload: operation.eventPayload,
    },
    input.sha256Hex,
  );
  const transition = createAuthoritativeTransition({
    command: p.command,
    worldVersionBefore: p.command.expectedWorldVersion!,
    worldVersionAfter: after,
    events: [event],
  });
  const payload = {
    schemaVersion: 'social-job-match-outbox-v1',
    eventId: event.eventId,
    result: operation.result,
  };
  return Object.freeze({
    transition,
    inventoryPostings: Object.freeze([]),
    financialPostingBatches: Object.freeze([]),
    receipt: createFinalCommandReceipt({
      command: p.command,
      outcome: 'COMMITTED',
      reasonCode: null,
      transition,
      simTime: p.command.simTime,
      recordedAtReal: p.observedAtReal,
    }),
    outboxMessages: Object.freeze([
      createOutboxMessage({
        messageId: `SOCIAL_OUTBOX_${p.command.commandId}`,
        worldId: p.command.worldId,
        commandId: p.command.commandId,
        eventId: event.eventId,
        payload,
        payloadHash: hash(payload, input.sha256Hex),
        availableAtSimTime: p.command.simTime,
      }),
    ]),
    currentMaterializations: Object.freeze([
      { key: 'SOCIAL_EMPLOYMENT_SERVICE', payload: operation.state },
    ]),
    authorityKind:
      parsed.kind === 'PLAN' ? 'DISCRETIONARY_USER' : 'VERSIONED_AUTOMATIC',
    commitAssertion: p.commitAssertion,
    observedAtReal: p.observedAtReal,
  });
}

export function createSocialJobMatchCandidateFactory(input: {
  readonly source: SqlSocialJobMatchCandidateSource;
  readonly sha256Hex: Sha256Hex;
}): AtomicTransitionCandidateFactory {
  return Object.freeze({
    async prepare(
      candidate: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
    ) {
      const parsed = parseSocialEmploymentServiceCommand(
        candidate.command,
        input.sha256Hex,
      );
      if (parsed.kind === 'PLAN') {
        const proof = candidate.commitAuthorization;
        if (
          !isCommitAuthorizationProof(proof) ||
          proof.capability !== SOCIAL_EMPLOYMENT_SERVICE_CAPABILITY ||
          proof.officeId !== 'SOCIAL' ||
          proof.commandId !== candidate.command.commandId ||
          proof.commandFingerprint !== candidate.command.fingerprint
        )
          invalid('Genuine command-bound Social labour proof required');
        await reauthorizeCommitAuthorizationProof(proof);
      } else if (candidate.commitAuthorization !== null)
        invalid('Automatic match cannot use discretionary proof');
      const preparation = await input.source.load(candidate);
      if (parsed.kind === 'PLAN')
        await reauthorizeCommitAuthorizationProof(
          candidate.commitAuthorization,
        );
      return prepareSocialJobMatchAtomicDraft({
        preparation,
        sha256Hex: input.sha256Hex,
      });
    },
  });
}
