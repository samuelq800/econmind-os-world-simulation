/** Opt-in TEST_ONLY new Captain scenario over an owned, empty-history cfc clone.
 * The adopted 70-point policy is real; World/admission/registrar remain test-only.
 * No sealed database, canonical seed, source cash, Clock or host is replaced. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import * as C from '@econmind/core';
import type { ManualOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import { createPostwarFinanceSocialFxNativeFixture } from './postwar-finance-social-fx-native-fixture.js';
import {
  deriveCfcMixedCurrentReadData,
  installCfcMixedCurrentReadbackFrom,
} from './postwar-mixed-current-native-readback.js';
import { readPostwarFinanceSocialRuntimeBinding } from '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js';
import {
  loadAdoptedCaptainOpeningPolicy,
  createAdoptedCaptainOpeningCandidate,
  withAdoptedCaptainNewScenarioFrom,
  publishAdoptedCaptainNewScenarioFrom,
  readbackAdoptedCaptainNewScenarioFrom,
} from '../../apps/world-worker/src/preparation/postwar-captain-opening-source.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { loadPostwarSocialConnectionOpeningAdoption } from '../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js';
import { createPostgresFinanceBudgetWorldCapacitySource } from '../../apps/world-worker/dist/persistence/postgres-finance-budget-capacity-source.js';
import { startPostwarOfficeNodeBootstrap } from '../../apps/world-api/src/runtime/postwar-office-node-bootstrap.js';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
} from './postwar-native-reference-db.js';
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ident = (s: string) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(s)) throw Error('OWNED_ROLE_REQUIRED');
  return '"' + s + '"';
};
export async function createPostwarOfficeNodeBootstrapCaptainNativeFixture(
  evidenceDirectory: string,
) {
  if (process.env.ECONMIND_POSTWAR_OFFICE_NODE_CAPTAIN_NATIVE !== '1')
    throw Error('EXPLICIT_CAPTAIN_NATIVE_OPT_IN_REQUIRED');
  // Missing cache is BLOCKED, never permission to create another world/volume.
  await readFile(
    '/workspace/.cloud-setup/evidence/fx-cfc-runtime-20261029/reference-db.json',
  );
  const f = await createPostwarFinanceSocialFxNativeFixture({
    evidenceDirectory,
  });
  type Readback = Awaited<
    ReturnType<typeof installCfcMixedCurrentReadbackFrom>
  >;
  let readback: Readback | undefined,
    host:
      Awaited<ReturnType<typeof startPostwarOfficeNodeBootstrap>> | undefined;
  const installed: Record<string, string> = {};
  let beforeRoles: string[] | undefined;
  let cleanupPromise: Promise<unknown> | undefined;
  const cleanup = () =>
    (cleanupPromise ??= (async () => {
      const errors: unknown[] = [];
      try {
        await host?.shutdown();
      } catch (e) {
        errors.push(e);
      }
      try {
        await readback?.close();
      } catch (e) {
        errors.push(e);
      }
      // The database is still owned by this test, so record its new fixed roles
      // before dropping it. No other native test may install cluster roles here.
      let additional: string[] = [];
      try {
        if (beforeRoles)
          additional = (
            await f.clone.installer.query<{ rolname: string }>(
              "select rolname from pg_roles where rolname like 'world_v2_%'",
            )
          ).rows
            .map((r) => r.rolname)
            .filter((n) => !beforeRoles?.includes(n));
      } catch (e) {
        errors.push(e);
      }
      try {
        await f.cleanup();
      } catch (e) {
        errors.push(e);
      }
      const admin = new Pool({
        host: f.marker.socket,
        port: f.marker.port,
        database: 'postgres',
        user: 'postgres',
        password: async () => '',
        ssl: false,
        max: 1,
      });
      admin.on('error', () => undefined);
      try {
        for (const name of additional.reverse())
          await admin.query('drop role if exists ' + ident(name));
        const resources = (
          await admin.query(
            `select
        exists(select 1 from pg_database where datname=$1)owned_clone_exists,
        (select count(*)::text from pg_roles where rolname=any($2::text[]))owned_roles,
        (select count(*)::text from pg_stat_activity where datname=$1)owned_sessions,
        exists(select 1 from pg_database where datname=$3 and datistemplate and not datallowconn)sealed_baseline_preserved`,
            [
              f.clone.database,
              [
                f.workerRole,
                f.intakeRole,
                f.readRole,
                f.sourceRole,
                ...additional,
              ],
              f.marker.database,
            ],
          )
        ).rows[0];
        if (errors.length)
          throw new AggregateError(errors, 'CAPTAIN_NODE_OWNED_CLEANUP_FAILED');
        return resources;
      } finally {
        await admin.end();
      }
    })());
  try {
    beforeRoles = (
      await f.clone.installer.query<{ rolname: string }>(
        'select rolname from pg_roles',
      )
    ).rows.map((r) => r.rolname);
    const install = async (name: string) => {
      const sql = await readFile(
        path.join(root, 'database/proposals', name + '.sql'),
        'utf8',
      );
      await f.clone.installer.query(sql);
      installed[name] = sha(sql);
    };
    for (const n of [
      'captain-operating-custody',
      'postwar-captain-source-publication',
      'postwar-captain-mixed-read',
    ])
      await install(n);
    const counts = async () =>
      (
        await f.clone.installer.query(
          `select h.world_version::text version,h.event_sequence::text sequence,
      (select count(*)::text from world_v2.command_submission where world_id=$1)commands,
      (select count(*)::text from world_v2.command_receipt where world_id=$1)receipts,
      (select count(*)::text from world_v2.authoritative_event where world_id=$1)events,
      (select count(*)::text from world_v2.financial_posting_batch where world_id=$1)batches,
      (select count(*)::text from world_v2.inventory_posting where world_id=$1)inventory,
      (select count(*)::text from world_v2.command_queue where world_id=$1)queues
      from world_v2.world_head h where h.world_id=$1`,
          [f.marker.worldId],
        )
      ).rows[0];
    const initial = await counts();
    if (!initial || Object.entries(initial).some(([, v]) => v !== '0'))
      throw Error('NEW_ISOLATED_SCENARIO_REQUIRES_EMPTY_H0');
    const policy = await loadAdoptedCaptainOpeningPolicy(root),
      oldPorts = readPostwarFinanceSocialRuntimeBinding(f.connection);
    const registrar = new Pool({
      host: f.marker.socket,
      port: f.marker.port,
      database: f.clone.database,
      user: f.marker.roles.registrarRole,
      password: async () => '',
      ssl: false,
      max: 1,
    });
    registrar.on('error', (e) => f.idleErrors.push(e.message));
    const registration = new PostgresSqlDatabase(registrar);
    const opening = await (async () => {
      try {
        const opening = await registration.transaction(async (tx) => {
          await tx.query('set local role world_v2_admission_release');
          return withAdoptedCaptainNewScenarioFrom(
            tx,
            {
              policy,
              worldId: f.marker.worldId,
              social: oldPorts.socialConnection,
            },
            async (candidate) => ({
              candidate,
              result: await publishAdoptedCaptainNewScenarioFrom(tx, candidate),
            }),
          );
        });
        const exact = await registration.transaction(async (tx) => {
          await tx.query('set local role world_v2_admission_release');
          return readbackAdoptedCaptainNewScenarioFrom(
            tx,
            policy,
            opening.candidate,
          );
        });
        if (
          exact.status !== 'ALREADY_PUBLISHED' ||
          exact.publicationCount !== 70
        )
          throw Error('EXACT_SEVENTY_ADOPTED_ORIGINALS_REQUIRED');
        return opening;
      } finally {
        await registrar.end();
      }
    })();
    const packet = opening.candidate.packets.find(
      (p) => p.adoption.countryId === f.marker.countryId,
    );
    if (!packet?.reasons[0]) throw Error('ACTUAL_CAPTAIN_REASON_REQUIRED');
    const identity = (
      await f.clone.installer.query(
        `select a.team_id,a.authorization_version from world_v2.current_commit_authorization a join world_v2.runtime_read_seat s on s.world_id=a.world_id and s.auth_subject=a.auth_subject and s.country_id=a.country_id and s.office_id=a.office_id and s.team_id=a.team_id and s.authorization_revision=a.authorization_version join world_v2.projection_entitlement e on e.world_id=a.world_id and e.auth_subject=a.auth_subject and e.authorization_version=a.authorization_version and e.classification='OFFICE_PRIVATE' and e.scope_key='OFFICE_'||upper(encode(convert_to(a.country_id,'UTF8'),'hex'))||'_'||upper(encode(convert_to(a.office_id,'UTF8'),'hex')) and e.active and e.revoked_at is null where a.world_id=$1 and a.auth_subject=$2::uuid and a.country_id=$3 and a.office_id='CAPTAIN' and a.capability='CAPTAIN_CABINET' and a.active`,
        [f.marker.worldId, f.marker.subject, f.marker.countryId],
      )
    ).rows;
    if (identity.length !== 1 || identity[0].team_id !== f.marker.team)
      throw Error('EXISTING_TEST_ONLY_CAPTAIN_IDENTITY_REQUIRED');
    // The baseline already has the actor's Captain capability; this adds only
    // the fixed function protocol to these clone-owned Worker/intake logins.
    await f.clone.installer.query(
      'grant world_v2_captain_source_reader to ' +
        ident(f.workerRole) +
        ',' +
        ident(f.intakeRole),
    );
    const started = performance.now();
    host = await (async () => {
      const seed = C.parseOpeningSeed(
        JSON.parse(await readFile(f.artifacts.seedFile, 'utf8')),
        sha,
      );
      readback = await installCfcMixedCurrentReadbackFrom(
        f,
        deriveCfcMixedCurrentReadData({
          seed,
          admissionRef: f.marker.admissionRef,
          canonicalSeedSHA256: String(f.header.canonical_intent_sha256),
        }),
      );
      for (const n of [
        'postwar-office-recovery-read',
        'postwar-captain-intake-binding',
        'postwar-captain-current-derived-read',
      ])
        await install(n);
      await f.connection.stop(); // Never started. New bootstrap is sole owner.
      const [policyBytes, userReceiptBytes, openingAdoption] =
        await Promise.all([
          readFile(
            path.join(root, 'config/postwar-genesis/day-one-fx.v1.json'),
            'utf8',
          ),
          readFile(
            path.join(
              root,
              'docs/governance/owner-inputs/2026-10-29/DAY_ONE_FX_USER_ADOPTION.original.json',
            ),
            'utf8',
          ),
          loadPostwarSocialConnectionOpeningAdoption(root),
        ]);
      return startPostwarOfficeNodeBootstrap({
        api: {
          environment: 'ci',
          host: '127.0.0.1',
          port: 0,
          shutdownGraceMs: 5000,
        },
        social: {
          environment: 'ci',
          boundedReadPool: f.readPool,
          intakePool: f.intakePool,
          sourcePool: f.sourcePool,
          workerPool: f.worker,
          boundedReaderRole: f.readRole,
          sourceReaderRole: f.sourceRole,
          intakeRole: f.intakeRole,
          workerRole: f.workerRole,
          authorizationPublisherRole: f.marker.roles.authorizationPublisherRole,
          workerId: f.workerId,
          openingAdoption,
          admittedWorldPins: readback.readConfiguration.admittedWorldPins,
          modelVersion: C.WORLD_MODEL_VERSION,
          auth: readback.readConfiguration.auth,
          clock: f.clock,
          allowedOrigins: ['https://pages-test.example'],
          resolveActorId: async (subject: string) =>
            subject === f.marker.subject ? 'ACTOR_TEST_ONLY_MIXED_FX' : null,
        },
        capacitySource: createPostgresFinanceBudgetWorldCapacitySource({
          worldId: f.marker.worldId,
          countries: [
            {
              countryId: f.marker.countryId,
              expectedRawSourceSHA256: f.provenance.capacitySourceSHA256,
            },
          ],
          historyMode: 'BUDGET_SOCIAL',
        }),
        startupSeed: seed,
        treasuryFx: { preparation: { seed, policyBytes, userReceiptBytes } },
        captain: { mode: 'OFFICIAL_RUNTIME' },
        publicationDatabase: readback.publicationDatabase,
        read: readback.readConfiguration,
      });
    })();
    const server = host,
      jwt = readback!,
      nonce = randomBytes(5).toString('hex').toUpperCase();
    const request = (
      name: string,
      officeId: ManualOfficeCommandRequestDto['officeId'],
      commandType: ManualOfficeCommandRequestDto['commandType'],
      version: string,
      payload: unknown,
    ) => ({
      schemaVersion: 'world-authenticated-office-command-v1' as const,
      requestId: randomUUID(),
      request: {
        worldId: f.marker.worldId,
        countryId: f.marker.countryId,
        officeId,
        commandType,
        commandId: 'COMMAND_NODE_CAPTAIN_' + name + '_' + nonce,
        idempotencyKey: 'KEY_NODE_CAPTAIN_' + name + '_' + nonce,
        expectedWorldVersion: version,
        payload,
      },
    });
    const p = f.c01Policy;
    const envelopes = [
      request(
        'BUDGET',
        'FINANCE',
        'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
        '0',
        {
          operation: 'SET_ENVELOPE',
          scope: {
            worldId: f.marker.worldId,
            countryId: f.marker.countryId,
            entityRef: p.governmentEntityId,
            envelopeRef: p.envelopeRef,
            effectivePeriodRef: p.effectivePeriodRef,
          },
          currency: p.currency,
          amount: '1000',
          envelopeRevisionRef: 'REV_NODE_CAPTAIN_' + nonce,
          lineRef: null,
          revisionRef: 'REV_NODE_CAPTAIN_' + nonce,
          predecessorRevisionRef: null,
        },
      ),
      request('FX', 'FINANCE', 'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1', '1', {
        schemaVersion: 'postwar-day-one-treasury-fx-command-v1',
        quoteRef: f.fxQuote.quoteRef,
        payerTreasuryAccountId: f.fxTreasuryAccountId,
        payerGcuAccountId: f.fxGovernmentGcuAccountId,
        dealerGcuAccountId: f.fxBankGcuAccountId,
        localAmount: '100',
        localCurrency: f.fxQuote.localCurrency,
        expectedQuoteSha256: f.fxQuote.quoteSha256,
      }),
      request(
        'CAPTAIN',
        'CAPTAIN',
        'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1',
        '2',
        {
          schemaVersion: 'captain-political-capital-allocation-v1',
          fromBucket: 'FISCAL_REFORM',
          toBucket: 'INDUSTRIAL_STRATEGY',
          amount: { amount: '2.75', unit: 'political_capital' },
          reasonFactRef: packet.reasons[0].factRef,
        },
      ),
    ];
    const metrics: {
      route: string;
      status: number;
      bytes: number;
      elapsedMs: number;
    }[] = [];
    const call = async (
      route: string,
      body: unknown,
      subject = f.marker.subject,
    ) => {
      const start = performance.now(),
        response = await fetch(server.origin + route, {
          method: 'POST',
          headers: {
            origin: 'https://pages-test.example',
            authorization: jwt.token(subject),
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        }),
        text = await response.text();
      metrics.push({
        route,
        status: response.status,
        bytes: Buffer.byteLength(text),
        elapsedMs: performance.now() - start,
      });
      return {
        status: response.status,
        body: JSON.parse(text) as Record<string, unknown>,
      };
    };
    const page = (officeId: string, dataset: string) =>
      call('/v1/postwar-office-runtime', {
        schemaVersion: 'postwar-office-runtime-read-v1',
        requestId: randomUUID(),
        operation: 'READ_CURRENT_OFFICE_OPENING',
        officeId,
        dataset,
        page: { offset: 0, limit: 25 },
      });
    return {
      fixture: f,
      host: server,
      envelopes,
      call,
      page,
      counts,
      initial,
      cleanup,
      metrics,
      installed,
      startupMs: performance.now() - started,
      opening: {
        publicationCount: opening.result.publicationCount,
        fingerprint: opening.candidate.fingerprint,
        policySha256: opening.candidate.policySha256,
        adoptionReceiptSha256: opening.candidate.adoptionReceiptSha256,
      },
      token: jwt.token,
    };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'CAPTAIN_NODE_FIXTURE_FAILED_AND_CLEANUP_FAILED',
        { cause: cleanupError },
      );
    }
    throw error;
  }
}

/** Cheap SQL contract only: no Social startup/full seed parsing or consumer.
 * The candidate is DATA from the adopted policy and the existing actual cfc
 * bank-roster verification; this does not issue the genuine Social scope. */
