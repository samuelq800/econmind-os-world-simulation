import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  POLITICAL_CAPITAL_BUCKETS,
  preparePoliticalCapitalAllocation,
  type PoliticalCapitalBucket,
  type PoliticalCapitalSnapshot,
} from '../engine-kernels/captain-strategy-governance-preparation.js';
import {
  createFoundationFact,
  foundationFactPayload,
  type FoundationFact,
  type FoundationTraceRequest,
} from '../engine-kernels/foundation-provenance.js';
import { type ExactQuantity } from '../engine-kernels/common.js';
import {
  EVENT_SCHEMA_VERSION,
  parseAuthoritativeEvent,
  validateAuthoritativeEvent,
  type AuthoritativeEvent,
} from '../events/event.js';
import {
  canonicalDecimal,
  parseWorldDecimal,
} from '../numeric/world-decimal.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  canonicalSha256,
  parseCanonicalCommand,
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import {
  isCommitAuthorizationProof,
  type CommitAuthorizationProof,
} from './receipt.js';

export const CAPTAIN_POLITICAL_CAPITAL_COMMAND =
  'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1' as const;
export const CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA =
  'captain-political-capital-allocation-v1' as const;
export const CAPTAIN_POLITICAL_CAPITAL_EVENT =
  'CAPTAIN_POLITICAL_CAPITAL_ALLOCATED_V1' as const;
export const CAPTAIN_POLITICAL_CAPITAL_CAPABILITY = 'CAPTAIN_CABINET' as const;
const EVENT_PAYLOAD_SCHEMA = 'captain-political-capital-event-v1' as const;
const REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const VERSION = /^(?:0|[1-9]\d*)$/u;

export interface CaptainPoliticalCapitalTerms {
  readonly schemaVersion: typeof CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA;
  readonly fromBucket: PoliticalCapitalBucket;
  readonly toBucket: PoliticalCapitalBucket;
  readonly amount: ExactQuantity;
  readonly reasonFactRef: string;
}

export interface CaptainPoliticalCapitalReason {
  readonly countryRef: string;
  readonly recordRef: string;
  readonly reason: string;
}

/** Data contract, NOT an authority issuer. Only a server-owned lineage reader may supply it. */
export interface CaptainPoliticalCapitalSourceSnapshot {
  readonly worldId: string;
  readonly countryId: string;
  readonly worldVersion: string;
  readonly lastEventSequence: string;
  readonly trace: FoundationTraceRequest;
  readonly capitalFact: FoundationFact<PoliticalCapitalSnapshot>;
  readonly reasonFact: FoundationFact<CaptainPoliticalCapitalReason>;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function record(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  const inert: unknown = JSON.parse(canonicalSerialize(value));
  if (inert === null || typeof inert !== 'object' || Array.isArray(inert))
    invalid('Expected canonical record');
  const keys = Object.keys(inert);
  if (
    keys.length !== fields.length ||
    keys.some((key) => !fields.includes(key))
  )
    invalid('Missing or unknown fields');
  return inert as Record<string, unknown>;
}

export function parseCaptainPoliticalCapitalAllocation(
  command: CanonicalCommand,
  sha256Hex: Sha256Hex,
): Readonly<CaptainPoliticalCapitalTerms> {
  validateCanonicalCommand(command, sha256Hex);
  if (
    command.commandType !== CAPTAIN_POLITICAL_CAPITAL_COMMAND ||
    command.officeId !== 'CAPTAIN' ||
    command.expectedWorldVersion === null
  )
    invalid('Requires a versioned Captain allocation Command');
  const payload = record(JSON.parse(command.canonicalPayload), [
    'schemaVersion',
    'fromBucket',
    'toBucket',
    'amount',
    'reasonFactRef',
  ]);
  if (payload.schemaVersion !== CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA)
    invalid('Unsupported Captain payload schema');
  const fromBucket = payload.fromBucket;
  const toBucket = payload.toBucket;
  if (
    !POLITICAL_CAPITAL_BUCKETS.includes(fromBucket as PoliticalCapitalBucket) ||
    !POLITICAL_CAPITAL_BUCKETS.includes(toBucket as PoliticalCapitalBucket) ||
    fromBucket === toBucket
  )
    invalid('Requires two distinct political-capital buckets');
  const amount = record(payload.amount, ['amount', 'unit']);
  if (typeof amount.amount !== 'string' || amount.unit !== 'political_capital')
    invalid('Allocation requires exact political_capital quantity');
  const decimal = parseWorldDecimal(amount.amount);
  if (!decimal.greaterThan(0) || canonicalDecimal(decimal) !== amount.amount)
    invalid('Allocation amount must be positive and canonical');
  if (
    typeof payload.reasonFactRef !== 'string' ||
    !REFERENCE.test(payload.reasonFactRef)
  )
    invalid('Allocation requires a stable reason record reference');
  return Object.freeze({
    schemaVersion: CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
    fromBucket: fromBucket as PoliticalCapitalBucket,
    toBucket: toBucket as PoliticalCapitalBucket,
    amount: Object.freeze({ amount: amount.amount, unit: 'political_capital' }),
    reasonFactRef: payload.reasonFactRef,
  });
}

export function assertCaptainPoliticalCapitalAuthorization(
  command: CanonicalCommand,
  proof: CommitAuthorizationProof | null,
): void {
  if (
    !isCommitAuthorizationProof(proof) ||
    proof.capability !== CAPTAIN_POLITICAL_CAPITAL_CAPABILITY ||
    proof.officeId !== 'CAPTAIN' ||
    proof.commandId !== command.commandId ||
    proof.commandFingerprint !== command.fingerprint ||
    proof.worldId !== command.worldId ||
    proof.countryId !== command.countryId ||
    proof.actorId !== command.actorId ||
    proof.authSubject !== command.authSubject
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED,
      'Captain allocation requires actual command-bound commit authority',
    );
  }
}

