// PREPARATION_ONLY_NOT_V09_2_STARTED. No startup/barrel integration.
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  Quantity,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  createInventoryAccount,
  createWorldWriterCommitAssertion,
  eventId,
  inventoryPostingId,
  outboxMessageId,
  parseNarrowTreasuryGcuShipmentTerms,
  parseNarrowTreasuryGcuTransferTerms,
  parseWorldWriterLease,
  workerId,
  type InventoryAccount,
  type Sha256Hex,
} from '@econmind/core';

import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import {
  createNarrowTreasuryGcuShipmentCandidateFactory,
  type NarrowTreasuryGcuShipmentPreparationSource,
} from './narrow-treasury-gcu-shipment-draft.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

type RecordValue = Readonly<Record<string, unknown>>;

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0)
    invalid(`${label} is absent`);
  return value;
}

function timestamp(value: unknown): string {
  const rendered =
    value instanceof Date ? value.toISOString() : text(value, 'Real time');
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(rendered) ||
    !Number.isFinite(Date.parse(rendered)) ||
    new Date(rendered).toISOString() !== rendered
  )
    invalid('Shipment preparation requires canonical server-held real time');
  return rendered;
}

function object(value: unknown): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid('Expected a canonical object');
  return value as RecordValue;
}

function canonicalObject(value: unknown): RecordValue {
  const raw = text(value, 'Canonical payload');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalid('Canonical payload is invalid JSON');
  }
  if (canonicalSerialize(parsed) !== raw)
    invalid('Payload differs from canonical serialization');
  return object(parsed);
}

function only<T>(rows: readonly T[], label: string): T {
  const row = rows[0];
  if (row === undefined || rows.length !== 1)
    invalid(`${label} must resolve to exactly one durable record`);
  return row;
}