export async function verifyPostwarCaptainReleaseNativeContract(): Promise<
  Record<string, unknown>
> {
  if (process.env.ECONMIND_POSTWAR_CAPTAIN_RELEASE_CONTRACT_NATIVE !== '1')
    throw Error('EXPLICIT_RELEASE_CONTRACT_OPT_IN_REQUIRED');
  const marker = await loadPostwarNativeReferenceMarker(
    '/workspace/.cloud-setup/evidence/fx-cfc-runtime-20261029/reference-db.json',
  );
  const clone = await clonePostwarNativeReference(marker, 'captain_release');
  const fixed = [
    'world_v2_captain_source_owner',
    'world_v2_captain_source_reader',
  ];
  let registrar: Pool | undefined;
  const before = (
    await clone.installer.query<{ rolname: string }>(
      'select rolname from pg_roles where rolname=any($1::text[])',
      [fixed],
    )
  ).rows.map((r) => r.rolname);
  const report: Record<string, unknown> = {
    classification:
      'ACTUAL_LOW_PRIVILEGE_RELEASE_SQL_CONTRACT_NOT_FULL_SOCIAL_PREPARATION',
    worldId: marker.worldId,
    seedFingerprint: marker.seedFingerprint,
    admissionRef: marker.admissionRef,
    clone: clone.database,
    checks: [],
  };
  const checks = report.checks as string[];
  const leaf = (
    v: unknown,
    code: string,
    message: string,
    seen = new WeakSet<object>(),
    depth = 0,
  ): boolean => {
    if (!v || typeof v !== 'object' || depth > 12 || seen.has(v)) return false;
    seen.add(v);
    const e = v as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
      errors?: unknown;
    };
    return (
      (e.code === code && e.message === message) ||
      leaf(e.cause, code, message, seen, depth + 1) ||
      (Array.isArray(e.errors) &&
        e.errors.some((x) => leaf(x, code, message, seen, depth + 1)))
    );
  };
  const denied = async (
    run: () => Promise<unknown>,
    code: string,
    message: string,
  ) => {
    let caught = false;
    try {
      await run();
    } catch (e) {
      if (!leaf(e, code, message))
        throw new Error('UNEXPECTED_SQL_DENIAL:' + code + ':' + message, {
          cause: e,
        });
      caught = true;
    }
    assert.ok(caught, 'Required SQL denial did not occur');
    checks.push(code + ':' + message);
  };
  try {
    const installed: Record<string, string> = {};
    for (const name of [
      'captain-operating-custody',
      'postwar-captain-source-publication',
    ]) {
      const raw = await readFile(
        path.join(root, 'database/proposals', name + '.sql'),
        'utf8',
      );
      await clone.installer.query(raw);
      installed[name] = sha(raw);
    }
    report.installed = installed;
    const rawRoster = await readFile(
      '/workspace/.cloud-setup/evidence/postwar-gcu-opening-fresh-20261029T020748Z/actual-bank-ledger-verification.json',
      'utf8',
    );
    assert.equal(
      sha(rawRoster),
      'd212bf68fed77b41ec446b35c23b4e3014566fce871c8a9aae38379797d6237a',
    );
    const roster = JSON.parse(rawRoster) as {
      seedFingerprint: string;
      worldId: string;
      seedId: string;
      countries: { actualCashPosition: { account: { countryId: string } } }[];
    };
    assert.equal(roster.seedFingerprint, marker.seedFingerprint);
    assert.equal(roster.worldId, marker.worldId);
    assert.equal(roster.seedId, marker.seedId);
    const policy = await loadAdoptedCaptainOpeningPolicy(root),
      candidate = createAdoptedCaptainOpeningCandidate(policy, {
        worldId: marker.worldId,
        seedId: marker.seedId,
        seedFingerprint: marker.seedFingerprint,
        worldAdmissionRef: marker.admissionRef,
        countryIds: roster.countries.map(
          (c) => c.actualCashPosition.account.countryId,
        ),
      });
    report.policySha256 = candidate.policySha256;
    report.candidateFingerprint = candidate.fingerprint;
    registrar = new Pool({
      host: marker.socket,
      port: marker.port,
      database: clone.database,
      user: marker.roles.registrarRole,
      password: async () => '',
      ssl: false,
      max: 1,
    });
    registrar.on('error', () => undefined);
    const db = new PostgresSqlDatabase(registrar);
    const release = <T>(fn: Parameters<typeof db.transaction<T>>[0]) =>
      db.transaction(async (tx) => {
        await tx.query('set local role world_v2_admission_release');
        return fn(tx);
      });
    const scope =
      'select * from world_v2.read_captain_new_scenario_opening_scope($1,$2,$3)';
    const pins = [marker.worldId, marker.seedFingerprint, marker.admissionRef];
    const roles = await release((tx) =>
      tx.query('select session_user,current_user'),
    );
    assert.equal(roles.rows[0]?.session_user, marker.roles.registrarRole);
    assert.equal(roles.rows[0]?.current_user, 'world_v2_admission_release');
    report.actualIdentity = roles.rows[0];
    checks.push('ACTUAL_NONOWNER_RELEASE_SESSION');
    const visibility = await clone.installer.query(
      "select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2'and c.relname=any($1::text[])order by c.relname",
      [['runtime_opening_admission', 'runtime_read_seat', 'opening_seed']],
    );
    assert.ok(visibility.rows.every((r) => r.relrowsecurity === true));
    report.baselineRLS = visibility.rows;
    const acl = await clone.installer.query(
      "select r,has_column_privilege(r,'world_v2.runtime_read_seat','world_id','SELECT')world_col,has_column_privilege(r,'world_v2.runtime_read_seat','auth_subject','SELECT')subject_col,has_column_privilege(r,'world_v2.runtime_read_seat','country_id','SELECT')country_col,has_table_privilege(r,'world_v2.runtime_read_seat','SELECT')whole_table,has_column_privilege(r,'world_v2.opening_seed','canonical_payload','SELECT')raw_seed from unnest($1::text[])r",
      [[...fixed, 'world_v2_admission_release']],
    );
    for (const r of acl.rows) {
      assert.equal(r.whole_table, false);
      assert.equal(r.raw_seed, false);
      assert.equal(r.world_col, r.r === 'world_v2_captain_source_owner');
      assert.equal(r.subject_col, r.r === 'world_v2_captain_source_owner');
      assert.equal(r.country_col, false);
    }
    report.actualACL = acl.rows;
    checks.push('TWO_OWNER_METADATA_COLUMNS_ONLY_NO_RUNTIME_RAW_SEED');
    const unsetRoleAcl = (
      await clone.installer.query<{
        schema_usage: boolean;
        function_execute: boolean;
      }>(
        "select has_schema_privilege($1,'world_v2','USAGE')schema_usage,has_function_privilege($1,'world_v2.read_captain_new_scenario_opening_scope(text,text,text)','EXECUTE')function_execute",
        [marker.roles.registrarRole],
      )
    ).rows[0]!;
    report.unsetRoleAcl = unsetRoleAcl;
    // NOINHERIT principals can fail at schema/EXECUTE before entering the fixed
    // role predicate. Derive the precise barrier from actual catalog ACLs;
    // never turn an arbitrary 42501 or operational error into this negative.
    await denied(
      () => db.transaction((tx) => tx.query(scope, pins)),
      '42501',
      !unsetRoleAcl.schema_usage
        ? 'permission denied for schema world_v2'
        : !unsetRoleAcl.function_execute
          ? 'permission denied for function read_captain_new_scenario_opening_scope'
          : 'CAPTAIN_NEW_SCENARIO_CONTROLLED_RELEASE_REQUIRED',
    );
    const fresh = await release((tx) => tx.query(scope, pins));
    assert.equal(fresh.rows[0]?.seed_id, marker.seedId);
    checks.push('EXACT_RELEASE_SCOPE_WITH_BASELINE_PUBLIC_RLS');
    assert.equal(
      (
        await release((tx) =>
          readbackAdoptedCaptainNewScenarioFrom(tx, policy, candidate),
        )
      ).status,
      'NOT_PUBLISHED',
    );
    checks.push('EMPTY_NEW_SCENARIO_READBACK');
    await denied(
      () =>
        release((tx) =>
          tx.query(scope, [
            marker.worldId,
            'sha256:' + '0'.repeat(64),
            marker.admissionRef,
          ]),
        ),
      '55000',
      'CAPTAIN_NEW_SCENARIO_ADMISSION_REQUIRED',
    );
    await denied(
      () =>
        release((tx) =>
          tx.query(scope, [
            marker.worldId,
            marker.seedFingerprint,
            'ADMISSION_TEST_ONLY_WRONG',
          ]),
        ),
      '55000',
      'CAPTAIN_NEW_SCENARIO_ADMISSION_REQUIRED',
    );
    await denied(
      () =>
        release((tx) =>
          tx.query(scope, [
            'WORLD_TEST_ONLY_UNKNOWN',
            marker.seedFingerprint,
            marker.admissionRef,
          ]),
        ),
      '55000',
      'CAPTAIN_FRESH_UNEXECUTED_UNINITIALIZED_SCENARIO_REQUIRED',
    );
    await denied(
      () =>
        release((tx) =>
          tx.query(
            'select * from world_v2.captain_source_publication_registry',
          ),
        ),
      '42501',
      'permission denied for table captain_source_publication_registry',
    );
    const publish = async (
      tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
      packet: (typeof candidate.packets)[number],
    ) => {
      const text = C.canonicalSerialize(packet);
      await tx.query(
        'select world_v2.register_captain_source_publication($1,$2)',
        [text, sha(text)],
      );
      await tx.query(
        'select * from world_v2.publish_captain_operating_source($1,$2)',
        [text, sha(text)],
      );
    };
    await denied(
      () =>
        release(async (tx) => {
          await publish(tx, candidate.packets[0]!);
          return readbackAdoptedCaptainNewScenarioFrom(tx, policy, candidate);
        }),
      '23514',
      'CAPTAIN_RECOVERY_PARTIAL_OR_DIFFERENT_INITIALIZATION',
    );
    assert.equal(
      (
        await release((tx) =>
          readbackAdoptedCaptainNewScenarioFrom(tx, policy, candidate),
        )
      ).status,
      'NOT_PUBLISHED',
    );
    checks.push('FAILED_PARTIAL_TRANSACTION_ROLLED_BACK');
    await release(async (tx) => {
      for (const packet of candidate.packets) await publish(tx, packet);
    });
    const complete = await release((tx) =>
      readbackAdoptedCaptainNewScenarioFrom(tx, policy, candidate),
    );
    assert.equal(complete.publicationCount, 70);
    assert.equal(complete.status, 'ALREADY_PUBLISHED');
    checks.push(
      'SEVENTY_REAL_POLICY_REGISTER_PUBLISH_COMMIT_AND_FRESH_RECOVERY',
    );
    await denied(
      () => release((tx) => tx.query(scope, pins)),
      '55000',
      'CAPTAIN_FRESH_UNEXECUTED_UNINITIALIZED_SCENARIO_REQUIRED',
    );
    const changed = candidate.packets.map((p, i) => ({
      countryId: p.adoption.countryId,
      adoptionRef: p.adoption.adoptionRef,
      packetSha256: i === 0 ? '0'.repeat(64) : sha(C.canonicalSerialize(p)),
    }));
    await denied(
      () =>
        release((tx) =>
          tx.query(
            'select * from world_v2.read_captain_opening_publication_readback($1,$2,$3,$4)',
            [...pins, C.canonicalSerialize(changed)],
          ),
        ),
      '23514',
      'CAPTAIN_RECOVERY_EXACT_UNREVOKED_INITIALIZATION_REQUIRED',
    );
    await clone.installer.query(
      'insert into world_v2.captain_operating_source_revocation(adoption_ref,reason_ref)values($1,$2)',
      [
        candidate.packets[0]!.adoption.adoptionRef,
        'TEST_ONLY_RELEASE_CONTRACT_REVOKED',
      ],
    );
    await denied(
      () =>
        release((tx) =>
          readbackAdoptedCaptainNewScenarioFrom(tx, policy, candidate),
        ),
      '23514',
      'CAPTAIN_RECOVERY_EXACT_UNREVOKED_INITIALIZATION_REQUIRED',
    );
    const counts = (
      await clone.installer.query(
        'select(select count(*)from world_v2.captain_operating_source_adoption)adoptions,(select count(*)from world_v2.captain_operating_original)originals,(select count(*)from world_v2.command_submission where world_id=$1)commands,(select count(*)from world_v2.authoritative_event where world_id=$1)events,(select count(*)from world_v2.financial_posting_batch where world_id=$1)batches',
        [marker.worldId],
      )
    ).rows[0];
    assert.equal(Number(counts?.adoptions), 70);
    assert.equal(Number(counts?.originals), 140);
    assert.equal(Number(counts?.commands), 0);
    assert.equal(Number(counts?.events), 0);
    assert.equal(Number(counts?.batches), 0);
    report.counts = counts;
    report.status = 'PASSED';
    return report;
  } catch (error) {
    report.status = 'FAILED';
    throw Object.assign(
      error instanceof Error ? error : new Error(String(error)),
      { releaseContractReport: report },
    );
  } finally {
    await registrar?.end();
    await clone.drop();
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
      for (const r of fixed.filter((n) => !before.includes(n)))
        await admin.query('drop role if exists ' + ident(r));
      report.cleanup = (
        await admin.query(
          'select exists(select 1 from pg_database where datname=$1)owned_clone_exists,(select count(*)::text from pg_stat_activity where datname=$1)owned_sessions,exists(select 1 from pg_database where datname=$2 and datistemplate and not datallowconn)sealed_baseline_preserved',
          [clone.database, marker.database],
        )
      ).rows[0];
    } finally {
      await admin.end();
    }
  }
}
