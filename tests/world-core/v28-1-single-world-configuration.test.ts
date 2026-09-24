import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { AUTHORITATIVE_TRANSITION_SCHEMA_VERSION } from '../../packages/core/src/commands/receipt.js';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
} from '../../packages/core/src/errors.js';
import {
  EVENT_SCHEMA_VERSION,
  parseAuthoritativeEvent,
} from '../../packages/core/src/events/event.js';
import { worldId } from '../../packages/core/src/ids.js';
import {
  bindSingleWorldReplayInput,
  prepareSingleWorldConfiguration,
  SINGLE_WORLD_CONFIGURATION_VERSION,
  type SharedCoreReplayInput,
  type SingleWorldConfigurationSnapshot,
} from '../../packages/core/src/orchestration/single-world-configuration.js';
import {
  CURRENT_REPLAY_BINDING,
  createReplayOrigin,
  createReplayReducerRegistry,
  createReplaySeed,
  replayAuthoritativeEvents,
} from '../../packages/core/src/replay/replay.js';
import { SIMULATION_CLOCK_VERSION } from '../../packages/core/src/time/simulation-clock.js';
import { WORLD_MODEL_VERSION } from '../../packages/core/src/versions.js';

const WORLD = worldId('WORLD_SINGLE_TEST');
const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');

function configuration(countryCount = '2') {
  return {
    schemaVersion: SINGLE_WORLD_CONFIGURATION_VERSION,
    worldId: WORLD,
    modelVersion: WORLD_MODEL_VERSION,
    countryCount,
    countryConfigurationRef: `sha256:${'a'.repeat(64)}`,
    clockVersion: SIMULATION_CLOCK_VERSION,
    economicExpiryClock: 'SIM_TIME',
  };
}

function replayInput(): SharedCoreReplayInput {
  const seed = createReplaySeed({ physicalOpening: '5' }, sha256);
  const origin = createReplayOrigin({
    worldId: WORLD,
    lastSequence: '0',
    worldVersion: '0',
    state: { stock: '5' },
    seed,
    binding: CURRENT_REPLAY_BINDING,
    sha256Hex: sha256,
  });
  const event = parseAuthoritativeEvent(
    {
      causationCommandId: 'COMMAND_ALLOCATE',
      correlationId: 'CORRELATION_ALLOCATE',
      correctsEventId: null,
      eventId: 'EVENT_ALLOCATE',
      eventType: 'STOCK_CONSUMED',
      payload: { quantity: '2' },
      recordedAtReal: '2026-09-24T00:00:00.000Z',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sequence: '1',
      simTime: '10000',
      worldId: WORLD,
      worldVersion: '1',
    },
    sha256,
  );
  const registry = createReplayReducerRegistry({
    binding: CURRENT_REPLAY_BINDING,
    reducers: {
      STOCK_CONSUMED: ({ state, event: replayEvent }) => {
        const current = state as { readonly stock: string };
        const payload = replayEvent.payload as { readonly quantity: string };
        return {
          stock: (BigInt(current.stock) - BigInt(payload.quantity)).toString(),
        };
      },
    },
  });
  return {
    origin,
    seed,
    binding: CURRENT_REPLAY_BINDING,
    registry,
    transitions: [
      {
        schemaVersion: AUTHORITATIVE_TRANSITION_SCHEMA_VERSION,
        transitionId: event.causationCommandId,
        worldId: WORLD,
        commandId: event.causationCommandId,
        commandFingerprint: `sha256:${'a'.repeat(64)}`,
        worldVersionBefore: '0',
        worldVersionAfter: '1',
        eventIds: [event.eventId],
        events: [event],
      },
    ],
    sha256Hex: sha256,
  };
}

function expectDomainError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error('Expected DomainError');
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
  }
}

