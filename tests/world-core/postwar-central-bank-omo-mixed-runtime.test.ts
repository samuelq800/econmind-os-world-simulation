/** Core-generated Budget history below is explicitly installed TEST_ONLY DATA,
 * not a Budget consumer/Atomic success. The subsequent CB command must pass the
 * real custody, low-role runtime, genuine cutoff and Root Atomic transaction. */
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import { canonicalSerialize as serializeSource } from '../../packages/core/src/index.js';
import { createCbFinanceSocialFixture } from '../support/cb-finance-social-replay-fixture.js';
import {
  createCentralBankOmoAtomicFixture,
  cbAtomicTestSha as sha,
  CB_ATOMIC_TEST_AT,
} from '../support/postwar-central-bank-omo-atomic-fixture.js';
import type { FinanceNativeBudgetCanonicalFrame } from '../../packages/core/src/commands/finance-budget-native.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

async function installTestOnlyHistory(
  tx: SqlExecutor,
  frame: FinanceNativeBudgetCanonicalFrame,
) {
  const c = frame.command;
  await tx.query(
    `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      c.worldId,
      c.commandId,
      c.idempotencyKey,
      c.commandType,
      c.schemaVersion,
      c.canonicalPayload,
      c.payloadHash,
      c.fingerprint,
      c.authSubject,
      c.actorId,
      c.countryId,
      c.officeId,
      c.expectedWorldVersion,
      c.simTime.ticks.toString(),
      c.correlationId,
      c.submittedAtReal,
    ],
  );
  for (const e of frame.events)
    await tx.query(
      `insert into world_v2.authoritative_event(world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real,corrects_event_id)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        e.worldId,
        e.eventId,
        e.sequence,
        e.worldVersion,
        e.causationCommandId,
        e.correlationId,
        e.eventType,
        e.schemaVersion,
        e.canonicalPayload,
        e.payloadHash,
        e.fingerprint,
        e.simTime.ticks.toString(),
        e.recordedAtReal,
        e.correctsEventId,
      ],
    );
  const r = frame.receipt;
  await tx.query(
    `insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
    [
      r.worldId,
      r.commandId,
      r.idempotencyKey,
      r.schemaVersion,
      r.commandFingerprint,
      r.outcome,
      r.reasonCode,
      r.transitionId,
      r.worldVersionBefore,
      r.worldVersionAfter,
      r.simTime.ticks.toString(),
      C.canonicalSerialize(r.eventIds),
      r.recordedAtReal,
    ],
  );
  await tx.query(
    'update world_v2.world_head set world_version=$2,event_sequence=$3 where world_id=$1',
    [c.worldId, r.worldVersionAfter, frame.events.at(-1)!.sequence],
  );
}
describe('CB native source complete mixed prefix data', () => {
  it('consumes SET/three-event LINE fixture history without discarding it, then actually commits CB through Atomic exactly once', async () => {
    const data = createCbFinanceSocialFixture({ runtimeOpening: true });
    const frames: FinanceNativeBudgetCanonicalFrame[] = [];
    frames.push(
      await data.budgetFrame('SET_ENVELOPE', frames, 'RUNTIME_SET', '1'),
    );
    frames.push(
      await data.budgetFrame('APPROVE_NEW_LINE', frames, 'RUNTIME_LINE', '0.2'),
    );
    expect(frames[1]!.events).toHaveLength(3);
    const raw = data.omoFrame([], 'ACTUAL').command;
    const command = C.parseCanonicalCommand(
      {
        schemaVersion: raw.schemaVersion,
        worldId: raw.worldId,
        countryId: raw.countryId,
        officeId: raw.officeId,
        commandType: raw.commandType,
        commandId: raw.commandId,
        idempotencyKey: raw.idempotencyKey,
        actorId: raw.actorId,
        authSubject: raw.authSubject,
        correlationId: raw.correlationId,
        expectedWorldVersion: '2',
        simTime: '10000',
        submittedAtReal: CB_ATOMIC_TEST_AT,
        payload: {
          ...JSON.parse(raw.canonicalPayload),
          settlementSimTime: '10000',
        },
      },
      sha,
    );
    const seed = C.parseOpeningSeed(
      JSON.parse(serializeSource(data.seed)),
      sha,
    );
    const facts = {
      ...data.facts,
      bankAccounts: Object.fromEntries(
        Object.entries(data.facts.bankAccounts).map(([key, id]) => [
          key,
          C.financialAccountId(id),
        ]),
      ),
      centralBankAccounts: Object.fromEntries(
        Object.entries(data.facts.centralBankAccounts).map(([key, id]) => [
          key,
          C.financialAccountId(id),
        ]),
      ),
      quote: {
        ...data.facts.quote,
        worldVersion: '2',
        validAtSimTime: '10000',
      },
    };
    const f = await createCentralBankOmoAtomicFixture({ seed, command, facts });
    try {
      await f.admin.transaction(async (tx) => {
        for (const frame of frames) await installTestOnlyHistory(tx, frame);
      });
      // Exact complete prefix: two versions, four events, no financial batch.
      const before = await f.database.transaction((tx) =>
        tx.query<Record<string, unknown>>(
          'select * from world_v2.lock_central_bank_omo_originals($1,$2,$3,$4,$5,$6,$7::uuid,$8)',
          [
            seed.worldId,
            command.countryId,
            f.quote.securityRef,
            f.quote.batchRef,
            'WORKER_TEST_ONLY_CB1',
            CB_ATOMIC_TEST_AT,
            command.authSubject,
            '10000',
          ],
        ),
      );
      expect(before.rows[0]).toMatchObject({
        world_version: '2',
        event_sequence: '4',
        financial_batch_count: '0',
        inventory_posting_count: '0',
      });
      expect(before.rows[0]!.events).toHaveLength(4);
      expect(before.rows[0]!.receipts).toHaveLength(2);
      await f.runtime.preflight(command, CB_ATOMIC_TEST_AT);
      const draft = await f.prepareDraft();
      expect(draft.draft.transition.worldVersionBefore).toBe('2');
      expect(draft.draft.transition.events[0]!.sequence).toBe('5');
      expect(draft.draft.financialPostingBatches).toHaveLength(1);
      const committed = await f.execution.executeQueuedCommand(f.input);
      expect(committed.source).toBe('NEW_FINAL');
      expect(committed.receipt.outcome).toBe('COMMITTED');
      const counts = async () =>
        (
          await f.db.query<{
            version: string;
            sequence: string;
            events: number;
            batches: number;
            receipts: number;
            audit: number;
          }>(
            'select world_version::text as version,event_sequence::text as sequence,(select count(*)::int from world_v2.authoritative_event)as events,(select count(*)::int from world_v2.financial_posting_batch)as batches,(select count(*)::int from world_v2.command_receipt)as receipts,(select count(*)::int from world_v2.authoritative_commit_authorization)as audit from world_v2.world_head',
          )
        ).rows[0]!;
      expect(await counts()).toEqual({
        version: '3',
        sequence: '5',
        events: 5,
        batches: 1,
        receipts: 3,
        audit: 1,
      });
      await f.revoke('SOURCE');
      expect((await f.execution.executeQueuedCommand(f.input)).source).toBe(
        'EXISTING_FINAL',
      );
      expect(await counts()).toEqual({
        version: '3',
        sequence: '5',
        events: 5,
        batches: 1,
        receipts: 3,
        audit: 1,
      });
      await expect(
        f.runtime.preflight(command, CB_ATOMIC_TEST_AT),
      ).rejects.toMatchObject({ missing: ['CB_OMO_SOURCE_REVOKED'] });
      await expect(
        f.database.transaction((tx) =>
          tx.query('select * from world_v2.opening_seed'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await f.db.close();
    }
  });
});
