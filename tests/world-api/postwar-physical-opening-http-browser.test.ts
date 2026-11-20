/** Actual bounded H3 source → ES256 JWT → HTTP → Chromium. Opt-in owned
 * persistent reference only; no whole-seed query, Core replay or production. */
import { createServer, type Server } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WORLD_MODEL_VERSION,
  AUTHENTICATED_CURRENT_SEAT_SCHEMA,
} from '@econmind/core';
import type { Pool, PoolClient } from 'pg';
import {
  createPostwarOfficeRuntimeFetchHandler,
  createPostwarCurrentSeatFetchHandler,
  POSTWAR_OFFICE_RUNTIME_READ_PATH,
} from '../../apps/world-api/src/runtime-preparation/postwar-office-runtime-fetch-handler.js';
import type { ExplicitReadPreparationConfig } from '../../apps/world-api/src/runtime-preparation/explicit-read-preparation-config.js';
import { createPreparedPhysicalOpeningHttpNativeFixture } from '../support/postwar-physical-opening-http-native-fixture.js';
const h3 = process.env.ECONMIND_POSTWAR_PHYSICAL_HTTP_H3_TEMPLATE;
const h0 = process.env.ECONMIND_POSTWAR_PHYSICAL_HTTP_H0_TEMPLATE;
const prepared =
  process.env.ECONMIND_POSTWAR_PHYSICAL_HTTP_PREPARED_V2_TEMPLATE;
const requested =
  prepared !== undefined || h3 !== undefined || h0 !== undefined;
