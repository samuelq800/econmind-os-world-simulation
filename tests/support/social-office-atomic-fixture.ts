/** Owned local fixture composition only, never an application dependency. */
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Pool } from 'pg';
import * as C from '@econmind/core';
import {
  loadSocialOfficeDemoScenario,
  type SocialOfficeDemoScenario,
} from '../../apps/world-worker/src/social-office-demo/scenario-input.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import { publishSocialOfficeSimulatedSource } from '../../apps/world-worker/src/persistence/social-office-simulated-source-custody.js';
import type { SocialOfficeSimulatedRepositoryConfig } from '../../apps/world-worker/src/persistence/social-office-atomic-repository.js';

export const digest = (s: string) =>
  createHash('sha256').update(s, 'utf8').digest('hex');
export const ROOT = path.resolve(import.meta.dirname, '../..');
export async function socialScenario() {
  // Only test construction loads A's tool. A compiled host installer import does not.
  const A = await import(
    // @ts-expect-error Test-only fixed .mjs import; no application imports tools.
    '../../tools/social-office-demo/check-opening-finance.mjs'
  );
  const selected: unknown = A.selectOpeningFinanceCandidateData(
    A.readOpeningFinanceDistribution(),
    {
      meaning: 'ACCRUAL',
      domainVariant: 'G_DOMAIN_BASELINE_PROPOSAL',
      financeOptionId: 'SIM_SOCIAL_OPENING_BASELINE_V1_PROPOSAL',
    },
  );
  return loadSocialOfficeDemoScenario({
    openingFinanceCandidateUtf8: C.canonicalSerialize(selected),
  });
}
export function config(
  database: PostgresSqlDatabase,
  scenario: SocialOfficeDemoScenario,
): SocialOfficeSimulatedRepositoryConfig {
  const d = scenario.executionIdentity;
  return {
    database,
    schemaVersion: 'social-office-simulated-repository-v1',
    sourceClass: 'SIMULATED_OPENING',
    selectionFingerprint: d.selectionFingerprint,
    identity: {
      simulationId: d.simulationId,
      worldId: d.worldId,
      countryId: d.countryId,
      locationId: d.locationId,
    },
    seed: {
      seedId: scenario.seed.seedId,
      seedFingerprint: scenario.seed.fingerprint,
    },
    worker: { holderId: 'SOCIAL_DEMO_WORKER_V1', fencingToken: '1' },
    manual: {
      authSubject: d.manual.authSubject,
      actorId: d.manual.actorId,
      expectedIssuer: 'https://social-demo.invalid',
      expectedAudience: 'social-demo',
    },
    publisher: {
      issuerRef: d.publisher.issuerRef,
      publisherVersion: d.publisher.publisherVersion,
      actorId: d.publisher.actorId,
      authSubject: d.publisher.authSubject,
      ruleVersion: d.publisher.ruleVersion,
    },
  };
}
export function principal(): C.AuthenticatedPrincipal {
  const sub = C.authSubject('7f1c4f94-75b4-4876-a741-50bd31e14b21');
  return {
    authSubject: sub,
    facts: { user_id: sub, display_name: null, school_id: null },
    token: {
      subject: sub,
      issuer: 'https://social-demo.invalid',
      audience: 'social-demo',
      issuedAt: new Date(Date.now() - 60000).toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    },
  };
}
export function command(
  s: SocialOfficeDemoScenario,
  kind: 'PLAN' | 'ADMIT' | 'GRADUATE' | 'SERVE',
  version = '0',
  day = '0',
  suffix = 'A',
) {
  const payload =
    kind === 'PLAN'
      ? {
          schemaVersion: 'social-employment-service-plan-v1',
          locationId: s.scope.locationId,
          skill: 'MEDIUM',
          positionId: 'POSITION_SIM_CLINIC_NURSE_02',
          servicePoolId: 'SIM_EMP_POOL_MEDIUM_D1',
          requestedMatches: '1',
          dueDayIndex: '1',
        }
      : kind === 'ADMIT'
        ? {
            schemaVersion: 'social-college-admit-v1',
            programmeId: 'SIM_VOCATIONAL_PROGRAMME_V1',
            programmeRuleVersion: 'SIM_VOCATIONAL_RULE_V1',
            cohortId: 'SIM_COHORT_NEW_01',
            applicantPoolId: 'SIM_STUDENT_APPLICANTS_V1',
          }
        : kind === 'GRADUATE'
          ? {
              schemaVersion: 'social-college-graduate-v1',
              cohortId: 'SIM_COHORT_RETURNING_01',
              programmeRuleVersion: 'SIM_VOCATIONAL_RULE_V1',
            }
          : {
              schemaVersion: 'social-clinic-serve-v1',
              clinicId: 'FACILITY_SIM_COMMUNITY_CLINIC_01',
              careWindowId: 'SIM_CLINIC_EPISODE_D0_V1',
              clinicRuleVersion: 'SIM_PRIMARY_CARE_RULE_V1',
            };
  return C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      actorId: s.actorId,
      authSubject: s.authSubject,
      commandId: `D_SOCIAL_${kind}_${suffix}`,
      commandType:
        kind === 'PLAN'
          ? C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND
          : kind === 'ADMIT'
            ? C.SOCIAL_COLLEGE_ADMIT_COMMAND
            : kind === 'GRADUATE'
              ? C.SOCIAL_COLLEGE_GRADUATE_COMMAND
              : C.SOCIAL_CLINIC_SERVE_COMMAND,
      correlationId: 'D_SOCIAL_NATIVE',
      countryId: s.scope.countryId,
      worldId: s.scope.worldId,
      officeId: 'SOCIAL',
      expectedWorldVersion: version,
      idempotencyKey: `D_SOCIAL_IDEM_${kind}_${suffix}`,
      simTime: (BigInt(day) * 86400000n).toString(),
      submittedAtReal: new Date().toISOString(),
      payload,
    },
    digest,
  );
}
export function match(
  s: SocialOfficeDemoScenario,
  plan: C.CanonicalCommand,
  version: string,
  day = '1',
  suffix = 'A',
) {
  return C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      actorId: s.executionIdentity.publisher.actorId,
      authSubject: s.authSubject,
      commandId: `D_SOCIAL_MATCH_${suffix}`,
      commandType: C.SOCIAL_JOB_MATCH_DUE_COMMAND,
      correlationId: 'D_SOCIAL_NATIVE',
      countryId: s.scope.countryId,
      worldId: s.scope.worldId,
      officeId: null,
      expectedWorldVersion: version,
      idempotencyKey: `D_SOCIAL_IDEM_MATCH_${suffix}`,
      simTime: (BigInt(day) * 86400000n).toString(),
      submittedAtReal: new Date().toISOString(),
      payload: {
        schemaVersion: 'social-job-match-settlement-v1',
        planCommandId: plan.commandId,
        planFingerprint: plan.fingerprint,
        dueDayIndex: '1',
        ruleVersion: C.SOCIAL_JOB_MATCH_RULE_VERSION,
      },
    },
    digest,
  );
}
export async function installFixture(
  admin: Pool,
  s: SocialOfficeDemoScenario,
  host?: Readonly<{ sourceRoot: string }>,
) {
  // Trusted tool composition, never an HTTP/root/DSN selection endpoint. F verifies
  // its owned checkout and complete build-input manifest before calling this port.
  if (
    host &&
    (Object.getPrototypeOf(host) !== Object.prototype ||
      Object.keys(host).join('|') !== 'sourceRoot' ||
      typeof host.sourceRoot !== 'string' ||
      !path.isAbsolute(host.sourceRoot))
  )
    throw Error('FIXED_HOST_SOURCE_ROOT_REQUIRED');
  const sourceRoot = host?.sourceRoot ?? ROOT;
  if ((await realpath(sourceRoot)) !== sourceRoot)
    throw Error('CANONICAL_SOURCE_ROOT_REQUIRED');
  const manifest = JSON.parse(
    await readFile(
      path.join(sourceRoot, 'database/migrations/manifest.json'),
      'utf8',
    ),
  ) as {
    migrations: {
      migration_id: string;
      path: string;
      sha256: string;
      artifact_source_commit: string;
      release_order: number;
    }[];
  };
  if (manifest.migrations.length !== 23) throw Error('EXPECTED_CURRENT_23');
  const originals = [];
  for (const [i, m] of manifest.migrations.entries()) {
    const bytes = await readFile(path.join(sourceRoot, m.path));
    const original = execFileSync(
      'git',
      ['--no-replace-objects', 'show', `${m.artifact_source_commit}:${m.path}`],
      { cwd: sourceRoot, maxBuffer: 1048576 },
    );
    if (
      m.release_order !== i + 1 ||
      digest(bytes.toString('utf8')) !== m.sha256 ||
      !bytes.equals(original)
    )
      throw Error('MIGRATION_PROVENANCE');
    originals.push(bytes.toString('utf8'));
  }
  // All original bytes/provenance verified before any DDL.
  // Empty local Storage compatibility surface for the unchanged 0022 veto; no assets/import.
  await admin.query(
    'create schema storage; create table storage.objects(bucket_id text); alter table storage.objects enable row level security',
  );
  // Original RLS revocations name these roles. Local placeholders have no login/grants.
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (
      (await admin.query('select 1 from pg_roles where rolname=$1', [role]))
        .rows.length === 0
    )
      await admin.query(
        `create role ${role} nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
      );
  }
  for (const [i, m] of manifest.migrations.entries()) {
    await admin.query(originals[i]!);
    await admin.query(
      'insert into world_v2.schema_release(migration_id,artifact_sha256,source_repo_commit,release_order) values($1,$2,$3,$4)',
      [m.migration_id, m.sha256, m.artifact_source_commit, m.release_order],
    );
  }
  for (const p of [
    'database/proposals/runtime-read-binding-storage.sql',
    'tests/support/social-office-simulated-source-schema.sql',
    'tests/support/social-office-simulated-atomic-schema.sql',
  ])
    await admin.query(await readFile(path.join(sourceRoot, p), 'utf8'));
  await admin.query('insert into world_v2.world_head(world_id) values($1)', [
    s.scope.worldId,
  ]);
  await admin.query(
    "insert into world_v2.social_demo_source_scope(simulation_id,world_id,country_id,schema_version,source_class) values($1,$2,$3,'social-office-simulated-source-store-v1','SIMULATED_OPENING')",
    [s.scope.simulationId, s.scope.worldId, s.scope.countryId],
  );
  const db = new PostgresSqlDatabase(admin);
  await new WorldOpeningSeedStore({
    database: db,
    sha256Hex: digest,
  }).bootstrap({ seed: s.seed, bootstrappedAtReal: new Date().toISOString() });
  await publishSocialOfficeSimulatedSource(db, s.initialPublication);
  for (const capability of s.executionIdentity.manual.capabilities)
    await admin.query(
      "insert into world_v2.current_commit_authorization(world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real) values($1,$2,$3,'SOCIAL',$4,$5,'SOCIAL_AUTH_V1',true,clock_timestamp())",
      [
        s.scope.worldId,
        s.authSubject,
        s.scope.countryId,
        capability,
        s.executionIdentity.manual.teamId,
      ],
    );
  await admin.query(
    "insert into world_v2.runtime_read_seat(seat_ref,world_id,auth_subject,country_id,office_id,team_id,authorization_revision) values('SOCIAL_SEAT_V1',$1,$2,$3,'SOCIAL',$4,'SOCIAL_AUTH_V1')",
    [
      s.scope.worldId,
      s.authSubject,
      s.scope.countryId,
      s.executionIdentity.manual.teamId,
    ],
  );
  const a = s.executionIdentity.publisher;
  await admin.query(
    "insert into world_v2.social_demo_automatic_authorization values($1,$2,$3,'SIMULATED_OPENING',$4,$5,$6,$7,$8,$9,$10,$11,'SOCIAL_AUTO_V1',true)",
    [
      s.scope.simulationId,
      s.scope.worldId,
      s.scope.countryId,
      a.issuerRef,
      a.publisherVersion,
      a.actorId,
      a.authSubject,
      a.commandType,
      a.ruleVersion,
      a.validFromDay,
      a.validUntilDay,
    ],
  );
  await admin.query('select world_v2.social_demo_lease_control($1::jsonb)', [
    C.canonicalSerialize({
      worldId: s.scope.worldId,
      holderId: 'SOCIAL_DEMO_WORKER_V1',
      observedAtReal: new Date().toISOString(),
      leaseDurationMilliseconds: '300000',
    }),
  ]);
}

export async function grantFixtureRoles(admin: Pool) {
  for (const role of [
    'd_social_settler',
    'd_social_reader',
    'd_social_publisher',
    'd_social_authority',
    'd_social_lease',
  ]) {
    await admin.query(
      `create role ${role} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
    );
    await admin.query(`grant usage on schema world_v2 to ${role}`);
  }
  for (const role of ['d_social_settler', 'd_social_reader']) {
    await admin.query(
      `grant select on world_v2.world_head,world_v2.opening_seed,world_v2.command_submission,world_v2.command_queue,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.command_receipt,world_v2.social_demo_source_scope,world_v2.social_demo_source_record,world_v2.social_demo_source_revision to ${role}`,
    );
    await admin.query(
      `grant update(lock_column) on world_v2.social_demo_source_scope to ${role}`,
    );
    await admin.query(
      `grant update(social_demo_lock_column) on world_v2.world_head to ${role}`,
    );
    await admin.query(
      `grant update(command_type) on world_v2.command_submission to ${role}`,
    );
    await admin.query(
      `grant execute on function world_v2.social_demo_locked_manual_authority(text,text,text,uuid) to ${role}`,
    );
  }
  await admin.query(
    'grant execute on function world_v2.social_demo_locked_automatic_authority(text,text,text,text,text) to d_social_settler',
  );
  await admin.query(
    'grant select on world_v2.world_writer_lease,world_v2.authoritative_commit_authorization,world_v2.notification_outbox to d_social_settler',
  );
  await admin.query(
    'grant update(renewed_at_real) on world_v2.world_writer_lease to d_social_settler',
  );
  await admin.query(
    'grant update on world_v2.world_head,world_v2.command_queue to d_social_settler',
  );
  await admin.query(
    'grant insert on world_v2.command_submission,world_v2.command_queue,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.command_receipt,world_v2.authoritative_commit_authorization,world_v2.notification_outbox to d_social_settler',
  );
  await admin.query(
    'grant execute on function world_v2.social_demo_publish_source(text) to d_social_publisher',
  );
  await admin.query(
    'grant execute on function world_v2.social_demo_revise_manual_authority(jsonb),world_v2.social_demo_revise_automatic_authority(jsonb) to d_social_authority',
  );
  await admin.query(
    'grant execute on function world_v2.social_demo_lease_control(jsonb) to d_social_lease',
  );
}
