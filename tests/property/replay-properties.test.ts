import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CURRENT_REPLAY_BINDING,
  EVENT_SCHEMA_VERSION,
  createReplayOrigin,
  createReplayReducerRegistry,
  createReplaySeed,
  parseAuthoritativeEvent,
  replayAuthoritativeEvents,
  worldId,
  type ReplayReducer,
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
                worldVersion: String(index + 1),
              },
              sha256,
            ),
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
              events,
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
});
