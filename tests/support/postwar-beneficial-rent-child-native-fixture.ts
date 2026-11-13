/** Explicit independent child-world rehearsal. Creates a NEW owned TEST_ONLY
 * cluster, never changes/reinitializes a retained cfc database. Full Core family
 * validation occurs once; the private token is borrowed thereafter. */
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { REGISTERED_FINAL_CHILD_SOURCE_SQL_ORDER } from '../../tools/office-connection/registered-final-native-sql.mjs';
import { Pool } from 'pg';
import {
  createOpeningSeed,
  parseOpeningSeed,
  type BeneficialHousingReclassificationReceipt,
  type OpeningSeed,
  canonicalSerialize,
} from '@econmind/core';
import {
  prepareBeneficialHousingRentSource,
  consumeBeneficialHousingRentSource,
  retireBeneficialHousingRentSource,
  type PreparedBeneficialHousingRentSource,
} from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-source.js';
import {
  createPostwarSocialRuntimeConnection,
  loadPostwarSocialConnectionOpeningAdoption,
  readPostwarSocialRuntimeFinancialReplayBase,
} from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import { createPostgresFinanceBudgetWorldCapacitySource } from '../../apps/world-worker/src/persistence/postgres-finance-budget-capacity-source.js';
import {
  createPostwarFinanceSocialRuntimeConnection,
  readPostwarFinanceSocialRuntimeBinding,
} from '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  derivePostwarBeneficialChildFinanceSocialSources,
  publishPostwarFinanceSocialSources,
  type PostwarFinanceSocialSourceDerivation,
} from '../../apps/world-worker/src/persistence/postwar-finance-social-source-publication.js';
import {
  loadAdoptedCaptainOpeningPolicy,
  withAdoptedBeneficialChildCaptainNewScenarioFrom,
  publishAdoptedCaptainNewScenarioFrom,
} from '../../apps/world-worker/src/preparation/postwar-captain-opening-source.js';
import { publishPostwarDayOneFxOriginals } from '../../apps/world-worker/src/persistence/postgres-postwar-day-one-fx-originals.js';
import { DomainError, DOMAIN_ERROR_CODES } from '@econmind/core';
import { requirePostwarSha256OpeningSeed } from '../../apps/world-worker/src/preparation/postwar-operating-genesis-adoption.js';
import { PostgresTransactionError } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import {
  createPostwarNativeReferenceDatabase,
  clonePostwarNativeReference,
  loadPostwarNativeReferenceMarker,
  sealPostwarReferenceClone,
  POSTWAR_REFERENCE_IMAGE,
} from './postwar-native-reference-db.js';
const run = promisify(execFile),
  sha = (s: string) => createHash('sha256').update(s).digest('hex');
const CHILD =
    'sha256:cd6cd0825fd8b15c13dab28f030e2df24b804d5675e132ff77715a20ec67056a',
  PARENT =
    'sha256:cfc55796562b44bd616f33082cbbafd9dbd43d58733a24ac550339cbc8376274';
const SEED_RAW_SHA =
    '835f9ec096746e3bc8f8cd1a7235fc7a2af0daee06d4ceeedff1fdff99d0262f',
  RECEIPTS_RAW_SHA =
    '7d37e721da1021b290d8a1464e4fec096046efe623c2a5d12ee719a28fba5ae6';
function must(value: unknown, reason: string): asserts value {
  if (!value) throw Error('BENEFICIAL_CHILD_NATIVE:' + reason);
}
/** Mirrors the existing native helper UDS layout, before any 119MiB read,
 * private proof validation or owned PostgreSQL resource is attempted. */
export function assertPostwarBeneficialRentChildEvidenceDirectory(
  directory: string,
): void {
  must(
    directory.startsWith('/workspace/.cloud-setup/evidence/') &&
      path.resolve(directory) === directory,
    'OWNED_EVIDENCE_ROOT_REQUIRED',
  );
  must(
    Buffer.byteLength(path.join(directory, 'socket-00000000')) + 20 <= 107,
    'REFERENCE_UNIX_SOCKET_PATH_TOO_LONG_BEFORE_SOURCE_PREPARATION',
  );
}
export type PostwarBeneficialRentChildRehearsalInput = {
  repositoryRoot: string;
  evidenceDirectory: string;
  artifactDirectory: string;
  /** Same-process genuine results only, never a restored JSON brand. */
  sourcePreparation?: PreparedBeneficialHousingRentSource;
  startupSeed?: Readonly<OpeningSeed>;
  financeSocialDerivation?: PostwarFinanceSocialSourceDerivation;
  /** Only this newly created disposable registered fixture. Keep its owned
   * cluster stopped and its clone sealed after all borrowers have drained. */
  retainOwnedCheckpointOnCleanup?: true;
};
/** Warm same-brand process: publishers only. It deliberately makes NO claim
 * about runtime modules that may already have been cached before the freeze. */
export async function runPostwarBeneficialRentChildNativeRehearsal(
  input: PostwarBeneficialRentChildRehearsalInput,
) {
  const result = await runChildRehearsal(input, 'SOURCE_PUBLICATION_ONLY');
  must(!('fixtureKind' in result), 'SOURCE_PUBLICATION_REPORT_REQUIRED');
  return result;
}
/** Independently cold process: issue the real proof anew, then exercise current
 * source/controller code. Never relabel a warm private object as cold evidence. */
