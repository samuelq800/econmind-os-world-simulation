import {
  DOMAIN_ERROR_CODES,
  DomainError,
  SimTime,
  assertAuthorizationRevocationCurrent,
  bindAuthoritativeTransition,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  commandId,
  createFinancialPostingBatch,
  createInventoryPosting,
  eventId,
  idempotencyKey,
  isCommitAuthorizationProof,
  parseCanonicalCommand,
  reauthorizeCommitAuthorizationProof,
  validateCanonicalCommand,
  validateFinalReceiptForCommand,
  worldId,
  workerId,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type CommitAuthorizationProof,
  type CommandLifecyclePersistencePort,
  type FinalCommandOutcome,
  type FinalCommandReceipt,
  type FinancialPostingBatch,
  type InventoryPosting,
  type OutboxMessage,
  type QueueAuthorityKind,
  type Sha256Hex,
  type WorldWriterCommitAssertion,
} from '@econmind/core';

import type { SqlDatabase, SqlExecutor } from './sql-database.js';

const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MATERIALIZATION_KEY = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;

export interface CurrentMaterializationInput {
  readonly key: string;
  readonly payload: unknown;
}

export interface PreparedCurrentMaterialization {
  readonly key: string;
  readonly canonicalPayload: string;
  readonly payloadHash: `sha256:${string}`;
}

export interface AtomicTransitionDraft {
  readonly transition: AuthoritativeTransition;
  readonly inventoryPostings: readonly InventoryPosting[];
  readonly financialPostingBatches: readonly FinancialPostingBatch[];
  readonly receipt: FinalCommandReceipt;
  readonly outboxMessages: readonly OutboxMessage[];
  readonly currentMaterializations: readonly CurrentMaterializationInput[];
  readonly authorityKind: QueueAuthorityKind;
  readonly commitAssertion: WorldWriterCommitAssertion;
  readonly observedAtReal: string;
}

declare const privateAtomicCandidate: unique symbol;

export interface PrivateAtomicTransitionCandidate {
  readonly [privateAtomicCandidate]: true;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly inventoryPostings: readonly InventoryPosting[];
  readonly financialPostingBatches: readonly FinancialPostingBatch[];
  readonly receipt: FinalCommandReceipt;
  readonly outboxMessages: readonly OutboxMessage[];
  readonly currentMaterializations: readonly PreparedCurrentMaterialization[];
  readonly authorityKind: QueueAuthorityKind;
  readonly commitAuthorization: CommitAuthorizationProof | null;
  readonly commitAssertion: WorldWriterCommitAssertion;
  readonly observedAtReal: string;
}

const privateCandidates = new WeakSet<object>();

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function canonicalInteger(
  value: string,
  label: string,
  positive = false,
): string {
  if (!(positive ? POSITIVE_INTEGER : NON_NEGATIVE_INTEGER).test(value)) {
    invalid(`${label} must be a canonical integer`);
  }
  return value;
}

function assertCommitAuthorization(input: {
  readonly command: CanonicalCommand;
  readonly authorityKind: QueueAuthorityKind;
  readonly proof: CommitAuthorizationProof | null;
}): void {
  if (input.authorityKind === 'VERSIONED_AUTOMATIC') {
    if (input.proof !== null) {
      invalid('Versioned automatic work cannot present user authorization');
    }
    return;
  }
  if (
    !isCommitAuthorizationProof(input.proof) ||
    input.command.officeId === null ||
    input.proof.commandId !== input.command.commandId ||
    input.proof.commandFingerprint !== input.command.fingerprint ||
    input.proof.worldId !== input.command.worldId ||
    input.proof.actorId !== input.command.actorId ||
    input.proof.authSubject !== input.command.authSubject ||
    input.proof.countryId !== input.command.countryId ||
    input.proof.officeId !== input.command.officeId
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      'Discretionary commit requires current Command-bound authorization proof',
    );
  }
}

function assertCommitAssertion(input: {
  readonly assertion: WorldWriterCommitAssertion;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
}): void {
  if (
    input.assertion.worldId !== input.command.worldId ||
    input.assertion.expectedWorldVersion !==
      input.transition.worldVersionBefore ||
    !POSITIVE_INTEGER.test(input.assertion.fencingToken) ||
    input.assertion.holderId.length === 0
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.WRITER_LEASE_INVALID,
      'Commit assertion is not bound to the candidate WorldVersion transition',
    );
  }
}

function validateInventoryPosting(input: {
  readonly posting: InventoryPosting;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly sha256Hex: Sha256Hex;
}): Readonly<InventoryPosting> {
  const verified = createInventoryPosting(
    {
      schemaVersion: input.posting.schemaVersion,
      postingId: input.posting.postingId,
      worldId: input.posting.worldId,
      causationCommandId: input.posting.causationCommandId,
      causationEventIds: input.posting.causationEventIds,
      worldVersionBefore: input.posting.worldVersionBefore,
      worldVersionAfter: input.posting.worldVersionAfter,
      simTime: input.posting.simTime,
      operation: input.posting.operation,
      entries: input.posting.entries,
      command: input.command,
      transition: input.transition,
    },
    input.sha256Hex,
  );
  if (canonicalSerialize(verified) !== canonicalSerialize(input.posting)) {
    invalid('Inventory Posting evidence is forged or non-canonical');
  }
  return verified;
}