describe('physical historical HTTP remains closed without a server composition', () => {
  it('does not create a connected read endpoint from request selectors', async () => {
    const handler = createPostwarOfficeRuntimeFetchHandler();
    const response = await handler(
      new Request('https://read.example' + POSTWAR_OFFICE_RUNTIME_READ_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId: 'INDUSTRY',
          dataset: 'opening-inventory-entries',
        }),
      }),
    );
    expect(response?.status).toBe(503);
  });
});
describe.skipIf(!requested)(
  'actual physical H3 historical source over JWT HTTP and Chromium',
  () => {
    it('preserves five original datasets and current authorization without presenting historical quantities as current state', async () => {
      if (!prepared || h3 || h0)
        throw Error(
          'EXPLICIT_PREPARED_V2_TEMPLATE_REQUIRED_LEGACY_H3_IS_NOT_REPAIRED',
        );
      const out =
        process.env.ECONMIND_POSTWAR_PHYSICAL_HTTP_EVIDENCE_DIR ??
        `/tmp/postwar-physical-http-${Date.now()}`;
      await mkdir(out, { recursive: true });
      const fixture =
        await createPreparedPhysicalOpeningHttpNativeFixture(prepared);
      const { marker, clone } = fixture;
      const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
        jwk = {
          ...keys.publicKey.export({ format: 'jwk' }),
          kid: 'TEST_ONLY_EPHEMERAL_PHYSICAL_HTTP',
          alg: 'ES256',
          use: 'sig',
          key_ops: ['verify'],
        };
      const issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1';
      const statements: string[] = [],
        metrics: {
          path: string;
          status: number;
          bytes: number;
          milliseconds: number;
        }[] = [];
      let acquired = 0,
        released = 0,
        base = '',
        server: Server | undefined;
      let browser: { close(): Promise<void> } | undefined,
        vite: { close(): Promise<void> } | undefined,
        failure: unknown;
      const report: Record<string, unknown> = {
        classification:
          'TEST_ONLY_ACTUAL_H3_HISTORICAL_PHYSICAL_JWT_HTTP_CHROMIUM_NOT_CURRENT_STATE_OR_PRODUCTION',
        source: fixture.sourceEvidence,
        WorldClock: false,
        production: false,
      };
      const config: ExplicitReadPreparationConfig = {
        pool: {
          async connect() {
            const c = await clone.boundedReader.connect();
            acquired++;
            return {
              async query(q: string, args?: readonly unknown[]) {
                statements.push(q);
                return c.query(q, args ? [...args] : undefined);
              },
              release(destroy?: boolean) {
                released++;
                c.release(destroy);
              },
            } as unknown as PoolClient;
          },
        } as Pick<Pool, 'connect'>,
        readerRole: marker.roles.boundedReaderRole,
        authorizationPublisherRole: marker.roles.authorizationPublisherRole,
        modelVersion: WORLD_MODEL_VERSION,
        endpointPins: {
          origin: 'https://read.example',
          projectionPath: POSTWAR_OFFICE_RUNTIME_READ_PATH,
          finalLookupPath: '/v1/final-receipt',
          deploymentRef: 'TEST_ONLY_PHYSICAL_HTTP',
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
          fetch: async (url) => {
            expect(String(url)).toBe(issuer + '/.well-known/jwks.json');
            const r = Response.json({ keys: [jwk] });
            Object.defineProperty(r, 'url', { value: String(url) });
            return r;
          },
        },
        routeOptions: { allowedOrigins: ['https://pages.example'] },
      };
      function token(subject = marker.subject, audience = 'authenticated') {
        const head = Buffer.from(
            JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }),
          ).toString('base64url'),
          now = Math.floor(Date.now() / 1000),
          payload = Buffer.from(
            JSON.stringify({
              sub: subject,
              iss: issuer,
              aud: audience,
              iat: now - 5,
              exp: now + 300,
            }),
          ).toString('base64url'),
          bytes = head + '.' + payload;
        return (
          bytes +
          '.' +
          sign('sha256', Buffer.from(bytes), {
            key: keys.privateKey,
            dsaEncoding: 'ieee-p1363',
          }).toString('base64url')
        );
      }
      const query = (officeId: string, dataset: string) => ({
        schemaVersion: 'postwar-office-runtime-read-v1',
        requestId: '11111111-1111-4111-8111-111111111111',
        operation: 'READ_CURRENT_OFFICE_OPENING',
        officeId,
        dataset,
        page: { limit: 25 } as Record<string, unknown>,
      });
      async function call(
        body: unknown,
        options: { pathname?: string; bearer?: string; origin?: string } = {},
      ) {
        const pathname = options.pathname ?? POSTWAR_OFFICE_RUNTIME_READ_PATH,
          start = performance.now();
        const response = await fetch(base + pathname, {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + (options.bearer ?? token()),
            origin: options.origin ?? 'https://pages.example',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        const bytes = Buffer.from(await response.arrayBuffer());
        metrics.push({
          path: pathname,
          status: response.status,
          bytes: bytes.length,
          milliseconds: performance.now() - start,
        });
        expect(bytes.length).toBeLessThanOrEqual(65536);
        return { response, body: JSON.parse(bytes.toString()) };
      }
      try {
        const pages = createPostwarOfficeRuntimeFetchHandler(config),
          seats = createPostwarCurrentSeatFetchHandler(config);
        server = createServer(async (req, res) => {
          try {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(Buffer.from(c));
            const request = new Request(base + req.url, {
              method: req.method ?? 'GET',
              headers: req.headers as Record<string, string>,
              ...(['GET', 'HEAD'].includes(req.method ?? 'GET')
                ? {}
                : { body: Buffer.concat(chunks) }),
            });
            const result = (await pages(request)) ?? (await seats(request));
            if (!result) {
              res.writeHead(404).end();
              return;
            }
            res.writeHead(result.status, Object.fromEntries(result.headers));
            res.end(Buffer.from(await result.arrayBuffer()));
          } catch {
            res.writeHead(503).end();
          }
        });
        await new Promise<void>((resolve) =>
          server!.listen(0, '127.0.0.1', resolve),
        );
        const a = server.address();
        if (!a || typeof a === 'string') throw Error('OWNED_LOOPBACK_REQUIRED');
        base = 'http://127.0.0.1:' + a.port;
        const datasets = [
          ['INDUSTRY', 'opening-inventory-entries'],
          ['INDUSTRY', 'regional-source-capacity'],
          ['TRADE', 'opening-inventory-entries'],
          ['CAPTAIN', 'regional-source-capacity'],
          ['CAPTAIN', 'public-service-summary'],
        ] as const;
        const reads: unknown[] = [];
        for (const [office, dataset] of datasets) {
          const r = await call(query(office, dataset)),
            original = fixture.originals.get(`${office}/${dataset}`)!;
          expect(r.response.status).toBe(200);
          expect(r.body.ok).toBe(true);
          expect(r.body.rows).toEqual(original.slice(0, 25));
          expect(r.body.source).toMatchObject({
            dataNature: 'ADMITTED_IMMUTABLE_OPENING_FACTS',
            worldVersion: '0',
            eventSequence: '0',
            originWorldVersion: '0',
            originEventSequence: '0',
            observedHead: { worldVersion: '3', eventSequence: '3' },
            contentHash: marker.seedFingerprint,
            admissionRef: marker.admissionRef,
            countryId: marker.countryId,
            officeId: office,
          });
          expect(r.body.authority.readback.worldVersion).toBe('3');
          expect(r.body.authority.readback.eventSequence).toBe('3');
          expect(r.body.source.sourcePointer).toBeTypeOf('object');
          const legacy = fixture.legacyDocuments.get(`${office}/${dataset}`)!;
          if (dataset === 'opening-inventory-entries') {
            const provenance = fixture.inventoryProvenance.get(office)!;
            expect(r.body.source.sourceVersion).toBe(provenance.source_version);
            expect(r.body.source.sourceVersion).not.toBe(legacy.source_version);
            expect(r.body.source.sourcePointer).toEqual(
              provenance.source_pointer,
            );
            expect(r.body.source.sourcePointer).toMatchObject({
              schemaVersion: 'postwar-inventory-source-pointer-v2',
              sourceRole: 'DIRECT_ROW_SOURCE',
              sourceId: 'SOURCE_POSTWAR_FINANCIAL_V1',
              adoptionContextSourceId: 'SOURCE_POSTWAR_OPERATING_V1',
              legacySourceVersion: legacy.source_version,
            });
            expect(
              r.body.rows.every(
                (row: { sourceId: string }) =>
                  row.sourceId === r.body.source.sourcePointer.sourceId,
              ),
            ).toBe(true);
          } else {
            expect(r.body.source.sourceVersion).toBe(legacy.source_version);
            expect(r.body.source.sourcePointer).toEqual(legacy.source_pointer);
          }
          for (const key of ['pageHash', 'returnedRowsHash'])
            expect(r.body.source[key]).toMatch(/^[0-9a-f]{64}$/u);
          expect(r.body.source.hashAlgorithm).toBe(
            'POSTGRES_JSONB_TEXT_UTF8_SHA256',
          );
          expect(r.response.headers.get('cache-control')).toBe(
            'private, no-store',
          );
          expect(r.response.headers.get('access-control-allow-origin')).toBe(
            'https://pages.example',
          );
          expect(JSON.stringify(r.body)).not.toContain('COUNTRY_02');
          reads.push({
            office,
            dataset,
            total: r.body.page.total,
            sourceVersion: r.body.source.sourceVersion,
            bindingVersion: r.body.source.bindingVersion,
            sourcePointer: r.body.source.sourcePointer,
          });
          if (original.length > 1) {
            const firstQuery = query(office, dataset);
            firstQuery.page.limit = 1;
            const first = await call(firstQuery);
            const nextQuery = query(office, dataset);
            nextQuery.page = {
              limit: 1,
              offset: 1,
              sourceVersion: first.body.source.sourceVersion,
              bindingVersion: first.body.source.bindingVersion,
            };
            const next = await call(nextQuery);
            expect(next.response.status).toBe(200);
            expect(next.body.rows).toEqual(original.slice(1, 2));
            if (dataset === 'opening-inventory-entries') {
              nextQuery.page.sourceVersion = String(legacy.source_version);
              expect((await call(nextQuery)).response.status).toBe(409);
            }
            nextQuery.page.sourceVersion = 'sha256:' + '0'.repeat(64);
            expect((await call(nextQuery)).response.status).toBe(409);
          }
        }
        expect(
          (
            await call(query('INDUSTRY', 'opening-inventory-entries'), {
              bearer: token('22222222-2222-4222-8222-222222222222'),
            })
          ).response.status,
        ).toBe(403);
        expect(
          (
            await call(query('INDUSTRY', 'opening-inventory-entries'), {
              bearer: token(marker.subject, 'wrong'),
            })
          ).response.status,
        ).toBe(401);
        expect(
          (
            await call(query('INDUSTRY', 'opening-inventory-entries'), {
              origin: 'https://foreign.example',
            })
          ).response.status,
        ).toBe(403);
        expect(
          (
            await call({
              ...query('INDUSTRY', 'opening-inventory-entries'),
              countryId: 'COUNTRY_02',
            })
          ).response.status,
        ).toBe(400);
        expect(
          (await call(query('TRADE', 'public-service-summary'))).response
            .status,
        ).toBe(400);
        const modulePath =
          '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
        const { chromium } = await import(modulePath),
          { createServer: createViteServer } = await import('vite');
        const vs = await createViteServer({
          configFile: false,
          root: path.resolve(import.meta.dirname, '../..'),
          server: { host: '127.0.0.1', port: 0, hmr: false },
          logLevel: 'error',
        });
        vite = vs;
        await vs.listen();
        const va = vs.httpServer?.address();
        if (!va || typeof va === 'string') throw Error('OWNED_VITE_REQUIRED');
        const modules = 'http://127.0.0.1:' + va.port;
        const b = await chromium.launch({
          executablePath: '/usr/bin/chromium',
          headless: true,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
        browser = b;
        const page = await b.newPage();
        const values = {
          token: token(),
          world: config.admittedWorldPins,
          endpoints: config.endpointPins,
        };
        const html = `<!doctype html><meta charset="utf-8"><title>TEST_ONLY H3 physical history</title><main id="industry"></main><main id="trade"></main><main id="captain"></main><script type="module">
import {createPostwarRuntimeView}from'/apps/world-web/src/postwar-office-runtime/view.ts';const v=${JSON.stringify(values)};const response=await fetch('https://read.example/v1/current-seat',{method:'POST',headers:{authorization:'Bearer '+v.token,'content-type':'application/json'},body:JSON.stringify({schemaVersion:'${AUTHENTICATED_CURRENT_SEAT_SCHEMA}',requestId:crypto.randomUUID()})});const data=await response.json();for(const[id,office]of[['industry','INDUSTRY'],['trade','TRADE'],['captain','CAPTAIN']]){const binding=data.bindings.find(x=>x.identity.officeId===office);if(!binding)throw Error('ACTUAL_OFFICE_SEAT_REQUIRED');const c={endpoints:v.endpoints,world:v.world,identity:binding.identity,seatRef:binding.seatRef,currentIdentity:()=>binding.identity,getAccessToken:async()=>v.token,session:{sessionRef:'TEST_ONLY_EPHEMERAL_PHYSICAL_SESSION',isCurrent:()=>true,onInvalidate:()=>()=>{}}};let view;const draw=()=>document.getElementById(id).replaceChildren(view.render(document));view=createPostwarRuntimeView(c,draw);draw();}window.physicalReady=true;</script>`;
        type Route = {
          request(): {
            url(): string;
            method(): string;
            headers(): Record<string, string>;
            postData(): string | null;
          };
          fulfill(o: {
            status: number;
            headers?: Record<string, string>;
            body: string | Buffer;
          }): Promise<void>;
        };
        await page.route('https://pages.example/**', async (route: Route) => {
          const u = new URL(route.request().url());
          if (u.pathname === '/') {
            await route.fulfill({
              status: 200,
              headers: { 'content-type': 'text/html' },
              body: html,
            });
            return;
          }
          const r = await fetch(modules + u.pathname + u.search);
          await route.fulfill({
            status: r.status,
            headers: Object.fromEntries(r.headers),
            body: Buffer.from(await r.arrayBuffer()),
          });
        });
        await page.route('https://read.example/**', async (route: Route) => {
          const req = route.request(),
            url = new URL(req.url()),
            start = performance.now(),
            r = await fetch(base + url.pathname, {
              method: req.method(),
              headers: req.headers(),
              ...(['GET', 'HEAD'].includes(req.method())
                ? {}
                : { body: req.postData() }),
            }),
            bytes = Buffer.from(await r.arrayBuffer());
          metrics.push({
            path: 'CHROMIUM:' + url.pathname,
            status: r.status,
            bytes: bytes.length,
            milliseconds: performance.now() - start,
          });
          expect(bytes.length).toBeLessThanOrEqual(65536);
          await route.fulfill({
            status: r.status,
            headers: Object.fromEntries(r.headers),
            body: bytes,
          });
        });
        await page.goto('https://pages.example/');
        await page.waitForFunction(
          () =>
            (window as unknown as { physicalReady?: boolean }).physicalReady ===
            true,
        );
        const seen: unknown[] = [];
        for (const [office, dataset] of datasets) {
          const id = office.toLowerCase(),
            panel = page.locator('#' + id),
            select = panel.getByLabel('Office dataset');
          if ((await select.inputValue()) === dataset)
            await panel
              .getByText('Read current authorized page', { exact: true })
              .click();
          else await select.selectOption(dataset);
          await panel
            .getByText(
              'Opening facts (historical) · Checked at World version 3',
              { exact: true },
            )
            .waitFor();
          const first = fixture.originals.get(`${office}/${dataset}`)![0];
          expect(first).toBeDefined();
          const expected = String(
            dataset === 'opening-inventory-entries'
              ? first!.entryId
              : dataset === 'regional-source-capacity'
                ? first!.sourceRegionId
                : first!.kind,
          );
          await panel.getByText(expected, { exact: true }).first().waitFor();
          expect(await panel.textContent()).not.toContain(
            'Current ledger claims',
          );
          seen.push({ office, dataset, actualOriginalFieldSeen: expected });
        }
        await page.screenshot({
          path: path.join(out, 'chromium-h3-physical-history.png'),
          fullPage: true,
        });
        await page.reload();
        await page.waitForFunction(
          () =>
            (window as unknown as { physicalReady?: boolean }).physicalReady ===
            true,
        );
        await page
          .locator('#industry')
          .getByText('Read current authorized page', { exact: true })
          .click();
        await page
          .locator('#industry')
          .getByText(
            'Opening facts (historical) · Checked at World version 3',
            { exact: true },
          )
          .waitFor();
        const revoked = await clone.installer.query<{ capability: string }>(
          "update world_v2.current_commit_authorization set active=false where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='INDUSTRY'and active returning capability",
          [marker.worldId, marker.subject, marker.countryId],
        );
        expect(revoked.rows.length).toBeGreaterThan(0);
        try {
          expect(
            (await call(query('INDUSTRY', 'opening-inventory-entries')))
              .response.status,
          ).toBe(403);
        } finally {
          await clone.installer.query(
            "update world_v2.current_commit_authorization set active=true where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='INDUSTRY'and capability=any($4::text[])",
            [
              marker.worldId,
              marker.subject,
              marker.countryId,
              revoked.rows.map((r) => r.capability),
            ],
          );
        }
        expect(statements.some((q) => /canonical_payload/iu.test(q))).toBe(
          false,
        );
        expect(
          statements.some((q) =>
            /read_postwar_physical_opening_facts_page/iu.test(q),
          ),
        ).toBe(true);
        expect(acquired).toBe(released);
        Object.assign(report, {
          status: 'PASS',
          reads,
          browserDatasets: seen,
          browserReloadRead: true,
          metrics,
          maximumResponseBytes: Math.max(...metrics.map((m) => m.bytes)),
          sql: { statements, acquired, released, canonicalPayloadRead: false },
          ephemeralSigningKeyPersisted: false,
        });
      } catch (error) {
        failure = error;
        Object.assign(report, {
          status: 'FAIL',
          error: error instanceof Error ? error.message : String(error),
          metrics,
          sql: { statements, acquired, released },
        });
      } finally {
        const cleanup: string[] = [];
        for (const action of [
          () => browser?.close(),
          () => vite?.close(),
          async () => {
            if (server) {
              server.closeAllConnections();
              await new Promise<void>((resolve) =>
                server!.close(() => resolve()),
              );
            }
          },
          () => clone.drop(),
        ])
          try {
            await action();
          } catch (e) {
            cleanup.push(e instanceof Error ? e.message : String(e));
          }
        report.cleanup = {
          ownedCloneRemoved: cleanup.length === 0,
          errors: cleanup,
        };
        if (cleanup.length) {
          report.status = 'FAIL';
          failure ??= Error('OWNED_PHYSICAL_HTTP_CLEANUP_FAILED');
        }
        await writeFile(
          path.join(out, 'report.json'),
          JSON.stringify(report, null, 2) + '\n',
        );
      }
      if (failure !== undefined) throw failure;
    }, 60_000);
  },
);
