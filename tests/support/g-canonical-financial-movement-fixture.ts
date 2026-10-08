/** Disposable durable facts from real Core constructors, never production. */
import { createHash } from 'node:crypto';
import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  Money,
  canonicalSerialize,
  parseCanonicalCommand,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinancialPostingBatch,
  financialPostingBatchId,
  financialPostingLegId,
  type OpeningSeed,
} from '@econmind/core';
import type { V09AtomicTestDatabase } from './v09-atomic-contract.js';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
export async function persistCanonicalVisibilityMovement(
  db: V09AtomicTestDatabase,
  seed: OpeningSeed,
  amount = '30',
  badEventFingerprint = false,
) {
  const seller = seed.financialBatches
    .flatMap((b) => b.legs)
    .find(
      (l) => l.account.accountId === 'ACCOUNT_ACTIVITY_SELLER_CASH',
    )!.account;
  const buyer = seed.financialBatches
    .flatMap((b) => b.legs)
    .find(
      (l) => l.account.accountId === 'ACCOUNT_ACTIVITY_BUYER_CASH',
    )!.account;
  const at = '2026-09-14T00:00:00.000Z';
  const command = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: seed.worldId,
      commandId: 'COMMAND_ACTIVITY_SELLER_TRADE',
      commandType: 'CANONICAL_FINANCIAL_MECHANISM_TEST',
      actorId: 'ACTOR_ACTIVITY',
      authSubject: '550e8400-e29b-41d4-a716-446655440011',
      countryId: seller.countryId,
      officeId: 'TRADE',
      idempotencyKey: null,
      expectedWorldVersion: '0',
      simTime: '0',
      correlationId: 'CORRELATION_ACTIVITY',
      submittedAtReal: at,
      payload: { purpose: 'TEST_ONLY_CORE_LINEAGE' },
    },
    sha,
  );
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      worldId: seed.worldId,
      eventId: 'EVENT_ACTIVITY_SELLER_TRADE',
      eventType: 'CANONICAL_FINANCIAL_MECHANISM_TEST',
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: '1',
      sequence: '1',
      simTime: '0',
      recordedAtReal: at,
      correctsEventId: null,
      payload: { purpose: 'TEST_ONLY_CORE_LINEAGE' },
    },
    sha,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const batch = createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId('FINANCIAL_ACTIVITY_SETTLEMENT'),
      worldId: seed.worldId,
      causationCommandId: command.commandId,
      causationEventIds: [event.eventId],
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: command.simTime,
      settlementCurrency: 'GCU',
      command,
      transition,
      legs: [
        {
          legId: financialPostingLegId('LEG_ACTIVITY_SELLER_DEBIT'),
          account: seller,
          direction: 'DEBIT',
          amount: Money.from(amount, 'GCU'),
          counterpartyAccountId: buyer.accountId,
        },
        {
          legId: financialPostingLegId('LEG_ACTIVITY_BUYER_CREDIT'),
          account: buyer,
          direction: 'CREDIT',
          amount: Money.from(amount, 'GCU'),
          counterpartyAccountId: seller.accountId,
        },
      ],
    },
    sha,
  );
  const { fingerprint: omitted, ...intent } = batch;
  void omitted;
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into world_v2.command_submission
      (world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)
      values ($1,$2,null,$3,$4,$5,$6,$7,$8::uuid,$9,$10,$11,0,0,$12,$13)`,
      [
        seed.worldId,
        command.commandId,
        command.commandType,
        command.schemaVersion,
        command.canonicalPayload,
        command.payloadHash,
        command.fingerprint,
        command.authSubject,
        command.actorId,
        command.countryId,
        command.officeId,
        command.correlationId,
        at,
      ],
    );
    await tx.query(
      `insert into world_v2.authoritative_event
      (world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real,corrects_event_id)
      values ($1,$2,1,1,$3,$4,$5,$6,$7,$8,$9,0,$10,null)`,
      [
        seed.worldId,
        event.eventId,
        command.commandId,
        event.correlationId,
        event.eventType,
        event.schemaVersion,
        event.canonicalPayload,
        event.payloadHash,
        badEventFingerprint ? 'sha256:' + '0'.repeat(64) : event.fingerprint,
        at,
      ],
    );
    await tx.query(
      `insert into world_v2.command_receipt
      (world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)
      values ($1,$2,null,'command-receipt-v2',$3,'COMMITTED',null,$2,0,1,0,$4::jsonb,$5)`,
      [
        seed.worldId,
        command.commandId,
        command.fingerprint,
        canonicalSerialize([event.eventId]),
        at,
      ],
    );
    // Corrupt Event-only negative fixture: do not bypass the SQL posting
    // evidence guard, which already rejects a batch bound to this bad hash.
    if (!badEventFingerprint)
      await tx.query(
        `insert into world_v2.financial_posting_batch
      (world_id,batch_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,settlement_currency,canonical_payload,batch_fingerprint)
      values ($1,$2,$3,0,1,0,$4::jsonb,$5,'GCU',$6,$7)`,
        [
          seed.worldId,
          batch.batchId,
          command.commandId,
          canonicalSerialize(batch.causationEventIds),
          canonicalSerialize(batch.transitionBinding),
          canonicalSerialize(intent),
          batch.fingerprint,
        ],
      );
    await tx.query(
      'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
      [seed.worldId],
    );
  });
  return { command, event, batch };
}
