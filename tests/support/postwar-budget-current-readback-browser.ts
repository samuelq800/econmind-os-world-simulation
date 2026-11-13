/** TEST_ONLY real JWT → loopback Fetch → bounded PostgreSQL → actual Main
 * binder. Routing forwards HTTP bytes; it never substitutes financial rows. */
import { createServer, type Server } from 'node:http';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { expect } from 'vitest';
import {
  WORLD_MODEL_VERSION,
  AUTHENTICATED_CURRENT_SEAT_SCHEMA,
} from '@econmind/core';
import {
  createPostwarOfficeRuntimeFetchHandler,
  createPostwarCurrentSeatFetchHandler,
  POSTWAR_OFFICE_RUNTIME_READ_PATH,
} from '../../apps/world-api/src/runtime-preparation/postwar-office-runtime-fetch-handler.js';
import type { ExplicitReadPreparationConfig } from '../../apps/world-api/src/runtime-preparation/explicit-read-preparation-config.js';
import type { createBudgetCurrentReadbackFixture } from './postwar-budget-current-readback-fixture.js';

export async function startBudgetCurrentReadbackBrowser(
  f: Awaited<ReturnType<typeof createBudgetCurrentReadbackFixture>>,
  out: string,
) {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
    issuer = 'https://abcdefghijklmnopqrst.supabase.co/auth/v1';
  const jwk = {
    ...keys.publicKey.export({ format: 'jwk' }),
    kid: 'TEST_ONLY_BUDGET_READBACK',
    alg: 'ES256',
    use: 'sig',
    key_ops: ['verify'],
  };
  const now = Math.floor(Date.now() / 1000),
    header = Buffer.from(
      JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }),
    ).toString('base64url'),
    claims = Buffer.from(
      JSON.stringify({
        sub: f.marker.subject,
        iss: issuer,
        aud: 'authenticated',
        iat: now - 5,
        exp: now + 600,
      }),
    ).toString('base64url'),
    body = header + '.' + claims;
  const token =
    body +
    '.' +
    sign('sha256', Buffer.from(body), {
      key: keys.privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');
  const statements: string[] = [],
    metrics: { status: number; bytes: number; milliseconds: number }[] = [];
  let server: Server | undefined,
    vite: { close(): Promise<void> } | undefined,
    browser: { close(): Promise<void> } | undefined,
    base = '';
  const close = async () => {
    const results = await Promise.allSettled([
      browser?.close(),
      vite?.close(),
      (async () => {
        if (server) {
          server.closeAllConnections();
          await new Promise<void>((resolve) => server!.close(() => resolve()));
        }
      })(),
    ]);
    const errors = results.filter((r) => r.status === 'rejected');
    if (errors.length)
      throw new AggregateError(
        errors.map((r) => r.reason),
        'OWNED_READBACK_BROWSER_CLEANUP_FAILED',
      );
  };
  try {
    const config: ExplicitReadPreparationConfig = {
      pool: {
        async connect() {
          const c = await f.clone.boundedReader.connect();
          return {
            query(q: string, args?: readonly unknown[]) {
              statements.push(q);
              return c.query(q, args ? [...args] : undefined);
            },
            release(destroy?: boolean) {
              c.release(destroy);
            },
          };
        },
      } as Pick<Pool, 'connect'>,
      readerRole: f.marker.roles.boundedReaderRole,
      authorizationPublisherRole: f.marker.roles.authorizationPublisherRole,
      modelVersion: WORLD_MODEL_VERSION,
      endpointPins: {
        origin: 'https://read.example',
        projectionPath: POSTWAR_OFFICE_RUNTIME_READ_PATH,
        finalLookupPath: '/v1/final-receipt',
        deploymentRef: 'TEST_ONLY_BUDGET_H7_READBACK',
      },
      admittedWorldPins: {
        worldId: f.marker.worldId,
        seedRef: f.marker.seedId,
        contentHash: f.marker.seedFingerprint,
        admissionRef: f.marker.admissionRef,
        minimumWorldVersion: '0',
      },
      auth: {
        projectRef: 'abcdefghijklmnopqrst',
        expectedIssuer: issuer,
        jwksUrl: issuer + '/.well-known/jwks.json',
        audience: 'authenticated',
        fetch: async (url) => {
          if (String(url) !== issuer + '/.well-known/jwks.json')
            throw Error('PINNED_JWKS_ONLY');
          const r = Response.json({ keys: [jwk] });
          Object.defineProperty(r, 'url', { value: String(url) });
          return r;
        },
      },
      routeOptions: { allowedOrigins: ['https://pages.example'] },
    };
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
        const r = (await pages(request)) ?? (await seats(request));
        if (!r) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(r.status, Object.fromEntries(r.headers));
        res.end(Buffer.from(await r.arrayBuffer()));
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
    const modulePath =
      '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
    const { chromium } = await import(modulePath),
      { createServer: createViteServer } = await import('vite');
    const vs = await createViteServer({
      configFile: false,
      root: new URL('../..', import.meta.url).pathname,
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
    const html = `<!doctype html><meta charset="utf-8"><title>TEST_ONLY H7 actual Finance Main readback</title>
<main class="country-game" data-country="01" data-office="finance"><aside class="national-tools"></aside><button data-metric="treasury"><strong>Unavailable</strong></button><article class="national-play"><h1>Finance</h1></article></main>
<script type="module">
import {installMainOfficeFields} from '/apps/world-web/src/main-office-fields/binder.ts';
const v=${JSON.stringify({ token, world: config.admittedWorldPins, endpoints: config.endpointPins })};
const r=await fetch('https://read.example/v1/current-seat',{method:'POST',headers:{authorization:'Bearer '+v.token,'content-type':'application/json'},body:JSON.stringify({schemaVersion:'${AUTHENTICATED_CURRENT_SEAT_SCHEMA}',requestId:crypto.randomUUID()})});
if(!r.ok)throw Error('ACTUAL_SEAT_REQUIRED');const seats=await r.json(),actual=seats.bindings.find(b=>b.identity.officeId==='FINANCE');if(!actual)throw Error('ACTUAL_FINANCE_SEAT_REQUIRED');
const binder=installMainOfficeFields(document,window),read={endpoints:v.endpoints,world:v.world,identity:actual.identity,seatRef:actual.seatRef,currentIdentity:()=>actual.identity,getAccessToken:async()=>v.token,session:{sessionRef:'TEST_ONLY_H7_MAIN',isCurrent:()=>true,onInvalidate:()=>()=>{}}};
binder.connect({read,view:{role:'finance',countryDisplayId:'01'}});window.refreshMain=()=>binder.refresh();window.mainReady=true;
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
      const q = route.request(),
        started = performance.now(),
        r = await fetch(base + new URL(q.url()).pathname, {
          method: q.method(),
          headers: q.headers(),
          body: q.postData(),
        }),
        bytes = Buffer.from(await r.arrayBuffer());
      metrics.push({
        status: r.status,
        bytes: bytes.length,
        milliseconds: performance.now() - started,
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
        (globalThis as unknown as { mainReady?: boolean }).mainReady === true,
    );
    return {
      close,
      async assertBudget(value: string, phase: string) {
        await page
          .locator('#main-finance-budget-envelopes')
          .getByText(value, { exact: true })
          .waitFor();
        await page.screenshot({
          path: out + '/' + phase + '.png',
          fullPage: true,
        });
      },
      async refreshUnavailable() {
        await page.evaluate(() =>
          (
            globalThis as unknown as { refreshMain(): Promise<void> }
          ).refreshMain(),
        );
        await page
          .locator('#main-finance-budget-envelopes')
          .getByText('Unavailable', { exact: true })
          .waitFor();
        await page.screenshot({
          path: out + '/h7-before-publication-unavailable.png',
          fullPage: true,
        });
      },
      async refresh() {
        await page.evaluate(() =>
          (
            globalThis as unknown as { refreshMain(): Promise<void> }
          ).refreshMain(),
        );
      },
      async readCurrent(officeId: string, dataset: string) {
        const r = await fetch(base + POSTWAR_OFFICE_RUNTIME_READ_PATH, {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + token,
            origin: 'https://pages.example',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            schemaVersion: 'postwar-office-runtime-read-v1',
            requestId: randomUUID(),
            operation: 'READ_CURRENT_OFFICE_OPENING',
            officeId,
            dataset,
            page: { limit: 25 },
          }),
        });
        return { status: r.status, body: await r.json() };
      },
      async staleCursor(sourceVersion: string) {
        const r = await fetch(base + POSTWAR_OFFICE_RUNTIME_READ_PATH, {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + token,
            origin: 'https://pages.example',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            schemaVersion: 'postwar-office-runtime-read-v1',
            requestId: randomUUID(),
            operation: 'READ_CURRENT_OFFICE_OPENING',
            officeId: 'FINANCE',
            dataset: 'treasury-capacity',
            page: { limit: 25, offset: 0, sourceVersion: sourceVersion },
          }),
        });
        return { status: r.status, body: await r.json() };
      },
      evidence() {
        expect(
          statements.some((q) => /canonical_payload|opening_seed/iu.test(q)),
        ).toBe(false);
        return {
          metrics,
          statements,
          canonicalPayloadRead: false,
          maximumResponseBytes: Math.max(...metrics.map((m) => m.bytes)),
        };
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
