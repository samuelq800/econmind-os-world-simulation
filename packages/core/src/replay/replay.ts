import {
  canonicalSha256,
  type CanonicalSha256,
  type Sha256Hex,
} from '../commands/command.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  commandId,
  correlationId,
  eventId,
  eventType,
  worldId,
  type CommandId,
  type EventId,
  type EventType,
  type WorldId,
} from '../ids.js';
import { isSimTime, type SimTime } from '../numeric/sim-time.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  CURRENT_WORLD_VERSIONS,
  WORLD_MODEL_VERSION,
  WORLD_REGISTRY_VERSION,
  WORLD_SCHEMA_VERSION,
} from '../versions.js';
import {
  EVENT_SCHEMA_VERSION,
  type AuthoritativeEvent,
} from '../events/event.js';

export const REPLAY_SCHEMA_VERSION = 'replay-v1' as const;
export const REDUCER_REGISTRY_VERSION = 'v07-reducer-registry-1' as const;
export const WORLD_ENGINE_VERSION = 'world-v2-engine-foundation-1' as const;
export const NUMERIC_POLICY_VERSION =
  'world-decimal-exact-or-reject-1' as const;

const CANONICAL_NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const CANONICAL_POSITIVE_INTEGER = /^[1-9]\d*$/u;
const CANONICAL_STREAM_ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;

export interface ReplayVersionBinding {
  readonly replaySchemaVersion: typeof REPLAY_SCHEMA_VERSION;
  readonly eventSchemaVersion: typeof EVENT_SCHEMA_VERSION;
  readonly reducerRegistryVersion: string;
  readonly engineVersion: string;
  readonly modelVersion: string;
  readonly domainRegistryVersion: string;
  readonly worldSchemaVersion: string;
  readonly numericPolicyVersion: string;
}

export const CURRENT_REPLAY_BINDING: Readonly<ReplayVersionBinding> =
  Object.freeze({
    replaySchemaVersion: REPLAY_SCHEMA_VERSION,
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
    reducerRegistryVersion: REDUCER_REGISTRY_VERSION,
    engineVersion: WORLD_ENGINE_VERSION,
    modelVersion: WORLD_MODEL_VERSION,
    domainRegistryVersion: WORLD_REGISTRY_VERSION,
    worldSchemaVersion: WORLD_SCHEMA_VERSION,
    numericPolicyVersion: NUMERIC_POLICY_VERSION,
  });

export interface ReplaySeed {
  readonly canonicalSeed: string;
  readonly seedHash: CanonicalSha256;
}

export interface ReplayOrigin {
  readonly worldId: WorldId;
  readonly lastSequence: string;
  readonly worldVersion: string;
  readonly canonicalState: string;
  readonly stateHash: CanonicalSha256;
  readonly seedHash: CanonicalSha256;
  readonly bindingHash: CanonicalSha256;
}

export interface ReplayReducerEvent {
  readonly worldId: WorldId;
  readonly eventId: EventId;
  readonly causationCommandId: CommandId;
  readonly correctsEventId: EventId | null;
  readonly eventType: EventType;
  readonly sequence: string;
  readonly worldVersion: string;
  readonly simTime: SimTime;
  readonly payload: unknown;
}

export interface DeterministicReplayRandom {
  deriveHex(streamId: string, counter: string): CanonicalSha256;
}

export type ReplayReducer = (input: {
  readonly state: unknown;
  readonly event: Readonly<ReplayReducerEvent>;
  readonly random: DeterministicReplayRandom;
}) => unknown;

export interface ReplayReducerRegistry {
  readonly binding: ReplayVersionBinding;
  readonly reducers: Readonly<Record<string, ReplayReducer>>;
}

export interface ReplayResult extends ReplayOrigin {
  readonly state: unknown;
  readonly appliedEventIds: readonly EventId[];
}

function replayError(
  code: keyof Pick<
    typeof DOMAIN_ERROR_CODES,
    | 'REPLAY_INTEGRITY_INVALID'
    | 'REPLAY_SEQUENCE_INVALID'
    | 'REPLAY_STATE_MISMATCH'
    | 'VERSION_MISMATCH'
  >,
  message: string,
): never {
  throw new DomainError(DOMAIN_ERROR_CODES[code], message);
}

