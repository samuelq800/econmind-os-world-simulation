import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CURRENT_REPLAY_BINDING,
  DOMAIN_ERROR_CODES,
  DomainError,
  EVENT_SCHEMA_VERSION,
  AUTHORITATIVE_TRANSITION_SCHEMA_VERSION,
  SimTime,
  compareReplayState,
  createReplayOrigin,
  createReplayReducerRegistry,
  createReplaySeed,
  parseAuthoritativeEvent,
  replayAuthoritativeEvents,
  worldId,
  type AuthoritativeEvent,
  type AuthoritativeTransition,
  type ReplayReducer,
  type ReplayVersionBinding,
} from '../../packages/core/src/index.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');

function event(input: {
  sequence: number;
  commandId?: string;
  eventId?: string;
  eventType?: string;
  payload?: unknown;
  world?: string;
  worldVersion?: number;
  recordedAtReal?: string;
}): AuthoritativeEvent {
  const worldVersion = input.worldVersion ?? input.sequence;
  return parseAuthoritativeEvent(
    {
      causationCommandId: input.commandId ?? `COMMAND_${worldVersion}`,
      correlationId: 'CORRELATION_1',
      correctsEventId: null,
      eventId: input.eventId ?? `EVENT_${input.sequence}`,
      eventType: input.eventType ?? 'VALUE_ADDED',
      payload: input.payload ?? { amount: '1' },
      recordedAtReal: input.recordedAtReal ?? '2026-09-10T00:00:01.000Z',
      schemaVersion: EVENT_SCHEMA_VERSION,
      sequence: String(input.sequence),
      simTime: String(10_000 + input.sequence),
      worldId: input.world ?? 'WORLD_1',
      worldVersion: String(worldVersion),
    },
    sha256,
  );
}

function transition(input: {
  readonly events: readonly AuthoritativeEvent[];
  readonly worldVersionBefore: number;
  readonly worldVersionAfter: number;
  readonly eventIds?: readonly string[];
  readonly transitionId?: string;
}): AuthoritativeTransition {
  const first = input.events[0]!;
  const transitionId = input.transitionId ?? first.causationCommandId;
  return {
    schemaVersion: AUTHORITATIVE_TRANSITION_SCHEMA_VERSION,
    transitionId: transitionId as AuthoritativeTransition['transitionId'],
    worldId: first.worldId,
    commandId: transitionId as AuthoritativeTransition['commandId'],
    commandFingerprint: `sha256:${'a'.repeat(64)}`,
    worldVersionBefore: String(input.worldVersionBefore),
    worldVersionAfter: String(input.worldVersionAfter),
    eventIds: (input.eventIds ??
      input.events.map(
        (item) => item.eventId,
      )) as AuthoritativeTransition['eventIds'],
    events: input.events,
  };
}

function singleEventTransitions(
  events: readonly AuthoritativeEvent[],
): AuthoritativeTransition[] {
  return events.map((item) =>
    transition({
      events: [item],
      worldVersionBefore: Number(item.worldVersion) - 1,
      worldVersionAfter: Number(item.worldVersion),
    }),
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
      transitions: singleEventTransitions(events),
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
      transitions: singleEventTransitions(events),
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

  it('applies multiple ordered Events in one transition with one WorldVersion advance', () => {
    const start = origin();
    const events = [
      event({
        sequence: 1,
        commandId: 'COMMAND_1',
        worldVersion: 1,
        payload: { amount: '3' },
      }),
      event({
        sequence: 2,
        commandId: 'COMMAND_1',
        worldVersion: 1,
        payload: { amount: '4' },
      }),
    ];
    const replay = replayAuthoritativeEvents({
      origin: start.origin,
      seed: start.seed,
      binding: CURRENT_REPLAY_BINDING,
      registry: registry(),
      transitions: [
        transition({
          events,
          worldVersionBefore: 0,
          worldVersionAfter: 1,
        }),
      ],
      sha256Hex: sha256,
    });
    expect(replay).toMatchObject({
      worldVersion: '1',
      lastSequence: '2',
      appliedEventIds: ['EVENT_1', 'EVENT_2'],
      state: { total: '7' },
    });
  });

  it('rejects conflicting or incomplete transition version grouping', () => {
    const start = origin();
    const first = event({
      sequence: 1,
      commandId: 'COMMAND_1',
      worldVersion: 1,
    });
    for (const conflicting of [
      transition({
        events: [first],
        worldVersionBefore: 1,
        worldVersionAfter: 2,
      }),
      transition({
        events: [first],
        eventIds: ['EVENT_1', 'EVENT_2'],
        worldVersionBefore: 0,
        worldVersionAfter: 1,
      }),
    ]) {
      expect(() =>
        replayAuthoritativeEvents({
          origin: start.origin,
          seed: start.seed,
          binding: CURRENT_REPLAY_BINDING,
          registry: registry(),
          transitions: [conflicting],
          sha256Hex: sha256,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: DOMAIN_ERROR_CODES.REPLAY_SEQUENCE_INVALID,
        }),
      );
    }
  });

  it('rejects duplicate Event identity even with contiguous order and one transition', () => {
    const start = origin();
    const events = [
      event({
        sequence: 1,
        commandId: 'COMMAND_1',
        eventId: 'EVENT_DUP',
        worldVersion: 1,
      }),
      event({
        sequence: 2,
        commandId: 'COMMAND_1',
        eventId: 'EVENT_DUP',
        worldVersion: 1,
      }),
    ];
    expect(() =>
      replayAuthoritativeEvents({
        origin: start.origin,
        seed: start.seed,
        binding: CURRENT_REPLAY_BINDING,
        registry: registry(),
        transitions: [
          transition({
            events,
            worldVersionBefore: 0,
            worldVersionAfter: 1,
          }),
        ],
        sha256Hex: sha256,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.REPLAY_SEQUENCE_INVALID,
      }),
    );
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
        transitions: singleEventTransitions([value]),
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
        transitions: singleEventTransitions(events),
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
        transitions: singleEventTransitions([tampered]),
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
        transitions: singleEventTransitions([
          event({ sequence: 1, eventType: 'UNKNOWN_EVENT' }),
        ]),
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
          transitions: [],
          sha256Hex: sha256,
        }),
      ).toThrowError(DomainError);
    }
  });

  it('recomputes seedHash from canonicalSeed and rejects stale declared hash', () => {
    const start = origin();
    const changedSeed = {
      ...start.seed,
      canonicalSeed: '{"season":"S1","value":"8"}',
    };
    expect(() =>
      replayAuthoritativeEvents({
        origin: start.origin,
        seed: changedSeed,
        binding: CURRENT_REPLAY_BINDING,
        registry: registry(),
        transitions: [],
        sha256Hex: sha256,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.REPLAY_INTEGRITY_INVALID,
      }),
    );
  });

  it('reports exact live/replay hash mismatch without write-back', () => {
    const start = origin();
    const replay = replayAuthoritativeEvents({
      origin: start.origin,
      seed: start.seed,
      binding: CURRENT_REPLAY_BINDING,
      registry: registry(),
      transitions: singleEventTransitions([event({ sequence: 1 })]),
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
      transitions: singleEventTransitions([event({ sequence: 1 })]),
      sha256Hex: sha256,
    });
    expect(observed?.toCanonicalValue()).toBe('10001');
  });
});
