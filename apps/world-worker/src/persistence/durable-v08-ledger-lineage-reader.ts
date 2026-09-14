import {
  DOMAIN_ERROR_CODES,
  DomainError,
  SimTime,
  canonicalSerialize,
  createAuthoritativeTransition,
  createFinancialPostingBatch,
  createInventoryPosting,
  commandId,
  eventId,
  financialAccountId,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryPostingId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  rebuildV08LedgersFromLineage,
  worldId,
  Money,
  Quantity,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type FinancialPostingBatch,
  type FinancialPostingDirection,
  type InventoryPosting,
  type InventoryPostingEntry,
  type RebuiltV08Ledgers,
  type Sha256Hex,
  type V08AuthoritativeLedgerTransition,
} from '@econmind/core';

import { WorldOpeningSeedStore } from './opening-seed-store.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

type JsonRecord = Readonly<Record<string, unknown>>;

interface HeadRow {
  readonly event_sequence: unknown;
  readonly world_version: unknown;
}

interface DurableCommandRow {
  readonly command_actor_id: unknown;
  readonly command_auth_subject: unknown;
  readonly command_canonical_payload: unknown;
  readonly command_country_id: unknown;
  readonly command_expected_world_version: unknown;
  readonly command_fingerprint: unknown;
  readonly command_id: unknown;
  readonly command_idempotency_key: unknown;
  readonly command_office_id: unknown;
  readonly command_payload_sha256: unknown;
  readonly command_schema_version: unknown;
  readonly command_sim_time: unknown;
  readonly command_submitted_at_real: unknown;
  readonly command_type: unknown;
  readonly command_world_id: unknown;
  readonly correlation_id: unknown;
}

interface DurableTransitionRow extends DurableCommandRow {
  readonly event_canonical_payload: unknown;
  readonly event_causation_command_id: unknown;
  readonly event_corrects_event_id: unknown;
  readonly event_fingerprint: unknown;
  readonly event_id: unknown;
  readonly event_payload_sha256: unknown;
  readonly event_recorded_at_real: unknown;
  readonly event_schema_version: unknown;
  readonly event_sequence: unknown;
  readonly event_sim_time: unknown;
  readonly event_type: unknown;
  readonly event_world_id: unknown;
  readonly event_world_version: unknown;
}

interface PostingRow {
  readonly canonical_payload: unknown;
  readonly causation_command_id: unknown;
  readonly fingerprint: unknown;
}

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

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}

function integer(value: unknown, label: string): string {
  const rendered =
    typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : value;
  if (typeof rendered !== 'string' || !NON_NEGATIVE_INTEGER.test(rendered)) {
    invalid(`${label} must be a canonical non-negative integer`);
  }
  return rendered;
}

function timestamp(value: unknown, label: string): string {
  const rendered =
    value instanceof Date ? value.toISOString() : text(value, label);
  if (!RFC3339_MILLISECONDS.test(rendered)) {
    invalid(`${label} must be canonical RFC3339 milliseconds`);
  }
  return rendered;
}

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`${label} must be a plain canonical object`);
  }
  return value as JsonRecord;
}

function list(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  return value;
}

function canonicalObject(value: unknown, label: string): JsonRecord {
  const raw = text(value, `${label} canonical payload`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalid(`${label} canonical payload must be valid JSON`);
  }
  if (canonicalSerialize(parsed) !== raw) {
    invalid(`${label} canonical payload is not canonical`);
  }
  return record(parsed, label);
}

function canonicalIntent(value: object): string {
  const { fingerprint: _fingerprint, ...intent } = value as {
    readonly fingerprint: unknown;
  } & Record<string, unknown>;
  void _fingerprint;
  return canonicalSerialize(intent);
}