/** Reads existing facts only; the existing atomic repository alone writes. */
export class SqlNarrowTreasuryGcuShipmentPreparationSource implements NarrowTreasuryGcuShipmentPreparationSource {
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
    input: Parameters<NarrowTreasuryGcuShipmentPreparationSource['load']>[0],
  ): ReturnType<NarrowTreasuryGcuShipmentPreparationSource['load']> {
    const observedAtReal = timestamp(input.observedAtReal);
    return this.#database.transaction(async (transaction) => {
      // Same submission-before-lease/head order as the existing Reservation host.
      await transaction.query(
        'select command_id from world_v2.command_submission where world_id=$1 and command_id=$2 for update',
        [input.shipmentCommand.worldId, input.shipmentCommand.commandId],
      );
      const command = await this.#lineage.readCommandFrom(
        transaction,
        input.shipmentCommand.worldId,
        input.shipmentCommand.commandId,
      );
      if (
        canonicalSerialize(command) !==
        canonicalSerialize(input.shipmentCommand)
      )
        invalid('Shipment differs from durable canonical submission');
      const transfer = await this.#lineage.readCommandFrom(
        transaction,
        command.worldId,
        text(
          canonicalObject(command.canonicalPayload).transferCommandId,
          'Original transfer ID',
        ),
      );
      parseNarrowTreasuryGcuShipmentTerms({
        shipmentCommand: command,
        transferCommand: transfer,
        sha256Hex: this.#sha256Hex,
      });
      const terms = parseNarrowTreasuryGcuTransferTerms(transfer);
      const lease = await this.#readLease(
        transaction,
        command.worldId,
        observedAtReal,
      );
      const snapshot = await this.#lineage.rebuildFrom(
        transaction,
        command.worldId,
      );
      if (
        command.expectedWorldVersion === null ||
        command.expectedWorldVersion !== snapshot.headWorldVersion ||
        command.simTime.ticks < transfer.simTime.ticks
      )
        invalid(
          'Shipment WorldVersion or SimTime does not bind durable lineage',
        );
      // Replay above validates the complete opening/Event/Posting chain. This
      // query selects the exact original Reserve, not another same-asset stock.
      const proof = only(
        (
          await transaction.query<RecordValue>(
            `select posting.canonical_payload, posting.posting_fingerprint as fingerprint,
                receipt.command_fingerprint, receipt.outcome, receipt.reason_code,
                receipt.transition_id, receipt.world_version_before::text,
                receipt.world_version_after::text, receipt.sim_time::text,
                receipt.event_ids,
                (select json_agg(event.event_id order by event.event_sequence)
                   from world_v2.authoritative_event event
                  where event.world_id=posting.world_id
                    and event.causation_command_id=posting.causation_command_id) as committed_event_ids
           from world_v2.inventory_posting posting
           join world_v2.command_receipt receipt
             on receipt.world_id=posting.world_id and receipt.command_id=posting.causation_command_id
          where posting.world_id=$1 and posting.causation_command_id=$2`,
            [command.worldId, transfer.commandId],
          )
        ).rows,
        'Committed original Reserve',
      );
      const posting = canonicalObject(proof.canonical_payload);
      const before = text(proof.world_version_before, 'Reserve WorldVersion');
      const after = text(proof.world_version_after, 'Reserve WorldVersion');
      if (
        proof.outcome !== 'COMMITTED' ||
        proof.reason_code !== null ||
        proof.transition_id !== transfer.commandId ||
        proof.command_fingerprint !== transfer.fingerprint ||
        before !== transfer.expectedWorldVersion ||
        after !== (BigInt(before) + 1n).toString() ||
        BigInt(after) > BigInt(snapshot.headWorldVersion) ||
        proof.sim_time !== transfer.simTime.toCanonicalValue() ||
        posting.operation !== 'RESERVE' ||
        posting.worldId !== command.worldId ||
        posting.causationCommandId !== transfer.commandId ||
        posting.worldVersionBefore !== before ||
        posting.worldVersionAfter !== after ||
        posting.simTime !== proof.sim_time ||
        canonicalSerialize(posting.causationEventIds) !==
          canonicalSerialize(proof.event_ids) ||
        canonicalSerialize(proof.event_ids) !==
          canonicalSerialize(proof.committed_event_ids) ||
        canonicalSha256(canonicalHashInput(posting), this.#sha256Hex) !==
          proof.fingerprint ||
        !snapshot.ledgers.inventory.appliedPostings.some(
          (applied) =>
            applied.postingId === posting.postingId &&
            applied.fingerprint === proof.fingerprint,
        )
      )
        invalid(
          'Original Reserve does not bind a complete committed replayed transition',
        );
      if (!Array.isArray(posting.entries))
        invalid('Reserve posting entries are absent');
      const credited = only(
        posting.entries
          .map((value) => object(value))
          .filter((entry) => object(entry.account).bucket === 'RESERVED'),
        'Original Reserve credited account',
      );
      const account = createInventoryAccount(
        object(credited.account) as unknown as InventoryAccount,
      );
      const delta = object(credited.delta);
      const quantity = Quantity.from(
        text(delta.amount, 'Reserved quantity'),
        text(delta.unit, 'Reserved unit'),
      );
      if (
        canonicalSerialize(quantity) !== canonicalSerialize(terms.quantity) ||
        account.worldId !== command.worldId ||
        account.countryId !== terms.sellerCountryId ||
        account.commodityId !== terms.commodityId ||
        account.unit !== terms.quantity.unit ||
        account.batchId !== terms.assetSource.batchId ||
        account.physicalLocationId !== terms.assetSource.physicalLocationId ||
        account.titleHolderId !== terms.assetSource.titleHolderId ||
        account.riskBearerId !== terms.assetSource.riskBearerId ||
        account.economicRecognitionId !==
          terms.assetSource.economicRecognitionId ||
        account.reservationId === null ||
        account.shipmentId !== null
      )
        invalid(
          'Reserved account or exact quantity differs from original transfer',
        );
      const balance = only(
        snapshot.ledgers.inventory.balances.filter(
          (position) =>
            canonicalSerialize(position.account) ===
            canonicalSerialize(account),
        ),
        'Replayed original reserved position',
      );
      if (balance.quantity.subtract(terms.quantity).amount.isNegative())
        invalid('Original reserved inventory is no longer sufficient');
      const suffix = command.commandId;
      return Object.freeze({
        transferCommand: transfer,
        inventoryState: snapshot.ledgers.inventory,
        source: balance.account,
        commitAssertion: createWorldWriterCommitAssertion(
          lease,
          snapshot.headWorldVersion,
        ),
        eventId: eventId(`SHIPMENT_EVENT_${suffix}`),
        eventSequence: (BigInt(snapshot.headEventSequence) + 1n).toString(),
        inventoryPostingId: inventoryPostingId(`SHIPMENT_INVENTORY_${suffix}`),
        outboxMessageId: outboxMessageId(`SHIPMENT_OUTBOX_${suffix}`),
        observedAtReal,
      });
    });
  }

  async #readLease(transaction: SqlExecutor, world: string, at: string) {
    const row = only(
      (
        await transaction.query<RecordValue>(
          `select world_id, holder_id, fencing_token::text, acquired_at_real,
              renewed_at_real, lease_expires_at_real
         from world_v2.world_writer_lease
        where world_id=$1 and holder_id=$2 and lease_expires_at_real>$3::timestamptz
        for share`,
          [world, this.#workerId, at],
        )
      ).rows,
      'Existing active writer lease',
    );
    const lease = parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: text(row.world_id, 'Lease World'),
      holderId: text(row.holder_id, 'Lease holder'),
      fencingToken: text(row.fencing_token, 'Lease fence'),
      acquiredAtReal: timestamp(row.acquired_at_real),
      renewedAtReal: timestamp(row.renewed_at_real),
      expiresAtReal: timestamp(row.lease_expires_at_real),
    });
    if (
      lease.worldId !== world ||
      lease.holderId !== this.#workerId ||
      lease.expiresAtReal <= at ||
      lease.renewedAtReal > at
    )
      invalid(
        'Existing lease does not bind this World, holder and operational time',
      );
    return lease;
  }
}

/** Compatible with createAuthoritativeWorkerExecution, not installed by it. */
export function createSqlNarrowTreasuryGcuShipmentCandidateFactory(input: {
  readonly database: SqlDatabase;
  readonly sha256Hex: Sha256Hex;
  readonly workerId: string;
}) {
  return createNarrowTreasuryGcuShipmentCandidateFactory({
    sha256Hex: input.sha256Hex,
    source: new SqlNarrowTreasuryGcuShipmentPreparationSource(input),
  });
}
