/** Actual tiny Core child/leases/payment math with official SQL economic tables.
 * Admission rows are explicitly TEST_ONLY catalog seams, not a private signature
 * or production permission. No World/Clock host, queue or native cluster starts. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { it, expect } from 'vitest';
import * as C from '@econmind/core';
import { createBeneficialHousingRentChildCoreFixture } from '../support/beneficial-housing-rent-child-test-only.js';
const read = (p: string) =>
  readFile(new URL('../../database/' + p, import.meta.url), 'utf8');
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const at = '2026-11-01T00:00:00.000Z',
  admission = 'ADMISSION_' + '1'.repeat(64).toUpperCase();
function rentFrame(
  receipt: C.BeneficialHousingReclassificationReceipt,
  state: C.BeneficialHousingRentState,
  financial: C.FinancialLedgerState,
  index: string,
  tick: string,
) {
  const prepared = C.prepareBeneficialHousingRent(
    {
      receipt,
      state,
      financialBefore: financial,
      leaseId: receipt.leases[0]!.leaseId,
      periodIndex: index,
      simTime: C.SimTime.fromTicks(tick),
    },
    sha,
  );
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: receipt.worldId,
      countryId: receipt.countryId,
      officeId: null,
      commandType: C.BENEFICIAL_HOUSING_RENT_COMMAND,
      commandId: 'COMMAND_TEST_CURRENT_RENT_' + index,
      idempotencyKey: prepared.idempotencyKey,
      actorId: 'ACTOR_TEST_ONLY_RENT',
      authSubject: '11111111-1111-4111-8111-111111111111',
      correlationId: 'CORRELATION_TEST_RENT_' + index,
      expectedWorldVersion: financial.worldVersion,
      simTime: tick,
      submittedAtReal: at,
      payload: prepared.commandPayload,
    },
    sha,
  );
  const after = (BigInt(financial.worldVersion) + 1n).toString();
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_TEST_RENT_' + index,
      eventType: C.BENEFICIAL_HOUSING_RENT_EVENT,
      worldId: receipt.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: after,
      sequence: after,
      simTime: tick,
      recordedAtReal: at,
      correctsEventId: null,
      payload: prepared.eventPayload,
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    worldVersionBefore: financial.worldVersion,
    worldVersionAfter: after,
    events: [event],
  });
  const settled = C.settleBeneficialHousingRent(
    {
      receipt,
      state,
      financialBefore: financial,
      command,
      transition,
      leaseId: prepared.commandPayload.leaseId,
      periodIndex: index,
    },
    sha,
  );
  if (!settled.posting) throw Error('TEST_ONLY_NEW_PERIOD_REQUIRED');
  const final = C.createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: at,
  });
  return {
    frame: {
      command,
      transition,
      events: [event],
      receipt: final,
      financialPostingBatches: [settled.posting],
      inventoryPostings: [],
    },
    settled,
  };
}
type Frame = ReturnType<typeof rentFrame>['frame'];
async function persist(db: PGlite, f: Frame) {
  const c = f.command,
    e = f.events[0]!,
    r = f.receipt,
    b = f.financialPostingBatches[0]!;
  await db.query(
    'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,country_id,office_id,actor_id,auth_subject,expected_world_version,sim_time,canonical_payload,payload_sha256,command_fingerprint,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
    [
      c.worldId,
      c.commandId,
      c.idempotencyKey,
      c.commandType,
      c.schemaVersion,
      c.countryId,
      c.officeId,
      c.actorId,
      c.authSubject,
      c.expectedWorldVersion,
      c.simTime.toCanonicalValue(),
      c.canonicalPayload,
      c.payloadHash,
      c.fingerprint,
      c.correlationId,
      c.submittedAtReal,
    ],
  );
  await db.exec('set role world_v2_beneficial_rent_source_publisher');
  await db.query(
    'select world_v2.register_test_only_beneficial_rent_publication($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      c.worldId,
      c.countryId,
      c.commandId,
      'WORKER_TEST_ONLY_RENT_CURRENT',
      'TEST_ONLY_FROZEN_RENT_CURRENT_CLOCK',
      c.simTime.toCanonicalValue(),
      '2026-10-31T23:59:00.000Z',
      '2026-11-01T00:01:00.000Z',
    ],
  );
  await db.exec('reset role');
  await db.query(
    'insert into world_v2.authoritative_event(world_id,event_id,event_type,schema_version,causation_command_id,correlation_id,world_version,event_sequence,sim_time,recorded_at_real,corrects_event_id,canonical_payload,payload_sha256,event_fingerprint)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
    [
      e.worldId,
      e.eventId,
      e.eventType,
      e.schemaVersion,
      e.causationCommandId,
      e.correlationId,
      e.worldVersion,
      e.sequence,
      e.simTime.toCanonicalValue(),
      e.recordedAtReal,
      e.correctsEventId,
      e.canonicalPayload,
      e.payloadHash,
      e.fingerprint,
    ],
  );
  await db.query(
    'insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
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
      r.simTime.toCanonicalValue(),
      JSON.stringify(r.eventIds),
      r.recordedAtReal,
    ],
  );
  const { fingerprint, ...body } = JSON.parse(
    C.canonicalSerialize(b),
  ) as Record<string, unknown>;
  await db.query(
    'insert into world_v2.financial_posting_batch(world_id,batch_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,settlement_currency,canonical_payload,batch_fingerprint)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [
      b.worldId,
      b.batchId,
      b.causationCommandId,
      b.worldVersionBefore,
      b.worldVersionAfter,
      b.simTime.toCanonicalValue(),
      JSON.stringify(b.causationEventIds),
      C.canonicalSerialize(b.transitionBinding),
      b.settlementCurrency,
      C.canonicalSerialize(body),
      fingerprint,
    ],
  );
  await db.query(
    'update world_v2.world_head set world_version=$2,event_sequence=$2 where world_id=$1',
    [c.worldId, e.worldVersion],
  );
}
it('replays two real paid periods at the same legal HH claim, keeps committed history after source revocation and refuses tampered payment/gap/scope', async () => {
  const f = createBeneficialHousingRentChildCoreFixture(1),
    db = new PGlite(),
    receipt = f.receipts[0]!,
    world = f.seed.worldId;
  try {
    for (const id of [
      '0001_world_v2_namespace',
      '0002_world_v2_command_event_ledger',
      '0003_world_v2_command_receipts_outbox',
      '0007_world_v2_atomic_transition_facts',
      '0009_world_v2_posting_payload_integrity',
      '0011_world_v2_current_commit_authorization',
      '0016_world_v2_opening_seed',
    ])
      await db.exec(await read('migrations/artifacts/' + id + '.sql'));
    await db.exec(`create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,replay_binding text,model_version text,admission_ref text,admitted_at_real timestamptz);
  create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
  create table world_v2.runtime_admission_publication_revocation(authorization_id text);`);
    await db.exec(
      await read('proposals/financial-posting-decimal-validation.sql'),
    );
    await db.exec(
      await read('proposals/postwar-beneficial-housing-rent-custody.sql'),
    );
    const { fingerprint: seedFp, ...intent } = f.seed;
    await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
    await db.query(
      'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,$6)',
      [
        world,
        f.seed.seedId,
        C.canonicalSerialize(f.seed.replayBinding),
        C.canonicalSerialize(intent),
        seedFp,
        at,
      ],
    );
    await db.query(
      'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,$5,$6,$7)',
      [
        world,
        f.seed.seedId,
        seedFp,
        C.canonicalSerialize(f.seed.replayBinding),
        f.seed.replayBinding.modelVersion,
        admission,
        at,
      ],
    );
    await db.query(
      'insert into world_v2.runtime_admission_publication_permit values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        'TEST_ONLY_RENT_CURRENT',
        '1'.repeat(64),
        world,
        f.seed.seedId,
        seedFp,
        f.seed.replayBinding.modelVersion,
        C.canonicalSerialize(f.seed.replayBinding),
        '2026-01-01T00:00:00.000Z',
        '2027-01-01T00:00:00.000Z',
      ],
    );
    const bundle = C.canonicalSerialize({
      schemaVersion: 'postwar-beneficial-housing-rent-source-v1',
      worldId: world,
      seedId: f.seed.seedId,
      seedFingerprint: seedFp,
      parentSeedFingerprint: f.parent.fingerprint,
      receipts: f.receipts,
    });
    await db.exec('set role world_v2_beneficial_rent_source_publisher');
    expect(
      (
        await db.query<{ count: number }>(
          'select world_v2.register_postwar_beneficial_rent_source($1,$2,$3)as count',
          [world, bundle, sha(bundle)],
        )
      ).rows[0]!.count,
    ).toBe(1);
    await db.exec(`reset role;create role world_v2_postwar_projection_owner nologin nosuperuser nobypassrls;grant usage on schema world_v2 to world_v2_postwar_projection_owner;
  create function world_v2.postwar_projection_admission_header(text)returns table(seed_fingerprint text,admission_ref text)language sql security definer set search_path=pg_catalog as $$select a.seed_fingerprint,a.admission_ref from world_v2.runtime_opening_admission a where a.world_id=$1$$;
  create table world_v2.postwar_social_prefix_scope(world_id text,country_id text,scope_document text);
  grant select on world_v2.world_head,world_v2.command_submission,world_v2.command_receipt,world_v2.authoritative_event,world_v2.financial_posting_batch,world_v2.inventory_posting,world_v2.postwar_social_prefix_scope to world_v2_postwar_projection_owner;`);
    await db.query(
      'insert into world_v2.postwar_social_prefix_scope values($1,$2,$3)',
      [world, receipt.countryId, '{}'],
    );
    await db.exec(
      await read('proposals/postwar-mixed-beneficial-rent-current-effects.sql'),
    );
    const main = await read(
      'proposals/postwar-mixed-current-projection-read.sql',
    );
    await db.exec(
      main.slice(
        main.indexOf('create function world_v2.postwar_mixed_fx_group('),
        main.indexOf(
          'create function world_v2.postwar_write_mixed_current_document(',
        ),
      ),
    );
    const financial = C.rebuildV08LedgersFromLineage({
      seed: f.seed,
      sha256Hex: sha,
    }).financial;
    const first = rentFrame(
      receipt,
      C.createBeneficialHousingRentState(receipt),
      financial,
      '0',
      '11',
    );
    await persist(db, first.frame);
    const reduce = async (frame: Frame, prior: unknown = null) =>
      db.query<{ value: unknown }>(
        'select world_v2.postwar_mixed_beneficial_rent_group($1,$2,$3,$4,$5,$6)as value',
        [
          world,
          C.canonicalSerialize(frame.command),
          C.canonicalSerialize(frame.transition),
          C.canonicalSerialize(frame.events[0]),
          C.canonicalSerialize(frame.financialPostingBatches),
          C.canonicalSerialize(prior),
        ],
      );
    const paid = (await reduce(first.frame)).rows[0]!.value;
    expect(paid).toEqual(
      JSON.parse(C.canonicalSerialize(first.settled.state.paid)),
    );
    const second = rentFrame(
      receipt,
      first.settled.state,
      first.settled.financial,
      '1',
      '21',
    );
    await persist(db, second.frame);
    const paid2 = (await reduce(second.frame, paid)).rows[0]!.value;
    expect(paid2).toEqual(
      JSON.parse(C.canonicalSerialize(second.settled.state.paid)),
    );
    // Both payments predate revocation. Historical readback cannot create a
    // new command and must not erase either already committed payment.
    await db.query(
      "insert into world_v2.postwar_beneficial_rent_revocation select world_id,registration_ref,'TEST_ONLY_REVOKED'from world_v2.postwar_beneficial_rent_source",
    );
    await db.query(
      "insert into world_v2.postwar_beneficial_rent_publication_revocation select world_id,publication_ref,'TEST_ONLY_REVOKED_AFTER_PAYMENT'from world_v2.postwar_beneficial_rent_publication",
    );
    await db.exec('set role world_v2_beneficial_rent_source_reader');
    try {
      expect(
        (
          await db.query(
            'select * from world_v2.lock_postwar_beneficial_rent_header($1,$2)',
            [world, receipt.countryId],
          )
        ).rows,
      ).toEqual([]);
    } finally {
      await db.exec('reset role');
    }
    expect((await reduce(first.frame)).rows[0]!.value).toEqual(paid);
    expect((await reduce(second.frame, paid)).rows[0]!.value).toEqual(paid2);
    expect(
      C.aggregateBeneficialHousingLiquidClaim(second.settled.financial, receipt)
        .availableAmount,
    ).toBe(receipt.originalAmount);
    const prefix = await db.query<{
      prefix_fingerprint: string;
      financial_posting_count: string;
      financial_batch_count: string;
    }>('select * from world_v2.postwar_mixed_current_prefix($1)', [world]);
    expect(prefix.rows[0]!.prefix_fingerprint).toBe(
      C.canonicalSha256(
        C.canonicalHashInput({
          worldId: world,
          seedFingerprint: seedFp,
          headWorldVersion: '2',
          headEventSequence: '2',
          frames: [first.frame, second.frame],
        }),
        sha,
      ),
    );
    expect(prefix.rows[0]!.financial_posting_count).toBe('4');
    expect(prefix.rows[0]!.financial_batch_count).toBe('2');
    await expect(reduce(second.frame)).rejects.toThrow(
      'MIXED_RENT_PAID_PERIOD_DUPLICATE_OR_GAP',
    );
    const bad = JSON.parse(C.canonicalSerialize(second.frame)) as Frame;
    const legs = bad.financialPostingBatches[0]!.legs as unknown as {
      amount: { amount: string };
    }[];
    legs[0]!.amount.amount = '1';
    await expect(reduce(bad, paid)).rejects.toThrow(
      'MIXED_RENT_EXACT_CORE_TWO_LEG_BATCH_REQUIRED',
    );
    await expect(
      db.query(
        'select world_v2.postwar_projection_rent_original($1,$2,$3,$4,$5,$6)',
        [
          world,
          'COUNTRY_02',
          seedFp,
          admission,
          first.frame.events[0]!.eventId,
          first.frame.events[0]!.payloadHash,
        ],
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('world_v2_beneficial_rent_source_reader','world_v2.postwar_projection_rent_original(text,text,text,text,text,text)','EXECUTE')as allowed",
        )
      ).rows[0]!.allowed,
    ).toBe(false);
    await db.exec(
      'drop function world_v2.postwar_mixed_beneficial_rent_group(text,jsonb,jsonb,jsonb,jsonb,jsonb)',
    );
    await expect(
      db.query('select * from world_v2.postwar_mixed_current_prefix($1)', [
        world,
      ]),
    ).rejects.toThrow('MIXED_RENT_EFFECTS_EXTENSION_REQUIRED');
  } finally {
    await db.close();
  }
});