function parseCommand(
  row: DurableCommandRow,
  sha256Hex: Sha256Hex,
): CanonicalCommand {
  const payload = canonicalObject(row.command_canonical_payload, 'Command');
  const command = parseCanonicalCommand(
    {
      actorId: text(row.command_actor_id, 'Command actor ID'),
      authSubject: text(row.command_auth_subject, 'Command auth subject'),
      commandId: text(row.command_id, 'Command ID'),
      commandType: text(row.command_type, 'Command type'),
      correlationId: text(row.correlation_id, 'Command correlation ID'),
      countryId: text(row.command_country_id, 'Command country ID'),
      expectedWorldVersion:
        row.command_expected_world_version === null
          ? null
          : integer(
              row.command_expected_world_version,
              'Command expected WorldVersion',
            ),
      idempotencyKey: nullableText(
        row.command_idempotency_key,
        'Command idempotency key',
      ),
      officeId: nullableText(row.command_office_id, 'Command Office ID'),
      payload,
      schemaVersion: text(row.command_schema_version, 'Command schema version'),
      simTime: integer(row.command_sim_time, 'Command SimTime'),
      submittedAtReal: timestamp(
        row.command_submitted_at_real,
        'Command submission time',
      ),
      worldId: text(row.command_world_id, 'Command World ID'),
    },
    sha256Hex,
  );
  if (
    command.payloadHash !==
      text(row.command_payload_sha256, 'Command payload hash') ||
    command.fingerprint !== text(row.command_fingerprint, 'Command fingerprint')
  ) {
    invalid('Durable Command hashes differ from canonical command intent');
  }
  return command;
}

function parseEvent(row: DurableTransitionRow, sha256Hex: Sha256Hex) {
  const payload = canonicalObject(row.event_canonical_payload, 'Event');
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: text(row.event_schema_version, 'Event schema version'),
      eventId: text(row.event_id, 'Event ID'),
      eventType: text(row.event_type, 'Event type'),
      worldId: text(row.event_world_id, 'Event World ID'),
      causationCommandId: text(
        row.event_causation_command_id,
        'Event causation Command ID',
      ),
      correlationId: text(row.correlation_id, 'Event correlation ID'),
      worldVersion: integer(row.event_world_version, 'Event WorldVersion'),
      sequence: integer(row.event_sequence, 'Event sequence'),
      simTime: integer(row.event_sim_time, 'Event SimTime'),
      recordedAtReal: timestamp(
        row.event_recorded_at_real,
        'Event recorded time',
      ),
      correctsEventId: nullableText(
        row.event_corrects_event_id,
        'Event correction ID',
      ),
      payload,
    },
    sha256Hex,
  );
  if (
    event.payloadHash !==
      text(row.event_payload_sha256, 'Event payload hash') ||
    event.fingerprint !== text(row.event_fingerprint, 'Event fingerprint')
  ) {
    invalid('Durable Event hashes differ from canonical event intent');
  }
  return event;
}

function parseInventoryPosting(input: {
  readonly command: CanonicalCommand;
  readonly row: PostingRow;
  readonly sha256Hex: Sha256Hex;
  readonly transition: AuthoritativeTransition;
}): InventoryPosting {
  const payload = canonicalObject(
    input.row.canonical_payload,
    'Inventory Posting',
  );
  const posting = createInventoryPosting(
    {
      schemaVersion: text(
        payload.schemaVersion,
        'Inventory Posting schema',
      ) as typeof import('@econmind/core').INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: inventoryPostingId(
        text(payload.postingId, 'Inventory Posting ID'),
      ),
      worldId: worldId(text(payload.worldId, 'Inventory Posting World ID')),
      causationCommandId: commandId(
        text(
          payload.causationCommandId,
          'Inventory Posting causation Command ID',
        ),
      ),
      causationEventIds: list(
        payload.causationEventIds,
        'Inventory Posting Event IDs',
      ).map((value) => eventId(text(value, 'Inventory Posting Event ID'))),
      worldVersionBefore: integer(
        payload.worldVersionBefore,
        'Inventory Posting WorldVersion before',
      ),
      worldVersionAfter: integer(
        payload.worldVersionAfter,
        'Inventory Posting WorldVersion after',
      ),
      simTime: SimTime.fromTicks(
        integer(payload.simTime, 'Inventory Posting SimTime'),
      ),
      operation: text(
        payload.operation,
        'Inventory Posting operation',
      ) as import('@econmind/core').InventoryOperation,
      entries: list(payload.entries, 'Inventory Posting entries').map(
        (value) => {
          const entry = record(value, 'Inventory Posting entry');
          const delta = record(entry.delta, 'Inventory Posting delta');
          return Object.freeze({
            account: record(
              entry.account,
              'Inventory Posting account',
            ) as unknown as import('@econmind/core').InventoryAccount,
            delta: Quantity.from(
              text(delta.amount, 'Inventory Posting quantity'),
              text(delta.unit, 'Inventory Posting unit'),
            ),
          }) as InventoryPostingEntry;
        },
      ),
      command: input.command,
      transition: input.transition,
    },
    input.sha256Hex,
  );
  if (
    input.row.causation_command_id !== posting.causationCommandId ||
    text(input.row.fingerprint, 'Inventory Posting fingerprint') !==
      posting.fingerprint ||
    canonicalIntent(posting) !==
      text(input.row.canonical_payload, 'Inventory Posting payload')
  ) {
    invalid('Durable Inventory Posting differs from reconstructed intent');
  }
  return posting;
}

