/** Opt-in real standard Node listener → Social HTTP intake → durable queue →
 * genuine single consumer → recovery, across two clean API restarts. No direct
 * repository submission/commit, fake source, Finance consumer or WorldClock. */
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATED_OFFICE_COMMAND_PATH,
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
} from '@econmind/core/authenticated-office-command-contract';
import {
  AUTHENTICATED_COMMAND_RECOVERY_PATH,
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
} from '@econmind/core';
import {
  createPostwarSocialNodeNativeFixture,
  startPostwarSocialNodeNativeHost,
} from '../support/postwar-social-node-native-fixture.js';
import { serializePostwarSocialPrefixEvidence } from '../support/postwar-social-prefix-evidence-json.js';

const h3 = process.env.ECONMIND_SOCIAL_NODE_H3_CHECKPOINT,
  scopes = process.env.ECONMIND_SOCIAL_NODE_SCOPE_CHECKPOINT;
const native = h3 && scopes ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const assertOnlineQueryBounds = (inspection: Record<string, unknown>) => {
  if (!Array.isArray(inspection.queries))
    throw Error('ACTUAL_QUERY_METRICS_REQUIRED');
  const online = inspection.queries.filter(
    (q: Record<string, unknown>) => q.phase === 'ONLINE',
  );
  expect(
    online.some(
      (q: Record<string, unknown>) =>
        typeof q.sql === 'string' &&
        /canonical_payload[\s\S]*from\s+world_v2\.opening_seed/iu.test(q.sql),
    ),
  ).toBe(false);
  for (const q of online) {
    if (q.error) continue;
    expect(typeof q.maxRowBytes).toBe('number');
    expect(Number.isSafeInteger(q.maxRowBytes)).toBe(true);
    expect(q.maxRowBytes).toBeGreaterThanOrEqual(0);
  }
};

