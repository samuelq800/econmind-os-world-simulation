// PREPARATION_ONLY_NOT_V09_2_STARTED: test infrastructure only.

import {
  reauthorizeOfficeCapability,
  type AuthorizationCapability,
  type AuthorizedOfficeContext,
  type CountryId,
  type OfficeId,
} from '../../packages/core/src/index.js';
import {
  DeterministicV09FaultInjector,
  InjectedV09AtomicFailure,
  V09TransactionCleanupIncompleteError,
  V09TransactionCommitUnknownError,
  V09TransactionRolledBackError,
  classifyTransactionResult,
  type FaultTraceEntry,
  type TransactionClassification,
  type V09AtomicSqlClient,
  type V09AtomicTestDatabase,
} from './v09-atomic-contract.js';

const SCHEMA = 'v09_atomic_preparation';

const PREPARATION_SCHEMA = Object.freeze([
  `create schema ${SCHEMA}`,
  `create table ${SCHEMA}.world_head (
    world_id text primary key,
    world_version bigint not null check (world_version >= 0),
    event_sequence bigint not null check (event_sequence >= 0)
  )`,
  `create table ${SCHEMA}.writer_lease (
    world_id text primary key references ${SCHEMA}.world_head (world_id),
    holder_id text not null,
    fencing_token bigint not null check (fencing_token > 0),
    expires_at_real timestamptz not null
  )`,
  `create table ${SCHEMA}.inventory_write (
    world_id text not null references ${SCHEMA}.world_head (world_id),
    command_id text not null,
    posting_id text not null,
    amount text not null,
    primary key (world_id, posting_id),
    unique (world_id, command_id)
  )`,
  `create table ${SCHEMA}.financial_write (
    world_id text not null references ${SCHEMA}.world_head (world_id),
    command_id text not null,
    posting_id text not null,
    amount text not null,
    primary key (world_id, posting_id),
    unique (world_id, command_id)
  )`,
  `create table ${SCHEMA}.authoritative_event (
    world_id text not null references ${SCHEMA}.world_head (world_id),
    command_id text not null,
    event_id text not null,
    event_sequence bigint not null,
    world_version bigint not null,
    primary key (world_id, event_id),
    unique (world_id, event_sequence),
    unique (world_id, command_id)
  )`,
  `create table ${SCHEMA}.command_receipt (
    world_id text not null,
    command_id text not null,
    idempotency_key text not null,
    command_fingerprint text not null,
    event_id text not null,
    world_version_before bigint not null,
    world_version_after bigint not null,
    result_payload text not null,
    primary key (world_id, command_id),
    unique (world_id, idempotency_key),
    foreign key (world_id, event_id)
      references ${SCHEMA}.authoritative_event (world_id, event_id),
    check (world_version_after = world_version_before + 1)
  )`,
  `create table ${SCHEMA}.notification_outbox (
    world_id text not null,
    command_id text not null,
    outbox_id text not null,
    event_id text not null,
    delivery_state text not null check (delivery_state = 'PENDING'),
    primary key (world_id, outbox_id),
    unique (world_id, command_id),
    foreign key (world_id, command_id)
      references ${SCHEMA}.command_receipt (world_id, command_id),
    foreign key (world_id, event_id)
      references ${SCHEMA}.authoritative_event (world_id, event_id)
  )`,
]);

const PREPARATION_TEARDOWN = Object.freeze([
  `drop table ${SCHEMA}.notification_outbox restrict`,
  `drop table ${SCHEMA}.command_receipt restrict`,
  `drop table ${SCHEMA}.authoritative_event restrict`,
  `drop table ${SCHEMA}.financial_write restrict`,
  `drop table ${SCHEMA}.inventory_write restrict`,
  `drop table ${SCHEMA}.writer_lease restrict`,
  `drop table ${SCHEMA}.world_head restrict`,
  `drop schema ${SCHEMA} restrict`,
]);

export interface V09AtomicFixtureSeed {
  readonly expiresAtReal: string;
  readonly fencingToken: string;
  readonly holderId: string;
  readonly worldId: string;
  readonly worldVersion: string;
}

