import {
  isAuthorizedOfficeContext,
  reauthorizeOfficeCapability,
  type AuthorizationCapability,
  type AuthorizedOfficeContext,
} from '../authorization/offices.js';
import {
  validateCanonicalCommand,
  type CanonicalCommand,
  type CanonicalSha256,
  type Sha256Hex,
} from './command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  consumerId,
  eventId,
  outboxMessageId,
  type ActorId,
  type AuthSubject,
  type CommandId,
  type ConsumerId,
  type CountryId,
  type EventId,
  type IdempotencyKey,
  type OfficeId,
  type OutboxMessageId,
  type TeamId,
  type WorldId,
} from '../ids.js';
import { isSimTime, SimTime } from '../numeric/sim-time.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import {
  validateAuthoritativeEvent,
  type AuthoritativeEvent,
} from '../events/event.js';

export const COMMAND_ACCEPTANCE_SCHEMA_VERSION =
  'command-acceptance-v1' as const;
export const COMMAND_RECEIPT_SCHEMA_VERSION = 'command-receipt-v2' as const;
export const AUTHORITATIVE_TRANSITION_SCHEMA_VERSION =
  'authoritative-transition-v1' as const;
export const AUTHORITATIVE_TRANSITION_BINDING_SCHEMA_VERSION =
  'authoritative-transition-binding-v1' as const;
export const COMMIT_AUTHORIZATION_SCHEMA_VERSION =
  'commit-authorization-v1' as const;
export const OUTBOX_SCHEMA_VERSION = 'outbox-v1' as const;
export const CONSUMER_RECEIPT_SCHEMA_VERSION = 'consumer-receipt-v1' as const;

export type FinalCommandOutcome =
  'COMMITTED' | 'REJECTED' | 'AUTHORIZATION_REVOKED';
export type QueueAuthorityKind = 'DISCRETIONARY_USER' | 'VERSIONED_AUTOMATIC';
export type QueueState = 'PENDING' | 'CLAIMED' | 'FINALIZED';
export type OutboxDeliveryState = 'PENDING' | 'DELIVERED';
export type ConsumerDeliveryState = 'PROCESSING' | 'DELIVERED' | 'FAILED';

const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const CANONICAL_SHA256 = /^sha256:[0-9a-f]{64}$/u;
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

function canonicalWorldVersion(value: string, label: string): string {
  if (!NON_NEGATIVE_INTEGER.test(value)) {
    invalid(`${label} must be a canonical non-negative integer`);
  }
  return value;
}

function transitionInvalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
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
  readonly idempotencyKey: IdempotencyKey | null;
  readonly commandFingerprint: CanonicalSha256;
  readonly outcome: FinalCommandOutcome;
  readonly reasonCode: string | null;
  readonly transitionId: CommandId | null;
  readonly worldVersionBefore: string | null;
  readonly worldVersionAfter: string | null;
  readonly simTime: SimTime;
  readonly eventIds: readonly EventId[];
  readonly recordedAtReal: string;
}

/**
 * V07 uses the immutable Command identity as the one-to-one logical
 * transition/receipt identity. Event sequence remains a separate per-World
 * order. V09 will later commit this evidence atomically.
 */
export interface AuthoritativeTransition {
  readonly schemaVersion: typeof AUTHORITATIVE_TRANSITION_SCHEMA_VERSION;
  readonly transitionId: CommandId;
  readonly worldId: WorldId;
  readonly commandId: CommandId;
  readonly commandFingerprint: CanonicalSha256;
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly eventIds: readonly EventId[];
  readonly events: readonly AuthoritativeEvent[];
}

/**
 * Canonical V07 evidence projected for V08 Posting ownership. It intentionally
 * excludes trace-only Event audit timestamps while retaining the immutable
 * Command fingerprint, exact ordered Event identities/fingerprints, SimTime,
 * and one WorldVersion boundary.
 */
export interface AuthoritativeTransitionBinding {
  readonly schemaVersion: typeof AUTHORITATIVE_TRANSITION_BINDING_SCHEMA_VERSION;
  readonly transitionId: CommandId;
  readonly worldId: WorldId;
  readonly commandId: CommandId;
  readonly commandFingerprint: CanonicalSha256;
  readonly idempotencyKey: IdempotencyKey | null;
  readonly expectedWorldVersion: string | null;
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly eventIds: readonly EventId[];
  readonly eventFingerprints: readonly CanonicalSha256[];
  readonly simTime: SimTime;
}

