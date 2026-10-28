/** Actual isolated c427 seed, cold preparation, JWT/JWKS, owned HTTP and
 * Chromium transport evidence. No production enrollment, Clock or secret key
 * persistence. The 180s case budget includes offline full-source preparation;
 * each live request retains the real 10s handler/client budget. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import {
  createHash,
  randomBytes,
  randomUUID,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { fork, type ChildProcess } from 'node:child_process';
import { Pool } from 'pg';
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_PATH,
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
} from '@econmind/core/authenticated-office-command-contract';
import {
  FINANCE_NATIVE_BUDGET_RULE,
  type FinanceNativeBudgetPolicy,
} from '@econmind/core/finance-budget-native';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
} from '../support/postwar-native-reference-db.js';
import { createBoundedOfficeCommandFetchHandler } from '../../apps/world-api/src/integration/bounded-office-command-fetch-handler.js';
import {
  createPostwarCurrentSeatFetchHandler,
  POSTWAR_OFFICE_RUNTIME_READ_PATH,
} from '../../apps/world-api/src/runtime-preparation/postwar-office-runtime-fetch-handler.js';
const requireApi = createRequire(
  new URL('../../apps/world-api/package.json', import.meta.url),
);
const {
  createPreparedFinanceBudgetIntakeRuntime,
  createBoundedFinanceBudgetIntakeRuntime,
  createPostgresFinanceBudgetCapacitySource,
  createFinanceBudgetAuthorizationDatabase,
  createFinanceBudgetIntakeAuthorizationPool,
  preparePostgresFinanceBudgetSource,
  PostgresSqlDatabase,
} = (await import(
  requireApi.resolve('@econmind/world-worker/finance-budget-runtime')
)) as typeof import('../../apps/world-worker/dist/runtime-preparation/finance-budget-runtime-exports.js');
const { OFFICE_COMMAND_CURRENT_BINDING_QUERY } = (await import(
  requireApi.resolve('@econmind/world-worker/office-command-intake')
)) as typeof import('../../apps/world-worker/dist/intake/postgres-office-command-intake.js');
const durableCapacity = process.env.ECONMIND_BUDGET_CAPACITY_DURABLE === '1';
const evidenceDirectory = durableCapacity
  ? '/workspace/.cloud-setup/evidence/postwar-native-budget-capacity-http-20261028'
  : '/workspace/.cloud-setup/evidence/postwar-native-budget-http-next-20261028';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const native =
  process.env.ECONMIND_POSTWAR_BUDGET_HTTP_NATIVE === '1'
    ? describe
    : describe.skip;
describe('bounded Office command Fetch defaults', () => {
  it('keeps both fixed paths closed and leaves unrelated routes unmounted', async () => {
    const handler = createBoundedOfficeCommandFetchHandler();
    for (const path of [
      AUTHENTICATED_OFFICE_COMMAND_PATH,
      C.AUTHENTICATED_COMMAND_RECOVERY_PATH,
    ])
      expect(
        (await handler(new Request('https://read.example' + path))).status,
      ).toBe(503);
    expect(
      (await handler(new Request('https://read.example/unrelated'))).status,
    ).toBe(404);
  });
});
native('actual prepared Budget native HTTP TEST_ONLY', () => {
  it('uses bounded binding and real cold preparation for queue→atomic→final receipt with live revocation', async () => {
    const marker = await loadPostwarNativeReferenceMarker(
      process.env.ECONMIND_POSTWAR_REFERENCE_MARKER ??
        '/workspace/.cloud-setup/evidence/postwar-reference-persistent-20261028/reference-db.json',
    );
    const clone = await clonePostwarNativeReference(
      marker,
      'finance_budget_http',
      process.env.ECONMIND_POSTWAR_BOUNDED_TEMPLATE ?? marker.database,
    );
    const nonce = randomBytes(4).toString('hex'),
      workerRole = 'budget_test_worker_' + nonce,
      intakeRole = 'budget_test_intake_' + nonce,
      publisherRole = 'budget_test_publisher_' + nonce,
      workerId = 'WORKER_NATIVE_BUDGET_' + nonce.toUpperCase();
    const pools: Pool[] = [];
    let server: Server | undefined;
    let child: ChildProcess | undefined;
    let closeChild: (() => Promise<void>) | undefined;
    let childAsk: ((operation: string) => Promise<unknown>) | undefined;
    const isolatedHosts: unknown[] = [];
    let restartHost: (() => Promise<void>) | undefined;
    let browserCleanup: (() => Promise<void>) | undefined;
    const httpMetrics: {
      path: string;
      status: number;
      bytes: number;
      milliseconds: number;
      heapDeltaBytes: number;
    }[] = [];
    const hotSql: string[] = [];
    let readAcquired = 0,
      readReleased = 0;
    let hot = false;
    const phases: { phase: string; milliseconds: number }[] = [];
    const failures: {
      name: string;
      message: string;
      code: string | null;
    }[][] = [];
    const describeFailure = (error: unknown) => {
      const chain: { name: string; message: string; code: string | null }[] =
        [];
      let cause = error;
      while (cause instanceof Error && chain.length < 5) {
        chain.push({
          name: cause.name,
          message: cause.message,
          code: 'code' in cause ? String(cause.code) : null,
        });
        cause = cause.cause;
      }
      return chain;
    };
    const timed = async <T>(phase: string, work: () => Promise<T>) => {
      const start = performance.now();
      try {
        return await work();
      } finally {
        phases.push({ phase, milliseconds: performance.now() - start });
      }
    };
    let completed = false,
      cap = 'NOT_CALCULATED',
      runtime:
        | ReturnType<typeof createPreparedFinanceBudgetIntakeRuntime>['runtime']
        | undefined;
    try {
      await clone.installer.query(
        await readFile(
          new URL(
            '../../database/proposals/finance-budget-custody.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      await clone.installer.query(
        `create role ${workerRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role ${intakeRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role ${publisherRole} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant ${durableCapacity ? 'world_v2_finance_budget_source_reader' : 'world_v2_finance_budget_source_reader,world_v2_postwar_offline_seed_reader'} to ${workerRole};grant world_v2_finance_budget_source_reader to ${intakeRole};grant world_v2_finance_budget_source_publisher to ${publisherRole};grant usage on schema world_v2 to ${workerRole},${intakeRole},${publisherRole};grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox,world_v2.world_writer_lease to ${workerRole};grant insert on world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt,world_v2.authoritative_event,world_v2.inventory_posting,world_v2.financial_posting_batch,world_v2.authoritative_commit_authorization,world_v2.current_materialization,world_v2.notification_outbox to ${workerRole};grant update on world_v2.command_queue,world_v2.world_head,world_v2.current_materialization to ${workerRole};grant update(renewed_at_real)on world_v2.world_writer_lease to ${workerRole};grant select on world_v2.world_head,world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.projection_entitlement,world_v2.runtime_opening_admission,world_v2.command_submission,world_v2.command_queue,world_v2.command_receipt to ${intakeRole};grant select(world_id,seed_id,seed_fingerprint,replay_binding)on world_v2.opening_seed to ${intakeRole};grant insert on world_v2.command_submission,world_v2.command_queue to ${intakeRole};grant update(command_id)on world_v2.command_submission to ${intakeRole},${workerRole};grant update(world_version)on world_v2.world_head to ${intakeRole}`,
      );
      if (!durableCapacity)
        await clone.installer.query(
          `grant select on world_v2.opening_seed to ${workerRole}`,
        );
      if (durableCapacity)
        await clone.installer.query(
          await readFile(
            new URL(
              '../../database/proposals/finance-budget-capacity-source.sql',
              import.meta.url,
            ),
            'utf8',
          ),
        );
      // Metadata row-lock grants follow the existing intake protocol; neither
      // consumer nor intake receives UPDATE on current authorization/entitlement.
      // The isolated writer follows the existing lease metadata row-lock
      // protocol. This test grant is not a production enrollment approval.
      await clone.installer.query(
        `create policy budget_test_worker_seed_${nonce} on world_v2.opening_seed for select to ${workerRole} using(world_id='${marker.worldId}' and seed_fingerprint='${marker.seedFingerprint}' and current_setting('request.jwt.claim.sub',true)='${marker.subject}');create policy budget_test_intake_seed_${nonce} on world_v2.opening_seed for select to ${intakeRole} using(world_id='${marker.worldId}' and current_setting('request.jwt.claim.sub',true)='${marker.subject}')`,
      );
      await clone.installer.query(
        `alter table world_v2.world_writer_lease enable row level security;alter table world_v2.world_writer_lease force row level security;create policy budget_test_lease_read_${nonce} on world_v2.world_writer_lease for select to ${workerRole},world_v2_finance_budget_source_owner using(world_id='${marker.worldId}');create policy budget_test_lease_lock_${nonce} on world_v2.world_writer_lease for update to ${workerRole},world_v2_finance_budget_source_owner using(world_id='${marker.worldId}')with check(false)`,
      );
      const connected = (role: string) => {
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
      const publisher = connected(publisherRole),
        worker = connected(workerRole),
        rawIntake = connected(intakeRole);
      const leasePrivileges = await worker.query(
        `select has_any_column_privilege(current_user,'world_v2.current_commit_authorization','UPDATE')as authority_update,has_any_column_privilege(current_user,'world_v2.projection_entitlement','UPDATE')as entitlement_update`,
      );
      expect(leasePrivileges.rows).toEqual([
        { authority_update: false, entitlement_update: false },
      ]);
      const foreignWorld = 'WORLD_NATIVE_BUDGET_FOREIGN_TEST_ONLY';
      await clone.installer.query(
        'insert into world_v2.world_head values($1,0,0)',
        [foreignWorld],
      );
      await clone.installer.query(
        "insert into world_v2.world_writer_lease values($1,'WORKER_FOREIGN',1,now(),now(),now()+interval '10 minutes')",
        [foreignWorld],
      );
      expect(
        (
          await worker.query(
            'select * from world_v2.world_writer_lease where world_id=$1 for share',
            [foreignWorld],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await worker.query(
            'update world_v2.world_writer_lease set renewed_at_real=renewed_at_real where world_id=$1',
            [foreignWorld],
          )
        ).rowCount,
      ).toBe(0);
      const storedSeat = await clone.installer.query(
        "select seat_ref,authorization_revision from world_v2.runtime_read_seat where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='FINANCE'",
        [marker.worldId, marker.subject, marker.countryId],
      );
      const exactScope =
        'OFFICE_' +
        Buffer.from(marker.countryId).toString('hex').toUpperCase() +
        '_' +
        Buffer.from('FINANCE').toString('hex').toUpperCase();
      const metadataArgs = [
        marker.worldId,
        marker.subject,
        marker.countryId,
        'FINANCE',
        storedSeat.rows[0].seat_ref,
        storedSeat.rows[0].authorization_revision,
        'FINANCE_BUDGET',
        exactScope,
      ];
      const metadataDirect = await rawIntake.query(
        OFFICE_COMMAND_CURRENT_BINDING_QUERY,
        metadataArgs,
      );
      const metadataLocked = await rawIntake.query(
        'select * from world_v2.lock_finance_budget_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)',
        metadataArgs,
      );
      expect(metadataLocked.rows).toEqual(metadataDirect.rows);
      const source = await timed(
        'read_exact_original_financial_and_encumbrance_fields',
        () =>
          clone.installer.query<{
            government: string;
            currency: string;
            account: string;
            gross: string;
            encumbered: string;
          }>(
            `with roots as(select (x->>'canonicalPayload')::jsonb as body from world_v2.opening_seed s cross join lateral jsonb_array_elements(s.canonical_payload::jsonb->'sources')x where s.world_id=$1),financial as(select body from roots where body->>'schemaVersion'='adopted-financial-opening-source-v2'),roster as(select x->'roster' as roster from financial cross join lateral jsonb_array_elements(body->'assembly'->'countries')x where x->>'countryId'=$2),operating as(select body from roots where body->>'schemaVersion'='postwar-operating-genesis-seed-source-v1'),financial_original as(select(d->>'bytes')::jsonb as original from operating cross join lateral jsonb_array_elements(body->'carrier'->'documents')d where d->>'documentId'='POSTWAR_FINANCIAL_OFFICE_ORIGINALS'),country as(select x as country from financial_original cross join lateral jsonb_array_elements(original->'contract'->'countries')x where x->>'countryId'=$2),legs as(select l from world_v2.opening_seed s cross join lateral jsonb_array_elements(s.canonical_payload::jsonb->'financialBatches')b cross join lateral jsonb_array_elements(b->'legs')l cross join roster r cross join country c where s.world_id=$1 and l->'account'->>'countryId'=$2 and l->'account'->>'ownerId'=r.roster->>'government'and l->'account'->>'counterpartyEntityId'=r.roster->>'centralBank'and l->'account'->>'accountClass'='ASSET'and l->>'direction'='DEBIT'and l->'account'->>'currency'=c.country->>'localCurrency')select r.roster->>'government'as government,c.country->>'localCurrency'as currency,l->'account'->>'accountId'as account,l->'amount'->>'amount'as gross,(select coalesce(sum((f->>'ceilingAmount')::numeric),0)::text from operating o cross join lateral jsonb_array_elements(o.body->'carrier'->'facts'->'funding')f where f->>'accountId'=l->'account'->>'accountId')as encumbered from legs cross join roster r cross join country c`,
            [marker.worldId, marker.countryId],
          ),
      );
      expect(source.rows).toHaveLength(1);
      const original = source.rows[0]!;
      const free = C.Money.from(original.gross, original.currency).subtract(
        C.Money.from(original.encumbered, original.currency),
      );
      expect(free.amount.isNegative()).toBe(false);
      cap = C.canonicalDecimal(free.amount.dividedBy('2'));
      const policy: FinanceNativeBudgetPolicy = {
        schemaVersion: 'finance-native-budget-policy-v1',
        ruleRef: FINANCE_NATIVE_BUDGET_RULE,
        ruleRevision: 'RULE_NATIVE_TEST_ONLY_V1',
        sourceDocumentSHA256:
          'sha256:' +
          sha(
            await readFile(
              new URL('../../specs/extracted/FINANCE.md', import.meta.url),
              'utf8',
            ),
          ),
        normativeUnits: [
          'FINANCE-U0247',
          'FINANCE-U0252',
          'FINANCE-U0265',
          'FINANCE-U0295',
        ],
        worldId: marker.worldId,
        countryId: marker.countryId,
        governmentEntityId: original.government,
        currency: original.currency,
        envelopeRef: 'NATIVE_FINANCE_SELF_ADMIN',
        effectivePeriodRef: 'EXPLICIT_TEST_ONLY_OPENING_PERIOD',
        periodRevision: 'PERIOD_REV_TEST_ONLY',
        validFromSimTime: '0',
        validUntilSimTime: '1000000000',
        requestingOfficeId: 'FINANCE',
        programmeOwnerOfficeId: 'FINANCE',
        classification: 'ORDINARY_DEPARTMENTAL',
        funding: 'FULL_UNCONDITIONAL',
        requiredApprovalOffices: ['FINANCE'],
      };
      await timed('controlled_normative_policy_publication', () =>
        publisher.query(
          'select world_v2.publish_finance_budget_policy($1,$2,$3,$4,$5,$6)',
          [
            'POLICY_NATIVE_BUDGET_TEST_ONLY',
            'ISOLATED_TEST_ONLY_POLICY_PUBLISHER',
            C.canonicalSerialize(policy),
            marker.seedFingerprint,
            marker.admissionRef,
            policy.sourceDocumentSHA256.slice(7),
          ],
        ),
      );
      const now = new Date();
      await clone.installer.query(
        'insert into world_v2.world_writer_lease(world_id,holder_id,fencing_token,acquired_at_real,renewed_at_real,lease_expires_at_real)values($1,$2,1,$3,$3,$4)',
        [
          marker.worldId,
          workerId,
          now.toISOString(),
          new Date(now.getTime() + 600000).toISOString(),
        ],
      );
      const rawDatabase = new PostgresSqlDatabase(worker);
      const diagnosedDatabase: SqlDatabase = {
        query: rawDatabase.query.bind(rawDatabase),
        async transaction(operation) {
          try {
            return await rawDatabase.transaction((tx) =>
              operation({
                async query<Row extends object>(
                  statement: string,
                  parameters?: readonly unknown[],
                ) {
                  try {
                    if (hot) hotSql.push(statement);
                    return await tx.query<Row>(statement, parameters);
                  } catch (error) {
                    failures.push([
                      {
                        name: 'SQL_STATEMENT',
                        message: statement,
                        code: null,
                      },
                      ...describeFailure(error),
                    ]);
                    throw error;
                  }
                },
              }),
            );
          } catch (error) {
            failures.push(describeFailure(error));
            throw error;
          }
        },
      };
      const database =
        createFinanceBudgetAuthorizationDatabase(diagnosedDatabase);
      const coldStart = performance.now(),
        coldHeap = process.memoryUsage().heapUsed;
      const intakePool = createFinanceBudgetIntakeAuthorizationPool(rawIntake),
        clock = {
          nowReal: () => new Date().toISOString(),
          simTime: async () => '0',
        };
      let capacitySHA256: string | null = null;
      let publication: { milliseconds: number; sourceBytes: number } | null =
        null;
      const preparedSource = durableCapacity
        ? null
        : await preparePostgresFinanceBudgetSource({
            database,
            workerId,
            worldId: marker.worldId,
            countryId: marker.countryId,
            envelopeRef: policy.envelopeRef,
            effectivePeriodRef: policy.effectivePeriodRef,
            observedAtReal: new Date().toISOString(),
            sha256Hex: () => '0'.repeat(64),
          });
      if (durableCapacity) {
        expect(
          (
            await worker.query(
              "select has_table_privilege(current_user,'world_v2.opening_seed','SELECT')as raw",
            )
          ).rows,
        ).toEqual([{ raw: false }]);
        const originalHash = (
          await clone.installer.query(
            "select encode(sha256(convert_to(canonical_payload,'UTF8')),'hex')as hash from world_v2.opening_seed where world_id=$1",
            [marker.worldId],
          )
        ).rows[0].hash;
        await expect(
          publisher.query(
            'select world_v2.publish_finance_budget_capacity($1,$2,$3,$4,$5)',
            [
              marker.worldId,
              marker.countryId,
              marker.seedFingerprint,
              marker.admissionRef,
              '0'.repeat(64),
            ],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        const began = performance.now();
        capacitySHA256 = (
          await publisher.query(
            'select world_v2.publish_finance_budget_capacity($1,$2,$3,$4,$5)as hash',
            [
              marker.worldId,
              marker.countryId,
              marker.seedFingerprint,
              marker.admissionRef,
              originalHash,
            ],
          )
        ).rows[0].hash;
        const size = (
          await clone.installer.query(
            'select octet_length(source_text)::int as size from world_v2.finance_budget_capacity_original where world_id=$1 and country_id=$2',
            [marker.worldId, marker.countryId],
          )
        ).rows[0].size;
        expect(size).toBeLessThanOrEqual(65536);
        publication = {
          milliseconds: performance.now() - began,
          sourceBytes: size,
        };
      }
      const coldPreparation = {
        mode: durableCapacity
          ? 'PERSISTED_CAPACITY_NO_H0_HYDRATION'
          : 'PROCESS_LOCAL_GENUINE_H0_BASE',
        milliseconds: performance.now() - coldStart,
        heapDeltaBytes: process.memoryUsage().heapUsed - coldHeap,
        publication,
      };
      const runtimeConfig = {
        intakePool,
        workerDatabase: database,
        worldId: marker.worldId,
        workerId,
        clock,
        sha256Hex: sha,
        environment: { ECONMIND_ENV: 'ci', NODE_ENV: 'test', VITEST: 'true' },
      };
      const preparedRuntime = durableCapacity
        ? createBoundedFinanceBudgetIntakeRuntime({
            ...runtimeConfig,
            capacitySource: createPostgresFinanceBudgetCapacitySource({
              worldId: marker.worldId,
              countryId: marker.countryId,
              expectedRawSourceSHA256: capacitySHA256!,
            }),
          })
        : createPreparedFinanceBudgetIntakeRuntime({
            ...runtimeConfig,
            preparedSource: preparedSource!,
          });
      runtime = preparedRuntime.runtime;
      runtime.consumer.startPreparation();
      const request = (
        operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
        version: string,
        suffix: string,
      ) => ({
        worldId: marker.worldId,
        countryId: marker.countryId,
        officeId: 'FINANCE' as const,
        commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1' as const,
        commandId: 'COMMAND_NATIVE_BUDGET_' + suffix,
        idempotencyKey: 'KEY_NATIVE_BUDGET_' + suffix,
        expectedWorldVersion: version,
        payload: {
          operation,
          scope: {
            worldId: marker.worldId,
            countryId: marker.countryId,
            entityRef: original.government,
            envelopeRef: policy.envelopeRef,
            effectivePeriodRef: policy.effectivePeriodRef,
          },
          currency: original.currency,
          amount: cap,
          envelopeRevisionRef: 'ENVELOPE_REV_NATIVE',
          lineRef:
            operation === 'SET_ENVELOPE' ? null : 'LINE_NATIVE_SELF_ADMIN',
          revisionRef:
            operation === 'SET_ENVELOPE'
              ? 'ENVELOPE_REV_NATIVE'
              : 'LINE_REV_NATIVE',
          predecessorRevisionRef: null,
        },
      });
      const project = 'abcdefghijklmnopqrst',
        issuer = `https://${project}.supabase.co/auth/v1`,
        jwksUrl = issuer + '/.well-known/jwks.json';
      const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
        jwk = {
          ...keys.publicKey.export({ format: 'jwk' }),
          kid: 'TEST_ONLY_BUDGET_HTTP',
          alg: 'ES256',
          use: 'sig',
          key_ops: ['verify'],
        };
      const token = (subject = marker.subject) => {
        const now = Math.floor(Date.now() / 1000),
          header = Buffer.from(
            JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }),
          ).toString('base64url'),
          claims = Buffer.from(
            JSON.stringify({
              sub: subject,
              iss: issuer,
              aud: 'authenticated',
              iat: now - 5,
              exp: now + 600,
            }),
          ).toString('base64url'),
          data = header + '.' + claims;
        return (
          data +
          '.' +
          sign('sha256', Buffer.from(data), {
            key: keys.privateKey,
            dsaEncoding: 'ieee-p1363',
          }).toString('base64url')
        );
      };
      const ui = 'https://pages.example',
        origin = 'https://read.example';
      const pins = {
        worldId: marker.worldId,
        seedRef: marker.seedId,
        contentHash: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        minimumWorldVersion: '0',
      };
      const auth = {
        projectRef: project,
        expectedIssuer: issuer,
        jwksUrl,
        audience: 'authenticated',
        fetch: async (url: Parameters<typeof fetch>[0]) => {
          expect(String(url)).toBe(jwksUrl);
          const response = Response.json({ keys: [jwk] });
          Object.defineProperty(response, 'url', { value: jwksUrl });
          return response;
        },
      };
      const readPool: Pick<Pool, 'connect'> = {
        async connect() {
          const client = await clone.boundedReader.connect();
          readAcquired++;
          let released = false;
          return new Proxy(client, {
            get(target, key) {
              if (key === 'query')
                return (...args: unknown[]) => {
                  if (hot && typeof args[0] === 'string') hotSql.push(args[0]);
                  return Reflect.apply(target.query, target, args);
                };
              if (key === 'release')
                return (...args: unknown[]) => {
                  if (!released) {
                    readReleased++;
                    released = true;
                  }
                  return Reflect.apply(target.release, target, args);
                };
              const value = Reflect.get(target, key, target) as unknown;
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        },
      };
      const handler = createBoundedOfficeCommandFetchHandler({
        allowedOrigins: [ui],
        composition: {
          readPool,
          readerRole: marker.roles.boundedReaderRole,
          writerPool: intakePool,
          writerRole: intakeRole,
          authorizationPublisherRole: marker.roles.authorizationPublisherRole,
          admittedWorldPins: pins,
          auth,
          resolveActorId: async (subject) =>
            subject === marker.subject ? 'ACTOR_NATIVE_BUDGET_TEST_ONLY' : null,
          clock,
          runtime,
        },
      });
      const seat = createPostwarCurrentSeatFetchHandler({
        pool: readPool,
        readerRole: marker.roles.boundedReaderRole,
        authorizationPublisherRole: marker.roles.authorizationPublisherRole,
        admittedWorldPins: pins,
        auth,
        modelVersion: C.WORLD_MODEL_VERSION,
        endpointPins: {
          origin,
          projectionPath: POSTWAR_OFFICE_RUNTIME_READ_PATH,
          finalLookupPath: '/v1/final-receipt',
          deploymentRef: 'TEST_ONLY_BUDGET_HTTP',
        },
        routeOptions: { allowedOrigins: [ui] },
      });
      let base = '';
      server = createServer(async (req, res) => {
        const cancel = new AbortController();
        res.on('close', () => {
          if (!res.writableEnded) cancel.abort();
        });
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            const bytes = Buffer.from(chunk);
            size += bytes.length;
            if (size > 16384) {
              res.writeHead(413).end();
              return;
            }
            chunks.push(bytes);
          }
          const request = new Request(base + req.url, {
            method: req.method ?? 'GET',
            headers: req.headers as Record<string, string>,
            ...(['GET', 'HEAD'].includes(req.method ?? 'GET')
              ? {}
              : { body: Buffer.concat(chunks) }),
            signal: cancel.signal,
          });
          const response =
            new URL(request.url).pathname === C.AUTHENTICATED_CURRENT_SEAT_PATH
              ? await seat(request)
              : await handler(request);
          if (!response) {
            res.writeHead(404).end();
            return;
          }
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          if (!res.destroyed) res.writeHead(503).end();
        }
      });
      await new Promise<void>((resolve) =>
        server!.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      if (!address || typeof address === 'string')
        throw Error('OWNED_LOOPBACK_REQUIRED');
      base = `http://127.0.0.1:${address.port}`;
      if (durableCapacity) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = undefined;
        const launch = async () => {
          child = fork(
            new URL(
              '../../tools/office-connection/native-budget-capacity-host.mjs',
              import.meta.url,
            ),
            [],
            {
              execPath: process.execPath,
              serialization: 'advanced',
              env: {
                NODE_ENV: 'test',
                ECONMIND_ENV: 'ci',
                ECONMIND_BUDGET_CAPACITY_TEST_HOST: '1',
              },
              stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
            },
          );
          let stderr = '';
          child.stderr?.on('data', (chunk) => {
            stderr = (stderr + String(chunk)).slice(-4096);
          });
          const pending = new Map<
            string,
            {
              resolve: (value: unknown) => void;
              reject: (reason: unknown) => void;
              timer: ReturnType<typeof setTimeout>;
            }
          >();
          let readyResolve: (value: Record<string, unknown>) => void = () =>
              undefined,
            readyReject: (value: unknown) => void = () => undefined;
          const ready = new Promise<Record<string, unknown>>(
            (resolve, reject) => {
              readyResolve = resolve;
              readyReject = reject;
            },
          );
          child.on('message', (value: unknown) => {
            if (!value || typeof value !== 'object') return;
            const m = value as Record<string, unknown>;
            if (m.type === 'LISTENING_TEST_ONLY') {
              readyResolve(m);
              return;
            }
            if (m.type === 'ERROR') {
              const error = Error(String(m.message));
              if (typeof m.id === 'string' && pending.has(m.id)) {
                const p = pending.get(m.id)!;
                pending.delete(m.id);
                clearTimeout(p.timer);
                p.reject(error);
              } else readyReject(error);
              return;
            }
            if (m.type === 'RESULT' && typeof m.id === 'string') {
              const p = pending.get(m.id);
              if (p) {
                pending.delete(m.id);
                clearTimeout(p.timer);
                p.resolve(m.result);
              }
            }
          });
          child.on('exit', (code) => {
            for (const p of pending.values()) {
              clearTimeout(p.timer);
              p.reject(Error('OWNED_CHILD_EXIT_' + code + ':' + stderr));
            }
            pending.clear();
            if (code !== 0)
              readyReject(Error('OWNED_CHILD_START_FAILED:' + stderr));
          });
          const actor = child;
          childAsk = (operation) =>
            new Promise((resolve, reject) => {
              const id = randomUUID(),
                timer = setTimeout(() => {
                  pending.delete(id);
                  reject(Error('NATIVE_IPC_DEADLINE'));
                }, 10000);
              pending.set(id, { resolve, reject, timer });
              actor.send({ operation, id });
            });
          closeChild = async () => {
            if (actor.exitCode !== null) return;
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(() => {
                actor.kill('SIGTERM');
                reject(Error('OWNED_CHILD_CLEANUP_TIMEOUT'));
              }, 10000);
              actor.once('exit', (code) => {
                clearTimeout(timer);
                if (code === 0) resolve();
                else reject(Error('OWNED_CHILD_EXIT_' + code));
              });
              actor.send({ operation: 'close' });
            });
          };
          child.send({
            operation: 'start',
            config: {
              socket: marker.socket,
              port: marker.port,
              database: clone.database,
              workerRole,
              intakeRole,
              readerRole: marker.roles.boundedReaderRole,
              authorizationPublisherRole:
                marker.roles.authorizationPublisherRole,
              workerId,
              subject: marker.subject,
              countryId: marker.countryId,
              pins,
              sourceSHA256: capacitySHA256,
              projectRef: project,
              issuer,
              jwksUrl,
              jwk,
              ui,
              origin,
            },
          });
          const timer = setTimeout(
            () => readyReject(Error('OWNED_CHILD_LISTEN_DEADLINE:' + stderr)),
            10000,
          );
          try {
            const info = await ready;
            base = String(info.base);
            isolatedHosts.push(info);
          } finally {
            clearTimeout(timer);
          }
        };
        await launch();
        // Retain the actual fixed constructor for a second empty Node process.
        restartHost = async () => {
          isolatedHosts.push(await childAsk!('inspect'));
          await closeChild!();
          await launch();
        };
      }
      const call = async (path: string, body: unknown, bearer = token()) => {
        const started = performance.now(),
          heap = process.memoryUsage().heapUsed,
          response = await fetch(base + path, {
            method: 'POST',
            headers: {
              authorization: 'Bearer ' + bearer,
              origin: ui,
              'content-type': 'application/json',
            },
            body: JSON.stringify(body),
          }),
          text = await response.text();
        httpMetrics.push({
          path,
          status: response.status,
          bytes: Buffer.byteLength(text),
          milliseconds: performance.now() - started,
          heapDeltaBytes: process.memoryUsage().heapUsed - heap,
        });
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        return { response, body: JSON.parse(text) as Record<string, unknown> };
      };
      const envelope = (r: ReturnType<typeof request>) => ({
        schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
        requestId: randomUUID(),
        request: r,
      });
      const recover = (originalRequest: ReturnType<typeof envelope>) => ({
        schemaVersion: C.AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
        requestId: randomUUID(),
        request: {
          worldId: marker.worldId,
          commandId: originalRequest.request.commandId,
          idempotencyKey: originalRequest.request.idempotencyKey,
          originalRequest,
        },
      });
      const set = envelope(request('SET_ENVELOPE', '0', 'SET')),
        line = envelope(request('APPROVE_NEW_LINE', '1', 'LINE'));
      hot = true;
      expect(
        (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, set)).response.status,
      ).toBe(202);
      expect(
        (await call(C.AUTHENTICATED_COMMAND_RECOVERY_PATH, recover(set))).body,
      ).toMatchObject({ ok: true, state: { status: 'QUEUED' } });
      for (const current of [set, line]) {
        if (current === line && restartHost) await restartHost();
        if (current === line)
          expect(
            (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, line)).response
              .status,
          ).toBe(202);
        const step = durableCapacity
          ? await childAsk!('consume')
          : await runtime.consumer.consumeOnce();
        expect(step, JSON.stringify(failures)).toMatchObject({
          status: 'PROCESSED',
          receipt: { outcome: 'COMMITTED' },
        });
        const final = await call(
          C.AUTHENTICATED_COMMAND_RECOVERY_PATH,
          recover(current),
        );
        expect(final.response.status).toBe(200);
        expect(final.body).toMatchObject({
          ok: true,
          state: {
            status: 'FINAL',
            receipt: {
              outcome: 'COMMITTED',
              worldVersionAfter: current === set ? '1' : '2',
            },
          },
        });
      }
      expect(
        (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, set)).body,
      ).toMatchObject({
        ok: true,
        state: { status: 'FINALIZED', source: 'EXISTING', submitted: false },
      });
      expect(
        (
          await call(
            AUTHENTICATED_OFFICE_COMMAND_PATH,
            set,
            token('22222222-2222-4222-8222-222222222222'),
          )
        ).response.status,
      ).toBe(403);
      expect(
        (
          await call(
            AUTHENTICATED_OFFICE_COMMAND_PATH,
            set,
            'invalid.invalid.invalid',
          )
        ).response.status,
      ).toBe(401);
      const browserEvidence: { status: string; details?: unknown } = {
        status: 'NOT_RUN',
      };
      if (process.env.ECONMIND_BUDGET_HTTP_BROWSER === '1') {
        const playwrightModule =
          '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
        const { chromium } = await import(playwrightModule);
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
          configFile: false,
          root: new URL('../..', import.meta.url).pathname,
          server: { host: '127.0.0.1', port: 0 },
          logLevel: 'error',
        });
        await vite.listen();
        const a = vite.httpServer?.address();
        if (!a || typeof a === 'string') throw Error('OWNED_VITE_REQUIRED');
        const moduleBase = `http://127.0.0.1:${a.port}`;
        const browser = await chromium.launch({
          executablePath: '/usr/bin/chromium',
          headless: true,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
        browserCleanup = async () => {
          await browser.close();
          await vite.close();
        };
        const page = await browser.newPage();
        type Route = {
          request(): {
            url(): string;
            method(): string;
            headers(): Record<string, string>;
            postData(): string | null;
          };
          fulfill(value: {
            status: number;
            headers?: Record<string, string>;
            body: string | Buffer;
          }): Promise<void>;
        };
        const values = { token: token(), pins, set, recovery: recover(line) };
        const html = `<!doctype html><meta charset="utf-8"><title>TEST_ONLY actual Finance budget transport</title><pre id="result">Loading actual server binding</pre><script type="module">import {createOfficeCommandClient} from '/apps/world-web/src/office-command/client.ts';const values=${JSON.stringify(values)};const bootstrap=await fetch('https://read.example'+${JSON.stringify(C.AUTHENTICATED_CURRENT_SEAT_PATH)},{method:'POST',headers:{authorization:'Bearer '+values.token,'content-type':'application/json'},body:JSON.stringify({schemaVersion:${JSON.stringify(C.AUTHENTICATED_CURRENT_SEAT_SCHEMA)},requestId:'11111111-1111-4111-8111-111111111111'})}).then(r=>r.json());const binding=bootstrap.bindings.find(b=>b.identity.officeId==='FINANCE');const client=createOfficeCommandClient({origin:'https://read.example',path:${JSON.stringify(AUTHENTICATED_OFFICE_COMMAND_PATH)},deploymentRef:'TEST_ONLY_BUDGET_HTTP'},{endpoints:{origin:'https://read.example',projectionPath:${JSON.stringify(POSTWAR_OFFICE_RUNTIME_READ_PATH)},finalLookupPath:'/v1/final-receipt',deploymentRef:'TEST_ONLY_BUDGET_HTTP'},world:values.pins,identity:binding.identity,seatRef:binding.seatRef,currentIdentity:()=>binding.identity,getAccessToken:async()=>values.token,session:{sessionRef:'TEST_ONLY_BROWSER_BUDGET',isCurrent:()=>true,onInvalidate:()=>()=>{}}});const ack=await client.submit(values.set);const response=await fetch('https://read.example'+${JSON.stringify(C.AUTHENTICATED_COMMAND_RECOVERY_PATH)},{method:'POST',headers:{authorization:'Bearer '+values.token,'content-type':'application/json'},body:JSON.stringify(values.recovery)});const final=await response.json();document.querySelector('#result').textContent=JSON.stringify({ack,final},null,2);window.result={ack,final};client.disconnect();</script>`;
        await page.route('https://pages.example/**', async (route: Route) => {
          const url = new URL(route.request().url());
          if (url.pathname === '/') {
            await route.fulfill({
              status: 200,
              headers: { 'content-type': 'text/html' },
              body: html,
            });
            return;
          }
          const response = await fetch(moduleBase + url.pathname + url.search);
          await route.fulfill({
            status: response.status,
            headers: Object.fromEntries(response.headers),
            body: Buffer.from(await response.arrayBuffer()),
          });
        });
        await page.route('https://read.example/**', async (route: Route) => {
          const req = route.request(),
            started = performance.now(),
            heap = process.memoryUsage().heapUsed,
            response = await fetch(base + new URL(req.url()).pathname, {
              method: req.method(),
              headers: req.headers(),
              body: req.postData(),
            }),
            bytes = Buffer.from(await response.arrayBuffer());
          httpMetrics.push({
            path: 'CHROMIUM:' + new URL(req.url()).pathname,
            status: response.status,
            bytes: bytes.length,
            milliseconds: performance.now() - started,
            heapDeltaBytes: process.memoryUsage().heapUsed - heap,
          });
          await route.fulfill({
            status: response.status,
            headers: Object.fromEntries(response.headers),
            body: bytes,
          });
        });
        await page.goto(ui + '/');
        await page.waitForFunction(() => Object.hasOwn(window, 'result'));
        const result = await page.evaluate(() => Reflect.get(window, 'result'));
        expect(result).toMatchObject({
          ack: {
            status: 'QUEUE_ACK',
            acknowledgement: { status: 'FINALIZED' },
          },
          final: {
            ok: true,
            state: {
              status: 'FINAL',
              receipt: { worldVersionAfter: '2', eventIds: expect.any(Array) },
            },
          },
        });
        const evidence = evidenceDirectory;
        await mkdir(evidence, { recursive: true });
        await page.screenshot({
          path: evidence + '/chromium-budget-final.png',
        });
        browserEvidence.status = 'PASS_TEST_ONLY_PUBLIC_CLIENT_TO_ACTUAL_HTTP';
        browserEvidence.details = result;
        await browserCleanup();
        browserCleanup = undefined;
      }
      await publisher.query(
        'select world_v2.revoke_finance_budget_policy($1,$2)',
        ['POLICY_NATIVE_BUDGET_TEST_ONLY', 'TEST_ONLY_HTTP_SOURCE_REVOKED'],
      );
      const denied = envelope(request('APPROVE_NEW_LINE', '2', 'REVOKED'));
      expect(
        (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, denied)).body,
      ).toMatchObject({
        ok: false,
        error: { code: 'SOURCE_RUNTIME_UNAVAILABLE' },
      });
      await clone.installer.query(
        "update world_v2.current_commit_authorization set active=false where world_id=$1 and auth_subject=$2::uuid and office_id='FINANCE'and capability='FINANCE_BUDGET'",
        [marker.worldId, marker.subject],
      );
      expect(
        (await call(C.AUTHENTICATED_COMMAND_RECOVERY_PATH, recover(line)))
          .response.status,
      ).toBe(403);
      if (durableCapacity) {
        isolatedHosts.push(await childAsk!('inspect'));
        const observed = isolatedHosts.filter(
          (value): value is Record<string, unknown> =>
            !!value && typeof value === 'object' && 'queries' in value,
        );
        const queries = observed.flatMap((value) =>
          Array.isArray(value.queries)
            ? value.queries.filter((q): q is string => typeof q === 'string')
            : [],
        );
        expect(
          queries.some((q) => q.includes('read_finance_budget_capacity')),
        ).toBe(true);
        expect(
          queries.some((q) => /from world_v2\.opening_seed/iu.test(q)),
        ).toBe(false);
        for (const value of observed)
          expect(Number(value.heapUsed)).toBeLessThan(128 * 1024 * 1024);
      }
      expect(readReleased).toBe(readAcquired);
      expect(httpMetrics.every((m) => m.milliseconds < 10000)).toBe(true);
      expect(hotSql.some((q) => /from world_v2\.opening_seed/iu.test(q))).toBe(
        false,
      );
      expect(
        (
          await clone.installer.query(
            'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
            [marker.worldId],
          )
        ).rows,
      ).toEqual([{ world_version: '2', event_sequence: '4' }]);
      const directory = evidenceDirectory;
      await mkdir(directory, { recursive: true });
      await writeFile(
        directory + '/http-receipt.json',
        JSON.stringify(
          {
            classification:
              'TEST_ONLY_ACTUAL_NATIVE_PG_JWT_HTTP_NOT_PRODUCTION',
            completed: true,
            seedFingerprint: marker.seedFingerprint,
            admissionRef: marker.admissionRef,
            coldPreparation,
            isolatedHosts,
            httpMetrics,
            browserEvidence,
            hotSql,
            readAcquired,
            readReleased,
            requestHeapMeasurement:
              'Same-process per-request heap delta includes test HTTP client; excludes prior cold preparation; not peak RSS or a Workers fit claim',
            processAfterHot: {
              heapUsed: process.memoryUsage().heapUsed,
              rss: process.memoryUsage().rss,
            },
            noClock: true,
            productionEnrollment: false,
          },
          null,
          2,
        ),
      );
      completed = true;
    } finally {
      await browserCleanup?.();
      let childCleanupFailure: unknown = null;
      try {
        await closeChild?.();
      } catch (error) {
        childCleanupFailure = error;
        if (child && child.exitCode === null) {
          child.kill('SIGKILL');
          await new Promise<void>((resolve) =>
            child!.once('exit', () => resolve()),
          );
        }
      }
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      await runtime?.consumer.stop();
      await Promise.all(pools.map((p) => p.end()));
      await clone.drop();
      const cleanup = new Pool({
        host: marker.socket,
        port: marker.port,
        database: 'postgres',
        user: 'postgres',
        password: async () => '',
        ssl: false,
        max: 1,
      });
      cleanup.on('error', () => undefined);
      try {
        await cleanup.query(
          `drop role if exists ${workerRole};drop role if exists ${intakeRole};drop role if exists ${publisherRole}`,
        );
      } finally {
        await cleanup.end();
      }
      const directory = evidenceDirectory;
      await mkdir(directory, { recursive: true });
      await writeFile(
        directory + '/cleanup.json',
        JSON.stringify(
          {
            classification: 'TEST_ONLY',
            completed,
            ownedServerClosed: true,
            ownedCloneDropped: true,
            ownedPoolsClosed: true,
            ownedNonceRolesDropped: true,
            phases,
            failures,
            noClock: true,
          },
          null,
          2,
        ),
      );
      expect(childCleanupFailure).toBeNull();
    }
  }, 180000);
});
