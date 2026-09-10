import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  classifyCommandIdentity,
  parseCanonicalCommand,
} from '../../packages/core/src/index.js';
import { PROPERTY_RUNS, PROPERTY_SEED } from './property-config.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');

function commandInput(payload: Record<string, string>) {
  return {
    actorId: 'ACTOR_1',
    authSubject: '11111111-1111-4111-8111-111111111111',
    commandId: 'COMMAND_1',
    commandType: 'PROPERTY_COMMAND',
    correlationId: 'CORRELATION_1',
    countryId: 'COUNTRY_1',
    expectedWorldVersion: '0',
    idempotencyKey: 'PROPERTY_1',
    officeId: null,
    payload,
    schemaVersion: COMMAND_SCHEMA_VERSION,
    simTime: '0',
    submittedAtReal: '2026-09-10T00:00:00.000Z',
    worldId: 'WORLD_1',
  };
}

describe('V07.1 deterministic Command properties', () => {
  it('keeps fingerprints invariant across arbitrary correlation IDs', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u),
        fc.stringMatching(/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u),
        (firstCorrelationId, secondCorrelationId) => {
          const original = parseCanonicalCommand(
            {
              ...commandInput({ value: 'UNCHANGED' }),
              correlationId: firstCorrelationId,
            },
            sha256,
          );
          const retry = parseCanonicalCommand(
            {
              ...commandInput({ value: 'UNCHANGED' }),
              correlationId: secondCorrelationId,
            },
            sha256,
          );

          expect(retry.fingerprint).toBe(original.fingerprint);
          expect(classifyCommandIdentity([original], retry).kind).toBe(
            'EXACT_DUPLICATE',
          );
        },
      ),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED + 70 },
    );
  });

  it('canonicalizes property-order permutations to one fingerprint', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.tuple(
            fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/u),
            fc.string({ maxLength: 24 }),
          ),
          { maxLength: 12, selector: ([key]) => key },
        ),
        (entries) => {
          const forward = Object.fromEntries(entries);
          const reverse = Object.fromEntries([...entries].reverse());
          const first = parseCanonicalCommand(commandInput(forward), sha256);
          const second = parseCanonicalCommand(commandInput(reverse), sha256);
          expect(second.fingerprint).toBe(first.fingerprint);
          expect(second.payloadHash).toBe(first.payloadHash);
        },
      ),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED },
    );
  });

  it('every changed canonical payload is either a new hash or an exact duplicate', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (left, right) => {
        const original = parseCanonicalCommand(
          commandInput({ value: left }),
          sha256,
        );
        const incoming = parseCanonicalCommand(
          commandInput({ value: right }),
          sha256,
        );
        if (left === right) {
          expect(classifyCommandIdentity([original], incoming).kind).toBe(
            'EXACT_DUPLICATE',
          );
        } else {
          expect(incoming.payloadHash).not.toBe(original.payloadHash);
          expect(() => classifyCommandIdentity([original], incoming)).toThrow(
            'different canonical fingerprint',
          );
        }
      }),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED + 71 },
    );
  });
});
