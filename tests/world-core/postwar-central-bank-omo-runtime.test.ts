/** Embedded PostgreSQL + genuine Core OMO. All instruments, quote adoptions,
 * identities and permit rows are TEST_ONLY; no cfc securities are fabricated. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import { centralBankTestOnlyFixture } from '../support/g-dispatch-cb-test-only-fixture.js';
import {
  createPostwarCentralBankOmoRuntime,
  isPostwarCentralBankOmoRuntime,
  isPostwarCentralBankOmoSourceCommitProtectionPort,
  CENTRAL_BANK_OMO_SOURCE_PURPOSE,
  type CentralBankOmoSourceCommitRequest,
} from '../../apps/world-worker/src/persistence/postwar-central-bank-omo-runtime.js';
import {
  publishCentralBankOmoOriginals,
  type CentralBankOmoOriginal,
} from '../../apps/world-worker/src/persistence/postgres-central-bank-omo-originals.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import type { AtomicTransitionDraft } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-10-07T00:00:00.000Z',
  role = 'cb_omo_test_worker';
const worker = 'WORKER_TEST_ONLY_CB1',
  team = 'TEAM_TEST_ONLY_CB1';
function commandAt(
  c: C.CanonicalCommand,
  patch: {
    countryId?: string;
    commandId?: string;
    idempotencyKey?: string;
    expectedWorldVersion?: string;
  },
) {
  return C.parseCanonicalCommand(
    {
      schemaVersion: c.schemaVersion,
      worldId: c.worldId,
      countryId: c.countryId,
      commandId: c.commandId,
      idempotencyKey: c.idempotencyKey,
      expectedWorldVersion: c.expectedWorldVersion,
      actorId: c.actorId,
      authSubject: c.authSubject,
      officeId: c.officeId,
      commandType: c.commandType,
      correlationId: c.correlationId,
      simTime: c.simTime.toCanonicalValue(),
      submittedAtReal: c.submittedAtReal,
      payload: JSON.parse(c.canonicalPayload),
      ...patch,
    },
    sha,
  );
}
async function fixture(adopt = true) {
  const base = centralBankTestOnlyFixture();
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: base.seed.sources[0]!.sourceId,
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      sourceVersion: 'TEST_ONLY_CB_CUSTODY_V1',
      locator: 'fixture://TEST_ONLY_NOT_OFFICIAL_CB_INSTRUMENT',
      payload: {
        notice: 'TEST_ONLY ledger, no actual postwar source or admission',
      },
    },
    sha,
  );
  const { fingerprint: _fp, ...intent } = base.seed;
  void _fp;
  const seed = C.createOpeningSeed({ ...intent, sources: [source] }, sha);
  const facts = base.preparation.source.facts;
  const original: CentralBankOmoOriginal = {
    schemaVersion: 'central-bank-omo-original-v1',
    worldId: seed.worldId,
    countryId: base.command.countryId,
    seedFingerprint: seed.fingerprint,
    sourceRef: facts.quote.sourceRef,
    sourceRevision: 'TEST_ONLY_REV_1',
    domesticTreasuryRef: facts.domesticTreasuryRef,
    bank: facts.bank,
    centralBank: facts.centralBank,
    bankAccounts: facts.bankAccounts,
    centralBankAccounts: facts.centralBankAccounts,
    holdings: facts.holdings,
  };
  const quote = facts.quote,
    db = new PGlite();
  await db.exec(`create schema world_v2;
create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
create table world_v2.opening_seed(world_id text,seed_id text,opening_world_version bigint,replay_binding text,canonical_payload text,seed_fingerprint text,unique(world_id,seed_fingerprint));
create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,replay_binding text,model_version text,admission_ref text primary key,admitted_at_real timestamptz);
create table world_v2.runtime_admission_publication_permit(authorization_id text primary key,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
create table world_v2.runtime_admission_publication_revocation(authorization_id text);
create table world_v2.current_commit_authorization(world_id text,auth_subject uuid,country_id text,office_id text,team_id text,authorization_version text,capability text,active boolean);
create table world_v2.world_writer_lease(world_id text primary key,holder_id text,fencing_token bigint,acquired_at_real timestamptz,renewed_at_real timestamptz,lease_expires_at_real timestamptz);
create table world_v2.authoritative_event(world_id text,event_id text,event_type text,causation_command_id text,correlation_id text,world_version bigint,event_sequence bigint,sim_time bigint,recorded_at_real timestamptz,corrects_event_id text,schema_version text,canonical_payload text,event_fingerprint text,payload_sha256 text);
create table world_v2.command_submission(world_id text,actor_id text,auth_subject uuid,canonical_payload text,country_id text,expected_world_version bigint,command_fingerprint text,command_id text,idempotency_key text,office_id text,payload_sha256 text,schema_version text,sim_time bigint,submitted_at_real timestamptz,command_type text,correlation_id text);
create table world_v2.command_receipt(world_id text,command_id text,idempotency_key text,schema_version text,command_fingerprint text,outcome text,reason_code text,transition_id text,world_version_before bigint,world_version_after bigint,sim_time bigint,event_ids text[],recorded_at_real timestamptz);
create table world_v2.financial_posting_batch(world_id text,batch_id text,causation_command_id text,canonical_payload text,batch_fingerprint text);
create table world_v2.inventory_posting(world_id text);
create function world_v2.reject_authoritative_history_mutation()returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE_HISTORY';end;$$;`);
  await db.exec(
    await readFile(
      new URL(
        '../../database/proposals/central-bank-omo-custody.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await db.exec(`create role ${role} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage on schema world_v2 to ${role};grant world_v2_cb_omo_source_reader to ${role};`);
  const executor: SqlExecutor = {
    async query<Row extends object>(
      sql: string,
      args: readonly unknown[] = [],
    ) {
      const r = await db.query<Row>(sql, [...args]);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
  const scoped = (name: string): SqlDatabase => ({
    ...executor,
    async transaction(consume) {
      await db.exec(
        `begin isolation level repeatable read;set local role ${name}`,
      );
      try {
        const v = await consume(executor);
        await db.exec('commit');
        return v;
      } catch (error) {
        await db.exec('rollback');
        throw error;
      }
    },
  });
  const database = scoped(role),
    publisher = scoped('world_v2_cb_omo_source_publisher');
  const { fingerprint, ...seedIntent } = seed;
  const admission = 'ADMISSION_' + '1'.repeat(64),
    replay = C.canonicalSerialize(seed.replayBinding);
  await db.query('insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5)', [
    seed.worldId,
    seed.seedId,
    replay,
    C.canonicalSerialize(seedIntent),
    fingerprint,
  ]);
  await db.query('insert into world_v2.world_head values($1,0,0)', [
    seed.worldId,
  ]);
  await db.query(
    'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,$5,$6,$7)',
    [
      seed.worldId,
      seed.seedId,
      fingerprint,
      replay,
      seed.replayBinding.modelVersion,
      admission,
      at,
    ],
  );
  await db.query(
    'insert into world_v2.runtime_admission_publication_permit values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      'PERMIT_TEST_ONLY',
      '1'.repeat(64),
      seed.worldId,
      seed.seedId,
      fingerprint,
      seed.replayBinding.modelVersion,
      replay,
      '2026-10-06T00:00:00.000Z',
      '2026-10-08T00:00:00.000Z',
    ],
  );
  await db.query(
    'insert into world_v2.current_commit_authorization values($1,$2,$3,$4,$5,$6,$7,true)',
    [
      seed.worldId,
      base.command.authSubject,
      base.command.countryId,
      'CENTRAL_BANK',
      team,
      '1',
      C.CENTRAL_BANK_OMO_CAPABILITY,
    ],
  );
  await db.query(
    'insert into world_v2.world_writer_lease values($1,$2,1,$3,$3,$4)',
    [seed.worldId, worker, at, '2026-10-07T00:01:00.000Z'],
  );
  const adoption = 'ADOPTION_TEST_ONLY_CB_OMO';
  async function admit() {
    await db.query(
      'insert into world_v2.central_bank_omo_adoption values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [
        adoption,
        seed.worldId,
        base.command.countryId,
        seed.seedId,
        fingerprint,
        admission,
        '1',
        'ISSUER_TEST_ONLY_CB',
        'CUSTODIAN_TEST_ONLY_CB',
        original.sourceRef,
        original.sourceRevision,
        'TEST_ONLY',
        sha('TEST_ONLY independent instrument admission'),
        sha(C.canonicalSerialize(original)),
      ],
    );
    await db.query(
      'insert into world_v2.central_bank_omo_quote_adoption values($1,$2,$3,$4)',
      [
        adoption,
        quote.quoteRef,
        sha(C.canonicalSerialize(quote)),
        sha('TEST_ONLY independent quote admission'),
      ],
    );
    await publishCentralBankOmoOriginals({
      database: publisher,
      adoptionRef: adoption,
      original,
      quote,
    });
  }
  if (adopt) await admit();
  const config = {
    database,
    worldId: seed.worldId,
    countryId: base.command.countryId,
    workerId: worker,
    workerRole: role,
    mode: 'TEST_ONLY_LOCAL' as const,
  };
  const runtime = createPostwarCentralBankOmoRuntime(config);
  return {
    base,
    seed,
    db,
    database,
    publisher,
    executor,
    adoption,
    admit,
    original,
    quote,
    runtime,
    config,
  };
}
async function draft(
  f: Awaited<ReturnType<typeof fixture>>,
  command = f.base.command,
) {
  const authorization = await C.authorizeOfficeCapability({
    principal: {
      authSubject: command.authSubject,
      facts: {
        user_id: command.authSubject,
        display_name: null,
        school_id: null,
      },
      token: {
        subject: command.authSubject,
        issuer: 'TEST_ONLY',
        audience: 'TEST_ONLY',
        issuedAt: at,
        expiresAt: '2026-10-08T00:00:00.000Z',
      },
    },
    resolver: {
      async resolveCurrentIdentity() {
        return command.authSubject;
      },
      async resolveCurrentMembership() {
        return {
          authSubject: command.authSubject,
          authorizationVersion: '1',
          worldId: command.worldId,
          teamId: C.teamId(team),
          countryId: command.countryId,
          officeAssignments: [C.officeId('CENTRAL_BANK')],
          active: true,
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
  let result: {
    draft: AtomicTransitionDraft;
    proof: C.CommitAuthorizationProof;
  } | null = null;
  await C.processQueuedCommand({
    command,
    authorityKind: 'DISCRETIONARY_USER',
    commitSimTime: command.simTime,
    recordedAtReal: at,
    requiredCapability: C.CENTRAL_BANK_OMO_CAPABILITY,
    intakeAuthorization: authorization,
    persistence: {
      async readFinalReceipt() {
        return null;
      },
      async recordZeroEffectReceipt(receipt) {
        return receipt;
      },
      async commitAuthorizedCommand(input) {
        if (!input.commitAuthorization)
          throw new Error('genuine proof required');
        const value = await f.runtime.factory.prepare({
          command,
          commitAuthorization: input.commitAuthorization,
          observedAtReal: at,
        });
        result = { draft: value, proof: input.commitAuthorization };
        return { transition: value.transition, receipt: value.receipt };
      },
    },
  });
  if (!result) throw new Error('genuine proof/draft missing');
  return result as {
    draft: AtomicTransitionDraft;
    proof: C.CommitAuthorizationProof;
  };
}
function request(
  f: Awaited<ReturnType<typeof fixture>>,
  v: Awaited<ReturnType<typeof draft>>,
): CentralBankOmoSourceCommitRequest {
  return {
    phase: 'BEFORE_EVENTS',
    purpose: CENTRAL_BANK_OMO_SOURCE_PURPOSE,
    command: f.base.command,
    transition: v.draft.transition,
    financialPostingBatches: v.draft.financialPostingBatches,
    currentHead: {
      worldId: f.seed.worldId,
      worldVersion: '0',
      eventSequence: '0',
    },
    observedAtReal: at,
    readBinding: v.draft.officeOperatingSourceReadBinding,
    commitAuthorization: v.proof,
  };
}
/** Store genuine Core output as immutable fixture history. This deliberately
 * does not claim Atomic write acceptance; the root-owned Atomic seam is a
 * separate integration check. Online runtime must still replay every byte. */
