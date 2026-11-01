/** Exact bounded posting-set reconstruction. No row is ignored/rebased and no
 * parsed batch creates ledger/source/admission authority. The Core mixed
 * replay independently validates each actual economic effect. */
import { createHash } from 'node:crypto';
import {
  CENTRAL_BANK_OMO_COMMAND,
  DomainError,
  DOMAIN_ERROR_CODES,
  BENEFICIAL_HOUSING_RENT_COMMAND,
  canonicalSerialize,
  createInventoryPosting,
  createInventoryAccount,
  worldId,
  countryId,
  commandId,
  eventId,
  inventoryPostingId,
  inventoryBatchId,
  inventoryLocationId,
  inventoryReservationId,
  inventoryShipmentId,
  legalEntityId,
  economicRecognitionId,
  commodityId,
  Quantity,
  SimTime,
  type InventoryPosting,
  type InventoryOperation,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type FinancialPostingBatch,
} from '@econmind/core';
import { POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND } from '@econmind/core/authenticated-office-command-contract';
import { decodeDurableFinancialPostingBatch } from './durable-v08-ledger-lineage-reader.js';
import type { FinanceNativeBudgetCanonicalFrame } from '@econmind/core/finance-budget-native';
export type BoundedPostwarCanonicalFrame = Omit<
  FinanceNativeBudgetCanonicalFrame,
  'financialPostingBatches'
> & { readonly financialPostingBatches: readonly FinancialPostingBatch[] };
import type { SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const MAX_BATCHES = 512;
const MAX_BATCH_BYTES = 65536;
export interface BoundedPostwarFinancialPostingRow {
  readonly causation_command_id: unknown;
  readonly canonical_payload: unknown;
  readonly fingerprint: unknown;
}
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Bounded FX postings: ' + message,
  );
}
export const POSTWAR_BOUNDED_JOURNAL_QUERY =
  'select * from world_v2.read_postwar_bounded_journal($1,$2,$3)';
export async function readBoundedPostwarJournalFrom(
  tx: SqlExecutor,
  input: {
    readonly worldId: string;
    readonly countryId: string;
    readonly officeId: 'SOCIAL' | 'FINANCE';
  },
) {
  const result = await tx.query<Record<string, unknown>>(
    POSTWAR_BOUNDED_JOURNAL_QUERY,
    [input.worldId, input.countryId, input.officeId],
  );
  if (result.rows.length !== 1)
    invalid('one complete bounded journal required');
  return decodeBoundedPostwarJournal(result.rows[0]);
}
/** Data-only decoding for fixed domain-specific SQL getters. This function
 * does not grant source access, admission, currentness or execution authority. */
