/** Opt-in actual Node bootstrap -> JWT HTTP -> one fixed consumer -> FINAL.
 * Reuses the owned sealed cfc cache; no genesis/Clock/production installation.
 * The inherited fixture installs genuine sources with TEST_ONLY policy/actors. */
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import path from 'node:path';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import type { ManualOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import { createPostwarFinanceSocialFxNativeFixture } from '../support/postwar-finance-social-fx-native-fixture.js';
import { loadPostwarSocialConnectionOpeningAdoption } from '../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js';
import { createPostgresFinanceBudgetWorldCapacitySource } from '../../apps/world-worker/dist/persistence/postgres-finance-budget-capacity-source.js';
import { startPostwarOfficeNodeBootstrap } from '../../apps/world-api/src/runtime/postwar-office-node-bootstrap.js';

const enabled =
  process.env.ECONMIND_POSTWAR_OFFICE_NODE_BOOTSTRAP_NATIVE === '1';
const referenceMarker =
  '/workspace/.cloud-setup/evidence/fx-cfc-runtime-20261029/reference-db.json';
const evidence =
  '/workspace/.cloud-setup/evidence/fx-cfc-office-node-bootstrap-native-20261030';
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fixedRoles = [
  'world_v2_postwar_projection_reader',
  'world_v2_postwar_projection_publisher',
  'world_v2_postwar_projection_owner',
];
const errorTree = (value: unknown, depth = 0): unknown =>
  value instanceof Error && depth < 12
    ? {
        name: value.name,
        message: value.message,
        stack: value.stack,
        code: 'code' in value ? value.code : undefined,
        cause: errorTree(value.cause, depth + 1),
        errors:
          value instanceof AggregateError
            ? value.errors.map((e: unknown) => errorTree(e, depth + 1))
            : undefined,
      }
    : String(value);
function jwtFixture(subject: string) {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = {
    ...keys.publicKey.export({ format: 'jwk' }),
    kid: 'BOOTSTRAP_TEST_ONLY',
    alg: 'ES256',
    use: 'sig',
  };
  const projectRef = 'a'.repeat(20),
    issuer = `https://${projectRef}.supabase.co/auth/v1`,
    jwksUrl = issuer + '/.well-known/jwks.json';
  return {
    auth: {
      projectRef,
      expectedIssuer: issuer,
      jwksUrl,
      audience: 'authenticated',
      fetch: (async (url: unknown) => {
        if (String(url) !== jwksUrl)
          throw Error('TEST_ONLY_FIXED_JWKS_URL_REQUIRED');
        const response = new Response(JSON.stringify({ keys: [jwk] }), {
          headers: { 'content-type': 'application/json' },
        });
        // Match real fetch response metadata; the actual verifier pins this URL.
        Object.defineProperty(response, 'url', { value: String(url) });
        return response;
      }) as typeof fetch,
    },
    token: () => {
      const now = Math.floor(Date.now() / 1000),
        header = Buffer.from(
          JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }),
        ).toString('base64url'),
        claims = Buffer.from(
          JSON.stringify({
            sub: subject,
            iss: issuer,
            aud: 'authenticated',
            iat: now - 1,
            exp: now + 300,
          }),
        ).toString('base64url'),
        input = header + '.' + claims;
      return (
        'Bearer ' +
        input +
        '.' +
        sign('sha256', Buffer.from(input), {
          key: keys.privateKey,
          dsaEncoding: 'ieee-p1363',
        }).toString('base64url')
      );
    },
  };
}
function refusedPort(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1000, () => {
      socket.destroy();
      reject(Error('CLOSED_NODE_PORT_PROBE_TIMED_OUT'));
    });
    socket.once('connect', () => {
      socket.destroy();
      reject(Error('SHUTDOWN_LISTENER_STILL_ACCEPTS'));
    });
    socket.once('error', (e: NodeJS.ErrnoException) => {
      socket.destroy();
      if (e.code === 'ECONNREFUSED') resolve(e.code);
      else reject(e);
    });
  });
}