async function storeCoreFrame(
  f: Awaited<ReturnType<typeof fixture>>,
  v: Awaited<ReturnType<typeof draft>>,
) {
  const c = f.base.command,
    e = v.draft.transition.events[0]!,
    receipt = v.draft.receipt,
    batch = v.draft.financialPostingBatches[0]!;
  const { fingerprint: _fp, ...batchIntent } = batch;
  void _fp;
  await f.db.query(
    'insert into world_v2.command_submission values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
    [
      c.worldId,
      c.actorId,
      c.authSubject,
      c.canonicalPayload,
      c.countryId,
      c.expectedWorldVersion,
      c.fingerprint,
      c.commandId,
      c.idempotencyKey,
      c.officeId,
      c.payloadHash,
      c.schemaVersion,
      c.simTime.ticks.toString(),
      c.submittedAtReal,
      c.commandType,
      c.correlationId,
    ],
  );
  await f.db.query(
    'insert into world_v2.authoritative_event values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
    [
      e.worldId,
      e.eventId,
      e.eventType,
      e.causationCommandId,
      e.correlationId,
      e.worldVersion,
      e.sequence,
      e.simTime.ticks.toString(),
      e.recordedAtReal,
      e.correctsEventId,
      e.schemaVersion,
      e.canonicalPayload,
      e.fingerprint,
      e.payloadHash,
    ],
  );
  await f.db.query(
    'insert into world_v2.command_receipt values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
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
      receipt.simTime.ticks.toString(),
      receipt.eventIds,
      receipt.recordedAtReal,
    ],
  );
  await f.db.query(
    'insert into world_v2.financial_posting_batch values($1,$2,$3,$4,$5)',
    [
      batch.worldId,
      batch.batchId,
      batch.causationCommandId,
      C.canonicalSerialize(batchIntent),
      batch.fingerprint,
    ],
  );
  await f.db.query(
    'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
    [c.worldId],
  );
}
describe('fixed CB OMO custody/runtime (TEST_ONLY embedded PostgreSQL)', () => {
  it('does not turn opening admission or a copied port into instrument authority', async () => {
    const f = await fixture(false);
    try {
      expect(isPostwarCentralBankOmoRuntime(f.runtime)).toBe(true);
      expect(isPostwarCentralBankOmoRuntime({ ...f.runtime })).toBe(false);
      expect(
        isPostwarCentralBankOmoSourceCommitProtectionPort({
          ...f.runtime.sourceCommitProtectionPort,
        }),
      ).toBe(false);
      await expect(f.runtime.preflight(f.base.command, at)).rejects.toThrow(
        'GENUINE_STORED_OPENING_NOT_PREPARED',
      );
      await expect(f.runtime.prepare(f.seed)).rejects.toThrow(
        'CB_OMO_INDEPENDENT_SOURCE_ADOPTION_REQUIRED',
      );
      await expect(
        publishCentralBankOmoOriginals({
          database: f.publisher,
          adoptionRef: f.adoption,
          original: f.original,
          quote: f.quote,
        }),
      ).rejects.toThrow('CB_OMO_INDEPENDENT_SOURCE_ADOPTION_REQUIRED');
    } finally {
      await f.db.close();
    }
  });
  it('registered exact originals reach Core four-leg OMO and genuine same-tx cutoff; no raw grants', async () => {
    const f = await fixture();
    try {
      await f.runtime.prepare(f.seed);
      await f.runtime.preflight(f.base.command, at);
      const v = await draft(f);
      expect(v.draft.transition.events[0]?.eventType).toBe(
        C.CENTRAL_BANK_OMO_EVENT,
      );
      expect(v.draft.financialPostingBatches).toHaveLength(1);
      expect(v.draft.financialPostingBatches[0]?.legs).toHaveLength(4);
      const audit = await f.database.transaction((tx) =>
        f.runtime.sourceCommitProtectionPort.assertCurrentFrom(
          tx,
          request(f, v),
        ),
      );
      expect(audit.readBindingFingerprint).toBe(
        C.canonicalSha256(
          C.canonicalHashInput(v.draft.officeOperatingSourceReadBinding),
          sha,
        ),
      );
      expect(
        isPostwarCentralBankOmoSourceCommitProtectionPort(
          f.runtime.sourceCommitProtectionPort,
        ),
      ).toBe(true);
      await expect(
        f.database.transaction((tx) =>
          tx.query('select * from world_v2.opening_seed'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        f.database.transaction((tx) =>
          tx.query('select * from world_v2.central_bank_omo_original'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        f.database.transaction((tx) =>
          tx.query(
            'update world_v2.current_commit_authorization set active=false',
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      expect(
        (await f.db.query('select * from world_v2.authoritative_event')).rows,
      ).toHaveLength(0);
    } finally {
      await f.db.close();
    }
  });
  it('rejects a forged quote at publisher, TEST_ONLY at official host, and cross-country command', async () => {
    const f = await fixture();
    try {
      await expect(
        publishCentralBankOmoOriginals({
          database: f.publisher,
          adoptionRef: f.adoption,
          original: f.original,
          quote: { ...f.quote, pricePerFace: '2' },
        }),
      ).rejects.toThrow('CB_OMO_INDEPENDENT_EXACT_QUOTE_ADOPTION_REQUIRED');
      const official = createPostwarCentralBankOmoRuntime({
        ...f.config,
        mode: 'OFFICIAL_RUNTIME',
      });
      await official.prepare(f.seed);
      await expect(official.preflight(f.base.command, at)).rejects.toThrow(
        'EXACT_INDEPENDENT_SOURCE_ADOPTION_REQUIRED',
      );
      await f.runtime.prepare(f.seed);
      const foreign = commandAt(f.base.command, {
        countryId: 'COUNTRY_FOREIGN',
      });
      await expect(f.runtime.preflight(foreign, at)).rejects.toThrow(
        'FIXED_COUNTRY_WORLD_REQUIRED',
      );
    } finally {
      await f.db.close();
    }
  });
  it.each(['SOURCE', 'QUOTE'] as const)(
    'rechecks actual %s revocation after preparation, not a cached Ready',
    async (resource) => {
      const f = await fixture();
      try {
        await f.runtime.prepare(f.seed);
        const v = await draft(f);
        await f.publisher.transaction((tx) =>
          tx.query(
            'select world_v2.revoke_central_bank_omo_original($1,$2,$3)',
            [
              f.adoption,
              resource === 'SOURCE' ? 'SOURCE' : f.quote.quoteRef,
              'TEST_ONLY_REVOKED',
            ],
          ),
        );
        await expect(
          f.database.transaction((tx) =>
            f.runtime.sourceCommitProtectionPort.assertCurrentFrom(
              tx,
              request(f, v),
            ),
          ),
        ).rejects.toThrow(
          resource === 'SOURCE'
            ? 'CB_OMO_SOURCE_REVOKED'
            : 'CB_OMO_QUOTE_REVOKED',
        );
        expect(
          (await f.db.query('select * from world_v2.authoritative_event')).rows,
        ).toHaveLength(0);
      } finally {
        await f.db.close();
      }
    },
  );
  it('refuses omitted/changed actual posting and current authorization revision without writing', async () => {
    const f = await fixture();
    try {
      await f.runtime.prepare(f.seed);
      const v = await draft(f),
        r = request(f, v);
      await expect(
        f.database.transaction((tx) =>
          f.runtime.sourceCommitProtectionPort.assertCurrentFrom(tx, {
            ...r,
            financialPostingBatches: [],
          }),
        ),
      ).rejects.toThrow('EXACT_OMO_EVENT_AND_BATCH_REQUIRED');
      await expect(
        f.database.transaction((tx) =>
          f.runtime.sourceCommitProtectionPort.assertCurrentFrom(tx, {
            ...r,
            financialPostingBatches: [
              {
                ...r.financialPostingBatches[0]!,
                fingerprint: `sha256:${'f'.repeat(64)}` as const,
              },
            ],
          }),
        ),
      ).rejects.toThrow('CORE_EVENT_OR_ACTUAL_FINANCIAL_BATCH_DIFFERS');
      await f.db.exec(
        'update world_v2.current_commit_authorization set active=false',
      );
      await expect(
        f.database.transaction((tx) =>
          f.runtime.sourceCommitProtectionPort.assertCurrentFrom(tx, r),
        ),
      ).rejects.toThrow('CB_OMO_CURRENT_EXACT_AUTHORIZATION_REQUIRED');
      expect(
        (await f.db.query('select * from world_v2.financial_posting_batch'))
          .rows,
      ).toHaveLength(0);
    } finally {
      await f.db.close();
    }
  });
  it('replays the full genuine stored OMO prefix before a second operation; unknown/corrupt history is never filtered', async () => {
    const f = await fixture();
    try {
      await f.runtime.prepare(f.seed);
      const first = await draft(f);
      await storeCoreFrame(f, first);
      const quote = {
        ...f.quote,
        quoteRef: 'QUOTE_TEST_ONLY_HEAD_1',
        worldVersion: '1',
      };
      await f.db.query(
        'insert into world_v2.central_bank_omo_quote_adoption values($1,$2,$3,$4)',
        [
          f.adoption,
          quote.quoteRef,
          sha(C.canonicalSerialize(quote)),
          sha('TEST_ONLY quote at actual head1'),
        ],
      );
      await publishCentralBankOmoOriginals({
        database: f.publisher,
        adoptionRef: f.adoption,
        original: f.original,
        quote,
      });
      const command = commandAt(f.base.command, {
        commandId: 'COMMAND_TEST_ONLY_SECOND_OMO',
        idempotencyKey: 'IDEM_TEST_ONLY_SECOND_OMO',
        expectedWorldVersion: '1',
      });
      await f.runtime.preflight(command, at);
      const next = await draft(f, command);
      expect(next.draft.transition.worldVersionBefore).toBe('1');
      expect(next.draft.transition.events[0]?.sequence).toBe('2');
      const event = JSON.parse(
        next.draft.transition.events[0]!.canonicalPayload,
      ) as { source: C.CentralBankOmoSourceFacts };
      expect(
        event.source.holdings.find(
          (h) => h.holderRef === f.original.bank.bankRef,
        )?.faceValue,
      ).toBe('72');
      // The schema here is intentionally a small read fixture, allowing this
      // corruption injection. Production immutable history is not disabled.
      await f.db.exec(
        "update world_v2.authoritative_event set event_type='UNKNOWN_ECONOMIC_EVENT'",
      );
      await expect(f.runtime.preflight(command, at)).rejects.toThrow(
        'EXACT_OMO_EVENT_REQUIRED',
      );
    } finally {
      await f.db.close();
    }
  });
});
