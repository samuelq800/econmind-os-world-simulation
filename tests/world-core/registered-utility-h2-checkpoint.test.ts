/** Pure checkpoint/transport checks only, never a database/proof/native PASS. */
import { describe, expect, it } from 'vitest';
import {
  assertRegisteredUtilityResumeCounts,
  assertRegisteredUtilityPriorFinal,
} from '../support/registered-utility-h2-checkpoint.js';
import { registeredFinalPublishedCommand } from '../support/postwar-registered-final-driver.js';
const pending = Object.freeze({
  worldVersion: '2',
  eventSequence: '2',
  commands: '3',
  receipts: '2',
  events: '2',
  batches: '0',
  inventory: '0',
  queues: '3',
});
const final = Object.freeze({
  ...pending,
  worldVersion: '3',
  eventSequence: '3',
  receipts: '3',
  events: '3',
});

describe('fixed H2 continuation DATA contract', () => {
  it('compares stored FINAL evidence with numeric counts without treating it as a canonical World intent', () => {
    const actual = Object.freeze({
      commandFingerprint: 'sha256:' + '1'.repeat(64),
      receiptCount: 1,
      financialBatchCount: 0,
      eventIds: ['EVENT_ONE'],
    });
    const archived = {
      eventIds: ['EVENT_ONE'],
      financialBatchCount: 0,
      receiptCount: 1,
      commandFingerprint: actual.commandFingerprint,
    };
    expect(() =>
      assertRegisteredUtilityPriorFinal(actual, archived),
    ).not.toThrow();
    expect(() =>
      assertRegisteredUtilityPriorFinal(actual, {
        ...archived,
        receiptCount: '1',
      }),
    ).toThrow();
    expect(() =>
      assertRegisteredUtilityPriorFinal(actual, {
        ...archived,
        eventIds: ['OTHER'],
      }),
    ).toThrow();
  });

  it('recognizes pending GRANT and an already FINAL GRANT without issuing or consuming commands', () => {
    expect(() =>
      assertRegisteredUtilityResumeCounts(pending, 'PENDING'),
    ).not.toThrow();
    expect(() =>
      assertRegisteredUtilityResumeCounts(final, 'FINALIZED'),
    ).not.toThrow();
    expect(() =>
      assertRegisteredUtilityResumeCounts(final, 'PENDING'),
    ).toThrow();
    expect(() =>
      assertRegisteredUtilityResumeCounts(pending, 'FINALIZED'),
    ).toThrow();
  });
  it.each(Object.keys(pending) as (keyof typeof pending)[])(
    'rejects drift of economic count %s',
    (key) => {
      expect(() =>
        assertRegisteredUtilityResumeCounts(
          { ...pending, [key]: '99' },
          'PENDING',
        ),
      ).toThrow();
    },
  );
  it.each(['CLAIMED', 'UNKNOWN', null])(
    'refuses unresolved queue state %s',
    (state) => {
      expect(() => assertRegisteredUtilityResumeCounts(final, state)).toThrow(
        'H2_RESUME_UNKNOWN_QUEUE_STATE',
      );
    },
  );
  it('requires FINAL explicitly for a repeated read-only publication lookup while fresh issuance still requires QUEUED', () => {
    const command = {
      schemaVersion: 'command-v1',
      commandId: 'GRANT_ONE',
      fingerprint: 'sha256:' + '1'.repeat(64),
    };
    expect(
      registeredFinalPublishedCommand(
        { status: 'FINAL', command },
        'WRAPPED',
        'FINAL',
      ),
    ).toEqual({
      commandId: command.commandId,
      commandFingerprint: command.fingerprint,
    });
    expect(() =>
      registeredFinalPublishedCommand({ status: 'FINAL', command }),
    ).toThrow();
    expect(() =>
      registeredFinalPublishedCommand(
        { status: 'QUEUED', command },
        'WRAPPED',
        'FINAL',
      ),
    ).toThrow();
  });
});