describe('single World configuration preparation', () => {
  it('produces deterministic, immutable canonical evidence from configured country count', () => {
    const first = prepareSingleWorldConfiguration(configuration('2'), sha256);
    const repeated = prepareSingleWorldConfiguration(
      configuration('2'),
      sha256,
    );
    const wider = prepareSingleWorldConfiguration(configuration('70'), sha256);
    expect(first).toEqual(repeated);
    expect(first.snapshotHash).not.toBe(wider.snapshotHash);
    expect(first.configuration.countryCount).toBe('2');
    expect(first.configuration.countryConfigurationRef).toBe(
      `sha256:${'a'.repeat(64)}`,
    );
    expect(wider.configuration.countryCount).toBe('70');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.configuration)).toBe(true);
    expect(first.configuration).not.toHaveProperty('mode');
    expect(first.configuration).not.toHaveProperty('resourceBonus');
  });

  it('rejects a mode, Season-specific fields and hidden economic buffs', () => {
    for (const extra of [
      { mode: 'SEASON' },
      { registrationClosesAtReal: '2026-09-24T00:00:00.000Z' },
      { resourceBonus: '100' },
    ]) {
      expectDomainError(
        () =>
          prepareSingleWorldConfiguration(
            { ...configuration(), ...extra },
            sha256,
          ),
        DOMAIN_ERROR_CODES.SCHEDULER_INPUT_INVALID,
      );
    }
  });

  it('rejects missing, malformed and mismatched configuration fields', () => {
    const missing: Record<string, unknown> = { ...configuration() };
    delete missing.countryCount;
    expectDomainError(
      () => prepareSingleWorldConfiguration(missing, sha256),
      DOMAIN_ERROR_CODES.SCHEDULER_INPUT_INVALID,
    );
    expectDomainError(
      () =>
        prepareSingleWorldConfiguration(
          { ...configuration(), countryConfigurationRef: 'source.SEASON' },
          sha256,
        ),
      DOMAIN_ERROR_CODES.SCHEDULER_INPUT_INVALID,
    );
    for (const count of ['0', '02', '-1', '2.0']) {
      expectDomainError(
        () => prepareSingleWorldConfiguration(configuration(count), sha256),
        DOMAIN_ERROR_CODES.SCHEDULER_INPUT_INVALID,
      );
    }
    expectDomainError(
      () =>
        prepareSingleWorldConfiguration(
          { ...configuration(), modelVersion: 'other-model' },
          sha256,
        ),
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
    );
    expectDomainError(
      () =>
        prepareSingleWorldConfiguration(
          { ...configuration(), clockVersion: 'other-clock' },
          sha256,
        ),
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
    );
    expectDomainError(
      () =>
        prepareSingleWorldConfiguration(
          { ...configuration(), economicExpiryClock: 'REAL_TIME' },
          sha256,
        ),
      DOMAIN_ERROR_CODES.SCHEDULER_INPUT_INVALID,
    );
  });

  it('binds one existing replay path and reproduces the same physical result', () => {
    const snapshot = prepareSingleWorldConfiguration(configuration(), sha256);
    const input = replayInput();
    const bound = bindSingleWorldReplayInput(snapshot, input);
    expect(bound).toBe(input);
    const first = replayAuthoritativeEvents(bound);
    const repeated = replayAuthoritativeEvents(
      bindSingleWorldReplayInput(snapshot, input),
    );
    expect(first).toEqual(repeated);
    expect(first.state).toEqual({ stock: '3' });
    expect(input.origin.canonicalState).toBe('{"stock":"5"}');
  });

  it('rejects forged snapshots and cross-World/model replay evidence', () => {
    const snapshot = prepareSingleWorldConfiguration(configuration(), sha256);
    const input = replayInput();
    expectDomainError(
      () =>
        bindSingleWorldReplayInput(
          { ...snapshot } as SingleWorldConfigurationSnapshot,
          input,
        ),
      DOMAIN_ERROR_CODES.SCHEDULER_INPUT_INVALID,
    );
    expectDomainError(
      () =>
        bindSingleWorldReplayInput(snapshot, {
          ...input,
          origin: { ...input.origin, worldId: worldId('WORLD_OTHER') },
        }),
      DOMAIN_ERROR_CODES.SCHEDULER_INPUT_INVALID,
    );
    expectDomainError(
      () =>
        bindSingleWorldReplayInput(snapshot, {
          ...input,
          binding: { ...input.binding, modelVersion: 'other-model' },
        }),
      DOMAIN_ERROR_CODES.SCHEDULER_INPUT_INVALID,
    );
  });
});