export interface V09AtomicCommandFixture {
  readonly authorizationContext: AuthorizedOfficeContext;
  readonly commandFingerprint: string;
  readonly commandId: string;
  readonly expectedAuthorizationRevision: string;
  readonly expectedWorldVersion: string;
  readonly fencingToken: string;
  readonly financialAmount: string;
  readonly holderId: string;
  readonly idempotencyKey: string;
  readonly inventoryAmount: string;
  readonly observedAtReal: string;
  readonly requiredCapability: AuthorizationCapability;
  readonly requiredCountryId: CountryId;
  readonly requiredOfficeId: OfficeId;
  readonly worldId: string;
}

export interface DurableAtomicResult {
  readonly commandFingerprint: string;
  readonly commandId: string;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly resultPayload: string;
  readonly worldVersionAfter: string;
}

export interface V09AtomicAttemptResult {
  readonly classification: TransactionClassification;
  readonly disposition: 'APPLIED' | 'DURABLE_RETRY' | 'FAILED';
  readonly durableResult?: DurableAtomicResult;
  readonly failurePoint?: string;
  readonly trace: readonly FaultTraceEntry[];
}

export interface V09AtomicFootprint {
  readonly eventCount: number;
  readonly financialWriteCount: number;
  readonly inventoryWriteCount: number;
  readonly outboxCount: number;
  readonly receiptCount: number;
  readonly worldVersion: string;
}

interface HeadRow extends Record<string, unknown> {
  readonly event_sequence: string | bigint | number;
  readonly world_version: string | bigint | number;
}

interface LeaseRow extends Record<string, unknown> {
  readonly expires_at_real: string | Date;
  readonly fencing_token: string | bigint | number;
  readonly holder_id: string;
}

interface ReceiptRow extends Record<string, unknown> {
  readonly command_fingerprint: string;
  readonly command_id: string;
  readonly event_id: string;
  readonly idempotency_key: string;
  readonly result_payload: string;
  readonly world_version_after: string | bigint | number;
}

interface CountRow extends Record<string, unknown> {
  readonly count: string | bigint | number;
}

function integerText(value: unknown, label: string): string {
  if (
    (typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'bigint') ||
    !/^\d+$/u.test(String(value))
  ) {
    throw new Error(`${label} is not a non-negative integer`);
  }
  return String(value);
}

function first<Row extends Record<string, unknown>>(
  rows: readonly Row[],
  label: string,
): Row {
  const row = rows[0];
  if (row === undefined) throw new Error(`${label} was not found`);
  return row;
}

function durableResult(row: ReceiptRow): DurableAtomicResult {
  return Object.freeze({
    commandFingerprint: row.command_fingerprint,
    commandId: row.command_id,
    eventId: row.event_id,
    idempotencyKey: row.idempotency_key,
    resultPayload: row.result_payload,
    worldVersionAfter: integerText(
      row.world_version_after,
      'receipt WorldVersion',
    ),
  });
}

function errorPoint(error: unknown): string {
  if (error instanceof InjectedV09AtomicFailure) return error.point;
  if (
    error instanceof V09TransactionRolledBackError ||
    error instanceof V09TransactionCommitUnknownError ||
    error instanceof V09TransactionCleanupIncompleteError
  ) {
    return errorPoint(error.cause);
  }
  if (error instanceof Error) return error.message;
  return 'UNKNOWN_FAILURE';
}

