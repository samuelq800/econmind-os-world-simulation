/** Actual HTTP/JWKS/SQL integration uses only an explicitly supplied sealed
 * TEST_ONLY native reference clone. The default-closed case needs no DB.
 * No mock SQL, production permit, persistent signing key or Clock is used. */
import { createServer, type Server } from 'node:http';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  WORLD_MODEL_VERSION,
  AUTHENTICATED_CURRENT_SEAT_PATH,
  AUTHENTICATED_CURRENT_SEAT_SCHEMA,
} from '@econmind/core';
import type { Pool, PoolClient } from 'pg';
import {
  createPostwarOfficeRuntimeFetchHandler,
  createPostwarCurrentSeatFetchHandler,
  POSTWAR_OFFICE_RUNTIME_READ_PATH,
} from '../../apps/world-api/src/runtime-preparation/postwar-office-runtime-fetch-handler.js';
import { POSTWAR_OFFICE_RUNTIME_SCHEMA } from '../../apps/world-api/src/integration/postwar-office-runtime-read-service.js';
import type { ExplicitReadPreparationConfig } from '../../apps/world-api/src/runtime-preparation/explicit-read-preparation-config.js';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
} from '../support/postwar-native-reference-db.js';
const id = '11111111-1111-4111-8111-111111111111';
const query = (dataset = 'positions', page: Record<string, unknown> = {}) => ({
  schemaVersion: POSTWAR_OFFICE_RUNTIME_SCHEMA,
  requestId: id,
  operation: 'READ_CURRENT_OFFICE_OPENING',
  officeId: 'SOCIAL',
  dataset,
  page: { limit: 2, ...page },
});
describe('postwar office Fetch default closed', () => {
  it('returns explicit unavailable at both fixed paths without DB/JWKS and declines unrelated paths', async () => {
    const page = createPostwarOfficeRuntimeFetchHandler(),
      seat = createPostwarCurrentSeatFetchHandler();
    expect(
      (
        await page(
          new Request(
            'https://read.example' + POSTWAR_OFFICE_RUNTIME_READ_PATH,
          ),
        )
      )?.status,
    ).toBe(503);
    expect(
      (
        await seat(
          new Request('https://read.example' + AUTHENTICATED_CURRENT_SEAT_PATH),
        )
      )?.status,
    ).toBe(503);
    expect(
      await page(new Request('https://read.example/unrelated')),
    ).toBeNull();
    expect(
      await page(
        new Request(
          'https://read.example' +
            POSTWAR_OFFICE_RUNTIME_READ_PATH +
            '?world=OTHER',
        ),
      ),
    ).toBeNull();
  });
});
const native = process.env.ECONMIND_SOCIAL_PREFIX_HTTP_CHECKPOINT
  ? describe
  : describe.skip;
