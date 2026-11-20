/** Worker-only protected composition. No native original-source issuer exists here. */
import { createHash } from 'node:crypto';
import {
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  commandId,
  countryId,
  eventId,
  inventoryPostingId,
  openingSeedId,
  parseIndustryPersistenceSchemaBoundaryContext,
  worldId,
  type IndustryPersistenceSchemaReadContextV1,
} from '@econmind/core';
import { DurableV08LedgerLineageReader } from '../persistence/durable-v08-ledger-lineage-reader.js';
import {
  copyIndustrySourceData,
  industryClosedRecord,
  industryInputInvalid,
} from '../persistence/industry-production-row-decoder.js';
import type { IndustryProductionHistoricalReadGuard } from '../persistence/industry-production-source-cutoff.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import {
  readValidatedCanonicalLineageFrom,
  withValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../persistence/validated-canonical-lineage.js';
import type {
  IndustryGoverningCustodyPort,
  IndustryGoverningSnapshotRequest,
} from './industry-production-governing-source.js';
import { readIndustryProductionSourceFrom } from './industry-production-source-port.js';

type ReadContext = Readonly<IndustryPersistenceSchemaReadContextV1>;
const PURPOSE = 'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY';
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const hash = (value: unknown) =>
  canonicalSha256(canonicalHashInput(value), digest);
const IDENTITY_SQL = `select pg_backend_pid()::text as backend_pid,
  pg_current_xact_id()::text as transaction_id, current_database() as database_name`;

/** One fixed independently authenticated source owner must implement BOTH ports.
 * Its native complete plan must already include governing catalog/manifest,
 * original adoption/current admission, authority/transfer, normative units and
 * historical representation/build/target predicates, including absent-row
 * predicates and every cooperating writer/revoker, through outer COMMIT/ROLLBACK.
 * Sharing an object/executor or matching descriptors is not proof of that.
 *
 * The current migrations do NOT supply those original-source tables/publishers.
 * Do not implement this owner using runtime seats/current_commit_authorization,
 * social_demo_* simulated records, caller snapshots, or admission booleans.
 */
export interface IndustryGoverningProtectedOwner
  extends IndustryProductionHistoricalReadGuard, IndustryGoverningCustodyPort {}

function same(left: unknown, right: unknown, reason: string): void {
  if (canonicalSerialize(left) !== canonicalSerialize(right))
    industryInputInvalid(reason);
}
function fingerprint(value: unknown): void {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value))
    industryInputInvalid('GOVERNING_CUSTODY_FINGERPRINT_REQUIRED');
}
function requestData(
  raw: IndustryGoverningSnapshotRequest,
): Readonly<IndustryGoverningSnapshotRequest> {
  const value = copyIndustrySourceData(raw);
  const r = industryClosedRecord(value, [
    'publicationHead',
    'worldBinding',
    'scope',
    'purpose',
    'targetHistory',
  ]);
  const head = industryClosedRecord(r.publicationHead, [
    'worldId',
    'worldVersion',
    'eventSequence',
  ]);
  const scope = industryClosedRecord(r.scope, [
    'worldId',
    'countryId',
    'classification',
    'officeId',
  ]);
  const binding = industryClosedRecord(r.worldBinding, [
    'seedId',
    'seedFingerprint',
    'modelVersion',
    'replayBindingFingerprint',
  ]);
  const target = industryClosedRecord(r.targetHistory, [
    'commandId',
    'commandFingerprint',
    'eventId',
    'eventFingerprint',
    'postingId',
    'postingFingerprint',
  ]);
  if (
    r.purpose !== PURPOSE ||
    scope.classification !== 'OFFICE_PRIVATE' ||
    scope.officeId !== 'INDUSTRY'
  )
    industryInputInvalid('GOVERNING_CUSTODY_SCOPE_OR_PURPOSE');
  worldId(head.worldId as string);
  worldId(scope.worldId as string);
  countryId(scope.countryId as string);
  openingSeedId(binding.seedId as string);
  commandId(target.commandId as string);
  eventId(target.eventId as string);
  inventoryPostingId(target.postingId as string);
  if (
    head.worldId !== scope.worldId ||
    typeof binding.modelVersion !== 'string' ||
    binding.modelVersion.length === 0
  )
    industryInputInvalid('GOVERNING_CUSTODY_WORLD_BINDING');
  for (const fp of [
    binding.seedFingerprint,
    binding.replayBindingFingerprint,
    target.commandFingerprint,
    target.eventFingerprint,
    target.postingFingerprint,
  ])
    fingerprint(fp);
  return value as Readonly<IndustryGoverningSnapshotRequest>;
}

