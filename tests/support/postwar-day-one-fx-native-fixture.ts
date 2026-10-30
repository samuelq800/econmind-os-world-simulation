/** TEST_ONLY cfc/new-World fixture. Importing or inspecting artifacts never
 * starts PG. The explicit native constructor bootstraps the actual existing
 * seed through the unchanged Core/store/controlled-admission protocol. */
import { createReadStream } from 'node:fs';
import { readFile, stat, statfs, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import type { AuthorizationResolver } from '@econmind/core';

export const POSTWAR_DAY_ONE_FX_ARTIFACT_DIRECTORY =
  '/workspace/.cloud-setup/evidence/postwar-gcu-opening-fresh-20261029T020748Z';
export const POSTWAR_DAY_ONE_FX_PINS = Object.freeze({
  worldId: 'WORLD_POSTWAR_GCU_OPENING_20261029_V1',
  seedId: 'SEED_POSTWAR_GCU_OPENING_20261029_V1',
  seedFingerprint:
    'sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274',
  seedFileSHA256:
    'ee2f777126e9050ce7139e2d9d9e24d2ec7305de95b8380d3e4c35fc4edb314f',
  receiptSHA256:
    'ab52ef9fb27a7d2b0b4b7bb1bcb72c27e614b0b21d5a5d7fd9d80f45011306fc',
  ledgerVerificationSHA256:
    'd212bf68fed77b41ec446b35c23b4e3014566fce871c8a9aae38379797d6237a',
  sourceId: 'SOURCE_GCU_BANK_67D45B1D13871199F315631C6E04333A',
  sourcePayloadHash:
    'sha256:232bbde072e731867226202eab44271014b65ed2485f9efaeae580f2f7e8aaca',
});
const sha = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
const invalid = (reason: string): never => {
  throw Error('POSTWAR_DAY_ONE_FX_FIXTURE:' + reason);
};
async function streamSHA256(file: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
/** Metadata/hash check only, NOT an admission, Core validation or native PASS.
 * The 119MiB seed is streamed once, not copied or JSON-parsed here. */
export async function inspectPostwarDayOneFxArtifacts(
  artifactDirectory = POSTWAR_DAY_ONE_FX_ARTIFACT_DIRECTORY,
) {
  const seedFile = path.join(artifactDirectory, 'final-seed.json');
  const [receiptBytes, verificationBytes, seedStat] = await Promise.all([
    readFile(path.join(artifactDirectory, 'receipt.json')),
    readFile(
      path.join(artifactDirectory, 'actual-bank-ledger-verification.json'),
    ),
    stat(seedFile),
  ]);
  if (
    sha(receiptBytes) !== POSTWAR_DAY_ONE_FX_PINS.receiptSHA256 ||
    sha(verificationBytes) !== POSTWAR_DAY_ONE_FX_PINS.ledgerVerificationSHA256
  )
    invalid('EXACT_NEW_WORLD_ARTIFACTS_REQUIRED');
  const receipt = JSON.parse(receiptBytes.toString('utf8')) as Record<
    string,
    unknown
  >;
  const verification = JSON.parse(verificationBytes.toString('utf8')) as Record<
    string,
    unknown
  >;
  for (const key of ['worldId', 'seedId', 'seedFingerprint'] as const)
    if (
      receipt[key] !== POSTWAR_DAY_ONE_FX_PINS[key] ||
      verification[key] !== POSTWAR_DAY_ONE_FX_PINS[key]
    )
      invalid('NEW_WORLD_PINS_REQUIRED');
  if (
    receipt.finalSeedFileSha256 !== POSTWAR_DAY_ONE_FX_PINS.seedFileSHA256 ||
    verification.finalSeedFileSha256 !==
      POSTWAR_DAY_ONE_FX_PINS.seedFileSHA256 ||
    verification.newSourceId !== POSTWAR_DAY_ONE_FX_PINS.sourceId ||
    verification.newSourcePayloadHash !==
      POSTWAR_DAY_ONE_FX_PINS.sourcePayloadHash ||
    !Array.isArray(verification.countries) ||
    verification.countries.length !== 70 ||
    !seedStat.isFile()
  )
    invalid('FOURTH_SOURCE_ORIGINALS_REQUIRED');
  const seedFileSHA256 = await streamSHA256(seedFile);
  if (seedFileSHA256 !== POSTWAR_DAY_ONE_FX_PINS.seedFileSHA256)
    invalid('SEED_FILE_SHA256_MISMATCH');
  return Object.freeze({
    classification: 'OFFLINE_ARTIFACT_HASH_ONLY_NOT_NATIVE_ACCEPTANCE' as const,
    artifactDirectory,
    seedFile,
    seedBytes: String(seedStat.size),
    seedFileSHA256,
    worldId: POSTWAR_DAY_ONE_FX_PINS.worldId,
    seedId: POSTWAR_DAY_ONE_FX_PINS.seedId,
    seedFingerprint: POSTWAR_DAY_ONE_FX_PINS.seedFingerprint,
    sourceId: POSTWAR_DAY_ONE_FX_PINS.sourceId,
    sourcePayloadHash: POSTWAR_DAY_ONE_FX_PINS.sourcePayloadHash,
  });
}

/** Explicit native invocation only. The reference owns its named volume and
 * remains reusable/sealed; cleanup drops ONLY this fixture's clone and role.
 * No c427 database, historical command, admission, balance or permission is copied. */
export async function createPostwarDayOneFxNativeFixture(input: {
  repositoryRoot: string;
  evidenceDirectory: string;
  environment: 'local' | 'ci';
}) {
  if (
    !['local', 'ci'].includes(input.environment) ||
    process.env.ECONMIND_POSTWAR_DAY_ONE_FX_NATIVE !== '1'
  )
    invalid('EXPLICIT_LOCAL_NATIVE_OPT_IN_REQUIRED');
  if (
    !input.evidenceDirectory.startsWith(
      '/workspace/.cloud-setup/evidence/fx-cfc-',
    ) ||
    path.resolve(input.evidenceDirectory) !== input.evidenceDirectory
  )
    invalid('SEPARATE_CFC_EVIDENCE_DIRECTORY_REQUIRED');
  const artifacts = await inspectPostwarDayOneFxArtifacts();
  const [workspaceSpace, temporarySpace] = await Promise.all([
    statfs('/workspace', { bigint: true }),
    statfs('/tmp', { bigint: true }),
  ]);
  const availableWorkspace = workspaceSpace.bavail * workspaceSpace.bsize,
    availableTemporary = temporarySpace.bavail * temporarySpace.bsize;
  if (
    availableWorkspace < 1536n * 1024n * 1024n ||
    availableTemporary < 256n * 1024n * 1024n
  )
    invalid('NEW_PGDATA_AND_ONE_CLONE_SPACE_BUDGET_REQUIRED');
  await mkdir(input.evidenceDirectory, { recursive: true });
  await writeFile(
    path.join(input.evidenceDirectory, 'fx-input.json'),
    JSON.stringify(
      {
        ...artifacts,
        resourceBudget: {
          pgCpus: 1,
          pgMemoryBytes: '3221225472',
          workspaceAvailableBytes: String(availableWorkspace),
          tmpAvailableBytes: String(availableTemporary),
          seedCopiesWritten: 0,
        },
        nativeStatus: 'NOT_RUN_UNTIL_BOOTSTRAP_AND_CASE_COMPLETE',
      },
      null,
      2,
    ) + '\n',
  );
  // Only the explicit native path loads Core/native constructors. Artifact
  // guards remain runnable before the coordinated Core/Worker build.
  const [core, { PostgresSqlDatabase }, reference] = await Promise.all([
    import('@econmind/core'),
    import('../../apps/world-worker/src/persistence/postgres-sql-database.js'),
    import('./postwar-native-reference-db.js'),
  ]);
  const {
    authenticateIdentity,
    authorizeOfficeCapability,
    authSubject,
    countryId,
    officeId,
    teamId,
    worldId,
  } = core;
  const {
    createPostwarNativeReferenceDatabase,
    clonePostwarNativeReference,
    readPostwarNativeReferenceHeader,
  } = reference;
  const marker = await createPostwarNativeReferenceDatabase({
    repositoryRoot: input.repositoryRoot,
    evidenceDirectory: input.evidenceDirectory,
    seedFile: artifacts.seedFile,
  });
  if (
    marker.worldId !== artifacts.worldId ||
    marker.seedId !== artifacts.seedId ||
    marker.seedFingerprint !== artifacts.seedFingerprint ||
    marker.seedFileSha256 !== artifacts.seedFileSHA256 ||
    !marker.baselineSealed ||
    marker.verification.currentOperatingSourceActuallyValidated !== true
  )
    invalid('ACTUAL_CFC_BOOTSTRAP_AND_CONTROLLED_ADMISSION_REQUIRED');
  const clone = await clonePostwarNativeReference(marker, 'day_one_fx');
  const suffix = randomBytes(5).toString('hex'),
    workerRole = 'fx_test_worker_' + suffix,
    intakeRole = 'fx_test_intake_' + suffix,
    workerId = 'WORKER_DAY_ONE_FX_' + suffix.toUpperCase();
  let worker: Pool | undefined;
  let intakePool: Pool | undefined;
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = (): Promise<void> =>
    (cleanupPromise ??= (async () => {
      const errors: unknown[] = [];
      if (worker)
        await worker.end().catch((error: unknown) => errors.push(error));
      if (intakePool)
        await intakePool.end().catch((error: unknown) => errors.push(error));
      await clone.drop().catch((error: unknown) => errors.push(error));
      const admin = new Pool({
        host: marker.socket,
        port: marker.port,
        database: 'postgres',
        user: 'postgres',
        password: async () => '',
        ssl: false,
        max: 1,
      });
      admin.on('error', () => undefined);
      try {
        await admin.query('drop role if exists ' + workerRole);
        await admin.query('drop role if exists ' + intakeRole);
      } catch (error) {
        errors.push(error);
      } finally {
        await admin.end().catch((error: unknown) => errors.push(error));
      }
      if (errors.length)
        throw new AggregateError(
          errors,
          'DAY_ONE_FX_OWNED_CLONE_CLEANUP_FAILED',
        );
    })());
  try {
    const header = await readPostwarNativeReferenceHeader(
      marker,
      clone.database,
    );
    if (
      header.world_version !== '0' ||
      header.event_sequence !== '0' ||
      header.admission_ref !== marker.admissionRef
    )
      invalid('FRESH_CFC_H0_REQUIRED');
    const counts = await clone.installer.query<{ count: string }>(
      `select (select count(*) from world_v2.authoritative_event)+(select count(*) from world_v2.command_submission)+(select count(*) from world_v2.financial_posting_batch)+(select count(*) from world_v2.inventory_posting) as count`,
    );
    if (String(counts.rows[0]?.count) !== '0')
      invalid('FRESH_WORLD_MUST_HAVE_NO_COMMANDS_OR_POSTINGS');
    // Candidate installation is isolated to this new-World test clone. The
    // sealed reference remains unchanged and receives no FX source originals.
    await clone.installer.query(
      await readFile(
        path.join(
          input.repositoryRoot,
          'database/proposals/postwar-day-one-fx-custody.sql',
        ),
        'utf8',
      ),
    );
    await clone.installer
      .query(`create role ${workerRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
      create role ${intakeRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
      grant world_v2_day_one_fx_source_reader to ${workerRole},${intakeRole};
      grant usage on schema world_v2 to ${workerRole};
      grant usage on schema world_v2 to ${intakeRole};
      grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.financial_posting_batch,world_v2.inventory_posting,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox,world_v2.world_writer_lease to ${workerRole};
      grant insert on world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.financial_posting_batch,world_v2.authoritative_commit_authorization,world_v2.notification_outbox to ${workerRole};
      grant update on world_v2.command_queue,world_v2.world_head to ${workerRole};
      grant update(actor_id)on world_v2.command_submission to ${workerRole};
      grant update(renewed_at_real)on world_v2.world_writer_lease to ${workerRole};
      grant execute on function world_v2.assert_world_writer_commit_guard(text,text,bigint,bigint,timestamptz)to ${workerRole};
      grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt to ${intakeRole};
      grant insert on world_v2.command_submission,world_v2.command_queue to ${intakeRole};
      grant update(command_id)on world_v2.command_submission to ${intakeRole};
      grant update(world_version)on world_v2.world_head to ${intakeRole};
      create policy fx_lease_read_${suffix} on world_v2.world_writer_lease for select to ${workerRole} using(world_id='${marker.worldId}');
      create policy fx_lease_lock_${suffix} on world_v2.world_writer_lease for update to ${workerRole} using(world_id='${marker.worldId}')with check(false)`);
    const idleErrors: string[] = [];
    const rawWorker = new Pool({
      host: marker.socket,
      port: marker.port,
      database: clone.database,
      user: workerRole,
      password: async () => '',
      ssl: false,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
      options: '-c request.jwt.claim.sub=' + marker.subject,
    });
    rawWorker.on('error', (error) => idleErrors.push(error.message));
    let workerEnding: Promise<void> | undefined;
    worker = new Proxy(rawWorker, {
      get(target, key, receiver) {
        if (key === 'end') return () => (workerEnding ??= target.end());
        const value: unknown = Reflect.get(target, key, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const rawIntake = new Pool({
      host: marker.socket,
      port: marker.port,
      database: clone.database,
      user: intakeRole,
      password: async () => '',
      ssl: false,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
      options: '-c request.jwt.claim.sub=' + marker.subject,
    });
    rawIntake.on('error', (error) => idleErrors.push(error.message));
    let intakeEnding: Promise<void> | undefined;
    intakePool = new Proxy(rawIntake, {
      get(target, key, receiver) {
        if (key === 'end') return () => (intakeEnding ??= target.end());
        const value: unknown = Reflect.get(target, key, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const permissions = await clone.installer.query(
      `select r,has_column_privilege(r,'world_v2.opening_seed','canonical_payload','SELECT')as raw_seed,
      has_column_privilege(r,'world_v2.current_commit_authorization','authorization_version','UPDATE')as authority_update,
      has_column_privilege(r,'world_v2.projection_entitlement','active','UPDATE')as entitlement_update,
      pg_has_role(r,'world_v2_day_one_fx_source_owner','MEMBER')as owner_member,
      pg_has_role(r,'world_v2_day_one_fx_source_publisher','MEMBER')as publisher_member
      from unnest($1::text[])r`,
      [[workerRole, intakeRole]],
    );
    if (
      permissions.rows.length !== 2 ||
      permissions.rows.some(
        (r) =>
          r.raw_seed !== false ||
          r.authority_update !== false ||
          r.entitlement_update !== false ||
          r.owner_member !== false ||
          r.publisher_member !== false,
      )
    )
      invalid('LOW_PRIVILEGE_WORKER_AND_INTAKE_REQUIRED');
    const lease = await clone.installer.query(
      'select * from world_v2.acquire_world_writer_lease($1,$2,clock_timestamp(),600000)',
      [marker.worldId, workerId],
    );
    if (lease.rows.length !== 1)
      invalid('ACTUAL_EXCLUSIVE_WRITER_LEASE_REQUIRED');
    const principal = await authenticateIdentity({
      token: suffix,
      profile: {
        user_id: marker.subject,
        display_name: 'TEST_ONLY_FX',
        school_id: null,
      },
      verifier: {
        async verify(token: string) {
          if (token !== suffix) invalid('TEST_ONLY_FIXED_IDENTITY_REQUIRED');
          return {
            subject: marker.subject,
            issuer: 'TEST_ONLY_ISOLATED_NATIVE_FIXTURE',
            audience: 'TEST_ONLY_FX',
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 600000).toISOString(),
          };
        },
      },
    });
    const resolver: AuthorizationResolver = {
      async resolveCurrentIdentity(value) {
        return value === principal ? authSubject(marker.subject) : null;
      },
      async resolveCurrentMembership(value, requestedWorld) {
        if (value !== principal || requestedWorld !== marker.worldId)
          return null;
        const current = await clone.installer.query<{
          team_id: string;
          authorization_version: string;
        }>(
          `select a.team_id,a.authorization_version from world_v2.current_commit_authorization a join world_v2.runtime_read_seat s on s.world_id=a.world_id and s.auth_subject=a.auth_subject and s.country_id=a.country_id and s.office_id=a.office_id and s.team_id=a.team_id and s.authorization_revision=a.authorization_version join world_v2.projection_entitlement e on e.world_id=a.world_id and e.auth_subject=a.auth_subject and e.authorization_version=a.authorization_version and e.classification='OFFICE_PRIVATE' and e.scope_key='OFFICE_'||upper(encode(convert_to(a.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(a.office_id,'UTF8'),'hex')) and e.active and e.revoked_at is null where a.world_id=$1 and a.auth_subject=$2::uuid and a.country_id=$3 and a.office_id='FINANCE' and a.capability='FINANCE_TREASURY' and a.active`,
          [marker.worldId, marker.subject, marker.countryId],
        );
        if (current.rows.length !== 1 || !current.rows[0]) return null;
        return {
          worldId: worldId(marker.worldId),
          countryId: countryId(marker.countryId),
          authSubject: authSubject(marker.subject),
          teamId: teamId(current.rows[0].team_id),
          authorizationVersion: current.rows[0].authorization_version,
          officeAssignments: [officeId('FINANCE')],
          active: true,
          suspended: false,
          isWorldAdmin: false,
          negotiationPartyIds: [],
        };
      },
    };
    const authorization = await authorizeOfficeCapability({
      principal,
      resolver,
      worldId: worldId(marker.worldId),
      requestedCountryId: countryId(marker.countryId),
      requestedOfficeId: officeId('FINANCE'),
      capability: 'FINANCE_TREASURY',
    });
    return {
      classification:
        'TEST_ONLY_CFC_FRESH_WORLD_GOV_FIXTURE_NOT_PRODUCTION' as const,
      artifacts,
      marker,
      clone,
      header,
      worker,
      workerRole,
      intakePool,
      intakeRole,
      workerId,
      authorization,
      resolver,
      principal,
      lease: lease.rows[0],
      idleErrors,
      permissions: permissions.rows,
      database: new PostgresSqlDatabase(worker),
      admittedWorldPins: Object.freeze({
        worldId: marker.worldId,
        seedRef: marker.seedId,
        contentHash: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        minimumWorldVersion: '0',
      }),
      cleanup,
    };
  } catch (error) {
    const failure = await cleanup().then(
      () => null,
      (cleanupError: unknown) => cleanupError,
    );
    if (failure !== null) {
      throw new AggregateError(
        [error, failure],
        'DAY_ONE_FX_FIXTURE_CONSTRUCTION_AND_CLEANUP_FAILED',
        { cause: error },
      );
    }
    throw error;
  }
}
