/** TEST_ONLY tiny genuine Core source + actual embedded PostgreSQL Atomic
 * protocol. No formal OP facts, production role, new consumer or Clock. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createPostwarNarrowTradeReservationRuntime } from '../../apps/world-worker/src/preparation/postwar-narrow-trade-reservation-candidate.js';
import {
  createPostwarNarrowTradeCurrentSource,
  preparePostwarNarrowTradeGoodsOpening,
} from '../../apps/world-worker/src/persistence/postwar-narrow-trade-current-source.js';
import { AtomicTransitionRepository } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { createTransactionCutoffAuthorizationGuard } from '../../apps/world-worker/src/authoritative-execution.js';
import {
  installPostwarNarrowTradeCutoffFixture,
  createPostwarNarrowTradeCutoffCandidate,
  narrowCutoffSha,
} from '../support/postwar-narrow-trade-cutoff-fixture.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
export async function createPostwarNarrowTradeGoodsFixture(
  options: Readonly<{ extraBuyerBankCash?: boolean }> = {},
) {
  const db = new PGlite();
  try {
    const f = await installPostwarNarrowTradeCutoffFixture(db, options),
      holder = 'WORKER_TEST_ONLY_NARROW_CANDIDATE';
    for (const id of [
      '0004_world_v2_receipt_event_set_integrity',
      '0005_world_v2_writer_lease_fencing',
      '0006_world_v2_writer_lease_lineage_guard',
      '0008_world_v2_materialization_recovery',
      '0010_world_v2_command_claim_fencing',
      '0012_world_v2_command_claim_active_lease_guard',
      '0014_world_v2_current_negotiation_party_membership',
      '0015_world_v2_narrow_transfer_approvals',
      '0017_world_v2_narrow_transfer_approval_reference',
    ])
      await db.exec(
        await readFile(
          new URL(
            '../../database/migrations/artifacts/' + id + '.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
    await db.exec(
      await readFile(
        new URL(
          '../../database/proposals/postwar-narrow-trade-automatic-source.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const c = await createPostwarNarrowTradeCutoffCandidate(f),
      command = c.command;
    await db.query(
      `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,country_id,office_id,actor_id,auth_subject,expected_world_version,sim_time,canonical_payload,payload_sha256,command_fingerprint,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10,$11,$12,$13,$14,$15,$16::timestamptz)`,
      [
        f.world,
        command.commandId,
        command.idempotencyKey,
        command.commandType,
        command.schemaVersion,
        command.countryId,
        command.officeId,
        command.actorId,
        command.authSubject,
        command.expectedWorldVersion,
        command.simTime.toCanonicalValue(),
        command.canonicalPayload,
        command.payloadHash,
        command.fingerprint,
        command.correlationId,
        command.submittedAtReal,
      ],
    );
    const buyerSubject = '00000000-0000-4000-8000-000000000002';
    for (const [office, cap] of [
      ['TRADE', 'TRADE_CONTRACTS'],
      ['FINANCE', 'FINANCE_TREASURY'],
    ])
      await db.query(
        'insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,$4,$5,$6,$7,true,$8::timestamptz)',
        [
          f.world,
          buyerSubject,
          f.buyer,
          office,
          cap,
          'TEAM_TEST_ONLY_BUYER',
          'REV_TEST_ONLY_BUYER',
          c.at,
        ],
      );
    await db.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,$3::timestamptz,60000)',
      [f.world, holder, c.at],
    );
    await db.query(
      "insert into world_v2.command_queue(world_id,command_id,authority_kind,available_at_sim_time)values($1,$2,'DISCRETIONARY_USER',0)",
      [f.world, command.commandId],
    );
    await db.query(
      "update world_v2.command_queue set queue_state='CLAIMED',claimed_by=$3,claimed_at_real=$4::timestamptz,claim_fencing_token=1,attempt_count=1 where world_id=$1 and command_id=$2",
      [f.world, command.commandId, holder, c.at],
    );
    await db.exec(
      `grant select on world_v2.command_submission,world_v2.world_head,world_v2.world_writer_lease,world_v2.narrow_transfer_proposal,world_v2.narrow_transfer_approval_signature,world_v2.narrow_transfer_approval_reference,world_v2.authoritative_event,world_v2.command_receipt,world_v2.command_queue,world_v2.inventory_posting,world_v2.financial_posting_batch to ${f.readerRole};grant update(command_id)on world_v2.command_submission to ${f.readerRole};grant update(world_version,event_sequence)on world_v2.world_head to ${f.readerRole};grant update(renewed_at_real)on world_v2.world_writer_lease to ${f.readerRole};grant insert,update on world_v2.narrow_transfer_proposal to ${f.readerRole};grant insert on world_v2.narrow_transfer_approval_signature,world_v2.narrow_transfer_approval_reference,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.authoritative_commit_authorization,world_v2.command_receipt,world_v2.notification_outbox to ${f.readerRole};grant update(queue_state,finalized_at_real)on world_v2.command_queue to ${f.readerRole};`,
    );
    // Explicit TEST_ONLY world-scoped DML/lock enrollment for this isolated
    // economic worker, never an activation or production grant proposal.
    for (const table of [
      'narrow_transfer_proposal',
      'narrow_transfer_approval_signature',
      'narrow_transfer_approval_reference',
    ])
      await db.exec(
        `create policy test_only_narrow_world on world_v2.${table} to ${f.readerRole} using(world_id='${f.world}')with check(world_id='${f.world}')`,
      );
    await db.exec(
      `grant update(authorization_version)on world_v2.narrow_transfer_approval_signature to ${f.readerRole};grant update(approval_ref)on world_v2.narrow_transfer_approval_reference to ${f.readerRole};`,
    );
    const tx: SqlExecutor = {
      async query<T extends object>(q: string, args: readonly unknown[] = []) {
        const r = await db.query<T>(q, [...args]);
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
      },
    };
    const database: SqlDatabase = {
      query: tx.query,
      async transaction<T>(consume: (t: SqlExecutor) => Promise<T>) {
        await db.exec('begin');
        try {
          const result = await consume(tx);
          await db.exec('commit');
          return result;
        } catch (e) {
          await db.exec('rollback');
          throw e;
        }
      },
    };
    const source = createPostwarNarrowTradeCurrentSource({
      runtimeRole: f.readerRole,
      goodsOpeningPreparation: preparePostwarNarrowTradeGoodsOpening({
        seed: f.seed,
        admissionRef: f.admissionRef,
      }),
      workerId: holder,
      clock: { nowReal: () => c.at, simTime: async () => '0' },
    });
    const runtime = createPostwarNarrowTradeReservationRuntime({
      worldId: f.world,
      workerId: holder,
      database,
      source,
    });
    await db.exec('set session authorization ' + f.readerRole);
    await runtime.narrowTransferApprovalGuard.openSellerOffer({
      command,
      signer: {
        actorId: command.actorId,
        authSubject: f.subject,
        signedAtReal: c.at,
      },
    });
    for (const office of ['TRADE', 'FINANCE'] as const)
      await runtime.narrowTransferApprovalGuard.signBuyerOffice({
        command,
        office,
        signer: {
          actorId: 'ACTOR_TEST_ONLY_BUYER_' + office,
          authSubject: buyerSubject,
          signedAtReal: c.at,
        },
      });
    await f.reset();
    await db.exec(
      `grant insert on world_v2.financial_posting_batch to ${f.readerRole}`,
    );
    await db.exec('set session authorization ' + f.readerRole);
    const repository = new AtomicTransitionRepository({
      database: runtime.database,
      authorizationGuard: createTransactionCutoffAuthorizationGuard(),
      workerId: holder,
      sha256Hex: narrowCutoffSha,
      narrowTransferApprovalGuard: runtime.narrowTransferApprovalGuard,
      postwarNarrowTradeSourceCommitProtectionPort:
        runtime.sourceCommitProtectionPort,
    });
    return {
      ...f,
      c,
      holder,
      database: runtime.database,
      db,
      runtime,
      repository,
      source,
      async close() {
        await f.reset();
        await db.close();
      },
    };
  } catch (e) {
    await db.close();
    throw e;
  }
}
