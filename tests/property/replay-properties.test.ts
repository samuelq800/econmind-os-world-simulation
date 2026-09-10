import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CURRENT_REPLAY_BINDING,
  EVENT_SCHEMA_VERSION,
  AUTHORITATIVE_TRANSITION_SCHEMA_VERSION,
  createReplayOrigin,
  createReplayReducerRegistry,
  createReplaySeed,
  parseAuthoritativeEvent,
  replayAuthoritativeEvents,
  worldId,
  type ReplayReducer,
  type AuthoritativeTransition,
} from '../../packages/core/src/index.js';
import { FOUNDATION_PROPERTY_CONFIG } from './property-config.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');

const reducer: ReplayReducer = ({ state, event }) => {
  const current = state as { readonly total: string };
  const payload = event.payload as { readonly amount: string };
  return { total: (BigInt(current.total) + BigInt(payload.amount)).toString() };
};

describe('V07.3 deterministic replay properties', () => {
  it('is byte-identical across reconstruction for arbitrary event amounts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: -1_000_000n, max: 1_000_000n }), {
          maxLength: 30,
        }),
        fc.string({ maxLength: 40 }),
        (amounts, seedText) => {
          const seed = createReplaySeed(
            { label: seedText, season: 'S1' },
            sha256,
          );
          const makeOrigin = (state: unknown) =>
            createReplayOrigin({
              worldId: worldId('WORLD_1'),
              lastSequence: '0',
              worldVersion: '0',
              state,
              seed,
              binding: CURRENT_REPLAY_BINDING,
              sha256Hex: sha256,
            });
          const events = amounts.map((amount, index) =>
            parseAuthoritativeEvent(
              {
                causationCommandId: `COMMAND_${index + 1}`,
                correlationId: 'CORRELATION_1',
                correctsEventId: null,
                eventId: `EVENT_${index + 1}`,
                eventType: 'VALUE_ADDED',
                payload: { amount: amount.toString() },
                recordedAtReal: '2026-09-10T00:00:01.000Z',
                schemaVersion: EVENT_SCHEMA_VERSION,
                sequence: String(index + 1),
                simTime: String(10_000 + index),
                worldId: 'WORLD_1',
                worldVersion: String(index + 1),
              },
              sha256,
            ),
          );
          const transitions: AuthoritativeTransition[] = events.map(
            (event, index) => ({
              schemaVersion: AUTHORITATIVE_TRANSITION_SCHEMA_VERSION,
              transitionId: event.causationCommandId,
              worldId: event.worldId,
              commandId: event.causationCommandId,
              commandFingerprint: `sha256:${'a'.repeat(64)}`,
              worldVersionBefore: String(index),
              worldVersionAfter: String(index + 1),
              eventIds: [event.eventId],
              events: [event],
            }),
          );
          const registry = createReplayReducerRegistry({
            binding: CURRENT_REPLAY_BINDING,
            reducers: { VALUE_ADDED: reducer },
          });
          const replay = (state: unknown) =>
            replayAuthoritativeEvents({
              origin: makeOrigin(state),
              seed,
              binding: CURRENT_REPLAY_BINDING,
              registry,
              transitions,
              sha256Hex: sha256,
            });
          const first = replay({ total: '0' });
          const second = replay(JSON.parse('{"total":"0"}'));
          expect(second.canonicalState).toBe(first.canonicalState);
          expect(second.stateHash).toBe(first.stateHash);
          expect(second.lastSequence).toBe(String(amounts.length));
          expect(second.worldVersion).toBe(String(amounts.length));
        },
      ),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 73,
      },
    );
  });

  it('applies any non-empty Event group as one WorldVersion transition', () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: -1_000_000n, max: 1_000_000n }), {
          minLength: 1,
          maxLength: 30,
        }),
        (amounts) => {
          const seed = createReplaySeed({ season: 'S1' }, sha256);
          const replayOrigin = createReplayOrigin({
            worldId: worldId('WORLD_1'),
            lastSequence: '0',
            worldVersion: '0',
            state: { total: '0' },
            seed,
            binding: CURRENT_REPLAY_BINDING,
            sha256Hex: sha256,
          });
          const events = amounts.map((amount, index) =>
            parseAuthoritativeEvent(
              {
                causationCommandId: 'COMMAND_1',
                correlationId: 'CORRELATION_1',
                correctsEventId: null,
                eventId: `EVENT_${index + 1}`,
                eventType: 'VALUE_ADDED',
                payload: { amount: amount.toString() },
                recordedAtReal: '2026-09-10T00:00:01.000Z',
                schemaVersion: EVENT_SCHEMA_VERSION,
                sequence: String(index + 1),
                simTime: String(10_000 + index),
                worldId: 'WORLD_1',
                worldVersion: '1',
              },
              sha256,
            ),
          );
          const transition: AuthoritativeTransition = {
            schemaVersion: AUTHORITATIVE_TRANSITION_SCHEMA_VERSION,
            transitionId: events[0]!.causationCommandId,
            worldId: events[0]!.worldId,
            commandId: events[0]!.causationCommandId,
            commandFingerprint: `sha256:${'a'.repeat(64)}`,
            worldVersionBefore: '0',
            worldVersionAfter: '1',
            eventIds: events.map((event) => event.eventId),
            events,
          };
          const replay = replayAuthoritativeEvents({
            origin: replayOrigin,
            seed,
            binding: CURRENT_REPLAY_BINDING,
            registry: createReplayReducerRegistry({
              binding: CURRENT_REPLAY_BINDING,
              reducers: { VALUE_ADDED: reducer },
            }),
            transitions: [transition],
            sha256Hex: sha256,
          });
          expect(replay.worldVersion).toBe('1');
          expect(replay.lastSequence).toBe(String(amounts.length));
          expect(replay.state).toEqual({
            total: amounts.reduce((sum, amount) => sum + amount, 0n).toString(),
          });
        },
      ),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 74,
      },
    );
  });

  it('rejects a duplicate Event identity regardless of canonical payload', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -1_000_000n, max: 1_000_000n }),
        fc.bigInt({ min: -1_000_000n, max: 1_000_000n }),
        (firstAmount, secondAmount) => {
          const seed = createReplaySeed({ season: 'S1' }, sha256);
          const replayOrigin = createReplayOrigin({
            worldId: worldId('WORLD_1'),
            lastSequence: '0',
            worldVersion: '0',
            state: { total: '0' },
            seed,
            binding: CURRENT_REPLAY_BINDING,
            sha256Hex: sha256,
          });
          const makeEvent = (
            amount: bigint,
            sequence: string,
            command: string,
            version: string,
          ) =>
            parseAuthoritativeEvent(
              {
                causationCommandId: command,
                correlationId: 'CORRELATION_1',
                correctsEventId: null,
                eventId: 'EVENT_DUP',
                eventType: 'VALUE_ADDED',
                payload: { amount: amount.toString() },
                recordedAtReal: '2026-09-10T00:00:01.000Z',
                schemaVersion: EVENT_SCHEMA_VERSION,
                sequence,
                simTime: '10000',
                worldId: 'WORLD_1',
                worldVersion: version,
              },
              sha256,
            );
          const first = makeEvent(firstAmount, '1', 'COMMAND_1', '1');
          const second = makeEvent(secondAmount, '2', 'COMMAND_2', '2');
          const transitions: AuthoritativeTransition[] = [
            {
              schemaVersion: AUTHORITATIVE_TRANSITION_SCHEMA_VERSION,
              transitionId: first.causationCommandId,
              worldId: first.worldId,
              commandId: first.causationCommandId,
              commandFingerprint: `sha256:${'a'.repeat(64)}`,
              worldVersionBefore: '0',
              worldVersionAfter: '1',
              eventIds: [first.eventId],
              events: [first],
            },
            {
              schemaVersion: AUTHORITATIVE_TRANSITION_SCHEMA_VERSION,
              transitionId: second.causationCommandId,
              worldId: second.worldId,
              commandId: second.causationCommandId,
              commandFingerprint: `sha256:${'b'.repeat(64)}`,
              worldVersionBefore: '1',
              worldVersionAfter: '2',
              eventIds: [second.eventId],
              events: [second],
            },
          ];
          expect(() =>
            replayAuthoritativeEvents({
              origin: replayOrigin,
              seed,
              binding: CURRENT_REPLAY_BINDING,
              registry: createReplayReducerRegistry({
                binding: CURRENT_REPLAY_BINDING,
                reducers: { VALUE_ADDED: reducer },
              }),
              transitions,
              sha256Hex: sha256,
            }),
          ).toThrow();
        },
      ),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 75,
      },
    );
  });
});
