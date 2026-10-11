// UNREGISTERED ISOLATED MECHANICS. Every parsed value is data, NOT authority.
import { createHash } from 'node:crypto';
import {
  advanceClockInput,
  advanceRunningSimulationScheduler,
  pauseSimulationSeason,
  resumeSimulationSeason,
  restoreSimulationSchedulerState,
  serializeSimulationSchedulerState,
  canonicalSerialize,
  SIMULATION_CLOCK_VERSION,
  SIMULATION_SCHEDULER_VERSION,
  SCHEDULER_ORDER_VERSION,
} from '@econmind/core';

export const CLOCK_SCOPE = 'TEST_ONLY_ISOLATED' as const;
export const CLOCK_MAX_INTEGER = 9_223_372_036_854_775_807n;
export const CLOCK_MAX_BYTES = 262_144;
export const CLOCK_MAX_RECORDS = 4096;
export const CLOCK_KINDS = ['INIT', 'ADVANCE', 'PAUSE', 'RESUME'] as const;
export type ClockKind = (typeof CLOCK_KINDS)[number];
export function clockFail(code: string): never {
  throw new Error(code);
}
export function clockInteger(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]{0,18})$/u.test(value) ||
    BigInt(value) > CLOCK_MAX_INTEGER
  )
    clockFail('CLOCK_INTEGER_INVALID');
  return value;
}
export function clockRef(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z][A-Z0-9_-]{0,255}$/u.test(value))
    clockFail('CLOCK_REFERENCE_INVALID');
  return value;
}
export function clockDigest(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}
export function clockTimestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    clockFail('CLOCK_REAL_TIME_INVALID');
  return value;
}
function exact(
  bytes: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    typeof bytes !== 'string' ||
    Buffer.byteLength(bytes, 'utf8') > CLOCK_MAX_BYTES ||
    Buffer.from(bytes, 'utf8').toString('utf8') !== bytes
  )
    clockFail('CLOCK_BYTES_INVALID');
  const data: unknown = JSON.parse(bytes);
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    canonicalSerialize(data) !== bytes
  )
    clockFail('CLOCK_CANONICAL_BYTES_REQUIRED');
  if (
    Object.keys(data).length !== keys.length ||
    Object.keys(data).some((k) => !keys.includes(k))
  )
    clockFail('CLOCK_EXACT_FIELDS_REQUIRED');
  return data as Record<string, unknown>;
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value))
    clockFail('CLOCK_DIGEST_INVALID');
  return value;
}
export interface ClockFixtureBinding {
  readonly schemaVersion: 'ISOLATED_CLOCK_BASE_1';
  readonly environment: typeof CLOCK_SCOPE;
  readonly worldId: string;
  readonly baseGenesisRef: string;
  readonly baseSchedulerBytes: string;
  readonly baseRealMs: string;
  readonly sourceProtocol: 'TEST_ONLY_RECORDED_REAL_MS';
  readonly sourceVersion: '1';
  readonly sourceEpoch: string;
  readonly provenanceRef: string;
}
const bindingKeys = [
  'schemaVersion',
  'environment',
  'worldId',
  'baseGenesisRef',
  'baseSchedulerBytes',
  'baseRealMs',
  'sourceProtocol',
  'sourceVersion',
  'sourceEpoch',
  'provenanceRef',
];
export function parseClockBinding(
  bytes: string,
): Readonly<ClockFixtureBinding> {
  const d = exact(bytes, bindingKeys);
  if (
    d.schemaVersion !== 'ISOLATED_CLOCK_BASE_1' ||
    d.environment !== CLOCK_SCOPE ||
    d.sourceProtocol !== 'TEST_ONLY_RECORDED_REAL_MS' ||
    d.sourceVersion !== '1'
  )
    clockFail('CLOCK_FIXTURE_PROTOCOL_REQUIRED');
  const worldId = clockRef(d.worldId);
  if (!worldId.startsWith('CLOCK_ISOLATED_'))
    clockFail('CLOCK_FIXTURE_WORLD_REQUIRED');
  if (typeof d.baseSchedulerBytes !== 'string')
    clockFail('CLOCK_BASE_BYTES_REQUIRED');
  const state = restoreSimulationSchedulerState(d.baseSchedulerBytes);
  if (state.seasonStatus === 'ENDED' || state.scheduledEvents.length > 128)
    clockFail('CLOCK_BASE_SCOPE_INVALID');
  clockInteger(state.clock.simTime.toCanonicalValue());
  return Object.freeze({
    schemaVersion: 'ISOLATED_CLOCK_BASE_1',
    environment: CLOCK_SCOPE,
    worldId,
    baseGenesisRef: clockRef(d.baseGenesisRef),
    baseSchedulerBytes: d.baseSchedulerBytes,
    baseRealMs: clockInteger(d.baseRealMs),
    sourceProtocol: 'TEST_ONLY_RECORDED_REAL_MS',
    sourceVersion: '1',
    sourceEpoch: clockRef(d.sourceEpoch),
    provenanceRef: clockRef(d.provenanceRef),
  });
}
export interface ClockObservation {
  readonly schemaVersion: 'ISOLATED_CLOCK_OBSERVATION_1';
  readonly environment: typeof CLOCK_SCOPE;
  readonly worldId: string;
  readonly baseGenesisRef: string;
  readonly sourceProtocol: 'TEST_ONLY_RECORDED_REAL_MS';
  readonly sourceVersion: '1';
  readonly sourceEpoch: string;
  readonly sourceRef: string;
  readonly observedRealMs: string;
  readonly provenanceRef: string;
}
export function parseClockObservation(
  bytes: string,
  binding: ClockFixtureBinding,
  sourceRef: string,
): Readonly<ClockObservation> {
  const d = exact(bytes, [
    'schemaVersion',
    'environment',
    'worldId',
    'baseGenesisRef',
    'sourceProtocol',
    'sourceVersion',
    'sourceEpoch',
    'sourceRef',
    'observedRealMs',
    'provenanceRef',
  ]);
  if (
    d.schemaVersion !== 'ISOLATED_CLOCK_OBSERVATION_1' ||
    d.environment !== binding.environment ||
    d.worldId !== binding.worldId ||
    d.baseGenesisRef !== binding.baseGenesisRef ||
    d.sourceProtocol !== binding.sourceProtocol ||
    d.sourceVersion !== binding.sourceVersion ||
    d.sourceEpoch !== binding.sourceEpoch ||
    d.sourceRef !== sourceRef
  )
    clockFail('CLOCK_SOURCE_BINDING_MISMATCH');
  return Object.freeze({
    schemaVersion: 'ISOLATED_CLOCK_OBSERVATION_1',
    environment: binding.environment,
    worldId: binding.worldId,
    baseGenesisRef: binding.baseGenesisRef,
    sourceProtocol: binding.sourceProtocol,
    sourceVersion: binding.sourceVersion,
    sourceEpoch: binding.sourceEpoch,
    sourceRef: clockRef(d.sourceRef),
    observedRealMs: clockInteger(d.observedRealMs),
    provenanceRef: clockRef(d.provenanceRef),
  });
}
export interface ClockIntent {
  readonly schemaVersion: 'ISOLATED_CLOCK_INTENT_1';
  readonly environment: typeof CLOCK_SCOPE;
  readonly worldId: string;
  readonly baseGenesisRef: string;
  readonly operationId: string;
  readonly kind: ClockKind;
  readonly sourceRef: string;
  readonly expectedRevision: string;
  readonly predecessorHash: string | null;
  readonly expectedWorldVersion: string;
  readonly holderId: string;
  readonly fencingToken: string;
}
export function parseClockIntent(
  bytes: string,
  binding: ClockFixtureBinding,
): Readonly<ClockIntent> {
  const d = exact(bytes, [
    'schemaVersion',
    'environment',
    'worldId',
    'baseGenesisRef',
    'operationId',
    'kind',
    'sourceRef',
    'expectedRevision',
    'predecessorHash',
    'expectedWorldVersion',
    'holderId',
    'fencingToken',
  ]);
  if (
    d.schemaVersion !== 'ISOLATED_CLOCK_INTENT_1' ||
    d.environment !== binding.environment ||
    d.worldId !== binding.worldId ||
    d.baseGenesisRef !== binding.baseGenesisRef ||
    !CLOCK_KINDS.includes(d.kind as ClockKind)
  )
    clockFail('CLOCK_INTENT_BINDING_INVALID');
  const expectedRevision = clockInteger(d.expectedRevision);
  const fencingToken = clockInteger(d.fencingToken);
  if (fencingToken === '0') clockFail('CLOCK_FENCE_INVALID');
  if (
    (d.kind === 'INIT') !==
    (expectedRevision === '0' && d.predecessorHash === null)
  )
    clockFail('CLOCK_INIT_PREDECESSOR_INVALID');
  return Object.freeze({
    schemaVersion: 'ISOLATED_CLOCK_INTENT_1',
    environment: CLOCK_SCOPE,
    worldId: binding.worldId,
    baseGenesisRef: binding.baseGenesisRef,
    operationId: clockRef(d.operationId),
    kind: d.kind as ClockKind,
    sourceRef: clockRef(d.sourceRef),
    expectedRevision,
    predecessorHash:
      d.predecessorHash === null ? null : digest(d.predecessorHash),
    expectedWorldVersion: clockInteger(d.expectedWorldVersion),
    holderId: clockRef(d.holderId),
    fencingToken,
  });
}
export interface ClockHead {
  readonly revision: string;
  readonly recordHash: string;
  readonly stateBytes: string;
  readonly anchorRealMs: string;
}
export interface ClockRecord {
  readonly originalBytes: string;
  readonly recordHash: string;
  readonly intent: Readonly<ClockIntent>;
  readonly sourceBytes: string;
  readonly head: Readonly<ClockHead>;
}
const envelopeKeys = [
  'schemaVersion',
  'classification',
  'bindingBytes',
  'intentBytes',
  'sourceBytes',
  'revision',
  'predecessorHash',
  'anchorBeforeRealMs',
  'anchorAfterRealMs',
  'activeRealMilliseconds',
  'beforeBytes',
  'afterBytes',
  'beforeHash',
  'afterHash',
  'clockVersion',
  'schedulerVersion',
  'orderVersion',
  'leaseObservedAtReal',
  'auditProvenanceRef',
];
/** Pure TEST_ONLY derivation; cannot grant authority, complete work or perform SQL. */
export function deriveClockRecord(input: {
  readonly bindingBytes: string;
  readonly intentBytes: string;
  readonly sourceBytes: string;
  readonly previous: Readonly<ClockHead> | null;
  readonly leaseObservedAtReal: string;
}): Readonly<ClockRecord> {
  const binding = parseClockBinding(input.bindingBytes);
  const intent = parseClockIntent(input.intentBytes, binding);
  const observation = parseClockObservation(
    input.sourceBytes,
    binding,
    intent.sourceRef,
  );
  const previous = input.previous;
  if (
    intent.expectedRevision !== (previous?.revision ?? '0') ||
    intent.predecessorHash !== (previous?.recordHash ?? null)
  )
    clockFail('CLOCK_PREDECESSOR_CONFLICT');
  if ((intent.kind === 'INIT') !== (previous === null))
    clockFail('CLOCK_INIT_CONFLICT');
  const anchor = previous?.anchorRealMs ?? binding.baseRealMs;
  const at = observation.observedRealMs;
  if (BigInt(at) < BigInt(anchor)) clockFail('CLOCK_OBSERVATION_REGRESSION');
  let state = restoreSimulationSchedulerState(
    previous?.stateBytes ?? binding.baseSchedulerBytes,
  );
  let active = '0';
  if (intent.kind === 'INIT') {
    if (at !== binding.baseRealMs) clockFail('CLOCK_INIT_OBSERVATION_MISMATCH');
  } else if (intent.kind === 'RESUME') {
    state = resumeSimulationSeason(state); // does not accumulate paused interval
  } else {
    active = (BigInt(at) - BigInt(anchor)).toString();
    state = advanceRunningSimulationScheduler(
      state,
      advanceClockInput(active),
    ).state;
    if (intent.kind === 'PAUSE') state = pauseSimulationSeason(state);
  }
  clockInteger(state.clock.simTime.toCanonicalValue());
  const revision = clockInteger(
    (BigInt(intent.expectedRevision) + 1n).toString(),
  );
  const stateBytes = serializeSimulationSchedulerState(state);
  const originalBytes = canonicalSerialize({
    schemaVersion: 'ISOLATED_CLOCK_RECORD_1',
    classification: 'TEST_ONLY_NOT_AUTHORITY',
    bindingBytes: input.bindingBytes,
    intentBytes: input.intentBytes,
    sourceBytes: input.sourceBytes,
    revision,
    predecessorHash: intent.predecessorHash,
    anchorBeforeRealMs: anchor,
    anchorAfterRealMs: at,
    activeRealMilliseconds: active,
    beforeBytes: previous?.stateBytes ?? null,
    afterBytes: stateBytes,
    beforeHash: previous ? clockDigest(previous.stateBytes) : null,
    afterHash: clockDigest(stateBytes),
    clockVersion: SIMULATION_CLOCK_VERSION,
    schedulerVersion: SIMULATION_SCHEDULER_VERSION,
    orderVersion: SCHEDULER_ORDER_VERSION,
    leaseObservedAtReal: clockTimestamp(input.leaseObservedAtReal),
    auditProvenanceRef: observation.provenanceRef,
  });
  if (Buffer.byteLength(originalBytes, 'utf8') > CLOCK_MAX_BYTES)
    clockFail('CLOCK_RECORD_TOO_LARGE');
  const recordHash = clockDigest(originalBytes);
  return Object.freeze({
    originalBytes,
    recordHash,
    intent,
    sourceBytes: input.sourceBytes,
    head: Object.freeze({ revision, recordHash, stateBytes, anchorRealMs: at }),
  });
}
/** Reapply every original input. Full canonical bytes, not merely hash comparison. */
export function replayClockRecords(
  bindingBytes: string,
  records: readonly string[],
): readonly Readonly<ClockRecord>[] {
  parseClockBinding(bindingBytes);
  if (records.length > CLOCK_MAX_RECORDS)
    clockFail('CLOCK_REPLAY_BOUND_EXCEEDED');
  const result: Readonly<ClockRecord>[] = [];
  const seen = new Set<string>();
  for (const bytes of records) {
    const d = exact(bytes, envelopeKeys);
    if (
      d.bindingBytes !== bindingBytes ||
      typeof d.intentBytes !== 'string' ||
      typeof d.sourceBytes !== 'string'
    )
      clockFail('CLOCK_RECORD_BINDING_MISMATCH');
    const next = deriveClockRecord({
      bindingBytes,
      intentBytes: d.intentBytes,
      sourceBytes: d.sourceBytes,
      previous: result.at(-1)?.head ?? null,
      leaseObservedAtReal: clockTimestamp(d.leaseObservedAtReal),
    });
    if (next.originalBytes !== bytes || seen.has(next.intent.operationId))
      clockFail('CLOCK_REPLAY_BYTES_MISMATCH');
    seen.add(next.intent.operationId);
    result.push(next);
  }
  return Object.freeze(result);
}
