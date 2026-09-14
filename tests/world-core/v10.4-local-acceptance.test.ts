import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  DOMAIN_ERROR_CODES,
  EVENT_SCHEMA_VERSION,
  Money,
  OFFICE_APPROVAL_CAPABILITY,
  SimTime,
  acquireWorldWriterLease,
  canonicalSerialize,
  createAuthoritativeTransition,
  createNarrowTransferApprovalBundle,
  createOpeningSeed,
  createOpeningSource,
  createWorldWriterCommitAssertion,
  deliverNarrowTreasuryGcuTransfer,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryPostingId,
  inventoryReservationId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  processQueuedCommand,
  proposalId,
  rebuildV08LedgersFromLineage,
  reserveNarrowTreasuryGcuTransfer,
  shipNarrowTreasuryGcuTransfer,
  signApprovalProposal,
  authorizeOfficeCapability,
  createFinalCommandReceipt,
  workerId,
  worldWriterLeaseRequest,
  type CanonicalCommand,
  type CommitAuthorizationProof,
  type FinancialLedgerState,
  type InventoryLedgerState,
} from '@econmind/core';
import {
  createNarrowTreasuryGcuDeliveryCandidateFactory,
  prepareNarrowTreasuryGcuDeliveryAtomicDraft,
} from '../../apps/world-worker/src/persistence/narrow-treasury-gcu-delivery-draft.js';
import { NarrowTreasuryGcuDeliveryOutboxConsumer } from '../../apps/world-worker/src/outbox/narrow-treasury-gcu-delivery-outbox-consumer.js';
import { NarrowTreasuryGcuDeliveryProjectionRebuilder } from '../../apps/world-worker/src/projections/narrow-treasury-gcu-delivery-projection.js';
import { WorldRecoveryCoordinator } from '../../apps/world-worker/src/recovery/world-recovery.js';
import { createTransactionCutoffAuthorizationGuard } from '../../apps/world-worker/src/authoritative-execution.js';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { NarrowTransferApprovalStore } from '../../apps/world-worker/src/persistence/narrow-transfer-approval-store.js';
import {
  createSqlNarrowTreasuryGcuDeliveryCandidateFactory,
  SqlNarrowTreasuryGcuDeliveryPreparationSource,
} from '../../apps/world-worker/src/persistence/sql-narrow-treasury-gcu-delivery-preparation-source.js';
import {
  AtomicTransitionRepository,
  type AtomicCommitAuthorizationGuard,
  type AtomicCommitCheckpoint,
  type PrivateAtomicTransitionCandidate,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  createLocalPostgresV09AtomicTestDatabase,
  createPGliteV09AtomicTestDatabase,
} from '../support/v09-atomic-database.js';
import {
  V09TransactionCommitUnknownError,
  type V09AtomicTestDatabase,
} from '../support/v09-atomic-contract.js';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';
import { FOUNDATION_PROPERTY_CONFIG } from '../property/property-config.js';

const sha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

const SUBMITTED_AT = '2026-09-14T00:00:00.000Z';
const RESERVED_AT = '2026-09-14T00:01:00.000Z';
const V10_4_PROPERTY_CONFIG = Object.freeze({
  ...FOUNDATION_PROPERTY_CONFIG,
  seed: 2_026_091_4,
});
const V10_4_PROPERTY_TIMEOUT_MS = 20_000;
const V10_LIFECYCLE_STATE_MACHINE_CONFIG = Object.freeze({
  ...FOUNDATION_PROPERTY_CONFIG,
  numRuns: 100,
  seed: 2_026_091_5,
});
const V10_LIFECYCLE_STATE_MACHINE_TIMEOUT_MS = 30_000;
const V10_APPROVAL_AWARE_SEQUENCE_CONFIG = Object.freeze({
  ...FOUNDATION_PROPERTY_CONFIG,
  numRuns: 250,
  seed: 2_026_091_6,
});
const V10_APPROVAL_AWARE_SEQUENCE_TIMEOUT_MS = 60_000;
const V10_PROCESS_KILL_CHECKPOINTS = [
  'AFTER_EVENTS',
  'AFTER_INVENTORY_POSTINGS',
  'AFTER_FINANCIAL_POSTINGS',
  'BEFORE_RECEIPT',
  'BEFORE_TRANSACTION_COMMIT',
] as const satisfies readonly AtomicCommitCheckpoint[];
type V10ProcessKillPhase = 'DELIVERY' | 'RESERVE' | 'SHIP';
const root = path.resolve(import.meta.dirname, '../..');
const atomicMigrations = [
  '0001_world_v2_namespace.sql',
  '0002_world_v2_command_event_ledger.sql',
  '0003_world_v2_command_receipts_outbox.sql',
  '0004_world_v2_receipt_event_set_integrity.sql',
  '0005_world_v2_writer_lease_fencing.sql',
  '0006_world_v2_writer_lease_lineage_guard.sql',
  '0007_world_v2_atomic_transition_facts.sql',
  '0008_world_v2_materialization_recovery.sql',
  '0009_world_v2_posting_payload_integrity.sql',
  '0010_world_v2_command_claim_fencing.sql',
  '0011_world_v2_current_commit_authorization.sql',
  '0012_world_v2_command_claim_active_lease_guard.sql',
  '0015_world_v2_narrow_transfer_approvals.sql',
  '0016_world_v2_opening_seed.sql',
] as const;
const postgresDescribe = process.env.V09_TEST_DATABASE_URL
  ? describe
  : describe.skip;
const processKillChild = process.env.V10_PROCESS_KILL_CHILD === '1';
const processKillChildDescribe = processKillChild
  ? postgresDescribe
  : describe.skip;
const processKillParentDescribe = processKillChild
  ? describe.skip
  : postgresDescribe;

const automaticCommitGuard: AtomicCommitAuthorizationGuard = Object.freeze({
  async assertCurrent(transaction, input) {
    expect(input).toMatchObject({
      authorityKind: 'VERSIONED_AUTOMATIC',
      expected: 'NOT_APPLICABLE',
      proof: null,
    });
    await transaction.query('select 1');
  },
});

async function atomicDatabase(): Promise<V09AtomicTestDatabase> {
  const database = process.env.V09_TEST_DATABASE_URL
    ? createLocalPostgresV09AtomicTestDatabase()
    : createPGliteV09AtomicTestDatabase();
  if (database.kind === 'POSTGRESQL') {
    await database.executeScript('create extension if not exists pgcrypto');
    await database.executeScript('drop schema if exists world_v2 cascade');
  }
  for (const migration of atomicMigrations) {
    await database.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  return database;
}

function serverOpeningSeed(
  seed: ReturnType<typeof createV10TwoCountryTestFixture>['openingSeed'],
) {
  const fixtureSource = seed.sources[0];
  if (fixtureSource === undefined) throw new Error('V10_4_EXPECTED_SOURCE');
  const source = createOpeningSource(
    {
      schemaVersion: fixtureSource.schemaVersion,
      sourceId: fixtureSource.sourceId,
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'dataset://v10.4-preparation-source',
      sourceVersion: '2026-09-14',
      payload: JSON.parse(fixtureSource.canonicalPayload),
    },
    sha256Hex,
  );
  return createOpeningSeed(
    {
      ...seed,
      sources: [source],
    },
    sha256Hex,
  );
}

function canonicalPostingIntent(value: { readonly fingerprint: unknown }) {
  const { fingerprint: _fingerprint, ...intent } = value;
  void _fingerprint;
  return canonicalSerialize(intent);
}

async function persistCommand(
  database: V09AtomicTestDatabase,
  command: CanonicalCommand,
): Promise<void> {
  await database.query(
    `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      command.worldId,
      command.commandId,
      command.idempotencyKey,
      command.commandType,
      command.schemaVersion,
      command.canonicalPayload,
      command.payloadHash,
      command.fingerprint,
      command.authSubject,
      command.actorId,
      command.countryId,
      command.officeId,
      command.expectedWorldVersion,
      command.simTime.toCanonicalValue(),
      command.correlationId,
      command.submittedAtReal,
    ],
  );
}

async function persistTransitionFact(
  database: V09AtomicTestDatabase,
  event: ReturnType<typeof transition>['event'],
  inventoryPosting: Awaited<
    ReturnType<typeof preparedDelivery>
  >['reservationPosting'],
): Promise<void> {
  await database.query(
    `insert into world_v2.authoritative_event
       (world_id, event_id, event_sequence, world_version,
        causation_command_id, correlation_id, event_type, schema_version,
        canonical_payload, payload_sha256, event_fingerprint, sim_time,
        recorded_at_real, corrects_event_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      event.worldId,
      event.eventId,
      event.sequence,
      event.worldVersion,
      event.causationCommandId,
      event.correlationId,
      event.eventType,
      event.schemaVersion,
      event.canonicalPayload,
      event.payloadHash,
      event.fingerprint,
      event.simTime.toCanonicalValue(),
      event.recordedAtReal,
      event.correctsEventId,
    ],
  );
  await database.query(
    `insert into world_v2.inventory_posting
       (world_id, posting_id, causation_command_id,
        world_version_before, world_version_after, sim_time, event_ids,
        transition_binding, operation, canonical_payload, posting_fingerprint)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
    [
      inventoryPosting.worldId,
      inventoryPosting.postingId,
      inventoryPosting.causationCommandId,
      inventoryPosting.worldVersionBefore,
      inventoryPosting.worldVersionAfter,
      inventoryPosting.simTime.toCanonicalValue(),
      canonicalSerialize(inventoryPosting.causationEventIds),
      canonicalSerialize(inventoryPosting.transitionBinding),
      inventoryPosting.operation,
      canonicalPostingIntent(inventoryPosting),
      inventoryPosting.fingerprint,
    ],
  );
}

async function persistFinalReceipt(
  database: V09AtomicTestDatabase,
  receipt: ReturnType<typeof createFinalCommandReceipt>,
): Promise<void> {
  await database.query(
    `insert into world_v2.command_receipt
       (world_id, command_id, idempotency_key, schema_version,
        command_fingerprint, outcome, reason_code, transition_id,
        world_version_before, world_version_after, sim_time, event_ids,
        recorded_at_real)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
    [
      receipt.worldId,
      receipt.commandId,
      receipt.idempotencyKey,
      receipt.schemaVersion,
      receipt.commandFingerprint,
      receipt.outcome,
      receipt.reasonCode,
      receipt.transitionId,
      receipt.worldVersionBefore,
      receipt.worldVersionAfter,
      receipt.simTime.toCanonicalValue(),
      canonicalSerialize(receipt.eventIds),
      receipt.recordedAtReal,
    ],
  );
}

async function seedClaimedAtomicCandidate(
  database: V09AtomicTestDatabase,
  candidate: PrivateAtomicTransitionCandidate,
  input: Readonly<{ persistSubmission?: boolean }> = {},
): Promise<void> {
  const command = candidate.command;
  if (input.persistSubmission ?? true) await persistCommand(database, command);
  await database.query(
    `insert into world_v2.command_queue
       (world_id, command_id, authority_kind, priority_rank,
        available_at_sim_time, attempt_count)
     values ($1, $2, $3, 0, $4, 0)`,
    [
      command.worldId,
      command.commandId,
      candidate.authorityKind,
      command.simTime.toCanonicalValue(),
    ],
  );
  await database.query(
    `update world_v2.command_queue
        set queue_state = 'CLAIMED',
            attempt_count = 1,
            claimed_by = $3,
            claimed_at_real = $4,
            claim_fencing_token = 1
      where world_id = $1 and command_id = $2`,
    [
      command.worldId,
      command.commandId,
      candidate.commitAssertion.holderId,
      '2026-09-14T00:02:00.000Z',
    ],
  );
}

async function seedAtomicDelivery(
  database: V09AtomicTestDatabase,
  candidate: PrivateAtomicTransitionCandidate,
): Promise<void> {
  await seedAtomicDeliveries(database, [candidate]);
}

async function seedAtomicDeliveries(
  database: V09AtomicTestDatabase,
  candidates: readonly PrivateAtomicTransitionCandidate[],
): Promise<void> {
  const first = candidates[0];
  if (first === undefined) throw new Error('V10_4_EXPECTED_CANDIDATE');
  const command = first.command;
  await database.query(
    `insert into world_v2.world_head (world_id, world_version, event_sequence)
     values ($1, 2, 2)`,
    [command.worldId],
  );
  await database.query(
    `select * from world_v2.acquire_world_writer_lease($1, $2, $3, $4)`,
    [
      command.worldId,
      first.commitAssertion.holderId,
      '2026-09-14T00:02:00.000Z',
      '300000',
    ],
  );
  for (const candidate of candidates) {
    await seedClaimedAtomicCandidate(database, candidate);
  }
}

function transferCommand(): CanonicalCommand {
  const fixture = createV10TwoCountryTestFixture();
  const source = fixture.inventoryAccounts.sellerAvailable;
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: 'CORE_GOODS_TRANSFER_V1',
      commandId: 'COMMAND_V10_4_TREASURY_GCU_TRANSFER',
      idempotencyKey: 'IDEMPOTENCY_V10_4_TREASURY_GCU_TRANSFER',
      worldId: fixture.worldId,
      actorId: fixture.officeActors.sellerTrade.actorId,
      authSubject: fixture.officeActors.sellerTrade.principal.authSubject,
      countryId: fixture.countries.seller,
      officeId: 'TRADE',
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: SUBMITTED_AT,
      correlationId: 'CORRELATION_V10_4_TREASURY_GCU_TRANSFER',
      payload: {
        schemaVersion: 'core-goods-transfer-v1',
        commodityId: 'GRAIN',
        sellerCountryId: fixture.countries.seller,
        buyerCountryId: fixture.countries.buyer,
        quantity: { amount: '2', unit: source.unit },
        price: { amount: '3', currency: 'GCU', perUnit: source.unit },
        assetSource: {
          batchId: source.batchId,
          physicalLocationId: source.physicalLocationId,
          titleHolderId: source.titleHolderId,
          riskBearerId: source.riskBearerId,
          economicRecognitionId: source.economicRecognitionId,
        },
        paymentSource: 'BUYER_TREASURY_GCU',
        policyVersion: 'V10_TREASURY_GCU_V1',
        threshold: {
          policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
          maxSettlement: { amount: '6', currency: 'GCU' },
        },
        expiresAtReal: '2026-09-14T00:10:00.000Z',
      },
    },
    sha256Hex,
  );
}

