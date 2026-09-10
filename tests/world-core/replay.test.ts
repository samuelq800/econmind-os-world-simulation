import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CURRENT_REPLAY_BINDING,
  DOMAIN_ERROR_CODES,
  DomainError,
  EVENT_SCHEMA_VERSION,
  SimTime,
  compareReplayState,
  createReplayOrigin,
  createReplayReducerRegistry,
  createReplaySeed,
  parseAuthoritativeEvent,
  replayAuthoritativeEvents,
  worldId,
  type AuthoritativeEvent,
  type ReplayReducer,
  type ReplayVersionBinding,
} from '../../packages/core/src/index.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');

function event(input: {
  sequence: number;
  eventType?: string;
  payload?: unknown;
  world?: string;
  recordedAtReal?: string;
}): AuthoritativeEvent {
  return parseAuthoritativeEvent(
    {
      causationCommandId: 'COMMAND_1',
      correlationId: 'CORRELATION_1',
      correctsEventId: null,
      eventId: `EVENT_${input.sequence}`,
      eventType: input.eventType ?? 'VALUE_ADDED',
      payload: input.payload ?? { amount: '1' },
      recordedAtReal: input.recordedAtReal ?? '2026-09-10T00:00:01.000Z',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sequence: String(input.sequence),
      simTime: String(10_000 + input.sequence),
      worldId: input.world ?? 'WORLD_1',
      worldVersion: String(input.sequence),
    },
    sha256,
  );
}

const valueReducer: ReplayReducer = ({ state, event }) => {
  const current = state as { readonly total: string; readonly draws: string[] };
  const payload = event.payload as { readonly amount: string };
  return {
    draws: [...current.draws],
    total: (BigInt(current.total) + BigInt(payload.amount)).toString(),
  };
};

const randomReducer: ReplayReducer = ({ state, random }) => {
  const current = state as { readonly total: string; readonly draws: string[] };
  return {
    draws: [...current.draws, random.deriveHex('DRAW', '0')],
    total: current.total,
  };
};

function registry() {
  return createReplayReducerRegistry({
    binding: CURRENT_REPLAY_BINDING,
    reducers: {
      RANDOM_RECORDED: randomReducer,
      VALUE_ADDED: valueReducer,
    },
  });
}

function origin(seedValue: unknown = { season: 'S1', value: '7' }) {
  const seed = createReplaySeed(seedValue, sha256);
  return {
    seed,
    origin: createReplayOrigin({
      worldId: worldId('WORLD_1'),
      lastSequence: '0',
      worldVersion: '0',
      state: { total: '0', draws: [] },
      seed,
      binding: CURRENT_REPLAY_BINDING,
      sha256Hex: sha256,
    }),
  };
}