function parseFinancialPosting(input: {
  readonly command: CanonicalCommand;
  readonly row: PostingRow;
  readonly sha256Hex: Sha256Hex;
  readonly transition: AuthoritativeTransition;
}): FinancialPostingBatch {
  const payload = canonicalObject(
    input.row.canonical_payload,
    'Financial Posting',
  );
  const batch = createFinancialPostingBatch(
    {
      schemaVersion: text(
        payload.schemaVersion,
        'Financial Posting schema',
      ) as typeof import('@econmind/core').FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId(
        text(payload.batchId, 'Financial Posting batch ID'),
      ),
      worldId: worldId(text(payload.worldId, 'Financial Posting World ID')),
      causationCommandId: commandId(
        text(
          payload.causationCommandId,
          'Financial Posting causation Command ID',
        ),
      ),
      causationEventIds: list(
        payload.causationEventIds,
        'Financial Posting Event IDs',
      ).map((value) => eventId(text(value, 'Financial Posting Event ID'))),
      worldVersionBefore: integer(
        payload.worldVersionBefore,
        'Financial Posting WorldVersion before',
      ),
      worldVersionAfter: integer(
        payload.worldVersionAfter,
        'Financial Posting WorldVersion after',
      ),
      simTime: SimTime.fromTicks(
        integer(payload.simTime, 'Financial Posting SimTime'),
      ),
      settlementCurrency: text(
        payload.settlementCurrency,
        'Financial Posting settlement currency',
      ),
      legs: list(payload.legs, 'Financial Posting legs').map((value) => {
        const leg = record(value, 'Financial Posting leg');
        const amount = record(leg.amount, 'Financial Posting amount');
        return Object.freeze({
          legId: financialPostingLegId(
            text(leg.legId, 'Financial Posting leg ID'),
          ),
          account: record(
            leg.account,
            'Financial Posting account',
          ) as unknown as import('@econmind/core').FinancialAccount,
          direction: text(
            leg.direction,
            'Financial Posting direction',
          ) as FinancialPostingDirection,
          amount: Money.from(
            text(amount.amount, 'Financial Posting amount'),
            text(amount.currency, 'Financial Posting currency'),
          ),
          counterpartyAccountId:
            leg.counterpartyAccountId === null
              ? null
              : financialAccountId(
                  text(
                    leg.counterpartyAccountId,
                    'Financial Posting counterparty account ID',
                  ),
                ),
        });
      }),
      command: input.command,
      transition: input.transition,
    },
    input.sha256Hex,
  );
  if (
    input.row.causation_command_id !== batch.causationCommandId ||
    text(input.row.fingerprint, 'Financial Posting fingerprint') !==
      batch.fingerprint ||
    canonicalIntent(batch) !==
      text(input.row.canonical_payload, 'Financial Posting payload')
  ) {
    invalid('Durable Financial Posting differs from reconstructed intent');
  }
  return batch;
}

export interface DurableV08LedgerLineageSnapshot {
  readonly headEventSequence: string;
  readonly headWorldVersion: string;
  readonly ledgers: Readonly<RebuiltV08Ledgers>;
}

/**
 * Server-only read boundary for V08 ledger state. It replays the immutable
 * opening seed and durable Command/Event/Posting facts; it accepts neither a
 * browser snapshot nor caller-provided account balances.
 */
export class DurableV08LedgerLineageReader {
  readonly #database: SqlDatabase;
  readonly #openingSeeds: WorldOpeningSeedStore;
  readonly #sha256Hex: Sha256Hex;

  constructor(input: {
    readonly database: SqlDatabase;
    readonly sha256Hex: Sha256Hex;
  }) {
    this.#database = input.database;
    this.#sha256Hex = input.sha256Hex;
    this.#openingSeeds = new WorldOpeningSeedStore(input);
  }

