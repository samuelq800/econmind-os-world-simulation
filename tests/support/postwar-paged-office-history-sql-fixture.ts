/** Actual SQL transport using genuine canonical Core frames. Metadata identities
 * and source registration are explicit TEST_ONLY; no formal source admission. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import * as C from '@econmind/core';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  createCaptainSourcePublicationPacket,
  publishCaptainOperatingSourceFrom,
} from '../../apps/world-worker/src/persistence/postwar-captain-source-publication.js';
import type { CaptainOperatingOriginal } from '../../apps/world-worker/src/persistence/captain-operating-source-custody.js';
import type { createPagedCaptainBudgetCapacityFrames } from './postwar-paged-office-history-capacity-fixture.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-10-29T00:00:00.000Z';
const read = (p: string) =>
  readFile(new URL('../../database/' + p, import.meta.url), 'utf8');
export async function createPagedOfficeSqlCapacityFixture(
  actual: Awaited<ReturnType<typeof createPagedCaptainBudgetCapacityFrames>>,
) {
  const db = new PGlite();
  const seed = C.parseOpeningSeed(JSON.parse(actual.serializedSeed), sha);
  const records = JSON.parse(actual.serializedFrames) as readonly {
    financialPostingBatches: readonly unknown[];
    inventoryPostings: readonly unknown[];
    events: readonly { sequence: string }[];
  }[];
  const w = seed.worldId,
    permit = sha(w),
    admission = 'ADMISSION_' + permit.toUpperCase();
  const executor: SqlExecutor = {
    async query<Row extends object>(q: string, p: readonly unknown[] = []) {
      const r = await db.query<Row>(q, [...p]);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
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
    await db.exec(
      await read('proposals/financial-posting-decimal-validation.sql'),
    );
    await db.exec(`create role world_v2_social_source_reader nologin nosuperuser nobypassrls;create role world_v2_finance_budget_source_reader nologin nosuperuser nobypassrls;create role world_v2_day_one_fx_source_reader nologin nosuperuser nobypassrls;
 grant usage on schema world_v2 to world_v2_social_source_reader,world_v2_finance_budget_source_reader,world_v2_day_one_fx_source_reader;
 create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,admission_ref text,model_version text,replay_binding text,admitted_at_real timestamptz);
 create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
 create table world_v2.runtime_admission_publication_revocation(authorization_id text);
 create table world_v2.runtime_read_seat(world_id text,auth_subject uuid);create table world_v2.projection_entitlement(world_id text);
 create table world_v2.postwar_day_one_fx_source_original(world_id text,registration_ref text,seed_id text,seed_fingerprint text,admission_ref text,policy_sha256 text,user_receipt_sha256 text);
 create table world_v2.postwar_day_one_fx_quote_original(world_id text,country_id text,quote_ref text,source_revision text,quote_text text,quote_text_sha256 text);
 create table world_v2.postwar_day_one_fx_source_revocation(registration_ref text);create table world_v2.postwar_day_one_fx_quote_revocation(quote_ref text);
 create table world_v2.social_operating_source_registration(world_id text,country_id text,seed_fingerprint text,admission_ref text,registration_ref text);create table world_v2.social_operating_source_revocation(registration_ref text);
 create table world_v2.finance_budget_policy_original(world_id text,country_id text,seed_fingerprint text,admission_ref text,policy_ref text);create table world_v2.finance_budget_policy_revocation(policy_ref text);`);

    await db.exec(`create role world_v2_admission_release nologin nosuperuser nobypassrls;
 create table world_v2.world_writer_lease(world_id text,holder_id text,fencing_token bigint,acquired_at_real timestamptz,renewed_at_real timestamptz,lease_expires_at_real timestamptz);
 create role capacity_test_release login nosuperuser nobypassrls;grant world_v2_admission_release to capacity_test_release;
 create role capacity_test_finance login nosuperuser nobypassrls;grant world_v2_finance_budget_source_reader to capacity_test_finance;
 grant usage on schema world_v2 to world_v2_admission_release;
 create table world_v2.central_bank_omo_adoption(adoption_ref text,world_id text,country_id text,seed_id text,seed_fingerprint text,admission_ref text,original_sha256 text,source_ref text,source_class text,source_revision text,admission_revision text);
 create table world_v2.central_bank_omo_revocation(adoption_ref text,resource_ref text);
 create table world_v2.central_bank_omo_original(adoption_ref text,original_sha256 text,original_text text);
 create table world_v2.central_bank_omo_quote(adoption_ref text,quote_ref text,quote_text text,quote_sha256 text);`);
    for (const p of [
      'captain-operating-custody',
      'postwar-captain-source-publication',
      'postwar-captain-mixed-read',
    ])
      await db.exec(await read('proposals/' + p + '.sql'));
    for (const p of [
      'postwar-day-one-fx-history-read',
      'postwar-bounded-journal-read',
      'postwar-bounded-prefix-read',
      'postwar-bounded-prefix-pages',
      'postwar-paged-office-history-originals',
    ])
      await db.exec(await read('proposals/' + p + '.sql'));
    await db.query('insert into world_v2.world_head values($1,0,0)', [w]);
    const { fingerprint, ...intent } = seed;
    await db.query(
      'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5,$6)',
      [
        w,
        seed.seedId,
        C.canonicalSerialize(seed.replayBinding),
        C.canonicalSerialize(intent),
        fingerprint,
        at,
      ],
    );
    await db.query(
      'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,$5,$6,$7)',
      [
        w,
        seed.seedId,
        seed.fingerprint,
        admission,
        seed.replayBinding.modelVersion,
        C.canonicalSerialize(seed.replayBinding),
        at,
      ],
    );
    await db.query(
      'insert into world_v2.runtime_admission_publication_permit values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        'PERMIT_' + w,
        permit,
        w,
        seed.seedId,
        seed.fingerprint,
        seed.replayBinding.modelVersion,
        C.canonicalSerialize(seed.replayBinding),
        '2026-01-01T00:00:00.000Z',
        '2027-01-01T00:00:00.000Z',
      ],
    );
    await db.query(
      'insert into world_v2.social_operating_source_registration values($1,$2,$3,$4,$5)',
      [w, 'COUNTRY_01', seed.fingerprint, admission, 'SOCIAL_' + w],
    );
    await db.query(
      'insert into world_v2.finance_budget_policy_original values($1,$2,$3,$4,$5)',
      [w, 'COUNTRY_01', seed.fingerprint, admission, 'FINANCE_' + w],
    );

    function record(ref: string, payload: unknown): CaptainOperatingOriginal {
      const bytes = C.canonicalSerialize(payload);
      return {
        recordId: ref,
        revision: 'TEST_ONLY_REV',
        factRef: ref,
        sourceRef: ref.startsWith('REASON_')
          ? 'REASON_SOURCE_TEST_ONLY'
          : 'TEST_ONLY_SOURCE',
        predecessorFactRefs: ref.startsWith('REASON_')
          ? ['REASON_ORIGINAL_TEST_ONLY_COUNTRY_01']
          : ['TEST_ONLY_PARENT'],
        issuerRef: 'TEST_ONLY_ISSUER',
        custodianRef: 'TEST_ONLY_CUSTODIAN',
        admissionRef: 'TEST_ONLY_SOURCE_ADMISSION',
        admissionRevision: 'TEST_ONLY_ADOPTION_REV',
        sourceClass: 'TEST_ONLY',
        effectiveFromSimTime: '0',
        effectiveUntilSimTime: null,
        revokedByRevision: null,
        canonicalPayload: bytes,
        payloadSHA256: sha(bytes),
      };
    }
    const packet = createCaptainSourcePublicationPacket({
      adoption: {
        adoptionRef: 'ADOPTION_CAPACITY_TEST_ONLY',
        worldId: w,
        countryId: 'COUNTRY_01',
        seedId: seed.seedId,
        seedFingerprint: seed.fingerprint,
        worldAdmissionRef: admission,
        issuerRef: 'TEST_ONLY_ISSUER',
        custodianRef: 'TEST_ONLY_CUSTODIAN',
        admissionRef: 'TEST_ONLY_SOURCE_ADMISSION',
        admissionRevision: 'TEST_ONLY_ADOPTION_REV',
        originalAdmissionEvidenceSha256: sha('TEST_ONLY_NOT_APPROVAL'),
      },
      genesis: record('GENESIS_TEST_ONLY', {
        schemaVersion: 'captain-operating-genesis-v1',
        worldId: w,
        countryId: 'COUNTRY_01',
        seedId: seed.seedId,
        seedFingerprint: seed.fingerprint,
        semanticRevision: 'TEST_ONLY_CAPITAL_V1',
        capital: actual.captain.capital,
      }),
      reasons: [
        record('REASON_TEST_ONLY_COUNTRY_01', {
          schemaVersion: 'captain-operating-reason-v1',
          worldId: w,
          countryId: 'COUNTRY_01',
          reason: {
            countryRef: 'COUNTRY_01',
            recordRef: 'RECORD_TEST_ONLY_COUNTRY_01',
            reason:
              'TEST_ONLY transfer from original existing capital; no generation',
          },
        }),
      ],
    });
    // Registration is controlled by the existing actual release function.
    await db.exec(
      'set session authorization capacity_test_release;set role world_v2_admission_release',
    );
    const bytes = C.canonicalSerialize(packet);
    await db.query(
      'select world_v2.register_captain_source_publication($1,$2)',
      [bytes, sha(bytes)],
    );
    await publishCaptainOperatingSourceFrom(executor, packet);
    await db.exec('reset role;set session authorization postgres');
    for (let offset = 0; offset < records.length; offset += 40) {
      const raw = C.canonicalSerialize(records.slice(offset, offset + 40));
      await db.query(
        `insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,country_id,office_id,actor_id,auth_subject,expected_world_version,sim_time,canonical_payload,payload_sha256,command_fingerprint,correlation_id,submitted_at_real)select c->>'worldId',c->>'commandId',c->>'idempotencyKey',c->>'commandType',c->>'schemaVersion',c->>'countryId',c->>'officeId',c->>'actorId',(c->>'authSubject')::uuid,(c->>'expectedWorldVersion')::bigint,(c->>'simTime')::bigint,c->>'canonicalPayload',c->>'payloadHash',c->>'fingerprint',c->>'correlationId',(c->>'submittedAtReal')::timestamptz from jsonb_array_elements($1::jsonb)f cross join lateral(select f->'command'c)x`,
        [raw],
      );
      await db.query(
        `insert into world_v2.authoritative_event(world_id,event_id,event_type,schema_version,causation_command_id,correlation_id,world_version,event_sequence,sim_time,recorded_at_real,corrects_event_id,canonical_payload,payload_sha256,event_fingerprint)select e->>'worldId',e->>'eventId',e->>'eventType',e->>'schemaVersion',e->>'causationCommandId',e->>'correlationId',(e->>'worldVersion')::bigint,(e->>'sequence')::bigint,(e->>'simTime')::bigint,(e->>'recordedAtReal')::timestamptz,e->>'correctsEventId',e->>'canonicalPayload',e->>'payloadHash',e->>'fingerprint'from jsonb_array_elements($1::jsonb)f cross join lateral jsonb_array_elements(f->'events')e`,
        [raw],
      );
      await db.query(
        `insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)select r->>'worldId',r->>'commandId',r->>'idempotencyKey',r->>'schemaVersion',r->>'commandFingerprint',r->>'outcome',r->>'reasonCode',r->>'transitionId',(r->>'worldVersionBefore')::bigint,(r->>'worldVersionAfter')::bigint,(r->>'simTime')::bigint,r->'eventIds',(r->>'recordedAtReal')::timestamptz from jsonb_array_elements($1::jsonb)f cross join lateral(select f->'receipt'r)x`,
        [raw],
      );
    }
    for (const frame of records) {
      for (const posting of frame.financialPostingBatches) {
        const raw = JSON.parse(C.canonicalSerialize(posting)) as Record<
          string,
          unknown
        >;
        const { fingerprint, ...body } = raw;
        await db.query(
          'insert into world_v2.financial_posting_batch(world_id,batch_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,settlement_currency,canonical_payload,batch_fingerprint)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [
            w,
            raw.batchId,
            raw.causationCommandId,
            raw.worldVersionBefore,
            raw.worldVersionAfter,
            raw.simTime,
            JSON.stringify(raw.causationEventIds),
            C.canonicalSerialize(raw.transitionBinding),
            raw.settlementCurrency,
            C.canonicalSerialize(body),
            fingerprint,
          ],
        );
      }
      for (const posting of frame.inventoryPostings) {
        const raw = JSON.parse(C.canonicalSerialize(posting)) as Record<
          string,
          unknown
        >;
        const { fingerprint, ...body } = raw;
        await db.query(
          'insert into world_v2.inventory_posting(world_id,posting_id,causation_command_id,world_version_before,world_version_after,sim_time,event_ids,transition_binding,operation,canonical_payload,posting_fingerprint)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [
            w,
            raw.postingId,
            raw.causationCommandId,
            raw.worldVersionBefore,
            raw.worldVersionAfter,
            raw.simTime,
            JSON.stringify(raw.causationEventIds),
            C.canonicalSerialize(raw.transitionBinding),
            raw.operation,
            C.canonicalSerialize(body),
            fingerprint,
          ],
        );
      }
    }
    await db.query(
      'update world_v2.world_head set world_version=$2,event_sequence=$3 where world_id=$1',
      [
        w,
        String(records.length),
        records.at(-1)?.events.at(-1)?.sequence ?? '0',
      ],
    );
    async function asFinance<T>(consume: (tx: SqlExecutor) => Promise<T>) {
      await db.exec(
        'set session authorization capacity_test_finance;begin isolation level repeatable read;set local role world_v2_finance_budget_source_reader',
      );
      try {
        const value = await consume(executor);
        await db.exec('commit');
        return value;
      } finally {
        await db.exec('rollback;reset role;set session authorization postgres');
      }
    }
    return {
      db,
      seed,
      admission,
      executor,
      asFinance,
      close: () => db.close(),
    };
  } catch (e) {
    await db.close();
    throw e;
  }
}