type TransactionIdentity = Readonly<{
  backend_pid: string;
  transaction_id: string;
  database_name: string;
}>;

/** Actual transaction/lineage/target adapter over existing durable Worker SQL.
 * This is a usable restricted composition, NOT a missing native governing owner
 * implementation, admission grant, provider registration or production positive.
 * It opens no transaction and accepts no request-supplied view/source/build/flags.
 * Outer callers retain their existing S/L/H/A ordering; the reader takes the
 * existing H FOR SHARE and source-owner guards protect the complete native R/F
 * plan. No SQL identifiers or source storage selectors come from the request.
 */
export class IndustryGoverningCustodyAdapter implements IndustryGoverningCustodyPort {
  readonly #owner: IndustryGoverningProtectedOwner;
  readonly #reader: DurableV08LedgerLineageReader;
  readonly #databaseName: string;
  readonly #target: ReadContext['target'];
  readonly #build: ReadContext['build'];
  readonly #active = new WeakSet<SqlExecutor>();

  constructor(
    input: Readonly<{
      database: SqlDatabase;
      expectedDatabaseName: string;
      target: ReadContext['target'];
      build: ReadContext['build'];
      owner: IndustryGoverningProtectedOwner | null;
    }>,
  ) {
    if (
      !input.owner ||
      typeof input.owner.assertReadFrom !== 'function' ||
      typeof input.owner.withSnapshotFrom !== 'function'
    )
      industryInputInvalid('AUTHENTIC_GOVERNING_PROTECTED_OWNER_REQUIRED');
    if (
      typeof input.expectedDatabaseName !== 'string' ||
      input.expectedDatabaseName.length === 0 ||
      input.expectedDatabaseName.length > 128
    )
      industryInputInvalid('FIXED_NATIVE_DATABASE_NAME_REQUIRED');
    this.#owner = input.owner;
    this.#databaseName = input.expectedDatabaseName;
    this.#target = copyIndustrySourceData(
      input.target,
    ) as ReadContext['target'];
    this.#build = copyIndustrySourceData(input.build) as ReadContext['build'];
    this.#reader = new DurableV08LedgerLineageReader({
      database: input.database,
      sha256Hex: digest,
      industryReadGuard: input.owner,
    });
  }

  async #identity(tx: SqlExecutor): Promise<TransactionIdentity> {
    const result = await tx.query<TransactionIdentity>(IDENTITY_SQL);
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      result.rowCount !== 1 ||
      !row ||
      typeof row.backend_pid !== 'string' ||
      !/^[1-9]\d*$/u.test(row.backend_pid) ||
      typeof row.transaction_id !== 'string' ||
      !/^[1-9]\d{0,19}$/u.test(row.transaction_id) ||
      row.database_name !== this.#databaseName
    )
      industryInputInvalid('ACTUAL_DATABASE_TRANSACTION_REQUIRED');
    return Object.freeze({
      backend_pid: row.backend_pid,
      transaction_id: row.transaction_id,
      database_name: row.database_name,
    });
  }

  #check(
    tx: SqlExecutor,
    view: ValidatedCanonicalLineageView,
    request: Readonly<IndustryGoverningSnapshotRequest>,
  ): void {
    const data = readValidatedCanonicalLineageFrom(tx, view);
    same(
      {
        worldId: data.worldId,
        worldVersion: data.headWorldVersion,
        eventSequence: data.headEventSequence,
      },
      request.publicationHead,
      'GOVERNING_ACTUAL_HEAD_MISMATCH',
    );
    same(
      {
        seedId: data.seed.seedId,
        seedFingerprint: data.seed.fingerprint,
        modelVersion: data.seed.replayBinding.modelVersion,
        replayBindingFingerprint: hash(data.seed.replayBinding),
      },
      request.worldBinding,
      'GOVERNING_ACTUAL_SEED_MODEL_REPLAY_MISMATCH',
    );
    const selected = readIndustryProductionSourceFrom(
      tx,
      view,
      {
        worldId: worldId(request.publicationHead.worldId),
        countryId: countryId(request.scope.countryId),
        commandId: commandId(request.targetHistory.commandId),
        eventId: eventId(request.targetHistory.eventId),
        postingId: inventoryPostingId(request.targetHistory.postingId),
        expectedPublicationHead: request.publicationHead,
      },
      digest,
    );
    if (selected.kind !== 'AVAILABLE_FOR_PROJECTION')
      industryInputInvalid('COMMITTED_GOVERNING_PRODUCTION_TARGET_REQUIRED');
    same(
      {
        commandId: selected.targetCommand.commandId,
        commandFingerprint: selected.targetCommand.fingerprint,
        eventId: selected.targetEvent.eventId,
        eventFingerprint: selected.targetEvent.fingerprint,
        postingId: selected.constructorValidatedProductionPosting.postingId,
        postingFingerprint:
          selected.constructorValidatedProductionPosting.fingerprint,
      },
      request.targetHistory,
      'GOVERNING_ACTUAL_TARGET_CAUSE_MISMATCH',
    );
  }

  async withSnapshotFrom<Result>(
    tx: SqlExecutor,
    raw: Readonly<IndustryGoverningSnapshotRequest>,
    consume: (snapshot: unknown) => Promise<Result>,
  ): Promise<Result> {
    if (this.#active.has(tx))
      industryInputInvalid('REENTRANT_GOVERNING_CUSTODY');
    const request = requestData(raw);
    const context = parseIndustryPersistenceSchemaBoundaryContext({
      schemaVersion: 'industry-persistence-schema-read-context-v1',
      purpose: 'INDUSTRY_PRODUCTION_CANONICAL_HISTORY_READ',
      worldId: request.publicationHead.worldId,
      expectedHead: {
        worldVersion: request.publicationHead.worldVersion,
        eventSequence: request.publicationHead.eventSequence,
      },
      target: this.#target,
      build: this.#build,
    }) as ReadContext;
    this.#active.add(tx);
    let active = true,
      calls = 0,
      completed = false;
    let consumed: Result | undefined;
    try {
      const identity = await this.#identity(tx);
      // A pool/autocommit executor gets a different xid on the second SQL call.
      // Reject it BEFORE reading/exposing any original source snapshot.
      same(await this.#identity(tx), identity, 'OWNING_TRANSACTION_CHANGED');
      return await withValidatedCanonicalLineageFrom(
        {
          reader: this.#reader,
          executor: tx,
          worldId: request.publicationHead.worldId,
          industryReadContext: context,
        },
        async (view) => {
          this.#check(tx, view, request);
          const result = await this.#owner.withSnapshotFrom(
            tx,
            request,
            async (snapshot) => {
              if (!active || ++calls !== 1)
                industryInputInvalid('GOVERNING_OWNER_CALLBACK_LIFETIME');
              same(
                await this.#identity(tx),
                identity,
                'OWNING_TRANSACTION_CHANGED',
              );
              if (!active)
                industryInputInvalid('GOVERNING_OWNER_CALLBACK_ESCAPED');
              this.#check(tx, view, request);
              const result = await consume(snapshot);
              if (!active)
                industryInputInvalid('GOVERNING_OWNER_CALLBACK_ESCAPED');
              // Read the actual durable prefix again while the same native owner
              // still holds the entire protected source plan and outer H lock.
              await withValidatedCanonicalLineageFrom(
                {
                  reader: this.#reader,
                  executor: tx,
                  worldId: request.publicationHead.worldId,
                  industryReadContext: context,
                },
                async (current) => {
                  this.#check(tx, current, request);
                },
              );
              same(
                await this.#identity(tx),
                identity,
                'OWNING_TRANSACTION_CHANGED',
              );
              if (!active)
                industryInputInvalid('GOVERNING_OWNER_CALLBACK_ESCAPED');
              completed = true;
              consumed = result;
              return result;
            },
          );
          // Close the source callback scope as soon as its owner settles,
          // before any asynchronous final check can let an escaped callback run.
          active = false;
          if (calls !== 1 || !completed || result !== consumed)
            industryInputInvalid('GOVERNING_OWNER_MUST_AWAIT_OWN_CALLBACK');
          same(
            await this.#identity(tx),
            identity,
            'OWNING_TRANSACTION_CHANGED',
          );
          this.#check(tx, view, request);
          return result;
        },
      );
    } finally {
      active = false;
      this.#active.delete(tx);
    }
  }
}