function validateFinancialPosting(input: {
  readonly batch: FinancialPostingBatch;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly sha256Hex: Sha256Hex;
}): Readonly<FinancialPostingBatch> {
  const verified = createFinancialPostingBatch(
    {
      schemaVersion: input.batch.schemaVersion,
      batchId: input.batch.batchId,
      worldId: input.batch.worldId,
      causationCommandId: input.batch.causationCommandId,
      causationEventIds: input.batch.causationEventIds,
      worldVersionBefore: input.batch.worldVersionBefore,
      worldVersionAfter: input.batch.worldVersionAfter,
      simTime: input.batch.simTime,
      settlementCurrency: input.batch.settlementCurrency,
      legs: input.batch.legs,
      command: input.command,
      transition: input.transition,
    },
    input.sha256Hex,
  );
  if (canonicalSerialize(verified) !== canonicalSerialize(input.batch)) {
    invalid('Financial Posting evidence is forged or non-canonical');
  }
  return verified;
}

/**
 * The Posting fingerprint binds the canonical intent, not an object which
 * additionally contains that derived fingerprint. Persist that same intent so
 * the database can independently recompute the fingerprint binding.
 */
function canonicalPostingIntent(
  posting: InventoryPosting | FinancialPostingBatch,
): string {
  const { fingerprint: _fingerprint, ...intent } = posting;
  return canonicalSerialize(intent);
}

function validateOutboxMessage(input: {
  readonly message: OutboxMessage;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly sha256Hex: Sha256Hex;
}): Readonly<OutboxMessage> {
  let payload: unknown;
  try {
    payload = JSON.parse(input.message.canonicalPayload);
  } catch {
    invalid('Outbox canonical payload must be valid JSON');
  }
  if (
    input.message.worldId !== input.command.worldId ||
    input.message.commandId !== input.command.commandId ||
    (input.message.eventId !== null &&
      !input.transition.eventIds.includes(input.message.eventId)) ||
    input.message.state !== 'PENDING' ||
    input.message.attemptCount !== '0' ||
    canonicalSerialize(payload) !== input.message.canonicalPayload ||
    canonicalSha256(canonicalHashInput(payload), input.sha256Hex) !==
      input.message.payloadHash
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.OUTBOX_STATE_INVALID,
      'Outbox fact is not canonical or bound to the committed transition',
    );
  }
  return input.message;
}

export function prepareAtomicTransitionCandidate(input: {
  readonly command: CanonicalCommand;
  readonly commitAuthorization: CommitAuthorizationProof | null;
  readonly draft: AtomicTransitionDraft;
  readonly sha256Hex: Sha256Hex;
}): Readonly<PrivateAtomicTransitionCandidate> {
  const command = validateCanonicalCommand(input.command, input.sha256Hex);
  const binding = bindAuthoritativeTransition(
    { command, transition: input.draft.transition },
    input.sha256Hex,
  );
  const transition = input.draft.transition;
  const receipt = validateFinalReceiptForCommand({
    command,
    receipt: input.draft.receipt,
    transition,
  });
  if (
    receipt.outcome !== 'COMMITTED' ||
    receipt.simTime.ticks !== binding.simTime.ticks
  ) {
    invalid(
      'Atomic candidate requires a committed receipt at transition SimTime',
    );
  }
  if (!RFC3339_MILLISECONDS.test(input.draft.observedAtReal)) {
    invalid(
      'Atomic commit observation time must be canonical RFC3339 milliseconds',
    );
  }
  assertCommitAuthorization({
    command,
    authorityKind: input.draft.authorityKind,
    proof: input.commitAuthorization,
  });
  assertCommitAssertion({
    assertion: input.draft.commitAssertion,
    command,
    transition,
  });

  const postingIds = new Set<string>();
  const inventoryPostings = input.draft.inventoryPostings.map((posting) => {
    if (postingIds.has(posting.postingId)) {
      invalid('Atomic candidate repeats an Inventory Posting identity');
    }
    postingIds.add(posting.postingId);
    return validateInventoryPosting({
      posting,
      command,
      transition,
      sha256Hex: input.sha256Hex,
    });
  });
  const batchIds = new Set<string>();
  const financialPostingBatches = input.draft.financialPostingBatches.map(
    (batch) => {
      if (batchIds.has(batch.batchId)) {
        invalid('Atomic candidate repeats a Financial Posting identity');
      }
      batchIds.add(batch.batchId);
      return validateFinancialPosting({
        batch,
        command,
        transition,
        sha256Hex: input.sha256Hex,
      });
    },
  );
  const messageIds = new Set<string>();
  const outboxMessages = input.draft.outboxMessages.map((message) => {
    if (messageIds.has(message.messageId)) {
      invalid('Atomic candidate repeats an outbox identity');
    }
    messageIds.add(message.messageId);
    return validateOutboxMessage({
      message,
      command,
      transition,
      sha256Hex: input.sha256Hex,
    });
  });
  const materializationKeys = new Set<string>();
  const currentMaterializations = input.draft.currentMaterializations.map(
    (materialization) => {
      if (
        !MATERIALIZATION_KEY.test(materialization.key) ||
        materializationKeys.has(materialization.key)
      ) {
        invalid('Current materialization keys must be canonical and unique');
      }
      materializationKeys.add(materialization.key);
      const canonicalPayload = canonicalSerialize(materialization.payload);
      return Object.freeze({
        key: materialization.key,
        canonicalPayload,
        payloadHash: canonicalSha256(
          canonicalHashInput(materialization.payload),
          input.sha256Hex,
        ),
      });
    },
  );

  const candidate = Object.freeze({
    command,
    transition,
    inventoryPostings: Object.freeze(inventoryPostings),
    financialPostingBatches: Object.freeze(financialPostingBatches),
    receipt,
    outboxMessages: Object.freeze(outboxMessages),
    currentMaterializations: Object.freeze(currentMaterializations),
    authorityKind: input.draft.authorityKind,
    commitAuthorization: input.commitAuthorization,
    commitAssertion: input.draft.commitAssertion,
    observedAtReal: input.draft.observedAtReal,
  }) as PrivateAtomicTransitionCandidate;
  privateCandidates.add(candidate);
  return candidate;
}