function parseCanonicalInteger(
  value: string,
  label: string,
  positive: boolean,
): bigint {
  const pattern = positive
    ? CANONICAL_POSITIVE_INTEGER
    : CANONICAL_NON_NEGATIVE_INTEGER;
  if (!pattern.test(value)) {
    replayError(
      'REPLAY_INTEGRITY_INVALID',
      `${label} must be a canonical ${positive ? 'positive' : 'non-negative'} integer`,
    );
  }
  return BigInt(value);
}

function parseCanonicalJson(value: string, label: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    replayError('REPLAY_INTEGRITY_INVALID', `${label} is not valid JSON`);
  }
  if (canonicalSerialize(parsed) !== value) {
    replayError('REPLAY_INTEGRITY_INVALID', `${label} is not canonical JSON`);
  }
  return deepFreeze(parsed);
}

function deepFreeze(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function hashCanonicalJson(
  canonicalJson: string,
  sha256Hex: Sha256Hex,
): CanonicalSha256 {
  return canonicalSha256(
    canonicalHashInput(parseCanonicalJson(canonicalJson, 'canonical value')),
    sha256Hex,
  );
}

function bindingHash(
  binding: ReplayVersionBinding,
  sha256Hex: Sha256Hex,
): CanonicalSha256 {
  return canonicalSha256(canonicalHashInput(binding), sha256Hex);
}

function assertCurrentBinding(binding: ReplayVersionBinding): void {
  if (
    canonicalSerialize(binding) !== canonicalSerialize(CURRENT_REPLAY_BINDING)
  ) {
    replayError(
      'VERSION_MISMATCH',
      'Replay version binding is not implemented by this reducer registry',
    );
  }
  if (
    binding.modelVersion !== CURRENT_WORLD_VERSIONS.model ||
    binding.domainRegistryVersion !== CURRENT_WORLD_VERSIONS.registry ||
    binding.worldSchemaVersion !== CURRENT_WORLD_VERSIONS.schema
  ) {
    replayError('VERSION_MISMATCH', 'Replay World version binding mismatch');
  }
}

export function createReplaySeed(
  seed: unknown,
  sha256Hex: Sha256Hex,
): Readonly<ReplaySeed> {
  const canonicalSeed = canonicalSerialize(seed);
  return Object.freeze({
    canonicalSeed,
    seedHash: canonicalSha256(
      canonicalHashInput({ seed: parseCanonicalJson(canonicalSeed, 'seed') }),
      sha256Hex,
    ),
  });
}

export function createReplayOrigin(input: {
  readonly worldId: WorldId;
  readonly lastSequence: string;
  readonly worldVersion: string;
  readonly state: unknown;
  readonly seed: ReplaySeed;
  readonly binding: ReplayVersionBinding;
  readonly sha256Hex: Sha256Hex;
}): Readonly<ReplayOrigin> {
  parseCanonicalInteger(input.lastSequence, 'lastSequence', false);
  parseCanonicalInteger(input.worldVersion, 'worldVersion', false);
  assertCurrentBinding(input.binding);
  const canonicalState = canonicalSerialize(input.state);
  return Object.freeze({
    worldId: worldId(input.worldId),
    lastSequence: input.lastSequence,
    worldVersion: input.worldVersion,
    canonicalState,
    stateHash: hashCanonicalJson(canonicalState, input.sha256Hex),
    seedHash: input.seed.seedHash,
    bindingHash: bindingHash(input.binding, input.sha256Hex),
  });
}

export function createReplayReducerRegistry(input: {
  readonly binding: ReplayVersionBinding;
  readonly reducers: Readonly<Record<string, ReplayReducer>>;
}): Readonly<ReplayReducerRegistry> {
  assertCurrentBinding(input.binding);
  const descriptors = Object.getOwnPropertyDescriptors(input.reducers);
  const reducers: Record<string, ReplayReducer> = {};
  for (const key of Object.keys(descriptors).sort()) {
    eventType(key);
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      typeof descriptor.value !== 'function' ||
      !descriptor.enumerable
    ) {
      replayError(
        'VERSION_MISMATCH',
        'Reducer registry must be an explicit inert map',
      );
    }
    reducers[key] = descriptor.value as ReplayReducer;
  }
  return Object.freeze({
    binding: input.binding,
    reducers: Object.freeze(reducers),
  });
}