function automaticCommand(input: {
  readonly commandId: string;
  readonly commandType: string;
  readonly expectedWorldVersion: string;
  readonly payload: unknown;
  readonly simTime: string;
}): CanonicalCommand {
  const fixture = createV10TwoCountryTestFixture();
  const actor = fixture.officeActors.sellerTrade;
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: input.commandType,
      commandId: input.commandId,
      idempotencyKey: `IDEMPOTENCY_${input.commandId}`,
      worldId: fixture.worldId,
      actorId: actor.actorId,
      authSubject: actor.principal.authSubject,
      countryId: fixture.countries.seller,
      officeId: null,
      expectedWorldVersion: input.expectedWorldVersion,
      simTime: input.simTime,
      submittedAtReal: SUBMITTED_AT,
      correlationId: `CORRELATION_${input.commandId}`,
      payload: input.payload,
    },
    sha256Hex,
  );
}

function transition(
  command: CanonicalCommand,
  worldVersionBefore: string,
  sequence: string,
) {
  const worldVersionAfter = String(BigInt(worldVersionBefore) + 1n);
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: `EVENT_${command.commandId}`,
      eventType: command.commandType,
      worldId: command.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: worldVersionAfter,
      sequence,
      simTime: command.simTime.toCanonicalValue(),
      recordedAtReal: SUBMITTED_AT,
      correctsEventId: null,
      payload: { commandFingerprint: command.fingerprint },
    },
    sha256Hex,
  );
  return Object.freeze({
    event,
    transition: createAuthoritativeTransition({
      command,
      worldVersionBefore,
      worldVersionAfter,
      events: [event],
    }),
  });
}

async function approvalContext(
  actor: ReturnType<
    typeof createV10TwoCountryTestFixture
  >['officeActors'][keyof ReturnType<
    typeof createV10TwoCountryTestFixture
  >['officeActors']],
  proposal: ReturnType<typeof createNarrowTransferApprovalBundle>['seller'],
) {
  return authorizeOfficeCapability({
    principal: actor.principal,
    resolver: actor.resolver,
    worldId: proposal.worldId,
    requestedCountryId: proposal.countryId,
    requestedOfficeId: actor.officeId,
    capability: OFFICE_APPROVAL_CAPABILITY,
    decisionScope: {
      proposalId: proposal.id,
      proposalVersion: proposal.version,
      worldId: proposal.worldId,
      countryId: proposal.countryId,
      payloadFingerprint: proposal.payloadFingerprint,
      policyVersion: proposal.policyVersion,
      requiredOffices: proposal.requiredOffices,
    },
  });
}

function revocableApprovalContext(
  actor: ReturnType<
    typeof createV10TwoCountryTestFixture
  >['officeActors'][keyof ReturnType<
    typeof createV10TwoCountryTestFixture
  >['officeActors']],
  proposal: ReturnType<typeof createNarrowTransferApprovalBundle>['seller'],
) {
  let revoked = false;
  const resolver = Object.freeze({
    async resolveCurrentIdentity(
      candidate: typeof actor.principal,
    ): Promise<typeof actor.principal.authSubject | null> {
      return candidate.authSubject === actor.principal.authSubject
        ? actor.principal.authSubject
        : null;
    },
    async resolveCurrentMembership(
      candidate: typeof actor.principal,
      requestedWorldId: typeof proposal.worldId,
    ) {
      if (
        revoked ||
        candidate.authSubject !== actor.principal.authSubject ||
        requestedWorldId !== proposal.worldId
      ) {
        return null;
      }
      return actor.membership;
    },
  });
  return Object.freeze({
    authorize: () =>
      authorizeOfficeCapability({
        principal: actor.principal,
        resolver,
        worldId: proposal.worldId,
        requestedCountryId: proposal.countryId,
        requestedOfficeId: actor.officeId,
        capability: OFFICE_APPROVAL_CAPABILITY,
        decisionScope: {
          proposalId: proposal.id,
          proposalVersion: proposal.version,
          worldId: proposal.worldId,
          countryId: proposal.countryId,
          payloadFingerprint: proposal.payloadFingerprint,
          policyVersion: proposal.policyVersion,
          requiredOffices: proposal.requiredOffices,
        },
      }),
    revoke: () => {
      revoked = true;
    },
  });
}

async function approvedTransfer(transfer: CanonicalCommand) {
  const fixture = createV10TwoCountryTestFixture();
  const initial = createNarrowTransferApprovalBundle({
    command: transfer,
    sellerProposalId: proposalId('PROPOSAL_V10_4_SELLER'),
    buyerProposalId: proposalId('PROPOSAL_V10_4_BUYER'),
    proposalVersion: 'VERSION_1',
  });
  const sellerContext = await approvalContext(
    fixture.officeActors.sellerTrade,
    initial.seller,
  );
  const seller = await signApprovalProposal({
    proposal: initial.seller,
    context: sellerContext,
    actorId: fixture.officeActors.sellerTrade.actorId,
    expectedVersion: 'VERSION_1',
    signedAt: SUBMITTED_AT,
  });
  const buyerTradeContext = await approvalContext(
    fixture.officeActors.buyerTrade,
    initial.buyer,
  );
  let buyer = await signApprovalProposal({
    proposal: initial.buyer,
    context: buyerTradeContext,
    actorId: fixture.officeActors.buyerTrade.actorId,
    expectedVersion: 'VERSION_1',
    signedAt: SUBMITTED_AT,
  });
  const buyerFinanceContext = await approvalContext(
    fixture.officeActors.buyerFinance,
    buyer,
  );
  buyer = await signApprovalProposal({
    proposal: buyer,
    context: buyerFinanceContext,
    actorId: fixture.officeActors.buyerFinance.actorId,
    expectedVersion: 'VERSION_1',
    signedAt: SUBMITTED_AT,
  });
  return Object.freeze({
    fixture,
    approvals: Object.freeze({ ...initial, seller, buyer }),
    contexts: Object.freeze({
      sellerTrade: Object.freeze({
        actorId: fixture.officeActors.sellerTrade.actorId,
        context: sellerContext,
      }),
      buyerTrade: Object.freeze({
        actorId: fixture.officeActors.buyerTrade.actorId,
        context: buyerTradeContext,
      }),
      buyerFinance: Object.freeze({
        actorId: fixture.officeActors.buyerFinance.actorId,
        context: buyerFinanceContext,
      }),
    }),
  });
}

function shipmentCommand(transfer: CanonicalCommand): CanonicalCommand {
  return automaticCommand({
    commandId: 'COMMAND_V10_4_SHIPMENT',
    commandType: 'CORE_GOODS_SHIPMENT_V1',
    expectedWorldVersion: '1',
    simTime: '10100',
    payload: {
      schemaVersion: 'core-goods-shipment-v1',
      shipmentId: 'SHIPMENT_V10_4_TREASURY_GCU',
      transferCommandId: transfer.commandId,
      transferFingerprint: transfer.fingerprint,
    },
  });
}

function deliveryCommand(
  transfer: CanonicalCommand,
  contenderSuffix = '',
): CanonicalCommand {
  const fixture = createV10TwoCountryTestFixture();
  const destination = fixture.inventoryAccounts.buyerAvailable;
  const contenderIdentity =
    contenderSuffix.length === 0 ? '' : `_${contenderSuffix}`;
  return automaticCommand({
    commandId: `COMMAND_V10_4_DELIVERY${contenderIdentity}`,
    commandType: 'CORE_GOODS_DELIVERY_V1',
    expectedWorldVersion: '2',
    simTime: '10200',
    payload: {
      schemaVersion: 'core-goods-delivery-v1',
      transferCommandId: transfer.commandId,
      transferFingerprint: transfer.fingerprint,
      shipmentId: 'SHIPMENT_V10_4_TREASURY_GCU',
      destination: {
        physicalLocationId: destination.physicalLocationId,
        titleHolderId: destination.titleHolderId,
        riskBearerId: destination.riskBearerId,
        economicRecognitionId: destination.economicRecognitionId,
      },
      buyerTreasuryAccountId: fixture.financialAccounts.buyerTreasury.accountId,
      sellerSettlementAccountId:
        fixture.financialAccounts.sellerSettlement.accountId,
    },
  });
}

function accountBalance(state: FinancialLedgerState, accountId: string) {
  const position = state.positions.find(
    (candidate) => candidate.account.accountId === accountId,
  );
  if (position === undefined) throw new Error('V10_4_EXPECTED_ACCOUNT_BALANCE');
  return position.netDebitBalance;
}

function commodityQuantity(state: InventoryLedgerState, commodityId: string) {
  const balances = state.balances.filter(
    (balance) => balance.account.commodityId === commodityId,
  );
  if (balances.length === 0) throw new Error('V10_4_EXPECTED_COMMODITY');
  return balances
    .slice(1)
    .reduce(
      (total, balance) => total.add(balance.quantity),
      balances[0]!.quantity,
    );
}

function withBuyerTreasuryBalance(
  fixture: ReturnType<typeof createV10TwoCountryTestFixture>,
  buyerAmount: string,
) {
  const buyerTreasuryId = fixture.financialAccounts.buyerTreasury.accountId;
  const buyerEquityId = fixture.financialAccounts.buyerOpeningEquity.accountId;
  return createOpeningSeed(
    {
      ...fixture.openingSeed,
      financialBatches: fixture.openingSeed.financialBatches.map((batch) =>
        Object.freeze({
          ...batch,
          legs: Object.freeze(
            batch.legs.map((leg) =>
              leg.account.accountId === buyerTreasuryId ||
              leg.account.accountId === buyerEquityId
                ? Object.freeze({
                    ...leg,
                    amount: Money.from(buyerAmount, leg.amount.currency),
                  })
                : leg,
            ),
          ),
        }),
      ),
    },
    sha256Hex,
  );
}

async function preparedDelivery(
  input: {
    readonly openingSeed?: ReturnType<
      typeof createV10TwoCountryTestFixture
    >['openingSeed'];
  } = {},
) {
  const transfer = transferCommand();
  const approved = await approvedTransfer(transfer);
  const reserve = transition(transfer, '0', '1');
  const reservation = await reserveNarrowTreasuryGcuTransfer({
    approvals: approved.approvals,
    contexts: approved.contexts,
    atReal: RESERVED_AT,
    inventoryState: approved.fixture.rebuiltLedgers.inventory,
    source: approved.fixture.inventoryAccounts.sellerAvailable,
    reservationId: inventoryReservationId('RESERVATION_V10_4_TREASURY_GCU'),
    postingId: inventoryPostingId('POSTING_V10_4_RESERVE'),
    transition: reserve.transition,
    simTime: SimTime.fromTicks('10000'),
    causationEventIds: [reserve.event.eventId],
    sha256Hex,
  });
  const shipment = shipmentCommand(transfer);
  const ship = transition(shipment, '1', '2');
  const reservedSource = reservation.inventory.state.balances.find(
    (balance) => balance.account.bucket === 'RESERVED',
  )?.account;
  if (reservedSource === undefined) {
    throw new Error('V10_4_EXPECTED_RESERVED_SOURCE');
  }
  const shipmentResult = shipNarrowTreasuryGcuTransfer({
    causationEventIds: [ship.event.eventId],
    inventoryState: reservation.inventory.state,
    postingId: inventoryPostingId('POSTING_V10_4_SHIPMENT'),
    shipmentCommand: shipment,
    source: reservedSource,
    transferCommand: transfer,
    transition: ship.transition,
    sha256Hex,
  });
  const preDelivery = rebuildV08LedgersFromLineage({
    seed: input.openingSeed ?? approved.fixture.openingSeed,
    transitions: [
      {
        command: transfer,
        transition: reserve.transition,
        inventoryPostings: [reservation.posting],
        financialPostingBatches: [],
      },
      {
        command: shipment,
        transition: ship.transition,
        inventoryPostings: [shipmentResult.posting],
        financialPostingBatches: [],
      },
    ],
    sha256Hex,
  });
  const source = preDelivery.inventory.balances.find(
    (balance) => balance.account.bucket === 'IN_TRANSIT',
  )?.account;
  if (source === undefined) throw new Error('V10_4_EXPECTED_TRANSIT_SOURCE');
  const delivery = deliveryCommand(transfer);
  const deliver = transition(delivery, '2', '3');
  return Object.freeze({
    approvals: approved.approvals,
    contexts: approved.contexts,
    fixture: approved.fixture,
    reservationPosting: reservation.posting,
    shipment,
    shipmentPosting: shipmentResult.posting,
    transfer,
    preDelivery,
    source,
    delivery,
    deliver,
  });
}

type DeliveryStates = Pick<
  Awaited<ReturnType<typeof preparedDelivery>>['preDelivery'],
  'financial' | 'inventory'
>;

function settle(
  input: Awaited<ReturnType<typeof preparedDelivery>>,
  states: DeliveryStates = input.preDelivery,
) {
  return deliverNarrowTreasuryGcuTransfer({
    buyerTreasury: input.fixture.financialAccounts.buyerTreasury,
    buyerTreasuryLegId: financialPostingLegId('LEG_V10_4_BUYER_TREASURY'),
    causationEventIds: [input.deliver.event.eventId],
    deliveryCommand: input.delivery,
    financialBatchId: financialPostingBatchId('BATCH_V10_4_DELIVERY'),
    financialState: states.financial,
    inventoryPostingId: inventoryPostingId('POSTING_V10_4_DELIVERY'),
    inventoryState: states.inventory,
    sellerSettlement: input.fixture.financialAccounts.sellerSettlement,
    sellerSettlementLegId: financialPostingLegId('LEG_V10_4_SELLER_SETTLEMENT'),
    source: input.source,
    transferCommand: input.transfer,
    transition: input.deliver.transition,
    sha256Hex,
  });
}

