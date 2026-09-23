import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  worldId,
  type Sha256Hex,
} from '@econmind/core';

import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import { NARROW_TREASURY_GCU_DELIVERY_OUTBOX_SCHEMA } from '../persistence/narrow-treasury-gcu-delivery-draft.js';

const CONSUMER_ID = /^[A-Z][A-Z0-9_]{0,63}$/u;
const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

interface OutboxRow {
  readonly attempt_count: unknown;
  readonly canonical_payload: unknown;
  readonly delivery_state: unknown;
  readonly event_id: unknown;
  readonly payload_sha256: unknown;
}

interface ConsumerReceiptRow {
  readonly attempt_count: unknown;
  readonly delivery_state: unknown;
}

export interface NarrowTreasuryGcuDeliveryOutboxMessage {
  readonly consumerId: string;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly messageId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly worldId: string;
}

export interface NarrowTreasuryGcuDeliveryOutboxSink {
  deliver(message: NarrowTreasuryGcuDeliveryOutboxMessage): Promise<void>;
}

export type NarrowTreasuryGcuDeliveryOutboxDisposition =
  'ALREADY_DELIVERED' | 'DELIVERED' | 'IN_FLIGHT' | 'RETRY_PENDING';

export interface NarrowTreasuryGcuDeliveryOutboxResult {
  readonly attemptCount: string;
  readonly disposition: NarrowTreasuryGcuDeliveryOutboxDisposition;
}

interface ClaimedDelivery {
  readonly attemptCount: string;
  readonly message: NarrowTreasuryGcuDeliveryOutboxMessage;
}

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.OUTBOX_STATE_INVALID, message);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): string {
  const rendered =
    typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : value;
  if (typeof rendered !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(rendered)) {
    invalid(`${label} must be a canonical non-negative integer`);
  }
  return rendered;
}

function timestamp(value: string): string {
  if (!RFC3339_MILLISECONDS.test(value)) {
    invalid('Outbox attempt time must be canonical RFC3339 milliseconds');
  }
  return value;
}

function canonicalPayload(
  value: unknown,
  expectedHash: unknown,
  sha256Hex: Sha256Hex,
): Readonly<Record<string, unknown>> {
  const raw = requiredString(value, 'Outbox canonical payload');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalid('Outbox canonical payload must be valid JSON');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    canonicalSerialize(parsed) !== raw ||
    canonicalSha256(canonicalHashInput(parsed), sha256Hex) !== expectedHash
  ) {
    invalid('Outbox canonical payload or hash is invalid');
  }
  const payload = parsed as Readonly<Record<string, unknown>>;
  const keys = Object.keys(payload).sort();
  const expectedKeys = [
    'eventId',
    'financialPostingFingerprint',
    'inventoryPostingFingerprint',
    'schemaVersion',
    'shipmentId',
    'transferCommandId',
    'transferFingerprint',
  ];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    payload.schemaVersion !== NARROW_TREASURY_GCU_DELIVERY_OUTBOX_SCHEMA ||
    typeof payload.eventId !== 'string' ||
    typeof payload.shipmentId !== 'string' ||
    typeof payload.transferCommandId !== 'string' ||
    !SHA256.test(String(payload.financialPostingFingerprint)) ||
    !SHA256.test(String(payload.inventoryPostingFingerprint)) ||
    !SHA256.test(String(payload.transferFingerprint))
  ) {
    invalid(
      'Outbox payload is not one narrow Treasury-GCU delivery notification',
    );
  }
  return payload;
}

/**
 * Worker-side at-least-once outbox delivery. The consumer receives the Event
 * ID as its idempotency key, so a process failure after external delivery but
 * before durable acknowledgement can be retried without re-executing any
 * economic transition. This class never writes Event, Posting, receipt, queue
 * or World-head facts.
 */
export class NarrowTreasuryGcuDeliveryOutboxConsumer {
  readonly #consumerId: string;
  readonly #database: SqlDatabase;
  readonly #sha256Hex: Sha256Hex;
  readonly #sink: NarrowTreasuryGcuDeliveryOutboxSink;

  constructor(input: {
    readonly consumerId: string;
    readonly database: SqlDatabase;
    readonly sha256Hex: Sha256Hex;
    readonly sink: NarrowTreasuryGcuDeliveryOutboxSink;
  }) {
    if (!CONSUMER_ID.test(input.consumerId)) {
      invalid('Outbox consumer ID must be canonical');
    }
    this.#consumerId = input.consumerId;
    this.#database = input.database;
    this.#sha256Hex = input.sha256Hex;
    this.#sink = input.sink;
  }