native(
  'actual H4 two-country prefix readback → real ES256 JWT → HTTP → Chromium TEST_ONLY',
  () => {
    let checkpoint: {
      templateDatabase: string;
      referenceMarker: string;
      worldVersion: string;
      eventSequence: string;
      seedFingerprint: string;
      admissionRef: string;
      subjects: Record<string, string>;
    };
    let clone: Awaited<ReturnType<typeof clonePostwarNativeReference>>,
      marker: Awaited<ReturnType<typeof loadPostwarNativeReferenceMarker>>,
      config: ExplicitReadPreparationConfig,
      server: Server,
      base: string;
    let pageHandler: ReturnType<typeof createPostwarOfficeRuntimeFetchHandler>,
      seatHandler: ReturnType<typeof createPostwarCurrentSeatFetchHandler>;
    const metrics: {
      path: string;
      status: number;
      bytes: number;
      elapsedMs: number;
      heapDeltaBytes: number;
    }[] = [];
    const sql: string[] = [];
    const readback: Record<string, unknown> = {};
    let acquired = 0,
      released = 0,
      destroyedClients = 0;
    let abortDuringRead: AbortController | null = null;
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = {
      ...keys.publicKey.export({ format: 'jwk' }),
      kid: 'TEST_ONLY_TRANSIENT',
      alg: 'ES256',
      use: 'sig',
      key_ops: ['verify'],
    };
    function token(subject = marker.subject, audience = 'authenticated') {
      const head = Buffer.from(
          JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }),
        ).toString('base64url'),
        now = Math.floor(Date.now() / 1000);
      const payload = Buffer.from(
        JSON.stringify({
          sub: subject,
          iss: config.auth.expectedIssuer,
          aud: audience,
          iat: now - 5,
          exp: now + 300,
        }),
      ).toString('base64url');
      const data = `${head}.${payload}`;
      return `Bearer ${data}.${sign('sha256', Buffer.from(data), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    }
    async function call(
      body: unknown = query(),
      path = POSTWAR_OFFICE_RUNTIME_READ_PATH as string,
      headers: Record<string, string> = {},
    ) {
      const started = performance.now(),
        heapBefore = process.memoryUsage().heapUsed;
      const response = await fetch(base + path, {
        method: 'POST',
        headers: {
          authorization: token(),
          origin: 'https://pages.example',
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      });
      const bytes = await response.arrayBuffer();
      metrics.push({
        path,
        status: response.status,
        bytes: bytes.byteLength,
        elapsedMs: performance.now() - started,
        heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
      });
      expect(bytes.byteLength).toBeLessThanOrEqual(65536);
      return { response, body: JSON.parse(new TextDecoder().decode(bytes)) };
    }
    beforeAll(async () => {
      checkpoint = JSON.parse(
        await readFile(
          process.env.ECONMIND_SOCIAL_PREFIX_HTTP_CHECKPOINT!,
          'utf8',
        ),
      );
      marker = await loadPostwarNativeReferenceMarker(
        checkpoint.referenceMarker,
      );
      expect(checkpoint.worldVersion).toBe('4');
      expect(checkpoint.eventSequence).toBe('4');
      expect(checkpoint.seedFingerprint).toBe(marker.seedFingerprint);
      expect(checkpoint.admissionRef).toBe(marker.admissionRef);
      expect(checkpoint.subjects.COUNTRY_01).toBe(marker.subject);
      clone = await clonePostwarNativeReference(
        marker,
        'social_prefix_http',
        checkpoint.templateDatabase,
      );
      const pool = {
        async connect() {
          const client = await clone.boundedReader.connect();
          acquired++;
          return {
            query: async (q: string, args?: readonly unknown[]) => {
              sql.push(q);
              const operation = client.query(q, args ? [...args] : undefined);
              if (
                abortDuringRead &&
                q.includes('read_postwar_office_projection_seats')
              ) {
                const controller = abortDuringRead;
                abortDuringRead = null;
                queueMicrotask(() => controller.abort());
              }
              return operation;
            },
            release(destroy?: boolean) {
              released++;
              if (destroy) destroyedClients++;
              client.release(destroy);
            },
          } as unknown as PoolClient;
        },
      } as Pick<Pool, 'connect'>;
      const projectRef = 'abcdefghijklmnopqrst',
        issuer = `https://${projectRef}.supabase.co/auth/v1`;
      config = {
        pool,
        readerRole: marker.roles.boundedReaderRole,
        authorizationPublisherRole: marker.roles.authorizationPublisherRole,
        modelVersion: WORLD_MODEL_VERSION,
        endpointPins: {
          origin: 'https://read.example',
          projectionPath: POSTWAR_OFFICE_RUNTIME_READ_PATH,
          finalLookupPath: '/v1/final-receipt',
          deploymentRef: 'TEST_ONLY_BOUNDED_REFERENCE',
        },
        admittedWorldPins: {
          worldId: marker.worldId,
          seedRef: marker.seedId,
          contentHash: marker.seedFingerprint,
          admissionRef: marker.admissionRef,
          minimumWorldVersion: '0',
        },
        auth: {
          projectRef,
          expectedIssuer: issuer,
          jwksUrl: issuer + '/.well-known/jwks.json',
          audience: 'authenticated',
          fetch: async (url) => {
            expect(String(url)).toBe(issuer + '/.well-known/jwks.json');
            const response = Response.json({ keys: [jwk] });
            Object.defineProperty(response, 'url', { value: String(url) });
            return response;
          },
        },
        routeOptions: { allowedOrigins: ['https://pages.example'] },
      };
      pageHandler = createPostwarOfficeRuntimeFetchHandler(config);
      seatHandler = createPostwarCurrentSeatFetchHandler(config);
      server = createServer(async (req, res) => {
        const controller = new AbortController();
        res.on('close', () => {
          if (!res.writableEnded) controller.abort();
        });
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const request = new Request(base + req.url, {
            method: req.method ?? 'GET',
            headers: req.headers as Record<string, string>,
            ...(['GET', 'HEAD'].includes(req.method ?? 'GET')
              ? {}
              : { body: Buffer.concat(chunks) }),
            signal: controller.signal,
          });
          const response =
            (await pageHandler(request)) ?? (await seatHandler(request));
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
        server.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      if (!address || typeof address === 'string')
        throw Error('OWNED_LOOPBACK_REQUIRED');
      base = `http://127.0.0.1:${address.port}`;
    }, 30000);
    afterAll(async () => {
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      await clone?.drop();
      if (marker) {
        const directory =
          process.env.ECONMIND_SOCIAL_PREFIX_HTTP_EVIDENCE ??
          '/workspace/office-connection-evidence/postwar-social-prefix-native-development-20261028/http-browser';
        await mkdir(directory, { recursive: true });
        const artifacts = [
          'apps/world-api/src/integration/postwar-office-runtime-read-service.ts',
          'apps/world-api/src/runtime-preparation/postwar-office-runtime-fetch-handler.ts',
          'apps/world-worker/src/persistence/postwar-office-projection-store.ts',
          'database/proposals/postwar-office-derived-read.sql',
          'database/proposals/postwar-social-current-derived-read.sql',
          'database/proposals/postwar-social-current-prefix-read.sql',
          'tests/world-api/postwar-social-current-prefix-http-browser.test.ts',
          'apps/world-web/src/postwar-office-runtime/client.ts',
          'apps/world-web/src/postwar-office-runtime/view.ts',
        ];
        const hashes = await Promise.all(
          artifacts.map(async (file) => ({
            path: file,
            sha256: createHash('sha256')
              .update(
                await readFile(
                  path.resolve(import.meta.dirname, '../..', file),
                ),
              )
              .digest('hex'),
          })),
        );
        await writeFile(
          path.join(directory, 'http-receipt.json'),
          JSON.stringify(
            {
              classification: 'TEST_ONLY_ACTUAL_NATIVE_PG_HTTP_NOT_PRODUCTION',
              checkpoint,
              priorNativeOutcome:
                'FAIL_AT_EVIDENCE_JSON_SERIALIZATION_AFTER_REAL_COMMIT_AND_PUBLICATION',
              economicCommandReexecuted: false,
              coreFullReplayReexecuted: false,
              seedFingerprint: marker.seedFingerprint,
              admissionRef: marker.admissionRef,
              source:
                'SEALED_ACTUAL_GENERATED_CANONICAL_SEED_CONTROLLED_TEST_ONLY_ADMISSION',
              metrics,
              readback,
              maximumResponseBytes: Math.max(0, ...metrics.map((m) => m.bytes)),
              maximumElapsedMs: Math.max(0, ...metrics.map((m) => m.elapsedMs)),
              maximumHeapDeltaBytes: Math.max(
                0,
                ...metrics.map((m) => m.heapDeltaBytes),
              ),
              heapMeasurement:
                'Same-process request heap delta; includes JWT/HTTP test client, excludes prior offline publication; not peak RSS',
              sql: {
                acquired,
                released,
                destroyedClients,
                statements: sql,
                canonicalPayloadRead: sql.some((q) =>
                  /canonical_payload/iu.test(q),
                ),
              },
              artifacts: hashes,
              ownedHttpServerClosed: true,
              ownedDatabaseCloneDropped: true,
            },
            null,
            2,
          ),
        );
      }
    });
    it('rechecks the retained real H4 receipts, immutable coverage and exact origin materializations without full replay', async () => {
      const counts = (
        await clone.installer.query(
          `select h.world_version::text,h.event_sequence::text,(select count(*)::int from world_v2.authoritative_event where world_id=h.world_id)events,(select count(*)::int from world_v2.command_receipt where world_id=h.world_id and outcome='COMMITTED')committed,(select count(*)::int from world_v2.financial_posting_batch where world_id=h.world_id)financial,(select count(*)::int from world_v2.inventory_posting where world_id=h.world_id)inventory from world_v2.world_head h where world_id=$1`,
          [marker.worldId],
        )
      ).rows[0];
      expect(counts).toEqual({
        world_version: '4',
        event_sequence: '4',
        events: 4,
        committed: 4,
        financial: 0,
        inventory: 0,
      });
      const receipt = (
        await clone.installer.query(
          `select command_id,outcome,world_version_before::text,world_version_after::text,sim_time::text,event_ids,command_fingerprint from world_v2.command_receipt where world_id=$1 and command_id='COMMAND_ACTUAL_COUNTRY02_PREFIX_POSITION'`,
          [marker.worldId],
        )
      ).rows[0];
      expect(receipt).toMatchObject({
        outcome: 'COMMITTED',
        world_version_before: '3',
        world_version_after: '4',
        sim_time: '4000',
      });
      const rows = (
        await clone.installer.query(
          `select c.country_id,c.world_version::text,c.event_sequence::text,c.origin_world_version::text,c.origin_event_sequence::text,c.seed_fingerprint,c.admission_ref,c.prefix_fingerprint,c.effects_fingerprint,c.binding,c.materialization_hash,c.materialization_sha256,m.payload_sha256,encode(sha256(convert_to(m.canonical_payload,'UTF8')),'hex')actual_materialization_sha256,(e.canonical_payload::jsonb)->>'afterStateHash'event_after_state_hash,(select count(*)::int from world_v2.postwar_social_prefix_document d where d.coverage_ref=c.coverage_ref)documents,(select bool_and(p.page_sha256=encode(sha256(convert_to(p.rows_text,'UTF8')),'hex'))from world_v2.postwar_social_prefix_document d join world_v2.postwar_social_prefix_page p using(document_ref,world_id)where d.coverage_ref=c.coverage_ref)page_hashes_valid from world_v2.postwar_social_current_coverage c join world_v2.current_materialization m on m.world_id=c.world_id and m.materialization_key=c.materialization_key join world_v2.authoritative_event e on e.world_id=c.world_id and e.event_id=c.source_event_id where c.world_id=$1 order by c.country_id`,
          [marker.worldId],
        )
      ).rows;
      expect(rows).toHaveLength(2);
      for (const [i, r] of rows.entries()) {
        expect(r.country_id).toBe('COUNTRY_0' + (i + 1));
        expect(r.world_version).toBe('4');
        expect(r.event_sequence).toBe('4');
        expect(r.origin_world_version).toBe(String(i + 3));
        expect(r.origin_event_sequence).toBe(String(i + 3));
        expect(r.seed_fingerprint).toBe(marker.seedFingerprint);
        expect(r.admission_ref).toBe(marker.admissionRef);
        expect(r.materialization_hash).toBe(r.payload_sha256);
        expect(r.materialization_hash).toBe(r.event_after_state_hash);
        expect(r.materialization_sha256).toBe(r.actual_materialization_sha256);
        expect(r.documents).toBe(2);
        expect(r.page_hashes_valid).toBe(true);
      }
      expect(rows[0].prefix_fingerprint).toBe(rows[1].prefix_fingerprint);
      expect(rows[0].effects_fingerprint).toBe(rows[1].effects_fingerprint);
      readback.metadata = { counts, receipt, coverage: rows };
    });
    it('serves two real JWT subjects their own bounded country at global H4 with origins3/4 and rejects cross-scope continuation', async () => {
      for (const [countryId, subject] of Object.entries(checkpoint.subjects)) {
        const first = await call(query(), POSTWAR_OFFICE_RUNTIME_READ_PATH, {
          authorization: token(subject),
        });
        expect(first.response.status).toBe(200);
        expect(first.body.status).toBe('AVAILABLE');
        expect(first.body.source.countryId).toBe(countryId);
        expect(first.body.source.worldVersion).toBe('4');
        expect(first.body.source.eventSequence).toBe('4');
        expect(first.body.source.dataNature).toBe(
          'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION',
        );
        const origin = countryId === 'COUNTRY_01' ? '3' : '4';
        expect(
          first.body.source.currentStateBinding.sourceStateWorldVersion,
        ).toBe(origin);
        expect(first.body.source.currentPrefixCoverage).toMatchObject({
          countryId,
          globalWorldVersion: '4',
          globalEventSequence: '4',
          originWorldVersion: origin,
          originEventSequence: origin,
          reducerVersion: 'POSTWAR_SOCIAL_COMPLETE_PREFIX_SCOPE_V2',
        });
        expect(
          first.body.rows.every(
            (r: { countryId: string }) => r.countryId === countryId,
          ),
        ).toBe(true);
        const all = await call(
          query('positions', { limit: 100 }),
          POSTWAR_OFFICE_RUNTIME_READ_PATH,
          { authorization: token(subject) },
        );
        expect(
          all.body.rows.find(
            (r: { positionId: string }) =>
              r.positionId ===
              (countryId === 'COUNTRY_01'
                ? 'POSITION_POSTWAR_NATIVE_LAWFUL_VACANCY'
                : 'POSITION_ACTUAL_COUNTRY02_PREFIX_VACANCY'),
          ),
        ).toMatchObject({
          requiredCount: '1',
          employedCount: countryId === 'COUNTRY_01' ? '1' : '0',
        });
        const pools = await call(
          query('service-pools'),
          POSTWAR_OFFICE_RUNTIME_READ_PATH,
          { authorization: token(subject) },
        );
        expect(pools.response.status).toBe(200);
        expect(pools.body.source.currentPrefixCoverage.originWorldVersion).toBe(
          origin,
        );
        const second = await call(
          query('positions', {
            offset: first.body.page.nextOffset,
            sourceVersion: first.body.source.sourceVersion,
            bindingVersion: first.body.source.bindingVersion,
          }),
          POSTWAR_OFFICE_RUNTIME_READ_PATH,
          { authorization: token(subject) },
        );
        expect(second.response.status).toBe(200);
        const wrong = await call(
          query('positions', {
            offset: first.body.page.nextOffset,
            sourceVersion: first.body.source.sourceVersion,
            bindingVersion: first.body.source.bindingVersion,
          }),
          POSTWAR_OFFICE_RUNTIME_READ_PATH,
          {
            authorization: token(
              subject === marker.subject
                ? checkpoint.subjects.COUNTRY_02
                : marker.subject,
            ),
          },
        );
        expect(wrong.response.status).toBe(409);
        readback[countryId] = {
          source: first.body.source,
          page: first.body.page,
          position: all.body.rows.find(
            (r: { positionId: string }) =>
              r.positionId ===
              (countryId === 'COUNTRY_01'
                ? 'POSITION_POSTWAR_NATIVE_LAWFUL_VACANCY'
                : 'POSITION_ACTUAL_COUNTRY02_PREFIX_VACANCY'),
          ),
        };
      }
    });
    const browserCase =
      process.env.ECONMIND_SOCIAL_PREFIX_BROWSER_VERIFY === '1' ? it : it.skip;
    browserCase(
      'runs the actual browser session adapter and office drawer against owned HTTP and bounded SQL',
      async () => {
        // Explicit Linux capability paths are preinstalled, never downloaded here.
        const modulePath =
          '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
        const { chromium } = await import(modulePath);
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
          configFile: false,
          root: path.resolve(import.meta.dirname, '../..'),
          server: { host: '127.0.0.1', port: 0 },
          logLevel: 'error',
        });
        let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
        try {
          await vite.listen();
          const address = vite.httpServer?.address();
          if (!address || typeof address === 'string')
            throw Error('OWNED_VITE_LOOPBACK_REQUIRED');
          const moduleBase = `http://127.0.0.1:${address.port}`;
          browser = await chromium.launch({
            executablePath: '/usr/bin/chromium',
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
          });
          for (const target of [
            {
              country: 'COUNTRY_01',
              subject: marker.subject,
              position: 'POSITION_POSTWAR_NATIVE_LAWFUL_VACANCY',
              employed: '1',
            },
            {
              country: 'COUNTRY_02',
              subject: checkpoint.subjects.COUNTRY_02!,
              position: 'POSITION_ACTUAL_COUNTRY02_PREFIX_VACANCY',
              employed: '0',
            },
          ]) {
            const page = await browser.newPage();
            const bearer = token(target.subject);
            const values = {
              token: bearer.slice(7),
              subject: target.subject,
              world: config.admittedWorldPins,
              endpoints: config.endpointPins,
              country: target.country,
            };
            const html = `<!doctype html><meta charset="utf-8"><title>TEST_ONLY actual admitted bounded office read</title><main class="country-game" data-country="01" data-office="social"><nav class="national-tools"></nav></main><script type="module">
import { installOfficeProjection } from '/apps/world-web/src/office-projection/view.ts';
import { installFinancialIntake } from '/apps/world-web/src/financial-intake/view.ts';
import { installTrustedHost } from '/apps/world-web/src/trusted-host/bootstrap.ts';
import { installFormalSessionAdapter } from '/apps/world-web/src/trusted-host/formal-session-adapter.ts';
const values = ${JSON.stringify(values)};
const projection = installOfficeProjection(document, window), financial = installFinancialIntake(document, window);
const host = installTrustedHost(document, window, { projection, financial, localTrade: { disconnect() {} } });
const adapter = installFormalSessionAdapter(document, window, host);
const expiresAtEpochSeconds = Math.floor(Date.now()/1000)+120;
const configured = adapter.configure({ auth: { currentSession: () => ({ subject: values.subject, sessionRef: 'TEST_ONLY_BROWSER_SESSION', expiresAtEpochSeconds }), getAccessToken: async () => values.token, subscribe: () => () => {} }, seats: { readSeat: async ({requestId, accessToken, signal}) => { const response = await fetch('https://read.example/v1/current-seat', {method:'POST',headers:{authorization:'Bearer '+accessToken,'content-type':'application/json'},body:JSON.stringify({schemaVersion:'${AUTHENTICATED_CURRENT_SEAT_SCHEMA}',requestId}),signal}); return response.json(); } }, targets: {read: values.endpoints}, world: values.world, countryIdsByDisplayId: {'01':values.country} });
window.testReadback = { configured, connected: await adapter.bindCurrentView(), projection, adapter };
</script>`;
            type Route = {
              request(): {
                url(): string;
                method(): string;
                headers(): Record<string, string>;
                postData(): string | null;
              };
              fulfill(options: {
                status: number;
                headers?: Record<string, string>;
                body: string | Buffer;
              }): Promise<void>;
            };
            await page.route(
              'https://pages.example/**',
              async (route: Route) => {
                const url = new URL(route.request().url());
                if (url.pathname === '/') {
                  await route.fulfill({
                    status: 200,
                    headers: { 'content-type': 'text/html' },
                    body: html,
                  });
                  return;
                }
                const response = await fetch(
                  moduleBase + url.pathname + url.search,
                );
                await route.fulfill({
                  status: response.status,
                  headers: Object.fromEntries(response.headers),
                  body: Buffer.from(await response.arrayBuffer()),
                });
              },
            );
            await page.route(
              'https://read.example/**',
              async (route: Route) => {
                const req = route.request();
                const started = performance.now(),
                  before = process.memoryUsage().heapUsed;
                const response = await fetch(
                  base + new URL(req.url()).pathname,
                  {
                    method: req.method(),
                    headers: req.headers(),
                    body: req.postData(),
                  },
                );
                const bytes = Buffer.from(await response.arrayBuffer());
                metrics.push({
                  path: 'CHROMIUM:' + new URL(req.url()).pathname,
                  status: response.status,
                  bytes: bytes.byteLength,
                  elapsedMs: performance.now() - started,
                  heapDeltaBytes: process.memoryUsage().heapUsed - before,
                });
                await route.fulfill({
                  status: response.status,
                  headers: Object.fromEntries(response.headers),
                  body: bytes,
                });
              },
            );
            await page.goto('https://pages.example/');
            await page.waitForFunction(
              () =>
                (window as unknown as { testReadback?: { connected: boolean } })
                  .testReadback?.connected === true,
            );
            const expected = await call(
              query(),
              POSTWAR_OFFICE_RUNTIME_READ_PATH,
              { authorization: token(target.subject) },
            );
            const position = target.position;
            const firstPosition = String(expected.body.rows[0].positionId);
            const showMatchedPosition = async () => {
              for (let i = 0; i < 5; i++) {
                if (
                  await page
                    .getByRole('cell', { name: position, exact: true })
                    .count()
                )
                  return;
                const next = page.getByRole('button', {
                  name: 'Next authorized page',
                  exact: true,
                });
                expect(await next.isEnabled()).toBe(true);
                await next.click();
                await page.waitForFunction(
                  (first: number) =>
                    document
                      .querySelector('[data-postwar-runtime-readout]')
                      ?.textContent?.includes('Rows ' + first + '–'),
                  (i + 1) * 25 + 1,
                );
              }
              throw Error(
                'ACTUAL_MATCHED_POSITION_NOT_FOUND_WITHIN_BOUNDED_PAGES',
              );
            };

            await page.locator('[data-office-projection-entry]').click();
            await page
              .getByRole('button', {
                name: 'Read current authorized page',
                exact: true,
              })
              .click();
            await page
              .getByRole('cell', { name: firstPosition, exact: true })
              .waitFor();
            await showMatchedPosition();
            await page
              .getByRole('cell', { name: position, exact: true })
              .waitFor();
            const actualRow = page.getByRole('row').filter({
              has: page.getByRole('cell', { name: position, exact: true }),
            });
            const cells = await actualRow.locator('td').allTextContents();
            expect(cells[5]).toBe('1');
            expect(cells[6]).toBe(target.employed);
            const screenDirectory =
              process.env.ECONMIND_SOCIAL_PREFIX_HTTP_EVIDENCE!;
            await mkdir(screenDirectory, { recursive: true });
            await page.screenshot({
              path: path.join(
                screenDirectory,
                target.country + '-h4-position.png',
              ),
              fullPage: true,
            });
            // A real browser reload discards the prior UI; the session adapter
            // reacquires current seats and reads the actual current page again.
            await page.reload();
            await page.waitForFunction(
              () =>
                (window as unknown as { testReadback?: { connected: boolean } })
                  .testReadback?.connected === true,
            );
            await page.locator('[data-office-projection-entry]').click();
            await page
              .getByRole('button', {
                name: 'Read current authorized page',
                exact: true,
              })
              .click();
            await page
              .getByRole('cell', { name: firstPosition, exact: true })
              .waitFor();
            await showMatchedPosition();
            await page
              .getByRole('cell', { name: position, exact: true })
              .waitFor();
            await page.screenshot({
              path: path.join(
                screenDirectory,
                target.country + '-h4-after-reload.png',
              ),
              fullPage: true,
            });
            expect(
              await page
                .locator('[data-postwar-runtime-readout]')
                .textContent(),
            ).toContain('Committed current state · World version 4');
            const reloadedCells = await page
              .getByRole('row')
              .filter({
                has: page.getByRole('cell', { name: position, exact: true }),
              })
              .locator('td')
              .allTextContents();
            expect(reloadedCells[5]).toBe('1');
            expect(reloadedCells[6]).toBe(target.employed);
            await clone.installer.query(
              'update world_v2.projection_entitlement set active=false,revoked_at=now() where world_id=$1 and auth_subject=$2::uuid',
              [marker.worldId, target.subject],
            );
            try {
              await page
                .getByRole('button', {
                  name: 'Read current authorized page',
                  exact: true,
                })
                .click();
              await page
                .getByRole('cell', { name: position, exact: true })
                .waitFor({ state: 'detached' });
              expect(
                await page
                  .locator('[data-office-projection-dialog]')
                  .textContent(),
              ).not.toContain(position);
            } finally {
              await clone.installer.query(
                'update world_v2.projection_entitlement set active=true,revoked_at=null where world_id=$1 and auth_subject=$2::uuid',
                [marker.worldId, target.subject],
              );
            }
            await page.close();
          }
        } finally {
          await browser?.close();
          await vite.close();
        }
      },
    );
    it('keeps raw seed/private table SQL denied and releases every real request connection', async () => {
      await expect(
        clone.boundedReader.query(
          'select canonical_payload from world_v2.opening_seed where world_id=$1',
          [marker.worldId],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        clone.boundedReader.query(
          'select jsonb_agg(scope_document)from world_v2.postwar_social_prefix_scope',
        ),
      ).rejects.toMatchObject({ code: '42501' });
      expect(sql.some((q) => /canonical_payload/iu.test(q))).toBe(false);
      expect(acquired).toBeGreaterThan(0);
      expect(released).toBe(acquired);
      await clone.installer.query(
        'update world_v2.projection_entitlement set active=false,revoked_at=now()where world_id=$1 and auth_subject=$2::uuid',
        [marker.worldId, checkpoint.subjects.COUNTRY_02],
      );
      try {
        const denied = await call(query(), POSTWAR_OFFICE_RUNTIME_READ_PATH, {
          authorization: token(checkpoint.subjects.COUNTRY_02),
        });
        expect(denied.response.status).toBeGreaterThanOrEqual(400);
      } finally {
        await clone.installer.query(
          'update world_v2.projection_entitlement set active=true,revoked_at=null where world_id=$1 and auth_subject=$2::uuid',
          [marker.worldId, checkpoint.subjects.COUNTRY_02],
        );
      }
    });
  },
);