function atomicDeliveryCandidate(input: {
  readonly delivery: CanonicalCommand;
  readonly prepared: Awaited<ReturnType<typeof preparedDelivery>>;
  readonly suffix: string;
}): PrivateAtomicTransitionCandidate {
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      input.delivery.worldId,
      workerId('WORKER_V10_4_CONCURRENT'),
      '2026-09-14T00:02:00.000Z',
      '2026-09-14T00:07:00.000Z',
    ),
  ).lease;
  const draft = prepareNarrowTreasuryGcuDeliveryAtomicDraft({
    buyerTreasury: input.prepared.fixture.financialAccounts.buyerTreasury,
    buyerTreasuryLegId: financialPostingLegId(
      `LEG_V10_4_CONCURRENT_BUYER_${input.suffix}`,
    ),
    commitAssertion: createWorldWriterCommitAssertion(lease, '2'),
    deliveryCommand: input.delivery,
    eventId: `EVENT_V10_4_CONCURRENT_${input.suffix}`,
    eventSequence: '3',
    financialBatchId: financialPostingBatchId(
      `BATCH_V10_4_CONCURRENT_${input.suffix}`,
    ),
    financialState: input.prepared.preDelivery.financial,
    inventoryPostingId: inventoryPostingId(
      `POSTING_V10_4_CONCURRENT_${input.suffix}`,
    ),
    inventoryState: input.prepared.preDelivery.inventory,
    observedAtReal: '2026-09-14T00:02:00.000Z',
    outboxMessageId: `OUTBOX_V10_4_CONCURRENT_${input.suffix}`,
    sellerSettlement: input.prepared.fixture.financialAccounts.sellerSettlement,
    sellerSettlementLegId: financialPostingLegId(
      `LEG_V10_4_CONCURRENT_SELLER_${input.suffix}`,
    ),
    source: input.prepared.source,
    transferCommand: input.prepared.transfer,
    sha256Hex,
  }).draft;
  return prepareAtomicTransitionCandidate({
    command: input.delivery,
    commitAuthorization: null,
    draft,
    sha256Hex,
  });
}

function atomicShipmentCandidate(input: {
  readonly prepared: Awaited<ReturnType<typeof preparedDelivery>>;
  readonly suffix: string;
}): PrivateAtomicTransitionCandidate {
  const reserve = transition(input.prepared.transfer, '0', '1');
  const reserved = rebuildV08LedgersFromLineage({
    seed: input.prepared.fixture.openingSeed,
    transitions: [
      {
        command: input.prepared.transfer,
        transition: reserve.transition,
        inventoryPostings: [input.prepared.reservationPosting],
        financialPostingBatches: [],
      },
    ],
    sha256Hex,
  });
  const source = reserved.inventory.balances.find(
    (balance) => balance.account.bucket === 'RESERVED',
  )?.account;
  if (source === undefined) {
    throw new Error('V10_4_EXPECTED_RESERVED_ATOMIC_SOURCE');
  }
  const shipment = input.prepared.shipment;
  const ship = transition(shipment, '1', '2');
  const result = shipNarrowTreasuryGcuTransfer({
    causationEventIds: [ship.event.eventId],
    inventoryState: reserved.inventory,
    postingId: inventoryPostingId(`POSTING_V10_4_ATOMIC_SHIP_${input.suffix}`),
    shipmentCommand: shipment,
    source,
    transferCommand: input.prepared.transfer,
    transition: ship.transition,
    sha256Hex,
  });
  if (result.inventory.receipt.outcome !== 'APPLIED') {
    throw new Error('V10_4_EXPECTED_NEW_ATOMIC_SHIPMENT');
  }
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      shipment.worldId,
      workerId('WORKER_V10_4_CONCURRENT'),
      '2026-09-14T00:02:00.000Z',
      '2026-09-14T00:07:00.000Z',
    ),
  ).lease;
  const receipt = createFinalCommandReceipt({
    command: shipment,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition: ship.transition,
    simTime: shipment.simTime,
    recordedAtReal: '2026-09-14T00:02:00.000Z',
  });
  return prepareAtomicTransitionCandidate({
    command: shipment,
    commitAuthorization: null,
    draft: {
      transition: ship.transition,
      inventoryPostings: [result.posting],
      financialPostingBatches: [],
      receipt,
      outboxMessages: [],
      currentMaterializations: [],
      authorityKind: 'VERSIONED_AUTOMATIC',
      commitAssertion: createWorldWriterCommitAssertion(lease, '1'),
      observedAtReal: '2026-09-14T00:02:00.000Z',
    },
    sha256Hex,
  });
}

async function reserveCommitProof(
  transfer: CanonicalCommand,
): Promise<CommitAuthorizationProof> {
  const fixture = createV10TwoCountryTestFixture();
  const seller = fixture.officeActors.sellerTrade;
  const context = await authorizeOfficeCapability({
    principal: seller.principal,
    resolver: seller.resolver,
    worldId: transfer.worldId,
    requestedCountryId: transfer.countryId,
    requestedOfficeId: seller.officeId,
    capability: 'TRADE_CONTRACTS',
  });
  const captured = new Error('V10_4_RESERVE_PROOF_CAPTURED');
  let proof: CommitAuthorizationProof | null = null;
  const persistence = {
    async readFinalReceipt() {
      return null;
    },
    async recordZeroEffectReceipt(receipt: unknown) {
      return receipt;
    },
    async commitAuthorizedCommand(input: {
      readonly commitAuthorization: CommitAuthorizationProof | null;
    }) {
      proof = input.commitAuthorization;
      throw captured;
    },
  };
  await expect(
    processQueuedCommand({
      command: transfer,
      authorityKind: 'DISCRETIONARY_USER',
      commitSimTime: transfer.simTime,
      recordedAtReal: RESERVED_AT,
      requiredCapability: 'TRADE_CONTRACTS',
      intakeAuthorization: context,
      persistence,
    }),
  ).rejects.toThrow(captured);
  if (proof === null) throw new Error('V10_4_EXPECTED_RESERVE_COMMIT_PROOF');
  return proof;
}

async function atomicReserveCandidate(input: {
  readonly prepared: Awaited<ReturnType<typeof preparedDelivery>>;
}): Promise<PrivateAtomicTransitionCandidate> {
  const transfer = input.prepared.transfer;
  const reserve = transition(transfer, '0', '1');
  const result = await reserveNarrowTreasuryGcuTransfer({
    approvals: input.prepared.approvals,
    contexts: input.prepared.contexts,
    atReal: RESERVED_AT,
    inventoryState: input.prepared.fixture.rebuiltLedgers.inventory,
    source: input.prepared.fixture.inventoryAccounts.sellerAvailable,
    reservationId: inventoryReservationId('RESERVATION_V10_4_ATOMIC_RESERVE'),
    postingId: inventoryPostingId('POSTING_V10_4_ATOMIC_RESERVE'),
    transition: reserve.transition,
    simTime: transfer.simTime,
    causationEventIds: [reserve.event.eventId],
    sha256Hex,
  });
  if (result.inventory.receipt.outcome !== 'APPLIED') {
    throw new Error('V10_4_EXPECTED_NEW_ATOMIC_RESERVATION');
  }
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      transfer.worldId,
      workerId('WORKER_V10_4_CONCURRENT'),
      '2026-09-14T00:02:00.000Z',
      '2026-09-14T00:07:00.000Z',
    ),
  ).lease;
  const receipt = createFinalCommandReceipt({
    command: transfer,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition: reserve.transition,
    simTime: transfer.simTime,
    recordedAtReal: RESERVED_AT,
  });
  return prepareAtomicTransitionCandidate({
    command: transfer,
    commitAuthorization: await reserveCommitProof(transfer),
    draft: {
      transition: reserve.transition,
      inventoryPostings: [result.posting],
      financialPostingBatches: [],
      receipt,
      outboxMessages: [],
      currentMaterializations: [],
      authorityKind: 'DISCRETIONARY_USER',
      commitAssertion: createWorldWriterCommitAssertion(lease, '0'),
      observedAtReal: RESERVED_AT,
    },
    sha256Hex,
  });
}

async function persistCurrentNarrowTransferAuthorizations(
  database: V09AtomicTestDatabase,
  prepared: Awaited<ReturnType<typeof preparedDelivery>>,
): Promise<void> {
  const fixture = prepared.fixture;
  const authorizations = [
    {
      actor: fixture.officeActors.sellerTrade,
      capability: 'TRADE_CONTRACTS',
      countryId: fixture.countries.seller,
      officeId: 'TRADE',
    },
    {
      actor: fixture.officeActors.buyerTrade,
      capability: 'TRADE_CONTRACTS',
      countryId: fixture.countries.buyer,
      officeId: 'TRADE',
    },
    {
      actor: fixture.officeActors.buyerFinance,
      capability: 'FINANCE_TREASURY',
      countryId: fixture.countries.buyer,
      officeId: 'FINANCE',
    },
  ] as const;
  for (const authorization of authorizations) {
    await database.query(
      `insert into world_v2.current_commit_authorization
         (world_id, auth_subject, country_id, office_id, capability, team_id,
          authorization_version, active, refreshed_at_real)
       values ($1, $2::uuid, $3, $4, $5, $6, $7, true, $8::timestamptz)`,
      [
        prepared.transfer.worldId,
        authorization.actor.principal.authSubject,
        authorization.countryId,
        authorization.officeId,
        authorization.capability,
        authorization.actor.membership.teamId,
        authorization.actor.membership.authorizationVersion,
        SUBMITTED_AT,
      ],
    );
  }
}

async function seedAtomicReserve(
  database: V09AtomicTestDatabase,
  input: {
    readonly candidate: PrivateAtomicTransitionCandidate;
    readonly prepared: Awaited<ReturnType<typeof preparedDelivery>>;
  },
): Promise<NarrowTransferApprovalStore> {
  await database.query(
    `insert into world_v2.world_head (world_id, world_version, event_sequence)
     values ($1, 0, 0)`,
    [input.prepared.transfer.worldId],
  );
  await persistCommand(database, input.prepared.transfer);
  await persistCurrentNarrowTransferAuthorizations(database, input.prepared);
  const approvals = new NarrowTransferApprovalStore({ database, sha256Hex });
  await approvals.openSellerOffer({
    command: input.prepared.transfer,
    signer: {
      actorId: input.prepared.fixture.officeActors.sellerTrade.actorId,
      authSubject:
        input.prepared.fixture.officeActors.sellerTrade.principal.authSubject,
      signedAtReal: SUBMITTED_AT,
    },
  });
  await approvals.signBuyerOffice({
    command: input.prepared.transfer,
    office: 'TRADE',
    signer: {
      actorId: input.prepared.fixture.officeActors.buyerTrade.actorId,
      authSubject:
        input.prepared.fixture.officeActors.buyerTrade.principal.authSubject,
      signedAtReal: SUBMITTED_AT,
    },
  });
  await approvals.signBuyerOffice({
    command: input.prepared.transfer,
    office: 'FINANCE',
    signer: {
      actorId: input.prepared.fixture.officeActors.buyerFinance.actorId,
      authSubject:
        input.prepared.fixture.officeActors.buyerFinance.principal.authSubject,
      signedAtReal: SUBMITTED_AT,
    },
  });
  await database.query(
    `select * from world_v2.acquire_world_writer_lease($1, $2, $3, $4)`,
    [
      input.prepared.transfer.worldId,
      input.candidate.commitAssertion.holderId,
      '2026-09-14T00:02:00.000Z',
      '300000',
    ],
  );
  await seedClaimedAtomicCandidate(database, input.candidate, {
    persistSubmission: false,
  });
  return approvals;
}

async function seedReservedAutomaticLifecycle(
  database: V09AtomicTestDatabase,
  input: {
    readonly prepared: Awaited<ReturnType<typeof preparedDelivery>>;
    readonly shipment: PrivateAtomicTransitionCandidate;
  },
): Promise<void> {
  const reserve = transition(input.prepared.transfer, '0', '1');
  const receipt = createFinalCommandReceipt({
    command: input.prepared.transfer,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition: reserve.transition,
    simTime: input.prepared.transfer.simTime,
    recordedAtReal: RESERVED_AT,
  });
  await database.query(
    `insert into world_v2.world_head (world_id, world_version, event_sequence)
     values ($1, 1, 1)`,
    [input.prepared.transfer.worldId],
  );
  await persistCommand(database, input.prepared.transfer);
  await persistTransitionFact(
    database,
    reserve.event,
    input.prepared.reservationPosting,
  );
  await persistFinalReceipt(database, receipt);
  await database.query(
    `select * from world_v2.acquire_world_writer_lease($1, $2, $3, $4)`,
    [
      input.prepared.transfer.worldId,
      input.shipment.commitAssertion.holderId,
      '2026-09-14T00:02:00.000Z',
      '300000',
    ],
  );
  await seedClaimedAtomicCandidate(database, input.shipment);
}

type V10LifecyclePhase = 'AVAILABLE' | 'RESERVED' | 'IN_TRANSIT' | 'DELIVERED';
type V10LifecycleOperation = 'RESERVE' | 'SHIP' | 'DELIVER';
type V10ApprovalAwareOperation =
  | 'SIGN_SELLER'
  | 'SIGN_BUYER_TRADE'
  | 'SIGN_BUYER_FINANCE'
  | 'REVOKE_BUYER_FINANCE'
  | 'RESERVE'
  | 'SHIP'
  | 'DELIVER'
  | 'RETRY';