export interface AtomicCommitAuthorizationGuard {
  /**
   * Must resolve current server-held authorization inside this transaction.
   * A null proof with `REVOKED` means the guard must prove the discretionary
   * capability is still absent; it is not a no-op authorization bypass.
   */
  assertCurrent(
    transaction: SqlExecutor,
    input: Readonly<{
      command: CanonicalCommand;
      authorityKind: QueueAuthorityKind;
      proof: CommitAuthorizationProof | null;
      expected: 'AUTHORIZED' | 'REVOKED' | 'NOT_APPLICABLE';
      revokedReceipt?: FinalCommandReceipt;
    }>,
  ): Promise<void>;
}

/**
 * Concrete ADR-20 guard backed exclusively by the server-held authorization
 * resolver metadata captured when Core issued the proof/rejection. Callers
 * must invoke it from the authoritative SqlDatabase transaction callback.
 */
export const serverHeldAuthorizationGuard: AtomicCommitAuthorizationGuard =
  Object.freeze({
    async assertCurrent(
      _transaction: Parameters<
        AtomicCommitAuthorizationGuard['assertCurrent']
      >[0],
      input: Parameters<AtomicCommitAuthorizationGuard['assertCurrent']>[1],
    ): Promise<void> {
      if (input.expected === 'NOT_APPLICABLE') {
        if (
          input.authorityKind !== 'VERSIONED_AUTOMATIC' ||
          input.proof !== null ||
          input.revokedReceipt !== undefined
        ) {
          throw new DomainError(
            DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
            'Automatic authority cannot carry discretionary authorization evidence',
          );
        }
        return;
      }
      if (input.authorityKind !== 'DISCRETIONARY_USER') {
        throw new DomainError(
          DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
          'Discretionary authorization is required at this transaction cutoff',
        );
      }
      if (input.expected === 'AUTHORIZED') {
        await reauthorizeCommitAuthorizationProof(input.proof);
        return;
      }
      await assertAuthorizationRevocationCurrent(input.revokedReceipt);
    },
  });

export type AtomicCommitCheckpoint =
  | 'SUBMISSION_LOCKED'
  | 'COMMIT_GUARD_PASSED'
  | 'AUTHORIZATION_RECHECKED'
  | 'BEFORE_EVENTS'
  | 'AFTER_EVENTS'
  | 'BEFORE_INVENTORY_POSTINGS'
  | 'AFTER_INVENTORY_POSTINGS'
  | 'BEFORE_FINANCIAL_POSTINGS'
  | 'AFTER_FINANCIAL_POSTINGS'
  | 'BEFORE_AUTHORIZATION_AUDIT'
  | 'AFTER_AUTHORIZATION_AUDIT'
  | 'BEFORE_RECEIPT'
  | 'AFTER_RECEIPT'
  | 'BEFORE_MATERIALIZATIONS'
  | 'AFTER_MATERIALIZATIONS'
  | 'BEFORE_OUTBOX'
  | 'AFTER_OUTBOX'
  | 'BEFORE_QUEUE_FINALIZATION'
  | 'AFTER_QUEUE_FINALIZATION'
  | 'BEFORE_WORLD_HEAD'
  | 'AFTER_WORLD_HEAD'
  | 'BEFORE_TRANSACTION_COMMIT';

export interface AtomicCommitFaultInjector {
  hit(checkpoint: AtomicCommitCheckpoint): void | Promise<void>;
}

const noFaults: AtomicCommitFaultInjector = Object.freeze({
  hit: () => undefined,
});

export type AtomicCommitSource =
  'NEW_COMMIT' | 'EXISTING_COMMIT' | 'RECOVERED_AFTER_UNKNOWN_ACKNOWLEDGEMENT';

export interface AtomicCommitResult {
  readonly source: AtomicCommitSource;
  readonly receipt: FinalCommandReceipt;
  readonly transition: AuthoritativeTransition;
}

