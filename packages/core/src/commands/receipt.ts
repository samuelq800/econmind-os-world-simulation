import type { AuthorizedOfficeContext } from '../authorization/offices.js';
import type { CanonicalCommand, CanonicalSha256 } from './command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  consumerId,
  eventId,
  outboxMessageId,
  type CommandId,
  type ConsumerId,
  type EventId,
  type OutboxMessageId,
  type WorldId,
} from '../ids.js';
import { SimTime } from '../numeric/sim-time.js';
import { canonicalSerialize } from '../serialization/canonical.js';

export const COMMAND_ACCEPTANCE_SCHEMA_VERSION =
  'command-acceptance-v1' as const;
export const COMMAND_RECEIPT_SCHEMA_VERSION = 'command-receipt-v1' as const;
export const OUTBOX_SCHEMA_VERSION = 'outbox-v1' as const;
export const CONSUMER_RECEIPT_SCHEMA_VERSION = 'consumer-receipt-v1' as const;

export type FinalCommandOutcome =
  'COMMITTED' | 'REJECTED' | 'AUTHORIZATION_REVOKED';
export type QueueAuthorityKind = 'DISCRETIONARY_USER' | 'VERSIONED_AUTOMATIC';
export type QueueState = 'PENDING' | 'CLAIMED' | 'FINALIZED';
export type OutboxDeliveryState = 'PENDING' | 'DELIVERED';
export type ConsumerDeliveryState = 'PROCESSING' | 'DELIVERED' | 'FAILED';

const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const CANONICAL_REASON = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;
const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.COMMAND_RECEIPT_INVALID, message);
}

function canonicalAuditTimestamp(value: string, label: string): string {
  if (!RFC3339_MILLISECONDS.test(value)) {
    invalid(`${label} must be canonical RFC3339 UTC milliseconds`);
  }
  return value;
}

function positiveWorldVersion(value: string): string {
  if (!POSITIVE_INTEGER.test(value)) {
    invalid('committedWorldVersion must be a canonical positive integer');
  }
  return value;
}

export interface CommandAcceptance {
  readonly schemaVersion: typeof COMMAND_ACCEPTANCE_SCHEMA_VERSION;
  readonly status: 'ACCEPTED';
  readonly worldId: WorldId;
  readonly commandId: CommandId;
  readonly commandFingerprint: CanonicalSha256;
  readonly acceptedSimTime: SimTime;
  readonly acceptedAtReal: string;
}

export function createCommandAcceptance(
  command: CanonicalCommand,
): Readonly<CommandAcceptance> {
  return Object.freeze({
    schemaVersion: COMMAND_ACCEPTANCE_SCHEMA_VERSION,
    status: 'ACCEPTED',
    worldId: command.worldId,
    commandId: command.commandId,
    commandFingerprint: command.fingerprint,
    acceptedSimTime: command.simTime,
    acceptedAtReal: command.submittedAtReal,
  });
}

export interface FinalCommandReceipt {
  readonly schemaVersion: typeof COMMAND_RECEIPT_SCHEMA_VERSION;
  readonly worldId: WorldId;
  readonly commandId: CommandId;
  readonly commandFingerprint: CanonicalSha256;
  readonly outcome: FinalCommandOutcome;
  readonly reasonCode: string | null;
  readonly committedWorldVersion: string | null;
  readonly simTime: SimTime;
  readonly eventIds: readonly EventId[];
  readonly recordedAtReal: string;
}

