/** Small native embedded PG/Core fixture. All capital/adoptions are explicitly
 * TEST_ONLY; this proves the adapter/guard boundary, not 70-country admission. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  CAPTAIN_SOURCE_PURPOSE,
  createPostwarCaptainRuntime,
  isPostwarCaptainSourceCommitProtectionPort,
  type CaptainSourceCommitRequest,
} from '../../apps/world-worker/src/persistence/postwar-captain-runtime.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import type { AtomicTransitionDraft } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const world = 'WORLD_CAPTAIN_GUARD_TEST',
  country = 'COUNTRY_01',
  worker = 'WORKER_CAPTAIN_GUARD_TEST';
const now = '2026-10-28T12:00:00.000Z',
  subject = '11111111-1111-4111-8111-111111111111';
const workerRole = 'captain_guard_test_worker';
const q = (amount: string) => ({ amount, unit: 'political_capital' });
async function fixture(withOriginals = true, atomic = false) {
  const db = new PGlite();
  if (atomic) {
    const migrations = [
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
    ];
    for (const path of migrations)
      await db.exec(
        await readFile(
          new URL(
            '../../database/migrations/artifacts/' + path,
            import.meta.url,
          ),
          'utf8',
        ),
      );
  } else
    await db.exec(`create schema world_v2;
    create table world_v2.opening_seed(world_id text,seed_id text,opening_world_version text,replay_binding text,canonical_payload text,seed_fingerprint text,unique(world_id,seed_fingerprint));
    create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
    create table world_v2.world_writer_lease(world_id text primary key,holder_id text,fencing_token bigint,acquired_at_real timestamptz,renewed_at_real timestamptz,lease_expires_at_real timestamptz);
    create table world_v2.current_commit_authorization(world_id text,auth_subject uuid,country_id text,office_id text,team_id text,authorization_version text,capability text,active boolean);
    create table world_v2.command_submission(world_id text,actor_id text,auth_subject uuid,canonical_payload text,country_id text,expected_world_version bigint,command_fingerprint text,command_id text,idempotency_key text,office_id text,payload_sha256 text,schema_version text,sim_time bigint,submitted_at_real timestamptz,command_type text,correlation_id text);
    create table world_v2.authoritative_event(world_id text,event_id text,event_type text,causation_command_id text,correlation_id text,world_version bigint,event_sequence bigint,sim_time bigint,recorded_at_real timestamptz,corrects_event_id text,schema_version text,canonical_payload text,event_fingerprint text,payload_sha256 text);
    create table world_v2.inventory_posting(world_id text,causation_command_id text,canonical_payload text,posting_fingerprint text,world_version_after bigint,posting_id text);
    create table world_v2.financial_posting_batch(world_id text,causation_command_id text,canonical_payload text,batch_fingerprint text,world_version_after bigint,batch_id text);
    create table world_v2.command_receipt(world_id text,command_id text,outcome text,world_version_after bigint);
    create function world_v2.reject_authoritative_history_mutation()returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE_HISTORY';end;$$;`);
  await db.exec(
    await readFile(
      new URL(
        '../../database/proposals/captain-operating-custody.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await db.exec(`create role ${workerRole} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
    grant world_v2_captain_source_reader to ${workerRole};grant usage on schema world_v2 to ${workerRole};
    grant select on world_v2.world_head,world_v2.current_commit_authorization to ${workerRole};
    grant update(world_version) on world_v2.world_head to ${workerRole};grant update(authorization_version)on world_v2.current_commit_authorization to ${workerRole};
    grant select on world_v2.opening_seed,world_v2.world_head,world_v2.command_submission,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.command_receipt to world_v2_captain_source_reader;
    grant update(world_version) on world_v2.world_head to world_v2_captain_source_reader;grant update(command_id) on world_v2.command_submission to world_v2_captain_source_reader;`);
  if (atomic)
    await db.exec(`
    create policy captain_test_only_seed_read on world_v2.opening_seed for select to world_v2_captain_source_reader using(world_id='${world}');
    grant select on world_v2.world_writer_lease,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.current_materialization,world_v2.authoritative_commit_authorization,world_v2.notification_outbox to ${workerRole};
    grant update(fencing_token)on world_v2.world_writer_lease to ${workerRole};grant update(command_id)on world_v2.command_submission to ${workerRole};
    grant insert on world_v2.authoritative_event,world_v2.command_receipt,world_v2.authoritative_commit_authorization,world_v2.notification_outbox,world_v2.current_materialization to ${workerRole};
    grant update on world_v2.command_queue,world_v2.current_materialization to ${workerRole};grant update(event_sequence)on world_v2.world_head to ${workerRole};`);
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_CAPTAIN'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'fixture://TEST_ONLY_NOT_ADMISSION',
      sourceVersion: 'TEST_ONLY_V1',
      payload: { fixture: true },
    },
    sha,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_CAPTAIN_GUARD_TEST'),
      worldId: C.worldId(world),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
  const { fingerprint, ...seedIntent } = seed;
  await db.query(
    'insert into world_v2.world_head(world_id,world_version,event_sequence) values($1,0,0)',
    [world],
  );
  await db.query(
    atomic
      ? 'insert into world_v2.opening_seed(world_id,seed_id,opening_world_version,replay_binding,canonical_payload,seed_fingerprint,bootstrapped_at_real) values($1,$2,$3,$4,$5,$6,$7)'
      : 'insert into world_v2.opening_seed values($1,$2,$3,$4,$5,$6)',
    [
      world,
      seed.seedId,
      '0',
      C.canonicalSerialize(seed.replayBinding),
      C.canonicalSerialize(seedIntent),
      fingerprint,
      ...(atomic ? [now] : []),
    ],
  );
  await db.query(
    'insert into world_v2.world_writer_lease values($1,$2,1,$3,$3,$4)',
    [world, worker, now, '2026-10-28T12:05:00.000Z'],
  );
  await db.query(
    atomic
      ? "insert into world_v2.current_commit_authorization(world_id,auth_subject,country_id,office_id,team_id,authorization_version,capability,active,refreshed_at_real) values($1,$2,$3,'CAPTAIN','TEAM_CAPTAIN_TEST','1','CAPTAIN_CABINET',true,$4)"
      : "insert into world_v2.current_commit_authorization values($1,$2,$3,'CAPTAIN','TEAM_CAPTAIN_TEST','1','CAPTAIN_CABINET',true)",
    [world, subject, country, ...(atomic ? [now] : [])],
  );
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      commandId: 'COMMAND_CAPTAIN_GUARD_TEST',
      commandType: C.CAPTAIN_POLITICAL_CAPITAL_COMMAND,
      actorId: 'ACTOR_CAPTAIN_GUARD_TEST',
      authSubject: subject,
      correlationId: 'CORRELATION_CAPTAIN_TEST',
      worldId: world,
      countryId: country,
      officeId: 'CAPTAIN',
      expectedWorldVersion: '0',
      idempotencyKey: 'IDEM_CAPTAIN_GUARD_TEST',
      simTime: '1000',
      submittedAtReal: now,
      payload: {
        schemaVersion: C.CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
        fromBucket: 'FISCAL_REFORM',
        toBucket: 'INDUSTRIAL_STRATEGY',
        amount: q('2'),
        reasonFactRef: 'REASON_CAPTAIN_GUARD_TEST',
      },
    },
    sha,
  );
  await db.query(
    'insert into world_v2.command_submission(world_id,actor_id,auth_subject,canonical_payload,country_id,expected_world_version,command_fingerprint,command_id,idempotency_key,office_id,payload_sha256,schema_version,sim_time,submitted_at_real,command_type,correlation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
    [
      world,
      command.actorId,
      subject,
      command.canonicalPayload,
      country,
      '0',
      command.fingerprint,
      command.commandId,
      command.idempotencyKey,
      'CAPTAIN',
      command.payloadHash,
      command.schemaVersion,
      '1000',
      now,
      command.commandType,
      command.correlationId,
    ],
  );
  if (atomic) {
    await db.query(
      "insert into world_v2.command_queue(world_id,command_id,authority_kind,priority_rank,available_at_sim_time,attempt_count) values($1,$2,'DISCRETIONARY_USER',0,1000,0)",
      [world, command.commandId],
    );
    await db.query(
      "update world_v2.command_queue set queue_state='CLAIMED',attempt_count=1,claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1 where world_id=$1 and command_id=$2",
      [world, command.commandId, worker, now],
    );
  }
  if (withOriginals) {
    await db.query(
      'insert into world_v2.captain_operating_source_adoption values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        'ADOPTION_CAPTAIN_TEST',
        world,
        country,
        fingerprint,
        'ISSUER_TEST_ONLY',
        'CUSTODIAN_TEST_ONLY',
        'ADMISSION_TEST_ONLY',
        'REV_1',
        sha('TEST_ONLY_NOT_ADMISSION'),
      ],
    );
    const capital = {
      capitalRef: 'CAPITAL_TEST_ONLY',
      countryRef: country,
      opening: q('42'),
      generated: q('0'),
      total: q('42'),
      available: q('42'),
      spent: q('0'),
      closing: q('42'),
      buckets: C.POLITICAL_CAPITAL_BUCKETS.map((bucket) => ({
        bucket,
        balance: q('6'),
      })),
    };
    const records = [
      [
        'GENESIS',
        'GENESIS_CAPTAIN_GUARD_TEST',
        {
          schemaVersion: 'captain-operating-genesis-v1',
          worldId: world,
          countryId: country,
          seedId: seed.seedId,
          seedFingerprint: fingerprint,
          semanticRevision: 'TEST_ONLY_V1',
          capital,
        },
      ],
      [
        'REASON',
        'REASON_CAPTAIN_GUARD_TEST',
        {
          schemaVersion: 'captain-operating-reason-v1',
          worldId: world,
          countryId: country,
          reason: {
            countryRef: country,
            recordRef: 'CABINET_TEST_ONLY',
            reason: 'Explicit TEST_ONLY reason.',
          },
        },
      ],
    ] as const;
    for (const [kind, factRef, payload] of records) {
      const canonicalPayload = C.canonicalSerialize(payload);
      const record = {
        recordId: factRef,
        revision: 'REV_1',
        factRef,
        sourceRef: 'SOURCE_TEST_ONLY_CAPTAIN',
        predecessorFactRefs: ['TEST_ONLY_PARENT'],
        issuerRef: 'ISSUER_TEST_ONLY',
        custodianRef: 'CUSTODIAN_TEST_ONLY',
        admissionRef: 'ADMISSION_TEST_ONLY',
        admissionRevision: 'REV_1',
        sourceClass: 'TEST_ONLY',
        effectiveFromSimTime: '0',
        effectiveUntilSimTime: null,
        revokedByRevision: null,
        canonicalPayload,
        payloadSHA256: sha(canonicalPayload),
      };
      const bytes = C.canonicalSerialize(record);
      await db.query(
        'insert into world_v2.captain_operating_original values($1,$2,$3,$4,$5)',
        ['ADOPTION_CAPTAIN_TEST', kind, factRef, bytes, sha(bytes)],
      );
    }
  }
  const queries: string[] = [];
  const executor: SqlExecutor = {
    async query<Row extends object>(
      sql: string,
      args: readonly unknown[] = [],
    ) {
      queries.push(sql);
      const r = await db.query<Row>(sql, [...args]);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
  const database: SqlDatabase = {
    async query<Row extends object>(
      sql: string,
      args: readonly unknown[] = [],
    ) {
      return atomic
        ? database.transaction((tx) => tx.query<Row>(sql, args))
        : executor.query<Row>(sql, args);
    },
    async transaction(consume) {
      await db.exec(
        `begin isolation level repeatable read;set local role ${workerRole}`,
      );
      try {
        const r = await consume(executor);
        await db.exec('commit');
        return r;
      } catch (error) {
        await db.exec('rollback');
        throw error;
      }
    },
  };
  const runtime = createPostwarCaptainRuntime({
    database,
    workerId: worker,
    workerRole,
    mode: 'TEST_ONLY_LOCAL',
  });
  const principal: C.AuthenticatedPrincipal = {
    authSubject: C.authSubject(subject),
    facts: { user_id: subject, display_name: 'TEST_ONLY', school_id: null },
    token: {
      subject,
      issuer: 'TEST_ONLY',
      audience: 'world',
      issuedAt: now,
      expiresAt: '2026-10-28T13:00:00.000Z',
    },
  };
  const authorization = await C.authorizeOfficeCapability({
    principal,
    resolver: {
      async resolveCurrentIdentity() {
        return principal.authSubject;
      },
      async resolveCurrentMembership() {
        return {
          authSubject: principal.authSubject,
          authorizationVersion: '1',
          worldId: C.worldId(world),
          countryId: C.countryId(country),
          teamId: C.teamId('TEAM_CAPTAIN_TEST'),
          officeAssignments: ['CAPTAIN'],
          active: true,
          suspended: false,
          isWorldAdmin: false,
          negotiationPartyIds: [],
        };
      },
    },
    worldId: C.worldId(world),
    requestedCountryId: C.countryId(country),
    requestedOfficeId: 'CAPTAIN',
    capability: 'CAPTAIN_CABINET',
  });
  let captured:
    | { draft: AtomicTransitionDraft; proof: C.CommitAuthorizationProof }
    | undefined;
  async function prepare() {
    await C.processQueuedCommand({
      command,
      authorityKind: 'DISCRETIONARY_USER',
      commitSimTime: command.simTime,
      recordedAtReal: now,
      requiredCapability: 'CAPTAIN_CABINET',
      intakeAuthorization: authorization,
      persistence: {
        async readFinalReceipt() {
          return null;
        },
        async recordZeroEffectReceipt(r) {
          throw Error('Unexpected zero-effect ' + r.reasonCode);
        },
        async commitAuthorizedCommand(input) {
          const draft = await runtime.factory.prepare({
            command,
            commitAuthorization: input.commitAuthorization,
            observedAtReal: now,
          });
          captured = { draft, proof: input.commitAuthorization };
          return { receipt: draft.receipt, transition: draft.transition };
        },
      },
    });
    if (!captured) throw Error('draft missing');
    return captured;
  }
  function request(
    value: Awaited<ReturnType<typeof prepare>>,
  ): CaptainSourceCommitRequest {
    return {
      phase: 'BEFORE_EVENTS',
      purpose: CAPTAIN_SOURCE_PURPOSE,
      command,
      transition: value.draft.transition,
      currentHead: { worldId: world, worldVersion: '0', eventSequence: '0' },
      observedAtReal: now,
      readBinding: value.draft.officeOperatingSourceReadBinding,
      commitAuthorization: value.proof,
    };
  }
  return {
    db,
    database,
    executor,
    runtime,
    command,
    queries,
    prepare,
    request,
    authorization,
  };
}
describe('fixed native Captain draft and same-transaction commit guard', () => {
  it('runs the real Atomic fresh commit and exact FINAL recovery before a subsequently revoked source', async () => {
    const f = await fixture(true, true);
    try {
      const prepared = await f.prepare();
      const execution = createAuthoritativeWorkerExecution({
        database: f.database,
        workerId: worker,
        sha256Hex: sha,
        candidateFactory: f.runtime.factory,
        captainSourceCommitProtectionPort: f.runtime.sourceCommitProtectionPort,
      });
      const input = {
        command: f.command,
        authorityKind: 'DISCRETIONARY_USER' as const,
        commitSimTime: f.command.simTime,
        recordedAtReal: now,
        requiredCapability: 'CAPTAIN_CABINET' as const,
        intakeAuthorization: f.authorization,
      };
      const committed = await execution.executeQueuedCommand(input);
      expect(committed.source).toBe('NEW_FINAL');
      expect(committed.receipt.outcome).toBe('COMMITTED');
      const before = (
        await f.db.query<{
          events: number;
          receipts: number;
          finalized: number;
          version: string;
        }>(
          `select (select count(*)::int from world_v2.authoritative_event)as events,(select count(*)::int from world_v2.command_receipt where outcome='COMMITTED')as receipts,(select count(*)::int from world_v2.command_queue where queue_state='FINALIZED')as finalized,(select world_version::text from world_v2.world_head)as version`,
        )
      ).rows[0];
      expect(before).toEqual({
        events: 1,
        receipts: 1,
        finalized: 1,
        version: '1',
      });
      await f.db.query(
        'insert into world_v2.captain_operating_source_revocation(adoption_ref,reason_ref) values($1,$2)',
        ['ADOPTION_CAPTAIN_TEST', 'TEST_ONLY_REVOKED_AFTER_FINAL'],
      );
      const sourceCalls = f.queries.filter((sql) =>
        sql.includes('lock_captain_operating_originals'),
      ).length;
      const recovered = await execution.executeQueuedCommand(input);
      expect(recovered.source).toBe('EXISTING_FINAL');
      expect(C.canonicalSerialize(recovered.receipt)).toBe(
        C.canonicalSerialize(committed.receipt),
      );
      expect(
        f.queries.filter((sql) =>
          sql.includes('lock_captain_operating_originals'),
        ).length,
      ).toBe(sourceCalls);
      // Also exercise Atomic's own early immutable-receipt recovery rather
      // than relying only on the outer command processor's receipt lookup.
      const { prepareAtomicTransitionCandidate } =
        await import('../../apps/world-worker/src/persistence/atomic-transition-repository.js');
      const exact = await execution.repository.commit(
        prepareAtomicTransitionCandidate({
          command: f.command,
          commitAuthorization: prepared.proof,
          draft: prepared.draft,
          sha256Hex: sha,
        }),
      );
      expect(exact.source).toBe('EXISTING_COMMIT');
      expect(C.canonicalSerialize(exact.receipt)).toBe(
        C.canonicalSerialize(committed.receipt),
      );
      expect(
        f.queries.filter((sql) =>
          sql.includes('lock_captain_operating_originals'),
        ).length,
      ).toBe(sourceCalls);
      expect(
        (
          await f.db.query<{ n: number }>(
            'select count(*)::int as n from world_v2.authoritative_event',
          )
        ).rows[0]?.n,
      ).toBe(1);
    } finally {
      await f.db.close();
    }
  });
  it('rolls back the actual Atomic path on source revocation between draft preparation and commit', async () => {
    const f = await fixture(true, true);
    try {
      const value = await f.prepare();
      await f.db.query(
        'insert into world_v2.captain_operating_source_revocation(adoption_ref,reason_ref) values($1,$2)',
        ['ADOPTION_CAPTAIN_TEST', 'TEST_ONLY_REVOKED_BEFORE_COMMIT'],
      );
      const execution = createAuthoritativeWorkerExecution({
        database: f.database,
        workerId: worker,
        sha256Hex: sha,
        candidateFactory: f.runtime.factory,
        captainSourceCommitProtectionPort: f.runtime.sourceCommitProtectionPort,
      });
      const { prepareAtomicTransitionCandidate } =
        await import('../../apps/world-worker/src/persistence/atomic-transition-repository.js');
      const candidate = prepareAtomicTransitionCandidate({
        command: f.command,
        commitAuthorization: value.proof,
        draft: value.draft,
        sha256Hex: sha,
      });
      await expect(
        execution.repository.commit(candidate),
      ).rejects.toMatchObject({
        missing: ['POLITICAL_CAPITAL_EVENT_LINEAGE', 'REASON_RECORD'],
      });
      expect(
        (
          await f.db.query<{
            events: number;
            receipts: number;
            version: string;
            state: string;
          }>(
            `select(select count(*)::int from world_v2.authoritative_event)as events,(select count(*)::int from world_v2.command_receipt)as receipts,(select world_version::text from world_v2.world_head)as version,(select queue_state from world_v2.command_queue)as state`,
          )
        ).rows[0],
      ).toEqual({ events: 0, receipts: 0, version: '0', state: 'CLAIMED' });
    } finally {
      await f.db.close();
    }
  });
  it('reuses actual Core/canonical H0 and original SQL, compares event, restores role and writes no event', async () => {
    const f = await fixture();
    try {
      expect(
        isPostwarCaptainSourceCommitProtectionPort(
          f.runtime.sourceCommitProtectionPort,
        ),
      ).toBe(true);
      expect(
        isPostwarCaptainSourceCommitProtectionPort({
          ...f.runtime.sourceCommitProtectionPort,
        }),
      ).toBe(false);
      const value = await f.prepare();
      const audit = await f.database.transaction(async (tx) => {
        const r = await f.runtime.sourceCommitProtectionPort.assertCurrentFrom(
          tx,
          f.request(value),
        );
        expect(
          (await tx.query<{ role: string }>('select current_user as role'))
            .rows[0]?.role,
        ).toBe(workerRole);
        return r;
      });
      expect(audit).toMatchObject({
        purpose: CAPTAIN_SOURCE_PURPOSE,
        status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
        commandFingerprint: f.command.fingerprint,
        protectionMode: 'HELD_SOURCE_GUARDS',
        readBindingFingerprint: C.canonicalSha256(
          C.canonicalHashInput(value.draft.officeOperatingSourceReadBinding),
          sha,
        ),
      });
      expect(
        (
          await f.db.query<{ n: number }>(
            'select count(*)::int as n from world_v2.authoritative_event',
          )
        ).rows[0]?.n,
      ).toBe(0);
      expect(
        f.queries.some((q) => q.includes('lock_captain_operating_originals')),
      ).toBe(true);
    } finally {
      await f.db.close();
    }
  });
  it('rejects stale prefix, changed source binding, invented event and current SQL role revocation', async () => {
    const f = await fixture();
    try {
      const value = await f.prepare(),
        request = f.request(value);
      const altered = JSON.parse(C.canonicalSerialize(request.readBinding));
      altered.sourceBinding.sourceRevision = 'FORGED';
      await expect(
        f.database.transaction((tx) =>
          f.runtime.sourceCommitProtectionPort.assertCurrentFrom(tx, {
            ...request,
            readBinding: altered,
          }),
        ),
      ).rejects.toThrow('BINDING_CHANGED');
      await expect(
        f.database.transaction((tx) =>
          f.runtime.sourceCommitProtectionPort.assertCurrentFrom(tx, {
            ...request,
            currentHead: { ...request.currentHead, eventSequence: '1' },
          }),
        ),
      ).rejects.toThrow('READ_BINDING');
      const different = C.prepareCaptainPoliticalCapitalEvent({
        command: f.command,
        source: JSON.parse(value.draft.transition.events[0]!.canonicalPayload)
          .source,
        eventId: 'EVENT_WRONG_RECORDED_TIME',
        recordedAtReal: '2026-10-28T12:00:01.000Z',
        sha256Hex: sha,
      }).event;
      await expect(
        f.database.transaction((tx) =>
          f.runtime.sourceCommitProtectionPort.assertCurrentFrom(tx, {
            ...request,
            transition: C.createAuthoritativeTransition({
              command: f.command,
              worldVersionBefore: '0',
              worldVersionAfter: '1',
              events: [different],
            }),
          }),
        ),
      ).rejects.toThrow('TRANSITION_DIFFERS');
      await f.db.exec('update world_v2.world_head set event_sequence=1');
      await expect(
        f.database.transaction((tx) =>
          f.runtime.sourceCommitProtectionPort.assertCurrentFrom(tx, request),
        ),
      ).rejects.toThrow('FRESH_PREFIX_CHANGED');
      await f.db.exec('update world_v2.world_head set event_sequence=0');
      await f.db.exec(
        'update world_v2.current_commit_authorization set active=false',
      );
      await expect(
        f.database.transaction((tx) =>
          f.runtime.sourceCommitProtectionPort.assertCurrentFrom(tx, request),
        ),
      ).rejects.toThrow('AUTHORIZATION_CHANGED');
    } finally {
      await f.db.close();
    }
  });
  it('rechecks native revocation after preparation without emitting or queuing a command', async () => {
    const f = await fixture();
    try {
      const value = await f.prepare();
      await f.db.query(
        'insert into world_v2.captain_operating_source_revocation(adoption_ref,reason_ref) values($1,$2)',
        ['ADOPTION_CAPTAIN_TEST', 'TEST_ONLY_REVOKED_AFTER_PREPARATION'],
      );
      await expect(
        f.database.transaction((tx) =>
          f.runtime.sourceCommitProtectionPort.assertCurrentFrom(
            tx,
            f.request(value),
          ),
        ),
      ).rejects.toMatchObject({
        missing: ['POLITICAL_CAPITAL_EVENT_LINEAGE', 'REASON_RECORD'],
      });
      expect(
        (
          await f.db.query<{ n: number }>(
            'select count(*)::int as n from world_v2.authoritative_event',
          )
        ).rows[0]?.n,
      ).toBe(0);
    } finally {
      await f.db.close();
    }
  });
  it('keeps absent originals MISSING and refuses TEST_ONLY bytes in official mode', async () => {
    const missing = await fixture(false);
    try {
      await expect(missing.prepare()).rejects.toMatchObject({
        missing: ['POLITICAL_CAPITAL_EVENT_LINEAGE', 'REASON_RECORD'],
      });
    } finally {
      await missing.db.close();
    }
    const f = await fixture();
    try {
      const official = createPostwarCaptainRuntime({
        database: f.database,
        workerId: worker,
        workerRole,
        mode: 'OFFICIAL_RUNTIME',
      });
      await expect(
        official.assertSourceBeforeClaim({
          command: f.command,
          observedAtReal: now,
        }),
      ).rejects.toThrow('independently registered');
      expect(
        (
          await f.db.query<{ n: number }>(
            'select count(*)::int as n from world_v2.authoritative_event',
          )
        ).rows[0]?.n,
      ).toBe(0);
    } finally {
      await f.db.close();
    }
  });
});