interface SubmissionRow {
  readonly actor_id: unknown;
  readonly auth_subject: unknown;
  readonly command_id: unknown;
  readonly command_fingerprint: unknown;
  readonly command_type: unknown;
  readonly canonical_payload: unknown;
  readonly correlation_id: unknown;
  readonly country_id: unknown;
  readonly idempotency_key: unknown;
  readonly expected_world_version: unknown;
  readonly office_id: unknown;
  readonly payload_sha256: unknown;
  readonly schema_version: unknown;
  readonly sim_time: unknown;
  readonly submitted_at_real: unknown;
  readonly world_id: unknown;
}

interface ReceiptRow {
  readonly world_id: unknown;
  readonly command_id: unknown;
  readonly idempotency_key: unknown;
  readonly schema_version: unknown;
  readonly command_fingerprint: unknown;
  readonly outcome: unknown;
  readonly reason_code: unknown;
  readonly transition_id: unknown;
  readonly world_version_before: unknown;
  readonly world_version_after: unknown;
  readonly sim_time: unknown;
  readonly event_ids: unknown;
  readonly recorded_at_real: unknown;
}

interface CommitGuardRow {
  readonly world_version: unknown;
  readonly event_sequence: unknown;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`Database ${label} must be a non-empty string`);
  }
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null;
  return text(value, label);
}

function databaseInteger(
  value: unknown,
  label: string,
  positive = false,
): string {
  const rendered =
    typeof value === 'bigint' || typeof value === 'number'
      ? String(value)
      : text(value, label);
  return canonicalInteger(rendered, label, positive);
}

function timestamp(value: unknown, label: string): string {
  const rendered =
    value instanceof Date ? value.toISOString() : text(value, label);
  if (!RFC3339_MILLISECONDS.test(rendered)) {
    invalid(`Database ${label} must be canonical RFC3339 milliseconds`);
  }
  return rendered;
}

function eventIdsFromDatabase(
  value: unknown,
): readonly ReturnType<typeof eventId>[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      invalid('Database receipt Event IDs must be JSON');
    }
  }
  if (!Array.isArray(parsed)) {
    invalid('Database receipt Event IDs must be an array');
  }
  return Object.freeze(
    parsed.map((identity) => eventId(text(identity, 'receipt event ID'))),
  );
}

function parseReceiptRow(
  row: ReceiptRow,
  command: CanonicalCommand,
): Readonly<FinalCommandReceipt> {
  const outcome = text(row.outcome, 'receipt outcome');
  if (!['COMMITTED', 'REJECTED', 'AUTHORIZATION_REVOKED'].includes(outcome)) {
    invalid('Database receipt outcome is unsupported');
  }
  const receipt = Object.freeze({
    schemaVersion: text(row.schema_version, 'receipt schema version'),
    worldId: worldId(text(row.world_id, 'receipt World ID')),
    commandId: commandId(text(row.command_id, 'receipt Command ID')),
    idempotencyKey:
      row.idempotency_key === null
        ? null
        : idempotencyKey(text(row.idempotency_key, 'receipt idempotency key')),
    commandFingerprint: text(
      row.command_fingerprint,
      'receipt Command fingerprint',
    ) as `sha256:${string}`,
    outcome: outcome as FinalCommandOutcome,
    reasonCode: nullableText(row.reason_code, 'receipt reason code'),
    transitionId:
      row.transition_id === null
        ? null
        : commandId(text(row.transition_id, 'receipt transition ID')),
    worldVersionBefore:
      row.world_version_before === null
        ? null
        : databaseInteger(
            row.world_version_before,
            'receipt WorldVersion before',
          ),
    worldVersionAfter:
      row.world_version_after === null
        ? null
        : databaseInteger(
            row.world_version_after,
            'receipt WorldVersion after',
            true,
          ),
    simTime: SimTime.fromTicks(
      databaseInteger(row.sim_time, 'receipt SimTime'),
    ),
    eventIds: eventIdsFromDatabase(row.event_ids),
    recordedAtReal: timestamp(row.recorded_at_real, 'receipt recorded time'),
  }) as FinalCommandReceipt;
  return validateFinalReceiptForCommand({ command, receipt });
}

const RECEIPT_SELECT = `select world_id,
       command_id,
       idempotency_key,
       schema_version,
       command_fingerprint,
       outcome,
       reason_code,
       transition_id,
       world_version_before,
       world_version_after,
       sim_time,
       event_ids,
       recorded_at_real
  from world_v2.command_receipt
 where world_id = $1
   and (
     command_id = $2
     or ($3::text is not null and idempotency_key = $3)
   )
 order by (command_id = $2) desc
 limit 1`;

async function readReceipt(
  executor: SqlExecutor,
  command: CanonicalCommand,
): Promise<Readonly<FinalCommandReceipt> | null> {
  const result = await executor.query<ReceiptRow>(RECEIPT_SELECT, [
    command.worldId,
    command.commandId,
    command.idempotencyKey,
  ]);
  const row = result.rows[0];
  return row === undefined ? null : parseReceiptRow(row, command);
}

