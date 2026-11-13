/** TEST_ONLY restore of an actual owned H0/H2 checkpoint. No opening seed parse,
 * private proof, source publication, role/grant creation or World initialization.
 * Optional C10 HTTP identity enrollment uses only existing fixture actors/roles,
 * after actual C10 source checks; it establishes no OP title or service fact.
 * Independent Node children still issue their own genuine source proofs. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import { canonicalSerialize, WORLD_MODEL_VERSION } from '@econmind/core';
import {
  clonePostwarNativeReference,
  loadPostwarNativeReferenceMarker,
  sealPostwarReferenceClone,
} from './postwar-native-reference-db.js';
import {
  REGISTERED_UTILITY_H2_DIRECTORY,
  readRegisteredUtilityH2Evidence,
  readRegisteredUtilityH2ResumeFrom,
  type RegisteredUtilityH2Resume,
} from './registered-utility-h2-checkpoint.js';
import {
  loadRegisteredCurrentReadRepairCheckpoint,
  assertRegisteredReadRepairReceiptCoverage,
  verifyRegisteredCurrentReadRepairFunctionsFrom,
} from './registered-current-read-repair-checkpoint.js';
import {
  reuseRetainedPostwarPowerClone,
  RETAINED_UPGRADED_POWER_CHECKPOINT,
  RETAINED_UPGRADED_POWER_CHECKPOINT_SHA256,
  RETAINED_OPENING_BASE_CHECKPOINT,
  RETAINED_OPENING_BASE_CHECKPOINT_SHA256,
} from './postwar-retained-power-reuse.js';
import { upgradeRetainedPostwarPowerClone } from './postwar-retained-power-upgrade.js';
import {
  prepareRegisteredC10HttpActorFrom,
  createRegisteredUtilityFixtureTokenSigner,
  type RegisteredUtilityHttpCountry,
} from './registered-c10-http-actor.js';
const exec = promisify(execFile);
const labourCheckpointPath =
  '/workspace/.cloud-setup/evidence/industry-labour-function-forward-pg-20261108/retained-checkpoint.json';
const labourCheckpointSha256 =
  '3d5d5b6add5a435cfa4570455e7f80e6a4de5f169a80ccecc3b149fd3b679f00';
const initializationDirectory = '/workspace/.cloud-setup/evidence/ru-c2-02';
const childFingerprint =
  'sha256:cd6cd0825fd8b15c13dab28f030e2df24b804d5675e132ff77715a20ec67056a';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function must(value: unknown, reason: string): asserts value {
  if (!value) throw Error('UTILITY_CHECKPOINT_RESTORE:' + reason);
}
function record(value: unknown): Record<string, unknown> {
  must(
    value && typeof value === 'object' && !Array.isArray(value),
    'EXACT_RECORD_REQUIRED',
  );
  return value as Record<string, unknown>;
}
const read = async (file: string) =>
  record(JSON.parse(await readFile(file, 'utf8')) as unknown);
const roleIdent = (value: string) => {
  must(/^[a-z][a-z0-9_]{0,62}$/u.test(value), 'EXACT_ROLE_IDENTIFIER_REQUIRED');
  return '"' + value + '"';
};
type Clone = Awaited<ReturnType<typeof clonePostwarNativeReference>>;
type Marker = Awaited<ReturnType<typeof loadPostwarNativeReferenceMarker>>;
export interface RegisteredUtilityCounts {
  worldVersion: string;
  eventSequence: string;
  commands: string;
  receipts: string;
  events: string;
  batches: string;
  inventory: string;
  queues: string;
}
export interface RegisteredUtilityResources {
  readonly marker: Marker;
  readonly clone: Clone;
  cleanup(): Promise<void>;
}
export interface RegisteredUtilitySetup {
  readonly descriptor: unknown;
  readonly c10HttpActor?: Awaited<
    ReturnType<typeof prepareRegisteredC10HttpActorFrom>
  >;
  readonly industrySource: Readonly<{
    sourceRef: string;
    sourceSha256: string;
  }>;
  readonly ddlReceipts: readonly unknown[];
  readonly directRpcEnrollment: readonly unknown[];
  signToken(country: RegisteredUtilityHttpCountry): string;
  counts(): Promise<RegisteredUtilityCounts>;
  close(): Promise<void>;
  rotateFiniteClock(
    input: Readonly<{ simTime: string; previousHostStopped: true }>,
  ): Promise<unknown>;
}
export async function restoreRegisteredUtilityCheckpoint(input: {
  readonly repositoryRoot: string;
  readonly evidenceDirectory: string;
  readonly checkpoint?:
    | 'RU_C2_05_H2'
    | 'TRADE_REPAIRED_H3'
    | 'POWER_LABOUR_H3'
    | 'POWER_UPGRADED_H3'
    | 'C10_OPENING_BASES_H3';
  readonly expectedCommit?: string;
  /** Explicit TEST_ONLY C10 Industry identity; default remains C1/C2. */
  readonly includeC10Industry?: true;
  readonly sqlPlan: Readonly<{
    entries: readonly Readonly<{ name: string; sha256: string }>[];
    planSha256: string;
  }>;
}): Promise<
  Readonly<{
    fixture: RegisteredUtilityResources;
    setup: RegisteredUtilitySetup;
    resume?: RegisteredUtilityH2Resume;
  }>
