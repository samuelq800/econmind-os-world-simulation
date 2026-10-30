/** Opt-in short real least-privilege contract. One actual Budget -> FX H2,
 * no seven-command chain, cold OS, genesis, production or WorldClock. */
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type ManualOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import { createPostwarFinanceSocialFxNativeFixture } from '../support/postwar-finance-social-fx-native-fixture.js';
import {
  deriveCfcMixedCurrentReadData,
  installCfcMixedCurrentReadbackFrom,
} from '../support/postwar-mixed-current-native-readback.js';
import { readPostwarFinanceSocialRuntimeBinding } from '../../apps/world-worker/src/runtime-preparation/finance-social-runtime-connection.js';
import {
  PostgresOfficeCommandIntake,
  buildManualOfficeCommandIntent,
} from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import { readBoundedPostwarCanonicalPrefixFrom } from '../../apps/world-worker/src/persistence/bounded-postwar-canonical-prefix.js';
import { readBoundedPostwarJournalFrom } from '../../apps/world-worker/src/persistence/bounded-postwar-fx-postings.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { createBoundedOfficeCommandBindingProvider } from '../../apps/world-api/src/integration/bounded-office-command-binding.js';
import { createBoundedOfficeCommandRecoveryService } from '../../apps/world-api/src/integration/bounded-office-command-recovery-service.js';
import { parseSupabaseAuthSubject } from '../../apps/world-api/src/integration/identity.js';
const enabled = process.env.ECONMIND_POSTWAR_MINIMAL_READ_NATIVE === '1';
const evidence =
  '/workspace/.cloud-setup/evidence/fx-cfc-minimal-read-native-20261030';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const describeError = (e: unknown): unknown =>
  e instanceof Error
    ? {
        name: e.name,
        message: e.message,
        stack: e.stack,
        code: 'code' in e ? e.code : null,
        cause: describeError(e.cause),
      }
    : String(e);
const wire = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v, (_k, x: unknown) =>
      C.isSimTime(x)
        ? x.toCanonicalValue()
        : typeof x === 'bigint'
          ? x.toString()
          : x,
    ),
  );