async function queryDurableResult(
  client: V09AtomicSqlClient,
  command: V09AtomicCommandFixture,
): Promise<DurableAtomicResult | null> {
  const result = await client.query<ReceiptRow>(
    `select command_fingerprint, command_id, event_id, idempotency_key,
            result_payload, world_version_after
       from ${SCHEMA}.command_receipt
      where world_id = $1 and idempotency_key = $2`,
    [command.worldId, command.idempotencyKey],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  if (row.command_fingerprint !== command.commandFingerprint) {
    throw new Error('IDEMPOTENCY_INTENT_CONFLICT');
  }
  return durableResult(row);
}

export async function bootstrapV09AtomicPreparationSchema(
  database: V09AtomicTestDatabase,
): Promise<void> {
  for (const statement of PREPARATION_SCHEMA) {
    await database.query(statement);
  }
}

export async function cleanupV09AtomicPreparationSchema(
  database: V09AtomicTestDatabase,
): Promise<TransactionClassification> {
  try {
    await database.transaction(async (client) => {
      for (const statement of PREPARATION_TEARDOWN) {
        await client.query(statement);
      }
    });
    return 'COMMITTED';
  } catch {
    return 'CLEANUP_INCOMPLETE';
  }
}

export async function seedV09AtomicFixture(
  database: V09AtomicTestDatabase,
  seed: V09AtomicFixtureSeed,
): Promise<void> {
  await database.transaction(async (client) => {
    await client.query(
      `insert into ${SCHEMA}.world_head
        (world_id, world_version, event_sequence)
       values ($1, $2::bigint, $2::bigint)`,
      [seed.worldId, seed.worldVersion],
    );
    await client.query(
      `insert into ${SCHEMA}.writer_lease
        (world_id, holder_id, fencing_token, expires_at_real)
       values ($1, $2, $3::bigint, $4::timestamptz)`,
      [seed.worldId, seed.holderId, seed.fencingToken, seed.expiresAtReal],
    );
  });
}

async function executeCandidateTransaction(
  client: V09AtomicSqlClient,
  command: V09AtomicCommandFixture,
  injector: DeterministicV09FaultInjector,
): Promise<{
  readonly disposition: 'APPLIED' | 'DURABLE_RETRY';
  readonly result: DurableAtomicResult;
}> {
  const head = first(
    (
      await client.query<HeadRow>(
        `select world_version, event_sequence
           from ${SCHEMA}.world_head
          where world_id = $1
          for update`,
        [command.worldId],
      )
    ).rows,
    'World head',
  );

  const prior = await queryDurableResult(client, command);
  if (prior !== null) {
    return Object.freeze({ disposition: 'DURABLE_RETRY', result: prior });
  }

  const lease = first(
    (
      await client.query<LeaseRow>(
        `select holder_id, fencing_token, expires_at_real
           from ${SCHEMA}.writer_lease
          where world_id = $1`,
        [command.worldId],
      )
    ).rows,
    'Writer lease',
  );
  if (
    lease.holder_id !== command.holderId ||
    integerText(lease.fencing_token, 'fencing token') !== command.fencingToken
  ) {
    throw new Error('WORLD_WRITER_FENCE_STALE');
  }
  if (
    new Date(lease.expires_at_real).getTime() <=
    new Date(command.observedAtReal).getTime()
  ) {
    throw new Error('WORLD_WRITER_LEASE_EXPIRED');
  }
  const worldVersion = integerText(head.world_version, 'WorldVersion');
  if (worldVersion !== command.expectedWorldVersion) {
    throw new Error('WORLD_VERSION_MISMATCH');
  }

  const currentAuthorization = await reauthorizeOfficeCapability(
    command.authorizationContext,
  );
  if (
    currentAuthorization.authorizationVersion !==
      command.expectedAuthorizationRevision ||
    currentAuthorization.worldId !== command.worldId ||
    currentAuthorization.countryId !== command.requiredCountryId ||
    currentAuthorization.officeId !== command.requiredOfficeId ||
    currentAuthorization.capability !== command.requiredCapability
  ) {
    throw new Error('AUTHORIZATION_REVISION_OR_SCOPE_STALE');
  }

  const versionAfter = (BigInt(worldVersion) + 1n).toString();
  const eventSequence = (
    BigInt(integerText(head.event_sequence, 'Event sequence')) + 1n
  ).toString();
  const eventId = `${command.commandId}_EVENT`;
  const resultPayload = JSON.stringify({
    commandId: command.commandId,
    eventId,
    worldVersionAfter: versionAfter,
  });

  injector.hit('BEFORE_INVENTORY_WRITE');
  await client.query(
    `insert into ${SCHEMA}.inventory_write
      (world_id, command_id, posting_id, amount)
     values ($1, $2, $3, $4)`,
    [
      command.worldId,
      command.commandId,
      `${command.commandId}_INVENTORY`,
      command.inventoryAmount,
    ],
  );
  injector.hit('AFTER_INVENTORY_WRITE');

  injector.hit('BEFORE_FINANCIAL_WRITE');
  await client.query(
    `insert into ${SCHEMA}.financial_write
      (world_id, command_id, posting_id, amount)
     values ($1, $2, $3, $4)`,
    [
      command.worldId,
      command.commandId,
      `${command.commandId}_FINANCIAL`,
      command.financialAmount,
    ],
  );
  injector.hit('AFTER_FINANCIAL_WRITE');

  injector.hit('BEFORE_EVENT_WRITE');
  await client.query(
    `insert into ${SCHEMA}.authoritative_event
      (world_id, command_id, event_id, event_sequence, world_version)
     values ($1, $2, $3, $4::bigint, $5::bigint)`,
    [command.worldId, command.commandId, eventId, eventSequence, versionAfter],
  );
  injector.hit('AFTER_EVENT_WRITE');

  injector.hit('BEFORE_RECEIPT_WRITE');
  await client.query(
    `insert into ${SCHEMA}.command_receipt
      (world_id, command_id, idempotency_key, command_fingerprint, event_id,
       world_version_before, world_version_after, result_payload)
     values ($1, $2, $3, $4, $5, $6::bigint, $7::bigint, $8)`,
    [
      command.worldId,
      command.commandId,
      command.idempotencyKey,
      command.commandFingerprint,
      eventId,
      worldVersion,
      versionAfter,
      resultPayload,
    ],
  );
  injector.hit('AFTER_RECEIPT_WRITE');

  injector.hit('BEFORE_WORLD_VERSION_WRITE');
  const advanced = await client.query<HeadRow>(
    `update ${SCHEMA}.world_head
        set world_version = $3::bigint,
            event_sequence = $4::bigint
      where world_id = $1 and world_version = $2::bigint
      returning world_version, event_sequence`,
    [command.worldId, worldVersion, versionAfter, eventSequence],
  );
  if (advanced.rows.length !== 1) throw new Error('WORLD_VERSION_MISMATCH');
  injector.hit('AFTER_WORLD_VERSION_WRITE');

  injector.hit('BEFORE_OUTBOX_WRITE');
  await client.query(
    `insert into ${SCHEMA}.notification_outbox
      (world_id, command_id, outbox_id, event_id, delivery_state)
     values ($1, $2, $3, $4, 'PENDING')`,
    [
      command.worldId,
      command.commandId,
      `${command.commandId}_OUTBOX`,
      eventId,
    ],
  );
  injector.hit('AFTER_OUTBOX_WRITE');
  injector.hit('BEFORE_COMMIT');

  return Object.freeze({
    disposition: 'APPLIED' as const,
    result: Object.freeze({
      commandFingerprint: command.commandFingerprint,
      commandId: command.commandId,
      eventId,
      idempotencyKey: command.idempotencyKey,
      resultPayload,
      worldVersionAfter: versionAfter,
    }),
  });
}

export async function runV09AtomicPreparationAttempt(input: {
  readonly command: V09AtomicCommandFixture;
  readonly database: V09AtomicTestDatabase;
  readonly faultInjector?: DeterministicV09FaultInjector;
  readonly recoveryProbe?: () => Promise<DurableAtomicResult | null>;
}): Promise<V09AtomicAttemptResult> {
  const injector =
    input.faultInjector ?? new DeterministicV09FaultInjector(null);
  let transactionCompleted = false;
  let commitAcknowledged = false;
  try {
    const applied = await input.database.transaction((client) =>
      executeCandidateTransaction(client, input.command, injector),
    );
    transactionCompleted = true;
    commitAcknowledged = true;
    injector.hit('COMMIT_ACKNOWLEDGEMENT_UNKNOWN');
    injector.hit('POST_COMMIT_RESPONSE_LOST');
    return Object.freeze({
      classification: 'COMMITTED' as const,
      disposition: applied.disposition,
      durableResult: applied.result,
      trace: injector.trace(),
    });
  } catch (error) {
    const transactionRolledBack =
      error instanceof V09TransactionRolledBackError;
    const cleanupIncomplete =
      error instanceof V09TransactionCleanupIncompleteError;
    const commitOutcomeUnknown =
      error instanceof V09TransactionCommitUnknownError ||
      (transactionCompleted && !commitAcknowledged);
    const postCommitInjected =
      error instanceof InjectedV09AtomicFailure && transactionCompleted;
    let recovered: DurableAtomicResult | null = null;
    if (commitOutcomeUnknown || postCommitInjected) {
      try {
        recovered = await (
          input.recoveryProbe ??
          (() => queryDurableResult(input.database, input.command))
        )();
      } catch {
        recovered = null;
      }
    }
    const classification = classifyTransactionResult({
      cleanupConfirmed: !cleanupIncomplete,
      commitAcknowledged:
        commitAcknowledged &&
        !(
          error instanceof InjectedV09AtomicFailure &&
          error.point === 'COMMIT_ACKNOWLEDGEMENT_UNKNOWN'
        ),
      commitAttempted:
        commitOutcomeUnknown || postCommitInjected || transactionCompleted,
      durableResultFound: recovered !== null,
      rollbackConfirmed: transactionRolledBack,
    });
    return Object.freeze({
      classification,
      disposition: recovered === null ? 'FAILED' : 'APPLIED',
      ...(recovered === null ? {} : { durableResult: recovered }),
      failurePoint: errorPoint(error),
      trace: injector.trace(),
    });
  }
}

async function count(
  database: V09AtomicTestDatabase,
  table: string,
  command: V09AtomicCommandFixture,
): Promise<number> {
  const row = first(
    (
      await database.query<CountRow>(
        `select count(*)::text as count
           from ${SCHEMA}.${table}
          where world_id = $1 and command_id = $2`,
        [command.worldId, command.commandId],
      )
    ).rows,
    `${table} count`,
  );
  return Number(integerText(row.count, `${table} count`));
}

export async function inspectV09AtomicFootprint(
  database: V09AtomicTestDatabase,
  command: V09AtomicCommandFixture,
): Promise<V09AtomicFootprint> {
  const head = first(
    (
      await database.query<HeadRow>(
        `select world_version, event_sequence
           from ${SCHEMA}.world_head
          where world_id = $1`,
        [command.worldId],
      )
    ).rows,
    'World head',
  );
  return Object.freeze({
    eventCount: await count(database, 'authoritative_event', command),
    financialWriteCount: await count(database, 'financial_write', command),
    inventoryWriteCount: await count(database, 'inventory_write', command),
    outboxCount: await count(database, 'notification_outbox', command),
    receiptCount: await count(database, 'command_receipt', command),
    worldVersion: integerText(head.world_version, 'WorldVersion'),
  });
}

function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `V09 atomicity oracle failed for ${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

export function assertV09ZeroPersistence(
  footprint: V09AtomicFootprint,
  expectedWorldVersion: string,
): void {
  requireEqual(footprint.inventoryWriteCount, 0, 'inventory writes');
  requireEqual(footprint.financialWriteCount, 0, 'financial writes');
  requireEqual(footprint.eventCount, 0, 'events');
  requireEqual(footprint.receiptCount, 0, 'receipts');
  requireEqual(footprint.outboxCount, 0, 'outbox');
  requireEqual(
    footprint.worldVersion,
    expectedWorldVersion,
    'WorldVersion rollback',
  );
}

export function assertV09ExactlyOneCommit(
  footprint: V09AtomicFootprint,
  expectedWorldVersionAfter: string,
): void {
  requireEqual(footprint.inventoryWriteCount, 1, 'inventory writes');
  requireEqual(footprint.financialWriteCount, 1, 'financial writes');
  requireEqual(footprint.eventCount, 1, 'events');
  requireEqual(footprint.receiptCount, 1, 'receipts');
  requireEqual(footprint.outboxCount, 1, 'outbox');
  requireEqual(
    footprint.worldVersion,
    expectedWorldVersionAfter,
    'WorldVersion advancement',
  );
}

export function assertOnlyOneNToNPlusOneSucceeded(
  results: readonly V09AtomicAttemptResult[],
): void {
  requireEqual(
    results.filter(
      (result) =>
        result.classification === 'COMMITTED' &&
        result.disposition === 'APPLIED',
    ).length,
    1,
    'concurrent N to N+1 commits',
  );
}