function lifecycleSource(
  prepared: Awaited<ReturnType<typeof preparedDelivery>>,
  inventory: InventoryLedgerState,
  bucket: 'RESERVED' | 'IN_TRANSIT',
) {
  return (
    inventory.balances.find((balance) => balance.account.bucket === bucket)
      ?.account ??
    (bucket === 'RESERVED'
      ? prepared.fixture.inventoryAccounts.sellerReserved
      : prepared.source)
  );
}

async function runV10LifecycleOperation(input: {
  readonly operation: V10LifecycleOperation;
  readonly prepared: Awaited<ReturnType<typeof preparedDelivery>>;
  readonly states: DeliveryStates;
}): Promise<DeliveryStates> {
  const { operation, prepared } = input;
  if (operation === 'RESERVE') {
    const reserve = transition(prepared.transfer, '0', '1');
    const result = await reserveNarrowTreasuryGcuTransfer({
      approvals: prepared.approvals,
      contexts: prepared.contexts,
      atReal: RESERVED_AT,
      inventoryState: input.states.inventory,
      source: prepared.fixture.inventoryAccounts.sellerAvailable,
      reservationId: inventoryReservationId('RESERVATION_V10_4_TREASURY_GCU'),
      postingId: inventoryPostingId('POSTING_V10_4_RESERVE'),
      transition: reserve.transition,
      simTime: SimTime.fromTicks('10000'),
      causationEventIds: [reserve.event.eventId],
      sha256Hex,
    });
    return Object.freeze({
      financial: input.states.financial,
      inventory: result.inventory.state,
    });
  }
  if (operation === 'SHIP') {
    const ship = transition(prepared.shipment, '1', '2');
    const result = shipNarrowTreasuryGcuTransfer({
      causationEventIds: [ship.event.eventId],
      inventoryState: input.states.inventory,
      postingId: inventoryPostingId('POSTING_V10_4_SHIPMENT'),
      shipmentCommand: prepared.shipment,
      source: lifecycleSource(prepared, input.states.inventory, 'RESERVED'),
      transferCommand: prepared.transfer,
      transition: ship.transition,
      sha256Hex,
    });
    return Object.freeze({
      financial: input.states.financial,
      inventory: result.inventory.state,
    });
  }
  const deliver = transition(prepared.delivery, '2', '3');
  const result = deliverNarrowTreasuryGcuTransfer({
    buyerTreasury: prepared.fixture.financialAccounts.buyerTreasury,
    buyerTreasuryLegId: financialPostingLegId('LEG_V10_4_LIFECYCLE_BUYER'),
    causationEventIds: [deliver.event.eventId],
    deliveryCommand: prepared.delivery,
    financialBatchId: financialPostingBatchId('BATCH_V10_4_LIFECYCLE'),
    financialState: input.states.financial,
    inventoryPostingId: inventoryPostingId('POSTING_V10_4_LIFECYCLE'),
    inventoryState: input.states.inventory,
    sellerSettlement: prepared.fixture.financialAccounts.sellerSettlement,
    sellerSettlementLegId: financialPostingLegId('LEG_V10_4_LIFECYCLE_SELLER'),
    source: lifecycleSource(prepared, input.states.inventory, 'IN_TRANSIT'),
    transferCommand: prepared.transfer,
    transition: deliver.transition,
    sha256Hex,
  });
  return Object.freeze({
    financial: result.financial.state,
    inventory: result.inventory.state,
  });
}

function nextV10LifecyclePhase(
  phase: V10LifecyclePhase,
  operation: V10LifecycleOperation,
  buyerBalance: number,
): V10LifecyclePhase {
  if (phase === 'AVAILABLE' && operation === 'RESERVE') return 'RESERVED';
  if (phase === 'RESERVED' && operation === 'SHIP') return 'IN_TRANSIT';
  if (phase === 'IN_TRANSIT' && operation === 'DELIVER' && buyerBalance >= 6) {
    return 'DELIVERED';
  }
  return phase;
}

async function runV10ProcessKillChild(
  checkpoint: (typeof V10_PROCESS_KILL_CHECKPOINTS)[number],
  phase: V10ProcessKillPhase = 'DELIVERY',
): Promise<{
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}> {
  const child = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      'tests/world-core/v10.4-local-acceptance.test.ts',
      '--testNamePattern',
      'terminates the Worker at the configured atomic checkpoint',
      '--pool=threads',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        V10_PROCESS_KILL_CHILD: '1',
        V10_PROCESS_KILL_CHECKPOINT: checkpoint,
        V10_PROCESS_KILL_PHASE: phase,
      },
      stdio: 'ignore',
    },
  );
  const [code, signal] = (await once(child, 'close')) as [
    number | null,
    NodeJS.Signals | null,
  ];
  return Object.freeze({ code, signal });
}