export function validateAuthoritativeTransition(
  transition: AuthoritativeTransition,
): Readonly<AuthoritativeTransition> {
  if (
    transition.schemaVersion !== AUTHORITATIVE_TRANSITION_SCHEMA_VERSION ||
    transition.transitionId !== transition.commandId
  ) {
    transitionInvalid(
      'Transition identity must be the immutable causation Command identity',
    );
  }
  if (!CANONICAL_SHA256.test(transition.commandFingerprint)) {
    transitionInvalid(
      'Transition Command fingerprint must be canonical SHA-256',
    );
  }
  const before = BigInt(
    canonicalWorldVersion(transition.worldVersionBefore, 'worldVersionBefore'),
  );
  const after = BigInt(
    canonicalWorldVersion(transition.worldVersionAfter, 'worldVersionAfter'),
  );
  if (after !== before + 1n) {
    transitionInvalid(
      'One authoritative transition advances WorldVersion once',
    );
  }
  if (
    transition.events.length === 0 ||
    transition.eventIds.length !== transition.events.length
  ) {
    transitionInvalid('Transition requires a complete non-empty Event group');
  }
  if (new Set(transition.eventIds).size !== transition.eventIds.length) {
    transitionInvalid('Transition Event identities must be unique');
  }
  let previousSequence: bigint | null = null;
  for (const [index, event] of transition.events.entries()) {
    if (
      transition.eventIds[index] !== event.eventId ||
      event.worldId !== transition.worldId ||
      event.causationCommandId !== transition.commandId ||
      event.worldVersion !== transition.worldVersionAfter
    ) {
      transitionInvalid(
        'Every Event must match the transition identity and version boundary',
      );
    }
    const sequence = BigInt(event.sequence);
    if (previousSequence !== null && sequence !== previousSequence + 1n) {
      transitionInvalid('Transition Events must be contiguous and ordered');
    }
    previousSequence = sequence;
  }
  return transition;
}

export function bindAuthoritativeTransition(
  input: {
    readonly command: CanonicalCommand;
    readonly transition: AuthoritativeTransition;
  },
  sha256Hex: Sha256Hex,
): Readonly<AuthoritativeTransitionBinding> {
  const command = validateCanonicalCommand(input.command, sha256Hex);
  const transition = validateAuthoritativeTransition(input.transition);
  if (
    !CANONICAL_SHA256.test(transition.commandFingerprint) ||
    transition.commandId !== command.commandId ||
    transition.worldId !== command.worldId ||
    transition.commandFingerprint !== command.fingerprint ||
    (command.expectedWorldVersion !== null &&
      command.expectedWorldVersion !== transition.worldVersionBefore)
  ) {
    transitionInvalid(
      command.expectedWorldVersion !== null &&
        command.expectedWorldVersion !== transition.worldVersionBefore
        ? 'Command expected WorldVersion does not match the transition boundary'
        : 'Transition does not match canonical Command evidence',
    );
  }
  const events = transition.events.map((event) =>
    validateAuthoritativeEvent(event, sha256Hex),
  );
  const firstEvent = events[0]!;
  const eventFingerprints = events.map((event) => {
    if (
      !isSimTime(event.simTime) ||
      event.simTime.ticks !== command.simTime.ticks ||
      !CANONICAL_SHA256.test(event.fingerprint)
    ) {
      transitionInvalid(
        'Transition Events must share canonical SimTime and fingerprints',
      );
    }
    return event.fingerprint;
  });
  return Object.freeze({
    schemaVersion: AUTHORITATIVE_TRANSITION_BINDING_SCHEMA_VERSION,
    transitionId: transition.transitionId,
    worldId: transition.worldId,
    commandId: transition.commandId,
    commandFingerprint: transition.commandFingerprint,
    idempotencyKey: command.idempotencyKey,
    expectedWorldVersion: command.expectedWorldVersion,
    worldVersionBefore: transition.worldVersionBefore,
    worldVersionAfter: transition.worldVersionAfter,
    eventIds: Object.freeze([...transition.eventIds]),
    eventFingerprints: Object.freeze(eventFingerprints),
    simTime: firstEvent.simTime,
  });
}

export function createAuthoritativeTransition(input: {
  readonly command: CanonicalCommand;
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly events: readonly AuthoritativeEvent[];
}): Readonly<AuthoritativeTransition> {
  const transition = Object.freeze({
    schemaVersion: AUTHORITATIVE_TRANSITION_SCHEMA_VERSION,
    transitionId: input.command.commandId,
    worldId: input.command.worldId,
    commandId: input.command.commandId,
    commandFingerprint: input.command.fingerprint,
    worldVersionBefore: input.worldVersionBefore,
    worldVersionAfter: input.worldVersionAfter,
    eventIds: Object.freeze(input.events.map((event) => event.eventId)),
    events: Object.freeze([...input.events]),
  });
  return validateAuthoritativeTransition(transition);
}

