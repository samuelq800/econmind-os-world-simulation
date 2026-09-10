import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_FIELD_CLASSIFICATION,
  COMMAND_SCHEMA_VERSION,
  DOMAIN_ERROR_CODES,
  EVENT_SCHEMA_VERSION,
  DomainError,
  classifyCommandIdentity,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  validateAppendOnlyEventBatch,
  worldId,
} from '../../packages/core/src/index.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');

function commandInput(payload: unknown = { amount: '10', asset: 'GCU' }) {
  return {
    actorId: 'ACTOR_1',
    authSubject: '11111111-1111-4111-8111-111111111111',
    commandId: 'COMMAND_1',
    commandType: 'TRANSFER_REQUESTED',
    correlationId: 'CORRELATION_1',
    countryId: 'COUNTRY_1',
    expectedWorldVersion: '0',
    idempotencyKey: 'TRANSFER_1',
    officeId: 'TRADE',
    payload,
    schemaVersion: COMMAND_SCHEMA_VERSION,
    simTime: '10000',
    submittedAtReal: '2026-09-10T00:00:00.000Z',
    worldId: 'WORLD_1',
  };
}

function eventInput(event: Partial<ReturnType<typeof baseEventInput>> = {}) {
  return { ...baseEventInput(), ...event };
}

function baseEventInput() {
  return {
    causationCommandId: 'COMMAND_1',
    correlationId: 'CORRELATION_1',
    correctsEventId: null,
    eventId: 'EVENT_1',
    eventType: 'TRANSFER_RECORDED',
    payload: { amount: '10', asset: 'GCU' },
    recordedAtReal: '2026-09-10T00:00:01.000Z',
    schemaVersion: EVENT_SCHEMA_VERSION,
    sequence: '1',
    simTime: '10000',
    worldId: 'WORLD_1',
    worldVersion: '1',
  };
}

describe('V07.1 canonical Command contract', () => {
  it('classifies every accepted input field before fingerprint projection', () => {
    expect(COMMAND_FIELD_CLASSIFICATION).toEqual({
      actorId: 'AUTHORITATIVE_INTENT',
      authSubject: 'AUTHORITATIVE_INTENT',
      commandId: 'AUTHORITATIVE_INTENT',
      commandType: 'AUTHORITATIVE_INTENT',
      correlationId: 'TRACE_TRANSPORT_AUDIT',
      countryId: 'AUTHORITATIVE_INTENT',
      expectedWorldVersion: 'AUTHORITATIVE_INTENT',
      idempotencyKey: 'AUTHORITATIVE_INTENT',
      officeId: 'AUTHORITATIVE_INTENT',
      payload: 'AUTHORITATIVE_INTENT',
      schemaVersion: 'AUTHORITATIVE_INTENT',
      simTime: 'AUTHORITATIVE_INTENT',
      submittedAtReal: 'TRACE_TRANSPORT_AUDIT',
      worldId: 'AUTHORITATIVE_INTENT',
    });
  });

  it('produces deterministic payload and intent fingerprints independent of key order', () => {
    const first = parseCanonicalCommand(commandInput(), sha256);
    const reordered = parseCanonicalCommand(
      commandInput({ asset: 'GCU', amount: '10' }),
      sha256,
    );

    expect(reordered.canonicalPayload).toBe(first.canonicalPayload);
    expect(reordered.payloadHash).toBe(first.payloadHash);
    expect(reordered.fingerprint).toBe(first.fingerprint);
    expect(first.simTime.toCanonicalValue()).toBe('10000');
  });

  it('excludes correlation and real audit metadata from canonical intent', () => {
    const first = parseCanonicalCommand(commandInput(), sha256);
    const retry = parseCanonicalCommand(
      {
        ...commandInput(),
        correlationId: 'CORRELATION_RETRY_2',
        submittedAtReal: '2026-09-10T00:00:02.000Z',
      },
      sha256,
    );
    expect(retry.fingerprint).toBe(first.fingerprint);
    expect(retry.payloadHash).toBe(first.payloadHash);
  });

  it('treats a changed correlation ID as an exact duplicate without a second effect', () => {
    const command = parseCanonicalCommand(commandInput(), sha256);
    const retryCommand = parseCanonicalCommand(
      { ...commandInput(), correlationId: 'CORRELATION_RETRY_2' },
      sha256,
    );
    const durable = [command];
    const events: string[] = [];
    const first = classifyCommandIdentity([], command);
    if (first.kind === 'NEW') events.push('EVENT_1');
    const retry = classifyCommandIdentity(durable, retryCommand);
    if (retry.kind === 'NEW') events.push('EVENT_2');

    expect(first.kind).toBe('NEW');
    expect(retry).toMatchObject({
      kind: 'EXACT_DUPLICATE',
      originalCommandId: command.commandId,
      fingerprint: command.fingerprint,
    });
    expect(events).toEqual(['EVENT_1']);
  });

  it('preserves commandId-only duplicate semantics across correlation changes', () => {
    const original = parseCanonicalCommand(
      { ...commandInput(), idempotencyKey: null },
      sha256,
    );
    const retry = parseCanonicalCommand(
      {
        ...commandInput(),
        correlationId: 'CORRELATION_COMMAND_RETRY',
        idempotencyKey: null,
      },
      sha256,
    );

    expect(retry.fingerprint).toBe(original.fingerprint);
    expect(classifyCommandIdentity([original], retry).kind).toBe(
      'EXACT_DUPLICATE',
    );
  });

  it('changes the fingerprint for every mutable authoritative-intent field', () => {
    const original = parseCanonicalCommand(commandInput(), sha256);
    const mutations = [
      { ...commandInput(), actorId: 'ACTOR_2' },
      {
        ...commandInput(),
        authSubject: '22222222-2222-4222-8222-222222222222',
      },
      { ...commandInput(), commandId: 'COMMAND_2' },
      { ...commandInput(), commandType: 'TRANSFER_CANCELLED' },
      { ...commandInput(), countryId: 'COUNTRY_2' },
      { ...commandInput(), expectedWorldVersion: '1' },
      { ...commandInput(), idempotencyKey: 'TRANSFER_2' },
      { ...commandInput(), officeId: null },
      commandInput({ amount: '11', asset: 'GCU' }),
      { ...commandInput(), simTime: '10001' },
      { ...commandInput(), worldId: 'WORLD_2' },
    ];

    for (const mutation of mutations) {
      expect(parseCanonicalCommand(mutation, sha256).fingerprint).not.toBe(
        original.fingerprint,
      );
    }
  });

  it('reconstructs one fingerprint independent of trace metadata and object order', () => {
    const original = parseCanonicalCommand(commandInput(), sha256);
    const reconstructed: unknown = JSON.parse(
      JSON.stringify({
        ...commandInput({ asset: 'GCU', amount: '10' }),
        correlationId: 'CORRELATION_AFTER_RESTART',
        submittedAtReal: '2026-09-10T00:00:03.000Z',
      }),
    );

    expect(parseCanonicalCommand(reconstructed, sha256).fingerprint).toBe(
      original.fingerprint,
    );
  });

  it('rejects commandId or idempotencyKey reuse with changed canonical intent', () => {
    const original = parseCanonicalCommand(commandInput(), sha256);
    for (const changed of [
      commandInput({ amount: '11', asset: 'GCU' }),
      { ...commandInput(), commandId: 'COMMAND_2', countryId: 'COUNTRY_2' },
    ]) {
      const incoming = parseCanonicalCommand(changed, sha256);
      expect(() => classifyCommandIdentity([original], incoming)).toThrowError(
        expect.objectContaining({
          code: DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
        }),
      );
    }
  });

  it('fails closed on unsupported versions, malformed fields and behavioral payloads', () => {
    expect(() =>
      parseCanonicalCommand(
        { ...commandInput(), schemaVersion: 'command-v2' },
        sha256,
      ),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.VERSION_MISMATCH }),
    );
    expect(() =>
      parseCanonicalCommand({ ...commandInput(), unknown: 'FIELD' }, sha256),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID,
      }),
    );
    const behavioral = commandInput({});
    Object.defineProperty(behavioral.payload, 'amount', {
      enumerable: true,
      get: () => '10',
    });
    expect(() => parseCanonicalCommand(behavioral, sha256)).toThrow(
      'rejects accessors',
    );
  });
});