describe('V10.4 Treasury-GCU acceptance', () => {
  it('delivers the full exact quantity and preserves bilateral GCU and goods conservation', async () => {
    const prepared = await preparedDelivery();
    const goodsBefore = commodityQuantity(
      prepared.preDelivery.inventory,
      prepared.fixture.commodity.id,
    );
    const gcuBefore = accountBalance(
      prepared.preDelivery.financial,
      prepared.fixture.financialAccounts.buyerTreasury.accountId,
    ).add(
      accountBalance(
        prepared.preDelivery.financial,
        prepared.fixture.financialAccounts.sellerSettlement.accountId,
      ),
    );

    const settled = settle(prepared);

    expect(settled.inventory.receipt.outcome).toBe('APPLIED');
    expect(settled.financial.receipt.outcome).toBe('APPLIED');
    expect(
      commodityQuantity(
        settled.inventory.state,
        prepared.fixture.commodity.id,
      ).toCanonicalValue(),
    ).toEqual(goodsBefore.toCanonicalValue());
    expect(
      accountBalance(
        settled.financial.state,
        prepared.fixture.financialAccounts.buyerTreasury.accountId,
      )
        .add(
          accountBalance(
            settled.financial.state,
            prepared.fixture.financialAccounts.sellerSettlement.accountId,
          ),
        )
        .toCanonicalValue(),
    ).toEqual(gcuBefore.toCanonicalValue());
    expect(
      settled.inventory.state.balances
        .find(
          (balance) =>
            balance.account.countryId === prepared.fixture.countries.buyer &&
            balance.account.bucket === 'AVAILABLE',
        )
        ?.quantity.toCanonicalValue().amount,
    ).toBe('2');
  });

  it('replays the exact delivery without a second goods or GCU effect', async () => {
    const prepared = await preparedDelivery();
    const settled = settle(prepared);
    const duplicate = settle(prepared, {
      inventory: settled.inventory.state,
      financial: settled.financial.state,
    });

    expect(duplicate.inventory.receipt.outcome).toBe('EXACT_DUPLICATE');
    expect(duplicate.financial.receipt.outcome).toBe('EXACT_DUPLICATE');
    expect(duplicate.inventory.state).toBe(settled.inventory.state);
    expect(duplicate.financial.state).toBe(settled.financial.state);
  });

  it('rejects insufficient Buyer Treasury funds before returning any partial delivery effect', async () => {
    const fixture = createV10TwoCountryTestFixture();
    const prepared = await preparedDelivery({
      openingSeed: withBuyerTreasuryBalance(fixture, '5'),
    });
    const before = canonicalSerialize({
      financial: prepared.preDelivery.financial,
      inventory: prepared.preDelivery.inventory,
    });

    expect(() => settle(prepared)).toThrow(/insufficient exact GCU funds/u);
    expect(
      canonicalSerialize({
        financial: prepared.preDelivery.financial,
        inventory: prepared.preDelivery.inventory,
      }),
    ).toBe(before);
  });

  it(
    'keeps generated exact Buyer Treasury balances symmetric or fully rejected',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 12 }), async (balance) => {
          const fixture = createV10TwoCountryTestFixture();
          const prepared = await preparedDelivery({
            openingSeed: withBuyerTreasuryBalance(fixture, String(balance)),
          });
          const before = canonicalSerialize({
            financial: prepared.preDelivery.financial,
            inventory: prepared.preDelivery.inventory,
          });
          if (balance < 6) {
            expect(() => settle(prepared)).toThrow(
              /insufficient exact GCU funds/u,
            );
            expect(
              canonicalSerialize({
                financial: prepared.preDelivery.financial,
                inventory: prepared.preDelivery.inventory,
              }),
            ).toBe(before);
            return;
          }
          const settled = settle(prepared);
          expect(settled.inventory.receipt.outcome).toBe('APPLIED');
          expect(settled.financial.receipt.outcome).toBe('APPLIED');
          expect(
            settled.financial.state.positions
              .find(
                (position) =>
                  position.account.accountId ===
                  prepared.fixture.financialAccounts.buyerTreasury.accountId,
              )
              ?.netDebitBalance.toCanonicalValue().amount ?? '0',
          ).toBe(String(balance - 6));
          expect(
            accountBalance(
              settled.financial.state,
              prepared.fixture.financialAccounts.sellerSettlement.accountId,
            ).toCanonicalValue().amount,
          ).toBe('8');
          expect(
            commodityQuantity(
              settled.inventory.state,
              prepared.fixture.commodity.id,
            ).toCanonicalValue(),
          ).toEqual(
            commodityQuantity(
              prepared.preDelivery.inventory,
              prepared.fixture.commodity.id,
            ).toCanonicalValue(),
          );
        }),
        V10_4_PROPERTY_CONFIG,
      );
    },
    V10_4_PROPERTY_TIMEOUT_MS,
  );

  it(
    'matches the V10 reserve-ship-deliver lifecycle model across repeated and out-of-order commands',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 12 }),
          fc.array(
            fc.constantFrom<V10LifecycleOperation>(
              'RESERVE',
              'SHIP',
              'DELIVER',
            ),
            {
              minLength: 1,
              maxLength: 16,
            },
          ),
          async (buyerBalance, operations) => {
            const fixture = createV10TwoCountryTestFixture();
            const prepared = await preparedDelivery({
              openingSeed: withBuyerTreasuryBalance(
                fixture,
                String(buyerBalance),
              ),
            });
            let phase: V10LifecyclePhase = 'AVAILABLE';
            let states: DeliveryStates = Object.freeze({
              financial: prepared.preDelivery.financial,
              inventory: prepared.fixture.rebuiltLedgers.inventory,
            });

            for (const operation of operations) {
              const before = canonicalSerialize(states);
              const expectedPhase = nextV10LifecyclePhase(
                phase,
                operation,
                buyerBalance,
              );
              let nextStates = states;
              let operationError: unknown = undefined;
              try {
                nextStates = await runV10LifecycleOperation({
                  operation,
                  prepared,
                  states,
                });
              } catch (error) {
                operationError = error;
              }
              const after = canonicalSerialize(nextStates);
              if (expectedPhase === phase) {
                expect(after).toBe(before);
              } else {
                expect(operationError).toBeUndefined();
                expect(after).not.toBe(before);
                states = nextStates;
                phase = expectedPhase;
              }
            }
            expect(
              states.inventory.appliedPostings.length -
                prepared.fixture.rebuiltLedgers.inventory.appliedPostings
                  .length,
            ).toBe(
              phase === 'AVAILABLE'
                ? 0
                : phase === 'RESERVED'
                  ? 1
                  : phase === 'IN_TRANSIT'
                    ? 2
                    : 3,
            );
          },
        ),
        V10_LIFECYCLE_STATE_MACHINE_CONFIG,
      );
    },
    V10_LIFECYCLE_STATE_MACHINE_TIMEOUT_MS,
  );

  it(
    'matches the approval-aware V10 command sequence across out-of-order commands and retries',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.constantFrom<V10ApprovalAwareOperation>(
              'SIGN_SELLER',
              'SIGN_BUYER_TRADE',
              'SIGN_BUYER_FINANCE',
              'REVOKE_BUYER_FINANCE',
              'RESERVE',
              'SHIP',
              'DELIVER',
              'RETRY',
            ),
            { maxLength: 18 },
          ),
          async (noise) => {
            const fixture = createV10TwoCountryTestFixture();
            const transfer = transferCommand();
            let approvals = createNarrowTransferApprovalBundle({
              command: transfer,
              sellerProposalId: proposalId('PROPOSAL_V10_4_SEQUENCE_SELLER'),
              buyerProposalId: proposalId('PROPOSAL_V10_4_SEQUENCE_BUYER'),
              proposalVersion: 'VERSION_1',
            });
            const sellerContext = await approvalContext(
              fixture.officeActors.sellerTrade,
              approvals.seller,
            );
            const buyerTradeContext = await approvalContext(
              fixture.officeActors.buyerTrade,
              approvals.buyer,
            );
            const buyerFinanceAuthority = revocableApprovalContext(
              fixture.officeActors.buyerFinance,
              approvals.buyer,
            );
            const buyerFinanceContext = await buyerFinanceAuthority.authorize();
            const contexts = Object.freeze({
              sellerTrade: Object.freeze({
                actorId: fixture.officeActors.sellerTrade.actorId,
                context: sellerContext,
              }),
              buyerTrade: Object.freeze({
                actorId: fixture.officeActors.buyerTrade.actorId,
                context: buyerTradeContext,
              }),
              buyerFinance: Object.freeze({
                actorId: fixture.officeActors.buyerFinance.actorId,
                context: buyerFinanceContext,
              }),
            });
            const reserve = transition(transfer, '0', '1');
            const shipment = shipmentCommand(transfer);
            const ship = transition(shipment, '1', '2');
            const delivery = deliveryCommand(transfer);
            const deliver = transition(delivery, '2', '3');
            let sellerSigned = false;
            let buyerTradeSigned = false;
            let buyerFinanceSigned = false;
            let buyerFinanceRevoked = false;
            let phase: V10LifecyclePhase = 'AVAILABLE';
            let states: DeliveryStates = Object.freeze({
              financial: fixture.rebuiltLedgers.financial,
              inventory: fixture.rebuiltLedgers.inventory,
            });
            type LifecycleLineageTransition = Parameters<
              typeof rebuildV08LedgersFromLineage
            >[0]['transitions'][number];
            const lineage: LifecycleLineageTransition[] = [];
            const rebuildStates = () => {
              const rebuilt = rebuildV08LedgersFromLineage({
                seed: fixture.openingSeed,
                transitions: lineage,
                sha256Hex,
              });
              states = Object.freeze({
                financial: rebuilt.financial,
                inventory: rebuilt.inventory,
              });
            };

            const reserveTransfer = async () => {
              const result = await reserveNarrowTreasuryGcuTransfer({
                approvals,
                contexts,
                atReal: RESERVED_AT,
                inventoryState: states.inventory,
                source: fixture.inventoryAccounts.sellerAvailable,
                reservationId: inventoryReservationId(
                  'RESERVATION_V10_4_SEQUENCE',
                ),
                postingId: inventoryPostingId('POSTING_V10_4_SEQUENCE_RESERVE'),
                transition: reserve.transition,
                simTime: SimTime.fromTicks('10000'),
                causationEventIds: [reserve.event.eventId],
                sha256Hex,
              });
              if (result.inventory.receipt.outcome === 'APPLIED') {
                lineage.push({
                  command: transfer,
                  transition: reserve.transition,
                  inventoryPostings: [result.posting],
                  financialPostingBatches: [],
                });
              }
              rebuildStates();
            };
            const shipTransfer = () => {
              const source =
                states.inventory.balances.find(
                  (balance) => balance.account.bucket === 'RESERVED',
                )?.account ?? fixture.inventoryAccounts.sellerReserved;
              const result = shipNarrowTreasuryGcuTransfer({
                causationEventIds: [ship.event.eventId],
                inventoryState: states.inventory,
                postingId: inventoryPostingId('POSTING_V10_4_SEQUENCE_SHIP'),
                shipmentCommand: shipment,
                source,
                transferCommand: transfer,
                transition: ship.transition,
                sha256Hex,
              });
              if (result.inventory.receipt.outcome === 'APPLIED') {
                lineage.push({
                  command: shipment,
                  transition: ship.transition,
                  inventoryPostings: [result.posting],
                  financialPostingBatches: [],
                });
              }
              rebuildStates();
            };
            const deliverTransfer = () => {
              const source =
                states.inventory.balances.find(
                  (balance) => balance.account.bucket === 'IN_TRANSIT',
                )?.account ?? fixture.inventoryAccounts.sellerInTransit;
              const result = deliverNarrowTreasuryGcuTransfer({
                buyerTreasury: fixture.financialAccounts.buyerTreasury,
                buyerTreasuryLegId: financialPostingLegId(
                  'LEG_V10_4_SEQUENCE_BUYER',
                ),
                causationEventIds: [deliver.event.eventId],
                deliveryCommand: delivery,
                financialBatchId: financialPostingBatchId(
                  'BATCH_V10_4_SEQUENCE_DELIVERY',
                ),
                financialState: states.financial,
                inventoryPostingId: inventoryPostingId(
                  'POSTING_V10_4_SEQUENCE_DELIVERY',
                ),
                inventoryState: states.inventory,
                sellerSettlement: fixture.financialAccounts.sellerSettlement,
                sellerSettlementLegId: financialPostingLegId(
                  'LEG_V10_4_SEQUENCE_SELLER',
                ),
                source,
                transferCommand: transfer,
                transition: deliver.transition,
                sha256Hex,
              });
              if (result.inventory.receipt.outcome === 'APPLIED') {
                lineage.push({
                  command: delivery,
                  transition: deliver.transition,
                  inventoryPostings: [result.posting],
                  financialPostingBatches: [result.settlement],
                });
              }
              rebuildStates();
            };
            const operations: readonly V10ApprovalAwareOperation[] = [
              ...noise,
              'SIGN_SELLER',
              'SIGN_BUYER_TRADE',
              'SIGN_BUYER_FINANCE',
              'RESERVE',
              'SHIP',
              'DELIVER',
              'RETRY',
            ];

            for (const operation of operations) {
              const before = canonicalSerialize({
                approvals,
                buyerFinanceRevoked,
                states,
              });
              const hasCompleteApproval =
                sellerSigned &&
                buyerTradeSigned &&
                buyerFinanceSigned &&
                !buyerFinanceRevoked;
              const advances =
                (operation === 'SIGN_SELLER' && !sellerSigned) ||
                (operation === 'SIGN_BUYER_TRADE' && !buyerTradeSigned) ||
                (operation === 'SIGN_BUYER_FINANCE' &&
                  !buyerFinanceSigned &&
                  !buyerFinanceRevoked) ||
                (operation === 'REVOKE_BUYER_FINANCE' &&
                  !buyerFinanceRevoked) ||
                (operation === 'RESERVE' &&
                  hasCompleteApproval &&
                  phase === 'AVAILABLE') ||
                (operation === 'SHIP' && phase === 'RESERVED') ||
                (operation === 'DELIVER' && phase === 'IN_TRANSIT');
              let operationError: unknown = undefined;
              try {
                switch (operation) {
                  case 'SIGN_SELLER':
                    approvals = Object.freeze({
                      ...approvals,
                      seller: await signApprovalProposal({
                        proposal: approvals.seller,
                        context: sellerContext,
                        actorId: fixture.officeActors.sellerTrade.actorId,
                        expectedVersion: 'VERSION_1',
                        signedAt: SUBMITTED_AT,
                      }),
                    });
                    break;
                  case 'SIGN_BUYER_TRADE':
                    approvals = Object.freeze({
                      ...approvals,
                      buyer: await signApprovalProposal({
                        proposal: approvals.buyer,
                        context: buyerTradeContext,
                        actorId: fixture.officeActors.buyerTrade.actorId,
                        expectedVersion: 'VERSION_1',
                        signedAt: SUBMITTED_AT,
                      }),
                    });
                    break;
                  case 'SIGN_BUYER_FINANCE':
                    approvals = Object.freeze({
                      ...approvals,
                      buyer: await signApprovalProposal({
                        proposal: approvals.buyer,
                        context: buyerFinanceContext,
                        actorId: fixture.officeActors.buyerFinance.actorId,
                        expectedVersion: 'VERSION_1',
                        signedAt: SUBMITTED_AT,
                      }),
                    });
                    break;
                  case 'REVOKE_BUYER_FINANCE':
                    buyerFinanceAuthority.revoke();
                    buyerFinanceRevoked = true;
                    break;
                  case 'RESERVE':
                    await reserveTransfer();
                    break;
                  case 'SHIP':
                    shipTransfer();
                    break;
                  case 'DELIVER':
                    deliverTransfer();
                    break;
                  case 'RETRY':
                    if (phase === 'RESERVED') await reserveTransfer();
                    if (phase === 'IN_TRANSIT') shipTransfer();
                    if (phase === 'DELIVERED') deliverTransfer();
                    break;
                }
              } catch (error) {
                operationError = error;
              }
              const after = canonicalSerialize({
                approvals,
                buyerFinanceRevoked,
                states,
              });
              if (!advances) {
                expect(after).toBe(before);
              } else {
                expect(operationError).toBeUndefined();
                expect(after).not.toBe(before);
                if (operation === 'SIGN_SELLER') sellerSigned = true;
                if (operation === 'SIGN_BUYER_TRADE') buyerTradeSigned = true;
                if (operation === 'SIGN_BUYER_FINANCE')
                  buyerFinanceSigned = true;
                if (operation === 'RESERVE') phase = 'RESERVED';
                if (operation === 'SHIP') phase = 'IN_TRANSIT';
                if (operation === 'DELIVER') phase = 'DELIVERED';
              }
            }

            if (buyerFinanceRevoked && phase === 'AVAILABLE') {
              expect(states.inventory).toEqual(
                fixture.rebuiltLedgers.inventory,
              );
            } else {
              expect(phase).toBe('DELIVERED');
              expect(states.inventory.appliedPostings).toHaveLength(
                fixture.rebuiltLedgers.inventory.appliedPostings.length + 3,
              );
              expect(
                accountBalance(
                  states.financial,
                  fixture.financialAccounts.buyerTreasury.accountId,
                ).toCanonicalValue().amount,
              ).toBe('2');
            }
          },
        ),
        V10_APPROVAL_AWARE_SEQUENCE_CONFIG,
      );
    },
    V10_APPROVAL_AWARE_SEQUENCE_TIMEOUT_MS,
  );

  it('rejects Reserve when a previously signed Office loses current authority', async () => {
    const fixture = createV10TwoCountryTestFixture();
    const transfer = transferCommand();
    const initial = createNarrowTransferApprovalBundle({
      command: transfer,
      sellerProposalId: proposalId('PROPOSAL_V10_4_REVOKED_SELLER'),
      buyerProposalId: proposalId('PROPOSAL_V10_4_REVOKED_BUYER'),
      proposalVersion: 'VERSION_1',
    });
    const seller = revocableApprovalContext(
      fixture.officeActors.sellerTrade,
      initial.seller,
    );
    const buyerTrade = revocableApprovalContext(
      fixture.officeActors.buyerTrade,
      initial.buyer,
    );
    const buyerFinance = revocableApprovalContext(
      fixture.officeActors.buyerFinance,
      initial.buyer,
    );
    const sellerContext = await seller.authorize();
    const buyerTradeContext = await buyerTrade.authorize();
    const buyerFinanceContext = await buyerFinance.authorize();
    const signedSeller = await signApprovalProposal({
      proposal: initial.seller,
      context: sellerContext,
      actorId: fixture.officeActors.sellerTrade.actorId,
      expectedVersion: 'VERSION_1',
      signedAt: SUBMITTED_AT,
    });
    let signedBuyer = await signApprovalProposal({
      proposal: initial.buyer,
      context: buyerTradeContext,
      actorId: fixture.officeActors.buyerTrade.actorId,
      expectedVersion: 'VERSION_1',
      signedAt: SUBMITTED_AT,
    });
    signedBuyer = await signApprovalProposal({
      proposal: signedBuyer,
      context: buyerFinanceContext,
      actorId: fixture.officeActors.buyerFinance.actorId,
      expectedVersion: 'VERSION_1',
      signedAt: SUBMITTED_AT,
    });
    buyerFinance.revoke();
    const reserve = transition(transfer, '0', '1');
    const before = canonicalSerialize(fixture.rebuiltLedgers.inventory);

    await expect(
      reserveNarrowTreasuryGcuTransfer({
        approvals: Object.freeze({
          ...initial,
          seller: signedSeller,
          buyer: signedBuyer,
        }),
        contexts: Object.freeze({
          sellerTrade: Object.freeze({
            actorId: fixture.officeActors.sellerTrade.actorId,
            context: sellerContext,
          }),
          buyerTrade: Object.freeze({
            actorId: fixture.officeActors.buyerTrade.actorId,
            context: buyerTradeContext,
          }),
          buyerFinance: Object.freeze({
            actorId: fixture.officeActors.buyerFinance.actorId,
            context: buyerFinanceContext,
          }),
        }),
        atReal: RESERVED_AT,
        inventoryState: fixture.rebuiltLedgers.inventory,
        source: fixture.inventoryAccounts.sellerAvailable,
        reservationId: inventoryReservationId('RESERVATION_V10_4_REVOKED'),
        postingId: inventoryPostingId('POSTING_V10_4_REVOKED'),
        transition: reserve.transition,
        simTime: SimTime.fromTicks('10000'),
        causationEventIds: [reserve.event.eventId],
        sha256Hex,
      }),
    ).rejects.toMatchObject({ code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED });
    expect(canonicalSerialize(fixture.rebuiltLedgers.inventory)).toBe(before);
  });

  it('binds the applied delivery to one automatic atomic draft, receipt, and outbox fact', async () => {
    const prepared = await preparedDelivery();
    const lease = acquireWorldWriterLease(
      null,
      worldWriterLeaseRequest(
        prepared.delivery.worldId,
        workerId('WORKER_V10_4_LOCAL'),
        '2026-09-14T00:02:00.000Z',
        '2026-09-14T00:07:00.000Z',
      ),
    ).lease;
    const commitAssertion = createWorldWriterCommitAssertion(lease, '2');
    const result = prepareNarrowTreasuryGcuDeliveryAtomicDraft({
      buyerTreasury: prepared.fixture.financialAccounts.buyerTreasury,
      buyerTreasuryLegId: financialPostingLegId('LEG_V10_4_DRAFT_BUYER'),
      commitAssertion,
      deliveryCommand: prepared.delivery,
      eventId: 'EVENT_V10_4_DELIVERY_DRAFT',
      eventSequence: '3',
      financialBatchId: financialPostingBatchId('BATCH_V10_4_DRAFT_DELIVERY'),
      financialState: prepared.preDelivery.financial,
      inventoryPostingId: inventoryPostingId('POSTING_V10_4_DRAFT_DELIVERY'),
      inventoryState: prepared.preDelivery.inventory,
      observedAtReal: '2026-09-14T00:02:00.000Z',
      outboxMessageId: 'OUTBOX_V10_4_DELIVERY_DRAFT',
      sellerSettlement: prepared.fixture.financialAccounts.sellerSettlement,
      sellerSettlementLegId: financialPostingLegId('LEG_V10_4_DRAFT_SELLER'),
      source: prepared.source,
      transferCommand: prepared.transfer,
      sha256Hex,
    });
    const candidate = prepareAtomicTransitionCandidate({
      command: prepared.delivery,
      commitAuthorization: null,
      draft: result.draft,
      sha256Hex,
    });

    expect(candidate.authorityKind).toBe('VERSIONED_AUTOMATIC');
    expect(candidate.receipt.outcome).toBe('COMMITTED');
    expect(candidate.inventoryPostings).toHaveLength(1);
    expect(candidate.financialPostingBatches).toHaveLength(1);
    expect(candidate.outboxMessages).toHaveLength(1);
    expect(candidate.outboxMessages[0]?.eventId).toBe(
      candidate.transition.eventIds[0],
    );

    const factory = createNarrowTreasuryGcuDeliveryCandidateFactory({
      sha256Hex,
      source: {
        async load({ deliveryCommand, observedAtReal }) {
          expect(deliveryCommand).toBe(prepared.delivery);
          expect(observedAtReal).toBe('2026-09-14T00:02:00.000Z');
          return {
            buyerTreasury: prepared.fixture.financialAccounts.buyerTreasury,
            buyerTreasuryLegId: financialPostingLegId('LEG_V10_4_DRAFT_BUYER'),
            commitAssertion,
            eventId: 'EVENT_V10_4_DELIVERY_DRAFT',
            eventSequence: '3',
            financialBatchId: financialPostingBatchId(
              'BATCH_V10_4_DRAFT_DELIVERY',
            ),
            financialState: prepared.preDelivery.financial,
            inventoryPostingId: inventoryPostingId(
              'POSTING_V10_4_DRAFT_DELIVERY',
            ),
            inventoryState: prepared.preDelivery.inventory,
            observedAtReal: '2026-09-14T00:02:00.000Z',
            outboxMessageId: 'OUTBOX_V10_4_DELIVERY_DRAFT',
            sellerSettlement:
              prepared.fixture.financialAccounts.sellerSettlement,
            sellerSettlementLegId: financialPostingLegId(
              'LEG_V10_4_DRAFT_SELLER',
            ),
            source: prepared.source,
            transferCommand: prepared.transfer,
          };
        },
      },
    });
    await expect(
      factory.prepare({
        command: prepared.delivery,
        commitAuthorization: null,
        observedAtReal: '2026-09-14T00:02:00.000Z',
      }),
    ).resolves.toEqual(result.draft);
  });

  it('rejects a fixture-backed opening seed before SQL delivery preparation reads any caller state', async () => {
    const prepared = await preparedDelivery();
    const database = await atomicDatabase();
    try {
      const opening = prepared.fixture.openingSeed;
      const { fingerprint: _fingerprint, ...openingIntent } = opening;
      void _fingerprint;
      await database.query(
        `insert into world_v2.world_head (world_id, world_version, event_sequence)
         values ($1, 0, 0)`,
        [opening.worldId],
      );
      await database.query(
        `insert into world_v2.opening_seed
           (world_id, seed_id, opening_world_version, replay_binding,
            canonical_payload, seed_fingerprint, bootstrapped_at_real)
         values ($1, $2, 0, $3, $4, $5, $6)`,
        [
          opening.worldId,
          opening.seedId,
          canonicalSerialize(opening.replayBinding),
          canonicalSerialize(openingIntent),
          opening.fingerprint,
          '2026-09-14T00:00:00.000Z',
        ],
      );
      const source = new SqlNarrowTreasuryGcuDeliveryPreparationSource({
        database,
        sha256Hex,
        workerId: 'WORKER_V10_4_SOURCE',
      });
      await expect(
        source.load({
          deliveryCommand: prepared.delivery,
          observedAtReal: '2026-09-14T00:02:00.000Z',
        }),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: expect.stringContaining('TEST_FIXTURE'),
        }),
      });
    } finally {
      await database.close();
    }
  });

  it('prepares delivery solely from durable seed, lineage, lease, and deterministic IDs', async () => {
    const fixture = createV10TwoCountryTestFixture();
    const opening = serverOpeningSeed(fixture.openingSeed);
    const prepared = await preparedDelivery({ openingSeed: opening });
    const database = await atomicDatabase();
    try {
      const { fingerprint: _fingerprint, ...openingIntent } = opening;
      void _fingerprint;
      await database.query(
        `insert into world_v2.world_head (world_id, world_version, event_sequence)
         values ($1, 0, 0)`,
        [opening.worldId],
      );
      await database.query(
        `insert into world_v2.opening_seed
           (world_id, seed_id, opening_world_version, replay_binding,
            canonical_payload, seed_fingerprint, bootstrapped_at_real)
         values ($1, $2, 0, $3, $4, $5, $6)`,
        [
          opening.worldId,
          opening.seedId,
          canonicalSerialize(opening.replayBinding),
          canonicalSerialize(openingIntent),
          opening.fingerprint,
          '2026-09-14T00:00:00.000Z',
        ],
      );
      for (const command of [
        prepared.transfer,
        prepared.shipment,
        prepared.delivery,
      ]) {
        await persistCommand(database, command);
      }
      await persistTransitionFact(
        database,
        transition(prepared.transfer, '0', '1').event,
        prepared.reservationPosting,
      );
      await persistTransitionFact(
        database,
        transition(prepared.shipment, '1', '2').event,
        prepared.shipmentPosting,
      );
      await database.query(
        `update world_v2.world_head
            set world_version = 2, event_sequence = 2
          where world_id = $1`,
        [opening.worldId],
      );
      await database.query(
        `select * from world_v2.acquire_world_writer_lease($1, $2, $3, $4)`,
        [
          opening.worldId,
          'WORKER_V10_4_SOURCE',
          '2026-09-14T00:02:00.000Z',
          '300000',
        ],
      );
      const source = new SqlNarrowTreasuryGcuDeliveryPreparationSource({
        database,
        sha256Hex,
        workerId: 'WORKER_V10_4_SOURCE',
      });
      const loaded = await source.load({
        deliveryCommand: prepared.delivery,
        observedAtReal: '2026-09-14T00:02:00.000Z',
      });
      expect(loaded.commitAssertion).toMatchObject({
        expectedWorldVersion: '2',
        fencingToken: '1',
        holderId: 'WORKER_V10_4_SOURCE',
      });
      expect(loaded.eventSequence).toBe('3');
      expect(loaded.eventId).toBe(
        `DELIVERY_EVENT_${prepared.delivery.commandId}`,
      );
      expect(loaded.source).toEqual(prepared.source);
      expect(loaded.financialState).toEqual(prepared.preDelivery.financial);
      expect(loaded.inventoryState).toEqual(prepared.preDelivery.inventory);
      const draft = await createSqlNarrowTreasuryGcuDeliveryCandidateFactory({
        database,
        sha256Hex,
        workerId: 'WORKER_V10_4_SOURCE',
      }).prepare({
        command: prepared.delivery,
        commitAuthorization: null,
        observedAtReal: '2026-09-14T00:02:00.000Z',
      });
      expect(draft.transition.worldVersionBefore).toBe('2');
      expect(draft.transition.worldVersionAfter).toBe('3');
      expect(draft.outboxMessages[0]?.eventId).toBe(
        `DELIVERY_EVENT_${prepared.delivery.commandId}`,
      );
    } finally {
      await database.close();
    }
  });

  it('commits the delivery draft atomically in an isolated database and returns the durable receipt on retry', async () => {
    const prepared = await preparedDelivery();
    const lease = acquireWorldWriterLease(
      null,
      worldWriterLeaseRequest(
        prepared.delivery.worldId,
        workerId('WORKER_V10_4_ATOMIC'),
        '2026-09-14T00:02:00.000Z',
        '2026-09-14T00:07:00.000Z',
      ),
    ).lease;
    const draft = prepareNarrowTreasuryGcuDeliveryAtomicDraft({
      buyerTreasury: prepared.fixture.financialAccounts.buyerTreasury,
      buyerTreasuryLegId: financialPostingLegId('LEG_V10_4_ATOMIC_BUYER'),
      commitAssertion: createWorldWriterCommitAssertion(lease, '2'),
      deliveryCommand: prepared.delivery,
      eventId: 'EVENT_V10_4_ATOMIC_DELIVERY',
      eventSequence: '3',
      financialBatchId: financialPostingBatchId('BATCH_V10_4_ATOMIC_DELIVERY'),
      financialState: prepared.preDelivery.financial,
      inventoryPostingId: inventoryPostingId('POSTING_V10_4_ATOMIC_DELIVERY'),
      inventoryState: prepared.preDelivery.inventory,
      observedAtReal: '2026-09-14T00:02:00.000Z',
      outboxMessageId: 'OUTBOX_V10_4_ATOMIC_DELIVERY',
      sellerSettlement: prepared.fixture.financialAccounts.sellerSettlement,
      sellerSettlementLegId: financialPostingLegId('LEG_V10_4_ATOMIC_SELLER'),
      source: prepared.source,
      transferCommand: prepared.transfer,
      sha256Hex,
    }).draft;
    const candidate = prepareAtomicTransitionCandidate({
      command: prepared.delivery,
      commitAuthorization: null,
      draft,
      sha256Hex,
    });
    const failingDatabase = await atomicDatabase();
    try {
      await seedAtomicDelivery(failingDatabase, candidate);
      const failingRepository = new AtomicTransitionRepository({
        database: failingDatabase as SqlDatabase,
        authorizationGuard: automaticCommitGuard,
        faultInjector: {
          hit(checkpoint) {
            if (checkpoint === 'AFTER_FINANCIAL_POSTINGS') {
              throw new Error('INJECTED_V10_4_AFTER_FINANCIAL_POSTINGS');
            }
          },
        },
        workerId: 'WORKER_V10_4_ATOMIC',
        sha256Hex,
      });
      await expect(failingRepository.commit(candidate)).rejects.toThrow(
        'transaction rolled back',
      );
      const rolledBack = await failingDatabase.query<{
        readonly event_count: string;
        readonly financial_count: string;
        readonly inventory_count: string;
        readonly materialization_count: string;
        readonly outbox_count: string;
        readonly receipt_count: string;
        readonly world_version: string;
      }>(
        `select
           (select count(*)::text from world_v2.authoritative_event) as event_count,
           (select count(*)::text from world_v2.inventory_posting) as inventory_count,
           (select count(*)::text from world_v2.financial_posting_batch) as financial_count,
           (select count(*)::text from world_v2.notification_outbox) as outbox_count,
           (select count(*)::text from world_v2.command_receipt) as receipt_count,
           (select world_version::text from world_v2.world_head) as world_version`,
      );
      expect(rolledBack.rows[0]).toEqual({
        event_count: '0',
        financial_count: '0',
        inventory_count: '0',
        outbox_count: '0',
        receipt_count: '0',
        world_version: '2',
      });
    } finally {
      await failingDatabase.close();
    }
    const database = await atomicDatabase();
    try {
      await seedAtomicDelivery(database, candidate);
      const repository = new AtomicTransitionRepository({
        database: database as SqlDatabase,
        authorizationGuard: automaticCommitGuard,
        workerId: 'WORKER_V10_4_ATOMIC',
        sha256Hex,
      });
      await expect(repository.commit(candidate)).resolves.toMatchObject({
        source: 'NEW_COMMIT',
        receipt: { outcome: 'COMMITTED' },
      });
      await expect(repository.commit(candidate)).resolves.toMatchObject({
        source: 'EXISTING_COMMIT',
        receipt: { outcome: 'COMMITTED' },
      });
      const persisted = await database.query<{
        readonly event_count: string;
        readonly financial_count: string;
        readonly inventory_count: string;
        readonly outbox_count: string;
        readonly queue_state: string;
        readonly receipt_count: string;
        readonly world_version: string;
      }>(
        `select
           (select count(*)::text from world_v2.authoritative_event) as event_count,
           (select count(*)::text from world_v2.inventory_posting) as inventory_count,
           (select count(*)::text from world_v2.financial_posting_batch) as financial_count,
           (select count(*)::text from world_v2.notification_outbox) as outbox_count,
           (select count(*)::text from world_v2.command_receipt) as receipt_count,
           (select count(*)::text from world_v2.current_materialization) as materialization_count,
           (select queue_state from world_v2.command_queue) as queue_state,
           (select world_version::text from world_v2.world_head) as world_version`,
      );
      expect(persisted.rows[0]).toEqual({
        event_count: '1',
        financial_count: '1',
        inventory_count: '1',
        materialization_count: '1',
        outbox_count: '1',
        queue_state: 'FINALIZED',
        receipt_count: '1',
        world_version: '3',
      });
      const recovery = new WorldRecoveryCoordinator({
        database: database as SqlDatabase,
        workerId: 'WORKER_V10_4_ATOMIC',
      });
      const failedDelivery = new NarrowTreasuryGcuDeliveryOutboxConsumer({
        consumerId: 'V10_4_LOCAL_DELIVERY',
        database: database as SqlDatabase,
        sha256Hex,
        sink: {
          async deliver() {
            throw new Error('INJECTED_DELIVERY_SINK_FAILURE');
          },
        },
      });
      await expect(
        failedDelivery.dispatch({
          worldId: prepared.delivery.worldId,
          messageId: 'OUTBOX_V10_4_ATOMIC_DELIVERY',
          attemptedAtReal: '2026-09-14T00:03:00.000Z',
          retryProcessingBeforeReal: null,
        }),
      ).resolves.toEqual({ disposition: 'RETRY_PENDING', attemptCount: '1' });
      const delivered = vi.fn(async () => undefined);
      const successfulDelivery = new NarrowTreasuryGcuDeliveryOutboxConsumer({
        consumerId: 'V10_4_LOCAL_DELIVERY',
        database: database as SqlDatabase,
        sha256Hex,
        sink: { deliver: delivered },
      });
      await expect(
        successfulDelivery.dispatch({
          worldId: prepared.delivery.worldId,
          messageId: 'OUTBOX_V10_4_ATOMIC_DELIVERY',
          attemptedAtReal: '2026-09-14T00:04:00.000Z',
          retryProcessingBeforeReal: null,
        }),
      ).resolves.toEqual({ disposition: 'DELIVERED', attemptCount: '2' });
      expect(delivered).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'EVENT_V10_4_ATOMIC_DELIVERY',
          idempotencyKey: 'EVENT_V10_4_ATOMIC_DELIVERY',
        }),
      );
      await expect(
        successfulDelivery.dispatch({
          worldId: prepared.delivery.worldId,
          messageId: 'OUTBOX_V10_4_ATOMIC_DELIVERY',
          attemptedAtReal: '2026-09-14T00:05:00.000Z',
          retryProcessingBeforeReal: null,
        }),
      ).resolves.toEqual({
        disposition: 'ALREADY_DELIVERED',
        attemptCount: '2',
      });
      expect(delivered).toHaveBeenCalledTimes(1);
      const projectionBefore = await database.query<{
        readonly canonical_payload: string;
        readonly payload_sha256: string;
      }>(
        `select canonical_payload, payload_sha256
           from world_v2.current_materialization
          where world_id = $1
            and materialization_key = 'NARROW_TREASURY_GCU_DELIVERY'`,
        [prepared.delivery.worldId],
      );
      await expect(
        recovery.rebuildCurrentMaterializations({
          assertion: createWorldWriterCommitAssertion(lease, '3'),
          observedAtReal: '2026-09-14T00:06:00.000Z',
          rebuilder: new NarrowTreasuryGcuDeliveryProjectionRebuilder({
            sha256Hex,
          }),
        }),
      ).resolves.toBe(1);
      const projectionAfter = await database.query<{
        readonly canonical_payload: string;
        readonly payload_sha256: string;
      }>(
        `select canonical_payload, payload_sha256
           from world_v2.current_materialization
          where world_id = $1
            and materialization_key = 'NARROW_TREASURY_GCU_DELIVERY'`,
        [prepared.delivery.worldId],
      );
      expect(projectionAfter.rows).toEqual(projectionBefore.rows);
    } finally {
      await database.close();
    }
  }, 30_000);
});