describe('actual minimal-role mixed source/current/recovery contract', () => {
  it.skipIf(!enabled)(
    'executes H2 reads through genuine fixed roles and rejects revoked/foreign authority',
    async () => {
      await mkdir(evidence, { recursive: true });
      let fixture:
        | Awaited<ReturnType<typeof createPostwarFinanceSocialFxNativeFixture>>
        | undefined;
      let readback:
        | Awaited<ReturnType<typeof installCfcMixedCurrentReadbackFrom>>
        | undefined;
      let failure: unknown;
      const report: Record<string, unknown> = {
        status: 'IN_PROGRESS',
        classification: 'ACTUAL_TEST_ONLY_MINIMAL_READ_NOT_PRODUCTION',
        stages: [],
        defaultImportDoesNotConnect: true,
      };
      const stage = async (s: string) => {
        report.stage = s;
        (report.stages as string[]).push(s);
        await writeFile(
          evidence + '/progress.json',
          JSON.stringify(wire(report), null, 2) + '\n',
        );
      };
      const fixed = [
        'world_v2_postwar_projection_owner',
        'world_v2_postwar_projection_publisher',
        'world_v2_postwar_projection_reader',
      ];
      let beforeFixed: string[] = [];
      try {
        await stage('REAL_CFC_CLONE_AND_CONTROLLED_SOURCE');
        fixture = await createPostwarFinanceSocialFxNativeFixture({
          evidenceDirectory: evidence,
        });
        const f = fixture,
          { marker } = f,
          ports = readPostwarFinanceSocialRuntimeBinding(f.connection);
        beforeFixed = (
          await f.clone.installer.query<{ rolname: string }>(
            'select rolname from pg_roles where rolname=any($1::text[])',
            [fixed],
          )
        ).rows.map((r) => r.rolname);
        await stage('OFFLINE_ACTUAL_CURRENT_DATA_AND_BOUNDED_SCHEMA');
        const data = await (async () => {
          const seed = C.parseOpeningSeed(
            JSON.parse(await readFile(f.artifacts.seedFile, 'utf8')),
            sha,
          );
          return deriveCfcMixedCurrentReadData({
            seed,
            admissionRef: marker.admissionRef,
            canonicalSeedSHA256: String(f.header.canonical_intent_sha256),
          });
        })();
        readback = await installCfcMixedCurrentReadbackFrom(f, data);
        const rb = readback;
        const recoverySql = await readFile(
          new URL(
            '../../database/proposals/postwar-office-recovery-read.sql',
            import.meta.url,
          ),
          'utf8',
        );
        await f.clone.installer.query(recoverySql);
        report.recoveryProposalRawSHA256 = sha(recoverySql);
        const provider = createBoundedOfficeCommandBindingProvider({
          pool: f.readPool,
          readerRole: f.readRole,
          authorizationPublisherRole: marker.roles.authorizationPublisherRole,
        });
        const bindingFor = async (r: ManualOfficeCommandRequestDto) => {
          const scopeKey = `OFFICE_${Buffer.from(r.countryId).toString('hex').toUpperCase()}_${Buffer.from(r.officeId).toString('hex').toUpperCase()}`;
          const b = await provider.resolve({
            verifiedSubject: parseSupabaseAuthSubject(marker.subject),
            worldId: marker.worldId,
            projectionSelector: { classification: 'OFFICE_PRIVATE', scopeKey },
            finalSelector: null,
            signal: AbortSignal.timeout(10000),
          });
          if (!b) throw Error('ACTUAL_LOW_ROLE_CURRENT_BINDING_REQUIRED');
          return b;
        };
        const counts = async () =>
          (
            await f.worker.query(
              `select h.world_version::text as version,h.event_sequence::text as sequence,(select count(*)::text from world_v2.command_submission where world_id=$1)commands,(select count(*)::text from world_v2.command_receipt where world_id=$1)receipts,(select count(*)::text from world_v2.authoritative_event where world_id=$1)events,(select count(*)::text from world_v2.financial_posting_batch where world_id=$1)batches,(select count(*)::text from world_v2.inventory_posting where world_id=$1)inventory,(select count(*)::text from world_v2.command_queue where world_id=$1)queues from world_v2.world_head h where h.world_id=$1`,
              [marker.worldId],
            )
          ).rows[0]!;
        const n = randomBytes(6).toString('hex').toUpperCase(),
          actor = 'ACTOR_TEST_ONLY_MIXED_FX',
          policy = f.c01Policy,
          loc = f.locators.COUNTRY_01;
        const request = (
          name: string,
          officeId: 'FINANCE' | 'SOCIAL',
          commandType: ManualOfficeCommandRequestDto['commandType'],
          expectedWorldVersion: string,
          payload: unknown,
        ): ManualOfficeCommandRequestDto => ({
          worldId: marker.worldId,
          countryId: marker.countryId,
          officeId,
          commandType,
          commandId: 'COMMAND_MIN_READ_' + name + '_' + n,
          idempotencyKey: 'KEY_MIN_READ_' + name + '_' + n,
          expectedWorldVersion,
          payload,
        });
        const envelope = request(
          'SET',
          'FINANCE',
          'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
          '0',
          {
            operation: 'SET_ENVELOPE',
            scope: {
              worldId: marker.worldId,
              countryId: marker.countryId,
              entityRef: policy.governmentEntityId,
              envelopeRef: policy.envelopeRef,
              effectivePeriodRef: policy.effectivePeriodRef,
            },
            currency: policy.currency,
            amount: '1000',
            envelopeRevisionRef: 'REV_MIN_READ_' + n,
            lineRef: null,
            revisionRef: 'REV_MIN_READ_' + n,
            predecessorRevisionRef: null,
          },
        );
        const fx = (name: string, version: string, amount = '100') =>
          request(
            name,
            'FINANCE',
            'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1',
            version,
            {
              schemaVersion: 'postwar-day-one-treasury-fx-command-v1',
              quoteRef: f.fxQuote.quoteRef,
              payerTreasuryAccountId: f.fxTreasuryAccountId,
              payerGcuAccountId: f.fxGovernmentGcuAccountId,
              dealerGcuAccountId: f.fxBankGcuAccountId,
              localAmount: amount,
              localCurrency: f.fxQuote.localCurrency,
              expectedQuoteSha256: f.fxQuote.quoteSha256,
            },
          );
        const intake = new PostgresOfficeCommandIntake({
          pool: ports.intakePool,
          runtime: ports.runtime,
          role: f.intakeRole,
          clock: ports.clock,
        });
        const submit = async (r: ManualOfficeCommandRequestDto) =>
          intake.submit({
            request: r,
            binding: await bindingFor(r),
            principal: f.principal,
            actor,
            signal: AbortSignal.timeout(10000),
          });
        await stage('H0_LOW_ROLE_METADATA_AND_LEGAL_EMPTY');
        const empty = await rb.read({ officeId: 'SOCIAL', dataset: 'offers' });
        expect(empty.httpStatus).toBe(200);
        expect(empty.body.status).toBe('EMPTY');
        expect((await bindingFor(envelope)).readback.worldVersion).toBe('0');
        await stage('REAL_BUDGET_THEN_FX_ONLY');
        f.connection.startPreparation();
        const firstFx = fx('FX', '1');
        const commits: unknown[] = [];
        for (const [i, r] of [envelope, firstFx].entries()) {
          expect((await submit(r)).status).toBe('QUEUED');
          const step = await f.connection.consumeOnce();
          commits.push(wire(step));
          report.commits = commits;
          expect(step).toMatchObject({
            status: 'PROCESSED',
            outcome: 'COMMITTED',
          });
          expect((await counts()).version).toBe(String(i + 1));
        }
        const h2 = await counts();
        expect(h2).toMatchObject({
          version: '2',
          sequence: '2',
          commands: '2',
          receipts: '2',
          events: '2',
          batches: '2',
          inventory: '0',
        });
        report.h2 = h2;
        await stage('ACTUAL_SOURCE_READER_COMPLETE_H2');
        const source = new PostgresSqlDatabase(f.sourcePool);
        const actual = await source.transaction(async (tx) => {
          const who = (
            await tx.query<{ role: string }>('select current_user as role')
          ).rows[0]!.role;
          expect(who).toBe(f.sourceRole);
          const meta = (
            await tx.query<Record<string, unknown>>(
              'select * from world_v2.lock_social_startup_seed_header($1,$2)',
              [marker.worldId, marker.countryId],
            )
          ).rows;
          expect(meta).toHaveLength(1);
          expect(meta[0]!.canonical_seed_sha256).toBe(
            f.header.canonical_intent_sha256,
          );
          const prefix = await readBoundedPostwarCanonicalPrefixFrom(tx, {
              worldId: marker.worldId,
              countryId: marker.countryId,
              officeId: 'SOCIAL',
            }),
            journal = await readBoundedPostwarJournalFrom(tx, {
              worldId: marker.worldId,
              countryId: marker.countryId,
              officeId: 'SOCIAL',
            });
          expect(prefix.frames).toHaveLength(2);
          expect(prefix.frames.map((x) => x.receipt.outcome)).toEqual([
            'COMMITTED',
            'COMMITTED',
          ]);
          expect(journal.rows).toHaveLength(2);
          return {
            who,
            header: meta[0],
            commands: prefix.frames.map((x) => ({
              commandId: x.command.commandId,
              commandFingerprint: x.command.fingerprint,
              eventIds: x.events.map((e) => e.eventId),
              receipt: wire(x.receipt),
            })),
            journal: {
              batchCount: journal.financialBatchCount,
              inventoryCount: journal.inventoryPostingCount,
              head: journal.head,
            },
          };
        });
        report.actualMinimalSource = actual;
        report.actualFinanceReader = await new PostgresSqlDatabase(
          f.worker,
        ).transaction(async (tx) => {
          await tx.query(
            'set local role world_v2_finance_budget_source_reader',
          );
          const who = (
            await tx.query<{ role: string }>('select current_user as role')
          ).rows[0]!.role;
          expect(who).toBe('world_v2_finance_budget_source_reader');
          const prefix = await readBoundedPostwarCanonicalPrefixFrom(tx, {
            worldId: marker.worldId,
            countryId: marker.countryId,
            officeId: 'FINANCE',
          });
          const journal = await readBoundedPostwarJournalFrom(tx, {
            worldId: marker.worldId,
            countryId: marker.countryId,
            officeId: 'FINANCE',
          });
          expect(prefix.frames).toHaveLength(2);
          expect(journal.rows).toHaveLength(2);
          return {
            who,
            head: prefix.head,
            commandIds: prefix.frames.map((f) => f.command.commandId),
            journalCount: journal.financialBatchCount,
          };
        });
        for (const table of [
          'authoritative_event',
          'command_submission',
          'command_receipt',
          'financial_posting_batch',
          'inventory_posting',
          'current_materialization',
          'opening_seed',
        ])
          await expect(
            f.sourcePool.query('select * from world_v2.' + table + ' limit 1'),
          ).rejects.toMatchObject({ code: '42501' });
        await expect(
          f.sourcePool.query(
            'select * from world_v2.read_postwar_bounded_prefix($1,$2,$3)',
            [marker.worldId, marker.countryId, 'FINANCE'],
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await stage('GENUINE_BUDGET_FX_SOCIAL_SOURCE_PREFLIGHT');
        const canonical = (r: ManualOfficeCommandRequestDto) =>
          buildManualOfficeCommandIntent({
            request: r,
            countryId: C.countryId(r.countryId),
            officeId: C.officeId(r.officeId),
            authSubject: C.authSubject(marker.subject),
            actor,
            simTime: '0',
            submittedAtReal: ports.clock.nowReal(),
            correlationId: 'CORRELATION_' + r.commandId,
          });
        const line = request(
          'LINE',
          'FINANCE',
          'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
          '2',
          {
            operation: 'APPROVE_NEW_LINE',
            scope: {
              worldId: marker.worldId,
              countryId: marker.countryId,
              entityRef: policy.governmentEntityId,
              envelopeRef: policy.envelopeRef,
              effectivePeriodRef: policy.effectivePeriodRef,
            },
            currency: policy.currency,
            amount: '1',
            envelopeRevisionRef: 'REV_MIN_READ_' + n,
            lineRef: 'LINE_MIN_READ_' + n,
            revisionRef: 'REV_LINE_MIN_READ_' + n,
            predecessorRevisionRef: null,
          },
        );
        await ports.budget.assertSourceBeforeClaim!({
          command: canonical(line),
          observedAtReal: ports.clock.nowReal(),
        });
        await ports.treasuryFx!.preflightCanonical(
          canonical(fx('UNSUBMITTED', '2', '1')),
          ports.clock.nowReal(),
        );
        const position = request(
          'POSITION',
          'SOCIAL',
          C.SOCIAL_POSITION_OFFER_CREATE_COMMAND,
          '2',
          {
            schemaVersion: 'social-employment-position-offer-create-v1',
            positionId: 'POSITION_MIN_READ_' + n,
            locationId: loc.wage.locationId,
            skill: loc.wage.skill,
            publicService: loc.wage.classificationId,
            occupation: loc.wage.occupation,
            requiredCount: '1',
            wageScheduleRef: loc.wage.positionId,
            fundingAccountId: loc.funding.accountRef,
            coverageDays: '1',
          },
        );
        await ports.socialConnection.readers.socialPosition!
          .assertSourceBeforeClaim!({
          command: canonical(position),
          observedAtReal: ports.clock.nowReal(),
        });
        expect(await counts()).toEqual(h2);
        report.sourcePreflightsWithoutWrites = [
          'BUDGET',
          'FX',
          'SOCIAL_POSITION',
        ];
        await stage('ACTUAL_CURRENT_PUBLICATION_AND_LOW_ROLE_PAGES');
        expect(
          (await rb.read({ officeId: 'FINANCE', dataset: 'treasury-capacity' }))
            .httpStatus,
        ).toBe(503);
        const pub = await rb.publish();
        expect(pub.finance).toHaveLength(10);
        expect(pub.social).toHaveLength(2);
        report.publication = wire(pub);
        const pages = [];
        for (const [officeId, dataset] of [
          ['FINANCE', 'treasury-capacity'],
          ['CENTRAL_BANK', 'ledger-balances'],
          ['SOCIAL', 'positions'],
        ] as const) {
          const page = await rb.read({ officeId, dataset });
          expect(page.httpStatus).toBe(200);
          const s = page.body.source as Record<string, unknown>;
          expect(s.worldVersion).toBe('2');
          expect(s.eventSequence).toBe('2');
          pages.push({ officeId, dataset, ...page.body });
        }
        report.currentPages = pages;
        expect(
          (
            await rb.read({
              officeId: 'FINANCE',
              dataset: 'treasury-capacity',
              subject: '00000000-0000-4000-8000-999999999999',
            })
          ).httpStatus,
        ).toBe(403);
        await expect(
          intake.submit({
            request: { ...line, countryId: 'COUNTRY_02' },
            binding: await bindingFor(line),
            principal: f.principal,
            actor,
            signal: AbortSignal.timeout(10000),
          }),
        ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
        await expect(
          f.readPool.query(
            'select canonical_payload from world_v2.opening_seed',
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          f.readPool.query(
            'select * from world_v2.postwar_mixed_current_document',
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await stage('ACTUAL_JWT_INTAKE_ROLE_FINAL_RECOVERY');
        const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
          jwk = {
            ...keys.publicKey.export({ format: 'jwk' }),
            kid: 'TEST_ONLY_MINIMAL_RECOVERY',
            alg: 'ES256',
            use: 'sig',
          },
          issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1';
        const token = (subject = marker.subject) => {
          const now = Math.floor(Date.now() / 1000),
            a = Buffer.from(
              JSON.stringify({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' }),
            ).toString('base64url'),
            b = Buffer.from(
              JSON.stringify({
                iss: issuer,
                sub: subject,
                aud: 'authenticated',
                iat: now - 1,
                exp: now + 300,
              }),
            ).toString('base64url'),
            text = a + '.' + b;
          return (
            'Bearer ' +
            text +
            '.' +
            sign('sha256', Buffer.from(text), {
              key: keys.privateKey,
              dsaEncoding: 'ieee-p1363',
            }).toString('base64url')
          );
        };
        const recovery = createBoundedOfficeCommandRecoveryService({
          readPool: f.readPool,
          readerRole: f.readRole,
          writerPool: ports.intakePool,
          writerRole: f.intakeRole,
          recoveryBindingMode: 'POSTWAR_READ_ONLY_V1',
          authorizationPublisherRole: marker.roles.authorizationPublisherRole,
          admittedWorldPins: f.admittedWorldPins,
          auth: {
            projectRef: 'abcdefghijklmnopqrst',
            expectedIssuer: issuer,
            jwksUrl: issuer + '/.well-known/jwks.json',
            audience: 'authenticated',
            fetch: async (url) => {
              const r = Response.json({ keys: [jwk] });
              Object.defineProperty(r, 'url', { value: String(url) });
              return r;
            },
          },
          runtime: ports.runtime,
          resolveActorId: async () => actor,
          clock: ports.clock,
        });
        const recover = (
          r: ManualOfficeCommandRequestDto,
          authorization = token(),
        ) =>
          recovery.handle({
            authorization,
            signal: AbortSignal.timeout(10000),
            request: {
              schemaVersion: C.AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
              requestId: randomUUID(),
              request: {
                worldId: marker.worldId,
                commandId: r.commandId,
                idempotencyKey: r.idempotencyKey,
                originalRequest: {
                  schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
                  requestId: randomUUID(),
                  request: r,
                },
              },
            },
          });
        const finals = [];
        for (const r of [envelope, firstFx]) {
          const final = await recover(r);
          report.lastRecovery = wire(final);
          expect(final.httpStatus).toBe(200);
          expect(final.body).toMatchObject({
            ok: true,
            state: { status: 'FINAL', receipt: { outcome: 'COMMITTED' } },
          });
          finals.push(wire(final));
        }
        report.recovery = finals;
        expect(
          (await recover({ ...firstFx, countryId: 'COUNTRY_02' })).httpStatus,
        ).toBe(403);
        expect(
          (
            await recover(
              firstFx,
              token('00000000-0000-4000-8000-999999999999'),
            )
          ).httpStatus,
        ).toBe(403);
        expect(await counts()).toEqual(h2);
        await stage('ACTUAL_AUTHORITY_AND_DOCUMENT_REVOCATION');
        await expect(
          f.intakePool.query(
            'update world_v2.current_commit_authorization set active=false where false',
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await f.clone.installer.query(
          "update world_v2.current_commit_authorization set active=false where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='FINANCE'and capability='FINANCE_BUDGET'",
          [marker.worldId, marker.subject, marker.countryId],
        );
        try {
          expect((await recover(envelope)).httpStatus).toBe(403);
        } finally {
          await f.clone.installer.query(
            "update world_v2.current_commit_authorization set active=true where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='FINANCE'and capability='FINANCE_BUDGET'",
            [marker.worldId, marker.subject, marker.countryId],
          );
        }
        const baseDoc = (
          await f.clone.installer.query<{ document_ref: string }>(
            "select document_ref from world_v2.postwar_office_projection_document where world_id=$1 and country_id=$2 and office_id='FINANCE'and dataset='opening-financial-legs'",
            [marker.worldId, marker.countryId],
          )
        ).rows;
        expect(baseDoc).toHaveLength(1);
        const docPublisher = await f.clone.installer.connect();
        try {
          await docPublisher.query('begin');
          await docPublisher.query(
            'set local role world_v2_postwar_projection_publisher',
          );
          await docPublisher.query(
            'select world_v2.revoke_postwar_office_projection($1,$2,$3)',
            [
              marker.worldId,
              baseDoc[0]!.document_ref,
              'TEST_ONLY_MIN_READ_DOCUMENT_REVOKE',
            ],
          );
          await docPublisher.query('commit');
        } catch (error) {
          await docPublisher.query('rollback');
          throw error;
        } finally {
          docPublisher.release();
        }
        expect(
          (await rb.read({ officeId: 'FINANCE', dataset: 'treasury-capacity' }))
            .httpStatus,
        ).toBe(503);
        report.currentDocumentRevocationDenied = true;
        await stage('CONTROLLED_REVOCATION_THEN_MINIMAL_ROLE_DENIAL');
        const publisher = await f.clone.installer.connect();
        try {
          await publisher.query('begin');
          await publisher.query(
            'set local role world_v2_social_source_publisher',
          );
          await publisher.query(
            'select world_v2.revoke_social_operating_source($1,$2,$3)',
            [
              marker.worldId,
              marker.countryId,
              'TEST_ONLY_MIN_READ_SOURCE_REVOKE',
            ],
          );
          await publisher.query('commit');
        } catch (error) {
          await publisher.query('rollback');
          throw error;
        } finally {
          publisher.release();
        }
        await expect(
          source.transaction((tx) =>
            readBoundedPostwarCanonicalPrefixFrom(tx, {
              worldId: marker.worldId,
              countryId: marker.countryId,
              officeId: 'SOCIAL',
            }),
          ),
        ).rejects.toMatchObject({
          cause: {
            code: '55000',
            message: 'JOURNAL_CURRENT_HOST_SOURCE_REVOKED',
          },
        });
        expect((await recover(firstFx)).httpStatus).toBe(200);
        expect(await counts()).toEqual(h2);
        report.status = 'ACTUAL_H2_MINIMAL_ROLE_SOURCE_CURRENT_RECOVERY_PASSED';
        report.metrics = rb.metrics;
        report.onlineQueries = rb.onlineQueries;
        report.production = false;
      } catch (error) {
        report.status = 'FAILED';
        report.error = describeError(error);
        report.databaseErrors = fixture?.databaseErrors;
        failure = error;
      } finally {
        const errors: unknown[] = [];
        try {
          await readback?.close();
        } catch (e) {
          errors.push(e);
        }
        try {
          await fixture?.cleanup();
        } catch (e) {
          errors.push(e);
        }
        if (fixture) {
          const admin = new Pool({
            host: fixture.marker.socket,
            port: fixture.marker.port,
            database: 'postgres',
            user: 'postgres',
            password: async () => '',
            ssl: false,
            max: 1,
          });
          try {
            for (const role of fixed
              .filter((r) => !beforeFixed.includes(r))
              .reverse())
              await admin.query('drop role if exists ' + role);
          } catch (e) {
            errors.push(e);
          } finally {
            await admin.end();
          }
        }
        report.cleanup = errors.length ? 'FAILED' : 'COMPLETED';
        report.cleanupErrors = errors.map(describeError);
        await writeFile(
          evidence + '/report.json',
          JSON.stringify(wire(report), null, 2) + '\n',
        );
        if (errors.length)
          failure = new AggregateError(
            failure ? [failure, ...errors] : errors,
            'MINIMAL_READ_CLEANUP_FAILED',
            { cause: failure },
          );
      }
      if (failure) throw failure;
    },
    300000,
  );
});