function parseSubmissionRow(
  row: SubmissionRow,
  sha256Hex: Sha256Hex,
): Readonly<CanonicalCommand> {
  let payload: unknown;
  try {
    payload = JSON.parse(text(row.canonical_payload, 'Command payload'));
  } catch {
    invalid('Database Command payload must be valid JSON');
  }
  const command = parseCanonicalCommand(
    {
      actorId: text(row.actor_id, 'Command actor ID'),
      authSubject: text(row.auth_subject, 'Command auth subject'),
      commandId: text(row.command_id, 'Command ID'),
      commandType: text(row.command_type, 'Command type'),
      correlationId: text(row.correlation_id, 'Command correlation ID'),
      countryId: text(row.country_id, 'Command country ID'),
      expectedWorldVersion:
        row.expected_world_version === null
          ? null
          : databaseInteger(
              row.expected_world_version,
              'Command expected WorldVersion',
            ),
      idempotencyKey: nullableText(
        row.idempotency_key,
        'Command idempotency key',
      ),
      officeId: nullableText(row.office_id, 'Command Office ID'),
      payload,
      schemaVersion: text(row.schema_version, 'Command schema version'),
      simTime: databaseInteger(row.sim_time, 'Command SimTime'),
      submittedAtReal: timestamp(
        row.submitted_at_real,
        'Command submitted time',
      ),
      worldId: text(row.world_id, 'Command World ID'),
    },
    sha256Hex,
  );
  if (
    command.payloadHash !== text(row.payload_sha256, 'Command payload hash') ||
    command.fingerprint !== text(row.command_fingerprint, 'Command fingerprint')
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      'Durable Command hashes do not match canonical Command intent',
    );
  }
  return command;
}

async function lockAndValidateSubmission(
  transaction: SqlExecutor,
  identity: Readonly<{
    worldId: string;
    commandId: string;
    idempotencyKey: string | null;
  }>,
  sha256Hex: Sha256Hex,
  expectedCommand?: CanonicalCommand,
): Promise<Readonly<CanonicalCommand>> {
  const result = await transaction.query<SubmissionRow>(
    `select world_id,
            command_id,
            idempotency_key,
            command_type,
            schema_version,
            canonical_payload,
            payload_sha256,
            command_fingerprint,
            auth_subject,
            actor_id,
            country_id,
            office_id,
            expected_world_version,
            sim_time,
            correlation_id,
            submitted_at_real
       from world_v2.command_submission
      where world_id = $1
        and (
          command_id = $2
          or ($3::text is not null and idempotency_key = $3)
        )
      order by (command_id = $2) desc
      limit 1
      for update`,
    [identity.worldId, identity.commandId, identity.idempotencyKey],
  );
  const row = result.rows[0];
  if (row === undefined) {
    invalid('Atomic commit requires a durable accepted Command submission');
  }
  const command = parseSubmissionRow(row, sha256Hex);
  if (
    expectedCommand !== undefined &&
    canonicalSerialize(command) !== canonicalSerialize(expectedCommand)
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      'Durable Command identity is bound to different canonical intent',
    );
  }
  return command;
}

function requireOneRow(
  result: { readonly rowCount: number | null },
  label: string,
): void {
  if (result.rowCount !== 1) {
    invalid(`${label} did not affect exactly one authoritative row`);
  }
}

export class AtomicTransitionRepository {
  readonly #database: SqlDatabase;
  readonly #authorizationGuard: AtomicCommitAuthorizationGuard;
  readonly #workerId: string;
  readonly #sha256Hex: Sha256Hex;
  readonly #faultInjector: AtomicCommitFaultInjector;

  constructor(input: {
    readonly database: SqlDatabase;
    readonly authorizationGuard: AtomicCommitAuthorizationGuard;
    readonly workerId: string;
    readonly sha256Hex: Sha256Hex;
    readonly faultInjector?: AtomicCommitFaultInjector;
  }) {
    this.#database = input.database;
    this.#authorizationGuard = input.authorizationGuard;
    this.#workerId = workerId(input.workerId);
    this.#sha256Hex = input.sha256Hex;
    this.#faultInjector = input.faultInjector ?? noFaults;
  }

