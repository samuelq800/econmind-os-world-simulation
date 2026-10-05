import {
  DOMAIN_ERROR_CODES,
  DomainError,
  EVENT_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  SimTime,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createInventoryAccount,
  createOutboxMessage,
  createReservationPosting,
  createWorldWriterCommitAssertion,
  inventoryPostingId,
  inventoryReservationId,
  authorizeOfficeCapability,
  officeId,
  teamId,
  parseAuthoritativeEvent,
  parseNarrowTreasuryGcuTransferTerms,
  parseWorldWriterLease,
  workerId,
  type AuthenticatedPrincipal,
  type CanonicalCommand,
  type Sha256Hex,
} from '@econmind/core';
import { createAuthoritativeWorkerExecution } from '../authoritative-execution.js';
import { DurableV08LedgerLineageReader } from '../persistence/durable-v08-ledger-lineage-reader.js';
import { NarrowTransferApprovalStore } from '../persistence/narrow-transfer-approval-store.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    message,
  );
}

function timestamp(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : value;
  if (
    typeof text !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text) ||
    !Number.isFinite(Date.parse(text)) ||
    new Date(text).toISOString() !== text
  ) {
    invalid('Reservation worker requires canonical real time');
  }
  return text;
}

async function activeLease(
  transaction: SqlExecutor,
  world: string,
  holder: string,
  at: string,
) {
  const result = await transaction.query<{
    world_id: string;
    holder_id: string;
    fencing_token: string;
    acquired_at_real: unknown;
    renewed_at_real: unknown;
    lease_expires_at_real: unknown;
  }>(
    `select world_id, holder_id, fencing_token::text,
             acquired_at_real, renewed_at_real, lease_expires_at_real
        from world_v2.world_writer_lease
       where world_id=$1 and holder_id=$2 and lease_expires_at_real>$3::timestamptz
       for share`,
    [world, holder, at],
  );
  const row = result.rows[0];
  if (!row || result.rows.length !== 1)
    invalid('Reservation worker has no active lease');
  return parseWorldWriterLease({
    schemaVersion: 'world-writer-lease-v1',
    worldId: row.world_id,
    holderId: row.holder_id,
    fencingToken: row.fencing_token,
    acquiredAtReal: timestamp(row.acquired_at_real),
    renewedAtReal: timestamp(row.renewed_at_real),
    expiresAtReal: timestamp(row.lease_expires_at_real),
  });
}

/**
 * Bounded local/CI preparation, never installed in runtime.ts. One already
 * approved narrow Command reserves inventory; it neither ships nor pays.
 * The host supplies clocks, not browser authorization or ledger fields.
 * Opening + Posting lineage, approval and cutoff authorization remain owned
 * by the existing SQL/Core boundaries. No caller-supplied ledger/candidate.
 */
