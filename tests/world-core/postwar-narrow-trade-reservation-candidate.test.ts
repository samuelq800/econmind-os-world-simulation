/** TEST_ONLY tiny genuine Core source + actual embedded PostgreSQL Atomic
 * protocol. No formal OP facts, production role, new consumer or Clock. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect } from 'vitest';
import {
  createPostwarNarrowTradeReservationRuntime,
  createPostwarNarrowTradeAuthorizationDatabase,
  NARROW_APPROVAL_AUTHORIZATION_LOCK_QUERY,
  isPostwarNarrowTradeReservationRuntime,
} from '../../apps/world-worker/src/preparation/postwar-narrow-trade-reservation-candidate.js';
import {
  createPostwarNarrowTradeCurrentSource,
  preparePostwarNarrowTradeOpening,
} from '../../apps/world-worker/src/persistence/postwar-narrow-trade-current-source.js';
import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
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
import { WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY } from '../../apps/world-worker/src/persistence/worker-authorization-sql.js';
async function fixture() {
  const db = new PGlite();
  try {
    const f = await installPostwarNarrowTradeCutoffFixture(db),
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
      openingPreparation: preparePostwarNarrowTradeOpening({
        seed: f.seed,
        admissionRef: f.admissionRef,
      }),
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
describe('fixed postwar narrow reservation candidate/Atomic integration', () => {
  it('does not construct an alternative consumer or accept a structural source', () => {
    let touched = false;
    const database: SqlDatabase = {
      query: async () => {
        touched = true;
        throw Error('UNEXPECTED');
      },
      transaction: async () => {
        touched = true;
        throw Error('UNEXPECTED');
      },
    };
    expect(() =>
      createPostwarNarrowTradeReservationRuntime({
        worldId: 'WORLD_TEST_ONLY',
        workerId: 'WORKER_TEST_ONLY',
        database,
        source: {} as never,
      }),
    ).toThrow('genuine same-World');
    expect(touched).toBe(false);
    expect(isPostwarNarrowTradeReservationRuntime({})).toBe(false);
  });
  it('delegates only exact world/family lock statements and preserves original SQL otherwise', async () => {
    const calls: { q: string; a: readonly unknown[] }[] = [];
    const tx: SqlExecutor = {
      async query<T extends object>(q: string, a: readonly unknown[] = []) {
        calls.push({ q, a });
        return { rows: [] as T[], rowCount: 0 };
      },
    };
    const db: SqlDatabase = { query: tx.query, transaction: (op) => op(tx) },
      bound = createPostwarNarrowTradeAuthorizationDatabase(db, {
        worldId: 'WORLD_TEST_ONLY',
      }),
      args = [
        'WORLD_TEST_ONLY',
        '00000000-0000-4000-8000-000000000001',
        'COUNTRY_01',
        'TRADE',
        'TRADE_CONTRACTS',
      ];
    await bound.transaction(async (executor) => {
      await executor.query(NARROW_APPROVAL_AUTHORIZATION_LOCK_QUERY, args);
      await bound.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, args);
      await executor.query(NARROW_APPROVAL_AUTHORIZATION_LOCK_QUERY, [
        'WORLD_FOREIGN',
        ...args.slice(1),
      ]);
    });
    expect(calls[0]!.q).toContain(
      'lock_postwar_narrow_trade_current_authorization',
    );
    expect(calls[1]!.q).toContain(
      'lock_postwar_narrow_trade_current_authorization',
    );
    expect(calls[2]!.q).toBe(NARROW_APPROVAL_AUTHORIZATION_LOCK_QUERY);
  });
  it('real source + real three signatures produces one reserve COMMITTED/FINAL readback through Root Atomic guard, then exact retry', async () => {
    const f = await fixture();
    try {
      expect(isPostwarNarrowTradeReservationRuntime(f.runtime)).toBe(true);
      const draft = await f.runtime.candidateFactory.prepare({
        command: f.c.command,
        commitAuthorization: f.c.proof,
        observedAtReal: f.c.at,
      });
      expect(draft.currentMaterializations).toEqual([]);
      expect(draft.financialPostingBatches).toEqual([]);
      expect(draft.inventoryPostings).toHaveLength(1);
      const candidate = prepareAtomicTransitionCandidate({
        command: f.c.command,
        commitAuthorization: f.c.proof,
        draft,
        sha256Hex: narrowCutoffSha,
      });
      expect((await f.repository.commit(candidate)).receipt.outcome).toBe(
        'COMMITTED',
      );
      expect((await f.repository.readFinalReceipt(f.c.command))?.outcome).toBe(
        'COMMITTED',
      );
      expect((await f.repository.commit(candidate)).source).toBe(
        'EXISTING_COMMIT',
      );
      await expect(
        f.runtime.candidateFactory.prepare({
          command: f.c.command,
          commitAuthorization: f.c.proof,
          observedAtReal: f.c.at,
        }),
      ).rejects.toThrow('NARROW_CURRENT_REPLAY_UNAVAILABLE_INVENTORY_EFFECT');
      await f.reset();
      const r = await f.db.query<{
        world_version: string;
        event_sequence: string;
        events: string;
        inventory: string;
        financial: string;
        queue: string;
      }>(
        `select world_version::text,event_sequence::text,(select count(*)::text from world_v2.authoritative_event)events,(select count(*)::text from world_v2.inventory_posting)inventory,(select count(*)::text from world_v2.financial_posting_batch)financial,(select queue_state from world_v2.command_queue)queue from world_v2.world_head`,
      );
      expect(r.rows[0]).toMatchObject({
        world_version: '1',
        event_sequence: '1',
        events: '1',
        inventory: '1',
        financial: '0',
        queue: 'FINALIZED',
      });
    } finally {
      await f.close();
    }
  }, 30000);
  it('revocation after candidate preparation is re-read inside commit and leaves no receipt/event/posting/head change', async () => {
    const f = await fixture();
    try {
      const draft = await f.runtime.candidateFactory.prepare({
        command: f.c.command,
        commitAuthorization: f.c.proof,
        observedAtReal: f.c.at,
      });
      const candidate = prepareAtomicTransitionCandidate({
        command: f.c.command,
        commitAuthorization: f.c.proof,
        draft,
        sha256Hex: narrowCutoffSha,
      });
      await f.reset();
      await f.db.query(
        'insert into world_v2.postwar_narrow_trade_rights_revocation values($1,$2)',
        [f.domainAdmissionRef, 'TEST_ONLY_REVOKE_BETWEEN_TRANSACTIONS'],
      );
      await f.db.exec('set session authorization ' + f.readerRole);
      await expect(f.repository.commit(candidate)).rejects.toThrow(
        'POSTWAR_NARROW_TRADE_CURRENT_MISSING',
      );
      expect(await f.repository.readFinalReceipt(f.c.command)).toBeNull();
      await f.reset();
      const r = await f.db.query<{
        events: string;
        postings: string;
        version: string;
      }>(
        'select(select count(*)::text from world_v2.authoritative_event)events,(select count(*)::text from world_v2.inventory_posting)postings,(select world_version::text from world_v2.world_head)version',
      );
      expect(r.rows[0]).toEqual({ events: '0', postings: '0', version: '0' });
    } finally {
      await f.close();
    }
  }, 30000);
});