native('standard Node actual Social queue and restart recovery', () => {
  it('persists queued work across shutdown, commits through only the genuine Social consumer, then recovers and deduplicates after another restart', async () => {
    const directory =
      process.env.ECONMIND_SOCIAL_NODE_NATIVE_EVIDENCE_DIR ??
      '/workspace/office-connection-evidence/postwar-social-node-native-development-20261029';
    const report: Record<string, unknown> = {
      classification: 'TEST_ONLY_NATIVE_STANDARD_NODE_SOCIAL_NOT_PRODUCTION',
      status: 'RUNNING',
      h3Checkpoint: h3,
      scopeCheckpoint: scopes,
      WorldClock: false,
      productionVerifiedOffices: 0,
      productionOfficeDenominator: 6,
      plannedConsumerFamilies: ['SOCIAL_ONLY'],
      consumerFamiliesStarted: [],
      databaseRestartPerformed: false,
      restartMeaning:
        'INDEPENDENT_NODE_OS_PROCESS_RECREATION_NO_SHARED_WEAKMAP_OR_SOURCE_CACHE_NOT_PG_RESTART',
    };
    const stages: { stage: string; at: string }[] = [];
    report.stages = stages;
    const checkpoint = async (stage: string) => {
      stages.push({ stage, at: new Date().toISOString() });
      console.info('SOCIAL_NODE_NATIVE_STAGE:' + stage);
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'progress.json'),
        serializePostwarSocialPrefixEvidence(report),
      );
    };
    let fixture:
        | Awaited<ReturnType<typeof createPostwarSocialNodeNativeFixture>>
        | undefined,
      host:
        | Awaited<ReturnType<typeof startPostwarSocialNodeNativeHost>>
        | undefined;
    const cleanupFailures: string[] = [];
    const sourceHashes: Record<string, string> = {};
    for (const file of [
      'tests/support/postwar-social-node-native-fixture.ts',
      'tests/world-api/postwar-social-node-native.test.ts',
      'tools/office-connection/native-social-node-host.mjs',
      'apps/world-api/src/runtime.ts',
      'apps/world-api/src/runtime/postwar-social-connection.ts',
      'apps/world-api/src/runtime/postwar-finance-node-route.ts',
      'apps/world-worker/src/runtime-preparation/social-runtime-connection.ts',
      'database/proposals/social-intake-authorization.sql',
      'apps/world-api/dist/runtime.js',
      'apps/world-api/dist/runtime/postwar-social-connection.js',
      'apps/world-api/dist/runtime/postwar-finance-node-route.js',
      'apps/world-api/dist/runtime/postwar-office-command-fetch-handler.js',
      'apps/world-worker/dist/runtime-preparation/social-runtime-connection.js',
      'apps/world-worker/dist/persistence/postwar-social-position-runtime.js',
      'apps/world-worker/dist/persistence/social-intake-authorization.js',
      'apps/world-worker/src/persistence/prepared-postwar-social-source.ts',
      'apps/world-worker/src/persistence/bounded-postwar-social-lineage.ts',
      'apps/world-worker/dist/persistence/prepared-postwar-social-source.js',
      'apps/world-worker/dist/persistence/bounded-postwar-social-lineage.js',
      'apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.ts',
      'apps/world-worker/dist/persistence/durable-v08-ledger-lineage-reader.js',
      'apps/world-worker/src/persistence/postwar-social-materialization.ts',
      'apps/world-worker/dist/persistence/postwar-social-materialization.js',
      'apps/world-worker/src/persistence/current-materialization-observation.ts',
      'apps/world-worker/src/persistence/atomic-transition-repository.ts',
      'packages/core/src/commands/finance-social-prepared-ledger.ts',
      'packages/core/dist/commands/finance-social-prepared-ledger.js',
    ])
      sourceHashes[file] = sha(await readFile(path.join(root, file), 'utf8'));
    report.sourceHashes = sourceHashes;
    try {
      fixture = await createPostwarSocialNodeNativeFixture({
        h3Checkpoint: h3!,
        scopeCheckpoint: scopes!,
      });
      const f = fixture;
      await checkpoint('OWN_CLONE_SCHEMA_AND_ACTUAL_PINS_READY');
      Object.assign(report, {
        ownedDatabase: f.clone.database,
        referenceMarker: f.marker.markerPath,
        seedFingerprint: f.marker.seedFingerprint,
        admissionRef: f.marker.admissionRef,
        locator: f.locator,
        serverClockBinding: f.serverClockBinding,
        roles: f.roles,
        actualPermissionReadback: f.permissions,
      });
      for (const role of f.permissions) {
        expect(role.authority_update).toBe(false);
        expect(role.authority_revision_update).toBe(false);
        expect(role.entitlement_update).toBe(false);
        expect(role.entitlement_active_update).toBe(false);
        if (role.role === f.roles.bounded || role.role === f.roles.intake)
          expect(role.raw_seed).toBe(false);
      }
      const project = 'abcdefghijklmnopqrst',
        issuer = `https://${project}.supabase.co/auth/v1`,
        jwksUrl = issuer + '/.well-known/jwks.json',
        key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
        jwk = {
          ...key.publicKey.export({ format: 'jwk' }),
          kid: 'TEST_ONLY_SOCIAL_NODE',
          alg: 'ES256',
          use: 'sig',
          key_ops: ['verify'],
        };
      const token = (subject = f.marker.subject) => {
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
            key: key.privateKey,
            dsaEncoding: 'ieee-p1363',
          }).toString('base64url')
        );
      };
      const processes: Record<string, unknown>[] = [];
      const launch = async () => {
        host = await startPostwarSocialNodeNativeHost({
          ...f.nodeConfiguration,
          auth: { projectRef: project, expectedIssuer: issuer, jwksUrl, jwk },
        });
        processes.push(host.info);
        report.independentOsProcesses = processes;
        await checkpoint('OS_NODE_LISTENING_' + String(host.info.pid));
        expect(host.info.consumerState).toBe('PREPARED');
        expect(host.info.frozenSimTime).toBe(f.serverClockBinding.simTime);
        expect(host.info.preparation).toMatchObject({
          method: 'PRODUCT_POSTWAR_SOCIAL_CONNECTION_PREPARE',
          callerSeedOrReadyProvided: false,
          consumerState: 'PREPARED',
        });
        const health = await (
          await fetch(String(host.info.origin) + '/healthz')
        ).json();
        expect(health).toMatchObject({
          postwarSocial: { routeInstalled: true, productionReady: false },
        });
      };
      const retire = async () => {
        if (!host) return;
        const retiring = host;
        let inspected: Record<string, unknown> | undefined;
        try {
          inspected = await retiring.ask('inspect');
          assertOnlineQueryBounds(inspected);
        } finally {
          const closed = await retiring.stop();
          processes.push({
            inspected,
            closed,
            diagnostics: retiring.diagnostics(),
          });
          host = undefined;
        }
      };
      const metrics: Record<string, unknown>[] = [];
      report.http = metrics;
      const call = async (
        endpoint: string,
        body: unknown,
        bearer = token(),
        origin = 'https://pages.example',
      ) => {
        if (!host) throw Error('ACTUAL_NODE_LISTENER_REQUIRED');
        const started = performance.now(),
          response = await fetch(String(host.info.origin) + endpoint, {
            method: 'POST',
            headers: {
              authorization: 'Bearer ' + bearer,
              origin,
              'content-type': 'application/json',
            },
            body: JSON.stringify(body),
          }),
          text = await response.text();
        metrics.push({
          path: endpoint,
          status: response.status,
          responseBytes: Buffer.byteLength(text),
          milliseconds: performance.now() - started,
        });
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        return {
          status: response.status,
          body: JSON.parse(text) as Record<string, unknown>,
        };
      };
      const originalRequest = {
        schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
        requestId: randomUUID(),
        request: f.request,
      };
      const recovery = () => ({
        schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
        requestId: randomUUID(),
        request: {
          worldId: f.marker.worldId,
          commandId: f.request.commandId,
          idempotencyKey: f.request.idempotencyKey,
          originalRequest,
        },
      });
      await launch();
      const queued = await call(
        AUTHENTICATED_OFFICE_COMMAND_PATH,
        originalRequest,
      );
      report.queued = queued;
      await checkpoint('HTTP_QUEUE_RESPONSE_' + queued.status);
      expect(queued).toMatchObject({
        status: 202,
        body: {
          ok: true,
          state: { status: 'QUEUED', source: 'NEW', submitted: true },
        },
      });
      expect(
        (await call(AUTHENTICATED_COMMAND_RECOVERY_PATH, recovery())).body,
      ).toMatchObject({ ok: true, state: { status: 'QUEUED' } });
      await retire();
      await launch();
      expect(
        (await call(AUTHENTICATED_COMMAND_RECOVERY_PATH, recovery())).body,
      ).toMatchObject({ ok: true, state: { status: 'QUEUED' } });
      const step = await host!.ask('consume');
      report.consumerFamiliesStarted = ['SOCIAL_ONLY'];
      // Evidence serializer converts domain times/BigInt only for diagnostics.
      // No serialized copy is fed back into Core or persistence.
      report.consumerStep = step;
      await checkpoint('GENUINE_CONSUMER_RETURNED_' + String(step.status));
      expect(step).toMatchObject({
        status: 'PROCESSED',
        receipt: {
          outcome: 'COMMITTED',
          worldVersionBefore: '3',
          worldVersionAfter: '4',
          simTime: f.serverClockBinding.simTime,
        },
      });
      const final = await call(AUTHENTICATED_COMMAND_RECOVERY_PATH, recovery());
      expect(final).toMatchObject({
        status: 200,
        body: {
          ok: true,
          state: {
            status: 'FINAL',
            receipt: {
              outcome: 'COMMITTED',
              worldVersionBefore: '3',
              worldVersionAfter: '4',
              simTime: f.serverClockBinding.simTime,
            },
          },
        },
      });
      report.final = final;
      await retire();
      await launch();
      const recovered = await call(
        AUTHENTICATED_COMMAND_RECOVERY_PATH,
        recovery(),
      );
      expect(recovered.status).toBe(final.status);
      expect(recovered.body.state).toEqual(final.body.state);
      report.restartRecovery = recovered;
      await checkpoint(
        'THIRD_OS_PROCESS_RECOVERY_RESPONSE_' + recovered.status,
      );
      expect(
        (await call(AUTHENTICATED_OFFICE_COMMAND_PATH, originalRequest)).body,
      ).toMatchObject({
        ok: true,
        state: { status: 'FINALIZED', source: 'EXISTING', submitted: false },
      });
      expect(
        (
          await call(
            AUTHENTICATED_COMMAND_RECOVERY_PATH,
            recovery(),
            'invalid.jwt.signature',
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await call(
            AUTHENTICATED_COMMAND_RECOVERY_PATH,
            recovery(),
            token('22222222-2222-4222-8222-222222222222'),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await call(
            AUTHENTICATED_OFFICE_COMMAND_PATH,
            originalRequest,
            token(),
            'https://unapproved.example',
          )
        ).status,
      ).toBe(403);
      const counts = await f.clone.installer.query(
        `select h.world_version::text,h.event_sequence::text,(select count(*)::text from world_v2.authoritative_event where world_id=$1)events,(select count(*)::text from world_v2.command_receipt where world_id=$1 and command_id=$2)receipts,(select count(*)::text from world_v2.command_submission where world_id=$1 and command_id=$2)commands,(select queue_state from world_v2.command_queue where world_id=$1 and command_id=$2)queue_state,(select count(*)::text from world_v2.inventory_posting where world_id=$1)inventory,(select count(*)::text from world_v2.financial_posting_batch where world_id=$1)financial from world_v2.world_head h where h.world_id=$1`,
        [f.marker.worldId, f.request.commandId],
      );
      expect(counts.rows).toEqual([
        {
          world_version: '4',
          event_sequence: '4',
          events: '4',
          receipts: '1',
          commands: '1',
          queue_state: 'FINALIZED',
          inventory: '0',
          financial: '0',
        },
      ]);
      expect(
        new Set(
          processes
            .filter((p) => p.type === 'LISTENING_TEST_ONLY')
            .map((p) => p.pid),
        ).size,
      ).toBe(3);
      report.independentOsProcesses = processes;
      Object.assign(report, {
        status: 'PASS',
        actualCounts: counts.rows,
        http: metrics,
        apiRestarts: 2,
        independentOsProcesses: processes,
        distinctOsProcessCount: new Set(
          processes
            .filter((p) => p.type === 'LISTENING_TEST_ONLY')
            .map((p) => p.pid),
        ).size,
        privateKeyPersisted: false,
      });
    } catch (error) {
      report.status = 'FAIL';
      report.failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      try {
        if (host) {
          const retiring = host;
          try {
            report.finalProcessInspection = await retiring.ask('inspect');
            assertOnlineQueryBounds(
              report.finalProcessInspection as Record<string, unknown>,
            );
          } finally {
            report.finalProcessCleanup = await retiring.stop();
            host = undefined;
          }
        }
      } catch (error) {
        cleanupFailures.push(
          error instanceof Error ? error.message : String(error),
        );
      }
      if (fixture)
        try {
          report.postAttemptDurableMetadata = (
            await fixture.clone.installer.query(
              'select h.world_version::text,h.event_sequence::text,(select count(*)::text from world_v2.command_submission where world_id=$1 and command_id=$2)commands,(select count(*)::text from world_v2.command_queue where world_id=$1 and command_id=$2)queue,(select queue_state from world_v2.command_queue where world_id=$1 and command_id=$2)queue_state,(select count(*)::text from world_v2.command_receipt where world_id=$1 and command_id=$2)receipts from world_v2.world_head h where h.world_id=$1',
              [fixture.marker.worldId, fixture.request.commandId],
            )
          ).rows;
        } catch (error) {
          cleanupFailures.push(
            'POST_ATTEMPT_METADATA_READ:' +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      try {
        await fixture?.cleanup();
      } catch (error) {
        cleanupFailures.push(
          error instanceof Error ? error.message : String(error),
        );
      }
      report.cleanupFailures = cleanupFailures;
      report.idleErrors = fixture?.idleErrors ?? [];
      if (cleanupFailures.length) report.status = 'FAIL';
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'report.json'),
        serializePostwarSocialPrefixEvidence(report),
      );
      expect(cleanupFailures).toEqual([]);
      expect(fixture?.idleErrors ?? []).toEqual([]);
    }
  }, 600000);
});