/** Hash binds the exact server read; neither the hash nor FoundationFact syntax proves authority. */
export function captainPoliticalCapitalSourceHash(
  source: Omit<CaptainPoliticalCapitalSourceSnapshot, 'trace'>,
  sha256Hex: Sha256Hex,
): string {
  return canonicalSha256(
    canonicalHashInput({
      worldId: source.worldId,
      countryId: source.countryId,
      worldVersion: source.worldVersion,
      lastEventSequence: source.lastEventSequence,
      capital: {
        factRef: source.capitalFact.factRef,
        sourceRef: source.capitalFact.sourceRef,
        predecessorFactRefs: source.capitalFact.predecessorFactRefs,
        payload: source.capitalFact.payload,
      },
      reason: {
        factRef: source.reasonFact.factRef,
        sourceRef: source.reasonFact.sourceRef,
        predecessorFactRefs: source.reasonFact.predecessorFactRefs,
        payload: source.reasonFact.payload,
      },
    }),
    sha256Hex,
  ).slice(7);
}

function calculate(
  command: CanonicalCommand,
  source: CaptainPoliticalCapitalSourceSnapshot,
  sha256Hex: Sha256Hex,
) {
  const terms = parseCaptainPoliticalCapitalAllocation(command, sha256Hex);
  if (
    source.worldId !== command.worldId ||
    source.countryId !== command.countryId ||
    source.worldVersion !== command.expectedWorldVersion ||
    !VERSION.test(source.worldVersion) ||
    !VERSION.test(source.lastEventSequence)
  )
    invalid('Source world/country/head does not match Command');
  if (
    source.trace.snapshot.lineageRef !== command.worldId ||
    source.trace.snapshot.sourceVersion !==
      `WORLD_VERSION_${source.worldVersion}` ||
    source.trace.snapshotAt.amount !== command.simTime.toCanonicalValue() ||
    source.trace.snapshotAt.unit !== 'sim_millisecond' ||
    source.trace.snapshot.snapshotHash !==
      captainPoliticalCapitalSourceHash(source, sha256Hex)
  )
    invalid('Source trace/hash/time does not match the exact server read');
  const capital = foundationFactPayload(
    source.trace,
    source.capitalFact,
    'capital',
  );
  const reason = foundationFactPayload(
    source.trace,
    source.reasonFact,
    'reason',
  );
  record(reason, ['countryRef', 'recordRef', 'reason']);
  if (
    capital.countryRef !== command.countryId ||
    reason.countryRef !== command.countryId ||
    source.reasonFact.factRef !== terms.reasonFactRef ||
    typeof reason.recordRef !== 'string' ||
    !REFERENCE.test(reason.recordRef) ||
    typeof reason.reason !== 'string' ||
    reason.reason.trim().length === 0
  )
    invalid('Missing or mismatched actual country reason record');
  const requestFact = createFoundationFact({
    trace: source.trace,
    factRef: `REQUEST.${command.commandId}`,
    sourceRef: `COMMAND.${command.commandId}`,
    predecessorFactRefs: [
      source.capitalFact.factRef,
      source.reasonFact.factRef,
    ],
    payload: {
      allocationRef: `ALLOCATION.${command.commandId}`,
      countryRef: command.countryId,
      fromBucket: terms.fromBucket,
      toBucket: terms.toBucket,
      amount: terms.amount,
      reasonFactRef: terms.reasonFactRef,
      effectiveAt: source.trace.snapshotAt,
    },
  });
  return preparePoliticalCapitalAllocation({
    trace: source.trace,
    capitalFact: source.capitalFact,
    requestFact,
  });
}

function commandEnvelope(command: CanonicalCommand) {
  return {
    actorId: command.actorId,
    authSubject: command.authSubject,
    commandId: command.commandId,
    commandType: command.commandType,
    correlationId: command.correlationId,
    countryId: command.countryId,
    expectedWorldVersion: command.expectedWorldVersion,
    idempotencyKey: command.idempotencyKey,
    officeId: command.officeId,
    payload: JSON.parse(command.canonicalPayload) as unknown,
    schemaVersion: command.schemaVersion,
    simTime: command.simTime.toCanonicalValue(),
    submittedAtReal: command.submittedAtReal,
    worldId: command.worldId,
  };
}

