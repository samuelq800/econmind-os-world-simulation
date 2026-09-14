import {
  DOMAIN_ERROR_CODES,
  DomainError,
  EVENT_SCHEMA_VERSION,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  type Sha256Hex,
} from '@econmind/core';

import type { SqlExecutor } from '../persistence/sql-database.js';
import {
  NARROW_TREASURY_GCU_DELIVERY_EVENT_SCHEMA,
  NARROW_TREASURY_GCU_DELIVERY_EVENT_TYPE,
  createNarrowTreasuryGcuDeliveryMaterialization,
} from '../persistence/narrow-treasury-gcu-delivery-draft.js';

const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

interface DeliveryProjectionRow {
  readonly delivery_command_id: unknown;
  readonly delivery_fingerprint: unknown;
  readonly delivery_world_version: unknown;
  readonly event_id: unknown;
  readonly event_payload: unknown;
  readonly financial_posting_fingerprint: unknown;
  readonly inventory_posting_fingerprint: unknown;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): string {
  const rendered =
    typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : value;
  if (typeof rendered !== 'string' || !POSITIVE_INTEGER.test(rendered)) {
    invalid(`${label} must be a canonical positive integer`);
  }
  return rendered;
}

function fingerprint(value: unknown, label: string): string {
  const rendered = requiredString(value, label);
  if (!SHA256.test(rendered)) invalid(`${label} must be a SHA-256 fingerprint`);
  return rendered;
}

function canonicalObject(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  const raw = requiredString(value, `${label} canonical payload`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalid(`${label} canonical payload must be valid JSON`);
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    canonicalSerialize(parsed) !== raw
  ) {
    invalid(`${label} canonical payload must be one canonical object`);
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalid(`${label} has an unexpected shape`);
  }
}

function deliveryProjectionInput(input: {
  readonly row: DeliveryProjectionRow;
  readonly worldId: string;
  readonly materializedWorldVersion: string;
}) {
  const payload = canonicalObject(input.row.event_payload, 'Delivery Event');
  exactKeys(
    payload,
    ['schemaVersion', 'shipmentId', 'transferCommandId', 'transferFingerprint'],
    'Delivery Event payload',
  );
  if (payload.schemaVersion !== NARROW_TREASURY_GCU_DELIVERY_EVENT_SCHEMA) {
    invalid('Delivery Event has an unsupported schema');
  }
  return {
    deliveryCommandId: requiredString(
      input.row.delivery_command_id,
      'Delivery Command ID',
    ),
    deliveryFingerprint: fingerprint(
      input.row.delivery_fingerprint,
      'Delivery Command fingerprint',
    ),
    deliveryWorldVersion: positiveInteger(
      input.row.delivery_world_version,
      'Delivery Event WorldVersion',
    ),
    eventId: requiredString(input.row.event_id, 'Delivery Event ID'),
    financialPostingFingerprint: fingerprint(
      input.row.financial_posting_fingerprint,
      'Financial Posting fingerprint',
    ),
    inventoryPostingFingerprint: fingerprint(
      input.row.inventory_posting_fingerprint,
      'Inventory Posting fingerprint',
    ),
    materializedWorldVersion: input.materializedWorldVersion,
    shipmentId: requiredString(payload.shipmentId, 'Delivery shipment ID'),
    transferCommandId: requiredString(
      payload.transferCommandId,
      'Delivery transfer Command ID',
    ),
    transferFingerprint: fingerprint(
      payload.transferFingerprint,
      'Delivery transfer fingerprint',
    ),
    worldId: input.worldId,
  };
}

/**
 * Rebuilds the single current delivery index from committed authoritative
 * facts. It never reads a browser, fixture, cache, or opening balance; an
 * absent delivery produces no materialization rather than a synthetic state.
 */
export class NarrowTreasuryGcuDeliveryProjectionRebuilder {
  readonly #sha256Hex: Sha256Hex;

  constructor(input: { readonly sha256Hex: Sha256Hex }) {
    this.#sha256Hex = input.sha256Hex;
  }

  async rebuild(
    transaction: SqlExecutor,
    watermark: Readonly<{
      readonly worldId: string;
      readonly worldVersion: string;
      readonly eventSequence: string;
    }>,
  ): Promise<number> {
    const worldVersion = positiveInteger(
      watermark.worldVersion,
      'Projection rebuild WorldVersion',
    );
    positiveInteger(
      watermark.eventSequence,
      'Projection rebuild Event sequence',
    );
    const worldId = requiredString(
      watermark.worldId,
      'Projection rebuild World ID',
    );
    const result = await transaction.query<DeliveryProjectionRow>(
      `with latest_delivery as (
         select event.world_id,
                event.event_id,
                event.world_version as delivery_world_version,
                event.causation_command_id as delivery_command_id,
                command.command_fingerprint as delivery_fingerprint,
                event.canonical_payload as event_payload
           from world_v2.authoritative_event event
           join world_v2.command_submission command
             on command.world_id = event.world_id
            and command.command_id = event.causation_command_id
          where event.world_id = $1
            and event.event_type = $2
            and event.schema_version = $3
          order by event.world_version desc, event.event_sequence desc
          limit 1
       )
       select delivery.delivery_command_id,
              delivery.delivery_fingerprint,
              delivery.delivery_world_version,
              delivery.event_id,
              delivery.event_payload,
              inventory.posting_fingerprint as inventory_posting_fingerprint,
              financial.batch_fingerprint as financial_posting_fingerprint
         from latest_delivery delivery
         join world_v2.inventory_posting inventory
           on inventory.world_id = delivery.world_id
          and inventory.causation_command_id = delivery.delivery_command_id
          and inventory.world_version_after = delivery.delivery_world_version
         join world_v2.financial_posting_batch financial
           on financial.world_id = delivery.world_id
          and financial.causation_command_id = delivery.delivery_command_id
          and financial.world_version_after = delivery.delivery_world_version`,
      [worldId, NARROW_TREASURY_GCU_DELIVERY_EVENT_TYPE, EVENT_SCHEMA_VERSION],
    );
    if (result.rows.length === 0) return 0;
    if (result.rows.length !== 1) {
      invalid(
        'Delivery projection source does not have one inventory and financial Posting pair',
      );
    }
    const row = result.rows[0]!;
    const materialization = createNarrowTreasuryGcuDeliveryMaterialization(
      deliveryProjectionInput({
        row,
        worldId,
        materializedWorldVersion: worldVersion,
      }),
    );
    const canonicalPayload = canonicalSerialize(materialization.payload);
    await transaction.query(
      `insert into world_v2.current_materialization
         (world_id, materialization_key, world_version, source_command_id,
          canonical_payload, payload_sha256)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        worldId,
        materialization.key,
        worldVersion,
        row.delivery_command_id,
        canonicalPayload,
        canonicalSha256(
          canonicalHashInput(materialization.payload),
          this.#sha256Hex,
        ),
      ],
    );
    return 1;
  }
}
