import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  SimTime,
  createOutboxMessage,
  parseCanonicalCommand,
  recordOutboxDeliveryAttempt,
} from '../../packages/core/src/index.js';
import { FOUNDATION_PROPERTY_CONFIG } from './property-config.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');

describe('V07.2 outbox retry properties', () => {
  it('permits arbitrary failed redelivery before one terminal delivery', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (failures) => {
        const command = parseCanonicalCommand(
          {
            actorId: 'ACTOR_1',
            authSubject: '11111111-1111-4111-8111-111111111111',
            commandId: 'COMMAND_1',
            commandType: 'PROPERTY_COMMAND',
            correlationId: 'CORRELATION_1',
            countryId: 'COUNTRY_1',
            expectedWorldVersion: '0',
            idempotencyKey: 'PROPERTY_1',
            officeId: null,
            payload: { value: 'UNCHANGED' },
            schemaVersion: COMMAND_SCHEMA_VERSION,
            simTime: '0',
            submittedAtReal: '2026-09-10T00:00:00.000Z',
            worldId: 'WORLD_1',
          },
          sha256,
        );
        const original = createOutboxMessage({
          messageId: 'OUTBOX_1',
          worldId: command.worldId,
          commandId: command.commandId,
          eventId: null,
          payload: { kind: 'PROPERTY_NOTIFICATION' },
          payloadHash: command.payloadHash,
          availableAtSimTime: SimTime.fromTicks('0'),
        });
        let current = original;
        for (let index = 0; index < failures; index += 1) {
          current = recordOutboxDeliveryAttempt({
            message: current,
            delivered: false,
          });
        }
        const delivered = recordOutboxDeliveryAttempt({
          message: current,
          delivered: true,
        });
        const duplicateDelivery = recordOutboxDeliveryAttempt({
          message: delivered,
          delivered: true,
        });
        expect(delivered.state).toBe('DELIVERED');
        expect(delivered.attemptCount).toBe(String(failures + 1));
        expect(delivered.commandId).toBe(original.commandId);
        expect(delivered.canonicalPayload).toBe(original.canonicalPayload);
        expect(duplicateDelivery).toBe(delivered);
      }),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 72,
      },
    );
  });
});