export function createFinalCommandReceipt(input: {
  readonly command: CanonicalCommand;
  readonly outcome: FinalCommandOutcome;
  readonly reasonCode: string | null;
  readonly committedWorldVersion: string | null;
  readonly simTime: SimTime;
  readonly eventIds: readonly EventId[];
  readonly recordedAtReal: string;
}): Readonly<FinalCommandReceipt> {
  const committed = input.outcome === 'COMMITTED';
  if (committed) {
    if (input.reasonCode !== null) {
      invalid('A committed receipt cannot carry a failure reason');
    }
    if (input.committedWorldVersion === null) {
      invalid('A committed receipt requires committedWorldVersion');
    }
    positiveWorldVersion(input.committedWorldVersion);
    if (input.eventIds.length === 0) {
      invalid('A committed receipt requires at least one authoritative Event');
    }
  } else {
    if (input.reasonCode === null || !CANONICAL_REASON.test(input.reasonCode)) {
      invalid('A zero-effect receipt requires a canonical reason code');
    }
    if (input.committedWorldVersion !== null || input.eventIds.length !== 0) {
      invalid('A zero-effect receipt cannot claim a WorldVersion or Event');
    }
  }
  if (new Set(input.eventIds).size !== input.eventIds.length) {
    invalid('Receipt Event IDs must be unique');
  }
  return Object.freeze({
    schemaVersion: COMMAND_RECEIPT_SCHEMA_VERSION,
    worldId: input.command.worldId,
    commandId: input.command.commandId,
    commandFingerprint: input.command.fingerprint,
    outcome: input.outcome,
    reasonCode: input.reasonCode,
    committedWorldVersion: input.committedWorldVersion,
    simTime: input.simTime,
    eventIds: Object.freeze([...input.eventIds]),
    recordedAtReal: canonicalAuditTimestamp(
      input.recordedAtReal,
      'recordedAtReal',
    ),
  });
}

export type CommandIntakeResponse =
  | Readonly<{
      kind: 'ACCEPTED';
      acknowledgement: CommandAcceptance;
    }>
  | Readonly<{
      kind: 'EXACT_DUPLICATE';
      acknowledgement: CommandAcceptance;
      finalReceipt: FinalCommandReceipt | null;
    }>;

export interface DurableCommandIntakePort {
  /**
   * Atomically binds both durable Command identities to the fingerprint. The
   * implementation returns the original immutable records for an exact retry
   * and throws IDEMPOTENCY_CONFLICT for identity reuse with changed intent.
   */
  acceptOrLoad(input: {
    readonly command: CanonicalCommand;
    readonly acknowledgement: CommandAcceptance;
  }): Promise<CommandIntakeResponse>;
}

export async function acceptCanonicalCommand(input: {
  readonly command: CanonicalCommand;
  readonly persistence: DurableCommandIntakePort;
}): Promise<CommandIntakeResponse> {
  const response = await input.persistence.acceptOrLoad({
    command: input.command,
    acknowledgement: createCommandAcceptance(input.command),
  });
  if (
    response.acknowledgement.worldId !== input.command.worldId ||
    response.acknowledgement.commandFingerprint !== input.command.fingerprint
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      'Durable acknowledgement does not match canonical Command intent',
    );
  }
  return response;
}

export interface CommandLifecyclePersistencePort {
  readFinalReceipt(
    worldId: WorldId,
    commandId: CommandId,
  ): Promise<FinalCommandReceipt | null>;
  recordZeroEffectReceipt(
    receipt: FinalCommandReceipt,
  ): Promise<FinalCommandReceipt>;
  commitAuthorizedCommand(input: {
    readonly command: CanonicalCommand;
    readonly currentAuthorization: AuthorizedOfficeContext | null;
  }): Promise<FinalCommandReceipt>;
}

export type QueuedCommandExecutionResult = Readonly<{
  source: 'EXISTING_FINAL' | 'NEW_FINAL';
  receipt: FinalCommandReceipt;
}>;

/**
 * Defines V07.2 ordering only. The persistence port is implemented by the
 * later authoritative transaction boundary; V07.2 does not provide a lease,
 * fencing token, or transaction coordinator.
 */