describe('V07.3 deterministic replay contract', () => {
  it('replays the same opening state, Events, seed and versions byte-for-byte', () => {
    const start = origin();
    const events = [
      event({ sequence: 1, payload: { amount: '3' } }),
      event({ sequence: 2, eventType: 'RANDOM_RECORDED' }),
      event({ sequence: 3, payload: { amount: '4' } }),
    ];
    const first = replayAuthoritativeEvents({
      origin: start.origin,
      seed: start.seed,
      binding: CURRENT_REPLAY_BINDING,
      registry: registry(),
      events,
      sha256Hex: sha256,
    });
    const reconstructedOrigin = createReplayOrigin({
      worldId: worldId('WORLD_1'),
      lastSequence: '0',
      worldVersion: '0',
      state: { draws: [], total: '0' },
      seed: createReplaySeed({ value: '7', season: 'S1' }, sha256),
      binding: CURRENT_REPLAY_BINDING,
      sha256Hex: sha256,
    });
    const second = replayAuthoritativeEvents({
      origin: reconstructedOrigin,
      seed: start.seed,
      binding: CURRENT_REPLAY_BINDING,
      registry: registry(),
      events,
      sha256Hex: sha256,
    });
    expect(first.canonicalState).toBe(second.canonicalState);
    expect(first.stateHash).toBe(second.stateHash);
    expect(first).toMatchObject({
      lastSequence: '3',
      worldVersion: '3',
      appliedEventIds: ['EVENT_1', 'EVENT_2', 'EVENT_3'],
    });
    expect(
      compareReplayState({
        liveState: {
          total: '7',
          draws: (first.state as { draws: string[] }).draws,
        },
        replay: first,
        sha256Hex: sha256,
      }),
    ).toMatchObject({ matches: true, stateHash: first.stateHash });
  });

  it('keeps real audit timestamps outside reducer input and replay state', () => {
    const start = origin();
    const firstEvent = event({ sequence: 1 });
    const retracedEvent = event({
      sequence: 1,
      recordedAtReal: '2026-09-10T00:00:09.000Z',
    });
    expect(retracedEvent.fingerprint).toBe(firstEvent.fingerprint);
    const replay = (value: AuthoritativeEvent) =>
      replayAuthoritativeEvents({
        origin: start.origin,
        seed: start.seed,
        binding: CURRENT_REPLAY_BINDING,
        registry: registry(),
        events: [value],
        sha256Hex: sha256,
      });
    expect(replay(retracedEvent).stateHash).toBe(replay(firstEvent).stateHash);
  });

  it.each([
    ['gap', [event({ sequence: 2 })]],
    ['duplicate', [event({ sequence: 1 }), event({ sequence: 1 })]],
    ['reordered', [event({ sequence: 2 }), event({ sequence: 1 })]],
    ['foreign World', [event({ sequence: 1, world: 'WORLD_2' })]],
  ])('fails closed on %s Event history', (_label, events) => {
    const start = origin();
    expect(() =>
      replayAuthoritativeEvents({
        origin: start.origin,
        seed: start.seed,
        binding: CURRENT_REPLAY_BINDING,
        registry: registry(),
        events,
        sha256Hex: sha256,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.REPLAY_SEQUENCE_INVALID,
      }),
    );
  });

  it('rejects tampered payload/fingerprint before a reducer runs', () => {
    const start = origin();
    const original = event({ sequence: 1 });
    const tampered = {
      ...original,
      canonicalPayload: '{"amount":"999"}',
    } as AuthoritativeEvent;
    let reducerCalls = 0;
    const guardedRegistry = createReplayReducerRegistry({
      binding: CURRENT_REPLAY_BINDING,
      reducers: {
        VALUE_ADDED: (input) => {
          reducerCalls += 1;
          return valueReducer(input);
        },
      },
    });
    expect(() =>
      replayAuthoritativeEvents({
        origin: start.origin,
        seed: start.seed,
        binding: CURRENT_REPLAY_BINDING,
        registry: guardedRegistry,
        events: [tampered],
        sha256Hex: sha256,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.REPLAY_INTEGRITY_INVALID,
      }),
    );
    expect(reducerCalls).toBe(0);
  });

  it('blocks unknown Event and version bindings before interpretation', () => {
    const start = origin();
    expect(() =>
      replayAuthoritativeEvents({
        origin: start.origin,
        seed: start.seed,
        binding: CURRENT_REPLAY_BINDING,
        registry: registry(),
        events: [event({ sequence: 1, eventType: 'UNKNOWN_EVENT' })],
        sha256Hex: sha256,
      }),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.VERSION_MISMATCH }),
    );
    const mismatched = {
      ...CURRENT_REPLAY_BINDING,
      modelVersion: 'world-v2-model-unknown',
    } as ReplayVersionBinding;
    expect(() =>
      createReplayReducerRegistry({ binding: mismatched, reducers: {} }),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.VERSION_MISMATCH }),
    );
  });

  it('rejects corrupt checkpoint state, seed, or binding hashes', () => {
    const start = origin();
    for (const corrupt of [
      { ...start.origin, stateHash: `sha256:${'0'.repeat(64)}` as const },
      { ...start.origin, seedHash: `sha256:${'1'.repeat(64)}` as const },
      { ...start.origin, bindingHash: `sha256:${'2'.repeat(64)}` as const },
    ]) {
      expect(() =>
        replayAuthoritativeEvents({
          origin: corrupt,
          seed: start.seed,
          binding: CURRENT_REPLAY_BINDING,
          registry: registry(),
          events: [],
          sha256Hex: sha256,
        }),
      ).toThrowError(DomainError);
    }
  });

  it('reports exact live/replay hash mismatch without write-back', () => {
    const start = origin();
    const replay = replayAuthoritativeEvents({
      origin: start.origin,
      seed: start.seed,
      binding: CURRENT_REPLAY_BINDING,
      registry: registry(),
      events: [event({ sequence: 1 })],
      sha256Hex: sha256,
    });
    expect(
      compareReplayState({
        liveState: { total: '999', draws: [] },
        replay,
        sha256Hex: sha256,
      }),
    ).toMatchObject({
      matches: false,
      replayStateHash: replay.stateHash,
    });
  });

  it('rejects behavioral opening state before replay', () => {
    const state = {};
    Object.defineProperty(state, 'total', {
      enumerable: true,
      get: () => '0',
    });
    const seed = createReplaySeed({ seed: 'S1' }, sha256);
    expect(() =>
      createReplayOrigin({
        worldId: worldId('WORLD_1'),
        lastSequence: '0',
        worldVersion: '0',
        state,
        seed,
        binding: CURRENT_REPLAY_BINDING,
        sha256Hex: sha256,
      }),
    ).toThrow('rejects accessors');
  });

  it('preserves recorded V06 SimTime ticks without introducing a clock', () => {
    const start = origin();
    let observed: SimTime | undefined;
    const timeRegistry = createReplayReducerRegistry({
      binding: CURRENT_REPLAY_BINDING,
      reducers: {
        VALUE_ADDED: ({ state, event: replayEvent }) => {
          observed = replayEvent.simTime;
          return state;
        },
      },
    });
    replayAuthoritativeEvents({
      origin: start.origin,
      seed: start.seed,
      binding: CURRENT_REPLAY_BINDING,
      registry: timeRegistry,
      events: [event({ sequence: 1 })],
      sha256Hex: sha256,
    });
    expect(observed?.toCanonicalValue()).toBe('10001');
  });
});