export function createFinalCommandReceipt(input: {
  readonly command: CanonicalCommand;
  readonly outcome: FinalCommandOutcome;
  readonly reasonCode: string | null;
  readonly transition: AuthoritativeTransition | null;
  readonly simTime: SimTime;
  readonly recordedAtReal: string;
}): Readonly<FinalCommandReceipt> {
  const committed = input.outcome === 'COMMITTED';
  if (committed) {
    if (input.reasonCode !== null) {
      invalid('A committed receipt cannot carry a failure reason');
    }
    if (input.transition === null) {
      invalid('A committed receipt requires authoritative transition evidence');
    }
    validateAuthoritativeTransition(input.transition);
    if (
      input.transition.worldId !== input.command.worldId ||
      input.transition.commandId !== input.command.commandId ||
      input.transition.commandFingerprint !== input.command.fingerprint
    ) {
      invalid('Receipt transition does not match canonical Command intent');
    }
  } else {
    if (input.reasonCode === null || !CANONICAL_REASON.test(input.reasonCode)) {
      invalid('A zero-effect receipt requires a canonical reason code');
    }
    if (input.transition !== null) {
      invalid('A zero-effect receipt cannot claim a transition or Event');
    }
  }
  const transition = input.transition;
  return Object.freeze({
    schemaVersion: COMMAND_RECEIPT_SCHEMA_VERSION,
    worldId: input.command.worldId,
    commandId: input.command.commandId,
    idempotencyKey: input.command.idempotencyKey,
    commandFingerprint: input.command.fingerprint,
    outcome: input.outcome,
    reasonCode: input.reasonCode,
    transitionId: transition?.transitionId ?? null,
    worldVersionBefore: transition?.worldVersionBefore ?? null,
    worldVersionAfter: transition?.worldVersionAfter ?? null,
    simTime: input.simTime,
    eventIds: Object.freeze([...(transition?.eventIds ?? [])]),
    recordedAtReal: canonicalAuditTimestamp(
      input.recordedAtReal,
      'recordedAtReal',
    ),
  });
}

export function validateFinalReceiptForCommand(input: {
  readonly receipt: FinalCommandReceipt;
  readonly command: CanonicalCommand;
  readonly transition?: AuthoritativeTransition;
}): Readonly<FinalCommandReceipt> {
  const { receipt, command } = input;
  const sharesIdentity =
    receipt.worldId === command.worldId &&
    (receipt.commandId === command.commandId ||
      (command.idempotencyKey !== null &&
        receipt.idempotencyKey === command.idempotencyKey));
  if (!sharesIdentity) {
    invalid('Stored receipt does not share a durable Command identity');
  }
  if (receipt.commandFingerprint !== command.fingerprint) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      'Stored receipt is bound to different canonical Command intent',
    );
  }
  if (receipt.schemaVersion !== COMMAND_RECEIPT_SCHEMA_VERSION) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      'Unsupported final receipt schema version',
    );
  }
  if (receipt.outcome === 'COMMITTED') {
    if (
      receipt.transitionId === null ||
      receipt.worldVersionBefore === null ||
      receipt.worldVersionAfter === null ||
      receipt.eventIds.length === 0
    ) {
      invalid('Committed receipt lacks authoritative transition evidence');
    }
    if (input.transition !== undefined) {
      const transition = validateAuthoritativeTransition(input.transition);
      if (
        receipt.transitionId !== transition.transitionId ||
        receipt.worldId !== transition.worldId ||
        receipt.commandId !== transition.commandId ||
        receipt.commandFingerprint !== transition.commandFingerprint ||
        receipt.worldVersionBefore !== transition.worldVersionBefore ||
        receipt.worldVersionAfter !== transition.worldVersionAfter ||
        receipt.eventIds.length !== transition.eventIds.length ||
        receipt.eventIds.some(
          (eventIdentity, index) =>
            eventIdentity !== transition.eventIds[index],
        )
      ) {
        invalid(
          'Final receipt does not match authoritative transition evidence',
        );
      }
    }
  } else if (
    receipt.transitionId !== null ||
    receipt.worldVersionBefore !== null ||
    receipt.worldVersionAfter !== null ||
    receipt.eventIds.length !== 0
  ) {
    invalid('Zero-effect receipt claims authoritative transition evidence');
  }
  return receipt;
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
    command: CanonicalCommand,
  ): Promise<FinalCommandReceipt | null>;
  recordZeroEffectReceipt(
    receipt: FinalCommandReceipt,
  ): Promise<FinalCommandReceipt>;
  commitAuthorizedCommand(input: {
    readonly command: CanonicalCommand;
    readonly commitAuthorization: CommitAuthorizationProof | null;
  }): Promise<
    Readonly<{
      receipt: FinalCommandReceipt;
      transition: AuthoritativeTransition;
    }>
  >;
}

