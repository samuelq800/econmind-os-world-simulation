/** Fixed candidate construction only; no consumer, Clock, mandate, admission,
 * actor privilege or economic balance is installed. Preparation is DATA; Atomic
 * commit independently rechecks lease/H, authority, signatures and source. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  EVENT_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  commodityId,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createInventoryAccount,
  createOutboxMessage,
  createReservationPosting,
  createWorldWriterCommitAssertion,
  inventoryPostingId,
  inventoryReservationId,
  isCommitAuthorizationProof,
  parseAuthoritativeEvent,
  parseNarrowTreasuryGcuTransferTerms,
  parseWorldWriterLease,
  validateCanonicalCommand,
  worldId,
  workerId,
} from '@econmind/core';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from '../persistence/atomic-transition-repository.js';
import { DurableV08LedgerLineageReader } from '../persistence/durable-v08-ledger-lineage-reader.js';
import { NarrowTransferApprovalStore } from '../persistence/narrow-transfer-approval-store.js';
import {
  isPostwarNarrowTradeCurrentSource,
  PostwarNarrowTradeCurrentSourceMissing,
  type PostwarNarrowTradeCurrentSource,
  type PostwarNarrowTradeSourceCommitProtectionPort,
} from '../persistence/postwar-narrow-trade-current-source.js';
import {
  WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
  WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
} from '../persistence/worker-authorization-sql.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'POSTWAR_NARROW_RESERVATION:' + s,
  );
}
/** Exact existing NarrowTransferApprovalStore SQL. Only this immutable statement
 * and the two shared cutoff statements receive fixed native lock delegation. */
export const NARROW_APPROVAL_AUTHORIZATION_LOCK_QUERY = `select authorization_version
       from world_v2.current_commit_authorization
      where world_id = $1
        and auth_subject = $2::uuid
        and country_id = $3
        and office_id = $4
        and capability = $5
        and active
      for update`;
export const POSTWAR_NARROW_TRADE_LEASE_QUERY = `select world_id, holder_id, fencing_token::text,
             acquired_at_real, renewed_at_real, lease_expires_at_real
        from world_v2.world_writer_lease
       where world_id=$1 and holder_id=$2 and lease_expires_at_real>$3::timestamptz
       for share`;
const currentAuth =
  'select * from world_v2.lock_postwar_narrow_trade_current_authorization($1,$2::uuid,$3,$4,$5)';
const revokedAuth =
  'select present as "?column?" from world_v2.lock_postwar_narrow_trade_revoked_authorization($1,$2::uuid,$3,$4)';
/** No fabricated rows, table DML, role switching or fallback privilege. Direct
 * reads made by an existing authorization resolver inside this transaction use
 * its held executor, rather than acquiring a second conflicting connection. */