  async rebuild(
    requestedWorldId: string,
  ): Promise<Readonly<RebuiltV08Ledgers>> {
    const canonicalWorldId = worldId(requestedWorldId);
    return this.#database.transaction(async (transaction) => {
      const snapshot = await this.rebuildFrom(transaction, canonicalWorldId);
      return snapshot.ledgers;
    });
  }

  /**
   * Shares an already-open Worker transaction with a later candidate builder,
   * so its opening seed, lineage and writer-fence read have one snapshot.
   */
  async rebuildFrom(
    transaction: SqlExecutor,
    requestedWorldId: string,
  ): Promise<Readonly<DurableV08LedgerLineageSnapshot>> {
    const canonicalWorldId = worldId(requestedWorldId);
    const head = await this.#readHead(transaction, canonicalWorldId);
    const seed = await this.#openingSeeds.loadFrom(
      transaction,
      canonicalWorldId,
    );
    const transitions = await this.#readTransitions(
      transaction,
      canonicalWorldId,
    );
    const rebuilt = rebuildV08LedgersFromLineage({
      seed,
      transitions,
      sha256Hex: this.#sha256Hex,
    });
    const lastEventSequence =
      transitions.at(-1)?.transition.events.at(-1)?.sequence ?? '0';
    if (lastEventSequence !== head.eventSequence) {
      invalid('Replayed Event sequence does not match durable World head');
    }
    if (rebuilt.worldVersion !== head.worldVersion) {
      invalid('Replayed ledger WorldVersion does not match durable World head');
    }
    return Object.freeze({
      headEventSequence: head.eventSequence,
      headWorldVersion: head.worldVersion,
      ledgers: rebuilt,
    });
  }

  async readCommandFrom(
    transaction: SqlExecutor,
    requestedWorldId: string,
    requestedCommandId: string,
  ): Promise<Readonly<CanonicalCommand>> {
    const result = await transaction.query<DurableCommandRow>(
      `select actor_id as command_actor_id,
              auth_subject::text as command_auth_subject,
              canonical_payload as command_canonical_payload,
              country_id as command_country_id,
              expected_world_version as command_expected_world_version,
              command_fingerprint as command_fingerprint,
              command_id as command_id,
              idempotency_key as command_idempotency_key,
              office_id as command_office_id,
              payload_sha256 as command_payload_sha256,
              schema_version as command_schema_version,
              sim_time as command_sim_time,
              submitted_at_real as command_submitted_at_real,
              command_type as command_type,
              world_id as command_world_id,
              correlation_id
         from world_v2.command_submission
        where world_id = $1 and command_id = $2
        for share`,
      [worldId(requestedWorldId), requestedCommandId],
    );
    const row = result.rows[0];
    if (row === undefined || result.rows.length !== 1) {
      invalid('Durable Command is absent or duplicated');
    }
    return parseCommand(row, this.#sha256Hex);
  }

  async #readHead(
    transaction: SqlExecutor,
    requestedWorldId: string,
  ): Promise<Readonly<{ worldVersion: string; eventSequence: string }>> {
    const result = await transaction.query<HeadRow>(
      `select world_version, event_sequence
         from world_v2.world_head
        where world_id = $1
        for share`,
      [requestedWorldId],
    );
    const row = result.rows[0];
    if (row === undefined || result.rows.length !== 1) {
      invalid('Durable World head is absent or duplicated');
    }
    return Object.freeze({
      worldVersion: integer(row.world_version, 'World head version'),
      eventSequence: integer(row.event_sequence, 'World head Event sequence'),
    });
  }

  async #readTransitions(
    transaction: SqlExecutor,
    requestedWorldId: string,
  ): Promise<readonly V08AuthoritativeLedgerTransition[]> {
    const transitions = await transaction.query<DurableTransitionRow>(
      `select command.actor_id as command_actor_id,
              command.auth_subject::text as command_auth_subject,
              command.canonical_payload as command_canonical_payload,
              command.country_id as command_country_id,
              command.expected_world_version as command_expected_world_version,
              command.command_fingerprint as command_fingerprint,
              command.command_id as command_id,
              command.idempotency_key as command_idempotency_key,
              command.office_id as command_office_id,
              command.payload_sha256 as command_payload_sha256,
              command.schema_version as command_schema_version,
              command.sim_time as command_sim_time,
              command.submitted_at_real as command_submitted_at_real,
              command.command_type as command_type,
              command.world_id as command_world_id,
              event.correlation_id,
              event.canonical_payload as event_canonical_payload,
              event.causation_command_id as event_causation_command_id,
              event.corrects_event_id as event_corrects_event_id,
              event.event_fingerprint as event_fingerprint,
              event.event_id as event_id,
              event.payload_sha256 as event_payload_sha256,
              event.recorded_at_real as event_recorded_at_real,
              event.schema_version as event_schema_version,
              event.event_sequence as event_sequence,
              event.sim_time as event_sim_time,
              event.event_type as event_type,
              event.world_id as event_world_id,
              event.world_version as event_world_version
         from world_v2.authoritative_event event
         join world_v2.command_submission command
           on command.world_id = event.world_id
          and command.command_id = event.causation_command_id
        where event.world_id = $1
        order by event.world_version, event.event_sequence`,
      [requestedWorldId],
    );
    const inventory = await transaction.query<PostingRow>(
      `select causation_command_id, canonical_payload,
              posting_fingerprint as fingerprint
         from world_v2.inventory_posting
        where world_id = $1
        order by world_version_after, posting_id`,
      [requestedWorldId],
    );
    const financial = await transaction.query<PostingRow>(
      `select causation_command_id, canonical_payload,
              batch_fingerprint as fingerprint
         from world_v2.financial_posting_batch
        where world_id = $1
        order by world_version_after, batch_id`,
      [requestedWorldId],
    );
    const rowsByCommand = new Map<string, DurableTransitionRow[]>();
    for (const row of transitions.rows) {
      const commandId = text(row.command_id, 'Transition Command ID');
      const group = rowsByCommand.get(commandId) ?? [];
      group.push(row);
      rowsByCommand.set(commandId, group);
    }
    const inventoryByCommand = this.#postingsByCommand(
      inventory.rows,
      'Inventory Posting',
    );
    const financialByCommand = this.#postingsByCommand(
      financial.rows,
      'Financial Posting',
    );
    const rebuilt: V08AuthoritativeLedgerTransition[] = [];
    for (const rows of rowsByCommand.values()) {
      const first = rows[0];
      if (first === undefined)
        invalid('Durable transition is unexpectedly empty');
      const command = parseCommand(first, this.#sha256Hex);
      const events = rows.map((row) => {
        if (
          text(row.command_id, 'Transition Command ID') !== command.commandId
        ) {
          invalid('Durable transition joins more than one Command');
        }
        return parseEvent(row, this.#sha256Hex);
      });
      const worldVersionAfter = events[0]?.worldVersion;
      if (worldVersionAfter === undefined || BigInt(worldVersionAfter) <= 0n) {
        invalid('Durable Event transition WorldVersion after must be positive');
      }
      const worldVersionBefore = (BigInt(worldVersionAfter) - 1n).toString();
      if (
        command.expectedWorldVersion !== null &&
        command.expectedWorldVersion !== worldVersionBefore
      ) {
        invalid(
          'Durable Command expected WorldVersion does not match Event transition boundary',
        );
      }
      const transition = createAuthoritativeTransition({
        command,
        worldVersionBefore,
        worldVersionAfter,
        events,
      });
      rebuilt.push(
        Object.freeze({
          command,
          transition,
          inventoryPostings: Object.freeze(
            (inventoryByCommand.get(command.commandId) ?? []).map((row) =>
              parseInventoryPosting({
                command,
                row,
                sha256Hex: this.#sha256Hex,
                transition,
              }),
            ),
          ),
          financialPostingBatches: Object.freeze(
            (financialByCommand.get(command.commandId) ?? []).map((row) =>
              parseFinancialPosting({
                command,
                row,
                sha256Hex: this.#sha256Hex,
                transition,
              }),
            ),
          ),
        }),
      );
    }
    for (const commandId of [
      ...inventoryByCommand.keys(),
      ...financialByCommand.keys(),
    ]) {
      if (!rowsByCommand.has(commandId)) {
        invalid('Durable Posting has no authoritative Event transition');
      }
    }
    return Object.freeze(rebuilt);
  }

  #postingsByCommand(
    rows: readonly PostingRow[],
    label: string,
  ): ReadonlyMap<string, readonly PostingRow[]> {
    const result = new Map<string, PostingRow[]>();
    for (const row of rows) {
      const commandId = text(
        row.causation_command_id,
        `${label} causation Command ID`,
      );
      const group = result.get(commandId) ?? [];
      group.push(row);
      result.set(commandId, group);
    }
    return result;
  }
}
