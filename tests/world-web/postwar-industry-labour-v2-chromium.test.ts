/** Actual Chromium + shipped client DATA-wire regression. Responses below are
 * explicitly TEST_ONLY protocol fixtures, NOT SQL/native source evidence. */
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { officeProjectionFixture } from './office-projection-fixture.js';
import {
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import {
  POSTWAR_INDUSTRY_LABOUR_CURRENT_NATURE,
  POSTWAR_INDUSTRY_LABOUR_OPENING_NATURE,
} from '@econmind/core/postwar-industry-labour-current-contract';
const requestId = '11111111-1111-4111-8111-111111111111',
  fp = 'sha256:' + 'a'.repeat(64),
  raw = 'b'.repeat(64);
function fixture(head = '2') {
  const base = officeProjectionFixture('industry'),
    identity = {
      ...base.config.identity,
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    },
    world = { ...base.config.world, minimumWorldVersion: '0' },
    read = {
      ...base.config,
      identity,
      currentIdentity: () => identity,
      world,
      endpoints: {
        ...base.config.endpoints,
        projectionPath: POSTWAR_RUNTIME_PATH,
      },
    },
    seed = {
      worldId: world.worldId,
      seedRef: world.seedRef,
      contentHash: world.contentHash,
      admissionRef: world.admissionRef,
    };
  const row = {
    schemaVersion: 'postwar-industry-labour-current-row-v1',
    countryId: identity.countryId,
    facilityId: 'FACILITY_TEST_ONLY',
    locationId: 'LOCATION_TEST_ONLY',
    operatorId: 'OP_TEST_ONLY',
    positionId: 'POSITION_TEST_ONLY',
    skill: 'LOW',
    classificationId: 'SKILL_TEST_ONLY',
    requiredCount: '12',
    openingFilledCount: '10',
    currentEmployedCount: head === '0' ? '10' : '9',
    measurement: 'EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT',
    completedPersonDays: null,
    paidCost: null,
  };
  const coverage = {
    schemaVersion: 'postwar-industry-labour-current-coverage-v1',
    countryId: identity.countryId,
    prefixFingerprint: fp,
    knownEffectsFingerprint: fp,
    coveredThroughEventId: head === '0' ? null : 'EVENT_TEST_ONLY',
    coveredThroughEventFingerprint: head === '0' ? null : fp,
    financialPostingCount: '0',
    financialBatchCount: '0',
    financialPostingsFingerprint: fp,
    globalWorldVersion: head,
    globalEventSequence: head,
    rowsHash: fp,
    originalScopeSha256: raw,
  };
  const body = {
    schemaVersion: POSTWAR_RUNTIME_SCHEMA,
    requestId,
    ok: true,
    status: 'AVAILABLE',
    dataset: 'industry-labour-current',
    authority: {
      source: 'SERVER_VERIFIED_READ_BINDING',
      capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
      identity,
      seatRef: read.seatRef,
      seatState: 'ACTIVE',
      seed,
      readback: {
        ...seed,
        worldVersion: head,
        eventSequence: head,
        readbackRef: 'READBACK_TEST_ONLY',
      },
    },
    source: {
      dataNature:
        head === '0'
          ? POSTWAR_INDUSTRY_LABOUR_OPENING_NATURE
          : POSTWAR_INDUSTRY_LABOUR_CURRENT_NATURE,
      sourceVersion: fp,
      bindingVersion: fp,
      sourceRevision: 'SOURCE_REV_TEST_ONLY',
      worldId: identity.worldId,
      countryId: identity.countryId,
      officeId: identity.officeId,
      authSubjectId: identity.authSubjectId,
      authorizationRevision: identity.authorizationRevision,
      scopeKey: identity.scopeKey,
      modelVersion: identity.modelVersion,
      seedRef: world.seedRef,
      contentHash: world.contentHash,
      admissionRef: world.admissionRef,
      worldVersion: head,
      eventSequence: head,
      originWorldVersion: '0',
      originEventSequence: '0',
      observedHead: { worldVersion: head, eventSequence: head },
      currentIndustryLabourCoverage: coverage,
      pageHash: raw,
      returnedRowsHash: raw,
      hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
      sourcePointer: {
        sourceId: 'SOURCE_TEST_ONLY',
        sourcePayloadHash: fp,
        canonicalSeedSha256: raw,
        path: '/carrier/socialEmployment/inputs/sourcePositions',
        selection: {
          countryId: identity.countryId,
          sourceBucket: 'INDUSTRY',
          employerRole: 'OP',
        },
      },
    },
    page: { offset: 0, limit: 25, returned: 1, total: 1, nextOffset: null },
    rows: [row],
  };
  return { read, body };
}

describe.skipIf(process.env.ECONMIND_INDUSTRY_LABOUR_CHROMIUM !== '1')(
  'Industry V2 actual Chromium wire protocol',
  () => {
    it('accepts the versioned page and cursor, and rejects stale/wrong-head/foreign-country responses', async () => {
      const { createServer } = await import('vite');
      const modulePath =
        '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
      const { chromium } = await import(modulePath);
      const vite = await createServer({
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
          throw Error('OWNED_VITE_ADDRESS_REQUIRED');
        browser = await chromium.launch({
          executablePath: '/usr/bin/chromium',
          headless: true,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
        const page = await browser.newPage();
        const f = fixture();
        const body = {
          ...f.body,
          source: {
            ...f.body.source,
            currentIndustryLabourCoverage: {
              ...f.body.source.currentIndustryLabourCoverage,
              schemaVersion:
                'postwar-industry-labour-current-page-chain-coverage-v2',
              pageProof: {
                schemaVersion: 'postwar-complete-page-proof-v1',
                hashAlgorithm: 'COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1',
                pageCount: '1',
                frameCount: '2',
              },
            },
          },
        };
        // Serializable test bindings carry no credential or authority. Real
        // session callbacks are installed in the page, never restored tokens.
        const serializable = {
          identity: f.read.identity,
          seatRef: f.read.seatRef,
          endpoints: f.read.endpoints,
          world: f.read.world,
        };
        const origin = 'http://127.0.0.1:' + address.port;
        await page.route(
          origin + '/',
          (route: {
            fulfill(value: {
              status: number;
              contentType: string;
              body: string;
            }): Promise<void>;
          }) =>
            route.fulfill({
              status: 200,
              contentType: 'text/html',
              body: '<!doctype html><title>TEST_ONLY Industry wire</title><script type="module">import {createPostwarRuntimeClient} from "/apps/world-web/src/postwar-office-runtime/client.ts";Object.assign(window,{industryClientFactory:createPostwarRuntimeClient});</script>',
            }),
        );
        await page.goto(origin);
        await page.waitForFunction(() =>
          Object.hasOwn(window, 'industryClientFactory'),
        );
        type WireBody = typeof body;
        type BrowserConfig = typeof serializable;
        const result = await page.evaluate(
          async ({
            body,
            config,
            requestId,
          }: {
            body: WireBody;
            config: BrowserConfig;
            requestId: string;
          }) => {
            const createPostwarRuntimeClient = (
              window as unknown as {
                industryClientFactory: typeof import('../../apps/world-web/src/postwar-office-runtime/client.js').createPostwarRuntimeClient;
              }
            ).industryClientFactory;
            let current: unknown = body,
              status = 200;
            const requests: Record<string, unknown>[] = [];
            let alive = true;
            const c = createPostwarRuntimeClient(
              {
                ...config,
                currentIdentity: () => (alive ? config.identity : null),
                getAccessToken: async () => 'TEST_ONLY_NOT_A_CREDENTIAL',
                session: {
                  sessionRef: 'TEST_ONLY_CHROMIUM',
                  isCurrent: () => alive,
                  onInvalidate: () => () => {},
                },
              },
              {
                fetcher: async (_url, init) => {
                  requests.push(JSON.parse(String(init?.body)));
                  return Response.json(current, { status });
                },
              },
            );
            try {
              const accepted = await c.readPage(
                'industry-labour-current',
                requestId,
              );
              const cursor = await c.readPage(
                'industry-labour-current',
                requestId,
                accepted.status === 'PAGE' ? accepted : undefined,
              );
              current = {
                ...body,
                source: {
                  ...body.source,
                  currentIndustryLabourCoverage: {
                    ...body.source.currentIndustryLabourCoverage,
                    globalWorldVersion: '3',
                  },
                },
              };
              const wrongHead = await c.readPage(
                'industry-labour-current',
                requestId,
              );
              current = {
                ...body,
                authority: {
                  ...body.authority,
                  identity: {
                    ...body.authority.identity,
                    countryId: 'COUNTRY_FOREIGN',
                  },
                },
              };
              const foreign = await c.readPage(
                'industry-labour-current',
                requestId,
              );
              status = 409;
              current = {
                schemaVersion: body.schemaVersion,
                requestId,
                ok: false,
                error: { code: 'STALE_SOURCE', retryable: false },
              };
              const stale = await c.readPage(
                'industry-labour-current',
                requestId,
              );
              alive = false;
              const retired = await c.readPage(
                'industry-labour-current',
                requestId,
              );
              return {
                accepted,
                cursor,
                wrongHead,
                foreign,
                stale,
                retired,
                requests,
              };
            } finally {
              c.disconnect();
            }
          },
          { body, config: serializable, requestId },
        );
        expect(result.accepted.status).toBe('PAGE');
        expect(result.accepted.rows[0]).toMatchObject({
          completedPersonDays: null,
          paidCost: null,
        });
        // This one-page result has no legal continuation; no second fetch is sent.
        expect(result.cursor).toMatchObject({
          status: 'STALE',
          code: 'INVALID_CONTINUATION',
        });
        expect(result.requests[0].page).toMatchObject({ limit: 25 });
        expect(result.wrongHead.status).toBe('UNAVAILABLE');
        expect(result.foreign.status).toBe('UNAVAILABLE');
        expect(result.stale.status).toBe('STALE');
        expect(result.retired.status).toBe('STALE');
        expect(result.requests).toHaveLength(4);
      } finally {
        await browser?.close();
        await vite.close();
      }
    }, 30000);
  },
);
