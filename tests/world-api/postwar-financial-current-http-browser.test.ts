/** TEST_ONLY real retained H6 → Core/SQL publication → JWT/HTTP/browser.
 * No external source, production connection, credential persistence or Clock. */
import { createServer, type Server } from 'node:http';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
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
import {
  createFinancialCurrentHttpNativeFixture,
  clonePublishedFinancialCurrentHttpFixture,
} from '../support/postwar-financial-current-http-native-fixture.js';
import { sealPostwarReferenceClone } from '../support/postwar-native-reference-db.js';
const checkpoint = process.env.ECONMIND_FINANCIAL_CURRENT_HTTP_CHECKPOINT;
const publishedTemplate =
  process.env.ECONMIND_FINANCIAL_CURRENT_HTTP_PUBLISHED_TEMPLATE;
const suite = checkpoint || publishedTemplate ? describe : describe.skip;
const out =
  '/workspace/office-connection-evidence/postwar-financial-current-http-20261028';
const sha = (s: string | Buffer) =>
  createHash('sha256').update(s).digest('hex');
suite('actual H6 bounded financial HTTP and Chromium', () => {
  it('reads exact current fiscal capacity/CB claims and historical FX through real JWT and actual browser client, then seals published template', async () => {
    await mkdir(out, { recursive: true });
    const { marker, clone, publication } = publishedTemplate
      ? await clonePublishedFinancialCurrentHttpFixture(publishedTemplate)
      : await createFinancialCurrentHttpNativeFixture(checkpoint!, out);
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
      jwk = {
        ...keys.publicKey.export({ format: 'jwk' }),
        kid: 'TEST_ONLY_EPHEMERAL_FINANCIAL_HTTP',
        alg: 'ES256',
        use: 'sig',
        key_ops: ['verify'],
      };
    const statements: string[] = [],
      metrics: {
        path: string;
        status: number;
        bytes: number;
        milliseconds: number;
      }[] = [];
    let acquired = 0,
      released = 0,
      server: Server | undefined,
      base = '',
      browser: { close(): Promise<void> } | undefined,
      vite: { close(): Promise<void> } | undefined;
    const issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1';
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
        deploymentRef: 'TEST_ONLY_FINANCIAL_HTTP',
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
      const h = Buffer.from(
          JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }),
        ).toString('base64url'),
        now = Math.floor(Date.now() / 1000),
        p = Buffer.from(
          JSON.stringify({
            sub: subject,
            iss: issuer,
            aud: audience,
            iat: now - 5,
            exp: now + 300,
          }),
        ).toString('base64url'),
        data = h + '.' + p;
      return (
        data +
        '.' +
        sign('sha256', Buffer.from(data), {
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
      page: { limit: 25 },
    });
    async function call(
      body: unknown,
      pathname: string = POSTWAR_OFFICE_RUNTIME_READ_PATH,
      bearer = token(),
    ) {
      const start = performance.now(),
        r = await fetch(base + pathname, {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + bearer,
            origin: 'https://pages.example',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
        bytes = Buffer.from(await r.arrayBuffer());
      metrics.push({
        path: pathname,
        status: r.status,
        bytes: bytes.length,
        milliseconds: performance.now() - start,
      });
      expect(bytes.length).toBeLessThanOrEqual(65536);
      return { response: r, body: JSON.parse(bytes.toString()) };
    }
    let success = false;
    try {
      const pages = createPostwarOfficeRuntimeFetchHandler(config),
        seats = createPostwarCurrentSeatFetchHandler(config);
      server = createServer(async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const request = new Request(base + req.url, {
            method: req.method ?? 'GET',
            headers: req.headers as Record<string, string>,
            ...(['GET', 'HEAD'].includes(req.method ?? 'GET')
              ? {}
              : { body: Buffer.concat(chunks) }),
          });
          const response = (await pages(request)) ?? (await seats(request));
          if (!response) {
            res.writeHead(404).end();
            return;
          }
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.writeHead(503).end();
        }
      });
      await new Promise<void>((resolve) =>
        server!.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      if (!address || typeof address === 'string')
        throw Error('OWNED_LOOPBACK_REQUIRED');
      base = 'http://127.0.0.1:' + address.port;
      const finance = await call(query('FINANCE', 'treasury-capacity')),
        cb = await call(query('CENTRAL_BANK', 'ledger-balances')),
        fx = await call(query('FINANCE', 'currency-fx'));
      for (const p of [finance, cb, fx]) {
        expect(p.response.status).toBe(200);
        expect(p.body.ok).toBe(true);
        expect(p.body.authority.readback.worldVersion).toBe('6');
        expect(p.response.headers.get('cache-control')).toBe(
          'private, no-store',
        );
        expect(p.response.headers.get('access-control-allow-origin')).toBe(
          'https://pages.example',
        );
      }
      expect(finance.body.source.dataNature).toBe(
        'ADMITTED_CURRENT_FINANCIAL_NO_POSTING_PREFIX',
      );
      expect(finance.body.rows[0].budgetEnvelopeCapacity).toBe(
        '94331915421.552',
      );
      expect(finance.body.rows[0].additionalPayrollReservedCapacity).toBe(
        '162.72',
      );
      expect(cb.body.rows.length).toBeGreaterThan(0);
      expect(fx.body.source.worldVersion).toBe('0');
      expect(fx.body.source.originWorldVersion).toBe('0');
      expect(fx.body.source.observedHead).toEqual({
        worldVersion: '6',
        eventSequence: '10',
      });
      expect(
        (
          await call(
            query('FINANCE', 'treasury-capacity'),
            undefined,
            token('00000000-0000-4000-8000-000000000099'),
          )
        ).response.status,
      ).toBe(403);
      expect(
        (
          await call(
            query('FINANCE', 'treasury-capacity'),
            undefined,
            token(marker.subject, 'wrong'),
          )
        ).response.status,
      ).toBe(401);
      const modulePath =
        '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
      const { chromium } = await import(modulePath);
      const { createServer: createViteServer } = await import('vite');
      const vs = await createViteServer({
        configFile: false,
        root: path.resolve(import.meta.dirname, '../..'),
        server: { host: '127.0.0.1', port: 0 },
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
      const html = `<!doctype html><meta charset="utf-8"><title>TEST_ONLY H6 financial current read</title><main id="finance"></main><main id="centralbank"></main><script type="module">
import {createPostwarRuntimeView} from '/apps/world-web/src/postwar-office-runtime/view.ts';
const v=${JSON.stringify(values)};
const r=await fetch('https://read.example/v1/current-seat',{method:'POST',headers:{authorization:'Bearer '+v.token,'content-type':'application/json'},body:JSON.stringify({schemaVersion:'${AUTHENTICATED_CURRENT_SEAT_SCHEMA}',requestId:crypto.randomUUID()})});const seats=await r.json();
for(const [id,office]of[['finance','FINANCE'],['centralbank','CENTRAL_BANK']]){const binding=seats.bindings.find(b=>b.identity.officeId===office);if(!binding)throw Error('REAL_SEAT_REQUIRED');const c={endpoints:v.endpoints,world:v.world,identity:binding.identity,seatRef:binding.seatRef,currentIdentity:()=>binding.identity,getAccessToken:async()=>v.token,session:{sessionRef:'TEST_ONLY_EPHEMERAL_BROWSER_SESSION',isCurrent:()=>true,onInvalidate:()=>()=>{}}};let view;const draw=()=>document.getElementById(id).replaceChildren(view.render(document));view=createPostwarRuntimeView(c,draw);draw();}window.financialReady=true;
</script>`;
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
        const url = new URL(route.request().url());
        if (url.pathname === '/') {
          await route.fulfill({
            status: 200,
            headers: { 'content-type': 'text/html' },
            body: html,
          });
          return;
        }
        const response = await fetch(modules + url.pathname + url.search);
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: Buffer.from(await response.arrayBuffer()),
        });
      });
      await page.route('https://read.example/**', async (route: Route) => {
        const req = route.request(),
          start = performance.now(),
          r = await fetch(base + new URL(req.url()).pathname, {
            method: req.method(),
            headers: req.headers(),
            body: req.postData(),
          }),
          bytes = Buffer.from(await r.arrayBuffer());
        metrics.push({
          path: 'CHROMIUM:' + new URL(req.url()).pathname,
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
          (window as unknown as { financialReady?: boolean }).financialReady ===
          true,
      );
      await page
        .locator('#finance')
        .getByLabel('Office dataset')
        .selectOption('treasury-capacity');
      await page
        .locator('#finance')
        .getByText('94331915421.552', { exact: true })
        .waitFor();
      expect(await page.locator('#finance').textContent()).toContain(
        'Current ledger claims and reserved capacity · World version 6',
      );
      await page
        .locator('#centralbank')
        .getByLabel('Office dataset')
        .selectOption('ledger-balances');
      await page
        .locator('#centralbank')
        .getByText(
          'Current ledger claims and reserved capacity · World version 6',
          { exact: true },
        )
        .waitFor();
      await page.screenshot({
        path: path.join(out, 'chromium-h6-financial-current.png'),
        fullPage: true,
      });
      await page
        .locator('#finance')
        .getByLabel('Office dataset')
        .selectOption('currency-fx');
      await page
        .locator('#finance')
        .getByText('Opening facts (historical) · Checked at World version 6', {
          exact: true,
        })
        .waitFor();
      await page.screenshot({
        path: path.join(out, 'chromium-h6-financial-history.png'),
        fullPage: true,
      });
      expect(statements.some((q) => /canonical_payload/iu.test(q))).toBe(false);
      expect(
        statements.some((q) => /read_postwar_financial_current_page/iu.test(q)),
      ).toBe(true);
      expect(acquired).toBe(released);
      const receipt = {
        classification: 'TEST_ONLY_ACTUAL_H6_JWT_HTTP_CHROMIUM_NOT_PRODUCTION',
        status: 'PASS',
        seedFingerprint: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        publication,
        metrics,
        maximumResponseBytes: Math.max(...metrics.map((m) => m.bytes)),
        sql: { statements, acquired, released, canonicalPayloadRead: false },
        production: false,
        WorldClock: false,
      };
      await writeFile(
        path.join(out, 'report.json'),
        JSON.stringify(receipt, null, 2) + '\n',
      );
      success = true;
    } catch (error) {
      await writeFile(
        path.join(out, 'failed-' + Date.now() + '.json'),
        JSON.stringify(
          { status: 'FAIL', error: String(error), metrics, statements },
          null,
          2,
        ) + '\n',
      );
      throw error;
    } finally {
      await browser?.close();
      await vite?.close();
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      await clone.close();
      await sealPostwarReferenceClone(marker, clone.database);
      await writeFile(
        path.join(
          out,
          success
            ? 'published-template.json'
            : 'failed-template-' + Date.now() + '.json',
        ),
        JSON.stringify(
          {
            classification: success
              ? 'TEST_ONLY_ACTUAL_FINANCIAL_CURRENT_HTTP_VERIFIED_SEALED_TEMPLATE_NOT_PRODUCTION'
              : 'TEST_ONLY_FAILED_FINANCIAL_HTTP_DEBUG_CLONE',
            referenceMarker: marker.markerPath,
            templateDatabase: clone.database,
            seedFingerprint: marker.seedFingerprint,
            admissionRef: marker.admissionRef,
            head: publication.head,
            publicationPrefixFingerprint: publication.prefixFingerprint,
          },
          null,
          2,
        ) + '\n',
      );
      const artifacts = [
        'apps/world-worker/src/persistence/postwar-financial-current-projection.ts',
        'apps/world-worker/src/persistence/postwar-financial-current-publication.ts',
        'database/proposals/postwar-financial-current-derived-read.sql',
        'apps/world-api/src/integration/postwar-office-runtime-read-service.ts',
        'apps/world-web/src/postwar-office-runtime/client.ts',
        'apps/world-web/src/postwar-office-runtime/view.ts',
        'tests/world-api/postwar-financial-current-http-browser.test.ts',
        'tests/support/postwar-financial-current-http-native-fixture.ts',
      ];
      await writeFile(
        path.join(out, 'artifact-hashes.json'),
        JSON.stringify(
          await Promise.all(
            artifacts.map(async (p) => ({
              path: p,
              sha256: sha(
                await readFile(path.resolve(import.meta.dirname, '../..', p)),
              ),
            })),
          ),
          null,
          2,
        ) + '\n',
      );
    }
  }, 180000);
});