describe('actual explicit office Node bootstrap over existing cfc cache', () => {
  it.skipIf(!enabled)(
    'queues Budget and FX through HTTP, consumes once each, recovers FINAL and closes owned transports',
    async () => {
      // A missing marker is a blocked prerequisite, never bootstrap permission.
      await readFile(referenceMarker);
      await mkdir(evidence, { recursive: true });
      let fixture:
        | Awaited<ReturnType<typeof createPostwarFinanceSocialFxNativeFixture>>
        | undefined;
      let host:
        Awaited<ReturnType<typeof startPostwarOfficeNodeBootstrap>> | undefined;
      let failure: unknown;
      let failed = false;
      const cleanupErrors: unknown[] = [];
      let beforeRoles: string[] | undefined;
      const report: Record<string, unknown> = {
        classification: 'ACTUAL_TEST_ONLY_NODE_BOOTSTRAP_NOT_PRODUCTION',
        status: 'IN_PROGRESS',
        worldRebootstrap: false,
        worldClock: false,
      };
      const save = async (stage: string) => {
        report.stage = stage;
        await writeFile(
          path.join(evidence, 'report.json'),
          JSON.stringify(report, null, 2) + '\n',
        );
      };
      try {
        await save('OWNED_CFC_CLONE_AND_EXISTING_CONTROLLED_SOURCE_FIXTURE');
        fixture = await createPostwarFinanceSocialFxNativeFixture({
          evidenceDirectory: evidence,
        });
        const f = fixture,
          { marker } = f;
        beforeRoles = (
          await f.clone.installer.query<{ rolname: string }>(
            'select rolname from pg_roles where rolname=any($1::text[])',
            [fixedRoles],
          )
        ).rows.map((r) => r.rolname);
        for (const name of [
          'postwar-office-derived-read',
          'postwar-office-recovery-read',
        ]) {
          const sql = await readFile(
            path.join(root, 'database/proposals', name + '.sql'),
            'utf8',
          );
          await f.clone.installer.query(sql);
          report[name + 'RawSHA256'] = sha(sql);
        }
        // Only this clone's TEST_ONLY bounded login receives the fixed metadata
        // functions; neither raw seed nor authority UPDATE is granted.
        await f.clone.installer.query(
          'grant world_v2_postwar_projection_reader to ' + f.readRole,
        );
        const counts = async () =>
          (
            await f.clone.installer.query(
              `select h.world_version::text as version,h.event_sequence::text as sequence,
           (select count(*)::text from world_v2.command_submission where world_id=$1)commands,
           (select count(*)::text from world_v2.command_receipt where world_id=$1)receipts,
           (select count(*)::text from world_v2.authoritative_event where world_id=$1)events,
           (select count(*)::text from world_v2.financial_posting_batch where world_id=$1)batches,
           (select count(*)::text from world_v2.inventory_posting where world_id=$1)inventory,
           (select count(*)::text from world_v2.command_queue where world_id=$1)queues
           from world_v2.world_head h where h.world_id=$1`,
              [marker.worldId],
            )
          ).rows[0];
        const initial = await counts();
        expect(initial).toMatchObject({
          version: '0',
          sequence: '0',
          commands: '0',
          batches: '0',
        });
        // The reused fixture's source-only controller is retired before a new
        // bootstrap can own this world. It never started/consumed. Its borrowed
        // pools stay open; the real new bootstrap takes exclusive ownership.
        await f.connection.stop();
        const jwt = jwtFixture(marker.subject),
          origin = 'https://pages.example';
        await save('ACTUAL_NEW_BOOTSTRAP_OFFLINE_PREPARE_THEN_LISTEN');
        const started = performance.now();
        host = await (async () => {
          const seed = C.parseOpeningSeed(
            JSON.parse(await readFile(f.artifacts.seedFile, 'utf8')),
            sha,
          );
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
              authorizationPublisherRole:
                marker.roles.authorizationPublisherRole,
              workerId: f.workerId,
              openingAdoption,
              admittedWorldPins: {
                worldId: marker.worldId,
                seedRef: marker.seedId,
                contentHash: marker.seedFingerprint,
                admissionRef: marker.admissionRef,
                minimumWorldVersion: '0',
              },
              modelVersion: C.WORLD_MODEL_VERSION,
              auth: jwt.auth,
              clock: f.clock,
              allowedOrigins: [origin],
              resolveActorId: async (subject) =>
                subject === marker.subject ? 'ACTOR_TEST_ONLY_MIXED_FX' : null,
            },
            capacitySource: createPostgresFinanceBudgetWorldCapacitySource({
              worldId: marker.worldId,
              countries: [
                {
                  countryId: marker.countryId,
                  expectedRawSourceSHA256: f.provenance.capacitySourceSHA256,
                },
              ],
              historyMode: 'BUDGET_SOCIAL',
            }),
            startupSeed: seed,
            treasuryFx: {
              preparation: { seed, policyBytes, userReceiptBytes },
            },
          });
        })();
        report.startupMs = performance.now() - started;
        expect(host.ready()).toBe(true);
        expect(await counts()).toEqual(initial);
        const server = host,
          nonce = randomBytes(5).toString('hex').toUpperCase(),
          policy = f.c01Policy;
        const request = (
          name: string,
          commandType: ManualOfficeCommandRequestDto['commandType'],
          version: string,
          payload: unknown,
        ): ManualOfficeCommandRequestDto => ({
          worldId: marker.worldId,
          countryId: marker.countryId,
          officeId: 'FINANCE',
          commandType,
          commandId: 'COMMAND_NODE_BOOT_' + name + '_' + nonce,
          idempotencyKey: 'KEY_NODE_BOOT_' + name + '_' + nonce,
          expectedWorldVersion: version,
          payload,
        });
        const commands = [
          request('BUDGET', 'CORE_FINANCE_BUDGET_APPROPRIATION_V1', '0', {
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
            envelopeRevisionRef: 'REV_NODE_BOOT_' + nonce,
            lineRef: null,
            revisionRef: 'REV_NODE_BOOT_' + nonce,
            predecessorRevisionRef: null,
          }),
          request('FX', 'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1', '1', {
            schemaVersion: 'postwar-day-one-treasury-fx-command-v1',
            quoteRef: f.fxQuote.quoteRef,
            payerTreasuryAccountId: f.fxTreasuryAccountId,
            payerGcuAccountId: f.fxGovernmentGcuAccountId,
            dealerGcuAccountId: f.fxBankGcuAccountId,
            localAmount: '100',
            localCurrency: f.fxQuote.localCurrency,
            expectedQuoteSha256: f.fxQuote.quoteSha256,
          }),
        ];
        const envelopes = commands.map((request) => ({
          schemaVersion: 'world-authenticated-office-command-v1',
          requestId: randomUUID(),
          request,
        }));
        const call = async (route: string, body: unknown) => {
          const response = await fetch(server.origin + route, {
            method: 'POST',
            headers: {
              origin,
              authorization: jwt.token(),
              'content-type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
          });
          return { status: response.status, body: await response.json() };
        };
        await save('ACTUAL_JWT_HTTP_QUEUE_AND_SOLE_CONSUMER_TWO_STEPS');
        server.consumer.startPreparation();
        const committed: unknown[] = [];
        for (const [i, envelope] of envelopes.entries()) {
          const queued = await call('/v1/office-command', envelope);
          expect(queued).toMatchObject({
            status: 202,
            body: { ok: true, state: { status: 'QUEUED' } },
          });
          const result = await server.consumer.consumeOnce();
          expect(result).toMatchObject({
            status: 'PROCESSED',
            source: 'NEW_FINAL',
            receipt: { outcome: 'COMMITTED' },
          });
          if (result.status !== 'PROCESSED')
            throw Error('ACTUAL_PROCESSED_RECEIPT_REQUIRED');
          committed.push({
            commandId: result.commandId,
            source: result.source,
            outcome: result.receipt.outcome,
          });
          expect((await counts()).version).toBe(String(i + 1));
        }
        report.committed = committed;
        const h2 = await counts();
        expect(h2).toMatchObject({
          version: '2',
          sequence: '2',
          commands: '2',
          receipts: '2',
          events: '2',
          batches: '2',
          inventory: '0',
          queues: '2',
        });
        for (const envelope of envelopes) {
          expect(
            await call('/v1/command-recovery', {
              schemaVersion: 'world-command-recovery-v1',
              requestId: randomUUID(),
              request: {
                worldId: marker.worldId,
                commandId: envelope.request.commandId,
                idempotencyKey: envelope.request.idempotencyKey,
                originalRequest: envelope,
              },
            }),
          ).toMatchObject({
            status: 200,
            body: {
              ok: true,
              state: { status: 'FINAL', receipt: { outcome: 'COMMITTED' } },
            },
          });
          expect(await call('/v1/office-command', envelope)).toMatchObject({
            status: 200,
            body: {
              ok: true,
              state: {
                status: 'FINALIZED',
                source: 'EXISTING',
                submitted: false,
              },
            },
          });
        }
        expect(await counts()).toEqual(h2);
        report.h2 = h2;
        await save('ACTUAL_SHUTDOWN_LISTENER_AND_LOW_ROLE_SESSION_READBACK');
        const stopping = server.shutdown();
        expect(server.shutdown()).toBe(stopping);
        await stopping;
        expect(server.ready()).toBe(false);
        expect(() => server.consumer.consumeOnce()).toThrow(
          'STOPPING_OR_STOPPED',
        );
        expect(await refusedPort(server.port)).toBe('ECONNREFUSED');
        for (const p of [f.worker, f.intakePool, f.readPool, f.sourcePool]) {
          expect(p.totalCount).toBe(0);
          expect(p.idleCount).toBe(0);
        }
        const sessions = (
          await f.clone.installer.query(
            'select usename from pg_stat_activity where datname=$1 and usename=any($2::text[])',
            [
              f.clone.database,
              [f.workerRole, f.intakeRole, f.readRole, f.sourceRole],
            ],
          )
        ).rows;
        expect(sessions).toEqual([]);
        expect(await counts()).toEqual(h2);
        expect(f.idleErrors).toEqual([]);
        report.closedListener = 'ECONNREFUSED';
        report.remainingLowRoleSessions = sessions;
        report.status = 'PASS_TEST_ONLY';
      } catch (error) {
        failed = true;
        failure = error;
        report.status = 'FAILED';
        report.error = errorTree(error);
      } finally {
        const errors = cleanupErrors;
        for (const operation of [
          () => host?.shutdown(),
          () => fixture?.cleanup(),
        ])
          try {
            await operation();
          } catch (error) {
            errors.push(error);
          }
        const previousRoles = beforeRoles;
        if (fixture && previousRoles) {
          const admin = new Pool({
            host: fixture.marker.socket,
            port: fixture.marker.port,
            database: 'postgres',
            user: 'postgres',
            max: 1,
          });
          admin.on('error', (error) => errors.push(error));
          try {
            for (const role of fixedRoles.filter(
              (r) => !previousRoles.includes(r),
            ))
              await admin.query('drop role if exists ' + role);
          } catch (error) {
            errors.push(error);
          } finally {
            await admin.end().catch((error: unknown) => errors.push(error));
          }
        }
        report.cleanup = errors.length === 0;
        report.cleanupErrors = errors.map((e) => errorTree(e));
        report.databaseErrors = fixture?.databaseErrors;
        try {
          await save(String(report.stage));
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (cleanupErrors.length)
        throw new AggregateError(
          failed ? [failure, ...cleanupErrors] : cleanupErrors,
          'NODE_BOOTSTRAP_NATIVE_CLEANUP_UNCONFIRMED',
        );
      if (failed) throw failure;
    },
    240000,
  );
});