describe('V10.4 durable Reserve authorization evidence', () => {
  it('commits Reserve once only with current server-held approval and authorization', async () => {
    const database = await atomicDatabase();
    try {
      const prepared = await preparedDelivery();
      const candidate = await atomicReserveCandidate({ prepared });
      const approvals = await seedAtomicReserve(database, {
        candidate,
        prepared,
      });
      const repository = new AtomicTransitionRepository({
        database: database as SqlDatabase,
        authorizationGuard: createTransactionCutoffAuthorizationGuard(),
        narrowTransferApprovalGuard: approvals,
        workerId: 'WORKER_V10_4_CONCURRENT',
        sha256Hex,
      });
      await expect(repository.commit(candidate)).resolves.toMatchObject({
        source: 'NEW_COMMIT',
        receipt: { outcome: 'COMMITTED' },
      });
      const persisted = await database.query<{
        readonly approval_signature_count: string;
        readonly event_count: string;
        readonly finalized_count: string;
        readonly financial_count: string;
        readonly inventory_count: string;
        readonly proposal_count: string;
        readonly receipt_count: string;
        readonly world_version: string;
      }>(
        `select
           (select count(*)::text from world_v2.authoritative_event) as event_count,
           (select count(*)::text from world_v2.inventory_posting) as inventory_count,
           (select count(*)::text from world_v2.financial_posting_batch) as financial_count,
           (select count(*)::text from world_v2.command_receipt) as receipt_count,
           (select count(*)::text from world_v2.command_queue where queue_state = 'FINALIZED') as finalized_count,
           (select count(*)::text from world_v2.narrow_transfer_proposal) as proposal_count,
           (select count(*)::text from world_v2.narrow_transfer_approval_signature) as approval_signature_count,
           (select world_version::text from world_v2.world_head) as world_version`,
      );
      expect(persisted.rows[0]).toEqual({
        approval_signature_count: '3',
        event_count: '1',
        finalized_count: '1',
        financial_count: '0',
        inventory_count: '1',
        proposal_count: '2',
        receipt_count: '1',
        world_version: '1',
      });
    } finally {
      await database.close();
    }
  }, 30_000);

  it('leaves Reserve uncommitted when a signed Finance authority is revoked at the cutoff', async () => {
    const database = await atomicDatabase();
    try {
      const prepared = await preparedDelivery();
      const candidate = await atomicReserveCandidate({ prepared });
      const approvals = await seedAtomicReserve(database, {
        candidate,
        prepared,
      });
      await database.query(
        `update world_v2.current_commit_authorization
            set active = false
          where world_id = $1
            and auth_subject = $2::uuid
            and country_id = $3
            and office_id = 'FINANCE'
            and capability = 'FINANCE_TREASURY'`,
        [
          prepared.transfer.worldId,
          prepared.fixture.officeActors.buyerFinance.principal.authSubject,
          prepared.fixture.countries.buyer,
        ],
      );
      const repository = new AtomicTransitionRepository({
        database: database as SqlDatabase,
        authorizationGuard: createTransactionCutoffAuthorizationGuard(),
        narrowTransferApprovalGuard: approvals,
        workerId: 'WORKER_V10_4_CONCURRENT',
        sha256Hex,
      });
      await expect(repository.commit(candidate)).rejects.toMatchObject({
        cause: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
      });
      const persisted = await database.query<{
        readonly event_count: string;
        readonly inventory_count: string;
        readonly queue_state: string;
        readonly receipt_count: string;
        readonly world_version: string;
      }>(
        `select
           (select count(*)::text from world_v2.authoritative_event) as event_count,
           (select count(*)::text from world_v2.inventory_posting) as inventory_count,
           (select count(*)::text from world_v2.command_receipt) as receipt_count,
           (select queue_state from world_v2.command_queue where world_id = $1 and command_id = $2) as queue_state,
           (select world_version::text from world_v2.world_head where world_id = $1) as world_version`,
        [candidate.command.worldId, candidate.command.commandId],
      );
      expect(persisted.rows[0]).toEqual({
        event_count: '0',
        inventory_count: '0',
        queue_state: 'CLAIMED',
        receipt_count: '0',
        world_version: '0',
      });
    } finally {
      await database.close();
    }
  }, 30_000);
});

