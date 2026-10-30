/** TEST_ONLY Core data and actual embedded SQL/Atomic. No real-world source
 * issuer/signature, operating work/maintenance or production success asserted. */
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as C from '@econmind/core';
import {
  INDUSTRY_PRODUCTION_COMMAND,
  INDUSTRY_PRODUCTION_CAPABILITY,
} from '@econmind/core/industry-production-command';
import { createProductionSchemaFixture } from './production-schema-fixture.js';
import {
  canonicalSerialize as fixtureCanonicalSerialize,
  type V08AuthoritativeLedgerTransition as FixtureTransition,
} from '../../packages/core/src/index.js';
import { decodeIndustryProductionRow } from '../../apps/world-worker/src/persistence/industry-production-row-decoder.js';
import { prepareIndustrySettledPaymentData } from '../../apps/world-worker/src/persistence/postwar-industry-settled-payment-receipt.js';
import { createPostwarIndustryCurrentSource } from '../../apps/world-worker/src/persistence/postwar-industry-current-source.js';
import { createPostwarIndustryOperatingCutoffGuard } from '../../apps/world-worker/src/persistence/postwar-industry-operating-cutoff.js';
import { createPostwarIndustryProductionCandidateFactory } from '../../apps/world-worker/src/persistence/postwar-industry-production-candidate-factory.js';
import { ProtectedIndustryProductionGuard } from '../../apps/world-worker/src/persistence/industry-production-source-cutoff.js';
import { IndustryPersistenceCompatibilityProvider } from '../../apps/world-worker/src/persistence/industry-persistence-compatibility.js';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import { createAuthoritativeWorkerExecution } from '../../apps/world-worker/src/authoritative-execution.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
export const INDUSTRY_ATOMIC_AT = '2026-10-07T00:00:01.000Z';
export const INDUSTRY_ATOMIC_WORKER = 'WORKER_INDUSTRY_TEST_ONLY';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const sqlRead = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
function localFixture(cash = '100') {
  const raw = createProductionSchemaFixture(cash);
  // Rehydrate canonical data, never clone another Core instance's brands.
  function group(g: FixtureTransition) {
    const {
      canonicalPayload,
      payloadHash: _ph,
      fingerprint: _fp,
      simTime,
      ...c
    } = g.command;
    void _ph;
    void _fp;
    const command = C.parseCanonicalCommand(
      {
        ...c,
        payload: JSON.parse(canonicalPayload) as unknown,
        simTime: simTime.toCanonicalValue(),
      },
      sha,
    );
    const events = g.transition.events.map((e) => {
      const {
        canonicalPayload,
        payloadHash: _ph,
        fingerprint: _fp,
        simTime,
        ...rest
      } = e;
      void _ph;
      void _fp;
      return C.parseAuthoritativeEvent(
        {
          ...rest,
          payload: JSON.parse(canonicalPayload) as unknown,
          simTime: simTime.toCanonicalValue(),
        },
        sha,
      );
    });
    const transition = C.createAuthoritativeTransition({
      command,
      worldVersionBefore: g.transition.worldVersionBefore,
      worldVersionAfter: g.transition.worldVersionAfter,
      events,
    });
    return { command, transition };
  }
  const paid = group(raw.paidLineage);
  const funding = C.createFinancialPostingBatch(
    {
      ...paid,
      schemaVersion: raw.funding.schemaVersion,
      batchId: C.financialPostingBatchId(raw.funding.batchId),
      worldId: paid.command.worldId,
      causationCommandId: paid.command.commandId,
      causationEventIds: paid.transition.eventIds,
      worldVersionBefore: paid.transition.worldVersionBefore,
      worldVersionAfter: paid.transition.worldVersionAfter,
      settlementCurrency: raw.funding.settlementCurrency,
      simTime: paid.command.simTime,
      legs: raw.funding.legs.map((l) => ({
        legId: C.financialPostingLegId(l.legId),
        direction: l.direction,
        account: C.createFinancialAccount({
          worldId: paid.command.worldId,
          countryId: paid.command.countryId,
          ownerId: C.legalEntityId(l.account.ownerId),
          accountId: C.financialAccountId(l.account.accountId),
          accountClass: l.account.accountClass,
          currency: l.account.currency,
          claimId: null,
          counterpartyEntityId: null,
        }),
        counterpartyAccountId:
          l.counterpartyAccountId === null
            ? null
            : C.financialAccountId(l.counterpartyAccountId),
        amount: C.Money.from(
          l.amount.toCanonicalValue().amount,
          l.amount.currency,
        ),
      })),
    },
    sha,
  );
  const executed = group(raw.make().lineage);
  const { fingerprint, ...body } = JSON.parse(
    fixtureCanonicalSerialize(raw.make().posting),
  ) as Record<string, unknown>;
  const posting = decodeIndustryProductionRow({
    ...executed,
    row: {
      canonical_payload: body,
      causation_command_id: executed.command.commandId,
      fingerprint,
    },
    sha256Hex: sha,
  });
  return {
    seed: C.parseOpeningSeed(
      JSON.parse(fixtureCanonicalSerialize(raw.seed)) as unknown,
      sha,
    ),
    funding,
    paidLineage: {
      ...paid,
      inventoryPostings: [],
      financialPostingBatches: [funding],
    },
    made: { ...executed, posting },
  };
}