  async readFinalReceipt(
    command: CanonicalCommand,
  ): Promise<Readonly<FinalCommandReceipt> | null> {
    return readReceipt(this.#database, command);
  }

  async recordZeroEffectReceipt(
    receipt: FinalCommandReceipt,
  ): Promise<Readonly<FinalCommandReceipt>> {
    if (receipt.outcome === 'COMMITTED') {
      invalid('Zero-effect persistence cannot accept a committed receipt');
    }
    return this.#database.transaction(async (transaction) => {
      const command = await lockAndValidateSubmission(
        transaction,
        {
          worldId: receipt.worldId,
          commandId: receipt.commandId,
          idempotencyKey: receipt.idempotencyKey,
        },
        this.#sha256Hex,
      );
      validateFinalReceiptForCommand({ command, receipt });
      const existing = await readReceipt(transaction, command);
      if (existing !== null) return existing;
      if (receipt.outcome === 'AUTHORIZATION_REVOKED') {
        await this.#authorizationGuard.assertCurrent(transaction, {
          command,
          authorityKind: 'DISCRETIONARY_USER',
          proof: null,
          expected: 'REVOKED',
          revokedReceipt: receipt,
        });
      }
      await this.#insertReceipt(transaction, receipt);
      await this.#finalizeQueue(transaction, command, receipt.recordedAtReal);
      return receipt;
    });
  }

  async commit(
    candidate: PrivateAtomicTransitionCandidate,
  ): Promise<Readonly<AtomicCommitResult>> {
    if (!privateCandidates.has(candidate)) {
      invalid('Atomic repository accepts a validated private candidate only');
    }
    if (candidate.commitAssertion.holderId !== this.#workerId) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.WRITER_FENCE_STALE,
        'Candidate holder does not match this authoritative Worker',
      );
    }
    try {
      return await this.#database.transaction(async (transaction) => {
        await lockAndValidateSubmission(
          transaction,
          {
            worldId: candidate.command.worldId,
            commandId: candidate.command.commandId,
            idempotencyKey: candidate.command.idempotencyKey,
          },
          this.#sha256Hex,
          candidate.command,
        );
        await this.#faultInjector.hit('SUBMISSION_LOCKED');
        const existing = await readReceipt(transaction, candidate.command);
        if (existing !== null) {
          return this.#existingCommit(candidate, existing, 'EXISTING_COMMIT');
        }
        const head = await this.#assertDatabaseCommitGuard(
          transaction,
          candidate,
        );
        await this.#faultInjector.hit('COMMIT_GUARD_PASSED');
        await this.#authorizationGuard.assertCurrent(transaction, {
          command: candidate.command,
          authorityKind: candidate.authorityKind,
          proof: candidate.commitAuthorization,
          expected:
            candidate.authorityKind === 'DISCRETIONARY_USER'
              ? 'AUTHORIZED'
              : 'NOT_APPLICABLE',
        });
        await this.#faultInjector.hit('AUTHORIZATION_RECHECKED');
        await this.#faultInjector.hit('BEFORE_EVENTS');
        await this.#insertEvents(transaction, candidate, head.eventSequence);
        await this.#faultInjector.hit('AFTER_EVENTS');
        await this.#faultInjector.hit('BEFORE_INVENTORY_POSTINGS');
        await this.#insertInventoryPostings(transaction, candidate);
        await this.#faultInjector.hit('AFTER_INVENTORY_POSTINGS');
        await this.#faultInjector.hit('BEFORE_FINANCIAL_POSTINGS');
        await this.#insertFinancialPostingBatches(transaction, candidate);
        await this.#faultInjector.hit('AFTER_FINANCIAL_POSTINGS');
        await this.#faultInjector.hit('BEFORE_AUTHORIZATION_AUDIT');
        await this.#insertCommitAuthorization(transaction, candidate);
        await this.#faultInjector.hit('AFTER_AUTHORIZATION_AUDIT');
        await this.#faultInjector.hit('BEFORE_RECEIPT');
        await this.#insertReceipt(transaction, candidate.receipt);
        await this.#faultInjector.hit('AFTER_RECEIPT');
        await this.#faultInjector.hit('BEFORE_MATERIALIZATIONS');
        await this.#upsertMaterializations(transaction, candidate);
        await this.#faultInjector.hit('AFTER_MATERIALIZATIONS');
        await this.#faultInjector.hit('BEFORE_OUTBOX');
        await this.#insertOutbox(transaction, candidate);
        await this.#faultInjector.hit('AFTER_OUTBOX');
        await this.#faultInjector.hit('BEFORE_QUEUE_FINALIZATION');
        await this.#finalizeQueue(
          transaction,
          candidate.command,
          candidate.receipt.recordedAtReal,
        );
        await this.#faultInjector.hit('AFTER_QUEUE_FINALIZATION');
        await this.#faultInjector.hit('BEFORE_WORLD_HEAD');
        await this.#advanceWorldHead(
          transaction,
          candidate,
          head.eventSequence,
        );
        await this.#faultInjector.hit('AFTER_WORLD_HEAD');
        await this.#faultInjector.hit('BEFORE_TRANSACTION_COMMIT');
        return Object.freeze({
          source: 'NEW_COMMIT' as const,
          receipt: candidate.receipt,
          transition: candidate.transition,
        });
      });
    } catch (error) {
      const recovered = await this.readFinalReceipt(candidate.command);
      if (recovered !== null) {
        return this.#existingCommit(
          candidate,
          recovered,
          'RECOVERED_AFTER_UNKNOWN_ACKNOWLEDGEMENT',
        );
      }
      throw error;
    }
  }

  #existingCommit(
    candidate: PrivateAtomicTransitionCandidate,
    receipt: FinalCommandReceipt,
    source: Exclude<AtomicCommitSource, 'NEW_COMMIT'>,
  ): Readonly<AtomicCommitResult> {
    if (receipt.outcome !== 'COMMITTED') {
      throw new DomainError(
        DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
        'A zero-effect final receipt already owns this Command identity',
      );
    }
    validateFinalReceiptForCommand({
      command: candidate.command,
      receipt,
      transition: candidate.transition,
    });
    return Object.freeze({ source, receipt, transition: candidate.transition });
  }

  async #assertDatabaseCommitGuard(
    transaction: SqlExecutor,
    candidate: PrivateAtomicTransitionCandidate,
  ): Promise<{ readonly eventSequence: string }> {
    const result = await transaction.query<CommitGuardRow>(
      `select world_version, event_sequence
         from world_v2.assert_world_writer_commit_guard($1, $2, $3, $4, $5)`,
      [
        candidate.command.worldId,
        candidate.commitAssertion.holderId,
        candidate.commitAssertion.fencingToken,
        candidate.transition.worldVersionBefore,
        candidate.observedAtReal,
      ],
    );
    const row = result.rows[0];
    if (
      row === undefined ||
      databaseInteger(row.world_version, 'guard WorldVersion') !==
        candidate.transition.worldVersionBefore
    ) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.WORLD_VERSION_MISMATCH,
        'Database commit guard returned a different WorldVersion',
      );
    }
    return Object.freeze({
      eventSequence: databaseInteger(
        row.event_sequence,
        'guard Event sequence',
      ),
    });
  }

  async #insertEvents(
    transaction: SqlExecutor,
    candidate: PrivateAtomicTransitionCandidate,
    priorEventSequence: string,
  ): Promise<void> {
    const firstSequence = BigInt(candidate.transition.events[0]!.sequence);
    if (firstSequence !== BigInt(priorEventSequence) + 1n) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.EVENT_APPEND_CONFLICT,
        'Candidate Event sequence does not extend the locked World head',
      );
    }
    for (const event of candidate.transition.events) {
      await transaction.query(
        `insert into world_v2.authoritative_event
           (world_id, event_id, event_sequence, world_version,
            causation_command_id, correlation_id, event_type, schema_version,
            canonical_payload, payload_sha256, event_fingerprint, sim_time,
            recorded_at_real, corrects_event_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          event.worldId,
          event.eventId,
          event.sequence,
          event.worldVersion,
          event.causationCommandId,
          event.correlationId,
          event.eventType,
          event.schemaVersion,
          event.canonicalPayload,
          event.payloadHash,
          event.fingerprint,
          event.simTime.toCanonicalValue(),
          event.recordedAtReal,
          event.correctsEventId,
        ],
      );
    }
  }

  async #insertInventoryPostings(
    transaction: SqlExecutor,
    candidate: PrivateAtomicTransitionCandidate,
  ): Promise<void> {
    for (const posting of candidate.inventoryPostings) {
      await transaction.query(
        `insert into world_v2.inventory_posting
           (world_id, posting_id, causation_command_id,
            world_version_before, world_version_after, sim_time, event_ids,
            transition_binding, operation, canonical_payload, posting_fingerprint)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
        [
          posting.worldId,
          posting.postingId,
          posting.causationCommandId,
          posting.worldVersionBefore,
          posting.worldVersionAfter,
          posting.simTime.toCanonicalValue(),
          canonicalSerialize(posting.causationEventIds),
          canonicalSerialize(posting.transitionBinding),
          posting.operation,
          canonicalPostingIntent(posting),
          posting.fingerprint,
        ],
      );
    }
  }

  async #insertFinancialPostingBatches(
    transaction: SqlExecutor,
    candidate: PrivateAtomicTransitionCandidate,
  ): Promise<void> {
    for (const batch of candidate.financialPostingBatches) {
      await transaction.query(
        `insert into world_v2.financial_posting_batch
           (world_id, batch_id, causation_command_id,
            world_version_before, world_version_after, sim_time, event_ids,
            transition_binding, settlement_currency, canonical_payload,
            batch_fingerprint)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
        [
          batch.worldId,
          batch.batchId,
          batch.causationCommandId,
          batch.worldVersionBefore,
          batch.worldVersionAfter,
          batch.simTime.toCanonicalValue(),
          canonicalSerialize(batch.causationEventIds),
          canonicalSerialize(batch.transitionBinding),
          batch.settlementCurrency,
          canonicalPostingIntent(batch),
          batch.fingerprint,
        ],
      );
    }
  }

  async #insertCommitAuthorization(
    transaction: SqlExecutor,
    candidate: PrivateAtomicTransitionCandidate,
  ): Promise<void> {
    const proof = candidate.commitAuthorization;
    await transaction.query(
      `insert into world_v2.authoritative_commit_authorization
         (world_id, command_id, authority_kind, auth_subject, actor_id,
          country_id, office_id, capability, team_id, authorization_version,
          committed_at_real)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        candidate.command.worldId,
        candidate.command.commandId,
        candidate.authorityKind,
        proof?.authSubject ?? null,
        proof?.actorId ?? null,
        proof?.countryId ?? null,
        proof?.officeId ?? null,
        proof?.capability ?? null,
        proof?.teamId ?? null,
        proof?.authorizationVersion ?? null,
        candidate.receipt.recordedAtReal,
      ],
    );
  }

  async #insertReceipt(
    transaction: SqlExecutor,
    receipt: FinalCommandReceipt,
  ): Promise<void> {
    await transaction.query(
      `insert into world_v2.command_receipt
         (world_id, command_id, idempotency_key, schema_version,
          command_fingerprint, outcome, reason_code, transition_id,
          world_version_before, world_version_after, sim_time, event_ids,
          recorded_at_real)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
      [
        receipt.worldId,
        receipt.commandId,
        receipt.idempotencyKey,
        receipt.schemaVersion,
        receipt.commandFingerprint,
        receipt.outcome,
        receipt.reasonCode,
        receipt.transitionId,
        receipt.worldVersionBefore,
        receipt.worldVersionAfter,
        receipt.simTime.toCanonicalValue(),
        canonicalSerialize(receipt.eventIds),
        receipt.recordedAtReal,
      ],
    );
  }

  async #upsertMaterializations(
    transaction: SqlExecutor,
    candidate: PrivateAtomicTransitionCandidate,
  ): Promise<void> {
    for (const materialization of candidate.currentMaterializations) {
      const result = await transaction.query(
        `insert into world_v2.current_materialization
           (world_id, materialization_key, world_version, source_command_id,
            canonical_payload, payload_sha256)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (world_id, materialization_key) do update
           set world_version = excluded.world_version,
               source_command_id = excluded.source_command_id,
               canonical_payload = excluded.canonical_payload,
               payload_sha256 = excluded.payload_sha256
         where world_v2.current_materialization.world_version = $7`,
        [
          candidate.command.worldId,
          materialization.key,
          candidate.transition.worldVersionAfter,
          candidate.command.commandId,
          materialization.canonicalPayload,
          materialization.payloadHash,
          candidate.transition.worldVersionBefore,
        ],
      );
      requireOneRow(result, 'Current materialization update');
    }
  }

  async #insertOutbox(
    transaction: SqlExecutor,
    candidate: PrivateAtomicTransitionCandidate,
  ): Promise<void> {
    for (const message of candidate.outboxMessages) {
      await transaction.query(
        `insert into world_v2.notification_outbox
           (world_id, outbox_message_id, command_id, event_id,
            schema_version, canonical_payload, payload_sha256,
            available_at_sim_time, delivery_state, attempt_count)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', 0)`,
        [
          message.worldId,
          message.messageId,
          message.commandId,
          message.eventId,
          message.schemaVersion,
          message.canonicalPayload,
          message.payloadHash,
          message.availableAtSimTime.toCanonicalValue(),
        ],
      );
    }
  }

  async #finalizeQueue(
    transaction: SqlExecutor,
    command: CanonicalCommand,
    finalizedAtReal: string,
  ): Promise<void> {
    const result = await transaction.query(
      `update world_v2.command_queue
          set queue_state = 'FINALIZED',
              finalized_at_real = $4
        where world_id = $1
          and command_id = $2
          and queue_state = 'CLAIMED'
          and claimed_by = $3`,
      [command.worldId, command.commandId, this.#workerId, finalizedAtReal],
    );
    requireOneRow(result, 'Command queue finalization');
  }

  async #advanceWorldHead(
    transaction: SqlExecutor,
    candidate: PrivateAtomicTransitionCandidate,
    priorEventSequence: string,
  ): Promise<void> {
    const finalEventSequence = candidate.transition.events.at(-1)!.sequence;
    const result = await transaction.query(
      `update world_v2.world_head
          set world_version = $3,
              event_sequence = $4
        where world_id = $1
          and world_version = $2
          and event_sequence = $5`,
      [
        candidate.command.worldId,
        candidate.transition.worldVersionBefore,
        candidate.transition.worldVersionAfter,
        finalEventSequence,
        priorEventSequence,
      ],
    );
    requireOneRow(result, 'World head advance');
  }
}