  async dispatch(input: {
    readonly attemptedAtReal: string;
    readonly messageId: string;
    readonly retryProcessingBeforeReal: string | null;
    readonly worldId: string;
  }): Promise<Readonly<NarrowTreasuryGcuDeliveryOutboxResult>> {
    const attemptedAtReal = timestamp(input.attemptedAtReal);
    const retryProcessingBeforeReal =
      input.retryProcessingBeforeReal === null
        ? null
        : timestamp(input.retryProcessingBeforeReal);
    const canonicalWorldId = worldId(input.worldId);
    const messageId = requiredString(input.messageId, 'Outbox message ID');
    const claim = await this.#database.transaction((transaction) =>
      this.#claim(transaction, {
        attemptedAtReal,
        messageId,
        retryProcessingBeforeReal,
        worldId: canonicalWorldId,
      }),
    );
    if ('disposition' in claim) return claim;
    try {
      await this.#sink.deliver(claim.message);
    } catch {
      return this.#database.transaction((transaction) =>
        this.#finishFailure(transaction, {
          attemptedAtReal,
          eventId: claim.message.eventId,
          messageId,
          worldId: canonicalWorldId,
        }),
      );
    }
    return this.#database.transaction((transaction) =>
      this.#finishSuccess(transaction, {
        attemptedAtReal,
        eventId: claim.message.eventId,
        messageId,
        worldId: canonicalWorldId,
      }),
    );
  }

  async #claim(
    transaction: SqlExecutor,
    input: {
      readonly attemptedAtReal: string;
      readonly messageId: string;
      readonly retryProcessingBeforeReal: string | null;
      readonly worldId: string;
    },
  ): Promise<
    Readonly<ClaimedDelivery | NarrowTreasuryGcuDeliveryOutboxResult>
  > {
    const outbox = await transaction.query<OutboxRow>(
      `select delivery_state, attempt_count, event_id, canonical_payload, payload_sha256
         from world_v2.notification_outbox
        where world_id = $1 and outbox_message_id = $2
        for update`,
      [input.worldId, input.messageId],
    );
    const row = outbox.rows[0];
    if (row === undefined) invalid('Delivery outbox message is missing');
    const priorAttemptCount = nonNegativeInteger(
      row.attempt_count,
      'Outbox attempt count',
    );
    if (row.delivery_state === 'DELIVERED') {
      return Object.freeze({
        disposition: 'ALREADY_DELIVERED' as const,
        attemptCount: priorAttemptCount,
      });
    }
    if (row.delivery_state !== 'PENDING') {
      invalid('Delivery outbox is in an unsupported state');
    }
    const eventId = requiredString(row.event_id, 'Delivery outbox Event ID');
    const receipt = await transaction.query<ConsumerReceiptRow>(
      `select delivery_state, attempt_count
         from world_v2.event_consumer_receipt
        where world_id = $1 and event_id = $2 and consumer_id = $3
        for update`,
      [input.worldId, eventId, this.#consumerId],
    );
    const priorReceipt = receipt.rows[0];
    if (priorReceipt?.delivery_state === 'DELIVERED') {
      await transaction.query(
        `update world_v2.notification_outbox
            set delivery_state = 'DELIVERED',
                delivered_at_real = $3::timestamptz
          where world_id = $1 and outbox_message_id = $2 and delivery_state = 'PENDING'`,
        [input.worldId, input.messageId, input.attemptedAtReal],
      );
      return Object.freeze({
        disposition: 'ALREADY_DELIVERED' as const,
        attemptCount: priorAttemptCount,
      });
    }
    if (priorReceipt?.delivery_state === 'PROCESSING') {
      if (input.retryProcessingBeforeReal === null) {
        return Object.freeze({
          disposition: 'IN_FLIGHT' as const,
          attemptCount: priorAttemptCount,
        });
      }
      const retried = await transaction.query(
        `update world_v2.event_consumer_receipt
            set attempt_count = attempt_count + 1,
                last_attempt_at_real = $5::timestamptz
          where world_id = $1
            and event_id = $2
            and consumer_id = $3
            and delivery_state = 'PROCESSING'
            and last_attempt_at_real < $4::timestamptz`,
        [
          input.worldId,
          eventId,
          this.#consumerId,
          input.retryProcessingBeforeReal,
          input.attemptedAtReal,
        ],
      );
      if (retried.rowCount !== 1) {
        return Object.freeze({
          disposition: 'IN_FLIGHT' as const,
          attemptCount: priorAttemptCount,
        });
      }
    } else if (priorReceipt === undefined) {
      await transaction.query(
        `insert into world_v2.event_consumer_receipt
           (world_id, event_id, consumer_id, schema_version, delivery_state,
            attempt_count, last_attempt_at_real)
         values ($1, $2, $3, 'consumer-receipt-v1', 'PROCESSING', 1, $4::timestamptz)`,
        [input.worldId, eventId, this.#consumerId, input.attemptedAtReal],
      );
    } else if (priorReceipt.delivery_state === 'FAILED') {
      await transaction.query(
        `update world_v2.event_consumer_receipt
            set delivery_state = 'PROCESSING',
                attempt_count = attempt_count + 1,
                last_attempt_at_real = $4::timestamptz
          where world_id = $1 and event_id = $2 and consumer_id = $3
            and delivery_state = 'FAILED'`,
        [input.worldId, eventId, this.#consumerId, input.attemptedAtReal],
      );
    } else {
      invalid('Delivery consumer receipt is in an unsupported state');
    }
    const payload = canonicalPayload(
      row.canonical_payload,
      row.payload_sha256,
      this.#sha256Hex,
    );
    if (payload.eventId !== eventId) {
      invalid('Delivery outbox payload Event ID does not match durable row');
    }
    return Object.freeze({
      attemptCount: priorAttemptCount,
      message: Object.freeze({
        consumerId: this.#consumerId,
        eventId,
        idempotencyKey: eventId,
        messageId: input.messageId,
        payload,
        worldId: input.worldId,
      }),
    });
  }

  async #finishFailure(
    transaction: SqlExecutor,
    input: {
      readonly attemptedAtReal: string;
      readonly eventId: string;
      readonly messageId: string;
      readonly worldId: string;
    },
  ): Promise<Readonly<NarrowTreasuryGcuDeliveryOutboxResult>> {
    const receipt = await transaction.query<ConsumerReceiptRow>(
      `update world_v2.event_consumer_receipt
          set delivery_state = 'FAILED', last_attempt_at_real = $4::timestamptz
        where world_id = $1 and event_id = $2 and consumer_id = $3
          and delivery_state = 'PROCESSING'
        returning attempt_count`,
      [input.worldId, input.eventId, this.#consumerId, input.attemptedAtReal],
    );
    const attemptCount = nonNegativeInteger(
      receipt.rows[0]?.attempt_count,
      'Consumer retry attempt count',
    );
    const outbox = await transaction.query<OutboxRow>(
      `update world_v2.notification_outbox
          set attempt_count = attempt_count + 1,
              last_attempt_at_real = $3::timestamptz
        where world_id = $1 and outbox_message_id = $2 and delivery_state = 'PENDING'
        returning attempt_count`,
      [input.worldId, input.messageId, input.attemptedAtReal],
    );
    if (outbox.rowCount !== 1)
      invalid('Delivery outbox failure record was lost');
    return Object.freeze({
      disposition: 'RETRY_PENDING' as const,
      attemptCount,
    });
  }

  async #finishSuccess(
    transaction: SqlExecutor,
    input: {
      readonly attemptedAtReal: string;
      readonly eventId: string;
      readonly messageId: string;
      readonly worldId: string;
    },
  ): Promise<Readonly<NarrowTreasuryGcuDeliveryOutboxResult>> {
    const receipt = await transaction.query<ConsumerReceiptRow>(
      `update world_v2.event_consumer_receipt
          set delivery_state = 'DELIVERED', last_attempt_at_real = $4::timestamptz
        where world_id = $1 and event_id = $2 and consumer_id = $3
          and delivery_state = 'PROCESSING'
        returning attempt_count`,
      [input.worldId, input.eventId, this.#consumerId, input.attemptedAtReal],
    );
    const attemptCount = nonNegativeInteger(
      receipt.rows[0]?.attempt_count,
      'Consumer delivery attempt count',
    );
    const outbox = await transaction.query<OutboxRow>(
      `update world_v2.notification_outbox
          set attempt_count = attempt_count + 1,
              last_attempt_at_real = $3::timestamptz,
              delivery_state = 'DELIVERED',
              delivered_at_real = $3::timestamptz
        where world_id = $1 and outbox_message_id = $2 and delivery_state = 'PENDING'
        returning attempt_count`,
      [input.worldId, input.messageId, input.attemptedAtReal],
    );
    if (outbox.rowCount !== 1)
      invalid('Delivery outbox success record was lost');
    return Object.freeze({ disposition: 'DELIVERED' as const, attemptCount });
  }
}
