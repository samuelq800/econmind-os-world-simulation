/** Isolated SQL order custody. Official metadata/journal DDL and fixed roles;
 * no actual E03 admission, operational WORK/payment, World host or Clock. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import * as C from '../../packages/core/src/index.js';
import { createIndustryLogisticsExecutionFixture } from '../support/industry-logistics-execution-fixture.js';
import {
  createIndustryFirstDayWorkState,
  prepareIndustryRunScheduleFrame,
} from '../../packages/core/src/industry/industry-first-day-work.js';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
} from '../../packages/core/src/commands/finance-social-replay-continuation.js';
import { prepareIndustryUtilityExecution } from '../../packages/core/src/commands/industry-utility-execution.js';
import {
  prepareIndustryInternalLogisticsReplaySources,
  createIndustryInternalLogisticsExecutionState,
  prepareIndustryInternalLogisticsFrame,
  readIndustryInternalLogisticsExecutionState,
} from '../../packages/core/src/inventory/industry-internal-logistics-execution.js';
import type { FinanceNativeBudgetCanonicalFrame } from '../../packages/core/src/commands/finance-budget-native.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
import { describe, it, expect } from 'vitest';
const read = (p: string) =>
  readFile(new URL('../../database/' + p, import.meta.url), 'utf8');
async function schema() {
  const db = new PGlite();
  try {
    for (const id of [
      '0001_world_v2_namespace',
      '0002_world_v2_command_event_ledger',
      '0003_world_v2_command_receipts_outbox',
      '0005_world_v2_writer_lease_fencing',
      '0007_world_v2_atomic_transition_facts',
      '0009_world_v2_posting_payload_integrity',
      '0011_world_v2_current_commit_authorization',
      '0013_world_v2_read_projection_boundary',
      '0016_world_v2_opening_seed',
    ])
      await db.exec(await read('migrations/artifacts/' + id + '.sql'));
    for (const id of [
      'runtime-read-binding-storage',
      'runtime-admission-publication',
      'social-operating-custody',
      'finance-budget-custody',
      'postwar-office-derived-read',
      'postwar-industry-production-source',
      'postwar-industry-first-day-source',
      'postwar-industry-run-history',
      'postwar-industry-logistics-custody',
      'postwar-source-revocation-fence',
    ]) {
      const sql = await read('proposals/' + id + '.sql');
      try {
        await db.exec(sql);
      } catch (error) {
        const e = error as Error & {
          code?: string;
          position?: string;
          internalPosition?: string;
          internalQuery?: string;
          where?: string;
        };
        throw new Error(
          'ACTUAL_PROPOSAL_DDL_FAILED:' +
            id +
            ':' +
            JSON.stringify({
              message: e.message,
              code: e.code,
              position: e.position,
              internalPosition: e.internalPosition,
              internalQuery: e.internalQuery,
              where: e.where,
            }),
          { cause: error },
        );
      }
    }
    return db;
  } catch (e) {
    await db.close();
    throw e;
  }
}

/** Small genuine Core RUN/logistics frames, persisted solely as SQL protocol
 * fixtures. Parent source registration is explicit TEST_ONLY setup, not E03
 * publication or proof that a real host executed these economic commands. */