export async function runPostwarBeneficialRentChildColdRuntimeRehearsal(
  input: PostwarBeneficialRentChildRehearsalInput,
) {
  must(
    !input.sourcePreparation &&
      !input.startupSeed &&
      !input.financeSocialDerivation,
    'COLD_PROCESS_CANNOT_BORROW_WARM_PRIVATE_OBJECTS',
  );
  const result = await runChildRehearsal(input, 'COLD_RUNTIME');
  must('current' in result, 'COLD_RUNTIME_RESULT_REQUIRED');
  return result;
}
/** New disposable child initialization and source publication only. The actual
 * returned H0 clone is owned until cleanup(); no runtime/consumer/Clock starts.
 * It is not the retained cfc World and cannot upgrade an existing World. */
export async function createPostwarBeneficialRentChildNativeFixture(
  input: PostwarBeneficialRentChildRehearsalInput,
) {
  must(
    process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE === '1',
    'REGISTERED_FINAL_NATIVE_EXPLICIT_OPT_IN_REQUIRED',
  );
  const result = await runChildRehearsal(input, 'REGISTERED_FIXTURE');
  must(
    'fixtureKind' in result &&
      result.fixtureKind === 'ACTUAL_REGISTERED_CHILD_H0_FIXTURE',
    'ACTUAL_INITIALIZED_H0_FIXTURE_REQUIRED',
  );
  return result;
}
/** Reuse only an actual owned, sealed admission baseline. This creates a new
 * independent clone, never retries or overwrites a partially installed clone.
 * The fixed child bytes and full genuine Core proof below remain mandatory. */
