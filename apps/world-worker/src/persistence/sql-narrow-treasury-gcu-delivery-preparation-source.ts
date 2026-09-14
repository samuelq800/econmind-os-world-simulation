import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  createWorldWriterCommitAssertion,
  eventId,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryPostingId,
  outboxMessageId,
  parseNarrowTreasuryGcuDeliveryTerms,
  parseWorldWriterLease,
  workerId,
  type CanonicalCommand,
  type FinancialAccount,
  type InventoryAccount,
  type Sha256Hex,
} from '@econmind/core';

import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import {
  createNarrowTreasuryGcuDeliveryCandidateFactory,
  type NarrowTreasuryGcuDeliveryPreparationSource,
} from './narrow-treasury-gcu-delivery-draft.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

interface LeaseRow {
  readonly acquired_at_real: unknown;
  readonly expires_at_real: unknown;
  readonly fencing_token: unknown;
  readonly holder_id: unknown;
  readonly renewed_at_real: unknown;
  readonly world_id: unknown;
}

type JsonRecord = Readonly<Record<string, unknown>>;

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  const rendered =
    value instanceof Date ? value.toISOString() : text(value, label);
  if (!RFC3339_MILLISECONDS.test(rendered)) {
    invalid(`${label} must be canonical RFC3339 milliseconds`);
  }
  return rendered;
}

function canonicalObject(value: string, label: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    invalid(`${label} must be canonical JSON`);
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    canonicalSerialize(parsed) !== value
  ) {
    invalid(`${label} must be one canonical object`);
  }
  return parsed as JsonRecord;
}

function transferCommandId(deliveryCommand: CanonicalCommand): string {
  const payload = canonicalObject(
    deliveryCommand.canonicalPayload,
    'Delivery Command payload',
  );
  return text(payload.transferCommandId, 'Delivery transfer Command ID');
}

function only<T>(values: readonly T[], label: string): T {
  const value = values[0];
  if (value === undefined || values.length !== 1) {
    invalid(`${label} must resolve to exactly one durable record`);
  }
  return value;
}

function deterministicIds(command: CanonicalCommand) {
  const suffix = command.commandId;
  return Object.freeze({
    eventId: eventId(`DELIVERY_EVENT_${suffix}`),
    financialBatchId: financialPostingBatchId(`DELIVERY_FINANCIAL_${suffix}`),
    inventoryPostingId: inventoryPostingId(`DELIVERY_INVENTORY_${suffix}`),
    outboxMessageId: outboxMessageId(`DELIVERY_OUTBOX_${suffix}`),
    buyerTreasuryLegId: financialPostingLegId(`DELIVERY_BUYER_DEBIT_${suffix}`),
    sellerSettlementLegId: financialPostingLegId(
      `DELIVERY_SELLER_CREDIT_${suffix}`,
    ),
  });
}

/**
 * The only narrow V10 delivery preparation adapter backed by durable state.
 * All values are reconstructed within one Worker transaction and must still
 * pass the atomic repository's writer-fence and World-head commit checks.
 */
export class SqlNarrowTreasuryGcuDeliveryPreparationSource implements NarrowTreasuryGcuDeliveryPreparationSource {
  readonly #database: SqlDatabase;
  readonly #lineage: DurableV08LedgerLineageReader;
  readonly #sha256Hex: Sha256Hex;
  readonly #workerId: string;

  constructor(input: {
    readonly database: SqlDatabase;
    readonly sha256Hex: Sha256Hex;
    readonly workerId: string;
  }) {
    this.#database = input.database;
    this.#sha256Hex = input.sha256Hex;
    this.#workerId = workerId(input.workerId);
    this.#lineage = new DurableV08LedgerLineageReader(input);
  }

