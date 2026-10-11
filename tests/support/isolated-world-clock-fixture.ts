// Only synthetic fixture data. These bytes authenticate no real clock/control.
import {
  canonicalSerialize,
  createSimulationScheduler,
  startSimulationSeason,
  scheduleSimulationEvent,
  scheduleEventInput,
  scheduledEventId,
  SimTime,
  serializeSimulationSchedulerState,
} from '@econmind/core';
import {
  CLOCK_SCOPE,
  parseClockBinding,
  type ClockKind,
  type ClockHead,
} from '../../apps/world-worker/src/time/clock-contracts.js';

export function fixtureBinding(
  worldId = 'CLOCK_ISOLATED_UNIT',
  overrides: Record<string, unknown> = {},
) {
  let state = startSimulationSeason(createSimulationScheduler());
  for (const id of ['FIXED_EVENT_B', 'FIXED_EVENT_A']) {
    state = scheduleSimulationEvent(
      state,
      scheduleEventInput(
        scheduledEventId(id),
        'TEST_OBLIGATION',
        SimTime.fromTicks('100'),
        'FIXED_' + id,
      ),
    );
  }
  return canonicalSerialize({
    schemaVersion: 'ISOLATED_CLOCK_BASE_1',
    environment: CLOCK_SCOPE,
    worldId,
    baseGenesisRef: 'BASE_' + worldId,
    baseSchedulerBytes: serializeSimulationSchedulerState(state),
    baseRealMs: '1000',
    sourceProtocol: 'TEST_ONLY_RECORDED_REAL_MS',
    sourceVersion: '1',
    sourceEpoch: 'FIXTURE_EPOCH_1',
    provenanceRef: 'FIXTURE_NOT_AUTHORITY',
    ...overrides,
  });
}
export function fixtureObservation(
  bindingBytes: string,
  sourceRef: string,
  observedRealMs: string,
  overrides: Record<string, unknown> = {},
) {
  const b = parseClockBinding(bindingBytes);
  return canonicalSerialize({
    schemaVersion: 'ISOLATED_CLOCK_OBSERVATION_1',
    environment: b.environment,
    worldId: b.worldId,
    baseGenesisRef: b.baseGenesisRef,
    sourceProtocol: b.sourceProtocol,
    sourceVersion: b.sourceVersion,
    sourceEpoch: b.sourceEpoch,
    sourceRef,
    observedRealMs,
    provenanceRef: 'FIXTURE_NOT_AUTHORITY',
    ...overrides,
  });
}
export function fixtureIntent(
  bindingBytes: string,
  operationId: string,
  kind: ClockKind,
  previous: ClockHead | null,
  overrides: Record<string, unknown> = {},
) {
  const b = parseClockBinding(bindingBytes);
  return canonicalSerialize({
    schemaVersion: 'ISOLATED_CLOCK_INTENT_1',
    environment: b.environment,
    worldId: b.worldId,
    baseGenesisRef: b.baseGenesisRef,
    operationId,
    kind,
    sourceRef: 'SOURCE_' + operationId,
    expectedRevision: previous?.revision ?? '0',
    predecessorHash: previous?.recordHash ?? null,
    expectedWorldVersion: '0',
    holderId: 'FIXTURE_HOLDER',
    fencingToken: '1',
    ...overrides,
  });
}