export function createPostwarNarrowTradeAuthorizationDatabase(
  database: SqlDatabase,
  scope: Readonly<{ worldId: string }>,
): Readonly<SqlDatabase> {
  const world = worldId(scope.worldId),
    held = new AsyncLocalStorage<SqlExecutor>();
  const bind = (tx: SqlExecutor): SqlExecutor => ({
    async query<Row extends object>(
      statement: string,
      parameters: readonly unknown[] = [],
    ) {
      const exactWorld = parameters[0] === world;
      const pair =
        (parameters[3] === 'TRADE' && parameters[4] === 'TRADE_CONTRACTS') ||
        (parameters[3] === 'FINANCE' && parameters[4] === 'FINANCE_TREASURY');
      if (
        exactWorld &&
        parameters.length === 5 &&
        pair &&
        (statement === WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY ||
          statement === NARROW_APPROVAL_AUTHORIZATION_LOCK_QUERY)
      )
        return tx.query<Row>(
          statement === NARROW_APPROVAL_AUTHORIZATION_LOCK_QUERY
            ? 'select authorization_version from world_v2.lock_postwar_narrow_trade_current_authorization($1,$2::uuid,$3,$4,$5)'
            : currentAuth,
          parameters,
        );
      if (
        exactWorld &&
        parameters.length === 4 &&
        parameters[3] === 'TRADE' &&
        statement === WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY
      )
        return tx.query<Row>(revokedAuth, parameters);
      return tx.query<Row>(statement, parameters);
    },
  });
  return Object.freeze({
    query: <Row extends object>(
      statement: string,
      parameters: readonly unknown[] = [],
    ) => bind(held.getStore() ?? database).query<Row>(statement, parameters),
    transaction: <T>(consume: (tx: SqlExecutor) => Promise<T>) => {
      if (held.getStore())
        return Promise.reject(
          new Error('NARROW_NESTED_TRANSACTION_NOT_ALLOWED'),
        );
      return database.transaction((tx) => {
        const bound = bind(tx);
        return held.run(bound, () => consume(bound));
      });
    },
  });
}
export interface PostwarNarrowTradeReservationRuntime {
  readonly worldId: string;
  readonly workerId: string;
  readonly database: Readonly<SqlDatabase>;
  readonly candidateFactory: Readonly<AtomicTransitionCandidateFactory>;
  readonly narrowTransferApprovalGuard: NarrowTransferApprovalStore;
  readonly sourceCommitProtectionPort: Readonly<PostwarNarrowTradeSourceCommitProtectionPort>;
}
const runtimes = new WeakSet<object>();
export function isPostwarNarrowTradeReservationRuntime(
  value: unknown,
): value is Readonly<PostwarNarrowTradeReservationRuntime> {
  return value !== null && typeof value === 'object' && runtimes.has(value);
}
function timestamp(v: unknown): string {
  const s = v instanceof Date ? v.toISOString() : v;
  if (typeof s !== 'string' || new Date(s).toISOString() !== s)
    invalid('canonical persisted lease timestamp required');
  return s;
}
export function createPostwarNarrowTradeReservationRuntime(
  config: Readonly<{
    worldId: string;
    workerId: string;
    database: SqlDatabase;
    source: Readonly<PostwarNarrowTradeCurrentSource>;
  }>,
): Readonly<PostwarNarrowTradeReservationRuntime> {
  const world = worldId(config.worldId),
    holder = workerId(config.workerId);
  if (!isPostwarNarrowTradeCurrentSource(config.source, world))
    invalid('genuine same-World current source required');
  const source = config.source,
    database = createPostwarNarrowTradeAuthorizationDatabase(config.database, {
      worldId: world,
    }),
    lineage = new DurableV08LedgerLineageReader({ database, sha256Hex: sha }),
    approvals = new NarrowTransferApprovalStore({ database, sha256Hex: sha });
  const candidateFactory: AtomicTransitionCandidateFactory = Object.freeze({
    async prepare(
      input: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
    ): Promise<AtomicTransitionDraft> {
      const c = validateCanonicalCommand(input.command, sha),
        p = input.commitAuthorization;
      if (
        c.worldId !== world ||
        c.commandType !== 'CORE_GOODS_TRANSFER_V1' ||
        !isCommitAuthorizationProof(p) ||
        p.commandId !== c.commandId ||
        p.commandFingerprint !== c.fingerprint ||
        p.worldId !== world ||
        p.officeId !== 'TRADE' ||
        p.capability !== 'TRADE_CONTRACTS'
      )
        invalid('exact genuine Trade command/proof required');
      const terms = parseNarrowTreasuryGcuTransferTerms(c);
      return database.transaction(async (tx) => {
        await tx.query(
          'select command_id from world_v2.command_submission where world_id=$1 and command_id=$2 for update',
          [world, c.commandId],
        );
        const durable = await lineage.readCommandFrom(tx, world, c.commandId);
        if (canonicalSerialize(durable) !== canonicalSerialize(c))
          invalid('durable command differs');
        // S -> lease -> H -> auth. Source's fixed getter acquires H before metadata.
        const r = await tx.query<Record<string, unknown>>(
            POSTWAR_NARROW_TRADE_LEASE_QUERY,
            [world, holder, input.observedAtReal],
          ),
          v = r.rows[0];
        if (r.rows.length !== 1 || !v)
          invalid('actual active writer lease required');
        const lease = parseWorldWriterLease({
          schemaVersion: 'world-writer-lease-v1',
          worldId: String(v.world_id),
          holderId: String(v.holder_id),
          fencingToken: String(v.fencing_token),
          acquiredAtReal: timestamp(v.acquired_at_real),
          renewedAtReal: timestamp(v.renewed_at_real),
          expiresAtReal: timestamp(v.lease_expires_at_real),
        });
        const heldHead = await tx.query(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
          [world],
        );
        if (heldHead.rows.length !== 1)
          invalid('actual held World head required');
        const current = await source.inspectCommitFrom(tx, {
          command: c,
          commitAuthorization: p,
          observedAtReal: input.observedAtReal,
        });
        if (current.kind === 'MISSING')
          throw new PostwarNarrowTradeCurrentSourceMissing(current);
        await approvals.assertCurrent(tx, {
          command: c,
          observedAtReal: input.observedAtReal,
        });
        const head = current.binding.head,
          after = (BigInt(head.worldVersion) + 1n).toString();
        const event = parseAuthoritativeEvent(
          {
            schemaVersion: EVENT_SCHEMA_VERSION,
            eventId: `RESERVE_EVENT_${c.commandId}`,
            eventType: 'NARROW_TREASURY_GCU_RESERVED_V1',
            worldId: world,
            causationCommandId: c.commandId,
            correlationId: c.correlationId,
            correctsEventId: null,
            worldVersion: after,
            sequence: (BigInt(head.eventSequence) + 1n).toString(),
            simTime: c.simTime.toCanonicalValue(),
            recordedAtReal: input.observedAtReal,
            payload: {
              schemaVersion: 'narrow-treasury-gcu-reservation-event-v1',
              transferFingerprint: c.fingerprint,
            },
          },
          sha,
        );
        const transition = createAuthoritativeTransition({
          command: c,
          worldVersionBefore: head.worldVersion,
          worldVersionAfter: after,
          events: [event],
        });
        // This tuple and quantity were matched against the real sealed stock and
        // complete zero-inventory-effect prefix. No inventory authority is minted.
        const account = createInventoryAccount({
          worldId: world,
          countryId: terms.sellerCountryId,
          commodityId: commodityId(terms.commodityId),
          unit: terms.quantity.unit,
          ...terms.assetSource,
          bucket: 'AVAILABLE',
          reservationId: null,
          shipmentId: null,
        });
        const destination = createInventoryAccount({
          ...account,
          bucket: 'RESERVED',
          reservationId: inventoryReservationId(`RESERVATION_${c.commandId}`),
        });
        const posting = createReservationPosting(
          {
            schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
            postingId: inventoryPostingId(`RESERVE_INVENTORY_${c.commandId}`),
            worldId: world,
            causationCommandId: c.commandId,
            causationEventIds: transition.eventIds,
            worldVersionBefore: head.worldVersion,
            worldVersionAfter: after,
            simTime: c.simTime,
            command: c,
            transition,
            quantity: terms.quantity,
            source: account,
            destination,
          },
          sha,
        );
        const payload = {
          schemaVersion: 'narrow-treasury-gcu-reservation-outbox-v1',
          eventId: event.eventId,
          inventoryPostingFingerprint: posting.fingerprint,
          transferFingerprint: c.fingerprint,
        };
        return {
          transition,
          inventoryPostings: [posting],
          financialPostingBatches: [],
          receipt: createFinalCommandReceipt({
            command: c,
            outcome: 'COMMITTED',
            reasonCode: null,
            transition,
            simTime: c.simTime,
            recordedAtReal: input.observedAtReal,
          }),
          outboxMessages: [
            createOutboxMessage({
              messageId: `RESERVE_OUTBOX_${c.commandId}`,
              worldId: world,
              commandId: c.commandId,
              eventId: event.eventId,
              payload,
              payloadHash: canonicalSha256(canonicalHashInput(payload), sha),
              availableAtSimTime: c.simTime,
            }),
          ],
          currentMaterializations: [],
          authorityKind: 'DISCRETIONARY_USER',
          commitAssertion: createWorldWriterCommitAssertion(
            lease,
            head.worldVersion,
          ),
          observedAtReal: input.observedAtReal,
          officeOperatingSourceReadBinding: current.binding,
        };
      });
    },
  });
  const runtime: Readonly<PostwarNarrowTradeReservationRuntime> = Object.freeze(
    {
      worldId: world,
      workerId: holder,
      database,
      candidateFactory,
      narrowTransferApprovalGuard: approvals,
      sourceCommitProtectionPort: source.sourceCommitProtectionPort,
    },
  );
  runtimes.add(runtime);
  return runtime;
}