function verifyOrigin(input: {
  readonly origin: ReplayOrigin;
  readonly seed: ReplaySeed;
  readonly binding: ReplayVersionBinding;
  readonly sha256Hex: Sha256Hex;
}): unknown {
  worldId(input.origin.worldId);
  parseCanonicalInteger(input.origin.lastSequence, 'lastSequence', false);
  parseCanonicalInteger(input.origin.worldVersion, 'worldVersion', false);
  assertCurrentBinding(input.binding);
  if (input.origin.seedHash !== input.seed.seedHash) {
    replayError('REPLAY_INTEGRITY_INVALID', 'Replay seed provenance mismatch');
  }
  if (
    input.origin.bindingHash !== bindingHash(input.binding, input.sha256Hex)
  ) {
    replayError('VERSION_MISMATCH', 'Replay origin version binding mismatch');
  }
  const state = parseCanonicalJson(input.origin.canonicalState, 'origin state');
  if (
    input.origin.stateHash !==
    hashCanonicalJson(input.origin.canonicalState, input.sha256Hex)
  ) {
    replayError('REPLAY_STATE_MISMATCH', 'Replay origin state hash mismatch');
  }
  return state;
}

function verifyEvent(
  event: AuthoritativeEvent,
  sha256Hex: Sha256Hex,
): Readonly<ReplayReducerEvent> {
  if (event.schemaVersion !== EVENT_SCHEMA_VERSION) {
    replayError('VERSION_MISMATCH', 'Unsupported Event schema during replay');
  }
  if (!isSimTime(event.simTime)) {
    replayError('REPLAY_INTEGRITY_INVALID', 'Event SimTime is not canonical');
  }
  const canonicalPayload = parseCanonicalJson(
    event.canonicalPayload,
    'Event canonical payload',
  );
  const payloadHash = canonicalSha256(
    canonicalHashInput(canonicalPayload),
    sha256Hex,
  );
  if (event.payloadHash !== payloadHash) {
    replayError('REPLAY_INTEGRITY_INVALID', 'Event payload hash mismatch');
  }
  const intent = Object.freeze({
    causationCommandId: commandId(event.causationCommandId),
    correlationId: correlationId(event.correlationId),
    correctsEventId:
      event.correctsEventId === null ? null : eventId(event.correctsEventId),
    eventId: eventId(event.eventId),
    eventType: eventType(event.eventType),
    canonicalPayload: event.canonicalPayload,
    schemaVersion: EVENT_SCHEMA_VERSION,
    sequence: event.sequence,
    simTime: event.simTime,
    worldId: worldId(event.worldId),
    worldVersion: event.worldVersion,
  });
  parseCanonicalInteger(intent.sequence, 'Event sequence', true);
  parseCanonicalInteger(intent.worldVersion, 'Event WorldVersion', true);
  if (
    event.fingerprint !== canonicalSha256(canonicalHashInput(intent), sha256Hex)
  ) {
    replayError('REPLAY_INTEGRITY_INVALID', 'Event fingerprint mismatch');
  }
  return Object.freeze({
    worldId: intent.worldId,
    eventId: intent.eventId,
    causationCommandId: intent.causationCommandId,
    correctsEventId: intent.correctsEventId,
    eventType: intent.eventType,
    sequence: intent.sequence,
    worldVersion: intent.worldVersion,
    simTime: intent.simTime,
    payload: canonicalPayload,
  });
}

function eventRandom(input: {
  readonly seed: ReplaySeed;
  readonly event: ReplayReducerEvent;
  readonly bindingHash: CanonicalSha256;
  readonly sha256Hex: Sha256Hex;
}): DeterministicReplayRandom {
  return Object.freeze({
    deriveHex(streamId: string, counter: string): CanonicalSha256 {
      if (!CANONICAL_STREAM_ID.test(streamId)) {
        replayError(
          'REPLAY_INTEGRITY_INVALID',
          'RNG stream ID is not canonical',
        );
      }
      parseCanonicalInteger(counter, 'RNG counter', false);
      return canonicalSha256(
        canonicalHashInput({
          bindingHash: input.bindingHash,
          counter,
          eventId: input.event.eventId,
          seedHash: input.seed.seedHash,
          streamId,
          worldId: input.event.worldId,
        }),
        input.sha256Hex,
      );
    },
  });
}