describe('V07.1 authoritative Event contract', () => {
  it('creates replay-compatible versioned events with V06 SimTime', () => {
    const event = parseAuthoritativeEvent(eventInput(), sha256);
    expect(event).toMatchObject({
      eventId: 'EVENT_1',
      eventType: 'TRANSFER_RECORDED',
      sequence: '1',
      worldVersion: '1',
      schemaVersion: EVENT_SCHEMA_VERSION,
    });
    expect(event.simTime.toCanonicalValue()).toBe('10000');
    expect(event.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it('accepts correction only as a new Event and preserves contiguous order', () => {
    const original = parseAuthoritativeEvent(eventInput(), sha256);
    const correction = parseAuthoritativeEvent(
      eventInput({
        correctsEventId: 'EVENT_1',
        eventId: 'EVENT_2',
        eventType: 'TRANSFER_CORRECTED',
        sequence: '2',
        worldVersion: '2',
      }),
      sha256,
    );
    const appended = validateAppendOnlyEventBatch(
      { lastSequence: '0', worldId: worldId('WORLD_1') },
      [original, correction],
    );
    expect(appended).toEqual([original, correction]);
    expect(correction.correctsEventId).toBe(original.eventId);
  });

  it('fails closed on a gap, other World or unsupported version', () => {
    const gap = parseAuthoritativeEvent(
      eventInput({ eventId: 'EVENT_2', sequence: '2' }),
      sha256,
    );
    expect(() =>
      validateAppendOnlyEventBatch(
        { lastSequence: '0', worldId: worldId('WORLD_1') },
        [gap],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.EVENT_APPEND_CONFLICT,
      }),
    );
    expect(() =>
      parseAuthoritativeEvent(
        eventInput({ schemaVersion: 'event-v2' }),
        sha256,
      ),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.VERSION_MISMATCH }),
    );
  });

  it('rejects a non-SHA-256 adapter before returning a contract', () => {
    expect(() =>
      parseAuthoritativeEvent(eventInput(), () => 'NOT_A_HASH'),
    ).toThrowError(DomainError);
  });
});