postgresDescribe('V10.4 disposable PostgreSQL contention evidence', () => {
  it('commits exactly one competing delivery at the same WorldVersion', async () => {
    const database = await atomicDatabase();
    try {
      const prepared = await preparedDelivery();
      const primary = atomicDeliveryCandidate({
        delivery: prepared.delivery,
        prepared,
        suffix: 'PRIMARY',
      });
      const contender = atomicDeliveryCandidate({
        delivery: deliveryCommand(prepared.transfer, 'CONTENDER'),
        prepared,
        suffix: 'CONTENDER',
      });
      await seedAtomicDeliveries(database, [primary, contender]);
      const repository = () =>
        new AtomicTransitionRepository({
          database: database as SqlDatabase,
          authorizationGuard: automaticCommitGuard,
          workerId: 'WORKER_V10_4_CONCURRENT',
          sha256Hex,
        });

      const outcomes = await Promise.allSettled([
        repository().commit(primary),
        repository().commit(contender),
      ]);
      expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.some(
          (outcome) =>
            outcome.status === 'fulfilled' &&
            outcome.value.source === 'NEW_COMMIT',
        ),
      ).toBe(true);
      expect(
        outcomes.filter((outcome) => outcome.status === 'rejected'),
      ).toHaveLength(1);

      const persisted = await database.query<{
        readonly event_count: string;
        readonly financial_count: string;
        readonly finalized_count: string;
        readonly inventory_count: string;
        readonly outbox_count: string;
        readonly pending_claim_count: string;
        readonly receipt_count: string;
        readonly world_version: string;
      }>(
        `select
           (select count(*)::text from world_v2.authoritative_event) as event_count,
           (select count(*)::text from world_v2.inventory_posting) as inventory_count,
           (select count(*)::text from world_v2.financial_posting_batch) as financial_count,
           (select count(*)::text from world_v2.notification_outbox) as outbox_count,
           (select count(*)::text from world_v2.command_receipt) as receipt_count,
           (select count(*)::text from world_v2.command_queue where queue_state = 'FINALIZED') as finalized_count,
           (select count(*)::text from world_v2.command_queue where queue_state = 'CLAIMED') as pending_claim_count,
           (select world_version::text from world_v2.world_head) as world_version`,
      );
      expect(persisted.rows[0]).toEqual({
        event_count: '1',
        financial_count: '1',
        finalized_count: '1',
        inventory_count: '1',
        outbox_count: '1',
        pending_claim_count: '1',
        receipt_count: '1',
        world_version: '3',
      });
    } finally {
      await database.close();
    }
  }, 30_000);
});

postgresDescribe('V10.4 disposable PostgreSQL restart evidence', () => {
  it('rolls back a faulted delivery before a reconnected Worker commits it', async () => {
    const database = await atomicDatabase();
    let initialDatabaseClosed = false;
    try {
      const prepared = await preparedDelivery();
      const candidate = atomicDeliveryCandidate({
        delivery: prepared.delivery,
        prepared,
        suffix: 'RESTART',
      });
      await seedAtomicDelivery(database, candidate);
      const faultingRepository = new AtomicTransitionRepository({
        database: database as SqlDatabase,
        authorizationGuard: automaticCommitGuard,
        faultInjector: {
          hit(checkpoint) {
            if (checkpoint === 'AFTER_FINANCIAL_POSTINGS') {
              throw new Error('INJECTED_V10_4_RESTART_AFTER_FINANCIAL');
            }
          },
        },
        workerId: 'WORKER_V10_4_CONCURRENT',
        sha256Hex,
      });
      await expect(faultingRepository.commit(candidate)).rejects.toThrow(
        'transaction rolled back',
      );
      await database.close();
      initialDatabaseClosed = true;

      const restartedDatabase = createLocalPostgresV09AtomicTestDatabase();
      try {
        const restartedRepository = new AtomicTransitionRepository({
          database: restartedDatabase as SqlDatabase,
          authorizationGuard: automaticCommitGuard,
          workerId: 'WORKER_V10_4_CONCURRENT',
          sha256Hex,
        });
        await expect(
          restartedRepository.commit(candidate),
        ).resolves.toMatchObject({
          source: 'NEW_COMMIT',
          receipt: { outcome: 'COMMITTED' },
        });
        const persisted = await restartedDatabase.query<{
          readonly event_count: string;
          readonly financial_count: string;
          readonly inventory_count: string;
          readonly outbox_count: string;
          readonly receipt_count: string;
          readonly world_version: string;
        }>(
          `select
             (select count(*)::text from world_v2.authoritative_event) as event_count,
             (select count(*)::text from world_v2.inventory_posting) as inventory_count,
             (select count(*)::text from world_v2.financial_posting_batch) as financial_count,
             (select count(*)::text from world_v2.notification_outbox) as outbox_count,
             (select count(*)::text from world_v2.command_receipt) as receipt_count,
             (select world_version::text from world_v2.world_head) as world_version`,
        );
        expect(persisted.rows[0]).toEqual({
          event_count: '1',
          financial_count: '1',
          inventory_count: '1',
          outbox_count: '1',
          receipt_count: '1',
          world_version: '3',
        });
      } finally {
        await restartedDatabase.close();
      }
    } finally {
      if (!initialDatabaseClosed) await database.close();
    }
  }, 30_000);

  it('recovers the reserved-to-delivered automatic sequence after a Ship rollback', async () => {
    const database = await atomicDatabase();
    let initialDatabaseClosed = false;
    try {
      const prepared = await preparedDelivery();
      const shipment = atomicShipmentCandidate({
        prepared,
        suffix: 'RESTART_LIFECYCLE_SHIP',
      });
      const delivery = atomicDeliveryCandidate({
        delivery: prepared.delivery,
        prepared,
        suffix: 'RESTART_LIFECYCLE_DELIVERY',
      });
      await seedReservedAutomaticLifecycle(database, { prepared, shipment });
      const faultingRepository = new AtomicTransitionRepository({
        database: database as SqlDatabase,
        authorizationGuard: automaticCommitGuard,
        faultInjector: {
          hit(checkpoint) {
            if (checkpoint === 'AFTER_INVENTORY_POSTINGS') {
              throw new Error('INJECTED_V10_4_SHIP_RESTART_AFTER_INVENTORY');
            }
          },
        },
        workerId: 'WORKER_V10_4_CONCURRENT',
        sha256Hex,
      });
      await expect(faultingRepository.commit(shipment)).rejects.toThrow(
        'transaction rolled back',
      );
      await database.close();
      initialDatabaseClosed = true;

      const restartedDatabase = createLocalPostgresV09AtomicTestDatabase();
      try {
        const repository = new AtomicTransitionRepository({
          database: restartedDatabase as SqlDatabase,
          authorizationGuard: automaticCommitGuard,
          workerId: 'WORKER_V10_4_CONCURRENT',
          sha256Hex,
        });
        await expect(repository.commit(shipment)).resolves.toMatchObject({
          source: 'NEW_COMMIT',
          receipt: { outcome: 'COMMITTED' },
        });
        await seedClaimedAtomicCandidate(restartedDatabase, delivery);
        await expect(repository.commit(delivery)).resolves.toMatchObject({
          source: 'NEW_COMMIT',
          receipt: { outcome: 'COMMITTED' },
        });
        const persisted = await restartedDatabase.query<{
          readonly event_count: string;
          readonly financial_count: string;
          readonly finalized_count: string;
          readonly inventory_count: string;
          readonly outbox_count: string;
          readonly receipt_count: string;
          readonly world_version: string;
        }>(
          `select
             (select count(*)::text from world_v2.authoritative_event) as event_count,
             (select count(*)::text from world_v2.inventory_posting) as inventory_count,
             (select count(*)::text from world_v2.financial_posting_batch) as financial_count,
             (select count(*)::text from world_v2.notification_outbox) as outbox_count,
             (select count(*)::text from world_v2.command_receipt) as receipt_count,
             (select count(*)::text from world_v2.command_queue where queue_state = 'FINALIZED') as finalized_count,
             (select world_version::text from world_v2.world_head) as world_version`,
        );
        expect(persisted.rows[0]).toEqual({
          event_count: '3',
          financial_count: '1',
          finalized_count: '2',
          inventory_count: '3',
          outbox_count: '1',
          receipt_count: '3',
          world_version: '3',
        });
      } finally {
        await restartedDatabase.close();
      }
    } finally {
      if (!initialDatabaseClosed) await database.close();
    }
  }, 30_000);
});

