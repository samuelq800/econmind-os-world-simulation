/** TEST_ONLY sealed H6 small pages → real JWT/HTTP → main-page Chromium.
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
import { clonePublishedFinancialCurrentHttpFixture } from '../support/postwar-financial-current-http-native-fixture.js';
const publishedTemplate = process.env.ECONMIND_MAIN_FIELDS_HTTP_TEMPLATE;
const suite = publishedTemplate ? describe : describe.skip;
const out =
  '/workspace/office-connection-evidence/postwar-main-finance-fields-http-20261028';
const sha = (s: string | Buffer) =>
  createHash('sha256').update(s).digest('hex');
suite('actual H6 Finance main fields through trusted host', () => {
  it('binds real HUD and ten readonly fields, preserves policy input and clears country/office/revoked lifetimes', async () => {
    await mkdir(out, { recursive: true });
    const { marker, clone, publication } =
      await clonePublishedFinancialCurrentHttpFixture(publishedTemplate!);
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
        deploymentRef: 'TEST_ONLY_MAIN_FIELDS_HTTP',
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
    let failure: unknown;
    const cleanupErrors: string[] = [];
    const checks: string[] = [];
    let status = 'FAIL';
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

      const finance = await call(query('FINANCE', 'treasury-capacity'));
      expect(finance.response.status).toBe(200);
      expect(finance.body.authority.readback.worldVersion).toBe('6');
      expect(finance.body.authority.readback.eventSequence).toBe('10');
      expect(finance.body.rows).toHaveLength(1);
      const row = finance.body.rows[0];
      const playwrightModule =
        '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
      const { chromium } = await import(playwrightModule);
      const { createServer: createViteServer } = await import('vite');
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
      const browserErrors: string[] = [];
      page.on('pageerror', (e: Error) => browserErrors.push(String(e)));
      const values = {
        token: token(),
        world: config.admittedWorldPins,
        endpoints: config.endpointPins,
      };
      // Exact production selectors and real installed consumers/host. This is
      // a component browser harness, not a full-App or deployed-provider claim.
      const html = `<!doctype html><meta charset="utf-8"><title>TEST_ONLY actual Finance main fields</title>
      <main class="country-game" data-country="01" data-office="finance"><aside class="national-tools"></aside>
      <button data-metric="treasury" data-cmd="legacy-sample"><small>Treasury opening public reference</small><strong>200000 GCU</strong></button>
      <article class="national-play"><h1>Finance</h1><label>Policy proposal<input data-field="finance-u0251-0" value="100000"></label><button class="country-confirm" disabled>Local proposal not connected</button></article></main>
      <script type="module">
      import {installMainOfficeFields} from '/apps/world-web/src/main-office-fields/binder.ts';
      import {installOfficeProjection} from '/apps/world-web/src/office-projection/view.ts';
      import {installFinancialIntake} from '/apps/world-web/src/financial-intake/view.ts';
      import {installTrustedHost} from '/apps/world-web/src/trusted-host/bootstrap.ts';
      const v=${JSON.stringify(values)};
      const response=await fetch('https://read.example/v1/current-seat',{method:'POST',headers:{authorization:'Bearer '+v.token,'content-type':'application/json'},body:JSON.stringify({schemaVersion:'${AUTHENTICATED_CURRENT_SEAT_SCHEMA}',requestId:crypto.randomUUID()})});
      if(!response.ok)throw Error('ACTUAL_CURRENT_SEAT_REQUIRED');const seats=await response.json();
      const actual=seats.bindings.find(b=>b.identity.officeId==='FINANCE');if(!actual)throw Error('REAL_FINANCE_SEAT_REQUIRED');
      const mainFields=installMainOfficeFields(document,window);
      const host=installTrustedHost(document,window,{projection:installOfficeProjection(document,window),financial:installFinancialIntake(document,window),mainFields,localTrade:{disconnect(){}}});
      if(!host.configureTargets({read:v.endpoints}))throw Error('TRUSTED_TARGETS_REJECTED');
      let attempt=0;
      window.connectFinance=()=>{const read={endpoints:v.endpoints,world:v.world,identity:actual.identity,seatRef:actual.seatRef,currentIdentity:()=>actual.identity,getAccessToken:async()=>v.token,session:{sessionRef:'TEST_ONLY_MAIN_FIELDS_'+(++attempt),isCurrent:()=>true,onInvalidate:()=>()=>{}}};return host.connect({projection:{read,view:{role:'finance',countryDisplayId:'01'}}});};
      window.refreshMain=()=>mainFields.refresh();window.mainState=()=>mainFields.getState();window.hostState=()=>host.getState();
      if(!window.connectFinance())throw Error('ACTUAL_HOST_CONNECT_REJECTED');window.mainReady=true;
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
        () => !!(window as unknown as { mainReady?: boolean }).mainReady,
      );
      const fields = [
        ['accountId', 'main-finance-treasury-account'],
        ['currency', 'main-finance-treasury-currency'],
        ['treasuryLedgerClaimBalance', 'main-finance-treasury-claim'],
        ['openingReservedCapacity', 'main-finance-opening-reserved'],
        ['budgetEnvelopeCapacity', 'main-finance-budget-envelopes'],
        ['additionalPayrollReservedCapacity', 'main-finance-payroll-reserved'],
        ['totalReservedCapacity', 'main-finance-total-reserved'],
        ['availableCapacity', 'main-finance-available-capacity'],
        ['reservationNature', 'main-finance-reservation-nature'],
        ['balanceNature', 'main-finance-balance-nature'],
      ] as const;
      const state = page.locator('[data-main-office-status]');
      await state
        .getByText('Verified at World version 6', { exact: false })
        .waitFor();
      for (const [field, id] of fields) {
        const expected =
          field === 'reservationNature'
            ? 'Reserved capacity · not paid or accrued'
            : field === 'balanceNature'
              ? 'Reciprocal ledger claim · not a cash wallet'
              : row[field];
        expect(await page.locator('#' + id).textContent()).toBe(expected);
      }
      expect(
        await page.locator('.national-play [data-main-office-field]').count(),
      ).toBe(10);
      expect(
        await page.locator('[data-metric="treasury"] strong').textContent(),
      ).toBe(row.treasuryLedgerClaimBalance + ' ' + row.currency);
      expect(
        await page.locator('[data-metric="treasury"]').textContent(),
      ).toContain('not cash');
      expect(await page.locator('[data-metric="treasury"]').isDisabled()).toBe(
        true,
      );
      expect(
        await page.locator('[data-metric="treasury"]').getAttribute('data-cmd'),
      ).toBe(null);
      expect(
        await page.locator('[data-field="finance-u0251-0"]').inputValue(),
      ).toBe('100000');
      expect(await page.locator('.country-confirm').isDisabled()).toBe(true);
      await page.screenshot({
        path: path.join(out, 'chromium-main-finance-h6.png'),
        fullPage: true,
      });
      checks.push(
        'ACTUAL_MAIN_HUD_AND_TEN_READONLY_FIELDS_EXACT_H6',
        'POLICY_INPUT_UNCHANGED_NO_COMMAND',
      );
      // Keep references to old nodes: even removed nodes must lose private text.
      await page.evaluate(() => {
        (window as unknown as { oldMain?: Element[] }).oldMain = [
          ...document.querySelectorAll(
            '[data-main-office-field], [data-metric="treasury"] strong',
          ),
        ];
        document.querySelector<HTMLElement>('.country-game')!.dataset.country =
          '02';
      });
      await page.waitForFunction(
        () =>
          !(window as unknown as { oldMain: Element[] }).oldMain.some(
            (el) => el.textContent !== 'Unavailable',
          ),
      );
      expect(
        await page.locator('[data-main-office-field]').allTextContents(),
      ).toEqual(Array(10).fill('Unavailable'));
      expect(
        await page.evaluate(
          () =>
            (
              window as unknown as { hostState(): { status: string } }
            ).hostState().status,
        ),
      ).toBe('NOT_CONNECTED');
      checks.push('SWITCH_COUNTRY_CLEARS_OLD_PRIVATE_NODES');
      await page.evaluate(() => {
        document.querySelector<HTMLElement>('.country-game')!.dataset.country =
          '01';
      });
      expect(
        await page.evaluate(() =>
          (window as unknown as { connectFinance(): boolean }).connectFinance(),
        ),
      ).toBe(true);
      await state
        .getByText('Verified at World version 6', { exact: false })
        .waitFor();
      await page.evaluate(() => {
        (window as unknown as { oldMain?: Element[] }).oldMain = [
          ...document.querySelectorAll(
            '[data-main-office-field], [data-metric="treasury"] strong',
          ),
        ];
        document.querySelector<HTMLElement>('.country-game')!.dataset.office =
          'industry';
      });
      await page.waitForFunction(
        () =>
          !(window as unknown as { oldMain: Element[] }).oldMain.some(
            (el) => el.textContent !== 'Unavailable',
          ),
      );
      expect(await page.locator('#main-office-finance-capacity').count()).toBe(
        0,
      );
      checks.push('SWITCH_OFFICE_CLEARS_DETACHED_PRIVATE_NODES');
      await page.evaluate(() => {
        document.querySelector<HTMLElement>('.country-game')!.dataset.office =
          'finance';
      });
      expect(
        await page.evaluate(() =>
          (window as unknown as { connectFinance(): boolean }).connectFinance(),
        ),
      ).toBe(true);
      await state
        .getByText('Verified at World version 6', { exact: false })
        .waitFor();
      const revoked = await clone.installer.query(
        "update world_v2.current_commit_authorization set active=false where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='FINANCE'and active returning capability",
        [marker.worldId, marker.subject, marker.countryId],
      );
      expect(revoked.rowCount).toBeGreaterThan(0);
      await page.evaluate(() =>
        (window as unknown as { refreshMain(): Promise<void> }).refreshMain(),
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[data-main-office-field]')].every(
          (el) => el.textContent === 'Unavailable',
        ),
      );
      expect(
        await page.locator('[data-metric="treasury"] strong').textContent(),
      ).toBe('Unavailable');
      expect(
        await page.locator('[data-field="finance-u0251-0"]').inputValue(),
      ).toBe('100000');
      expect(
        metrics.some((m) => m.path.startsWith('CHROMIUM:') && m.status === 403),
      ).toBe(true);
      await page.screenshot({
        path: path.join(out, 'chromium-main-finance-revoked.png'),
        fullPage: true,
      });
      checks.push(
        'ACTUAL_SQL_REVOCATION_HTTP403_CLEARS_MAIN_PRIVATE',
        'TWO_ACTUAL_VIEW_CHANGES_NO_REUSED_SESSION',
      );
      expect(browserErrors).toEqual([]);
      expect(statements.some((q) => /canonical_payload/iu.test(q))).toBe(false);
      expect(
        statements.some((q) => /read_postwar_financial_current_page/iu.test(q)),
      ).toBe(true);
      expect(acquired).toBe(released);
      status = 'PASS';
    } catch (error) {
      failure = error;
    } finally {
      for (const [name, action] of [
        [
          'browser',
          async () => {
            await browser?.close();
          },
        ],
        [
          'vite',
          async () => {
            await vite?.close();
          },
        ],
        [
          'http',
          async () => {
            if (server) {
              server.closeAllConnections();
              await new Promise<void>((resolve) =>
                server!.close(() => resolve()),
              );
            }
          },
        ],
        [
          'ownedClone',
          async () => {
            await clone.drop();
          },
        ],
      ] as const) {
        try {
          await action();
        } catch (error) {
          cleanupErrors.push(name + ': ' + String(error));
        }
      }
      if (cleanupErrors.length) status = 'FAIL';
      const sources = [
        'apps/world-web/src/main-office-fields/binder.ts',
        'apps/world-web/src/main-office-fields/mapping.ts',
        'apps/world-web/src/trusted-host/bootstrap.ts',
        'apps/world-web/src/country-runtime/entry.ts',
        'apps/world-web/src/postwar-office-runtime/client.ts',
        'apps/world-api/src/integration/postwar-office-runtime-read-service.ts',
        'tests/support/postwar-financial-current-http-native-fixture.ts',
        'tests/world-api/main-office-finance-fields-http-browser.test.ts',
      ];
      const artifacts = await Promise.all(
        sources.map(async (p) => ({
          path: p,
          sha256: sha(
            await readFile(path.resolve(import.meta.dirname, '../..', p)),
          ),
        })),
      );
      await writeFile(
        path.join(out, 'report.json'),
        JSON.stringify(
          {
            classification:
              'TEST_ONLY_ACTUAL_SEALED_H6_JWT_HTTP_COMPONENT_CHROMIUM_REAL_TRUSTED_HOST_NOT_FULL_APP_NOT_PRODUCTION',
            status,
            error: failure ? String(failure) : null,
            checks,
            seedFingerprint: marker.seedFingerprint,
            admissionRef: marker.admissionRef,
            publication,
            metrics,
            maximumResponseBytes: Math.max(...metrics.map((m) => m.bytes)),
            sql: {
              statements,
              acquired,
              released,
              canonicalPayloadRead: statements.some((q) =>
                /canonical_payload/iu.test(q),
              ),
            },
            coverage: {
              existingHudControls: 1,
              newReadonlySlots: 10,
              uniqueFacts: 10,
              catalogPolicyInputs: 0,
              catalogReadouts: 0,
              moduleActions: 0,
            },
            denominator: {
              offices: 6,
              modules: 120,
              policyInputs: 1126,
              readouts: 158,
            },
            artifacts,
            cleanupErrors,
            ownedCloneDropped: cleanupErrors.every(
              (e) => !e.startsWith('ownedClone:'),
            ),
            production: false,
            WorldClock: false,
          },
          null,
          2,
        ) + '\n',
      );
    }
    if (failure) throw failure;
    expect(cleanupErrors).toEqual([]);
  }, 90000);
});