export function decodeBoundedPostwarJournal(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('complete fixed journal response required');
  const r = value as Record<string, unknown>;
  const uint = (v: unknown): v is string =>
    typeof v === 'string' && /^(?:0|[1-9]\d*)$/u.test(v);
  if (
    !r ||
    !uint(r.world_version) ||
    !uint(r.event_sequence) ||
    BigInt(r.world_version) > 256n ||
    BigInt(r.event_sequence) > 256n ||
    !uint(r.financial_batch_count) ||
    BigInt(r.financial_batch_count) > BigInt(MAX_BATCHES) ||
    !uint(r.inventory_posting_count) ||
    BigInt(r.inventory_posting_count) > 256n ||
    (r.inventory_posting_count !== '0' &&
      !Array.isArray(r.inventory_postings)) ||
    !Array.isArray(r.financial_batches) ||
    r.financial_batches.length !== Number(r.financial_batch_count)
  )
    invalid('complete bounded journal and actual head required');
  const rows = r.financial_batches.map((row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      invalid('canonical batch row required');
    const b = row as Record<string, unknown>;
    if (
      typeof b.causation_command_id !== 'string' ||
      !b.causation_command_id ||
      typeof b.canonical_payload !== 'string' ||
      Buffer.byteLength(b.canonical_payload) > MAX_BATCH_BYTES ||
      typeof b.fingerprint !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/u.test(b.fingerprint)
    )
      invalid('bounded canonical batch bytes and fingerprint required');
    return Object.freeze({
      causation_command_id: b.causation_command_id,
      canonical_payload: b.canonical_payload,
      fingerprint: b.fingerprint,
    });
  });
  const inventoryRows = (
    Array.isArray(r.inventory_postings) ? r.inventory_postings : []
  ).map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      invalid('canonical inventory row required');
    const v = raw as Record<string, unknown>;
    if (
      typeof v.causation_command_id !== 'string' ||
      !v.causation_command_id ||
      typeof v.canonical_payload !== 'string' ||
      Buffer.byteLength(v.canonical_payload) > 65536 ||
      typeof v.fingerprint !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/u.test(v.fingerprint)
    )
      invalid('bounded canonical inventory bytes required');
    return Object.freeze({
      causation_command_id: v.causation_command_id,
      canonical_payload: v.canonical_payload,
      fingerprint: v.fingerprint,
    });
  });
  if (inventoryRows.length !== Number(r.inventory_posting_count))
    invalid('complete actual inventory set required');
  const bytes =
    inventoryRows.reduce(
      (n, b) => n + Buffer.byteLength(b.canonical_payload),
      0,
    ) + rows.reduce((n, b) => n + Buffer.byteLength(b.canonical_payload), 0);
  if (bytes > 1048576) invalid('complete journal byte capacity exceeded');
  return Object.freeze({
    rows: Object.freeze(rows),
    inventoryRows: Object.freeze(inventoryRows),
    bytes,
    head: Object.freeze({
      worldVersion: r.world_version,
      eventSequence: r.event_sequence,
    }),
    financialBatchCount: r.financial_batch_count,
    inventoryPostingCount: r.inventory_posting_count,
  });
}
/** Both non-FX effects and missing/extra FX batches deny. Complete global-set
 * coverage is checked after every canonical command group has been decoded. */
export function decodeBoundedPostwarFinancialPostings(input: {
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly rows: readonly BoundedPostwarFinancialPostingRow[];
}): readonly FinancialPostingBatch[] {
  const rows = input.rows.filter(
    (r) => r.causation_command_id === input.command.commandId,
  );
  if (input.command.commandType === CENTRAL_BANK_OMO_COMMAND) {
    if (rows.length !== 1) invalid('exact one OMO LC batch required');
    const batch = decodeDurableFinancialPostingBatch({
      ...input,
      row: rows[0]!,
      sha256Hex: sha,
    });
    if (batch.settlementCurrency === 'GCU' || batch.legs.length !== 4)
      invalid('exact four-leg OMO LC batch required');
    // Structural reconstruction only. Shared Core independently validates the
    // complete original/quote, rights, event and all four actual ledger legs.
    return Object.freeze([batch]);
  }
  if (input.command.commandType === 'CORE_GOODS_DELIVERY_V1') {
    if (rows.length !== 1)
      invalid('exact one Goods delivery GCU batch required');
    const batch = decodeDurableFinancialPostingBatch({
      ...input,
      row: rows[0]!,
      sha256Hex: sha,
    });
    if (batch.settlementCurrency !== 'GCU' || batch.legs.length !== 2)
      invalid('exact two-leg Goods delivery GCU batch required');
    return Object.freeze([batch]);
  }
  if (input.command.commandType === BENEFICIAL_HOUSING_RENT_COMMAND) {
    if (rows.length !== 1) invalid('exact one beneficial rent batch required');
    // This only validates canonical data. The Core rent replay must rederive
    // the complete lease/claim transfer against its admitted origin.
    return Object.freeze(
      rows.map((row) =>
        decodeDurableFinancialPostingBatch({ ...input, row, sha256Hex: sha }),
      ),
    );
  }
  if (input.command.commandType !== POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND) {
    if (rows.length)
      invalid('financial effects outside the installed FX family');
    return Object.freeze([]);
  }
  if (rows.length !== 2) invalid('exact two FX currency batches required');
  const batches = rows.map((row) =>
    decodeDurableFinancialPostingBatch({ ...input, row, sha256Hex: sha }),
  );
  if (
    new Set(batches.map((b) => b.batchId)).size !== 2 ||
    new Set(batches.map((b) => b.settlementCurrency)).size !== 2
  )
    invalid('distinct exact FX batches required');
  // Stable comparison only; Core rederives both batches and all six legs.
  return Object.freeze(
    batches.sort((a, b) =>
      a.settlementCurrency === 'GCU'
        ? 1
        : b.settlementCurrency === 'GCU'
          ? -1
          : a.batchId.localeCompare(b.batchId),
    ),
  );
}

