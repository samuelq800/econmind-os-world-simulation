/** TEST_ONLY instruments/adoptions in a disposable embedded PostgreSQL.
 * Economic facts, queue/lease integrity, Atomic writes and immutable receipts
 * use the actual Core/Worker implementations and official SQL artifacts. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import * as C from '@econmind/core';
import { centralBankTestOnlyFixture } from './g-dispatch-cb-test-only-fixture.js';
import { createPostwarCentralBankOmoRuntime } from '../../apps/world-worker/src/persistence/postwar-central-bank-omo-runtime.js';
import {
  publishCentralBankOmoOriginals,
  type CentralBankOmoOriginal,
} from '../../apps/world-worker/src/persistence/postgres-central-bank-omo-originals.js';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import type { AtomicTransitionDraft } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';

export const CB_ATOMIC_TEST_AT = '2026-10-07T00:00:00.000Z';
export const CB_ATOMIC_TEST_WORKER = 'WORKER_TEST_ONLY_CB1';
export const cbAtomicTestSha = (s: string) =>
  createHash('sha256').update(s).digest('hex');
const role = 'cb_omo_atomic_test_worker',
  team = 'TEAM_TEST_ONLY_CB1';
export async function createCentralBankOmoAtomicFixture(override?: {
  readonly seed: Readonly<C.OpeningSeed>;
  readonly command: C.CanonicalCommand;
  readonly facts: C.CentralBankOmoSourceFacts;
}) {
  const base = override
    ? {
        seed: override.seed,
        command: override.command,
        preparation: { source: { facts: override.facts } },
      }
    : centralBankTestOnlyFixture('BUY_GOVERNMENT_SECURITIES', '1');
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: base.seed.sources[0]!.sourceId,
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      sourceVersion: 'TEST_ONLY_CB_ATOMIC_V1',
      locator: 'fixture://TEST_ONLY_NOT_OFFICIAL_CB_INSTRUMENT',
      payload: {
        notice:
          'TEST_ONLY ledger and independent instrument originals; no postwar adoption',
      },
    },
    cbAtomicTestSha,
  );
  const { fingerprint: _fp, ...seedIntent } = base.seed;
  void _fp;
  const seed =
      override?.seed ??
      C.createOpeningSeed(
        { ...seedIntent, sources: [source] },
        cbAtomicTestSha,
      ),
    command = base.command;
  const db = new PGlite(),
    queries: string[] = [];
  let stage = 'official migration installation';
  try {
    const sql = async (path: string) => {
      stage = path;
      return db.exec(
        await readFile(new URL('../../' + path, import.meta.url), 'utf8'),
      );
    };
    for (const artifact of [
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
      '0016_world_v2_opening_seed.sql',
    ])
      await sql('database/migrations/artifacts/' + artifact);
    // Explicit TEST_ONLY admission/permit rows, not signatures or an issuer.
    // All economic/queue/receipt tables above use the actual migration artifacts.
    stage = 'TEST_ONLY admission/permit table shape';
    await db.exec(`create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,replay_binding text,model_version text,admission_ref text primary key,admitted_at_real timestamptz);
create table world_v2.runtime_admission_publication_permit(authorization_id text primary key,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
create table world_v2.runtime_admission_publication_revocation(authorization_id text);`);
    await sql('database/proposals/financial-posting-decimal-validation.sql');
    await sql('database/proposals/central-bank-omo-custody.sql');
    const executor: SqlExecutor = {
      async query<Row extends object>(
        statement: string,
        parameters: readonly unknown[] = [],
      ) {
        queries.push(statement);
        const r = await db.query<Row>(statement, [...parameters]);
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
      },
    };
    const scoped = (name: string | null): SqlDatabase => {
      const database: SqlDatabase = {
        query<Row extends object>(
          statement: string,
          parameters: readonly unknown[] = [],
        ) {
          return database.transaction((tx) =>
            tx.query<Row>(statement, parameters),
          );
        },
        async transaction(consume) {
          await db.exec('begin isolation level repeatable read');
          try {
            if (name) await db.exec('set local role ' + name);
            const value = await consume(executor);
            await db.exec('commit');
            return value;
          } catch (error) {
            await db.exec('rollback');
            throw error;
          }
        },
      };
      return database;
    };
    const admin = scoped(null),
      database = scoped(role),
      publisher = scoped('world_v2_cb_omo_source_publisher');
    await db.query(
      'insert into world_v2.world_head(world_id,world_version,event_sequence)values($1,0,0)',
      [seed.worldId],
    );
    const openingSeeds = new WorldOpeningSeedStore({
      database: admin,
      sha256Hex: cbAtomicTestSha,
    });
    if (
      (await openingSeeds.bootstrap({
        seed,
        bootstrappedAtReal: CB_ATOMIC_TEST_AT,
      })) !== 'BOOTSTRAPPED'
    )
      throw Error('actual opening bootstrap required');
    const admission = 'ADMISSION_' + '1'.repeat(64),
      replay = C.canonicalSerialize(seed.replayBinding);
    await db.query(
      'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,$5,$6,$7)',
      [
        seed.worldId,
        seed.seedId,
        seed.fingerprint,
        replay,
        seed.replayBinding.modelVersion,
        admission,
        CB_ATOMIC_TEST_AT,
      ],
    );
    await db.query(
      'insert into world_v2.runtime_admission_publication_permit values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        'PERMIT_TEST_ONLY',
        '1'.repeat(64),
        seed.worldId,
        seed.seedId,
        seed.fingerprint,
        seed.replayBinding.modelVersion,
        replay,
        '2026-10-06T00:00:00.000Z',
        '2026-10-08T00:00:00.000Z',
      ],
    );
    await db.query(
      `insert into world_v2.current_commit_authorization(world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)
    values($1,$2,$3,'CENTRAL_BANK',$4,$5,'1',true,$6)`,
      [
        command.worldId,
        command.authSubject,
        command.countryId,
        C.CENTRAL_BANK_OMO_CAPABILITY,
        team,
        CB_ATOMIC_TEST_AT,
      ],
    );
    await db.query(
      'insert into world_v2.world_writer_lease values($1,$2,1,$3,$3,$4)',
      [
        seed.worldId,
        CB_ATOMIC_TEST_WORKER,
        CB_ATOMIC_TEST_AT,
        '2026-10-07T00:01:00.000Z',
      ],
    );
    await db.query(
      `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,
    auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
        command.simTime.ticks.toString(),
        command.correlationId,
        command.submittedAtReal,
      ],
    );
    await db.query(
      `insert into world_v2.command_queue(world_id,command_id,authority_kind,priority_rank,available_at_sim_time,attempt_count)
    values($1,$2,'DISCRETIONARY_USER',0,10000,0)`,
      [command.worldId, command.commandId],
    );
    await db.query(
      `update world_v2.command_queue set queue_state='CLAIMED',attempt_count=1,claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1 where world_id=$1 and command_id=$2`,
      [
        command.worldId,
        command.commandId,
        CB_ATOMIC_TEST_WORKER,
        CB_ATOMIC_TEST_AT,
      ],
    );
    // A synthetic writer gets only actual Atomic I/O and lock privileges. It
    // never joins a source owner/publisher and never reads the raw opening row.
    stage = 'TEST_ONLY isolated writer/auth lock role profile';
    await db.exec(`create role ${role} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage on schema world_v2 to ${role};grant world_v2_cb_omo_source_reader to ${role};
grant select on world_v2.world_head,world_v2.world_writer_lease,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.current_materialization,world_v2.authoritative_commit_authorization,world_v2.notification_outbox,world_v2.current_commit_authorization to ${role};
grant update(world_version,event_sequence)on world_v2.world_head to ${role};grant update(fencing_token)on world_v2.world_writer_lease to ${role};grant update(command_id)on world_v2.command_submission to ${role};
grant update(authorization_version)on world_v2.current_commit_authorization to ${role};
grant insert on world_v2.authoritative_event,world_v2.financial_posting_batch,world_v2.command_receipt,world_v2.authoritative_commit_authorization,world_v2.notification_outbox to ${role};
grant update on world_v2.command_queue to ${role};
alter table world_v2.current_commit_authorization enable row level security;
create policy cb_atomic_test_auth_read on world_v2.current_commit_authorization for select to ${role} using(world_id='${seed.worldId}');
create policy cb_atomic_test_auth_lock on world_v2.current_commit_authorization for update to ${role} using(world_id='${seed.worldId}')with check(false);`);
    const facts = base.preparation.source.facts,
      quote = facts.quote;
    const original: CentralBankOmoOriginal = {
      schemaVersion: 'central-bank-omo-original-v1',
      worldId: seed.worldId,
      countryId: command.countryId,
      seedFingerprint: seed.fingerprint,
      sourceRef: quote.sourceRef,
      sourceRevision: 'TEST_ONLY_REV_1',
      domesticTreasuryRef: facts.domesticTreasuryRef,
      bank: facts.bank,
      centralBank: facts.centralBank,
      bankAccounts: facts.bankAccounts,
      centralBankAccounts: facts.centralBankAccounts,
      holdings: facts.holdings,
    };
    const adoption = 'ADOPTION_TEST_ONLY_CB_ATOMIC';
    await db.query(
      'insert into world_v2.central_bank_omo_adoption values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [
        adoption,
        seed.worldId,
        command.countryId,
        seed.seedId,
        seed.fingerprint,
        admission,
        '1',
        'ISSUER_TEST_ONLY_CB',
        'CUSTODIAN_TEST_ONLY_CB',
        original.sourceRef,
        original.sourceRevision,
        'TEST_ONLY',
        cbAtomicTestSha('TEST_ONLY independent instrument adoption'),
        cbAtomicTestSha(C.canonicalSerialize(original)),
      ],
    );
    await db.query(
      'insert into world_v2.central_bank_omo_quote_adoption values($1,$2,$3,$4)',
      [
        adoption,
        quote.quoteRef,
        cbAtomicTestSha(C.canonicalSerialize(quote)),
        cbAtomicTestSha('TEST_ONLY independent exact quote'),
      ],
    );
    await publishCentralBankOmoOriginals({
      database: publisher,
      adoptionRef: adoption,
      original,
      quote,
    });
    const runtime = createPostwarCentralBankOmoRuntime({
      database,
      worldId: seed.worldId,
      countryId: command.countryId,
      workerId: CB_ATOMIC_TEST_WORKER,
      workerRole: role,
      mode: 'TEST_ONLY_LOCAL',
    });
    await runtime.prepare(seed);
    const principal: C.AuthenticatedPrincipal = {
      authSubject: command.authSubject,
      facts: {
        user_id: command.authSubject,
        display_name: 'TEST_ONLY',
        school_id: null,
      },
      token: {
        subject: command.authSubject,
        issuer: 'TEST_ONLY',
        audience: 'TEST_ONLY',
        issuedAt: CB_ATOMIC_TEST_AT,
        expiresAt: '2026-10-08T00:00:00.000Z',
      },
    };
    const authorization = await C.authorizeOfficeCapability({
      principal,
      resolver: {
        async resolveCurrentIdentity() {
          return command.authSubject;
        },
        async resolveCurrentMembership() {
          const r = await db.query<{
            world_id: string;
            country_id: string;
            team_id: string;
            authorization_version: string;
            active: boolean;
          }>(
            "select world_id,country_id,team_id,authorization_version,active from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and office_id='CENTRAL_BANK'and capability=$3",
            [
              command.worldId,
              command.authSubject,
              C.CENTRAL_BANK_OMO_CAPABILITY,
            ],
          );
          const a = r.rows[0];
          if (r.rows.length !== 1 || !a) return null;
          return {
            authSubject: command.authSubject,
            worldId: C.worldId(a.world_id),
            countryId: C.countryId(a.country_id),
            teamId: C.teamId(a.team_id),
            authorizationVersion: a.authorization_version,
            officeAssignments: [C.officeId('CENTRAL_BANK')],
            active: a.active,
            suspended: false,
            isWorldAdmin: false,
            negotiationPartyIds: [],
          };
        },
      },
      worldId: command.worldId,
      requestedCountryId: command.countryId,
      requestedOfficeId: C.officeId('CENTRAL_BANK'),
      capability: C.CENTRAL_BANK_OMO_CAPABILITY,
    });
    const execution = createAuthoritativeWorkerExecution({
      database,
      workerId: CB_ATOMIC_TEST_WORKER,
      sha256Hex: cbAtomicTestSha,
      candidateFactory: runtime.factory,
      centralBankOmoSourceCommitProtectionPort:
        runtime.sourceCommitProtectionPort,
    });
    const input = {
      command,
      authorityKind: 'DISCRETIONARY_USER' as const,
      commitSimTime: command.simTime,
      recordedAtReal: CB_ATOMIC_TEST_AT,
      requiredCapability: C.CENTRAL_BANK_OMO_CAPABILITY,
      intakeAuthorization: authorization,
    };
    async function prepareDraft() {
      let value: {
        draft: AtomicTransitionDraft;
        proof: C.CommitAuthorizationProof;
      } | null = null;
      await C.processQueuedCommand({
        ...input,
        persistence: {
          async readFinalReceipt() {
            return null;
          },
          async recordZeroEffectReceipt(r) {
            throw Error('Unexpected zero effect ' + r.reasonCode);
          },
          async commitAuthorizedCommand(request) {
            if (!request.commitAuthorization)
              throw Error('genuine current proof required');
            const draft = await runtime.factory.prepare({
              command,
              commitAuthorization: request.commitAuthorization,
              observedAtReal: CB_ATOMIC_TEST_AT,
            });
            value = { draft, proof: request.commitAuthorization };
            return { transition: draft.transition, receipt: draft.receipt };
          },
        },
      });
      if (!value) throw Error('genuine candidate required');
      return value as {
        draft: AtomicTransitionDraft;
        proof: C.CommitAuthorizationProof;
      };
    }
    async function counts() {
      return (
        await db.query<{
          events: number;
          batches: number;
          receipts: number;
          finalized: number;
          audit: number;
          outbox: number;
          inventory: number;
          materials: number;
          version: string;
          sequence: string;
          queue: string;
        }>(
          `select(select count(*)::int from world_v2.authoritative_event)as events,(select count(*)::int from world_v2.financial_posting_batch)as batches,
    (select count(*)::int from world_v2.command_receipt)as receipts,(select count(*)::int from world_v2.command_queue where queue_state='FINALIZED')as finalized,
    (select count(*)::int from world_v2.authoritative_commit_authorization)as audit,(select count(*)::int from world_v2.notification_outbox)as outbox,
    (select count(*)::int from world_v2.inventory_posting)as inventory,(select count(*)::int from world_v2.current_materialization)as materials,
    (select world_version::text from world_v2.world_head)as version,(select event_sequence::text from world_v2.world_head)as sequence,(select queue_state from world_v2.command_queue)as queue`,
        )
      ).rows[0]!;
    }
    async function revoke(resource: 'SOURCE' | 'QUOTE') {
      await publisher.transaction((tx) =>
        tx.query('select world_v2.revoke_central_bank_omo_original($1,$2,$3)', [
          adoption,
          resource === 'SOURCE' ? 'SOURCE' : quote.quoteRef,
          'TEST_ONLY_REVOKED',
        ]),
      );
    }
    return {
      db,
      admin,
      database,
      seed,
      command,
      source,
      original,
      quote,
      runtime,
      execution,
      input,
      authorization,
      prepareDraft,
      counts,
      revoke,
      queries,
    };
  } catch (error: unknown) {
    try {
      await db.close();
    } catch (closeError: unknown) {
      throw new AggregateError(
        [error, closeError],
        'CB Atomic setup and cleanup failed',
        { cause: closeError },
      );
    }
    throw new Error(`CB_ATOMIC_TEST_SETUP:${stage}`, { cause: error });
  }
}