export function createLocalNarrowReservationWorker(input: {
  readonly database: SqlDatabase;
  readonly environment: NodeJS.ProcessEnv;
  readonly workerId: string;
  readonly sha256Hex: Sha256Hex;
  readonly clock: {
    nowReal(): string;
    simTime(worldId: string): Promise<string>;
  };
}) {
  if (
    input.environment.ECONMIND_ENV !== 'local' &&
    input.environment.ECONMIND_ENV !== 'ci'
  ) {
    invalid('Reservation worker preparation is local/CI only');
  }
  for (const [name, value] of Object.entries(input.environment)) {
    if (
      value &&
      (/^(?:VITE_)?SUPABASE_/u.test(name) ||
        name === 'WORLD_DATABASE_URL' ||
        name === 'DATABASE_URL')
    ) {
      invalid(
        'Production connection configuration is forbidden in reservation preparation',
      );
    }
  }
  const holder = workerId(input.workerId);
  const lineage = new DurableV08LedgerLineageReader(input);
  const approvals = new NarrowTransferApprovalStore(input);
  async function authorize(command: CanonicalCommand) {
    const resolve = async () => {
      const result = await input.database.query<{
        team_id: string;
        authorization_version: string;
      }>(
        `select team_id, authorization_version from world_v2.current_commit_authorization
          where world_id=$1 and auth_subject=$2::uuid and country_id=$3
            and office_id='TRADE' and capability='TRADE_CONTRACTS' and active`,
        [command.worldId, command.authSubject, command.countryId],
      );
      const row = result.rows[0];
      if (!row || result.rows.length !== 1) return null;
      return {
        authSubject: command.authSubject,
        worldId: command.worldId,
        countryId: command.countryId,
        teamId: teamId(row.team_id),
        authorizationVersion: row.authorization_version,
        officeAssignments: [officeId('TRADE')],
        active: true,
        suspended: false,
        isWorldAdmin: false,
        negotiationPartyIds: [],
      };
    };
    // Identity is the authenticated intake's immutable durable Command subject,
    // not a new login/token. This audit envelope grants nothing: both the Core
    // resolver and atomic SQL cutoff require current server-held membership.
    const principal: AuthenticatedPrincipal = {
      authSubject: command.authSubject,
      facts: {
        user_id: command.authSubject,
        display_name: null,
        school_id: null,
      },
      token: {
        subject: command.authSubject,
        issuer: 'urn:world-v2:durable-command-audit',
        audience: 'world-worker',
        issuedAt: command.submittedAtReal,
        expiresAt: command.submittedAtReal,
      },
    };
    return authorizeOfficeCapability({
      principal,
      resolver: {
        resolveCurrentIdentity: async () =>
          (await resolve()) ? command.authSubject : null,
        resolveCurrentMembership: resolve,
      },
      worldId: command.worldId,
      requestedCountryId: command.countryId,
      requestedOfficeId: officeId('TRADE'),
      capability: 'TRADE_CONTRACTS',
    });
  }
  const execution = createAuthoritativeWorkerExecution({
    ...input,
    workerId: holder,
    narrowTransferApprovalGuard: approvals,
    candidateFactory: {
      async prepare(candidate) {
        return input.database.transaction(async (transaction) => {
          // Submission before lease/head matches the reviewed intake/commit lock order.
          await transaction.query(
            'select command_id from world_v2.command_submission where world_id=$1 and command_id=$2 for update',
            [candidate.command.worldId, candidate.command.commandId],
          );
          const command = await lineage.readCommandFrom(
            transaction,
            candidate.command.worldId,
            candidate.command.commandId,
          );
          if (
            canonicalSerialize(command) !==
            canonicalSerialize(candidate.command)
          )
            invalid('Reservation differs from durable Command');
          const terms = parseNarrowTreasuryGcuTransferTerms(command);
          const lease = await activeLease(
            transaction,
            command.worldId,
            holder,
            candidate.observedAtReal,
          );
          const snapshot = await lineage.rebuildFrom(
            transaction,
            command.worldId,
          );
          await approvals.assertCurrent(transaction, {
            command,
            observedAtReal: candidate.observedAtReal,
          });
          if (command.expectedWorldVersion !== snapshot.headWorldVersion)
            invalid('Reservation expected WorldVersion is stale');
          const sources = snapshot.ledgers.inventory.balances.filter(
            ({ account }) =>
              account.bucket === 'AVAILABLE' &&
              account.countryId === terms.sellerCountryId &&
              account.commodityId === terms.commodityId &&
              account.unit === terms.quantity.unit &&
              account.batchId === terms.assetSource.batchId &&
              account.physicalLocationId ===
                terms.assetSource.physicalLocationId &&
              account.titleHolderId === terms.assetSource.titleHolderId &&
              account.riskBearerId === terms.assetSource.riskBearerId &&
              account.economicRecognitionId ===
                terms.assetSource.economicRecognitionId &&
              account.reservationId === null &&
              account.shipmentId === null,
          );
          if (sources.length !== 1)
            invalid(
              'Reservation asset source must resolve to one durable available account',
            );
          const source = sources[0]!.account;
          if (sources[0]!.quantity.subtract(terms.quantity).amount.isNegative())
            invalid('Reservation exceeds durable available inventory');
          if (
            snapshot.ledgers.inventory.appliedPostings.some(
              (applied) =>
                applied.postingId === `RESERVE_INVENTORY_${command.commandId}`,
            )
          )
            invalid('Reservation posting identity is already used');
          const after = (BigInt(snapshot.headWorldVersion) + 1n).toString();
          const event = parseAuthoritativeEvent(
            {
              schemaVersion: EVENT_SCHEMA_VERSION,
              eventId: `RESERVE_EVENT_${command.commandId}`,
              eventType: 'NARROW_TREASURY_GCU_RESERVED_V1',
              worldId: command.worldId,
              causationCommandId: command.commandId,
              correlationId: command.correlationId,
              correctsEventId: null,
              sequence: (BigInt(snapshot.headEventSequence) + 1n).toString(),
              worldVersion: after,
              simTime: command.simTime.toCanonicalValue(),
              recordedAtReal: candidate.observedAtReal,
              payload: {
                schemaVersion: 'narrow-treasury-gcu-reservation-event-v1',
                transferFingerprint: command.fingerprint,
              },
            },
            input.sha256Hex,
          );
          const transition = createAuthoritativeTransition({
            command,
            worldVersionBefore: snapshot.headWorldVersion,
            worldVersionAfter: after,
            events: [event],
          });
          const destination = createInventoryAccount({
            ...source,
            bucket: 'RESERVED',
            reservationId: inventoryReservationId(
              `RESERVATION_${command.commandId}`,
            ),
          });
          const posting = createReservationPosting(
            {
              schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
              postingId: inventoryPostingId(
                `RESERVE_INVENTORY_${command.commandId}`,
              ),
              worldId: command.worldId,
              causationCommandId: command.commandId,
              causationEventIds: transition.eventIds,
              worldVersionBefore: transition.worldVersionBefore,
              worldVersionAfter: transition.worldVersionAfter,
              simTime: command.simTime,
              command,
              transition,
              quantity: terms.quantity,
              source,
              destination,
            },
            input.sha256Hex,
          );
          const payload = {
            schemaVersion: 'narrow-treasury-gcu-reservation-outbox-v1',
            eventId: event.eventId,
            inventoryPostingFingerprint: posting.fingerprint,
            transferFingerprint: command.fingerprint,
          };
          return {
            transition,
            inventoryPostings: [posting],
            financialPostingBatches: [],
            receipt: createFinalCommandReceipt({
              command,
              outcome: 'COMMITTED',
              reasonCode: null,
              transition,
              simTime: command.simTime,
              recordedAtReal: candidate.observedAtReal,
            }),
            outboxMessages: [
              createOutboxMessage({
                messageId: `RESERVE_OUTBOX_${command.commandId}`,
                worldId: command.worldId,
                commandId: command.commandId,
                eventId: event.eventId,
                payload,
                payloadHash: canonicalSha256(
                  canonicalHashInput(payload),
                  input.sha256Hex,
                ),
                availableAtSimTime: command.simTime,
              }),
            ],
            currentMaterializations: [],
            authorityKind: 'DISCRETIONARY_USER',
            commitAssertion: createWorldWriterCommitAssertion(
              lease,
              snapshot.headWorldVersion,
            ),
            observedAtReal: candidate.observedAtReal,
          };
        });
      },
    },
  });

  return Object.freeze({
    async execute(request: {
      readonly worldId: string;
      readonly commandId: string;
    }) {
      const command = await input.database.transaction((transaction) =>
        lineage.readCommandFrom(
          transaction,
          request.worldId,
          request.commandId,
        ),
      );
      const existing = await execution.repository.readFinalReceipt(command);
      if (existing)
        return Object.freeze({
          source: 'EXISTING_FINAL' as const,
          receipt: existing,
        });
      parseNarrowTreasuryGcuTransferTerms(command);
      const at = timestamp(input.clock.nowReal());
      const simTime = SimTime.fromTicks(
        await input.clock.simTime(command.worldId),
      );
      const intakeAuthorization = await authorize(command);
      await input.database.transaction(async (transaction) => {
        await transaction.query(
          'select command_id from world_v2.command_submission where world_id=$1 and command_id=$2 for update',
          [command.worldId, command.commandId],
        );
        const queue = await transaction.query<{
          queue_state: string;
          authority_kind: string;
          available_at_sim_time: string;
          claimed_by: string | null;
          claim_fencing_token: string | null;
        }>(
          'select queue_state, authority_kind, available_at_sim_time::text, claimed_by, claim_fencing_token::text from world_v2.command_queue where world_id=$1 and command_id=$2 for update',
          [command.worldId, command.commandId],
        );
        const row = queue.rows[0];
        if (
          !row ||
          queue.rows.length !== 1 ||
          row.authority_kind !== 'DISCRETIONARY_USER' ||
          BigInt(row.available_at_sim_time) > simTime.ticks
        )
          invalid('Reservation Command is not queued and due');
        // Validate opening before persisting a claim. Lease acquisition shares
        // this transaction and rolls back too if lineage is missing/invalid.
        if (row.queue_state === 'PENDING') {
          const prior = await transaction.query<{
            holder_id: string;
            lease_expires_at_real: unknown;
          }>(
            'select holder_id, lease_expires_at_real from world_v2.world_writer_lease where world_id=$1 for update',
            [command.worldId],
          );
          const current = prior.rows[0];
          if (!(
            current &&
            current.holder_id === holder &&
            timestamp(current.lease_expires_at_real) > at
          )) {
            await transaction.query(
              'select * from world_v2.acquire_world_writer_lease($1,$2,$3::timestamptz,60000)',
              [command.worldId, holder, at],
            );
          }
          const lease = await activeLease(
            transaction,
            command.worldId,
            holder,
            at,
          );
          await lineage.rebuildFrom(transaction, command.worldId);
          await transaction.query(
            `update world_v2.command_queue set queue_state='CLAIMED', claimed_by=$3, claimed_at_real=$4::timestamptz, claim_fencing_token=$5::bigint, attempt_count=attempt_count+1 where world_id=$1 and command_id=$2`,
            [
              command.worldId,
              command.commandId,
              holder,
              at,
              lease.fencingToken,
            ],
          );
        } else if (row.queue_state === 'CLAIMED') {
          const lease = await activeLease(
            transaction,
            command.worldId,
            holder,
            at,
          );
          if (
            row.claimed_by !== holder ||
            row.claim_fencing_token !== lease.fencingToken
          )
            invalid(
              'Reservation claim has a stale holder/fence; use reviewed recovery',
            );
          await lineage.rebuildFrom(transaction, command.worldId);
        } else invalid('Reservation queue is not executable');
      });
      return execution.executeQueuedCommand({
        command,
        authorityKind: 'DISCRETIONARY_USER',
        commitSimTime: simTime,
        recordedAtReal: timestamp(input.clock.nowReal()),
        requiredCapability: 'TRADE_CONTRACTS',
        intakeAuthorization,
      });
    },
  });
}
