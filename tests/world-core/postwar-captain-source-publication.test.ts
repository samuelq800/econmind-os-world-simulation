/** Isolated SQL mechanism with explicit TEST_ONLY adoption/header rows.
 * This proves the empty exact registry and ACL, not Owner admission/signature,
 * native concurrency, official initial capital or a production installation. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import * as SourceCore from '../../packages/core/src/index.js';
import {
  createCaptainSourcePublicationPacket,
  validateCaptainSourcePublicationPacket,
  publishCaptainOperatingSourceFrom,
} from '../../apps/world-worker/src/persistence/postwar-captain-source-publication.js';
import type { CaptainOperatingOriginal } from '../../apps/world-worker/src/persistence/captain-operating-source-custody.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  createCaptainMixedTestFixture,
  testOnlyCaptainFrame,
  testOnlyCaptainOriginal,
} from '../support/captain-finance-social-fixture.js';
import { readPostwarCaptainHistoryOriginalsFrom } from '../../apps/world-worker/src/persistence/postwar-captain-history-originals.js';
import {
  mixedWorld,
  mixedFxFrame,
} from '../support/finance-social-fx-replay-fixture.js';
import { decodeBoundedPostwarCanonicalPrefix } from '../../apps/world-worker/src/persistence/bounded-postwar-canonical-prefix.js';
import { decodeBoundedPostwarJournal } from '../../apps/world-worker/src/persistence/bounded-postwar-fx-postings.js';
import type { FinanceNativeBudgetCanonicalFrame } from '../../packages/core/src/commands/finance-budget-native.js';
import {
  loadAdoptedCaptainOpeningPolicy,
  createAdoptedCaptainOpeningCandidate,
  readbackAdoptedCaptainNewScenarioFrom,
} from '../../apps/world-worker/src/preparation/postwar-captain-opening-source.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const world = mixedWorld,
  country = 'COUNTRY_01',
  fp = 'sha256:' + '1'.repeat(64),
  worldAdmission = 'ADMISSION_' + '2'.repeat(64).toUpperCase(),
  subject = '11111111-1111-4111-8111-111111111111';
function record(ref: string, payload: unknown): CaptainOperatingOriginal {
  const bytes = canonicalSerialize(payload);
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
function packet() {
  return createCaptainSourcePublicationPacket({
    adoption: {
      adoptionRef: 'ADOPTION_TEST_ONLY',
      worldId: world,
      countryId: country,
      seedId: 'SEED_TEST_ONLY',
      seedFingerprint: fp,
      worldAdmissionRef: worldAdmission,
      issuerRef: 'TEST_ONLY_ISSUER',
      custodianRef: 'TEST_ONLY_CUSTODIAN',
      admissionRef: 'TEST_ONLY_SOURCE_ADMISSION',
      admissionRevision: 'TEST_ONLY_ADOPTION_REV',
      originalAdmissionEvidenceSha256: sha('TEST_ONLY_NOT_APPROVAL'),
    },
    genesis: record('GENESIS_TEST_ONLY', {
      schemaVersion: 'captain-operating-genesis-v1',
      worldId: world,
      countryId: country,
      seedId: 'SEED_TEST_ONLY',
      seedFingerprint: fp,
      semanticRevision: 'TEST_ONLY_CAPITAL_V1',
      capital: testOnlyCaptainOriginal().capital,
    }),
    reasons: [
      record('REASON_TEST_ONLY_COUNTRY_01', {
        schemaVersion: 'captain-operating-reason-v1',
        worldId: world,
        countryId: country,
        reason: {
          countryRef: country,
          recordRef: 'RECORD_TEST_ONLY_COUNTRY_01',
          reason:
            'TEST_ONLY transfer from original existing capital; no generation',
        },
      }),
    ],
  });
}
let db: PGlite;
const executor: SqlExecutor = {
  async query<Row extends object>(q: string, p: readonly unknown[] = []) {
    const r = await db.query<Row>(q, [...p]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
};
async function admin() {
  await db.exec('reset role;set session authorization postgres');
}
async function release() {
  await admin();
  await db.exec(
    'set session authorization captain_test_release;set role world_v2_admission_release',
  );
}
async function reader() {
  await admin();
  await db.exec(
    'set session authorization captain_test_reader;set role world_v2_captain_source_reader',
  );
}
beforeAll(async () => {
  db = new PGlite();
  // Header-only fixture intentionally has no canonical seed payload. Thus the
  // candidate functions cannot accidentally use a full-seed JSON fallback.
  await db.exec(`create schema world_v2;
 create role world_v2_admission_release nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
 create table world_v2.opening_seed(world_id text,seed_id text,seed_fingerprint text,unique(world_id,seed_fingerprint));
 create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
 create table world_v2.runtime_opening_admission(world_id text,admission_ref text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,admitted_at_real timestamptz);
 create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
 create table world_v2.runtime_admission_publication_revocation(authorization_id text);
 create table world_v2.world_writer_lease(world_id text,holder_id text,fencing_token bigint,acquired_at_real timestamptz,renewed_at_real timestamptz,lease_expires_at_real timestamptz);
 create table world_v2.current_commit_authorization(world_id text,auth_subject uuid,country_id text,office_id text,team_id text,authorization_version text,capability text,active boolean);
 create table world_v2.authoritative_event(event_id text,event_type text,schema_version text,world_id text,causation_command_id text,correlation_id text,world_version bigint,event_sequence bigint,sim_time bigint,recorded_at_real timestamptz,corrects_event_id text,canonical_payload text,payload_sha256 text,event_fingerprint text);
 create table world_v2.command_submission(actor_id text,auth_subject uuid,canonical_payload text,country_id text,expected_world_version bigint,command_fingerprint text,command_id text,idempotency_key text,office_id text,payload_sha256 text,schema_version text,sim_time bigint,submitted_at_real timestamptz,command_type text,world_id text,correlation_id text);
 create table world_v2.command_receipt(world_id text,command_id text,idempotency_key text,schema_version text,command_fingerprint text,outcome text,reason_code text,transition_id text,world_version_before bigint,world_version_after bigint,sim_time bigint,event_ids jsonb,recorded_at_real timestamptz);
 create table world_v2.financial_posting_batch(world_id text,batch_id text,causation_command_id text,canonical_payload text,batch_fingerprint text);
 create table world_v2.inventory_posting(world_id text);
 create table world_v2.postwar_day_one_fx_quote_original(world_id text,country_id text,quote_ref text,quote_text text,quote_text_sha256 text);
 create role world_v2_social_source_reader nologin nosuperuser nobypassrls;
 create role world_v2_finance_budget_source_reader nologin nosuperuser nobypassrls;
 create role world_v2_day_one_fx_source_reader nologin nosuperuser nobypassrls;
 grant usage on schema world_v2 to world_v2_social_source_reader,world_v2_finance_budget_source_reader,world_v2_day_one_fx_source_reader;
 create table world_v2.social_operating_source_registration(world_id text,country_id text,registration_ref text,seed_fingerprint text,admission_ref text);
 create table world_v2.social_operating_source_revocation(registration_ref text);
 create table world_v2.finance_budget_policy_original(world_id text,country_id text,policy_ref text,seed_fingerprint text,admission_ref text);
 create table world_v2.finance_budget_policy_revocation(policy_ref text);
 create table world_v2.postwar_day_one_fx_source_revocation(world_id text,registration_ref text);
 create table world_v2.postwar_day_one_fx_quote_revocation(world_id text,country_id text,quote_ref text);
 create table world_v2.postwar_day_one_fx_source_original(world_id text,registration_ref text,seed_id text,seed_fingerprint text,admission_ref text);
 create function world_v2.reject_authoritative_history_mutation()returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE_HISTORY';end;$$;`);
  await db.exec(
    'alter table world_v2.opening_seed enable row level security;alter table world_v2.opening_seed force row level security;alter table world_v2.runtime_opening_admission enable row level security;alter table world_v2.runtime_opening_admission force row level security',
  );
  for (const p of [
    'captain-operating-custody',
    'postwar-captain-source-publication',
    'postwar-captain-mixed-read',
  ])
    await db.exec(await read('database/proposals/' + p + '.sql'));
  await db.exec(`create role captain_test_release login nosuperuser nobypassrls;grant world_v2_admission_release to captain_test_release;
 create role captain_test_reader login nosuperuser nobypassrls;grant world_v2_captain_source_reader to captain_test_reader;grant usage on schema world_v2 to world_v2_admission_release;`);
  await db.query('insert into world_v2.opening_seed values($1,$2,$3)', [
    world,
    'SEED_TEST_ONLY',
    fp,
  ]);
  await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
  await db.query(
    "insert into world_v2.runtime_opening_admission values($1,$2,'SEED_TEST_ONLY',$3,'TEST_ONLY_MODEL','TEST_ONLY_BINDING',now())",
    [world, worldAdmission, fp],
  );
  await db.query(
    "insert into world_v2.runtime_admission_publication_permit values('TEST_ONLY_PERMIT',$1,$2,'SEED_TEST_ONLY',$3,'TEST_ONLY_MODEL','TEST_ONLY_BINDING',now()-interval '1 day',now()+interval '1 day')",
    ['2'.repeat(64), world, fp],
  );
  await db.query(
    "insert into world_v2.current_commit_authorization values($1,$2,$3,'CAPTAIN','TEAM_TEST_ONLY','REV_TEST_ONLY','CAPTAIN_CABINET',true)",
    [world, subject, country],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe('Captain release exact registry and fixed bounded mixed source', () => {
  it('recovers an exact approved70 initialization without writes and rejects partial/different/running instances', async () => {
    const w = 'WORLD_CAPTAIN_APPROVED_RECOVERY_NEW_TEST',
      s = 'SEED_CAPTAIN_APPROVED_RECOVERY_TEST',
      f = 'sha256:' + '3'.repeat(64),
      adm = 'ADMISSION_' + '4'.repeat(64);
    await admin();
    await db.query('insert into world_v2.opening_seed values($1,$2,$3)', [
      w,
      s,
      f,
    ]);
    await db.query('insert into world_v2.world_head values($1,0,0)', [w]);
    await db.query(
      "insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,'TEST_ONLY_MODEL','TEST_ONLY_BINDING',now())",
      [w, adm, s, f],
    );
    await db.query(
      "insert into world_v2.runtime_admission_publication_permit values('TEST_ONLY_APPROVED_RECOVERY_PERMIT',$1,$2,$3,$4,'TEST_ONLY_MODEL','TEST_ONLY_BINDING',now()-interval '1 day',now()+interval '1 day')",
      ['4'.repeat(64), w, s, f],
    );
    const policy = await loadAdoptedCaptainOpeningPolicy(
        new URL('../../', import.meta.url).pathname,
      ),
      candidate = createAdoptedCaptainOpeningCandidate(policy, {
        worldId: w,
        seedId: s,
        seedFingerprint: f,
        worldAdmissionRef: adm,
        countryIds: Array.from(
          { length: 70 },
          (_, i) => 'COUNTRY_' + String(i + 1).padStart(2, '0'),
        ),
      });
    await release();
    expect(
      await readbackAdoptedCaptainNewScenarioFrom(executor, policy, candidate),
    ).toMatchObject({ status: 'NOT_PUBLISHED', publicationCount: 0 });
    // Isolated TEST metadata; exact source bytes/numeric rule are genuinely
    // derived from the current adopted70 policy, not the old100 fixture.
    const publish = async (p: (typeof candidate.packets)[number]) => {
      const raw = canonicalSerialize(p);
      await db.query(
        'select world_v2.register_captain_source_publication($1,$2)',
        [raw, sha(raw)],
      );
      return publishCaptainOperatingSourceFrom(executor, p);
    };
    await db.exec('begin');
    await publish(candidate.packets[0]!);
    await db.exec('savepoint partial');
    await expect(
      readbackAdoptedCaptainNewScenarioFrom(executor, policy, candidate),
    ).rejects.toThrow('PARTIAL_OR_DIFFERENT');
    await db.exec('rollback to savepoint partial;rollback');
    await admin();
    await release();
    for (const p of candidate.packets) await publish(p);
    const first = await readbackAdoptedCaptainNewScenarioFrom(
      executor,
      policy,
      candidate,
    );
    expect(first).toMatchObject({
      status: 'ALREADY_PUBLISHED',
      publicationCount: 70,
    });
    expect(
      await readbackAdoptedCaptainNewScenarioFrom(executor, policy, candidate),
    ).toEqual(first);
    await publish(candidate.packets[0]!);
    expect(
      await readbackAdoptedCaptainNewScenarioFrom(executor, policy, candidate),
    ).toEqual(first);
    const manifest = candidate.packets.map((p) => ({
      countryId: p.adoption.countryId,
      adoptionRef: p.adoption.adoptionRef,
      packetSha256: sha(canonicalSerialize(p)),
    }));
    manifest[0]!.packetSha256 = 'f'.repeat(64);
    await expect(
      db.query(
        'select * from world_v2.read_captain_opening_publication_readback($1,$2,$3,$4)',
        [w, f, adm, canonicalSerialize(manifest)],
      ),
    ).rejects.toThrow('EXACT_UNREVOKED');
    await admin();
    await db.query(
      'update world_v2.world_head set world_version=1 where world_id=$1',
      [w],
    );
    await release();
    await expect(
      readbackAdoptedCaptainNewScenarioFrom(executor, policy, candidate),
    ).rejects.toThrow('UNEXECUTED_SCENARIO');
    await admin();
    expect(
      (
        await db.query<{ n: string }>(
          'select count(*)::text n from world_v2.captain_source_publication_registry where world_id=$1',
          [w],
        )
      ).rows[0]?.n,
    ).toBe('70');
  });

  it('requires conserved original capital and explicit same-country reasons, no defaults or caller ready', () => {
    const p = packet();
    expect(validateCaptainSourcePublicationPacket(p)).toEqual(p);
    const broken = JSON.parse(canonicalSerialize(p));
    const g = JSON.parse(broken.genesis.canonicalPayload);
    g.capital.available.amount = '99';
    broken.genesis.canonicalPayload = canonicalSerialize(g);
    broken.genesis.payloadSHA256 = sha(broken.genesis.canonicalPayload);
    broken.originalTexts[broken.genesis.factRef] = canonicalSerialize(
      broken.genesis,
    );
    expect(() => validateCaptainSourcePublicationPacket(broken)).toThrow();
    const foreign = JSON.parse(canonicalSerialize(p));
    foreign.adoption.countryId = 'COUNTRY_02';
    expect(() => validateCaptainSourcePublicationPacket(foreign)).toThrow(
      'COUNTRY',
    );
  });
  it('keeps registry empty/reader EXEC-only and refuses unregistered publication', async () => {
    expect(
      (
        await db.query(
          "select has_table_privilege('captain_test_reader','world_v2.captain_source_publication_registry','INSERT,UPDATE,DELETE')w,has_function_privilege('captain_test_reader','world_v2.publish_captain_operating_source(text,text)','EXECUTE')p,has_table_privilege('captain_test_reader','world_v2.authoritative_event','SELECT')raw,has_function_privilege('captain_test_reader','world_v2.read_postwar_captain_mixed_prefix(text,text,uuid,text)','EXECUTE')r",
        )
      ).rows,
    ).toEqual([{ w: false, p: false, raw: false, r: true }]);
    await release();
    await expect(
      publishCaptainOperatingSourceFrom(executor, packet()),
    ).rejects.toThrow('REGISTERED_PACKET');
    await admin();
    expect(
      (
        await db.query(
          'select count(*)::text n from world_v2.captain_operating_source_adoption where world_id=$1',
          [world],
        )
      ).rows,
    ).toEqual([{ n: '0' }]);
  });
  it('guards the actual low-role new-scenario H0 and refuses any already started history', async () => {
    await release();
    expect(
      (
        await db.query(
          'select * from world_v2.read_captain_new_scenario_opening_scope($1,$2,$3)',
          [world, fp, worldAdmission],
        )
      ).rows,
    ).toEqual([
      {
        seed_id: 'SEED_TEST_ONLY',
        seed_fingerprint: fp,
        admission_ref: worldAdmission,
      },
    ]);
    for (const kind of ['head', 'command', 'receipt', 'event'] as const) {
      await admin();
      await db.exec('begin');
      try {
        if (kind === 'head')
          await db.query(
            'update world_v2.world_head set world_version=1 where world_id=$1',
            [world],
          );
        else
          await db.query(
            'insert into world_v2.' +
              {
                command: 'command_submission',
                receipt: 'command_receipt',
                event: 'authoritative_event',
              }[kind]! +
              '(world_id)values($1)',
            [world],
          );
        await release();
        await expect(
          db.query(
            'select * from world_v2.read_captain_new_scenario_opening_scope($1,$2,$3)',
            [world, fp, worldAdmission],
          ),
        ).rejects.toThrow('FRESH_UNEXECUTED_UNINITIALIZED');
      } finally {
        await db.exec('rollback');
        await admin();
      }
    }
    await reader();
    await expect(
      db.query(
        'select * from world_v2.read_captain_new_scenario_opening_scope($1,$2,$3)',
        [world, fp, worldAdmission],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await admin();
  });
  it('publishes only separately registered exact TEST_ONLY bytes, reads H0 without rawseed and rejects cross-country/head', async () => {
    const p = packet(),
      bytes = canonicalSerialize(p),
      hash = sha(bytes);
    await release();
    await db.query(
      'select world_v2.register_captain_source_publication($1,$2)',
      [bytes, hash],
    );
    expect(await publishCaptainOperatingSourceFrom(executor, p)).toEqual({
      adoptionRef: p.adoption.adoptionRef,
      packetSha256: hash,
    });
    expect(await publishCaptainOperatingSourceFrom(executor, p)).toEqual({
      adoptionRef: p.adoption.adoptionRef,
      packetSha256: hash,
    });
    await reader();
    const r = await db.query<Record<string, unknown>>(
      'select * from world_v2.read_postwar_captain_mixed_prefix($1,$2,$3::uuid,$4)',
      [world, country, subject, '0'],
    );
    expect(r.rows[0]).toMatchObject({
      world_version: '0',
      event_sequence: '0',
      seed_id: 'SEED_TEST_ONLY',
      seed_fingerprint: fp,
      events: [],
      commands: [],
      receipts: [],
      financial_batches: [],
      captain_packets: [
        { packet_sha256: hash, packet_text: bytes, originals: p.originalTexts },
      ],
      fx_quotes: [],
    });
    await expect(
      db.query(
        'select * from world_v2.read_postwar_captain_mixed_prefix($1,$2,$3::uuid,$4)',
        [world, 'COUNTRY_02', subject, '0'],
      ),
    ).rejects.toThrow('CURRENT_ACTOR');
    await expect(
      db.query(
        'select * from world_v2.read_postwar_captain_mixed_prefix($1,$2,$3::uuid,$4)',
        [world, country, subject, '1'],
      ),
    ).rejects.toThrow('ACTUAL_HEAD');
    await admin();
  });
  it('does not reinitialize a World with an existing Captain adoption even while its head is zero', async () => {
    await release();
    await expect(
      db.query(
        'select * from world_v2.read_captain_new_scenario_opening_scope($1,$2,$3)',
        [world, fp, worldAdmission],
      ),
    ).rejects.toThrow('FRESH_UNEXECUTED_UNINITIALIZED');
    await admin();
  });
  it('replays actual Captain then Budget and FX through fixed history DATA for each existing source role', async () => {
    const f = createCaptainMixedTestFixture();
    const frames: FinanceNativeBudgetCanonicalFrame[] = [];
    frames.push(
      testOnlyCaptainFrame({ fixture: f, frames, identity: 'REVERSE' }),
    );
    frames.push(
      await f.budgetFrame('SET_ENVELOPE', frames, 'REVERSE_SET', '100'),
    );
    frames.push(
      await mixedFxFrame({
        financial: f.replay(frames).financial,
        original: f.f,
        sequence: '3',
        identity: 'REVERSE_FX',
      }),
    );
    await admin();
    // Actual full canonical frame rows, never a no-posting/no-effect flag.
    for (const frame of frames) {
      const c = frame.command,
        t = frame.transition,
        r = frame.receipt;
      await db.query(
        'insert into world_v2.command_submission values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
        [
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
          c.simTime.toCanonicalValue(),
          c.submittedAtReal,
          c.commandType,
          c.worldId,
          c.correlationId,
        ],
      );
      for (const e of frame.events)
        await db.query(
          'insert into world_v2.authoritative_event values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
          [
            e.eventId,
            e.eventType,
            e.schemaVersion,
            e.worldId,
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
        'insert into world_v2.command_receipt values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)',
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
      for (const batch of frame.financialPostingBatches)
        await db.query(
          'insert into world_v2.financial_posting_batch values($1,$2,$3,$4,$5)',
          [
            c.worldId,
            (batch as { batchId: string }).batchId,
            c.commandId,
            SourceCore.canonicalSerialize(
              Object.fromEntries(
                Object.entries(batch as object).filter(
                  ([key]) => key !== 'fingerprint',
                ),
              ),
            ),
            (batch as { fingerprint: string }).fingerprint,
          ],
        );
      void t;
    }
    await db.query(
      'update world_v2.world_head set world_version=3,event_sequence=3 where world_id=$1',
      [world],
    );
    await db.query(
      'insert into world_v2.social_operating_source_registration values($1,$2,$3,$4,$5)',
      [world, country, 'SOCIAL_TEST_ONLY', fp, worldAdmission],
    );
    await db.query(
      'insert into world_v2.finance_budget_policy_original values($1,$2,$3,$4,$5)',
      [world, country, 'FINANCE_TEST_ONLY', fp, worldAdmission],
    );
    await db.query(
      'insert into world_v2.postwar_day_one_fx_source_original values($1,$2,$3,$4,$5)',
      [world, 'FX_TEST_ONLY', 'SEED_TEST_ONLY', fp, worldAdmission],
    );
    await db.query(
      'insert into world_v2.postwar_day_one_fx_quote_original values($1,$2,$3,$4,$5)',
      [
        world,
        country,
        f.f.quote.quoteRef,
        canonicalSerialize(f.f.quote),
        sha(canonicalSerialize(f.f.quote)),
      ],
    );
    await reader();
    const actual = await db.query<Record<string, unknown>>(
      'select * from world_v2.read_postwar_captain_mixed_prefix($1,$2,$3::uuid,$4)',
      [world, country, subject, '3'],
    );
    const decoded = decodeBoundedPostwarCanonicalPrefix({
      worldId: world,
      prefixRow: actual.rows[0],
      journal: decodeBoundedPostwarJournal(actual.rows[0]),
    });
    // mixedFxFrame also returns its independently derived financialAfter for
    // pure-kernel tests. That convenience result is not a persisted frame.
    type FrameData = {
      command: unknown;
      events: unknown;
      transition: unknown;
      receipt: unknown;
      financialPostingBatches: readonly { batchId: string }[];
      inventoryPostings: unknown;
    };
    const frameData = ({
      command,
      events,
      transition,
      receipt,
      financialPostingBatches,
      inventoryPostings,
    }: FrameData) => ({
      command,
      events,
      transition,
      receipt,
      financialPostingBatches: [...financialPostingBatches].sort((a, b) =>
        a.batchId.localeCompare(b.batchId),
      ),
      inventoryPostings,
    });
    const normalized = (bytes: string) =>
      (JSON.parse(bytes) as FrameData[]).map(frameData);
    expect(normalized(canonicalSerialize(decoded.frames))).toEqual(
      normalized(SourceCore.canonicalSerialize(frames)),
    );
    for (const [office, role] of [
      ['SOCIAL', 'world_v2_social_source_reader'],
      ['FINANCE', 'world_v2_finance_budget_source_reader'],
      ['TREASURY_FX', 'world_v2_day_one_fx_source_reader'],
    ] as const) {
      await admin();
      await db.exec(
        `create role captain_history_${office.toLowerCase()} login nosuperuser nobypassrls;grant ${role} to captain_history_${office.toLowerCase()}`,
      );
      await db.exec(
        `set session authorization captain_history_${office.toLowerCase()};set role ${role}`,
      );
      const origins = await readPostwarCaptainHistoryOriginalsFrom(executor, {
        worldId: world,
        hostCountryId: country,
        officeId: office,
        seedFingerprint: fp,
        admissionRef: worldAdmission,
        expectedHead: { worldVersion: '3', eventSequence: '3' },
        frames: decoded.frames,
      });
      expect(origins).toEqual([testOnlyCaptainOriginal()]);
      const replay = f.replay(frames);
      expect(replay.budgetState.worldVersion).toBe('3');
      expect(
        replay.captainCountries?.[0]?.state.capital.buckets[0]?.balance.amount,
      ).toBe('38');
      expect(replay.budgetEncumbrances).toHaveLength(1);
      expect(replay.currentTreasuryBalances[0]?.amount).toBe('990.000001');
      await expect(
        readPostwarCaptainHistoryOriginalsFrom(executor, {
          worldId: world,
          hostCountryId: 'COUNTRY_02',
          officeId: office,
          seedFingerprint: fp,
          admissionRef: worldAdmission,
          expectedHead: { worldVersion: '3', eventSequence: '3' },
          frames: decoded.frames,
        }),
      ).rejects.toThrow('CURRENT_HOST_SOURCE');
    }
    await admin();
  });
  it('rejects immutable conflicts and current source/admission revocation', async () => {
    await admin();
    const actualHead = (
      await db.query<{ h: string }>(
        'select world_version::text h from world_v2.world_head where world_id=$1',
        [world],
      )
    ).rows[0]!.h;
    const p = packet(),
      changed = JSON.parse(canonicalSerialize(p));
    changed.adoption.originalAdmissionEvidenceSha256 = sha(
      'DIFFERENT_TEST_ONLY_RECEIPT',
    );
    await release();
    await expect(
      db.query('select world_v2.register_captain_source_publication($1,$2)', [
        canonicalSerialize(changed),
        sha(canonicalSerialize(changed)),
      ]),
    ).rejects.toThrow('REGISTRY_CONFLICT');
    await admin();
    await db.query(
      "insert into world_v2.captain_operating_source_revocation(adoption_ref,reason_ref)values('ADOPTION_TEST_ONLY','TEST_ONLY_REVOKED')",
    );
    await reader();
    await expect(
      db.query(
        'select * from world_v2.read_postwar_captain_mixed_prefix($1,$2,$3::uuid,$4)',
        [world, country, subject, actualHead],
      ),
    ).rejects.toThrow('CURRENT_SOURCE');
    await release();
    await expect(
      publishCaptainOperatingSourceFrom(executor, p),
    ).rejects.toThrow('ADOPTION_REVOKED');
    await admin();
    await db.query(
      "insert into world_v2.runtime_admission_publication_revocation values('TEST_ONLY_PERMIT')",
    );
    await release();
    await expect(
      publishCaptainOperatingSourceFrom(executor, p),
    ).rejects.toThrow('ADMISSION_REVOKED');
    await admin();
  });
});