postgresDescribe('V10.4 disposable PostgreSQL acknowledgement evidence', () => {
  it('recovers the durable receipt when a committed response is lost', async () => {
    const database = await atomicDatabase();
    try {
      const prepared = await preparedDelivery();
      const candidate = atomicDeliveryCandidate({
        delivery: prepared.delivery,
        prepared,
        suffix: 'ACK_LOST',
      });
      await seedAtomicDelivery(database, candidate);
      const responseLostDatabase: SqlDatabase = {
        query: database.query,
        async transaction(operation) {
          await database.transaction(operation);
          throw new V09TransactionCommitUnknownError(
            new Error('INJECTED_V10_4_POST_COMMIT_RESPONSE_LOST'),
          );
        },
      };
      const repository = new AtomicTransitionRepository({
        database: responseLostDatabase,
        authorizationGuard: automaticCommitGuard,
        workerId: 'WORKER_V10_4_CONCURRENT',
        sha256Hex,
      });
      await expect(repository.commit(candidate)).resolves.toMatchObject({
        source: 'RECOVERED_AFTER_UNKNOWN_ACKNOWLEDGEMENT',
        receipt: { outcome: 'COMMITTED' },
      });
      const persisted = await database.query<{
        readonly event_count: string;
        readonly financial_count: string;
        readonly inventory_count: string;
        readonly outbox_count: string;
        readonly receipt_count: string;
        readonly world_version: string;
      }>(
        `select
           (select count(*)::text from world_v2.authoritative_event) as event_count,
           (select count(*)::text from world_v2.inventory_posting) as inventory_count,
           (select count(*)::text from world_v2.financial_posting_batch) as financial_count,
           (select count(*)::text from world_v2.notification_outbox) as outbox_count,
           (select count(*)::text from world_v2.command_receipt) as receipt_count,
           (select world_version::text from world_v2.world_head) as world_version`,
      );
      expect(persisted.rows[0]).toEqual({
        event_count: '1',
        financial_count: '1',
        inventory_count: '1',
        outbox_count: '1',
        receipt_count: '1',
        world_version: '3',
      });
    } finally {
      await database.close();
    }
  }, 30_000);
});

processKillChildDescribe(
  'V10.4 disposable PostgreSQL process-kill fixture',
  () => {
    it('terminates the Worker at the configured atomic checkpoint', async () => {
      const checkpoint = process.env.V10_PROCESS_KILL_CHECKPOINT;
      const phase = process.env.V10_PROCESS_KILL_PHASE;
      if (
        !V10_PROCESS_KILL_CHECKPOINTS.includes(
          checkpoint as AtomicCommitCheckpoint,
        )
      ) {
        throw new Error('V10_4_PROCESS_KILL_CHECKPOINT_REQUIRED');
      }
      if (phase !== 'DELIVERY' && phase !== 'RESERVE' && phase !== 'SHIP') {
        throw new Error('V10_4_PROCESS_KILL_PHASE_REQUIRED');
      }
      const database = await atomicDatabase();
      const prepared = await preparedDelivery();
      let candidate: PrivateAtomicTransitionCandidate;
      let narrowTransferApprovalGuard: NarrowTransferApprovalStore | undefined;
      if (phase === 'RESERVE') {
        candidate = await atomicReserveCandidate({ prepared });
        narrowTransferApprovalGuard = await seedAtomicReserve(database, {
          candidate,
          prepared,
        });
      } else if (phase === 'SHIP') {
        candidate = atomicShipmentCandidate({
          prepared,
          suffix: `PROCESS_KILL_SHIP_${checkpoint}`,
        });
        await seedReservedAutomaticLifecycle(database, {
          prepared,
          shipment: candidate,
        });
      } else {
        candidate = atomicDeliveryCandidate({
          delivery: prepared.delivery,
          prepared,
          suffix: `PROCESS_KILL_${checkpoint}`,
        });
        await seedAtomicDelivery(database, candidate);
      }
      const repository = new AtomicTransitionRepository({
        database: database as SqlDatabase,
        authorizationGuard:
          phase === 'RESERVE'
            ? createTransactionCutoffAuthorizationGuard()
            : automaticCommitGuard,
        faultInjector: {
          hit(observedCheckpoint) {
            if (observedCheckpoint === checkpoint) {
              process.kill(process.pid, 'SIGKILL');
            }
          },
        },
        ...(narrowTransferApprovalGuard === undefined
          ? {}
          : { narrowTransferApprovalGuard }),
        workerId: 'WORKER_V10_4_CONCURRENT',
        sha256Hex,
      });
      await repository.commit(candidate);
    }, 30_000);
  },
);

processKillParentDescribe(
  'V10.4 disposable PostgreSQL process-kill recovery',
  () => {
    it.each(V10_PROCESS_KILL_CHECKPOINTS)(
      'rolls back a Worker killed at %s and commits the same delivery once after restart',
      async (checkpoint) => {
        const termination = await runV10ProcessKillChild(checkpoint);
        expect(termination).toEqual({ code: null, signal: 'SIGKILL' });
        const prepared = await preparedDelivery();
        const candidate = atomicDeliveryCandidate({
          delivery: prepared.delivery,
          prepared,
          suffix: `PROCESS_KILL_${checkpoint}`,
        });
        const database = createLocalPostgresV09AtomicTestDatabase();
        try {
          const rolledBack = await database.query<{
            readonly event_count: string;
            readonly financial_count: string;
            readonly inventory_count: string;
            readonly outbox_count: string;
            readonly queue_state: string;
            readonly receipt_count: string;
            readonly world_version: string;
          }>(
            `select
           (select count(*)::text from world_v2.authoritative_event) as event_count,
           (select count(*)::text from world_v2.inventory_posting) as inventory_count,
           (select count(*)::text from world_v2.financial_posting_batch) as financial_count,
           (select count(*)::text from world_v2.notification_outbox) as outbox_count,
           (select count(*)::text from world_v2.command_receipt) as receipt_count,
           (select queue_state from world_v2.command_queue where world_id = $1 and command_id = $2) as queue_state,
           (select world_version::text from world_v2.world_head where world_id = $1) as world_version`,
            [candidate.command.worldId, candidate.command.commandId],
          );
          expect(rolledBack.rows[0]).toEqual({
            event_count: '0',
            financial_count: '0',
            inventory_count: '0',
            outbox_count: '0',
            queue_state: 'CLAIMED',
            receipt_count: '0',
            world_version: '2',
          });
          const restartedRepository = new AtomicTransitionRepository({
            database: database as SqlDatabase,
            authorizationGuard: automaticCommitGuard,
            workerId: 'WORKER_V10_4_CONCURRENT',
            sha256Hex,
          });
          await expect(
            restartedRepository.commit(candidate),
          ).resolves.toMatchObject({
            source: 'NEW_COMMIT',
            receipt: { outcome: 'COMMITTED' },
          });
          const recovered = await database.query<{
            readonly event_count: string;
            readonly financial_count: string;
            readonly inventory_count: string;
            readonly outbox_count: string;
            readonly receipt_count: string;
            readonly world_version: string;
          }>(
            `select
           (select count(*)::text from world_v2.authoritative_event) as event_count,
           (select count(*)::text from world_v2.inventory_posting) as inventory_count,
           (select count(*)::text from world_v2.financial_posting_batch) as financial_count,
           (select count(*)::text from world_v2.notification_outbox) as outbox_count,
           (select count(*)::text from world_v2.command_receipt) as receipt_count,
           (select world_version::text from world_v2.world_head where world_id = $1) as world_version`,
            [candidate.command.worldId],
          );
          expect(recovered.rows[0]).toEqual({
            event_count: '1',
            financial_count: '1',
            inventory_count: '1',
            outbox_count: '1',
            receipt_count: '1',
            world_version: '3',
          });
        } finally {
          await database.close();
        }
      },
      60_000,
    );

    it.each(V10_PROCESS_KILL_CHECKPOINTS)(
      'rolls back a Worker killed at %s and commits the same Reserve once after restart',
      async (checkpoint) => {
        const termination = await runV10ProcessKillChild(checkpoint, 'RESERVE');
        expect(termination).toEqual({ code: null, signal: 'SIGKILL' });
        const prepared = await preparedDelivery();
        const candidate = await atomicReserveCandidate({ prepared });
        const database = createLocalPostgresV09AtomicTestDatabase();
        try {
          const rolledBack = await database.query<{
            readonly event_count: string;
            readonly inventory_count: string;
            readonly queue_state: string;
            readonly receipt_count: string;
            readonly world_version: string;
          }>(
            `select
           (select count(*)::text from world_v2.authoritative_event) as event_count,
           (select count(*)::text from world_v2.inventory_posting) as inventory_count,
           (select count(*)::text from world_v2.command_receipt) as receipt_count,
           (select queue_state from world_v2.command_queue where world_id = $1 and command_id = $2) as queue_state,
           (select world_version::text from world_v2.world_head where world_id = $1) as world_version`,
            [candidate.command.worldId, candidate.command.commandId],
          );
          expect(rolledBack.rows[0]).toEqual({
            event_count: '0',
            inventory_count: '0',
            queue_state: 'CLAIMED',
            receipt_count: '0',
            world_version: '0',
          });
          const approvals = new NarrowTransferApprovalStore({
            database,
            sha256Hex,
          });
          const restartedRepository = new AtomicTransitionRepository({
            database: database as SqlDatabase,
            authorizationGuard: createTransactionCutoffAuthorizationGuard(),
            narrowTransferApprovalGuard: approvals,
            workerId: 'WORKER_V10_4_CONCURRENT',
            sha256Hex,
          });
          await expect(
            restartedRepository.commit(candidate),
          ).resolves.toMatchObject({
            source: 'NEW_COMMIT',
            receipt: { outcome: 'COMMITTED' },
          });
          const recovered = await database.query<{
            readonly event_count: string;
            readonly financial_count: string;
            readonly inventory_count: string;
            readonly outbox_count: string;
            readonly receipt_count: string;
            readonly world_version: string;
          }>(
            `select
           (select count(*)::text from world_v2.authoritative_event) as event_count,
           (select count(*)::text from world_v2.inventory_posting) as inventory_count,
           (select count(*)::text from world_v2.financial_posting_batch) as financial_count,
           (select count(*)::text from world_v2.notification_outbox) as outbox_count,
           (select count(*)::text from world_v2.command_receipt) as receipt_count,
           (select world_version::text from world_v2.world_head where world_id = $1) as world_version`,
            [candidate.command.worldId],
          );
          expect(recovered.rows[0]).toEqual({
            event_count: '1',
            financial_count: '0',
            inventory_count: '1',
            outbox_count: '0',
            receipt_count: '1',
            world_version: '1',
          });
        } finally {
          await database.close();
        }
      },
      60_000,
    );

    it.each(V10_PROCESS_KILL_CHECKPOINTS)(
      'rolls back a Worker killed at %s and commits the same Ship once after restart',
      async (checkpoint) => {
        const termination = await runV10ProcessKillChild(checkpoint, 'SHIP');
        expect(termination).toEqual({ code: null, signal: 'SIGKILL' });
        const prepared = await preparedDelivery();
        const candidate = atomicShipmentCandidate({
          prepared,
          suffix: `PROCESS_KILL_SHIP_${checkpoint}`,
        });
        const database = createLocalPostgresV09AtomicTestDatabase();
        try {
          const rolledBack = await database.query<{
            readonly event_count: string;
            readonly inventory_count: string;
            readonly queue_state: string;
            readonly receipt_count: string;
            readonly world_version: string;
          }>(
            `select
           (select count(*)::text from world_v2.authoritative_event) as event_count,
           (select count(*)::text from world_v2.inventory_posting) as inventory_count,
           (select count(*)::text from world_v2.command_receipt) as receipt_count,
           (select queue_state from world_v2.command_queue where world_id = $1 and command_id = $2) as queue_state,
           (select world_version::text from world_v2.world_head where world_id = $1) as world_version`,
            [candidate.command.worldId, candidate.command.commandId],
          );
          expect(rolledBack.rows[0]).toEqual({
            event_count: '1',
            inventory_count: '1',
            queue_state: 'CLAIMED',
            receipt_count: '1',
            world_version: '1',
          });
          const restartedRepository = new AtomicTransitionRepository({
            database: database as SqlDatabase,
            authorizationGuard: automaticCommitGuard,
            workerId: 'WORKER_V10_4_CONCURRENT',
            sha256Hex,
          });
          await expect(
            restartedRepository.commit(candidate),
          ).resolves.toMatchObject({
            source: 'NEW_COMMIT',
            receipt: { outcome: 'COMMITTED' },
          });
          const recovered = await database.query<{
            readonly event_count: string;
            readonly financial_count: string;
            readonly inventory_count: string;
            readonly outbox_count: string;
            readonly receipt_count: string;
            readonly world_version: string;
          }>(
            `select
           (select count(*)::text from world_v2.authoritative_event) as event_count,
           (select count(*)::text from world_v2.inventory_posting) as inventory_count,
           (select count(*)::text from world_v2.financial_posting_batch) as financial_count,
           (select count(*)::text from world_v2.notification_outbox) as outbox_count,
           (select count(*)::text from world_v2.command_receipt) as receipt_count,
           (select world_version::text from world_v2.world_head where world_id = $1) as world_version`,
            [candidate.command.worldId],
          );
          expect(recovered.rows[0]).toEqual({
            event_count: '2',
            financial_count: '0',
            inventory_count: '2',
            outbox_count: '0',
            receipt_count: '2',
            world_version: '2',
          });
        } finally {
          await database.close();
        }
      },
      60_000,
    );
  },
);