async function seeded() {
  const db = await schema(),
    f = createIndustryLogisticsExecutionFixture(),
    at = new Date().toISOString();
  const reset = () =>
    db.exec('rollback;reset role;set session authorization postgres');
  async function asRole<T>(role: string, op: () => Promise<T>) {
    await reset();
    await db.exec('set session authorization ' + role);
    await db.exec('begin isolation level repeatable read');
    try {
      const result = await op();
      await db.exec('commit');
      return result;
    } catch (e) {
      await db.exec('rollback');
      throw e;
    } finally {
      await reset();
    }
  }
  try {
    const { fingerprint, ...intent } = f.seed,
      replay = C.canonicalSerialize(f.seed.replayBinding);
    await db.query('insert into world_v2.world_head values($1,0,0)', [f.world]);
    await db.query(
      'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,$6)',
      [
        f.world,
        f.seed.seedId,
        replay,
        C.canonicalSerialize(intent),
        fingerprint,
        at,
      ],
    );
    const caller = 'world_v2_opening_admission_logistics_test';
    await db.exec(
      `create role ${caller} nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant usage on schema world_v2 to ${caller};grant execute on function world_v2.publish_runtime_admission_publication(text,text,text)to ${caller}`,
    );
    const claims = {
        schemaVersion: 'opening-publication-authorization-v1',
        purpose: 'AUTHORIZE_OFFICIAL_OPENING_ADMISSION_PUBLICATION',
        authorizationId: 'AUTHORIZATION_TEST_ONLY_LOGISTICS',
        keyId: 'TEST_ONLY_KEY',
        ownerIdentity: 'TEST_ONLY_NOT_OWNER',
        worldId: f.world,
        seedId: f.seed.seedId,
        seedFingerprint: fingerprint,
        modelVersion: f.seed.replayBinding.modelVersion,
        replayBinding: replay,
        sourceBundleSha256: sha('TEST_ONLY_LOGISTICS'),
        issuedAtReal: new Date(Date.now() - 86400000).toISOString(),
        expiresAtReal: new Date(Date.now() + 86400000).toISOString(),
      },
      bytes = C.canonicalSerialize(claims),
      digest = sha(bytes),
      admission = 'ADMISSION_' + digest.toUpperCase(),
      signature = sign(
        null,
        Buffer.from(bytes),
        generateKeyPairSync('ed25519').privateKey,
      ).toString('base64url');
    await asRole('world_v2_admission_release', () =>
      db.query(
        'insert into world_v2.runtime_admission_publication_permit(authorization_id,authorization_sha256,canonical_authorization,signature_base64url,world_id,seed_id,seed_fingerprint,model_version,replay_binding,source_bundle_sha256,caller_session_role,valid_from,valid_until)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
        [
          claims.authorizationId,
          digest,
          bytes,
          signature,
          f.world,
          f.seed.seedId,
          fingerprint,
          claims.modelVersion,
          replay,
          claims.sourceBundleSha256,
          caller,
          claims.issuedAtReal,
          claims.expiresAtReal,
        ],
      ),
    );
    await asRole(caller, () =>
      db.query(
        'select world_v2.publish_runtime_admission_publication($1,$2,$3)',
        [claims.authorizationId, digest, claims.sourceBundleSha256],
      ),
    );
    const sourceText = C.canonicalSerialize({
        worldId: f.world,
        countryId: f.country,
        facilityId: f.workSource.facilityId,
        operatorId: f.operator,
        seedId: f.seed.seedId,
        seedFingerprint: fingerprint,
        admissionRef: admission,
        classification: 'TEST_ONLY_SQL_METADATA_NOT_E03',
      }),
      sourceSha = sha(sourceText),
      sourceRef = 'INDUSTRY_FIRST_DAY_' + sourceSha.toUpperCase(),
      reg = 'REGISTRATION_TEST_ONLY_LOGISTICS';
    await db.query(
      'insert into world_v2.postwar_industry_original(world_id,country_id,facility_id,registration_ref,seed_fingerprint,admission_ref,operating_source_id,operating_source_hash,checksums_sha256,owner_original_sha256,document_text,document_sha256)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11)',
      [
        f.world,
        f.country,
        f.workSource.facilityId,
        reg,
        fingerprint,
        admission,
        f.seed.sources[0]!.sourceId,
        f.seed.sources[0]!.payloadHash,
        'a'.repeat(64),
        sourceText,
        sourceSha,
      ],
    );
    await db.query(
      'insert into world_v2.postwar_industry_first_day_source values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
      [
        f.world,
        f.country,
        f.workSource.facilityId,
        sourceRef,
        reg,
        f.seed.seedId,
        fingerprint,
        admission,
        f.workSource.policyVersion,
        f.workSource.policyRawSha256,
        f.workSource.userAdoptionRawSha256,
        sourceText,
        sourceSha,
      ],
    );
    await db.query(
      "insert into world_v2.social_operating_source_registration(world_id,country_id,registration_ref,seed_fingerprint,source_id,source_payload_hash,admission_ref,issuer_role)values($1,$2,$3,$4,$5,$6,$7,'world_v2_social_source_publisher')",
      [
        f.world,
        f.country,
        'HOST_SOCIAL_TEST_ONLY',
        fingerprint,
        f.seed.sources[0]!.sourceId,
        f.seed.sources[0]!.payloadHash,
        admission,
      ],
    );
    await db.query(
      'insert into world_v2.finance_budget_policy_original(policy_ref,world_id,country_id,envelope_ref,period_ref,seed_fingerprint,admission_ref,issuer_ref,policy_text,policy_sha256,normative_sha256)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [
        'HOST_FINANCE_TEST_ONLY',
        f.world,
        f.country,
        'ENV_TEST',
        'PERIOD_TEST',
        fingerprint,
        admission,
        'ISSUER_TEST_ONLY',
        '{}',
        sha('{}'),
        'a'.repeat(64),
      ],
    );
    await db.exec(
      `create function world_v2.test_only_logistics_projection(w text,c text,f text,r text)returns jsonb language plpgsql security definer set search_path=pg_catalog as $$begin perform set_config('econmind.postwar_projection_world',w,true);return world_v2.postwar_projection_industry_logistics_orders(w,c,f,r);end;$$;alter function world_v2.test_only_logistics_projection(text,text,text,text)owner to world_v2_postwar_projection_owner;revoke all on function world_v2.test_only_logistics_projection(text,text,text,text)from public;grant execute on function world_v2.test_only_logistics_projection(text,text,text,text)to world_v2_postwar_projection_publisher`,
    );
    const workSource = {
        ...f.workSource,
        admissionRef: admission,
        sourceRef,
        sourceRawSha256: sourceSha,
      },
      terms = {
        ...(JSON.parse(f.scheduled.frame.command.canonicalPayload) as Record<
          string,
          unknown
        >),
        sourceRef,
        sourceRawSha256: sourceSha,
      };
    const scheduled = prepareIndustryRunScheduleFrame(
      {
        state: createIndustryFirstDayWorkState([workSource]),
        command: f.rawCommand(
          'CORE_INDUSTRY_RUN_SCHEDULE_V1',
          'RUN_SQL_TEST',
          '0',
          '0',
          terms,
        ),
        head: { worldVersion: '0', eventSequence: '0' },
        observedAtReal: at,
      },
      sha,
    );
    const continuation = prepareFinanceSocialReplayContinuation(
      {
        opening: f.opening,
        expectedHead: { worldVersion: '1', eventSequence: '1' },
        socialCountries: [f.social],
        fxOriginals: [],
        openingEncumbrances: [],
        industryWorkSources: [workSource],
      },
      sha,
    );
    const view = readFinanceSocialReplayContinuation(
      appendFinanceSocialReplayPage({
        continuation,
        sha256Hex: sha,
        page: {
          schemaVersion: 'finance-social-replay-page-v1',
          worldId: f.world,
          seedFingerprint: fingerprint,
          fromHead: { worldVersion: '0', eventSequence: '0' },
          throughHead: { worldVersion: '1', eventSequence: '1' },
          expectedHead: { worldVersion: '1', eventSequence: '1' },
          frames: [scheduled.frame],
          framesSha256: C.canonicalSha256(
            C.canonicalHashInput([scheduled.frame]),
            sha,
          ),
        },
      }),
    );
    const {
      sourceRef: _oldRef,
      sourceRawSha256: _oldHash,
      ...labourBody
    } = f.labour;
    void _oldRef;
    void _oldHash;
    const body = { ...labourBody, admissionRef: admission },
      labourSha = sha(C.canonicalSerialize(body)),
      labour = {
        ...body,
        sourceRef: 'LOGISTICS_LABOUR_' + labourSha.toUpperCase(),
        sourceRawSha256: labourSha,
      };
    const {
      sourceRef: _utilityRef,
      sourceRawSha256: _utilityHash,
      ...utilityBody
    } = f.utilitySource;
    void _utilityRef;
    void _utilityHash;
    const uBody = {
        ...utilityBody,
        admissionRef: admission,
        originals: [
          {
            kind: 'REGISTERED_INDUSTRY_SITE',
            reference: sourceRef,
            rawSha256: sourceSha,
          },
          {
            kind: 'LOGISTICS_LABOUR',
            reference: labour.sourceRef,
            rawSha256: labour.sourceRawSha256,
          },
        ],
      },
      uSha = sha(C.canonicalSerialize(uBody)),
      utility = {
        ...uBody,
        sourceRef: 'LOGISTICS_SOURCE_' + uSha.toUpperCase(),
        sourceRawSha256: uSha,
      };
    const workOrder = {
      schemaVersion: 'industry-logistics-service-work-order-v1',
      purpose: 'DISTINCT_LOGISTICS_SERVICE_WORK',
      inputRef: 'WORK_ORDER_SQL_TEST',
      worldId: f.world,
      countryId: f.country,
      facilityId: workSource.facilityId,
      operatorId: f.operator,
      runId: f.request.runId,
      seedFingerprint: fingerprint,
      transferId: f.request.transferId,
      labourSourceRef: labour.sourceRef,
      labourSourceRawSha256: labour.sourceRawSha256,
      allocations: [f.allocation],
    };
    const workRaw = C.canonicalSerialize(workOrder);
    const sources = prepareIndustryInternalLogisticsReplaySources(
      {
        source: f.planningSource,
        labourSource: labour,
        utilitySources: [utility],
        workOriginals: [
          {
            reference: workOrder.inputRef,
            rawText: workRaw,
            rawSha256: sha(workRaw),
          },
        ],
      },
      sha,
    );
    const command = (
      operation: Record<string, unknown>,
      id: string,
      version: string,
      time = '0',
    ) =>
      f.rawCommand(
        'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1',
        id,
        version,
        time,
        {
          schemaVersion: 'industry-first-day-utility-command-v1',
          serviceKind: 'LOGISTICS',
          operationRef: 'OP_' + id,
          facilityId: workSource.facilityId,
          runId: f.request.runId,
          sourceRef: utility.sourceRef,
          sourceRawSha256: utility.sourceRawSha256,
          operation,
        },
      );
    const preparation = prepareIndustryUtilityExecution(
      {
        command: command(f.book, 'BOOK_SQL_TEST', '1'),
        replay: view,
        source: utility,
      },
      sha,
    );
    let state = createIndustryInternalLogisticsExecutionState(
      { preparation, sourceInputs: sources },
      sha,
    );
    function stage(operation: Record<string, unknown>, id: string, time = '0') {
      const r = prepareIndustryInternalLogisticsFrame(
        {
          state,
          command: command(
            operation,
            id,
            readIndustryInternalLogisticsExecutionState(state).head
              .worldVersion,
            time,
          ),
          observedAtReal: at,
        },
        sha,
      );
      state = r.state;
      return r.frame;
    }
    const book = stage(f.book, 'BOOK_SQL_TEST'),
      ship = stage(
        { action: 'SHIP', transferId: f.request.transferId },
        'SHIP_SQL_TEST',
      ),
      work = stage(
        {
          action: 'SERVICE_WORK',
          transferId: f.request.transferId,
          workOrderRef: workOrder.inputRef,
          workOrderSha256: sha(workRaw),
        },
        'WORK_SQL_TEST',
        '60000',
      );
    async function store(frame: FinanceNativeBudgetCanonicalFrame) {
      const c = frame.command,
        r = frame.receipt;
      await db.query(
        'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
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
      for (const e of frame.events)
        await db.query(
          'insert into world_v2.authoritative_event(world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
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
          ],
        );
      await db.query(
        'insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
        [
          c.worldId,
          c.commandId,
          c.idempotencyKey,
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
      await db.query(
        'update world_v2.world_head set world_version=$2,event_sequence=$3 where world_id=$1',
        [
          f.world,
          frame.transition.worldVersionAfter,
          frame.events.at(-1)!.sequence,
        ],
      );
    }
    await store(scheduled.frame);
    await store(book);
    await store(ship);
    const payOrder = {
      ...(JSON.parse(f.expense(work.events[0]!.fingerprint).rawText) as Record<
        string,
        unknown
      >),
    };
    const publish = (original: unknown) => {
      const raw = C.canonicalSerialize(original);
      return asRole('world_v2_industry_source_publisher', () =>
        db.query<{ order_ref: string; order_sha256: string }>(
          'select * from world_v2.publish_postwar_industry_logistics_order($1,$2,$3,$4)',
          [f.world, f.country, raw, sha(raw)],
        ),
      );
    };
    const rows = (
      version = '3',
      sequence = '3',
      country = String(f.country),
      fp: string = fingerprint,
    ) =>
      asRole('world_v2_industry_source_reader', () =>
        db.query(
          'select * from world_v2.read_postwar_industry_logistics_orders($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            f.world,
            country,
            workSource.facilityId,
            f.request.runId,
            version,
            sequence,
            fp,
            admission,
          ],
        ),
      );
    function payFrame() {
      const raw = C.canonicalSerialize(payOrder);
      const result = prepareIndustryInternalLogisticsFrame(
        {
          state,
          command: command(
            {
              action: 'PAY_INPUTS',
              transferId: f.request.transferId,
              workEventFingerprint: work.events[0]!.fingerprint,
              expenseOrderRef: String(payOrder.inputRef),
              expenseOrderSha256: sha(raw),
            },
            'PAY_SQL_TEST',
            '4',
            '60000',
          ),
          observedAtReal: at,
          expenseOriginal: {
            reference: String(payOrder.inputRef),
            rawText: raw,
            rawSha256: sha(raw),
          },
        },
        sha,
      );
      state = result.state;
      return result.frame;
    }
    function deliverFrame() {
      const result = prepareIndustryInternalLogisticsFrame(
        {
          state,
          command: command(
            { action: 'DELIVER', transferId: f.request.transferId },
            'DELIVER_SQL_TEST',
            '5',
            '60000',
          ),
          observedAtReal: at,
        },
        sha,
      );
      state = result.state;
      return result.frame;
    }
    const history = (
      frame: FinanceNativeBudgetCanonicalFrame,
      office: 'SOCIAL' | 'FINANCE' = 'SOCIAL',
      version = '5',
      sequence = version,
    ) =>
      asRole(
        office === 'SOCIAL'
          ? 'world_v2_social_source_reader'
          : 'world_v2_finance_budget_source_reader',
        () =>
          db.query(
            'select * from world_v2.read_postwar_industry_logistics_committed_orders($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [
              f.world,
              f.country,
              office,
              f.country,
              workSource.facilityId,
              f.request.runId,
              frame.command.commandId,
              frame.command.fingerprint,
              version,
              sequence,
              fingerprint,
              admission,
            ],
          ),
      );
    const projection = () =>
      asRole('world_v2_postwar_projection_publisher', () =>
        db.query<{ data: unknown[] }>(
          'select world_v2.test_only_logistics_projection($1,$2,$3,$4)as data',
          [f.world, f.country, workSource.facilityId, f.request.runId],
        ),
      );
    return {
      db,
      f,
      asRole,
      publish,
      rows,
      workOrder,
      payOrder,
      work,
      payFrame,
      deliverFrame,
      history,
      projection,
      store,
      sourceRef,
      admission,
      reg,
      permit: claims.authorizationId,
    };
  } catch (e) {
    await db.close();
    throw e;
  }
}
describe('fixed logistics order SQL custody, not execution', () => {
  it('compiles the actual utility sibling custody against the same real source providers', async () => {
    const db = await schema();
    try {
      await db.exec(
        await read('proposals/postwar-industry-utility-custody.sql'),
      );
      expect(
        (
          await db.query(
            "select to_regprocedure('world_v2.publish_postwar_industry_utility_source(text,text,jsonb,text)')is not null as installed",
          )
        ).rows,
      ).toEqual([{ installed: true }]);
    } finally {
      await db.close();
    }
  });
  it('rechecks actual host and frame refs while preserving committed originals after target revocation', async () => {
    const f = await seeded();
    try {
      await f.publish(f.workOrder);
      // A registered WORK order has no historical authority before a matching
      // COMMITTED SERVICE_WORK event actually references its immutable hash.
      expect((await f.projection()).rows).toEqual([{ data: [] }]);
      await f.store(f.work);
      await f.publish(f.payOrder);
      const pay = f.payFrame();
      await f.store(pay);
      expect((await f.history(f.work)).rows).toHaveLength(1);
      expect((await f.history(pay, 'FINANCE')).rows).toHaveLength(1);
      const before = (await f.projection()).rows[0]!.data;
      expect(before).toHaveLength(2);
      for (const original of before)
        expect(original).toMatchObject({
          seedFingerprint: f.f.seed.fingerprint,
          admissionRef: f.admission,
          registrationRef: f.reg,
        });
      await expect(
        f.asRole('world_v2_postwar_projection_publisher', () =>
          f.db.query(
            'select world_v2.postwar_projection_industry_logistics_orders($1,$2,$3,$4)',
            [
              f.f.world,
              f.f.country,
              f.f.workSource.facilityId,
              f.f.request.runId,
            ],
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      const delivered = f.deliverFrame();
      await f.store(delivered);
      expect(delivered.events).toHaveLength(2);
      expect((await f.history(delivered, 'SOCIAL', '6', '7')).rows).toEqual([]);
      await f.db.query(
        'insert into world_v2.postwar_industry_first_day_source_revocation(world_id,source_ref,reason_ref)values($1,$2,$3)',
        [f.f.world, f.sourceRef, 'TARGET_TEST_ONLY_REVOKED'],
      );
      await expect(f.rows('6', '7')).rejects.toMatchObject({
        code: '55000',
        message: 'LOGISTICS_ORDER_CURRENT_FIRSTDAY_REVOKED',
      });
      expect((await f.history(f.work, 'SOCIAL', '6', '7')).rows).toHaveLength(
        1,
      );
      const historicalSource = await f.asRole(
        'world_v2_social_source_reader',
        () =>
          f.db.query(
            'select * from world_v2.read_postwar_industry_logistics_committed_source($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [
              f.f.world,
              f.f.country,
              'SOCIAL',
              f.f.country,
              f.f.workSource.facilityId,
              f.f.request.runId,
              delivered.command.commandId,
              delivered.command.fingerprint,
              '6',
              '7',
              f.f.seed.fingerprint,
              f.admission,
            ],
          ),
      );
      expect(historicalSource.rows).toHaveLength(1);
      expect(historicalSource.rows[0]).toMatchObject({
        source_ref: f.sourceRef,
        world_version: '6',
        event_sequence: '7',
      });
      expect((await f.projection()).rows[0]!.data).toEqual(before);
      await expect(
        f.history(
          {
            ...pay,
            command: {
              ...pay.command,
              fingerprint: C.canonicalSha256(
                C.canonicalHashInput('WRONG_COMMAND'),
                sha,
              ),
            },
          },
          'SOCIAL',
          '6',
          '7',
        ),
      ).rejects.toMatchObject({
        code: '55000',
        message: 'LOGISTICS_HISTORY_EXACT_COMMAND_REQUIRED',
      });
      await expect(f.history(pay, 'SOCIAL', '4')).rejects.toMatchObject({
        code: '55000',
        message: 'LOGISTICS_HISTORY_ACTUAL_HELD_HEAD_REQUIRED',
      });
      await f.db.query(
        'insert into world_v2.social_operating_source_revocation(registration_ref,reason_ref)values($1,$2)',
        ['HOST_SOCIAL_TEST_ONLY', 'HOST_REVOKED'],
      );
      await expect(f.history(f.work, 'SOCIAL', '6', '7')).rejects.toMatchObject(
        {
          code: '55000',
          message: 'LOGISTICS_HISTORY_CURRENT_HOST_REVOKED',
        },
      );
      expect((await f.history(pay, 'FINANCE', '6', '7')).rows).toHaveLength(1);
      await f.asRole('world_v2_admission_release', () =>
        f.db.query(
          'insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref)values($1,$2)',
          [f.permit, 'PERMIT_REVOKED'],
        ),
      );
      await expect(f.history(pay, 'FINANCE', '6', '7')).rejects.toMatchObject({
        code: '55000',
        message: 'INDUSTRY_ADMISSION_MISSING_OR_REVOKED',
      });
    } finally {
      await f.db.close();
    }
  });
  it('registers an immutable WORK order from real Core RUN/BOOK/SHIP frame DATA and requires actual COMMITTED service WORK before PAY', async () => {
    const f = await seeded();
    try {
      const before = (
        await f.db.query(
          'select (select count(*)::int from world_v2.command_submission)as commands,(select count(*)::int from world_v2.authoritative_event)as events,(select count(*)::int from world_v2.command_receipt)as receipts',
        )
      ).rows;
      const registered = await f.publish(f.workOrder);
      expect(registered.rows).toEqual([
        {
          order_ref: f.workOrder.inputRef,
          order_sha256: sha(C.canonicalSerialize(f.workOrder)),
        },
      ]);
      expect((await f.publish(f.workOrder)).rows).toEqual(registered.rows);
      const rows = (await f.rows()).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: 'WORK',
        original_ref: f.workOrder.inputRef,
        original_text: C.canonicalSerialize(f.workOrder),
        world_version: '3',
        event_sequence: '3',
        seed_fingerprint: f.f.seed.fingerprint,
        admission_ref: f.admission,
      });
      await expect(f.publish(f.payOrder)).rejects.toMatchObject({
        code: '55000',
        message: 'LOGISTICS_ORDER_EXACT_COMMITTED_STAGE_REQUIRED',
      });
      await f.store(f.work);
      expect((await f.publish(f.payOrder)).rows).toHaveLength(1);
      expect((await f.rows('4', '4')).rows).toHaveLength(2);
      expect((await f.publish(f.payOrder)).rows).toHaveLength(1);
      const after = (
        await f.db.query(
          'select (select count(*)::int from world_v2.command_submission)as commands,(select count(*)::int from world_v2.authoritative_event)as events,(select count(*)::int from world_v2.command_receipt)as receipts',
        )
      ).rows;
      expect(before).toEqual([{ commands: 3, events: 3, receipts: 3 }]);
      expect(after).toEqual([{ commands: 4, events: 4, receipts: 4 }]);
      expect(
        (
          await f.db.query(
            'select count(*)::int as batches from world_v2.financial_posting_batch',
          )
        ).rows,
      ).toEqual([{ batches: 0 }]);
    } finally {
      await f.db.close();
    }
  });
  it('refuses wrong role, World, current head, seed, changed source and raw access using actual separated roles', async () => {
    const f = await seeded();
    try {
      const raw = C.canonicalSerialize(f.workOrder);
      await expect(
        f.asRole('world_v2_industry_source_reader', () =>
          f.db.query(
            'select * from world_v2.publish_postwar_industry_logistics_order($1,$2,$3,$4)',
            [f.f.world, f.f.country, raw, sha(raw)],
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await f.publish(f.workOrder);
      await expect(f.rows('2', '2')).rejects.toMatchObject({
        code: '55000',
        message: 'LOGISTICS_ORDER_ACTUAL_HEAD_AND_PINS_REQUIRED',
      });
      await expect(f.rows('3', '3', 'COUNTRY_01')).rejects.toMatchObject({
        code: '22023',
        message: 'LOGISTICS_ORDER_EXACT_ADOPTED_SCOPE_REQUIRED',
      });
      await expect(
        f.rows('3', '3', 'COUNTRY_02', 'sha256:' + 'f'.repeat(64)),
      ).rejects.toMatchObject({
        code: '55000',
        message: 'LOGISTICS_ORDER_ACTUAL_HEAD_AND_PINS_REQUIRED',
      });
      await expect(
        f.publish({ ...f.workOrder, worldId: 'WORLD_WRONG' }),
      ).rejects.toMatchObject({
        code: '23514',
        message: 'LOGISTICS_ORDER_EXACT_SCOPE_REFERENCE_REQUIRED',
      });
      for (const role of [
        'world_v2_industry_source_reader',
        'world_v2_industry_source_publisher',
      ]) {
        await expect(
          f.asRole(role, () =>
            f.db.query(
              'select * from world_v2.postwar_industry_logistics_order',
            ),
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          f.asRole(role, () =>
            f.db.query('select canonical_payload from world_v2.opening_seed'),
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          f.asRole(role, () =>
            f.db.exec('set role world_v2_industry_source_owner'),
          ),
        ).rejects.toMatchObject({ code: '42501' });
      }
      await f.db.query(
        'insert into world_v2.postwar_industry_first_day_source_revocation(world_id,source_ref,reason_ref)values($1,$2,$3)',
        [f.f.world, f.sourceRef, 'TEST_ONLY_REVOKED'],
      );
      await expect(f.rows()).rejects.toMatchObject({
        code: '55000',
        message: 'LOGISTICS_ORDER_CURRENT_FIRSTDAY_REVOKED',
      });
      await expect(f.publish(f.workOrder)).rejects.toMatchObject({
        code: '55000',
        message: 'LOGISTICS_ORDER_CURRENT_FIRSTDAY_REVOKED',
      });
    } finally {
      await f.db.close();
    }
  });
  it('rejects malformed orders and preserves immutable refs and confirmed transaction rollback', async () => {
    const f = await seeded();
    try {
      await expect(
        f.publish({ ...f.workOrder, allocations: [] }),
      ).rejects.toMatchObject({
        code: '23514',
        message: 'LOGISTICS_ORDER_BOUNDED_LABOUR_ORIGINAL_REQUIRED',
      });
      await expect(
        f.publish({ ...f.workOrder, paid: true }),
      ).rejects.toMatchObject({
        code: '23514',
        message: 'LOGISTICS_ORDER_CLOSED_SCHEMA_REQUIRED',
      });
      await expect(
        f.asRole('world_v2_industry_source_publisher', async () => {
          const raw = C.canonicalSerialize(f.workOrder);
          await f.db.query(
            'select * from world_v2.publish_postwar_industry_logistics_order($1,$2,$3,$4)',
            [f.f.world, f.f.country, raw, sha(raw)],
          );
          throw Error('TEST_ONLY_ABORT');
        }),
      ).rejects.toThrow('TEST_ONLY_ABORT');
      expect((await f.rows()).rows).toEqual([]);
      await f.publish(f.workOrder);
      await expect(
        f.publish({ ...f.workOrder, labourSourceRef: 'WRONG_CHANGED_REF' }),
      ).rejects.toMatchObject({
        code: '23514',
        message: 'LOGISTICS_ORDER_IMMUTABLE_REFERENCE_CONFLICT',
      });
      expect((await f.rows()).rows).toHaveLength(1);
      await expect(
        f.asRole('world_v2_industry_source_owner', async () => {
          await f.db.query(
            "select set_config('econmind.industry_source_world',$1,true)",
            [f.f.world],
          );
          return f.db.query(
            'delete from world_v2.postwar_industry_logistics_order',
          );
        }),
      ).rejects.toMatchObject({ code: '55000' });
      expect((await f.rows()).rows).toHaveLength(1);
    } finally {
      await f.db.close();
    }
  });
  it('installs the actual logistics declarations with existing Industry roles only', async () => {
    const db = await schema();
    try {
      expect(
        (
          await db.query(
            "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='world_v2'and p.proname in('publish_postwar_industry_logistics_order','read_postwar_industry_logistics_orders')order by proname",
          )
        ).rows,
      ).toHaveLength(2);
      for (const role of [
        'world_v2_industry_source_publisher',
        'world_v2_industry_source_reader',
      ]) {
        expect(
          (
            await db.query<{ raw: boolean }>(
              "select has_table_privilege($1,'world_v2.postwar_industry_logistics_order','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')as raw",
              [role],
            )
          ).rows,
        ).toEqual([{ raw: false }]);
      }
    } finally {
      await db.close();
    }
  });
});