export async function processQueuedCommand(input: {
  readonly command: CanonicalCommand;
  readonly authorityKind: QueueAuthorityKind;
  readonly commitSimTime: SimTime;
  readonly recordedAtReal: string;
  readonly reauthorizeAtCommit?: () => Promise<AuthorizedOfficeContext>;
  readonly persistence: CommandLifecyclePersistencePort;
}): Promise<QueuedCommandExecutionResult> {
  const existing = await input.persistence.readFinalReceipt(
    input.command.worldId,
    input.command.commandId,
  );
  if (existing !== null) {
    return Object.freeze({ source: 'EXISTING_FINAL', receipt: existing });
  }

  let currentAuthorization: AuthorizedOfficeContext | null = null;
  if (input.authorityKind === 'DISCRETIONARY_USER') {
    if (input.reauthorizeAtCommit === undefined) {
      invalid('Discretionary work requires commit-time reauthorization');
    }
    try {
      currentAuthorization = await input.reauthorizeAtCommit();
    } catch (error) {
      if (
        !(error instanceof DomainError) ||
        error.code !== DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED
      ) {
        throw error;
      }
      const receipt = createFinalCommandReceipt({
        command: input.command,
        outcome: 'AUTHORIZATION_REVOKED',
        reasonCode: 'AUTHORIZATION_REVOKED',
        committedWorldVersion: null,
        simTime: input.commitSimTime,
        eventIds: [],
        recordedAtReal: input.recordedAtReal,
      });
      return Object.freeze({
        source: 'NEW_FINAL',
        receipt: await input.persistence.recordZeroEffectReceipt(receipt),
      });
    }
  }

  return Object.freeze({
    source: 'NEW_FINAL',
    receipt: await input.persistence.commitAuthorizedCommand({
      command: input.command,
      currentAuthorization,
    }),
  });
}

export interface OutboxMessage {
  readonly schemaVersion: typeof OUTBOX_SCHEMA_VERSION;
  readonly messageId: OutboxMessageId;
  readonly worldId: WorldId;
  readonly commandId: CommandId;
  readonly eventId: EventId | null;
  readonly canonicalPayload: string;
  readonly payloadHash: CanonicalSha256;
  readonly availableAtSimTime: SimTime;
  readonly state: OutboxDeliveryState;
  readonly attemptCount: string;
}

export function createOutboxMessage(input: {
  readonly messageId: string;
  readonly worldId: WorldId;
  readonly commandId: CommandId;
  readonly eventId: string | null;
  readonly payload: unknown;
  readonly payloadHash: CanonicalSha256;
  readonly availableAtSimTime: SimTime;
}): Readonly<OutboxMessage> {
  return Object.freeze({
    schemaVersion: OUTBOX_SCHEMA_VERSION,
    messageId: outboxMessageId(input.messageId),
    worldId: input.worldId,
    commandId: input.commandId,
    eventId: input.eventId === null ? null : eventId(input.eventId),
    canonicalPayload: canonicalSerialize(input.payload),
    payloadHash: input.payloadHash,
    availableAtSimTime: input.availableAtSimTime,
    state: 'PENDING',
    attemptCount: '0',
  });
}

export function recordOutboxDeliveryAttempt(input: {
  readonly message: OutboxMessage;
  readonly delivered: boolean;
}): Readonly<OutboxMessage> {
  if (input.message.state === 'DELIVERED') return input.message;
  return Object.freeze({
    ...input.message,
    state: input.delivered ? 'DELIVERED' : 'PENDING',
    attemptCount: (BigInt(input.message.attemptCount) + 1n).toString(),
  });
}

export interface EventConsumerReceipt {
  readonly schemaVersion: typeof CONSUMER_RECEIPT_SCHEMA_VERSION;
  readonly worldId: WorldId;
  readonly eventId: EventId;
  readonly consumerId: ConsumerId;
  readonly state: ConsumerDeliveryState;
  readonly attemptCount: string;
}

export function createEventConsumerReceipt(input: {
  readonly worldId: WorldId;
  readonly eventId: string;
  readonly consumerId: string;
}): Readonly<EventConsumerReceipt> {
  return Object.freeze({
    schemaVersion: CONSUMER_RECEIPT_SCHEMA_VERSION,
    worldId: input.worldId,
    eventId: eventId(input.eventId),
    consumerId: consumerId(input.consumerId),
    state: 'PROCESSING',
    attemptCount: '1',
  });
}

export function recordConsumerDelivery(input: {
  readonly receipt: EventConsumerReceipt;
  readonly delivered: boolean;
}): Readonly<EventConsumerReceipt> {
  if (input.receipt.state === 'DELIVERED') return input.receipt;
  return Object.freeze({
    ...input.receipt,
    state: input.delivered ? 'DELIVERED' : 'FAILED',
  });
}
