import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  SimTime,
  commandId,
  eventId,
  validateAuthoritativeTransition,
  worldId,
  type AuthoritativeTransition,
} from '../../packages/core/src/index.js';
import { testAuthoritativeTransition } from '../helpers/v08-ledgers.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');

function validTransition(): Readonly<AuthoritativeTransition> {
  return testAuthoritativeTransition({
    worldId: worldId('WORLD_TRANSITION_FINGERPRINT'),
    commandId: commandId('COMMAND_TRANSITION_FINGERPRINT'),
    eventIds: [eventId('EVENT_TRANSITION_FINGERPRINT')],
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    simTime: SimTime.fromTicks('1000'),
    sha256Hex: sha256,
  }).transition;
}

describe('V08 root transition fingerprint validation', () => {
  it.each([
    'malformed',
    `sha256:${'A'.repeat(64)}`,
    `sha256:${'a'.repeat(63)}`,
  ])('rejects noncanonical Command fingerprint %s', (commandFingerprint) => {
    const transition = {
      ...validTransition(),
      commandFingerprint,
    } as AuthoritativeTransition;
    expect(() => validateAuthoritativeTransition(transition)).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
      }),
    );
  });

  it('accepts the canonical Command fingerprint through the package root', () => {
    const transition = validTransition();
    expect(validateAuthoritativeTransition(transition)).toBe(transition);
  });
});