/** Exact whole-set decoder. This accepts no production/consumption effects;
 * the Core reducer must additionally rederive the complete Goods lifecycle. */
export function decodeBoundedPostwarInventoryPostings(input: {
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly rows: readonly BoundedPostwarFinancialPostingRow[];
}): readonly InventoryPosting[] {
  const rows = input.rows.filter(
    (r) => r.causation_command_id === input.command.commandId,
  );
  const operation = (
    {
      CORE_GOODS_TRANSFER_V1: 'RESERVE',
      CORE_GOODS_SHIPMENT_V1: 'SHIP',
      CORE_GOODS_DELIVERY_V1: 'DELIVER',
    } as const
  )[input.command.commandType as 'CORE_GOODS_TRANSFER_V1'];
  if (!operation) {
    if (rows.length)
      invalid('inventory effects outside installed Goods family');
    return Object.freeze([]);
  }
  if (rows.length !== 1) invalid('exact one Goods inventory posting required');
  const r = rows[0]!,
    raw = r.canonical_payload;
  if (typeof raw !== 'string') invalid('canonical inventory bytes required');
  const obj = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v))
      invalid('inventory object required');
    return v as Record<string, unknown>;
  };
  const str = (v: unknown): string => {
    if (typeof v !== 'string' || !v || v.trim() !== v)
      invalid('canonical inventory field required');
    return v;
  };
  const p = obj(JSON.parse(raw));
  if (
    canonicalSerialize(p) !== raw ||
    p.schemaVersion !== 'inventory-posting-v1' ||
    p.operation !== operation ||
    !Array.isArray(p.entries) ||
    p.entries.length !== 2 ||
    !Array.isArray(p.causationEventIds)
  )
    invalid('exact canonical Goods intent required');
  const posting = createInventoryPosting(
    {
      schemaVersion: 'inventory-posting-v1',
      postingId: inventoryPostingId(str(p.postingId)),
      worldId: worldId(str(p.worldId)),
      causationCommandId: commandId(str(p.causationCommandId)),
      causationEventIds: p.causationEventIds.map((v) => eventId(str(v))),
      worldVersionBefore: str(p.worldVersionBefore),
      worldVersionAfter: str(p.worldVersionAfter),
      simTime: SimTime.fromTicks(str(p.simTime)),
      operation: p.operation as InventoryOperation,
      command: input.command,
      transition: input.transition,
      entries: p.entries.map((raw) => {
        const e = obj(raw),
          a = obj(e.account),
          q = obj(e.delta);
        const bucket = a.bucket;
        if (
          bucket !== 'AVAILABLE' &&
          bucket !== 'RESERVED' &&
          bucket !== 'IN_TRANSIT'
        )
          invalid('inventory bucket required');
        return {
          account: createInventoryAccount({
            worldId: worldId(str(a.worldId)),
            countryId: countryId(str(a.countryId)),
            commodityId: commodityId(str(a.commodityId)),
            batchId: inventoryBatchId(str(a.batchId)),
            unit: str(a.unit),
            physicalLocationId: inventoryLocationId(str(a.physicalLocationId)),
            bucket,
            reservationId:
              a.reservationId === null
                ? null
                : inventoryReservationId(str(a.reservationId)),
            shipmentId:
              a.shipmentId === null
                ? null
                : inventoryShipmentId(str(a.shipmentId)),
            titleHolderId: legalEntityId(str(a.titleHolderId)),
            riskBearerId: legalEntityId(str(a.riskBearerId)),
            economicRecognitionId:
              a.economicRecognitionId === null
                ? null
                : economicRecognitionId(str(a.economicRecognitionId)),
          }),
          delta: Quantity.from(str(q.amount), str(q.unit)),
        };
      }),
    },
    sha,
  );
  const { fingerprint, ...intent } = posting;
  if (
    fingerprint !== r.fingerprint ||
    canonicalSerialize(intent) !== raw ||
    r.causation_command_id !== posting.causationCommandId
  )
    invalid('inventory hash or exact intent differs');
  return Object.freeze([posting]);
}