export async function createPostwarBeneficialRentChildFromSealedReference(
  input: PostwarBeneficialRentChildRehearsalInput,
  referenceMarkerPath: string,
) {
  must(
    process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE === '1',
    'REGISTERED_FINAL_NATIVE_EXPLICIT_OPT_IN_REQUIRED',
  );
  must(
    input.retainOwnedCheckpointOnCleanup === true,
    'SEALED_REFERENCE_REUSE_MUST_RETAIN_OWNED_CHECKPOINTS',
  );
  const result = await runChildRehearsal(
    input,
    'REGISTERED_FIXTURE',
    referenceMarkerPath,
  );
  must(
    'fixtureKind' in result &&
      result.fixtureKind === 'ACTUAL_REGISTERED_CHILD_H0_FIXTURE',
    'ACTUAL_INITIALIZED_H0_FIXTURE_REQUIRED',
  );
  return result;
}
async function runChildRehearsal(
  input: PostwarBeneficialRentChildRehearsalInput,
  scope: 'SOURCE_PUBLICATION_ONLY' | 'COLD_RUNTIME' | 'REGISTERED_FIXTURE',
  referenceMarkerPath?: string,
) {
  must(
    input.retainOwnedCheckpointOnCleanup === undefined ||
      (scope === 'REGISTERED_FIXTURE' &&
        input.retainOwnedCheckpointOnCleanup === true),
    'RETAIN_ONLY_NEW_OWNED_REGISTERED_FIXTURE',
  );
  const started = Date.now(),
    stages: object[] = [],
    pools: Pool[] = [];
  let registeredFixtureIssued = false;
  let marker:
      | Awaited<ReturnType<typeof createPostwarNativeReferenceDatabase>>
      | undefined,
    clone: Awaited<ReturnType<typeof clonePostwarNativeReference>> | undefined,
    shared:
      | ReturnType<typeof createPostwarFinanceSocialRuntimeConnection>
      | undefined,
    token: ReturnType<typeof prepareBeneficialHousingRentSource> | undefined;
  assertPostwarBeneficialRentChildEvidenceDirectory(input.evidenceDirectory);
  // An existing descriptor is never recycled by this acceptance scenario.
  must(
    (await readFile(
      path.join(input.evidenceDirectory, 'reference-db.json'),
      'utf8',
    ).catch(() => null)) === null,
    'NEW_SCENARIO_REQUIRED',
  );
  await mkdir(input.evidenceDirectory, { recursive: true });
  const stage = async (name: string) => {
    stages.push({
      name,
      elapsedMs: Date.now() - started,
      rss: process.memoryUsage().rss,
    });
    await writeFile(
      path.join(input.evidenceDirectory, 'progress.json'),
      JSON.stringify(stages, null, 2) + '\n',
    );
  };
  const installedSql: { path: string; sha256: string }[] = [];
  const loadedFunctionBodies: Readonly<Record<string, string>> =
    Object.fromEntries(
      Object.entries({
        runPostwarBeneficialRentChildNativeRehearsal,
        runChildRehearsal,
        prepareBeneficialHousingRentSource,
        createPostwarNativeReferenceDatabase,
        derivePostwarBeneficialChildFinanceSocialSources,
        publishPostwarFinanceSocialSources,
        withAdoptedBeneficialChildCaptainNewScenarioFrom,
        publishAdoptedCaptainNewScenarioFrom,
        publishPostwarDayOneFxOriginals,
      }).map(([name, fn]) => [name, sha(Function.prototype.toString.call(fn))]),
    );
  const cleanupErrors: string[] = [],
    idleErrors: string[] = [];
  let originalFailure: unknown,
    failed = false,
    createdToken = false;
  const perform = async () => {
    await stage('READ_EXACT_SAVED_CHILD_NO_REGENERATION');
    const seedPath = path.join(input.artifactDirectory, 'candidate-seed.json');
    const fileHash = createHash('sha256');
    for await (const chunk of createReadStream(seedPath))
      fileHash.update(chunk);
    const receiptBytes = await readFile(
      path.join(input.artifactDirectory, 'receipts.json'),
      'utf8',
    );
    must(
      fileHash.digest('hex') === SEED_RAW_SHA &&
        sha(receiptBytes) === RECEIPTS_RAW_SHA,
      'SAVED_ARTIFACT_BYTES_CHANGED',
    );
    const seed = input.startupSeed
      ? requirePostwarSha256OpeningSeed(input.startupSeed)
      : parseOpeningSeed(JSON.parse(await readFile(seedPath, 'utf8')), sha);
    const receipts = JSON.parse(
      receiptBytes,
    ) as BeneficialHousingReclassificationReceipt[];
    must(
      seed.fingerprint === CHILD && receipts.length === 70,
      'EXACT_CHILD_AND_SEVENTY_RECEIPTS_REQUIRED',
    );
    const sourceIds = new Set(receipts.map((r) => r.supplementalSourceId)),
      batchIds = new Set(receipts.map((r) => r.reclassificationBatchId));
    const parent = createOpeningSeed(
      {
        ...seed,
        sources: seed.sources.filter((s) => !sourceIds.has(s.sourceId)),
        financialBatches: seed.financialBatches.filter(
          (b) => !batchIds.has(b.batchId),
        ),
      },
      sha,
    );
    must(
      parent.fingerprint === PARENT &&
        parent.sources.length === 4 &&
        seed.sources.length === 74,
      'EXACT_RETAINED_PARENT_REQUIRED',
    );
    await stage('ONE_COMPLETE_CORE_SOURCE_FAMILY_VALIDATION_NOT_GENERATION');
    if (input.sourcePreparation) token = input.sourcePreparation;
    else {
      token = prepareBeneficialHousingRentSource({
        parentSeed: parent,
        seed,
        receipts,
      });
      createdToken = true;
    }
    const data = consumeBeneficialHousingRentSource(token);
    must(
      data.seedFingerprint === CHILD &&
        data.parentSeedFingerprint === PARENT &&
        data.worldId === seed.worldId &&
        data.seedId === seed.seedId &&
        canonicalSerialize(data.receipts) === canonicalSerialize(receipts),
      'EXACT_EXISTING_GENUINE_CHILD_SOURCE_REQUIRED',
    );
    if (referenceMarkerPath) {
      await stage('REUSE_ACTUAL_OWNED_SEALED_ADMISSION_NO_REINITIALIZATION');
      const retained =
        await loadPostwarNativeReferenceMarker(referenceMarkerPath);
      must(
        retained.baselineSealed &&
          retained.worldId === seed.worldId &&
          retained.seedId === seed.seedId &&
          retained.seedFingerprint === CHILD &&
          retained.seedFileSha256 === SEED_RAW_SHA,
        'SAME_FIXED_CHILD_SEALED_ADMISSION_REQUIRED',
      );
      marker = {
        ...retained,
        markerPath: path.join(input.evidenceDirectory, 'reference-db.json'),
      };
      await writeFile(
        marker.markerPath,
        JSON.stringify(marker, null, 2) + '\n',
        { flag: 'wx' },
      );
      await writeFile(
        path.join(input.evidenceDirectory, 'reference-reuse.json'),
        JSON.stringify(
          {
            classification:
              'NEW_CLONE_OF_EXISTING_OWNED_ADMISSION_NOT_RESTORED_PARTIAL_WORLD',
            parentMarkerPath: referenceMarkerPath,
            admittedDatabase: retained.database,
            ownershipNonce: retained.ownershipNonce,
            admissionRef: retained.admissionRef,
            seedFingerprint: retained.seedFingerprint,
            fullCoreProofReissued: true,
            bootstrapPerformed: false,
            admissionPublished: false,
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
    } else {
      await stage(
        'NEW_CLUSTER_ACTUAL_BOOTSTRAP_AND_CONTROLLED_TEST_ONLY_ADMISSION',
      );
      marker = await createPostwarNativeReferenceDatabase({
        repositoryRoot: input.repositoryRoot,
        evidenceDirectory: input.evidenceDirectory,
        seedFile: path.join(input.artifactDirectory, 'candidate-seed.json'),
        beneficialRentSource: token,
      });
    }
    must(
      marker.seedFingerprint === CHILD && marker.baselineSealed,
      'ACTUAL_CHILD_ADMISSION_REQUIRED',
    );
    clone = await clonePostwarNativeReference(marker, 'rent_child_acceptance');
    await stage('INSTALL_EXACT_SOURCE_PROPOSALS_IN_NEW_CHILD_CLONE');
    for (const name of REGISTERED_FINAL_CHILD_SOURCE_SQL_ORDER) {
      const file = 'database/proposals/' + name + '.sql';
      const sql = await readFile(path.join(input.repositoryRoot, file), 'utf8');
      await clone.installer.query(sql);
      installedSql.push({ path: file, sha256: sha(sql) });
    }
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8),
      workerRole = 'fixture_rent_child_worker_' + suffix,
      intakeRole = 'fixture_rent_child_intake_' + suffix;
    await clone.installer.query(
      `create role ${workerRole} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role ${intakeRole} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_social_source_reader,world_v2_beneficial_rent_source_reader,world_v2_captain_source_reader,world_v2_finance_budget_source_reader,world_v2_day_one_fx_source_reader to ${workerRole}`,
    );
    const admin = new PostgresSqlDatabase(clone.installer);
    await admin.transaction(async (tx) => {
      await tx.query(
        'set local role world_v2_beneficial_rent_source_publisher',
      );
      const r = await tx.query<{ registered: number }>(
        'select world_v2.register_postwar_beneficial_rent_source($1,$2,$3)as registered',
        [seed.worldId, data.bundleBytes, data.bundleSha256],
      );
      must(
        r.rows[0]?.registered === 70,
        'SEVENTY_ACTUAL_RENT_REGISTRATIONS_REQUIRED',
      );
    });
    // The fixed per-country publisher below derives the same actual seventy
    // source registrations. Do not first invoke the redundant legacy global
    // issuer, which expands the entire large operating carrier in PostgreSQL.
    await stage('FIXED_CHILD_CAPTAIN_FINANCE_AND_FX_PUBLICATION');
    const publisherFor = (
      role:
        | 'world_v2_finance_budget_source_publisher'
        | 'world_v2_social_source_publisher'
        | 'world_v2_day_one_fx_source_publisher',
    ) => ({
      query: admin.query.bind(admin),
      transaction: <T>(
        consume: (
          tx: import('../../apps/world-worker/src/persistence/sql-database.js').SqlExecutor,
        ) => Promise<T>,
      ) =>
        admin.transaction(async (tx) => {
          await tx.query('set local role ' + role);
          return consume(tx);
        }),
    });
    const financeDerivation =
      input.financeSocialDerivation ??
      derivePostwarBeneficialChildFinanceSocialSources({
        seed,
        preparation: token,
      });
    const financePublication = await publishPostwarFinanceSocialSources({
      derivation: financeDerivation,
      financeDatabase: publisherFor('world_v2_finance_budget_source_publisher'),
      socialDatabase: publisherFor('world_v2_social_source_publisher'),
    });
    must(
      financePublication.seedFingerprint === CHILD &&
        financePublication.results.length === 140 &&
        financePublication.results.filter(
          (r) => r.function === 'publish_postwar_social_source_bounded',
        ).length === 70 &&
        new Set(
          financePublication.results
            .filter(
              (r) => r.function === 'publish_postwar_social_source_bounded',
            )
            .map((r) => r.countryId),
        ).size === 70,
      'EXACT_CHILD_FINANCE_SOCIAL_PUBLICATIONS_REQUIRED',
    );
    const captainPolicy = await loadAdoptedCaptainOpeningPolicy(
      input.repositoryRoot,
    );
    // The controlled release checks session_user attributes. SET ROLE on the
    // installer is deliberately insufficient; borrow the existing safe registrar.
    const captainReleasePool = new Pool({
      host: marker.socket,
      port: marker.port,
      database: clone.database,
      user: marker.roles.registrarRole,
      password: async () => '',
      ssl: false,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 1000,
    });
    captainReleasePool.on('error', (error) => idleErrors.push(error.message));
    pools.push(captainReleasePool);
    const captainReleaseDatabase = new PostgresSqlDatabase(captainReleasePool);
    const captainPublication = await captainReleaseDatabase.transaction(
      async (tx) => {
        await tx.query('set local role world_v2_admission_release');
        const session = await tx.query<{
          session_role: string;
          effective_role: string;
          safe: boolean;
          release_member: boolean;
          owner_member: boolean;
        }>(
          "select session_user::text session_role,current_setting('role')effective_role,not(rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication)safe,pg_has_role(session_user,'world_v2_admission_release','MEMBER')release_member,pg_has_role(session_user,'world_v2_captain_source_owner','MEMBER')owner_member from pg_roles where rolname=session_user",
        );
        must(
          session.rows.length === 1 &&
            session.rows[0]?.session_role === marker!.roles.registrarRole &&
            session.rows[0].effective_role === 'world_v2_admission_release' &&
            session.rows[0].safe &&
            session.rows[0].release_member &&
            !session.rows[0].owner_member,
          'ACTUAL_SEPARATED_CAPTAIN_RELEASE_SESSION_REQUIRED',
        );
        await writeFile(
          path.join(input.evidenceDirectory, 'captain-release-session.json'),
          JSON.stringify(session.rows[0], null, 2) + '\n',
        );
        return withAdoptedBeneficialChildCaptainNewScenarioFrom(
          tx,
          {
            policy: captainPolicy,
            seed,
            preparation: token!,
            worldAdmissionRef: marker!.admissionRef,
          },
          (candidate) => publishAdoptedCaptainNewScenarioFrom(tx, candidate),
        );
      },
    );
    must(
      captainPublication.seedFingerprint === CHILD &&
        captainPublication.publicationCount === 70,
      'EXACT_CHILD_CAPTAIN_PUBLICATIONS_REQUIRED',
    );
    const policyBytes = await readFile(
        path.join(
          input.repositoryRoot,
          'config/postwar-genesis/day-one-fx.v1.json',
        ),
        'utf8',
      ),
      userReceiptBytes = await readFile(
        path.join(
          input.repositoryRoot,
          'docs/governance/owner-inputs/2026-10-29/DAY_ONE_FX_USER_ADOPTION.original.json',
        ),
        'utf8',
      );
    const fxPublication = await publishPostwarDayOneFxOriginals({
      database: publisherFor('world_v2_day_one_fx_source_publisher'),
      seed,
      startupBeneficialHousingRentSource: token,
      policyBytes,
      userReceiptBytes,
    });
    must(
      fxPublication.seedFingerprint === CHILD &&
        fxPublication.quotes.length === 70 &&
        fxPublication.registrations.length === 70,
      'EXACT_CHILD_FX_QUOTES_REQUIRED',
    );
    if (scope !== 'COLD_RUNTIME') {
      await stage('ACTUAL_ORIGINAL_REGISTRY_READBACK_NO_RUNTIME_VERSION_CLAIM');
      const originalCounts: Record<
        string,
        { count: string; wrongFingerprint: string }
      > = {};
      for (const table of [
        'social_operating_source_registration',
        'postwar_beneficial_rent_source',
        'finance_budget_mixed_social_original',
        'finance_budget_capacity_original',
        'captain_source_publication_registry',
        'postwar_day_one_fx_quote_original',
      ]) {
        const sql =
          table === 'postwar_day_one_fx_quote_original'
            ? "select count(*)::text as count,count(*)filter(where s.seed_fingerprint is distinct from $2 or q.quote_text::jsonb->>'seedFingerprint' is distinct from $2)::text as wrong_fingerprint from world_v2.postwar_day_one_fx_quote_original q join world_v2.postwar_day_one_fx_source_original s using(world_id) where q.world_id=$1"
            : `select count(*)::text as count,count(*)filter(where seed_fingerprint is distinct from $2)::text as wrong_fingerprint from world_v2.${table} where world_id=$1`;
        const r = await clone.installer.query<{
          count: string;
          wrong_fingerprint: string;
        }>(sql, [seed.worldId, CHILD]);
        must(
          r.rows[0]?.count === '70' && r.rows[0]?.wrong_fingerprint === '0',
          'EXACT_CHILD_REGISTRY_READBACK_' + table,
        );
        originalCounts[table] = {
          count: r.rows[0]!.count,
          wrongFingerprint: r.rows[0]!.wrong_fingerprint,
        };
      }
      const untouched = await clone.installer.query<{
        head: string;
        sequence: string;
        events: string;
        receipts: string;
        financial: string;
        inventory: string;
      }>(
        'select world_version::text as head,event_sequence::text as sequence,(select count(*)::text from world_v2.authoritative_event)as events,(select count(*)::text from world_v2.command_receipt)as receipts,(select count(*)::text from world_v2.financial_posting_batch)as financial,(select count(*)::text from world_v2.inventory_posting)as inventory from world_v2.world_head where world_id=$1',
        [seed.worldId],
      );
      must(
        untouched.rows.length === 1 &&
          Object.values(untouched.rows[0]!).every((v) => v === '0'),
        'ORIGINALS_ONLY_MUST_NOT_EXECUTE_WORLD',
      );
      const privileges = await clone.installer.query<{
        role: string;
        raw: boolean;
      }>(
        "select r as role,has_column_privilege(r,'world_v2.opening_seed','canonical_payload','SELECT')as raw from unnest($1::text[])r",
        [
          [
            workerRole,
            intakeRole,
            'world_v2_social_source_reader',
            'world_v2_finance_budget_source_reader',
            'world_v2_day_one_fx_source_reader',
            'world_v2_beneficial_rent_source_reader',
          ],
        ],
      );
      must(
        privileges.rows.every((r) => r.raw === false),
        'NO_ONLINE_RAW_SEED_GRANT',
      );
      const report = {
        classification:
          'ACTUAL_TEST_ONLY_CHILD_ORIGINAL_PUBLICATION_NOT_LATEST_RUNTIME_OR_CURRENT_WORLD_UPGRADE',
        childFingerprint: CHILD,
        parentFingerprint: PARENT,
        registrations: 70,
        financeSocialPublications: financePublication.results.length,
        captainPublications: captainPublication.publicationCount,
        fxQuotes: fxPublication.quotes.length,
        originalCounts,
        untouched: untouched.rows[0],
        privileges: privileges.rows,
        loadedFunctionBodies,
        loadedFunctionHashMeaning:
          'ACTUAL_EXECUTED_FUNCTION_BODY_NOT_TRANSITIVE_RUNTIME_TREE_SOURCE_VERSION',
        installedSql,
        baselineInstalledSql: marker.installedArtifacts,
        latestRuntimeAcceptance: 'NOT_RUN_CACHED_MODULE_GRAPH_UNPINNED',
        WorldClock: false,
        consumerStarted: false,
        productionAdmission: false,
        stages,
      };
      await writeFile(
        path.join(input.evidenceDirectory, 'result.json'),
        JSON.stringify(report, null, 2) + '\n',
      );
      if (scope === 'REGISTERED_FIXTURE') {
        must(
          marker && clone && token,
          'ACTUAL_INITIALIZED_CHILD_RESOURCES_REQUIRED',
        );
        registeredFixtureIssued = true;
        return Object.freeze({
          fixtureKind: 'ACTUAL_REGISTERED_CHILD_H0_FIXTURE' as const,
          marker,
          clone,
          workerRole,
          intakeRole,
          seed,
          preparation: token,
          countries: receipts.map((r) => ({ countryId: r.countryId })),
          financeSocialDerivation: financeDerivation,
          sourcePublications: {
            finance: financePublication,
            captain: captainPublication,
            fx: fxPublication,
          },
          initializedH0: report,
          installedSql,
          cleanup: cleanupOwned,
        });
      }
      return report;
    }
    const connect = (user: string) => {
      const p = new Pool({
        host: marker!.socket,
        port: marker!.port,
        database: clone!.database,
        user,
        password: async () => '',
        max: 1,
        ssl: false,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 1000,
      });
      p.on('error', (error) => idleErrors.push(error.message));
      pools.push(p);
      return p;
    };
    const workerPool = connect(workerRole),
      intakePool = connect(intakeRole);
    const raw = await clone.installer.query<{ raw: boolean }>(
      "select has_column_privilege($1,'world_v2.opening_seed','canonical_payload','SELECT')as raw union all select has_column_privilege($2,'world_v2.opening_seed','canonical_payload','SELECT')",
      [workerRole, intakeRole],
    );
    must(
      raw.rows.length === 2 && raw.rows.every((r) => r.raw === false),
      'ONLINE_ROLES_MUST_NOT_HAVE_RAW_SEED_SELECT',
    );
    await stage('ACTUAL_SHARED_CONTROLLER_RENT_AND_SOCIAL_CHILD_PREPARATION');
    const adoption = await loadPostwarSocialConnectionOpeningAdoption(
      input.repositoryRoot,
    );
    const social = createPostwarSocialRuntimeConnection({
      worldId: seed.worldId,
      workerId: 'WORKER_TEST_ONLY_RENT_CHILD',
      workerPool,
      workerRole,
      openingAdoption: adoption,
    });
    const clock = Object.freeze({
      nowReal: () => new Date().toISOString(),
      simTime: async () => '0',
    });
    shared = createPostwarFinanceSocialRuntimeConnection({
      socialConnection: social,
      capacitySource: createPostgresFinanceBudgetWorldCapacitySource({
        worldId: seed.worldId,
        countries: receipts.map((r) => ({ countryId: r.countryId })),
        historyMode: 'BUDGET_SOCIAL',
      }),
      intakePool,
      clock,
      environment: 'ci',
      treasuryFx: { workerRole },
      captain: { workerRole, mode: 'OFFICIAL_RUNTIME' },
      beneficialRent: { workerRole, clockBindingRef: 'TEST_ONLY_NO_DUE_GRANT' },
    });
    await shared.prepare(
      {
        observedAtReal: clock.nowReal(),
        admittedWorldPins: {
          worldId: seed.worldId,
          seedRef: seed.seedId,
          contentHash: seed.fingerprint,
          admissionRef: marker.admissionRef,
        },
        modelVersion: seed.replayBinding.modelVersion,
        startupSeed: seed,
        startupBeneficialHousingRentSource: token,
      },
      {
        seed,
        policyBytes,
        userReceiptBytes,
        startupBeneficialHousingRentSource: token,
      },
    );
    const ports = readPostwarFinanceSocialRuntimeBinding(shared),
      base = readPostwarSocialRuntimeFinancialReplayBase(social, seed.worldId),
      rent = ports.beneficialRent;
    must(
      base.pins.contentHash === CHILD &&
        base.pins.admissionRef === marker.admissionRef &&
        rent,
      'GENUINE_SOCIAL_ACTUAL_CHILD_BASE_REQUIRED',
    );
    const first = data.receipts[0]!,
      lease = first.leases[0]!;
    const current = await rent.readCurrentReceipt({
      countryId: first.countryId,
      leaseId: lease.leaseId,
      periodIndex: '0',
    });
    must(
      current.seedFingerprint === CHILD &&
        current.status === 'UNPAID' &&
        current.receipt === null &&
        current.head.worldVersion === '0' &&
        current.head.eventSequence === '0',
      'H0_UNPAID_READBACK_REQUIRED',
    );
    await stage('REAL_REVOCATION_REFUSES_CURRENT_READ_NO_READY_CACHE');
    await admin.transaction(async (tx) => {
      await tx.query(
        'set local role world_v2_beneficial_rent_source_publisher',
      );
      await tx.query(
        'select world_v2.revoke_postwar_beneficial_rent_source($1,$2,$3)',
        [seed.worldId, first.countryId, 'TEST_ONLY_CHILD_SOURCE_REVOKED'],
      );
    });
    let denied = false;
    try {
      await rent.readCurrentReceipt({
        countryId: first.countryId,
        leaseId: lease.leaseId,
        periodIndex: '0',
      });
    } catch (error) {
      const cause =
        error instanceof PostgresTransactionError &&
        error.outcome === 'ROLLED_BACK'
          ? error.cause
          : error;
      denied =
        cause instanceof DomainError &&
        cause.code === DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID;
    }
    must(denied, 'ACTUAL_REVOKED_SOURCE_MUST_REFUSE_READ');
    const counts = await clone.installer.query<{
      events: string;
      receipts: string;
      financial: string;
      inventory: string;
    }>(
      'select(select count(*)::text from world_v2.authoritative_event)as events,(select count(*)::text from world_v2.command_receipt)as receipts,(select count(*)::text from world_v2.financial_posting_batch)as financial,(select count(*)::text from world_v2.inventory_posting)as inventory',
    );
    must(
      counts.rows.length === 1 &&
        Object.values(counts.rows[0]!).every((n) => n === '0'),
      'NO_RUNTIME_EVENTS_OR_PAYMENTS_OR_INVENTORY_POSTINGS',
    );
    must(idleErrors.length === 0, 'NO_IDLE_POOL_ERRORS_REQUIRED');
    const report = {
      classification:
        'INDEPENDENT_TEST_ONLY_CHILD_ADMISSION_NOT_CURRENT_CFC_UPGRADE',
      childFingerprint: CHILD,
      parentFingerprint: PARENT,
      sources: 74,
      originalSources: 4,
      registrations: 70,
      financeSocialPublications: financePublication.results.length,
      captainPublications: captainPublication.publicationCount,
      fxQuotes: fxPublication.quotes.length,
      rawSeedDenied: true,
      current,
      revokedSourceDenied: denied,
      counts: counts.rows[0],
      WorldClock: false,
      consumerStarted: false,
      productionAdmission: false,
      offlineElapsedMs: Date.now() - started,
      maxRssKiB: process.resourceUsage().maxRSS,
      stages,
    };
    await writeFile(
      path.join(input.evidenceDirectory, 'result.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    return report;
  };
  let cleanupPromise: Promise<void> | undefined;
  const cleanupOwned = (): Promise<void> =>
    (cleanupPromise ??= (async () => {
      try {
        await shared?.stop();
      } catch (error) {
        cleanupErrors.push(String(error));
      }
      for (const p of pools)
        try {
          await p.end();
        } catch (error) {
          cleanupErrors.push(String(error));
        }
      const retain =
        input.retainOwnedCheckpointOnCleanup === true &&
        marker !== undefined &&
        clone !== undefined;
      let retained = false;
      if (retain && marker && clone && cleanupErrors.length === 0) {
        try {
          await loadPostwarNativeReferenceMarker(marker.markerPath);
          const sessions = await clone.installer.query<{ count: string }>(
            'select count(*)::text count from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()',
            [clone.database],
          );
          must(
            sessions.rows[0]?.count === '0',
            'NO_OTHER_OWNED_CLONE_CONNECTIONS_BEFORE_RETAIN',
          );
          const head = await clone.installer.query(
            'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
            [marker.worldId],
          );
          must(head.rows.length === 1, 'ACTUAL_CHECKPOINT_HEAD_REQUIRED');
          await clone.close();
          await sealPostwarReferenceClone(marker, clone.database);
          await run('docker', ['stop', '--time', '10', marker.ownedContainer], {
            maxBuffer: 1048576,
          });
          const state = await run(
            'docker',
            ['inspect', marker.ownedContainer, '--format', '{{json .State}}'],
            { maxBuffer: 1048576 },
          );
          const volume = await run(
            'docker',
            [
              'volume',
              'inspect',
              marker.pgDataStorage.name,
              '--format',
              '{{json .Labels}}',
            ],
            { maxBuffer: 1048576 },
          );
          const stoppedState = JSON.parse(state.stdout) as {
            Status: string;
            ExitCode: number;
            OOMKilled: boolean;
          };
          must(
            stoppedState.Status === 'exited' &&
              stoppedState.ExitCode === 0 &&
              stoppedState.OOMKilled === false &&
              (JSON.parse(volume.stdout) as Record<string, string>)[
                'econmind.reference.nonce'
              ] === marker.ownershipNonce,
            'ACTUAL_OWNED_STOPPED_CONTAINER_AND_VOLUME_REQUIRED',
          );
          const checkpoint = {
            resourceState: 'RETAINED_STOPPED',
            initializationState: registeredFixtureIssued
              ? 'FIXTURE_RETURNED'
              : 'INITIALIZATION_INTERRUPTED',
            recoverableDatabase: true,
            runtimeReady: false,
            containerState: stoppedState,
            classification:
              'TEST_ONLY_OWNED_DATABASE_STATE_NOT_RESTORED_AUTHORITY',
            ownedContainer: marker.ownedContainer,
            ownershipNonce: marker.ownershipNonce,
            volume: marker.pgDataStorage,
            markerPath: marker.markerPath,
            templateDatabase: clone.database,
            head: head.rows[0],
            allowConnections: false,
            isTemplate: true,
            restore: {
              startCommand: ['docker', 'start', marker.ownedContainer],
              helperModule: 'tests/support/postwar-native-reference-db.ts',
              steps: [
                'loadPostwarNativeReferenceMarker(markerPath) validates the actual owned nonce/container/volume',
                'clonePostwarNativeReference({...marker,database:templateDatabase}, newOwnedName) restores into a new disposable clone',
                'Node startup must issue its genuine proof anew; execution/actor/clock registrations must be checked or renewed by the controlled TEST_ONLY registrar. No runtime authority is restored from this JSON.',
              ],
            },
            cleanup: {
              container: ['docker', 'rm', '--force', marker.ownedContainer],
              volume: ['docker', 'volume', 'rm', marker.pgDataStorage.name],
              scope:
                'ONLY_THE_NONCE_MATCHED_CONTAINER_AND_VOLUME_CREATED_BY_THIS_FIXTURE',
            },
          };
          await writeFile(
            path.join(input.evidenceDirectory, 'retained-checkpoint.json'),
            JSON.stringify(checkpoint, null, 2) + '\n',
          );
          await writeFile(
            marker.markerPath,
            JSON.stringify(
              {
                ...marker,
                resourceState: 'RETAINED_STOPPED',
                initializationState: registeredFixtureIssued
                  ? 'FIXTURE_RETURNED'
                  : 'INITIALIZATION_INTERRUPTED',
                runtimeReady: false,
                recoverableDatabase: true,
                retainedCheckpoint: path.join(
                  input.evidenceDirectory,
                  'retained-checkpoint.json',
                ),
              },
              null,
              2,
            ) + '\n',
          );
          retained = true;
        } catch (error) {
          cleanupErrors.push(String(error));
          try {
            await clone.close();
          } catch (closeError) {
            cleanupErrors.push(String(closeError));
          }
        }
      } else if (!retain) {
        try {
          await clone?.drop();
        } catch (error) {
          cleanupErrors.push(String(error));
        }
      } else {
        // An earlier drain failed. Preserve the owned cluster for diagnosis,
        // close our inspection pools, and report UNCONFIRMED rather than delete.
        try {
          await clone?.close();
        } catch (error) {
          cleanupErrors.push(String(error));
        }
      }
      // The local fixture issued this token; after the sole owner drains it is
      // safe to retire once more, including failure before ownership transfer.
      if (createdToken && token) retireBeneficialHousingRentSource(token);
      if (marker && !retain) {
        try {
          await loadPostwarNativeReferenceMarker(marker.markerPath);
          await run('docker', ['rm', '--force', marker.ownedContainer], {
            maxBuffer: 1048576,
          });
          await run('docker', ['volume', 'rm', marker.pgDataStorage.name], {
            maxBuffer: 1048576,
          });
          await writeFile(
            marker.markerPath,
            JSON.stringify(
              {
                ...marker,
                baselineSealed: false,
                resourceState: 'DISPOSED',
                initializationState: registeredFixtureIssued
                  ? 'FIXTURE_RETURNED'
                  : 'INITIALIZATION_INTERRUPTED',
                runtimeReady: false,
                recoverableDatabase: false,
              },
              null,
              2,
            ) + '\n',
          );
        } catch (error) {
          cleanupErrors.push(String(error));
        }
      }
      if (!marker) {
        const owned = await readFile(
          path.join(input.evidenceDirectory, 'owned-container.json'),
          'utf8',
        ).catch(() => null);
        if (owned) {
          try {
            const metadata = JSON.parse(owned) as {
              ownedContainer: string;
              ownershipNonce: string;
              image: string;
              pgDataStorage: { name: string };
            };
            must(
              /^econmind-postwar-reference-[a-f0-9]{8}$/.test(
                metadata.ownedContainer,
              ) &&
                metadata.image === POSTWAR_REFERENCE_IMAGE &&
                /^econmind-postwar-reference-data-[a-f0-9]{8}$/.test(
                  metadata.pgDataStorage.name,
                ),
              'EXACT_OWNED_CLEANUP_SCOPE_REQUIRED',
            );
            const existing = await run(
              'docker',
              [
                'container',
                'ls',
                '-a',
                '--filter',
                'name=^/' + metadata.ownedContainer + '$',
                '--format',
                '{{.Names}}',
              ],
              { maxBuffer: 1048576 },
            );
            if (existing.stdout.trim()) {
              must(
                existing.stdout.trim() === metadata.ownedContainer,
                'EXACT_OWNED_CONTAINER_REQUIRED',
              );
              const inspected = await run(
                'docker',
                [
                  'inspect',
                  metadata.ownedContainer,
                  '--format',
                  '{{json .Config}}',
                ],
                { maxBuffer: 1048576 },
              );
              const config = JSON.parse(inspected.stdout) as {
                Image: string;
                Labels: Record<string, string>;
              };
              must(
                config.Image === POSTWAR_REFERENCE_IMAGE &&
                  config.Labels['econmind.reference.nonce'] ===
                    metadata.ownershipNonce,
                'ACTUAL_CONTAINER_NONCE_REQUIRED',
              );
              await run('docker', ['rm', '--force', metadata.ownedContainer], {
                maxBuffer: 1048576,
              });
            }
            const volumes = await run(
              'docker',
              [
                'volume',
                'ls',
                '--filter',
                'name=^' + metadata.pgDataStorage.name + '$',
                '--format',
                '{{.Name}}',
              ],
              { maxBuffer: 1048576 },
            );
            if (volumes.stdout.trim()) {
              must(
                volumes.stdout.trim() === metadata.pgDataStorage.name,
                'EXACT_OWNED_VOLUME_REQUIRED',
              );
              const inspected = await run(
                'docker',
                [
                  'volume',
                  'inspect',
                  metadata.pgDataStorage.name,
                  '--format',
                  '{{json .Labels}}',
                ],
                { maxBuffer: 1048576 },
              );
              must(
                (JSON.parse(inspected.stdout) as Record<string, string>)[
                  'econmind.reference.nonce'
                ] === metadata.ownershipNonce,
                'ACTUAL_VOLUME_NONCE_REQUIRED',
              );
              await run(
                'docker',
                ['volume', 'rm', metadata.pgDataStorage.name],
                {
                  maxBuffer: 1048576,
                },
              );
            }
          } catch (error) {
            cleanupErrors.push(String(error));
          }
        }
      }
      cleanupErrors.push(...idleErrors);
      await writeFile(
        path.join(input.evidenceDirectory, 'cleanup.json'),
        JSON.stringify(
          {
            complete: cleanupErrors.length === 0,
            resourceState: retained
              ? 'RETAINED_STOPPED'
              : cleanupErrors.length === 0
                ? 'DISPOSED'
                : 'UNCONFIRMED',
            recoverableDatabase: retained,
            errors: cleanupErrors,
          },
          null,
          2,
        ) + '\n',
      );
      if (cleanupErrors.length)
        throw new AggregateError(
          failed ? [originalFailure, ...cleanupErrors] : cleanupErrors,
          'Owned child fixture cleanup requires recovery',
          { cause: originalFailure },
        );
    })());
  let result: Awaited<ReturnType<typeof perform>> | undefined;
  try {
    result = await perform();
  } catch (error) {
    failed = true;
    originalFailure = error;
    const cause = error instanceof Error ? error.cause : undefined;
    await writeFile(
      path.join(input.evidenceDirectory, 'failure.json'),
      JSON.stringify(
        {
          name: error instanceof Error ? error.name : 'UNKNOWN',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : null,
          cause:
            cause instanceof Error
              ? { name: cause.name, message: cause.message, stack: cause.stack }
              : null,
          stages,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    if (scope !== 'REGISTERED_FIXTURE' || failed) await cleanupOwned();
  }
  if (cleanupErrors.length)
    throw new AggregateError(
      failed ? [originalFailure, ...cleanupErrors] : cleanupErrors,
      'Owned child fixture cleanup requires recovery',
      { cause: originalFailure },
    );
  if (failed) throw originalFailure;
  must(result, 'ACTUAL_REHEARSAL_RESULT_REQUIRED');
  if (scope === 'SOURCE_PUBLICATION_ONLY' && token) {
    // The fixed caller explicitly hands successful rehearsal ownership over.
    // Every SQL operation and owned-resource cleanup has now drained. Failed
    // publication/cleanup never reaches this branch and keeps borrowed proof.
    retireBeneficialHousingRentSource(token);
    await writeFile(
      path.join(input.evidenceDirectory, 'token-lifecycle.json'),
      JSON.stringify(
        {
          owner: 'TEST_ONLY_SOURCE_REHEARSAL',
          retiredAfterSuccessfulPublicationAndCleanup: true,
          runtimeStarted: false,
        },
        null,
        2,
      ) + '\n',
    );
  }
  return result;
}
