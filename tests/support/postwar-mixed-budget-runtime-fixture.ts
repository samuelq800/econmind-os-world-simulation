/** TEST_ONLY own clone of the genuine sealed H6 prefix. No seed regeneration,
 * caller source rows, raw-seed reader grant, credentials or production setup. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { canonicalSerialize } from '@econmind/core';
import {
  clonePostwarNativeReference,
  loadPostwarNativeReferenceMarker,
  sealPostwarReferenceClone,
} from './postwar-native-reference-db.js';

const sql = (name: string) =>
  readFile(
    new URL('../../database/proposals/' + name, import.meta.url),
    'utf8',
  );
export async function createPostwarMixedBudgetRuntimeFixture(
  checkpointPath: string,
) {
  const cachedPath =
    process.env.ECONMIND_POSTWAR_MIXED_CAPACITY_SOURCE_CHECKPOINT;
  if (cachedPath) return loadCachedMixedBudgetRuntimeFixture(cachedPath);
  const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8')) as {
    referenceMarker: string;
    database: string;
    templateSealed: boolean;
    head: { world_version: string; event_sequence: string };
    policy: { envelopeRef: string; effectivePeriodRef: string };
  };
  if (
    !checkpoint.templateSealed ||
    checkpoint.head.world_version !== '6' ||
    checkpoint.head.event_sequence !== '10'
  )
    throw Error('REAL_SEALED_H6_REQUIRED');
  const marker = await loadPostwarNativeReferenceMarker(
    checkpoint.referenceMarker,
  );
  let clone = await clonePostwarNativeReference(
    marker,
    'mixed_budget_capacity',
    checkpoint.database,
  );
  const nonce = randomBytes(4).toString('hex'),
    workerRole = 'budget_test_worker_' + nonce,
    intakeRole = 'budget_test_intake_' + nonce,
    publisherRole = 'budget_test_publisher_' + nonce,
    workerId = 'WORKER_NATIVE_BUDGET_' + nonce.toUpperCase();
  const pools: Pool[] = [];
  const open = (role: string) => {
    const p = new Pool({
      host: marker.socket,
      port: marker.port,
      database: clone.database,
      user: role,
      password: async () => '',
      ssl: false,
      max: 2,
      idleTimeoutMillis: 1000,
      // Offline publication must stop inside the test setup budget, so a
      // timed-out harness cannot leave a late source COMMIT behind.
      options:
        '-c request.jwt.claim.sub=' +
        marker.subject +
        (role === publisherRole ? ' -c statement_timeout=120000' : ''),
    });
    p.on('error', () => undefined);
    pools.push(p);
    return p;
  };
  let retainFixtureRoles = false;
  const cleanup = async () => {
    await Promise.all(pools.map((p) => p.end()));
    await clone.drop();
    if (retainFixtureRoles) return;
    const p = new Pool({
      host: marker.socket,
      port: marker.port,
      database: 'postgres',
      user: 'postgres',
      password: async () => '',
      ssl: false,
      max: 1,
    });
    p.on('error', () => undefined);
    try {
      await p.query(
        `drop role if exists ${workerRole};drop role if exists ${intakeRole};drop role if exists ${publisherRole}`,
      );
    } finally {
      await p.end();
    }
  };
  try {
    const head = await clone.installer.query(
      'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
      [marker.worldId],
    );
    if (
      JSON.stringify(head.rows) !==
      JSON.stringify([{ world_version: '6', event_sequence: '10' }])
    )
      throw Error('ACTUAL_H6_REQUIRED');
    // Refresh only the exact current fixed source lock; never reinstall tables
    // or change a historical policy. CREATE OR REPLACE preserves its owner.
    const custody = await sql('finance-budget-custody.sql');
    const from = custody.indexOf(
        'create function world_v2.lock_finance_budget_policy(',
      ),
      to = custody.indexOf(
        'alter function world_v2.lock_finance_budget_policy(',
      );
    if (from < 0 || to <= from)
      throw Error('FIXED_SOURCE_LOCK_DEFINITION_REQUIRED');
    await clone.installer.query(
      custody
        .slice(from, to)
        .replace('create function', 'create or replace function'),
    );
    const derived = await clone.installer.query(
      "select to_regclass('world_v2.postwar_office_projection_document')as name",
    );
    if (!derived.rows[0]?.name) {
      let ddl = await sql('postwar-office-derived-read.sql');
      for (const role of [
        'world_v2_postwar_projection_owner',
        'world_v2_postwar_projection_publisher',
        'world_v2_postwar_projection_reader',
      ]) {
        const existing = await clone.installer.query(
          'select rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication from pg_roles where rolname=$1',
          [role],
        );
        if (existing.rows.length) {
          if (
            existing.rows.length !== 1 ||
            Object.values(existing.rows[0]).some((v) => v !== false)
          )
            throw Error('FIXED_NOLOGIN_PROJECTION_ROLE_REQUIRED');
          const definition =
            'create role ' +
            role +
            ' nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;';
          if (!ddl.includes(definition))
            throw Error('EXACT_EXISTING_ROLE_DEFINITION_REQUIRED');
          ddl = ddl.replace(definition, '');
        }
      }
      await clone.installer.query(ddl);
    }
    for (const [table, file] of [
      [
        'finance_budget_capacity_original',
        'finance-budget-capacity-source.sql',
      ],
      [
        'finance_budget_mixed_social_original',
        'finance-budget-mixed-source.sql',
      ],
    ]) {
      const exists = await clone.installer.query(
        'select to_regclass($1)as name',
        ['world_v2.' + table],
      );
      if (!exists.rows[0]?.name) await clone.installer.query(await sql(file!));
    }
    await clone.installer
      .query(`create role ${workerRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role ${intakeRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role ${publisherRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
      grant world_v2_finance_budget_source_reader to ${workerRole},${intakeRole};grant world_v2_finance_budget_source_publisher to ${publisherRole};grant usage on schema world_v2 to ${workerRole},${intakeRole},${publisherRole};
      grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox,world_v2.world_writer_lease to ${workerRole};
      grant insert on world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox to ${workerRole};grant update on world_v2.command_queue,world_v2.world_head,world_v2.current_materialization to ${workerRole};grant update(renewed_at_real)on world_v2.world_writer_lease to ${workerRole};
      grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt to ${intakeRole};grant select(world_id,seed_id,seed_fingerprint,replay_binding)on world_v2.opening_seed to ${intakeRole};grant insert on world_v2.command_submission,world_v2.command_queue to ${intakeRole};grant update(command_id)on world_v2.command_submission to ${intakeRole},${workerRole};grant update(world_version)on world_v2.world_head to ${intakeRole};
      create policy mixed_budget_intake_seed_${nonce} on world_v2.opening_seed for select to ${intakeRole} using(world_id='${marker.worldId}'and current_setting('request.jwt.claim.sub',true)='${marker.subject}');
      alter table world_v2.world_writer_lease enable row level security;alter table world_v2.world_writer_lease force row level security;create policy mixed_budget_lease_read_${nonce} on world_v2.world_writer_lease for select to ${workerRole},world_v2_finance_budget_source_owner using(world_id='${marker.worldId}');create policy mixed_budget_lease_lock_${nonce} on world_v2.world_writer_lease for update to ${workerRole},world_v2_finance_budget_source_owner using(world_id='${marker.worldId}')with check(false)`);
    let publisher = open(publisherRole),
      worker = open(workerRole);
    const existing = await clone.installer.query(
      'select policy_text from world_v2.finance_budget_policy_original where world_id=$1 and country_id=$2 and envelope_ref=$3',
      [marker.worldId, marker.countryId, checkpoint.policy.envelopeRef],
    );
    if (existing.rows.length !== 1)
      throw Error('ACTUAL_EXISTING_POLICY_REQUIRED');
    const policy = JSON.parse(existing.rows[0].policy_text) as {
      envelopeRef: string;
      effectivePeriodRef: string;
      governmentEntityId: string;
      currency: string;
      sourceDocumentSHA256: string;
    };
    // Same actual normative rule, independent positive envelope. This isolated
    // publisher/approval is not project Owner production approval.
    policy.envelopeRef = 'MIXED_CAPACITY_NEXT_ENVELOPE_' + nonce.toUpperCase();
    const policyRef = 'POLICY_MIXED_CAPACITY_TEST_' + nonce.toUpperCase();
    await publisher.query(
      'select world_v2.publish_finance_budget_policy($1,$2,$3,$4,$5,$6)',
      [
        policyRef,
        'ISOLATED_TEST_ONLY_POLICY_PUBLISHER',
        canonicalSerialize(policy),
        marker.seedFingerprint,
        marker.admissionRef,
        policy.sourceDocumentSHA256.slice(7),
      ],
    );
    const pins = await clone.installer.query(
      "select encode(sha256(convert_to(canonical_payload,'UTF8')),'hex')as canonical_seed_sha256 from world_v2.opening_seed where world_id=$1 and seed_fingerprint=$2",
      [marker.worldId, marker.seedFingerprint],
    );
    if (pins.rows.length !== 1)
      throw Error('UNIQUE_ACTUAL_CANONICAL_SEED_REQUIRED');
    const canonicalSHA256 = String(pins.rows[0].canonical_seed_sha256),
      publicationStart = performance.now();
    const sourceSHA256 = String(
      (
        await publisher.query(
          'select world_v2.publish_finance_budget_capacity($1,$2,$3,$4,$5)as hash',
          [
            marker.worldId,
            marker.countryId,
            marker.seedFingerprint,
            marker.admissionRef,
            canonicalSHA256,
          ],
        )
      ).rows[0].hash,
    );
    const published = await publisher.query(
      'select world_v2.publish_finance_budget_mixed_social_originals($1,$2,$3,$4)as count',
      [
        marker.worldId,
        marker.seedFingerprint,
        marker.admissionRef,
        canonicalSHA256,
      ],
    );
    if (published.rows[0].count !== 70)
      throw Error('COMPLETE_70_COUNTRY_SEALED_SOURCES_REQUIRED');
    const publicationMilliseconds = performance.now() - publicationStart;
    await clone.installer.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,clock_timestamp(),600000)',
      [marker.worldId, workerId],
    );
    // Preserve only already-validated immutable sources in an offline sealed
    // H6 template. Retrying HTTP never repeats the whole offline publication.
    await Promise.all(pools.map((p) => p.end()));
    pools.length = 0;
    await clone.close();
    await sealPostwarReferenceClone(marker, clone.database);
    retainFixtureRoles = true;
    const sourceCheckpointPath =
      '/workspace/.cloud-setup/evidence/postwar-budget-mixed-capacity-native-20261028/source-template.json';
    await mkdir(
      '/workspace/.cloud-setup/evidence/postwar-budget-mixed-capacity-native-20261028',
      { recursive: true },
    );
    await writeFile(
      sourceCheckpointPath,
      JSON.stringify(
        {
          classification: 'TEST_ONLY_SEALED_H6_DERIVED_SOURCE_NOT_AUTHORITY',
          referenceMarker: checkpoint.referenceMarker,
          database: clone.database,
          policy,
          policyRef,
          workerRole,
          intakeRole,
          publisherRole,
          workerId,
          sourceSHA256,
          canonicalSHA256,
          publicationMilliseconds,
        },
        null,
        2,
      ) + '\n',
    );
    clone = await clonePostwarNativeReference(
      marker,
      'mixed_budget_online',
      clone.database,
    );
    publisher = open(publisherRole);
    worker = open(workerRole);
    return {
      marker,
      clone,
      worker,
      publisher,
      policy,
      policyRef,
      workerRole,
      intakeRole,
      workerId,
      sourceSHA256,
      canonicalSHA256,
      publicationMilliseconds,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

interface CachedMixedBudgetFixture {
  classification: string;
  referenceMarker: string;
  database: string;
  policy: {
    envelopeRef: string;
    effectivePeriodRef: string;
    governmentEntityId: string;
    currency: string;
    sourceDocumentSHA256: string;
  };
  policyRef: string;
  workerRole: string;
  intakeRole: string;
  publisherRole: string;
  workerId: string;
  sourceSHA256: string;
  canonicalSHA256: string;
  publicationMilliseconds: number;
}
async function loadCachedMixedBudgetRuntimeFixture(file: string) {
  const c = JSON.parse(
    await readFile(file, 'utf8'),
  ) as CachedMixedBudgetFixture;
  if (
    c.classification !== 'TEST_ONLY_SEALED_H6_DERIVED_SOURCE_NOT_AUTHORITY' ||
    !/^budget_test_worker_[a-f0-9]{8}$/u.test(c.workerRole) ||
    !/^budget_test_publisher_[a-f0-9]{8}$/u.test(c.publisherRole) ||
    !/^budget_test_intake_[a-f0-9]{8}$/u.test(c.intakeRole)
  )
    throw Error('OWNED_DERIVED_SOURCE_CHECKPOINT_REQUIRED');
  const marker = await loadPostwarNativeReferenceMarker(c.referenceMarker),
    clone = await clonePostwarNativeReference(
      marker,
      'mixed_budget_online',
      c.database,
    ),
    pools: Pool[] = [];
  const cleanup = async () => {
    await Promise.all(pools.map((p) => p.end()));
    await clone.drop();
  };
  try {
    const rows = await clone.installer.query(
      'select seed_fingerprint,admission_ref,source_sha256,canonical_seed_sha256 from world_v2.finance_budget_capacity_original where world_id=$1 and country_id=$2',
      [marker.worldId, marker.countryId],
    );
    if (
      rows.rows.length !== 1 ||
      rows.rows[0].seed_fingerprint !== marker.seedFingerprint ||
      rows.rows[0].admission_ref !== marker.admissionRef ||
      rows.rows[0].source_sha256 !== c.sourceSHA256 ||
      rows.rows[0].canonical_seed_sha256 !== c.canonicalSHA256
    )
      throw Error('ACTUAL_DERIVED_SOURCE_PINS_REQUIRED');
    await clone.installer.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,clock_timestamp(),600000)',
      [marker.worldId, c.workerId],
    );
    const open = (role: string) => {
      const p = new Pool({
        host: marker.socket,
        port: marker.port,
        database: clone.database,
        user: role,
        password: async () => '',
        ssl: false,
        max: 2,
        idleTimeoutMillis: 1000,
        options: '-c request.jwt.claim.sub=' + marker.subject,
      });
      p.on('error', () => undefined);
      pools.push(p);
      return p;
    };
    return {
      marker,
      clone,
      worker: open(c.workerRole),
      publisher: open(c.publisherRole),
      policy: c.policy,
      policyRef: c.policyRef,
      workerRole: c.workerRole,
      intakeRole: c.intakeRole,
      workerId: c.workerId,
      sourceSHA256: c.sourceSHA256,
      canonicalSHA256: c.canonicalSHA256,
      publicationMilliseconds: c.publicationMilliseconds,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