declare const opaqueCommitAuthorizationProof: unique symbol;

export interface CommitAuthorizationProof {
  readonly [opaqueCommitAuthorizationProof]: true;
  readonly schemaVersion: typeof COMMIT_AUTHORIZATION_SCHEMA_VERSION;
  readonly commandId: CommandId;
  readonly commandFingerprint: CanonicalSha256;
  readonly actorId: ActorId;
  readonly authSubject: AuthSubject;
  readonly worldId: WorldId;
  readonly countryId: CountryId;
  readonly officeId: OfficeId;
  readonly capability: AuthorizationCapability;
  readonly teamId: TeamId;
  readonly authorizationVersion: string;
  readonly currentlyAuthorized: true;
}

const issuedCommitAuthorizationProofs = new WeakSet<object>();

export function isCommitAuthorizationProof(
  value: unknown,
): value is CommitAuthorizationProof {
  return (
    typeof value === 'object' &&
    value !== null &&
    issuedCommitAuthorizationProofs.has(value)
  );
}

function bindCommitAuthorizationToCommand(input: {
  readonly command: CanonicalCommand;
  readonly currentAuthorization: AuthorizedOfficeContext;
  readonly requiredCapability: AuthorizationCapability;
}): Readonly<CommitAuthorizationProof> {
  if (!isAuthorizedOfficeContext(input.currentAuthorization)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      'Commit authorization was not issued by current server authorization',
    );
  }
  if (
    input.command.officeId === null ||
    input.currentAuthorization.authSubject !== input.command.authSubject ||
    input.currentAuthorization.worldId !== input.command.worldId ||
    input.currentAuthorization.countryId !== input.command.countryId ||
    input.currentAuthorization.officeId !== input.command.officeId ||
    input.currentAuthorization.capability !== input.requiredCapability
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      'Commit authorization is not bound to this canonical Command',
    );
  }
  const proof = Object.freeze({
    schemaVersion: COMMIT_AUTHORIZATION_SCHEMA_VERSION,
    commandId: input.command.commandId,
    commandFingerprint: input.command.fingerprint,
    actorId: input.command.actorId,
    authSubject: input.currentAuthorization.authSubject,
    worldId: input.currentAuthorization.worldId,
    countryId: input.currentAuthorization.countryId,
    officeId: input.currentAuthorization.officeId,
    capability: input.currentAuthorization.capability,
    teamId: input.currentAuthorization.teamId,
    authorizationVersion: input.currentAuthorization.authorizationVersion,
    currentlyAuthorized: true as const,
  }) as CommitAuthorizationProof;
  issuedCommitAuthorizationProofs.add(proof);
  return proof;
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
  readonly requiredCapability?: AuthorizationCapability;
  readonly intakeAuthorization?: AuthorizedOfficeContext;
  readonly persistence: CommandLifecyclePersistencePort;
}): Promise<QueuedCommandExecutionResult> {
  const existing = await input.persistence.readFinalReceipt(input.command);
  if (existing !== null) {
    return Object.freeze({
      source: 'EXISTING_FINAL',
      receipt: validateFinalReceiptForCommand({
        receipt: existing,
        command: input.command,
      }),
    });
  }

  let commitAuthorization: CommitAuthorizationProof | null = null;
  if (input.authorityKind === 'DISCRETIONARY_USER') {
    if (
      input.intakeAuthorization === undefined ||
      input.requiredCapability === undefined
    ) {
      invalid('Discretionary work requires commit-time reauthorization');
    }
    try {
      // Freshness comes from the authorization subsystem's server-held
      // principal/resolver metadata. The caller can provide intake evidence,
      // but cannot provide the commit-time verdict or bypass this resolution.
      const currentAuthorization = await reauthorizeOfficeCapability(
        input.intakeAuthorization,
      );
      commitAuthorization = bindCommitAuthorizationToCommand({
        command: input.command,
        currentAuthorization,
        requiredCapability: input.requiredCapability,
      });
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
        transition: null,
        simTime: input.commitSimTime,
        recordedAtReal: input.recordedAtReal,
      });
      return Object.freeze({
        source: 'NEW_FINAL',
        receipt: await input.persistence.recordZeroEffectReceipt(receipt),
      });
    }
  }

  const committed = await input.persistence.commitAuthorizedCommand({
    command: input.command,
    commitAuthorization,
  });
  return Object.freeze({
    source: 'NEW_FINAL',
    receipt: validateFinalReceiptForCommand({
      command: input.command,
      receipt: committed.receipt,
      transition: committed.transition,
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