export function replayAuthoritativeEvents(input: {
  readonly origin: ReplayOrigin;
  readonly seed: ReplaySeed;
  readonly binding: ReplayVersionBinding;
  readonly registry: ReplayReducerRegistry;
  readonly events: readonly AuthoritativeEvent[];
  readonly sha256Hex: Sha256Hex;
}): Readonly<ReplayResult> {
  if (
    canonicalSerialize(input.registry.binding) !==
    canonicalSerialize(input.binding)
  ) {
    replayError('VERSION_MISMATCH', 'Reducer registry binding mismatch');
  }
  let state = verifyOrigin(input);
  let expectedSequence =
    parseCanonicalInteger(input.origin.lastSequence, 'lastSequence', false) +
    1n;
  let expectedWorldVersion =
    parseCanonicalInteger(input.origin.worldVersion, 'worldVersion', false) +
    1n;
  const appliedEventIds: EventId[] = [];
  const currentBindingHash = bindingHash(input.binding, input.sha256Hex);

  for (const authoritativeEvent of input.events) {
    const event = verifyEvent(authoritativeEvent, input.sha256Hex);
    if (event.worldId !== input.origin.worldId) {
      replayError(
        'REPLAY_SEQUENCE_INVALID',
        'Replay Event belongs to another World',
      );
    }
    if (BigInt(event.sequence) !== expectedSequence) {
      replayError(
        'REPLAY_SEQUENCE_INVALID',
        `Replay expected Event sequence ${expectedSequence.toString()}`,
      );
    }
    if (BigInt(event.worldVersion) !== expectedWorldVersion) {
      replayError(
        'REPLAY_SEQUENCE_INVALID',
        `Replay expected WorldVersion ${expectedWorldVersion.toString()}`,
      );
    }
    const reducer = input.registry.reducers[event.eventType];
    if (reducer === undefined) {
      replayError(
        'VERSION_MISMATCH',
        `No reducer for Event type ${event.eventType}`,
      );
    }
    const next = reducer({
      state,
      event,
      random: eventRandom({
        seed: input.seed,
        event,
        bindingHash: currentBindingHash,
        sha256Hex: input.sha256Hex,
      }),
    });
    const canonicalState = canonicalSerialize(next);
    state = parseCanonicalJson(canonicalState, 'reducer state');
    appliedEventIds.push(event.eventId);
    expectedSequence += 1n;
    expectedWorldVersion += 1n;
  }

  const canonicalState = canonicalSerialize(state);
  return Object.freeze({
    worldId: input.origin.worldId,
    lastSequence: (expectedSequence - 1n).toString(),
    worldVersion: (expectedWorldVersion - 1n).toString(),
    canonicalState,
    stateHash: hashCanonicalJson(canonicalState, input.sha256Hex),
    seedHash: input.seed.seedHash,
    bindingHash: currentBindingHash,
    state,
    appliedEventIds: Object.freeze(appliedEventIds),
  });
}

export type ReplayStateComparison =
  | Readonly<{
      matches: true;
      stateHash: CanonicalSha256;
    }>
  | Readonly<{
      matches: false;
      liveStateHash: CanonicalSha256;
      replayStateHash: CanonicalSha256;
    }>;

export function compareReplayState(input: {
  readonly liveState: unknown;
  readonly replay: ReplayResult;
  readonly sha256Hex: Sha256Hex;
}): ReplayStateComparison {
  const canonicalLiveState = canonicalSerialize(input.liveState);
  const liveStateHash = hashCanonicalJson(canonicalLiveState, input.sha256Hex);
  return liveStateHash === input.replay.stateHash
    ? Object.freeze({ matches: true, stateHash: liveStateHash })
    : Object.freeze({
        matches: false,
        liveStateHash,
        replayStateHash: input.replay.stateHash,
      });
}