export async function createIndustryPaymentAtomicFixture() {
  let db!: PGlite;
  const queries: string[] = [];
  const f = localFixture(),
    old = f.made.command;
  const assumption = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: f.seed.sources[0]!.sourceId,
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      sourceVersion: 'TEST_ONLY_INDUSTRY_ATOMIC_V1',
      locator: 'fixture://TEST_ONLY_NOT_OFFICIAL_INDUSTRY_OPERATING_FACTS',
      payload: {
        TEST_ONLY: true,
        notice:
          'Synthetic test opening and cost; no actual cfc/industry approval',
      },
    },
    sha,
  );
  const { fingerprint: oldSeedFingerprint, ...seedIntent } = f.seed;
  void oldSeedFingerprint;
  const seed = C.createOpeningSeed(
      { ...seedIntent, sources: [assumption] },
      sha,
    ),
    before = C.rebuildV08LedgersFromLineage({
      seed,
      transitions: [f.paidLineage],
      sha256Hex: sha,
    }),
    oldEvidence = f.made.posting.evidence;
  const trace = {
    ...oldEvidence.input.trace,
    snapshot: {
      ...oldEvidence.input.trace.snapshot,
      snapshotHash: sha(C.canonicalSerialize(before)),
    },
  };
  const fact = <T>(v: C.FoundationFact<T>) =>
    C.createFoundationFact({
      trace,
      factRef: v.factRef,
      sourceRef: v.sourceRef,
      predecessorFactRefs: v.predecessorFactRefs,
      payload: v.payload,
    });
  const evidence = {
    ...oldEvidence,
    inventorySnapshotHash: C.canonicalSha256(
      C.canonicalHashInput(before.inventory),
      sha,
    ),
    input: {
      ...oldEvidence.input,
      trace,
      capacity: fact(oldEvidence.input.capacity),
      materials: oldEvidence.input.materials.map(fact),
      energy: fact(oldEvidence.input.energy),
      labour: fact(oldEvidence.input.labour),
      logistics: fact(oldEvidence.input.logistics),
    },
    recipe: fact(oldEvidence.recipe),
    operating: fact(oldEvidence.operating),
  };
  const command = C.parseCanonicalCommand(
    {
      actorId: old.actorId,
      authSubject: old.authSubject,
      commandId: old.commandId,
      commandType: INDUSTRY_PRODUCTION_COMMAND,
      correlationId: old.correlationId,
      countryId: old.countryId,
      expectedWorldVersion: old.expectedWorldVersion,
      idempotencyKey: old.idempotencyKey,
      officeId: 'INDUSTRY',
      payload: {
        facilityId: f.made.posting.evidence.operating.payload.facilityRef,
        runId: f.made.posting.evidence.runId,
      },
      schemaVersion: old.schemaVersion,
      simTime: old.simTime.toCanonicalValue(),
      submittedAtReal: old.submittedAtReal,
      worldId: old.worldId,
    },
    sha,
  );
  const events = f.made.transition.events.map((e) => {
    const { canonicalPayload, payloadHash, fingerprint, simTime, ...rest } = e;
    void canonicalPayload;
    void payloadHash;
    void fingerprint;
    return C.parseAuthoritativeEvent(
      {
        ...rest,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        simTime: simTime.toCanonicalValue(),
        payload: C.productionConsumptionEventPayload(evidence),
      },
      sha,
    );
  });
  const transition = C.createAuthoritativeTransition({
      command,
      events,
      worldVersionBefore: '1',
      worldVersionAfter: '2',
    }),
    posting = C.createProductionConsumptionPosting(
      {
        command,
        transition,
        postingId: f.made.posting.postingId,
        evidence,
      },
      sha,
    ),
    op = posting.evidence.operating.payload;
  const paidInput = {
      seed,
      prior: [
        {
          ...f.paidLineage,
          receipt: C.createFinalCommandReceipt({
            ...f.paidLineage,
            outcome: 'COMMITTED',
            reasonCode: null,
            simTime: f.paidLineage.command.simTime,
            recordedAtReal: INDUSTRY_ATOMIC_AT,
          }),
        },
      ],
      target: {
        command,
        transition,
        posting,
        expectedHead: { worldVersion: '1', eventSequence: '1' },
        fundingBatchId: op.fundingBatchId,
        fundingFingerprint: op.fundingFingerprint,
        costLegId: op.costLegId,
      },
    },
    paid = paidInput.prior[0]!,
    w = command.worldId,
    country = command.countryId,
    facility = op.facilityRef;
  const documentText = C.canonicalSerialize({
    worldId: w,
    countryId: country,
    operatorId: op.operatorId,
    locationId: posting.evidence.output.physicalLocationId,
    sourceFacility: { id: facility },
  });
  const executor: SqlExecutor = {
    async query<Row extends object>(q: string, args: readonly unknown[] = []) {
      queries.push(q);
      const r = await db.query<Row>(q, [...args]);
      return { rows: r.rows, rowCount: r.rows.length };
    },
  };
  const scope = (role: string | null): SqlDatabase => {
    const database: SqlDatabase = {
      query<Row extends object>(q: string, args: readonly unknown[] = []) {
        return database.transaction((tx) => tx.query<Row>(q, args));
      },
      async transaction(run) {
        await db.exec('begin isolation level repeatable read');
        try {
          if (role) await db.exec('set local role ' + role);
          const answer = await run(executor);
          await db.exec('commit');
          return answer;
        } catch (error) {
          await db.exec('rollback');
          throw error;
        }
      },
    };
    return database;
  };
  const admin = scope(null),
    database = scope('test_industry_atomic_worker');
  try {
    db = new PGlite();
    for (const file of [
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
      await db.exec(await sqlRead('database/migrations/artifacts/' + file));
    await db.exec(
      await sqlRead(
        'database/proposals/financial-posting-decimal-validation.sql',
      ),
    );
    await db.exec(
      `create role world_v2_industry_source_owner nologin;create role world_v2_industry_source_reader nologin;create role world_v2_industry_source_publisher nologin;create role test_industry_atomic_worker nologin;grant world_v2_industry_source_reader to test_industry_atomic_worker;grant usage on schema world_v2 to test_industry_atomic_worker;create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,admission_ref text,model_version text,replay_binding text,admitted_at_real timestamptz);create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);create table world_v2.runtime_admission_publication_revocation(authorization_id text);create table world_v2.postwar_industry_original(world_id text,country_id text,facility_id text,registration_ref text,seed_fingerprint text,admission_ref text,document_text text,document_sha256 text);create table world_v2.postwar_industry_original_revocation(world_id text,registration_ref text);grant usage,create on schema world_v2 to world_v2_industry_source_owner;grant select,update on world_v2.world_head,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.postwar_industry_original to world_v2_industry_source_owner;grant select on world_v2.runtime_admission_publication_revocation,world_v2.postwar_industry_original_revocation,world_v2.command_submission,world_v2.command_receipt,world_v2.financial_posting_batch to world_v2_industry_source_owner;`,
    );
    const oldSql = await sqlRead(
      'database/proposals/postwar-industry-production-source.sql',
    );
    for (const name of [
      'industry_source_admission',
      'lock_postwar_industry_original',
    ]) {
      const start = oldSql.indexOf('create function world_v2.' + name + '('),
        end = oldSql.indexOf('$$;', start) + 3;
      await db.exec(oldSql.slice(start, end));
    }
    await db.exec(
      'alter function world_v2.industry_source_admission(text)owner to world_v2_industry_source_owner;alter function world_v2.lock_postwar_industry_original(text,text,text,bigint,bigint)owner to world_v2_industry_source_owner;revoke all on function world_v2.industry_source_admission(text)from public;revoke all on function world_v2.lock_postwar_industry_original(text,text,text,bigint,bigint)from public;grant execute on function world_v2.lock_postwar_industry_original(text,text,text,bigint,bigint)to world_v2_industry_source_reader',
    );
    await db.exec(
      await sqlRead(
        'database/proposals/postwar-industry-operating-receipts.sql',
      ),
    );
    await db.query('insert into world_v2.world_head values($1,0,0)', [w]);
    await new WorldOpeningSeedStore({
      database: admin,
      sha256Hex: sha,
    }).bootstrap({
      seed: paidInput.seed,
      bootstrappedAtReal: INDUSTRY_ATOMIC_AT,
    });
    const permit = sha('TEST_ONLY_PAYMENT_PERMIT'),
      admission = 'ADMISSION_' + permit.toUpperCase();
    await db.query(
      "insert into world_v2.runtime_opening_admission values($1,'SEED_TEST',$2,$3,'MODEL_TEST','REPLAY_TEST','2026-10-07T00:00:00Z')",
      [w, paidInput.seed.fingerprint, admission],
    );
    await db.query(
      "insert into world_v2.runtime_admission_publication_permit values('PERMIT_TEST',$1,$2,'SEED_TEST',$3,'MODEL_TEST','REPLAY_TEST','2026-10-06T00:00:00Z','2026-10-08T00:00:00Z')",
      [permit, w, paidInput.seed.fingerprint],
    );
    await db.query(
      'insert into world_v2.postwar_industry_original values($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        w,
        country,
        facility,
        'TEST_ONLY_INDUSTRY_REG',
        paidInput.seed.fingerprint,
        admission,
        documentText,
        sha(documentText),
      ],
    );
    const c = paid.command,
      r = paid.receipt,
      b = paid.financialPostingBatches[0]!;
    await db.query(
      'insert into world_v2.command_submission values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
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
        c.simTime.toCanonicalValue(),
        c.correlationId,
        c.submittedAtReal,
      ],
    );
    for (const e of paid.transition.events)
      await db.query(
        'insert into world_v2.authoritative_event values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
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
          e.simTime.toCanonicalValue(),
          e.recordedAtReal,
          e.correctsEventId,
        ],
      );
    await db.query(
      'insert into world_v2.command_receipt values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
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
    const { fingerprint, ...intent } = b;
    await db.query(
      'insert into world_v2.financial_posting_batch values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
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
        C.canonicalSerialize(intent),
        fingerprint,
      ],
    );

    await db.query(
      'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
      [w],
    );
    await db.query(
      'insert into world_v2.world_writer_lease values($1,$2,1,$3,$3,$4)',
      [
        w,
        INDUSTRY_ATOMIC_WORKER,
        INDUSTRY_ATOMIC_AT,
        '2026-10-07T00:01:00.000Z',
      ],
    );
    const cmd = command;
    await db.query(
      'insert into world_v2.command_submission values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
      [
        cmd.worldId,
        cmd.commandId,
        cmd.idempotencyKey,
        cmd.commandType,
        cmd.schemaVersion,
        cmd.canonicalPayload,
        cmd.payloadHash,
        cmd.fingerprint,
        cmd.authSubject,
        cmd.actorId,
        cmd.countryId,
        cmd.officeId,
        cmd.expectedWorldVersion,
        cmd.simTime.toCanonicalValue(),
        cmd.correlationId,
        cmd.submittedAtReal,
      ],
    );
    await db.query(
      "insert into world_v2.current_commit_authorization(world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)values($1,$2,$3,'INDUSTRY','INDUSTRY_PRODUCTION','TEAM_TEST_INDUSTRY','1',true,$4)",
      [w, cmd.authSubject, country, INDUSTRY_ATOMIC_AT],
    );
    await db.query(
      "insert into world_v2.command_queue(world_id,command_id,authority_kind,priority_rank,available_at_sim_time,attempt_count)values($1,$2,'DISCRETIONARY_USER',0,$3,0)",
      [w, cmd.commandId, cmd.simTime.toCanonicalValue()],
    );
    await db.query(
      "update world_v2.command_queue set queue_state='CLAIMED',attempt_count=1,claimed_by=$3,claimed_at_real=$4,claim_fencing_token=1 where world_id=$1 and command_id=$2",
      [w, cmd.commandId, INDUSTRY_ATOMIC_WORKER, INDUSTRY_ATOMIC_AT],
    );
    await db.exec(
      `grant select on world_v2.world_head,world_v2.world_writer_lease,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.current_materialization,world_v2.authoritative_commit_authorization,world_v2.notification_outbox,world_v2.current_commit_authorization to test_industry_atomic_worker;grant update(world_version,event_sequence)on world_v2.world_head to test_industry_atomic_worker;grant update(fencing_token)on world_v2.world_writer_lease to test_industry_atomic_worker;grant update(command_id)on world_v2.command_submission to test_industry_atomic_worker;grant update(authorization_version)on world_v2.current_commit_authorization to test_industry_atomic_worker;grant insert on world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.command_receipt,world_v2.authoritative_commit_authorization,world_v2.notification_outbox to test_industry_atomic_worker;grant update on world_v2.command_queue to test_industry_atomic_worker;alter table world_v2.current_commit_authorization enable row level security;create policy industry_test_auth_read on world_v2.current_commit_authorization for select to test_industry_atomic_worker using(world_id='${w}');create policy industry_test_auth_lock on world_v2.current_commit_authorization for update to test_industry_atomic_worker using(world_id='${w}')with check(false);`,
    );
    const target = {
        targetDeploymentRef: 'TEST_ONLY_EMBEDDED_NOT_PRODUCTION',
        databaseIdentityRef: 'TEST_ONLY_PGLITE',
      },
      build = {
        constructorSourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: new URL('../..', import.meta.url),
          encoding: 'utf8',
        }).trim(),
        constructorBlobSHA256: sha(
          await sqlRead(
            'packages/core/src/inventory/production-consumption-posting.ts',
          ),
        ),
        decoderProtocol: 'industry-production-decoder-v1' as const,
        decoderBuildSHA256: sha(
          await sqlRead(
            'apps/world-worker/src/persistence/industry-production-row-decoder.ts',
          ),
        ),
      };
    let protectedCalls = 0;
    const absent = async (): Promise<never> => {
      protectedCalls++;
      throw Error('REAL_INDUSTRY_QUALIFIED_SOURCE_NOT_INSTALLED');
    };
    const provider = new IndustryPersistenceCompatibilityProvider({
        accessor: {
          resolveTargetFrom: absent,
          acquireAdmissionGuardFrom: absent,
          readObservedInputFrom: absent,
          readExpectedInputFrom: absent,
        },
        expectedTarget: target,
        expectedBuild: build,
      }),
      protectedGuard = new ProtectedIndustryProductionGuard({
        accessor: {
          resolveProtectionFrom: absent,
          acquireResourceFrom: absent,
          readProtectedPlanFrom: absent,
          readAuthenticatedRepresentationFrom: absent,
          readAuthenticatedProductionFrom: absent,
        },
        compatibilityProvider: provider,
        expectedTarget: target,
        expectedBuild: build,
        database,
        sha256Hex: sha,
      });
    const source = createPostwarIndustryCurrentSource({
        worldId: w,
        countryId: country,
        runtimeReaderRole: 'test_industry_atomic_worker',
      }),
      guard = createPostwarIndustryOperatingCutoffGuard({
        source,
        protectedGuard,
      }),
      preparation = prepareIndustrySettledPaymentData(paidInput);
    const lease = C.acquireWorldWriterLease(
        null,
        C.worldWriterLeaseRequest(
          w,
          C.workerId(INDUSTRY_ATOMIC_WORKER),
          INDUSTRY_ATOMIC_AT,
          '2026-10-07T00:01:00.000Z',
        ),
      ).lease,
      assertion = C.createWorldWriterCommitAssertion(lease, '1');
    const factory = createPostwarIndustryProductionCandidateFactory({
      preparation,
      sourceGuard: guard,
      commitAssertion: assertion,
    });
    const authorization = await C.authorizeOfficeCapability({
      principal: {
        authSubject: cmd.authSubject,
        facts: {
          user_id: cmd.authSubject,
          display_name: 'TEST_ONLY',
          school_id: null,
        },
        token: {
          subject: cmd.authSubject,
          issuer: 'TEST_ONLY',
          audience: 'TEST_ONLY',
          issuedAt: '2026-10-07T00:00:00.000Z',
          expiresAt: '2026-10-08T00:00:00.000Z',
        },
      },
      resolver: {
        async resolveCurrentIdentity() {
          return cmd.authSubject;
        },
        async resolveCurrentMembership() {
          const r = await db.query<{
            active: boolean;
            authorization_version: string;
          }>(
            "select active,authorization_version from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and office_id='INDUSTRY'and capability='INDUSTRY_PRODUCTION'",
            [w, cmd.authSubject],
          );
          const a = r.rows[0];
          return a
            ? {
                authSubject: cmd.authSubject,
                worldId: w,
                countryId: country,
                teamId: C.teamId('TEAM_TEST_INDUSTRY'),
                authorizationVersion: a.authorization_version,
                officeAssignments: [C.officeId('INDUSTRY')],
                active: a.active,
                suspended: false,
                isWorldAdmin: false,
                negotiationPartyIds: [],
              }
            : null;
        },
      },
      worldId: w,
      requestedCountryId: country,
      requestedOfficeId: C.officeId('INDUSTRY'),
      capability: INDUSTRY_PRODUCTION_CAPABILITY,
    });
    const queued = {
        command: cmd,
        authorityKind: 'DISCRETIONARY_USER' as const,
        commitSimTime: cmd.simTime,
        recordedAtReal: INDUSTRY_ATOMIC_AT,
        requiredCapability: INDUSTRY_PRODUCTION_CAPABILITY,
        intakeAuthorization: authorization,
      },
      execution = createAuthoritativeWorkerExecution({
        database,
        workerId: INDUSTRY_ATOMIC_WORKER,
        sha256Hex: sha,
        candidateFactory: factory,
        industryProductionCutoffGuard: guard,
      });
    async function counts() {
      return (
        await db.query(
          'select (select count(*)::int from world_v2.authoritative_event)events,(select count(*)::int from world_v2.command_receipt)receipts,(select count(*)::int from world_v2.inventory_posting)inventory,(select count(*)::int from world_v2.financial_posting_batch)batches,(select count(*)::int from world_v2.authoritative_commit_authorization)audit,(select world_version::text from world_v2.world_head where world_id=$1)version,(select event_sequence::text from world_v2.world_head where world_id=$1)sequence,(select queue_state from world_v2.command_queue where world_id=$1 and command_id=$2)queue',
          [w, cmd.commandId],
        )
      ).rows[0];
    }
    async function prepareOnly() {
      let result:
        | {
            draft: import('../../apps/world-worker/src/persistence/atomic-transition-repository.js').AtomicTransitionDraft;
            proof: C.CommitAuthorizationProof;
          }
        | undefined;
      await C.processQueuedCommand({
        ...queued,
        persistence: {
          async readFinalReceipt() {
            return null;
          },
          async recordZeroEffectReceipt(r) {
            throw Error('unexpected zero receipt ' + r.reasonCode);
          },
          async commitAuthorizedCommand(req) {
            if (!req.commitAuthorization) throw Error('genuine proof required');
            const draft = await factory.prepare({
              command: cmd,
              commitAuthorization: req.commitAuthorization,
              observedAtReal: INDUSTRY_ATOMIC_AT,
            });
            result = { draft, proof: req.commitAuthorization };
            return { transition: draft.transition, receipt: draft.receipt };
          },
        },
      });
      if (!result) throw Error('actual preparation required');
      return result;
    }
    return {
      db,
      database,
      command: cmd,
      paidInput,
      preparation,
      assertion,
      source,
      guard,
      factory,
      queued,
      execution,
      queries,
      counts,
      prepareOnly,
      get protectedCalls() {
        return protectedCalls;
      },
      close: () => db.close(),
    };
  } catch (error) {
    await db?.close();
    throw error;
  }
}