> {
  must(
    process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE === '1',
    'EXPLICIT_NATIVE_OPT_IN_REQUIRED',
  );
  must(
    input.evidenceDirectory.startsWith('/workspace/.cloud-setup/evidence/'),
    'OWNED_EVIDENCE_DIRECTORY_REQUIRED',
  );
  must(
    input.checkpoint === undefined ||
      input.checkpoint === 'RU_C2_05_H2' ||
      input.checkpoint === 'TRADE_REPAIRED_H3' ||
      input.checkpoint === 'POWER_LABOUR_H3' ||
      input.checkpoint === 'POWER_UPGRADED_H3' ||
      input.checkpoint === 'C10_OPENING_BASES_H3',
    'FIXED_CHECKPOINT_MODE_REQUIRED',
  );
  const readRepair =
    input.checkpoint === 'TRADE_REPAIRED_H3' ||
    input.checkpoint === 'POWER_LABOUR_H3' ||
    input.checkpoint === 'POWER_UPGRADED_H3' ||
    input.checkpoint === 'C10_OPENING_BASES_H3'
      ? await loadRegisteredCurrentReadRepairCheckpoint(input.repositoryRoot)
      : undefined;
  const sourceDirectory =
    input.checkpoint === 'RU_C2_05_H2'
      ? REGISTERED_UTILITY_H2_DIRECTORY
      : (readRepair?.originalDirectory ?? initializationDirectory);
  if (input.checkpoint === 'RU_C2_05_H2')
    await readRegisteredUtilityH2Evidence();
  const pg = path.join(input.evidenceDirectory, 'pg');
  await mkdir(pg, { recursive: true });
  const powerLabour =
    input.checkpoint === 'POWER_LABOUR_H3' ||
    input.checkpoint === 'POWER_UPGRADED_H3' ||
    input.checkpoint === 'C10_OPENING_BASES_H3';
  const openingBases = input.checkpoint === 'C10_OPENING_BASES_H3';
  const powerReuse = input.checkpoint === 'POWER_UPGRADED_H3' || openingBases;
  const powerCheckpointPath = openingBases
    ? RETAINED_OPENING_BASE_CHECKPOINT
    : powerReuse
      ? RETAINED_UPGRADED_POWER_CHECKPOINT
      : labourCheckpointPath;
  const powerCheckpointSha256 = openingBases
    ? RETAINED_OPENING_BASE_CHECKPOINT_SHA256
    : powerReuse
      ? RETAINED_UPGRADED_POWER_CHECKPOINT_SHA256
      : labourCheckpointSha256;
  if (powerLabour) {
    must(
      input.expectedCommit && /^[a-f0-9]{40}$/u.test(input.expectedCommit),
      'POWER_FROZEN_COMMIT_REQUIRED',
    );
    must(
      sha(await readFile(powerCheckpointPath, 'utf8')) ===
        powerCheckpointSha256,
      'EXACT_LABOUR_CHECKPOINT_BYTES_REQUIRED',
    );
  }
  const cp = powerLabour
    ? await read(powerCheckpointPath)
    : (readRepair?.checkpoint ??
      (await read(path.join(sourceDirectory, 'pg/retained-checkpoint.json'))));
  const originalMarker = await loadPostwarNativeReferenceMarker(
    path.join(sourceDirectory, 'pg/reference-db.json'),
  );
  must(
    cp.resourceState === 'RETAINED_STOPPED' &&
      cp.runtimeReady === false &&
      cp.ownershipNonce === originalMarker.ownershipNonce &&
      cp.ownedContainer === originalMarker.ownedContainer &&
      originalMarker.seedFingerprint === childFingerprint &&
      typeof cp.templateDatabase === 'string' &&
      /^postwar_clone_[a-z0-9_]+$/u.test(cp.templateDatabase),
    'ACTUAL_FIXED_CHILD_OWNED_CHECKPOINT_REQUIRED',
  );
  const oldReport = await read(
    path.join(sourceDirectory, 'utility-native-report.json'),
  );
  const sourceReport = await read(
    path.join(initializationDirectory, 'pg/result.json'),
  );
  const installed: Record<string, string> = {};
  for (const row of [
    ...originalMarker.installedArtifacts,
    ...(sourceReport.installedSql as { path: string; sha256: string }[]),
  ])
    installed[path.basename(row.path, '.sql')] = row.sha256;
  must(
    Array.isArray(oldReport.ddlReceipts),
    'ACTUAL_PRIOR_INSTALLATION_RECEIPTS_REQUIRED',
  );
  for (const row of oldReport.ddlReceipts) {
    const d = record(row);
    must(
      typeof d.name === 'string' && typeof d.sha256 === 'string',
      'EXACT_SQL_RECEIPT_REQUIRED',
    );
    installed[d.name] = d.sha256;
  }
  if (readRepair && !powerLabour) {
    const originalNames = assertRegisteredReadRepairReceiptCoverage({
      installed,
      planNames: input.sqlPlan.entries.map((x) => x.name),
      runtimeReceiptNames: oldReport.ddlReceipts.map((x) =>
        String(record(x).name),
      ),
    });
    for (const name of originalNames)
      must(
        sha(
          await readFile(
            path.join(
              input.repositoryRoot,
              'database/proposals/' + name + '.sql',
            ),
            'utf8',
          ),
        ) === installed[name],
        'ORIGINAL_PROPOSAL_RECEIPT_SOURCE_HASH_DIFFERS:' + name,
      );
    installed[readRepair.extraReceipt.name] = readRepair.extraReceipt.sha256;
  }
  if (!powerLabour)
    for (const entry of input.sqlPlan.entries)
      must(
        installed[entry.name] === entry.sha256 &&
          sha(
            await readFile(
              path.join(
                input.repositoryRoot,
                'database/proposals/' + entry.name + '.sql',
              ),
              'utf8',
            ),
          ) === entry.sha256,
        'SOURCE_SQL_UPGRADE_NOT_AUTHORIZED:' + entry.name,
      );
  const state = await exec('docker', [
    'inspect',
    originalMarker.ownedContainer,
    '--format',
    '{{index .Config.Labels "econmind.reference.nonce"}} {{.State.Status}} {{.State.ExitCode}}',
  ]);
  must(
    state.stdout.trim() === originalMarker.ownershipNonce + ' exited 0',
    'ONLY_STOPPED_NONCE_MATCHED_CLUSTER_MAY_BE_RESTORED',
  );
  let clone: Clone | undefined,
    release: Pool | undefined,
    closed: Promise<void> | undefined,
    cleaned: Promise<void> | undefined;
  const marker = {
    ...originalMarker,
    evidenceDirectory: pg,
    markerPath: path.join(pg, 'reference-db.json'),
  };
  must(
    (await readFile(marker.markerPath, 'utf8').catch((e: unknown) => {
      if ((e as { code?: unknown }).code === 'ENOENT') return null;
      throw e;
    })) === null,
    'FRESH_RESTORE_EVIDENCE_REQUIRED',
  );
  await writeFile(
    marker.markerPath,
    JSON.stringify(
      { ...marker, resourceState: 'RESTORE_PLANNED', runtimeReady: false },
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    path.join(pg, 'owned-container.json'),
    await readFile(path.join(sourceDirectory, 'pg/owned-container.json')),
  );
  let fixtureReturned = false;
  const restoreEvidence: Record<string, unknown> = {
    classification: 'RESTORED_DATABASE_DATA_NOT_SOURCE_AUTHORITY',
    originalCheckpoint: path.join(
      sourceDirectory,
      'pg/retained-checkpoint.json',
    ),
    sourceProofIssued: false,
    sourcePublicationPerformed: false,
    rolesOrGrantsChanged: false,
    WorldClockStarted: false,
    sqlPlanSha256: input.sqlPlan.planSha256,
    ...(readRepair ? { readRepair: readRepair.evidence } : {}),
  };
  const close = () =>
    (closed ??= (async () => {
      await release?.end();
    })());
  const cleanup = () =>
    (cleaned ??= (async () => {
      const errors: string[] = [];
      try {
        await close();
      } catch (e) {
        errors.push(String(e));
      }
      try {
        let retainedHead = record(cp.head);
        if (clone) {
          const sessions = await clone.installer.query<{ count: string }>(
            'select count(*)::text count from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()',
            [clone.database],
          );
          must(
            sessions.rows[0]?.count === '0',
            'NO_OTHER_CLONE_CONNECTIONS_BEFORE_SEAL',
          );
          const head = await clone.installer.query(
            'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
            [marker.worldId],
          );
          must(head.rows.length === 1, 'ACTUAL_CHECKPOINT_HEAD_REQUIRED');
          retainedHead = head.rows[0]!;
          await clone.close();
          await sealPostwarReferenceClone(marker, clone.database);
        }
        await exec('docker', ['stop', '--time', '10', marker.ownedContainer]);
        const actual = await exec('docker', [
          'inspect',
          marker.ownedContainer,
          '--format',
          '{{index .Config.Labels "econmind.reference.nonce"}} {{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}',
        ]);
        const volume = await exec('docker', [
          'volume',
          'inspect',
          marker.pgDataStorage.name,
          '--format',
          '{{index .Labels "econmind.reference.nonce"}}',
        ]);
        must(
          actual.stdout.trim() === marker.ownershipNonce + ' exited 0 false' &&
            volume.stdout.trim() === marker.ownershipNonce,
          'ACTUAL_STOPPED_RESOURCE_READBACK_REQUIRED',
        );
        const checkpoint = {
          resourceState: 'RETAINED_STOPPED',
          initializationState: fixtureReturned
            ? 'FIXTURE_RETURNED'
            : 'INITIALIZATION_INTERRUPTED',
          runtimeReady: false,
          recoverableDatabase: true,
          ownedContainer: marker.ownedContainer,
          ownershipNonce: marker.ownershipNonce,
          volume: marker.pgDataStorage,
          templateDatabase: clone?.database ?? cp.templateDatabase,
          newCloneCreated: clone !== undefined,
          head: retainedHead,
          allowConnections: false,
          isTemplate: true,
          parentCheckpoint: powerLabour
            ? powerCheckpointPath
            : path.join(sourceDirectory, 'pg/retained-checkpoint.json'),
          ...(powerLabour && restoreEvidence.powerUpgradeReceipt
            ? { powerUpgradeReceipt: restoreEvidence.powerUpgradeReceipt }
            : {}),
          ...(powerReuse && restoreEvidence.powerReuseReceipt
            ? { powerReuseReceipt: restoreEvidence.powerReuseReceipt }
            : {}),
          restore: {
            startCommand: ['docker', 'start', marker.ownedContainer],
            helperModule: 'tests/support/postwar-native-reference-db.ts',
            entry:
              'loadPostwarNativeReferenceMarker then clonePostwarNativeReference({...marker,database:templateDatabase}, ownedName); fresh Node proof/registration checks remain mandatory',
          },
        };
        await writeFile(
          path.join(pg, 'retained-checkpoint.json'),
          JSON.stringify(checkpoint, null, 2) + '\n',
        );
        await writeFile(
          marker.markerPath,
          JSON.stringify(
            {
              ...marker,
              resourceState: 'RETAINED_STOPPED',
              runtimeReady: false,
              retainedCheckpoint: path.join(pg, 'retained-checkpoint.json'),
            },
            null,
            2,
          ) + '\n',
        );
      } catch (e) {
        errors.push(String(e));
        try {
          await clone?.close();
        } catch (closeError) {
          errors.push(String(closeError));
        }
      }
      await writeFile(
        path.join(pg, 'cleanup.json'),
        JSON.stringify(
          {
            complete: errors.length === 0,
            resourceState: errors.length ? 'UNCONFIRMED' : 'RETAINED_STOPPED',
            recoverableDatabase: errors.length === 0,
            errors,
          },
          null,
          2,
        ) + '\n',
      );
      if (errors.length)
        throw new AggregateError(
          errors,
          'RESTORED_OWNED_CHECKPOINT_RETENTION_UNCONFIRMED',
        );
    })());
  try {
    await exec('docker', ['start', originalMarker.ownedContainer]);
    const ready = new Pool({
      host: originalMarker.socket,
      port: originalMarker.port,
      database: 'postgres',
      user: 'postgres',
      max: 1,
      connectionTimeoutMillis: 1000,
    });
    try {
      let reached = false;
      for (let n = 0; n < 100; n++) {
        try {
          await ready.query('select 1');
          reached = true;
          break;
        } catch (e) {
          must(
            ['ENOENT', 'ECONNREFUSED', '57P03'].includes(
              String((e as { code?: unknown }).code),
            ),
            'OWNED_PG_STARTUP_FAILED',
          );
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      must(reached, 'OWNED_PG_STARTUP_TIMED_OUT');
    } finally {
      await ready.end();
    }
    if (powerReuse) {
      clone = await clonePostwarNativeReference(
        { ...originalMarker, database: cp.templateDatabase },
        'power_reuse',
      );
      const reused = await reuseRetainedPostwarPowerClone({
        repositoryRoot: input.repositoryRoot,
        expectedCommit: input.expectedCommit!,
        evidenceDirectory: path.join(input.evidenceDirectory, 'power-reuse'),
        marker: originalMarker,
        clone,
        ...(openingBases
          ? { checkpointProfile: 'C10_OPENING_BASES_H3' as const }
          : {}),
      });
      restoreEvidence.powerUpgradeReceipt = cp.powerUpgradeReceipt;
      restoreEvidence.powerReuseReceipt = reused.reuseReceipt;
      restoreEvidence.inheritedPowerUpgradeReceipt = cp.powerUpgradeReceipt;
      restoreEvidence.schemaLineage =
        'REUSED_76_REPAIR_LABOUR_AND_5_PLUS_2_WITH_ONE_EXACT_DOMESTIC_FORWARD';
    } else if (powerLabour) {
      const upgraded = await upgradeRetainedPostwarPowerClone({
        repositoryRoot: input.repositoryRoot,
        expectedCommit: input.expectedCommit!,
        parentCheckpointPath: labourCheckpointPath,
        parentCheckpointSha256: labourCheckpointSha256,
        evidenceDirectory: path.join(input.evidenceDirectory, 'power-upgrade'),
      });
      clone = upgraded.clone;
      restoreEvidence.powerUpgradeReceipt = upgraded.upgradeReceipt;
      restoreEvidence.schemaLineage =
        'ORIGINAL_76_PLUS_FINAL13_REPAIR_PLUS_LABOUR_FUNCTION_FORWARD_PLUS_FIXED_5_UPGRADES_2_FRESH';
    } else
      clone = await clonePostwarNativeReference(
        { ...originalMarker, database: cp.templateDatabase },
        'utility_restore',
      );
    await writeFile(
      marker.markerPath,
      JSON.stringify(
        {
          ...marker,
          resourceState: 'RESTORED_OWNED_CLONE_ACTIVE',
          runtimeReady: false,
        },
        null,
        2,
      ) + '\n',
    );
    const db = clone.installer;
    const counts = async (): Promise<RegisteredUtilityCounts> => {
      const r = await db.query<RegisteredUtilityCounts>(
        'select h.world_version::text as "worldVersion",h.event_sequence::text as "eventSequence",(select count(*)::text from world_v2.command_submission where world_id=$1)commands,(select count(*)::text from world_v2.command_receipt where world_id=$1)receipts,(select count(*)::text from world_v2.authoritative_event where world_id=$1)events,(select count(*)::text from world_v2.financial_posting_batch where world_id=$1)batches,(select count(*)::text from world_v2.inventory_posting where world_id=$1)inventory,(select count(*)::text from world_v2.command_queue where world_id=$1)queues from world_v2.world_head h where h.world_id=$1',
        [marker.worldId],
      );
      must(r.rows.length === 1, 'ACTUAL_SINGLE_HEAD_REQUIRED');
      return r.rows[0]!;
    };
    if (readRepair && !powerLabour) {
      restoreEvidence.actualReadRepairFunctions =
        await verifyRegisteredCurrentReadRepairFunctionsFrom(db, readRepair);
      restoreEvidence.additionalSqlReceipts = [readRepair.extraReceipt];
    }
    const initialCounts = await counts();
    const resume =
      input.checkpoint === 'RU_C2_05_H2' || readRepair
        ? await readRegisteredUtilityH2ResumeFrom({
            pool: db,
            worldId: marker.worldId,
            seedFingerprint: marker.seedFingerprint,
            admissionRef: marker.admissionRef,
            counts: initialCounts,
          })
        : undefined;
    if (!resume)
      must(
        Object.values(initialCounts).every((v) => v === '0'),
        'ONLY_ORIGINAL_H0_UNEXECUTED_CHECKPOINT_SUPPORTED',
      );
    if (resume) {
      restoreEvidence.resume = resume;
      restoreEvidence.economicCommandsResubmitted = 0;
    }
    const registrationRows = await db.query<{
      registration_ref: string;
      worker_id: string;
      consumer_role: string;
      registration_text: string;
      registration_sha256: string;
    }>(
      'select x.registration_ref,x.worker_id,x.consumer_role::text,x.registration_text,x.registration_sha256 from world_v2.world_command_execution_registration x where world_id=$1 and not exists(select 1 from world_v2.world_command_execution_revocation r where r.registration_ref=x.registration_ref)',
      [marker.worldId],
    );
    must(
      registrationRows.rows.length === 1,
      'EXACT_PRIOR_EXECUTION_REGISTRATION_REQUIRED',
    );
    const prior = registrationRows.rows[0]!,
      original = record(JSON.parse(prior.registration_text));
    roleIdent(prior.consumer_role);
    must(
      sha(prior.registration_text) === prior.registration_sha256 &&
        canonicalSerialize(original) === prior.registration_text &&
        original.worldId === marker.worldId &&
        original.seedFingerprint === marker.seedFingerprint &&
        original.admissionRef === marker.admissionRef &&
        original.controlMode === 'MANUAL_FINITE' &&
        original.simTime === '0' &&
        original.modelVersion === WORLD_MODEL_VERSION,
      'EXACT_PRIOR_FINITE_CONTROL_PINS_REQUIRED',
    );
    const workerId = prior.worker_id;
    const member = (group: string) =>
      "pg_has_role(r.oid,'" + group + "','MEMBER')";
    const safe =
      'r.rolcanlogin and not(r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication)';
    const oneRole = async (predicate: string) => {
      const q = await db.query<{ rolname: string }>(
        'select r.rolname from pg_roles r where ' + safe + ' and ' + predicate,
      );
      must(q.rows.length === 1, 'UNIQUE_EXISTING_ROLE_REQUIRED:' + predicate);
      roleIdent(q.rows[0]!.rolname);
      return q.rows[0]!.rolname;
    };
    const actorScopes = await db.query<{ reader_role: string }>(
      'select reader_role::text from world_v2.world_actor_reader_scope s where world_id=$1 and not exists(select 1 from world_v2.world_actor_reader_scope_revocation r where r.world_id=s.world_id and r.scope_ref=s.scope_ref)',
      [marker.worldId],
    );
    must(
      actorScopes.rows.length === 1,
      'EXACT_EXISTING_ACTOR_READER_SCOPE_REQUIRED',
    );
    roleIdent(actorScopes.rows[0]!.reader_role);
    const roles = {
      worker: await oneRole(
        "r.rolname='" + prior.consumer_role + "' and not r.rolinherit",
      ),
      read: actorScopes.rows[0]!.reader_role,
      intake: await oneRole(
        member('world_v2_social_intake_lock_reader') +
          ' and ' +
          member('world_v2_finance_budget_source_reader') +
          ' and not ' +
          member('world_v2_social_source_reader') +
          ' and not r.rolinherit',
      ),
      source: await oneRole(
        member('world_v2_social_source_reader') +
          ' and not ' +
          member('world_v2_finance_budget_source_reader') +
          ' and not ' +
          member('world_v2_social_source_publisher') +
          ' and not ' +
          member('world_v2_social_source_owner'),
      ),
      publication: await oneRole(
        member('world_v2_postwar_projection_publisher') +
          ' and not ' +
          member('world_v2_postwar_projection_owner'),
      ),
      industryPublication: await oneRole(
        member('world_v2_industry_source_publisher') +
          ' and not ' +
          member('world_v2_industry_source_owner'),
      ),
      matchPublication: await oneRole(
        member('world_v2_social_source_publisher') +
          ' and not ' +
          member('world_v2_social_source_owner'),
      ),
    };
    must(
      (await oneRole(
        "r.rolname='" +
          roles.read +
          "' and " +
          member('world_v2_postwar_projection_reader') +
          ' and ' +
          member('world_v2_actor_registry_reader'),
      )) === roles.read,
      'EXACT_SAFE_READ_ROLE_REQUIRED',
    );
    if (powerLabour) {
      // Match the hook's actual worker LOGIN and unfiltered seven queries. An
      // RLS-hidden 0 -> 0 is not complete economic conservation evidence.
      const preflightWorker = new Pool({
        host: marker.socket,
        port: marker.port,
        database: clone.database,
        user: roles.worker,
        max: 1,
        ssl: false,
        password: async () => '',
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 1000,
      });
      try {
        const actual: Record<string, unknown> = {},
          expected: Record<string, unknown> = {};
        for (const table of [
          'world_head',
          'command_submission',
          'command_queue',
          'command_receipt',
          'authoritative_event',
          'financial_posting_batch',
          'inventory_posting',
        ]) {
          const sql = `select count(*)::text count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n'order by to_jsonb(t)::text collate "C"),''),'UTF8')),'hex')sha256 from world_v2.${table} t`;
          actual[table] = (await preflightWorker.query(sql)).rows;
          expected[table] = (await db.query(sql)).rows;
        }
        must(
          JSON.stringify(actual) === JSON.stringify(expected),
          'ACTUAL_HOOK_WORKER_FULL_RLS_COUNT_AND_HASH_REQUIRED',
        );
        restoreEvidence.hookWorkerEconomicReadPreflight = {
          role: roles.worker,
          extraWorldGuc: false,
          actual,
          matchesInstaller: true,
        };
      } finally {
        await preflightWorker.end();
      }
    }
    const c10HttpActor =
      input.includeC10Industry === true
        ? await prepareRegisteredC10HttpActorFrom({
            marker,
            clone,
            workerRole: roles.worker,
            actorPublisherRole: await oneRole(
              member('world_v2_actor_registry_publisher') +
                ' and not ' +
                member('world_v2_actor_registry_reader') +
                ' and not ' +
                member('world_v2_actor_registry_owner'),
            ),
          })
        : undefined;
    if (c10HttpActor) restoreEvidence.c10HttpActor = c10HttpActor;
    const httpCountries: readonly RegisteredUtilityHttpCountry[] =
      input.includeC10Industry === true
        ? ['COUNTRY_01', 'COUNTRY_02', 'COUNTRY_10']
        : ['COUNTRY_01', 'COUNTRY_02'];
    const bindings = await db.query<{
      country_id: string;
      auth_subject: string;
      actor_id: string;
    }>(
      "select distinct a.country_id,a.auth_subject::text,b.actor_id from world_v2.current_commit_authorization a join world_v2.world_actor_binding b on b.world_id=a.world_id and b.auth_subject=a.auth_subject where a.world_id=$1 and a.country_id=any($2::text[])and a.office_id='INDUSTRY'and a.active and not exists(select 1 from world_v2.world_actor_binding_revocation r where r.world_id=b.world_id and r.binding_ref=b.binding_ref)order by a.country_id",
      [marker.worldId, httpCountries],
    );
    must(
      bindings.rows.length === httpCountries.length &&
        bindings.rows.map((x) => x.country_id).join(',') ===
          httpCountries.join(','),
      'EXACT_FINITE_HTTP_ACTOR_BINDINGS_REQUIRED',
    );
    const subjects = Object.fromEntries(
      bindings.rows.map((x) => [x.country_id, x.auth_subject]),
    );
    const countries = (
      await db.query<{ country_id: string; source_sha256: string }>(
        'select country_id,source_sha256 from world_v2.finance_budget_capacity_original where world_id=$1 and country_id=any($2::text[])and seed_fingerprint=$3 and admission_ref=$4 order by country_id',
        [
          marker.worldId,
          httpCountries,
          marker.seedFingerprint,
          marker.admissionRef,
        ],
      )
    ).rows;
    must(
      countries.length === httpCountries.length,
      'ACTUAL_EXISTING_COUNTRY_CAPACITY_PINS_REQUIRED',
    );
    const site = (
      await db.query<{ source_ref: string; source_sha256: string }>(
        "select source_ref,source_sha256 from world_v2.postwar_industry_first_day_source where world_id=$1 and country_id='COUNTRY_02'and facility_id='OPEN-02-REFINED_FUEL'and seed_fingerprint=$2 and admission_ref=$3",
        [marker.worldId, marker.seedFingerprint, marker.admissionRef],
      )
    ).rows;
    must(site.length === 1, 'ACTUAL_C2_ADOPTED_SOURCE_REQUIRED');
    release = new Pool({
      host: marker.socket,
      port: marker.port,
      database: clone.database,
      user: marker.roles.registrarRole,
      max: 1,
      ssl: false,
      password: async () => '',
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
    });
    let registrationRef = prior.registration_ref;
    const registerFinite = async () => {
      const live = await db.query<{ count: string }>(
        'select count(*)::text count from pg_stat_activity where datname=$1 and usename=any($2::text[])',
        [clone!.database, Object.values(roles)],
      );
      must(live.rows[0]?.count === '0', 'OLD_HOST_CONNECTIONS_MUST_BE_DRAINED');
      const lease = await db.query(
        'select * from world_v2.acquire_world_writer_lease($1,$2,clock_timestamp(),3600000)',
        [marker.worldId, workerId],
      );
      must(lease.rows.length === 1, 'SAME_TEST_ONLY_WORKER_LEASE_REQUIRED');
      const tag = randomUUID().replaceAll('-', '').toUpperCase(),
        clockRef = 'CLOCK_TEST_ONLY_RESTORE_' + tag,
        controlRef = 'CONTROL_TEST_ONLY_RESTORE_' + tag,
        ref = 'EXECUTION_TEST_ONLY_RESTORE_' + tag;
      const validFromReal = new Date(Date.now() - 300000).toISOString(),
        validUntilReal = new Date(Date.now() + 3600000).toISOString();
      const clockOriginal = canonicalSerialize({
        schemaVersion: 'world-clock-original-v1',
        worldId: marker.worldId,
        seedFingerprint: marker.seedFingerprint,
        sourceRef: clockRef,
        clockVersion: 'SIMULATION_CLOCK_V1',
        simTime: '0',
        issuerRef: 'TEST_ONLY_NATIVE_EXECUTION_REGISTRAR',
        provenanceRef: 'TEST_ONLY_FINITE_ISOLATED_FIRST_DAY_NO_CLOCK_SERVICE',
      });
      const controlOriginal = canonicalSerialize({
        schemaVersion: 'world-execution-control-original-v1',
        worldId: marker.worldId,
        seedFingerprint: marker.seedFingerprint,
        sourceRef: controlRef,
        controlMode: 'MANUAL_FINITE',
        soleConsumerRef: 'SOLE_TEST_ONLY_RESTORE_' + tag,
        workerId,
        consumerRole: roles.worker,
        validFromReal,
        validUntilReal,
        issuerRef: 'TEST_ONLY_NATIVE_EXECUTION_REGISTRAR',
        provenanceRef: 'TEST_ONLY_NEW_IMMUTABLE_FINITE_REGISTRATION_NO_DAEMON',
      });
      const registration = {
        schemaVersion: 'world-command-execution-registration-v1',
        registrationRef: ref,
        worldId: marker.worldId,
        workerId,
        seedId: marker.seedId,
        seedFingerprint: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        modelVersion: WORLD_MODEL_VERSION,
        consumerRole: roles.worker,
        controlMode: 'MANUAL_FINITE',
        clockSourceRef: clockRef,
        clockSourceSha256: sha(clockOriginal),
        controlSourceRef: controlRef,
        controlSourceSha256: sha(controlOriginal),
        soleConsumerRef: 'SOLE_TEST_ONLY_RESTORE_' + tag,
        clockVersion: 'SIMULATION_CLOCK_V1',
        simTime: '0',
        validFromReal,
        validUntilReal,
      };
      const client = await release!.connect();
      try {
        await client.query('begin');
        await client.query('set local role world_v2_admission_release');
        await client.query(
          'select world_v2.revoke_world_command_execution($1,$2,$3)',
          [
            marker.worldId,
            registrationRef,
            'TEST_ONLY_RESTORED_FINITE_GENERATION_RETIRED',
          ],
        );
        const raw = canonicalSerialize(registration);
        await client.query(
          'select world_v2.register_world_command_execution($1,$2,$3,$4)',
          [raw, sha(raw), clockOriginal, controlOriginal],
        );
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw e;
      } finally {
        client.release();
      }
      registrationRef = ref;
      return registration;
    };
    const registered = await registerFinite();
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
      kid =
        'EPHEMERAL_TEST_ONLY_RESTORE_' +
        randomUUID().replaceAll('-', '').toUpperCase();
    const jwks = {
      keys: [
        {
          ...keys.publicKey.export({ format: 'jwk' }),
          kid,
          alg: 'ES256',
          use: 'sig',
          key_ops: ['verify'],
        },
      ],
    };
    const issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1';
    const configuration = {
      readerRole: roles.read,
      authorizationPublisherRole: marker.roles.authorizationPublisherRole,
      modelVersion: WORLD_MODEL_VERSION,
      endpointPins: {
        origin: 'https://registered-final-test.example',
        projectionPath: '/v1/postwar-office-runtime',
        finalLookupPath: '/v1/final-receipt',
        deploymentRef: 'TEST_ONLY_RESTORED_REGISTERED_CHILD',
      },
      admittedWorldPins: {
        worldId: marker.worldId,
        seedRef: marker.seedId,
        contentHash: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        minimumWorldVersion: '0',
      },
      auth: {
        projectRef: 'abcdefghijklmnopqrst',
        expectedIssuer: issuer,
        jwksUrl: issuer + '/.well-known/jwks.json',
        audience: 'authenticated',
      },
      routeOptions: { allowedOrigins: ['https://pages-test.example'] },
    };
    const signToken = createRegisteredUtilityFixtureTokenSigner({
      subjects,
      issuer,
      kid,
      privateKey: keys.privateKey,
    });
    const descriptor = {
      schemaVersion: 'test-only-registered-final-child-host-v1',
      repositoryRoot: input.repositoryRoot,
      worldId: marker.worldId,
      seedId: marker.seedId,
      seedFingerprint: marker.seedFingerprint,
      admissionRef: marker.admissionRef,
      socket: marker.socket,
      port: marker.port,
      database: clone.database,
      workerId,
      workerRole: roles.worker,
      readRole: roles.read,
      intakeRole: roles.intake,
      sourceRole: roles.source,
      publicationRole: roles.publication,
      industryPublicationRole: roles.industryPublication,
      matchPublicationRole: roles.matchPublication,
      authorizationPublisherRole: marker.roles.authorizationPublisherRole,
      registrationRef: registered.registrationRef,
      seedFile: marker.seedFile,
      seedFileSHA256: marker.seedFileSha256,
      countries: countries.map((x) => ({
        countryId: x.country_id,
        expectedRawSourceSHA256: x.source_sha256,
      })),
      configuration,
      jwks,
      install: {
        centralBankOmo: true,
        trade: true,
        industry: true,
        industryUtilities: true,
      },
      beneficialRent: {
        parentSeedPath:
          '/workspace/.cloud-setup/evidence/postwar-gcu-opening-fresh-20261029T020748Z/final-seed.json',
        parentSeedFileSha256:
          'ee2f777126e9050ce7139e2d9d9e24d2ec7305de95b8380d3e4c35fc4edb314f',
        receiptsPath: path.join(path.dirname(marker.seedFile), 'receipts.json'),
        receiptsFileSha256:
          '7d37e721da1021b290d8a1464e4fec096046efe623c2a5d12ee719a28fba5ae6',
        clockBindingRef: registered.clockSourceRef,
      },
    };
    restoreEvidence.roles = roles;
    restoreEvidence.subjects = subjects;
    restoreEvidence.registrationRef = registered.registrationRef;
    restoreEvidence.cloneDatabase = clone.database;
    restoreEvidence.sourceRowsReissued = 0;
    restoreEvidence.initialCounts = await counts();
    await writeFile(
      path.join(pg, 'restore-evidence.json'),
      JSON.stringify(restoreEvidence, null, 2) + '\n',
    );
    const setup: RegisteredUtilitySetup = {
      descriptor,
      ...(c10HttpActor ? { c10HttpActor } : {}),
      industrySource: {
        sourceRef: site[0]!.source_ref,
        sourceSha256: site[0]!.source_sha256,
      },
      ddlReceipts: [
        ...(oldReport.ddlReceipts as unknown[]),
        ...(readRepair ? [readRepair.extraReceipt] : []),
      ],
      directRpcEnrollment: oldReport.directRpcEnrollment as unknown[],
      counts,
      close,
      signToken,
      async rotateFiniteClock(request) {
        must(
          request.previousHostStopped === true && request.simTime === '0',
          'RESTORE_MUST_NOT_ADVANCE_CLOCK',
        );
        const next = await registerFinite();
        return {
          ...descriptor,
          registrationRef: next.registrationRef,
          beneficialRent: {
            ...descriptor.beneficialRent,
            clockBindingRef: next.clockSourceRef,
          },
        };
      },
    };
    fixtureReturned = true;
    return Object.freeze({
      fixture: Object.freeze({ marker, clone, cleanup }),
      setup: Object.freeze(setup),
      ...(resume ? { resume } : {}),
    });
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'RESTORE_FAILED_AND_RETENTION_UNCONFIRMED',
        { cause: cleanupError },
      );
    }
    throw error;
  }
}