function eventPayload(
  command: CanonicalCommand,
  source: CaptainPoliticalCapitalSourceSnapshot,
  sha256Hex: Sha256Hex,
) {
  const result = calculate(command, source, sha256Hex);
  return Object.freeze({
    schemaVersion: EVENT_PAYLOAD_SCHEMA,
    command: commandEnvelope(command),
    commandFingerprint: command.fingerprint,
    source,
    capitalAfter: result.output.capital,
    transitions: result.transitions,
    preparationHash: canonicalSha256(result.replayProof.hashInput, sha256Hex),
  });
}

/** Pure calculation. Issuing/committing an authoritative event remains the Worker responsibility. */
export function prepareCaptainPoliticalCapitalEvent(input: {
  readonly command: CanonicalCommand;
  readonly source: CaptainPoliticalCapitalSourceSnapshot;
  readonly eventId: string;
  readonly recordedAtReal: string;
  readonly sha256Hex: Sha256Hex;
}) {
  const payload = eventPayload(input.command, input.source, input.sha256Hex);
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: input.eventId,
      eventType: CAPTAIN_POLITICAL_CAPITAL_EVENT,
      worldId: input.command.worldId,
      causationCommandId: input.command.commandId,
      correlationId: input.command.correlationId,
      worldVersion: (BigInt(input.source.worldVersion) + 1n).toString(),
      sequence: (BigInt(input.source.lastEventSequence) + 1n).toString(),
      simTime: input.command.simTime.toCanonicalValue(),
      recordedAtReal: input.recordedAtReal,
      correctsEventId: null,
      payload,
    },
    input.sha256Hex,
  );
  return Object.freeze({ event, capitalAfter: payload.capitalAfter });
}

export interface CaptainPoliticalCapitalReplayState {
  readonly worldId: string;
  readonly countryId: string;
  readonly worldVersion: string;
  readonly lastEventSequence: string;
  readonly capital: PoliticalCapitalSnapshot;
  readonly applied: readonly Readonly<{
    commandId: string;
    commandFingerprint: string;
    eventId: string;
    eventFingerprint: string;
  }>[];
}

/** Recomputes the existing kernel from event evidence, never applies client-supplied deltas. */
export function replayCaptainPoliticalCapitalAllocation(input: {
  readonly state: CaptainPoliticalCapitalReplayState;
  readonly event: AuthoritativeEvent;
  readonly sha256Hex: Sha256Hex;
}): CaptainPoliticalCapitalReplayState {
  const { state, event, sha256Hex } = input;
  validateAuthoritativeEvent(event, sha256Hex);
  if (
    event.eventType !== CAPTAIN_POLITICAL_CAPITAL_EVENT ||
    event.worldId !== state.worldId ||
    event.correctsEventId !== null
  )
    invalid('Not an allocation event for this replay world');
  const payload = record(JSON.parse(event.canonicalPayload), [
    'schemaVersion',
    'command',
    'commandFingerprint',
    'source',
    'capitalAfter',
    'transitions',
    'preparationHash',
  ]);
  const command = parseCanonicalCommand(payload.command, sha256Hex);
  const source = payload.source as CaptainPoliticalCapitalSourceSnapshot;
  if (
    command.countryId !== state.countryId ||
    event.causationCommandId !== command.commandId ||
    event.correlationId !== command.correlationId ||
    event.worldId !== command.worldId ||
    event.simTime.toCanonicalValue() !== command.simTime.toCanonicalValue() ||
    event.worldVersion !== (BigInt(source.worldVersion) + 1n).toString() ||
    event.sequence !== (BigInt(source.lastEventSequence) + 1n).toString()
  )
    invalid('Event identity/version/time/scope is not bound to its Command');
  if (
    canonicalSerialize(payload) !==
    canonicalSerialize(eventPayload(command, source, sha256Hex))
  )
    invalid('Event does not replay to the recorded exact allocation');
  const prior = state.applied.find(
    (entry) =>
      entry.commandId === command.commandId || entry.eventId === event.eventId,
  );
  if (prior !== undefined) {
    if (
      prior.commandId !== command.commandId ||
      prior.commandFingerprint !== command.fingerprint ||
      prior.eventId !== event.eventId ||
      prior.eventFingerprint !== event.fingerprint
    )
      throw new DomainError(
        DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
        'Conflicting Captain replay identity',
      );
    return state;
  }
  if (
    source.worldVersion !== state.worldVersion ||
    source.lastEventSequence !== state.lastEventSequence ||
    canonicalSerialize(source.capitalFact.payload) !==
      canonicalSerialize(state.capital)
  )
    invalid('Replay predecessor does not match current domain state/head');
  const capital = calculate(command, source, sha256Hex).output.capital;
  return Object.freeze({
    worldId: state.worldId,
    countryId: state.countryId,
    worldVersion: event.worldVersion,
    lastEventSequence: event.sequence,
    capital,
    applied: Object.freeze([
      ...state.applied,
      Object.freeze({
        commandId: command.commandId,
        commandFingerprint: command.fingerprint,
        eventId: event.eventId,
        eventFingerprint: event.fingerprint,
      }),
    ]),
  });
}