  async load(
    input: Parameters<NarrowTreasuryGcuDeliveryPreparationSource['load']>[0],
  ) {
    const observedAtReal = timestamp(
      input.observedAtReal,
      'Delivery preparation time',
    );
    return this.#database.transaction(async (transaction) => {
      const snapshot = await this.#lineage.rebuildFrom(
        transaction,
        input.deliveryCommand.worldId,
      );
      const deliveryCommand = await this.#lineage.readCommandFrom(
        transaction,
        input.deliveryCommand.worldId,
        input.deliveryCommand.commandId,
      );
      if (
        canonicalSerialize(deliveryCommand) !==
        canonicalSerialize(input.deliveryCommand)
      ) {
        invalid('Delivery Command differs from durable canonical submission');
      }
      const transferCommand = await this.#lineage.readCommandFrom(
        transaction,
        deliveryCommand.worldId,
        transferCommandId(deliveryCommand),
      );
      const terms = parseNarrowTreasuryGcuDeliveryTerms({
        deliveryCommand,
        transferCommand,
        sha256Hex: this.#sha256Hex,
      });
      const lease = await this.#readActiveLease(
        transaction,
        deliveryCommand.worldId,
        observedAtReal,
      );
      const buyerTreasury = only(
        snapshot.ledgers.financial.accounts.filter(
          (account) => account.accountId === terms.buyerTreasuryAccountId,
        ),
        'Buyer Treasury account',
      );
      const sellerSettlement = only(
        snapshot.ledgers.financial.accounts.filter(
          (account) => account.accountId === terms.sellerSettlementAccountId,
        ),
        'Seller settlement account',
      );
      const source = only(
        snapshot.ledgers.inventory.balances
          .filter(
            (balance) =>
              balance.account.bucket === 'IN_TRANSIT' &&
              balance.account.shipmentId === terms.shipmentId,
          )
          .map((balance) => balance.account),
        'In-transit delivery source account',
      );
      const ids = deterministicIds(deliveryCommand);
      return Object.freeze({
        buyerTreasury: buyerTreasury as FinancialAccount,
        buyerTreasuryLegId: ids.buyerTreasuryLegId,
        commitAssertion: createWorldWriterCommitAssertion(
          lease,
          snapshot.headWorldVersion,
        ),
        eventId: ids.eventId,
        eventSequence: (BigInt(snapshot.headEventSequence) + 1n).toString(),
        financialBatchId: ids.financialBatchId,
        financialState: snapshot.ledgers.financial,
        inventoryPostingId: ids.inventoryPostingId,
        inventoryState: snapshot.ledgers.inventory,
        observedAtReal,
        outboxMessageId: ids.outboxMessageId,
        sellerSettlement: sellerSettlement as FinancialAccount,
        sellerSettlementLegId: ids.sellerSettlementLegId,
        source: source as InventoryAccount,
        transferCommand,
      });
    });
  }

  async #readActiveLease(
    transaction: SqlExecutor,
    requestedWorldId: string,
    observedAtReal: string,
  ) {
    const result = await transaction.query<LeaseRow>(
      `select world_id, holder_id, fencing_token, acquired_at_real,
              renewed_at_real, lease_expires_at_real as expires_at_real
         from world_v2.world_writer_lease
        where world_id = $1
          and holder_id = $2
          and lease_expires_at_real > $3
        for share`,
      [requestedWorldId, this.#workerId, observedAtReal],
    );
    const row = only(result.rows, 'Active writer lease');
    return parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: text(row.world_id, 'Writer lease World ID'),
      holderId: text(row.holder_id, 'Writer lease holder ID'),
      fencingToken:
        typeof row.fencing_token === 'number' ||
        typeof row.fencing_token === 'bigint'
          ? String(row.fencing_token)
          : text(row.fencing_token, 'Writer lease fencing token'),
      acquiredAtReal: timestamp(
        row.acquired_at_real,
        'Writer lease acquired time',
      ),
      renewedAtReal: timestamp(
        row.renewed_at_real,
        'Writer lease renewed time',
      ),
      expiresAtReal: timestamp(row.expires_at_real, 'Writer lease expiry time'),
    });
  }
}

/** Binds the narrow automatic delivery factory to its SQL-only source. */
export function createSqlNarrowTreasuryGcuDeliveryCandidateFactory(input: {
  readonly database: SqlDatabase;
  readonly sha256Hex: Sha256Hex;
  readonly workerId: string;
}) {
  return createNarrowTreasuryGcuDeliveryCandidateFactory({
    sha256Hex: input.sha256Hex,
    source: new SqlNarrowTreasuryGcuDeliveryPreparationSource(input),
  });
}
