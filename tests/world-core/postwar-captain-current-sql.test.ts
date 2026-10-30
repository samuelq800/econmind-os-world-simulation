/** Isolated SQL effect/derived-page mechanism with TEST_ONLY header seams.
 * These tiny header/seat DATA fixtures do not prove genuine admission, native
 * locking or production publication. Actual allocation events are Core-derived;
 * unknown frames and bad allocations are never blessed by a readiness boolean. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  createCaptainMixedTestFixture,
  testOnlyCaptainFrame,
} from '../support/captain-finance-social-fixture.js';
import { createCaptainSourcePublicationPacket } from '../../apps/world-worker/src/persistence/postwar-captain-source-publication.js';
import type { CaptainOperatingOriginal } from '../../apps/world-worker/src/persistence/captain-operating-source-custody.js';
import type { FinanceNativeBudgetCanonicalFrame } from '../../packages/core/src/commands/finance-budget-native.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex'),
  hash = (v: unknown) => 'sha256:' + sha('SHA-256\n' + C.canonicalSerialize(v));
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const f = createCaptainMixedTestFixture(),
  world = f.f.seed.worldId,
  country = 'COUNTRY_01',
  admission = 'TEST_ONLY_ADMISSION';
let db: PGlite;
const frames: FinanceNativeBudgetCanonicalFrame[] = [];
function original(
  ref: string,
  payload: unknown,
  sourceRef: string,
  pred: readonly string[],
): CaptainOperatingOriginal {
  const raw = C.canonicalSerialize(payload);
  return {
    recordId: ref,
    revision: 'TEST_ONLY_REV',
    factRef: ref,
    sourceRef,
    predecessorFactRefs: pred,
    issuerRef: 'TEST_ONLY_ISSUER',
    custodianRef: 'TEST_ONLY_CUSTODIAN',
    admissionRef: 'TEST_ONLY_CAPTAIN_ADMISSION',
    admissionRevision: 'TEST_ONLY_CAPTAIN_REV',
    sourceClass: 'TEST_ONLY',
    effectiveFromSimTime: '0',
    effectiveUntilSimTime: null,
    revokedByRevision: null,
    canonicalPayload: raw,
    payloadSHA256: sha(raw),
  };
}
async function admin() {
  await db.exec('reset role;set session authorization postgres');
}
async function persist(frame: FinanceNativeBudgetCanonicalFrame) {
  await admin();
  const c = frame.command,
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
  frames.push(frame);
  await db.query(
    'update world_v2.world_head set world_version=$2,event_sequence=$3 where world_id=$1',
    [world, frame.transition.worldVersionAfter, frame.events.at(-1)!.sequence],
  );
}
function coverage() {
  const events = frames.flatMap((f) => f.events),
    last = events.at(-1)!;
  return {
    prefixFingerprint: hash({
      worldId: world,
      seedFingerprint: f.f.seed.fingerprint,
      headWorldVersion: frames.at(-1)!.transition.worldVersionAfter,
      headEventSequence: last.sequence,
      frames,
    }),
    knownEffectsFingerprint: hash(
      frames.map((f) => ({
        commandId: f.command.commandId,
        countryId: f.command.countryId,
        commandType: f.command.commandType,
        transitionFingerprint: hash(f.transition),
        receiptFingerprint: hash(f.receipt),
        eventFingerprints: f.events.map((e) => e.fingerprint),
        worldVersionBefore: f.transition.worldVersionBefore,
        worldVersionAfter: f.transition.worldVersionAfter,
        events: f.events.map((e) => ({
          eventId: e.eventId,
          fingerprint: e.fingerprint,
          sequence: e.sequence,
          worldVersion: e.worldVersion,
        })),
      })),
    ),
    coveredThroughEventId: last.eventId,
    coveredThroughEventFingerprint: last.fingerprint,
    financialPostingCount: '0',
    financialBatchCount: '0',
    financialPostingsFingerprint: hash([]),
  };
}
function assertion() {
  const s = f.replay(frames).captainCountries![0]!.state,
    cap = s.capital;
  const rows = cap.buckets.map((b) => ({
    schemaVersion: 'postwar-captain-political-capital-row-v1',
    countryId: country,
    capitalRef: cap.capitalRef,
    bucket: b.bucket,
    unit: 'political_capital',
    balance: b.balance.amount,
    opening: cap.opening.amount,
    generated: cap.generated.amount,
    total: cap.total.amount,
    available: cap.available.amount,
    spent: cap.spent.amount,
    closing: cap.closing.amount,
    allocationNature: 'REALLOCATION_NOT_GENERATION_OR_SPENDING',
  }));
  return C.canonicalSerialize({
    head: {
      worldId: world,
      worldVersion: s.worldVersion,
      eventSequence: s.lastEventSequence,
    },
    seedPins: {
      worldId: world,
      seedId: f.f.seed.seedId,
      seedFingerprint: f.f.seed.fingerprint,
      admissionRef: admission,
    },
    coverage: coverage(),
    capitalStateHash: hash(cap),
    rowsHash: hash(rows),
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema world_v2;
 create role world_v2_admission_release nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
 create table world_v2.opening_seed(world_id text,seed_id text unique,seed_fingerprint text,unique(world_id,seed_fingerprint));
 create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
 create table world_v2.runtime_opening_admission(world_id text,admission_ref text unique,seed_id text,seed_fingerprint text,model_version text,replay_binding text,admitted_at_real timestamptz);
 create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
 create table world_v2.runtime_admission_publication_revocation(authorization_id text);
 create table world_v2.world_writer_lease(world_id text,holder_id text,fencing_token bigint,acquired_at_real timestamptz,renewed_at_real timestamptz,lease_expires_at_real timestamptz);
 create table world_v2.current_commit_authorization(world_id text,auth_subject uuid,country_id text,office_id text,team_id text,authorization_version text,capability text,active boolean);
 create table world_v2.authoritative_event(event_id text,event_type text,schema_version text,world_id text,causation_command_id text,correlation_id text,world_version bigint,event_sequence bigint,sim_time bigint,recorded_at_real timestamptz,corrects_event_id text,canonical_payload text,payload_sha256 text,event_fingerprint text);
 create table world_v2.command_submission(actor_id text,auth_subject uuid,canonical_payload text,country_id text,expected_world_version bigint,command_fingerprint text,command_id text,idempotency_key text,office_id text,payload_sha256 text,schema_version text,sim_time bigint,submitted_at_real timestamptz,command_type text,world_id text,correlation_id text);
 create table world_v2.command_receipt(world_id text,command_id text,idempotency_key text,schema_version text,command_fingerprint text,outcome text,reason_code text,transition_id text,world_version_before bigint,world_version_after bigint,sim_time bigint,event_ids jsonb,recorded_at_real timestamptz);
 create table world_v2.financial_posting_batch(world_id text,batch_id text,causation_command_id text,canonical_payload text,batch_fingerprint text,world_version_before bigint,world_version_after bigint,sim_time bigint,event_ids jsonb,transition_binding text,settlement_currency text);
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
 create function world_v2.reject_authoritative_history_mutation()returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE_HISTORY';end;$$;
create table world_v2.postwar_office_projection_document(
 document_ref text primary key,world_id text not null,country_id text not null,
 office_id text not null check(office_id in('CAPTAIN','FINANCE','CENTRAL_BANK','INDUSTRY','TRADE','SOCIAL')),
 dataset text not null,projection_version text not null check(projection_version='postwar-office-projection.v1'),
 source_version text not null unique,source_revision text not null,
 admission_ref text not null references world_v2.runtime_opening_admission(admission_ref),
 seed_id text not null references world_v2.opening_seed(seed_id),seed_fingerprint text not null,
 canonical_seed_sha256 text not null check(canonical_seed_sha256~'^[0-9a-f]{64}$'),
 source_bundle_sha256 text not null check(source_bundle_sha256~'^[0-9a-f]{64}$'),
 source_id text not null,source_payload_hash text not null,source_pointer jsonb not null,
 model_version text not null,replay_binding text not null,world_version bigint not null check(world_version=0),event_sequence bigint not null check(event_sequence=0),
 document_sha256 text not null check(document_sha256~'^[0-9a-f]{64}$'),total_rows integer not null check(total_rows>=0),page_count integer not null check(page_count>0),
 generated_at timestamptz not null default clock_timestamp(),
 foreign key(world_id,seed_fingerprint) references world_v2.opening_seed(world_id,seed_fingerprint),
 unique(world_id,country_id,office_id,dataset,projection_version),unique(document_ref,world_id,country_id,office_id),unique(document_ref,world_id)
);
create table world_v2.postwar_office_projection_page(
 document_ref text not null,world_id text not null,country_id text not null,office_id text not null,page_index integer not null check(page_index>=0),
 row_offset integer not null check(row_offset>=0),row_count integer not null check(row_count between 0 and 100),
 rows_text text not null check(octet_length(rows_text)<=48000 and jsonb_typeof(rows_text::jsonb)='array'),
 page_sha256 text not null check(page_sha256=encode(sha256(convert_to(rows_text,'UTF8')),'hex')),
 primary key(document_ref,page_index),foreign key(document_ref,world_id,country_id,office_id)references world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id),unique(document_ref,row_offset),check(jsonb_array_length(rows_text::jsonb)=row_count)
);
create table world_v2.postwar_office_projection_revocation(
 document_ref text primary key,world_id text not null,reason_ref text not null check(length(reason_ref) between 1 and 256),revoked_at timestamptz not null default clock_timestamp(),foreign key(document_ref,world_id)references world_v2.postwar_office_projection_document(document_ref,world_id)
);

 create role world_v2_postwar_projection_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
 create role world_v2_postwar_projection_publisher nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
 create role world_v2_postwar_projection_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
 grant usage,create on schema world_v2 to world_v2_postwar_projection_owner;
 grant usage on schema world_v2 to world_v2_postwar_projection_publisher,world_v2_postwar_projection_reader;
 create table world_v2.postwar_social_prefix_scope(world_id text,country_id text,seed_fingerprint text,admission_ref text,source_bundle_sha256 text,scope_document text,scope_sha256 text);
 create table world_v2.current_materialization(world_id text,materialization_key text,world_version bigint,source_command_id text,payload_sha256 text);
`);
  await db.exec(`alter table world_v2.postwar_social_prefix_scope owner to world_v2_postwar_projection_owner;alter table world_v2.postwar_office_projection_document owner to world_v2_postwar_projection_owner;alter table world_v2.postwar_office_projection_page owner to world_v2_postwar_projection_owner;
 grant select on all tables in schema world_v2 to world_v2_postwar_projection_owner;grant update(world_version)on world_v2.world_head to world_v2_postwar_projection_owner;
 create function world_v2.postwar_projection_admission_header(p_world text)returns table(seed_id text,seed_fingerprint text,admission_ref text,source_bundle_sha256 text,canonical_seed_sha256 text,model_version text,replay_binding text)language sql as $$select a.seed_id,a.seed_fingerprint,a.admission_ref,repeat('a',64),repeat('b',64),a.model_version,a.replay_binding from world_v2.runtime_opening_admission a where a.world_id=p_world$$;`);
  const integrity = await read(
    'database/migrations/artifacts/0009_world_v2_posting_payload_integrity.sql',
  );
  await db.exec(integrity.slice(0, integrity.indexOf('$$;') + 3));
  for (const p of [
    'captain-operating-custody',
    'postwar-captain-source-publication',
    'postwar-mixed-current-projection-read',
    'postwar-captain-current-derived-read',
  ])
    await db.exec(await read('database/proposals/' + p + '.sql'));
  await db.exec(
    'create role captain_current_test_publisher login nosuperuser nobypassrls;grant world_v2_postwar_projection_publisher to captain_current_test_publisher',
  );
  await db.query('insert into world_v2.opening_seed values($1,$2,$3)', [
    world,
    f.f.seed.seedId,
    f.f.seed.fingerprint,
  ]);
  await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
  await db.query(
    'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,$5,$6,now())',
    [
      world,
      admission,
      f.f.seed.seedId,
      f.f.seed.fingerprint,
      f.f.seed.replayBinding.modelVersion,
      C.canonicalSerialize(f.f.seed.replayBinding),
    ],
  );
  const first = testOnlyCaptainFrame({
      fixture: f,
      frames: [],
      identity: 'CURRENT_FIRST',
    }),
    source = JSON.parse(first.events[0]!.canonicalPayload).source;
  const packet = createCaptainSourcePublicationPacket({
    adoption: {
      adoptionRef: 'CAPTAIN_CURRENT_TEST_ONLY',
      worldId: world,
      countryId: country,
      seedId: f.f.seed.seedId,
      seedFingerprint: f.f.seed.fingerprint,
      worldAdmissionRef: admission,
      issuerRef: 'TEST_ONLY_ISSUER',
      custodianRef: 'TEST_ONLY_CUSTODIAN',
      admissionRef: 'TEST_ONLY_CAPTAIN_ADMISSION',
      admissionRevision: 'TEST_ONLY_CAPTAIN_REV',
      originalAdmissionEvidenceSha256: sha('TEST_ONLY_NOT_OWNER'),
    },
    genesis: original(
      'GENESIS_TEST_ONLY_' + country,
      {
        schemaVersion: 'captain-operating-genesis-v1',
        worldId: world,
        countryId: country,
        seedId: f.f.seed.seedId,
        seedFingerprint: f.f.seed.fingerprint,
        semanticRevision: source.trace.calculationVersion,
        capital: source.capitalFact.payload,
      },
      source.capitalFact.sourceRef,
      ['TEST_ONLY_PARENT'],
    ),
    reasons: [
      original(
        source.reasonFact.factRef,
        {
          schemaVersion: 'captain-operating-reason-v1',
          worldId: world,
          countryId: country,
          reason: source.reasonFact.payload,
        },
        source.reasonFact.sourceRef,
        source.reasonFact.predecessorFactRefs,
      ),
    ],
  });
  const a = packet.adoption;
  await db.query(
    'insert into world_v2.captain_source_publication_registry(adoption_ref,world_id,country_id,seed_id,seed_fingerprint,world_admission_ref,packet_sha256,packet_text,original_admission_evidence_sha256)values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      a.adoptionRef,
      world,
      country,
      a.seedId,
      a.seedFingerprint,
      admission,
      sha(C.canonicalSerialize(packet)),
      C.canonicalSerialize(packet),
      a.originalAdmissionEvidenceSha256,
    ],
  );
  await db.query(
    'insert into world_v2.captain_operating_source_adoption values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      a.adoptionRef,
      world,
      country,
      a.seedFingerprint,
      a.issuerRef,
      a.custodianRef,
      a.admissionRef,
      a.admissionRevision,
      a.originalAdmissionEvidenceSha256,
    ],
  );
  for (const [k, o] of [
    ['GENESIS', packet.genesis],
    ...packet.reasons.map((r) => ['REASON', r] as const),
  ] as const)
    await db.query(
      'insert into world_v2.captain_operating_original values($1,$2,$3,$4,$5)',
      [
        a.adoptionRef,
        k,
        o.factRef,
        C.canonicalSerialize(o),
        sha(C.canonicalSerialize(o)),
      ],
    );
  const body = C.canonicalSerialize({
    funding: [
      {
        payerRole: 'GOV',
        countryId: country,
        payerEntityId: f.f.accounts.treasuryAsset.ownerId,
        issuerEntityId: f.f.accounts.treasuryLiability.ownerId,
        accountRef: f.f.accounts.treasuryAsset.accountId,
        claimId: f.f.accounts.treasuryAsset.claimId,
        currency: 'XAA',
        reservedAmount: '200',
      },
    ],
    positions: f.social.state.labour.positions,
    servicePools: f.social.state.servicePools,
  });
  await db.query(
    'insert into world_v2.postwar_social_prefix_scope values($1,$2,$3,$4,$5,$6,$7)',
    [
      world,
      country,
      f.f.seed.fingerprint,
      admission,
      'a'.repeat(64),
      body,
      sha(body),
    ],
  );
  // Header/locking seams are TEST_ONLY infrastructure; the actual complete
  // prefix and both existing SQL publication bodies below remain unmodified.
  await db.exec(`create function world_v2.lock_postwar_social_current_prefix_publication(p_world text,p_country text)returns table(world_version text,event_sequence text)language sql as $$select h.world_version::text,h.event_sequence::text from world_v2.world_head h where h.world_id=p_world$$;
 create function world_v2.postwar_social_origin_at_prefix(p_world text,p_country text)returns table(state jsonb,binding jsonb,origin_world_version bigint,origin_event_sequence bigint)language sql as $$select null::jsonb,null::jsonb,0::bigint,0::bigint where false$$;
 create table world_v2.test_only_financial_originals(world_id text,country_id text,originals_text text);
 grant select on world_v2.test_only_financial_originals to world_v2_postwar_projection_owner;
 create function world_v2.read_postwar_financial_current_publication_originals(p_world text,p_country text)returns table(originals_text text,originals_sha256 text)language sql as $$select world_v2.canonical_json(o.originals_text::jsonb||jsonb_build_object('head',jsonb_build_object('worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text))),encode(sha256(convert_to(world_v2.canonical_json(o.originals_text::jsonb||jsonb_build_object('head',jsonb_build_object('worldVersion',h.world_version::text,'eventSequence',h.event_sequence::text))),'UTF8')),'hex')from world_v2.test_only_financial_originals o join world_v2.world_head h on h.world_id=o.world_id where o.world_id=p_world and o.country_id=p_country$$;`);
  await db.exec(
    await read(
      'database/proposals/postwar-mixed-financial-current-publication.sql',
    ),
  );
  const fund = {
    payerRole: 'GOV',
    countryId: country,
    payerEntityId: f.f.accounts.treasuryAsset.ownerId,
    issuerEntityId: f.f.accounts.treasuryLiability.ownerId,
    accountRef: f.f.accounts.treasuryAsset.accountId,
    claimId: f.f.accounts.treasuryAsset.claimId,
    currency: 'XAA',
    reservedAmount: '200',
  };
  const sc = C.canonicalSerialize({
    ...JSON.parse(body),
    funding: [
      fund,
      {
        payerRole: 'OP',
        countryId: country,
        issuerEntityId: f.f.accounts.bankGcuAsset.ownerId,
      },
    ],
  });
  await db.query(
    'update world_v2.postwar_social_prefix_scope set scope_document=$2,scope_sha256=$3 where world_id=$1',
    [world, sc, sha(sc)],
  );
  const positions = f.f.financial.positions.map((p) => ({
    account: p.account,
    netDebitBalance: p.netDebitBalance.toCanonicalValue(),
  }));
  await db.query(
    'insert into world_v2.test_only_financial_originals values($1,$2,$3)',
    [
      world,
      country,
      C.canonicalSerialize({
        fundingAccounts: [fund],
        financeLedgerRows: positions.filter(
          (p) => p.account.ownerId === fund.payerEntityId,
        ),
        centralBankLedgerRows: positions.filter(
          (p) => p.account.ownerId !== fund.payerEntityId,
        ),
      }),
    ],
  );
  for (const [office, datasets] of [
    ['FINANCE', ['currency-fx', 'opening-financial-legs']],
    [
      'CENTRAL_BANK',
      [
        'currency-fx',
        'cb-categories',
        'cb-holdings',
        'bank-loans',
        'opening-financial-legs',
      ],
    ],
    ['SOCIAL', ['positions', 'service-pools']],
  ] as const)
    for (const dataset of datasets) {
      const rows =
          dataset === 'positions'
            ? f.social.state.labour.positions
            : dataset === 'service-pools'
              ? f.social.state.servicePools
              : [],
        raw = C.canonicalSerialize(rows),
        ref = office + '_' + dataset;
      await db.query(
        "insert into world_v2.postwar_office_projection_document(document_ref,world_id,country_id,office_id,dataset,projection_version,source_version,source_revision,admission_ref,seed_id,seed_fingerprint,canonical_seed_sha256,source_bundle_sha256,source_id,source_payload_hash,source_pointer,model_version,replay_binding,world_version,event_sequence,document_sha256,total_rows,page_count)values($1,$2,$3,$4,$5,'postwar-office-projection.v1',$6,'TEST_ONLY_SOURCE',$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,0,0,$17,$18,1)",
        [
          ref,
          world,
          country,
          office,
          dataset,
          hash(ref),
          admission,
          f.f.seed.seedId,
          f.f.seed.fingerprint,
          'b'.repeat(64),
          'a'.repeat(64),
          f.f.seed.sources[0]!.sourceId,
          f.f.seed.sources[0]!.payloadHash,
          C.canonicalSerialize({
            financialSourceId: f.f.seed.sources[0]!.sourceId,
          }),
          f.f.seed.replayBinding.modelVersion,
          C.canonicalSerialize(f.f.seed.replayBinding),
          sha(raw),
          rows.length,
        ],
      );
      await db.query(
        'insert into world_v2.postwar_office_projection_page values($1,$2,$3,$4,0,0,$5,$6,$7)',
        [ref, world, country, office, rows.length, raw, sha(raw)],
      );
    }
  await persist(
    await f.budgetFrame(
      'SET_ENVELOPE',
      frames,
      'OPENING_BEFORE_CAPTAIN',
      '100',
    ),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe('Captain current exact reducer and complete mixed prefix SQL', () => {
  it('publishes admitted origin0 after a full foreign Budget prefix before the first Captain allocation', async () => {
    await admin();
    await db.exec('set session authorization captain_current_test_publisher');
    const r = await db.query<Record<string, unknown>>(
      'select * from world_v2.publish_postwar_captain_current($1,$2,$3)',
      [world, country, assertion()],
    );
    expect(r.rows[0]).toMatchObject({
      world_version: 1,
      event_sequence: 1,
      origin_world_version: 0,
      origin_event_sequence: 0,
    });
    const rows = JSON.parse(r.rows[0]!.rows_text as string);
    expect(rows[0]).toMatchObject({
      balance: '40',
      total: '100',
      generated: '0',
      spent: '0',
    });
  });

  it('independently rederives Core allocation including source/preparation hashes and rejects changed totals', async () => {
    const frame = testOnlyCaptainFrame({
        fixture: f,
        frames,
        identity: 'CURRENT_FIRST',
      }),
      event = JSON.parse(C.canonicalSerialize(frame.events[0]!)),
      command = JSON.parse(C.canonicalSerialize(frame.command));
    await admin();
    const r = await db.query<{ capital: unknown }>(
      'select world_v2.postwar_mixed_captain_group($1,$2::jsonb,$3::jsonb,null)capital',
      [world, JSON.stringify(command), JSON.stringify(event)],
    );
    expect(r.rows[0]!.capital).toEqual(
      JSON.parse(frame.events[0]!.canonicalPayload).capitalAfter,
    );
    const body = JSON.parse(event.canonicalPayload);
    body.capitalAfter.available.amount = '101';
    event.canonicalPayload = C.canonicalSerialize(body);
    await expect(
      db.query(
        'select world_v2.postwar_mixed_captain_group($1,$2::jsonb,$3::jsonb,null)',
        [world, JSON.stringify(command), JSON.stringify(event)],
      ),
    ).rejects.toThrow('ALLOCATION_DIFFERS');
    await persist(frame);
  });
  it('publishes source-registered current capital at the exact complete global head, not a passed flag', async () => {
    await admin();
    await db.exec('set session authorization captain_current_test_publisher');
    const r = await db.query<Record<string, unknown>>(
      'select * from world_v2.publish_postwar_captain_current($1,$2,$3)',
      [world, country, assertion()],
    );
    expect(r.rows[0]).toMatchObject({
      country_id: country,
      world_version: 2,
      event_sequence: 2,
    });
    const rows = JSON.parse(r.rows[0]!.rows_text as string);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({
      balance: '38',
      total: '100',
      generated: '0',
      spent: '0',
    });
    const bad = JSON.parse(assertion());
    bad.capitalStateHash = 'sha256:' + 'f'.repeat(64);
    await expect(
      db.query(
        'select * from world_v2.publish_postwar_captain_current($1,$2,$3)',
        [world, country, JSON.stringify(bad)],
      ),
    ).rejects.toThrow('CORE_SQL_STATE_OR_PREFIX_MISMATCH');
  });
  it('keeps the old Finance and Social SQL publishers usable after Captain and Budget rather than filtering Captain', async () => {
    await persist(
      await f.budgetFrame('APPROVE_NEW_LINE', frames, 'CURRENT_LINE', '20'),
    );
    await persist(
      testOnlyCaptainFrame({ fixture: f, frames, identity: 'CURRENT_SECOND' }),
    );
    await admin();
    const prefix = (
      await db.query<Record<string, unknown>>(
        'select * from world_v2.postwar_mixed_current_prefix($1)',
        [world],
      )
    ).rows[0]!;
    expect(prefix.prefix_fingerprint).toBe(coverage().prefixFingerprint);
    expect(prefix.effects_fingerprint).toBe(coverage().knownEffectsFingerprint);
    expect(prefix.financial_batch_count).toBe('0');
    const shared = f.replay(frames),
      state = shared.socialCountries[0]!.lifecycle.employment;
    const base = {
      head: { worldId: world, worldVersion: '4', eventSequence: '6' },
      seedPins: {
        worldId: world,
        seedId: f.f.seed.seedId,
        seedFingerprint: f.f.seed.fingerprint,
        admissionRef: admission,
      },
      coverage: coverage(),
    };
    const gov = f.f.accounts.treasuryAsset.ownerId,
      cb = f.f.accounts.treasuryLiability.ownerId;
    const balanceRows = (owner: boolean) =>
      shared.financial.positions
        .filter((p) =>
          owner ? p.account.ownerId === gov : p.account.ownerId !== gov,
        )
        .map((p) => ({
          schemaVersion: 'postwar-current-financial-balance-row-v2',
          countryId: country,
          accountId: p.account.accountId,
          ownerEntityId: p.account.ownerId,
          ownerKind:
            p.account.ownerId === gov
              ? 'GOV'
              : p.account.ownerId === cb
                ? 'CB'
                : 'BANK',
          currency: p.account.currency,
          accountClass: p.account.accountClass,
          claimId: p.account.claimId,
          counterpartyEntityId: p.account.counterpartyEntityId,
          netDebitBalance: p.netDebitBalance.toCanonicalValue().amount,
          balanceNature:
            p.account.accountClass === 'CASH' && p.account.currency === 'GCU'
              ? 'GCU_CASH'
              : p.account.claimId !== null &&
                  p.account.counterpartyEntityId !== null
                ? 'RECIPROCAL_LEDGER_CLAIM'
                : 'LEDGER_POSITION',
        }))
        .sort((a, b) => a.accountId.localeCompare(b.accountId));
    const currentRows = {
      FINANCE: {
        'ledger-balances': balanceRows(true),
        'treasury-capacity': [
          {
            schemaVersion: 'postwar-treasury-capacity-row-v2',
            countryId: country,
            accountId: f.f.accounts.treasuryAsset.accountId,
            claimId: f.f.accounts.treasuryAsset.claimId,
            currency: 'XAA',
            treasuryLedgerClaimBalance: '1000',
            openingReservedCapacity: '200',
            budgetEnvelopeCapacity: '100',
            additionalPayrollReservedCapacity: '0',
            totalReservedCapacity: '300',
            availableCapacity: '700',
            governmentGcuCurrency: 'GCU',
            governmentGcuCashBalance: '0',
            governmentGcuAccountIds: [],
            reservationNature: 'CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED',
            balanceNature: 'RECIPROCAL_LEDGER_CLAIM_NOT_CASH_WALLET',
            gcuBalanceNature: 'GOVERNMENT_OWNED_GCU_CASH_NOT_OFFICIAL_RESERVES',
          },
        ],
      },
      CENTRAL_BANK: { 'ledger-balances': balanceRows(false) },
    };
    await db.exec('set session authorization captain_current_test_publisher');
    expect(
      (
        await db.query(
          'select * from world_v2.publish_postwar_mixed_financial_current($1,$2,$3)',
          [
            world,
            country,
            C.canonicalSerialize({
              ...base,
              currentRowsHash: hash(currentRows),
            }),
          ],
        )
      ).rows,
    ).toHaveLength(10);
    expect(
      (
        await db.query(
          'select * from world_v2.publish_postwar_mixed_social_current($1,$2,$3)',
          [
            world,
            country,
            C.canonicalSerialize({
              ...base,
              employmentStateHash: hash(state),
              materializationHash: hash(state),
              positionsHash: hash(state.labour.positions),
              servicePoolsHash: hash(state.servicePools),
            }),
          ],
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await db.query(
          'select * from world_v2.publish_postwar_captain_current($1,$2,$3)',
          [world, country, assertion()],
        )
      ).rows,
    ).toHaveLength(1);
  });
});