export interface AtomicTransitionCandidateFactory {
  prepare(input: {
    readonly command: CanonicalCommand;
    readonly commitAuthorization: CommitAuthorizationProof | null;
  }): Promise<AtomicTransitionDraft>;
}

/**
 * V07's command processor calls this port. Candidate calculation occurs before
 * the transaction; every authoritative fact is then revalidated and persisted
 * by `AtomicTransitionRepository` in one short transaction.
 */
export function createAtomicCommandLifecyclePersistence(input: {
  readonly repository: AtomicTransitionRepository;
  readonly candidateFactory: AtomicTransitionCandidateFactory;
  readonly sha256Hex: Sha256Hex;
}): CommandLifecyclePersistencePort {
  const persistence: CommandLifecyclePersistencePort = {
    readFinalReceipt: (command) => input.repository.readFinalReceipt(command),
    recordZeroEffectReceipt: (receipt) =>
      input.repository.recordZeroEffectReceipt(receipt),
    commitAuthorizedCommand: async ({ command, commitAuthorization }) => {
      const draft = await input.candidateFactory.prepare({
        command,
        commitAuthorization,
      });
      const candidate = prepareAtomicTransitionCandidate({
        command,
        commitAuthorization,
        draft,
        sha256Hex: input.sha256Hex,
      });
      const result = await input.repository.commit(candidate);
      return Object.freeze({
        receipt: result.receipt,
        transition: result.transition,
      });
    },
  };
  return Object.freeze(persistence);
}
