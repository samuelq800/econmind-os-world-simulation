/** TEST_ONLY wire/DOM fixtures. Native admitted-source HTTP is separately
 * tested against the sealed PostgreSQL reference; these rows grant nothing. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPostwarRuntimeClient,
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import { createPostwarRuntimeView } from '../../apps/world-web/src/postwar-office-runtime/view.js';
import { officeProjectionFixture } from './office-projection-fixture.js';
import { HostDocument } from './trusted-host-dom.js';
import { AUTHENTICATED_CURRENT_SEAT_SCHEMA } from '@econmind/core';
import { installOfficeProjection } from '../../apps/world-web/src/office-projection/view.js';
import { installFinancialIntake } from '../../apps/world-web/src/financial-intake/view.js';
import { installTrustedHost } from '../../apps/world-web/src/trusted-host/bootstrap.js';
import { installFormalSessionAdapter } from '../../apps/world-web/src/trusted-host/formal-session-adapter.js';
const requestId = '11111111-1111-4111-8111-111111111111';
const hash = 'sha256:' + 'a'.repeat(64);
function fixture() {
  const original = officeProjectionFixture('social');
  const config = {
    ...original.config,
    identity: {
      ...original.config.identity,
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    },
    endpoints: {
      ...original.config.endpoints,
      projectionPath: POSTWAR_RUNTIME_PATH,
    },
    world: { ...original.config.world, minimumWorldVersion: '0' },
  };
  config.currentIdentity = () => config.identity;
  let valid = true;
  const listeners = new Set<() => void>();
  config.session = {
    ...config.session,
    isCurrent: () => valid,
    onInvalidate(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const authority = {
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    identity: config.identity,
    seatRef: config.seatRef,
    seatState: 'ACTIVE',
    seed: {
      worldId: config.world.worldId,
      seedRef: config.world.seedRef,
      contentHash: config.world.contentHash,
      admissionRef: config.world.admissionRef,
    },
    readback: {
      worldId: config.world.worldId,
      seedRef: config.world.seedRef,
      contentHash: config.world.contentHash,
      admissionRef: config.world.admissionRef,
      worldVersion: '0',
      eventSequence: '0',
      readbackRef: 'TEST_READBACK',
    },
  };
  const calls: Record<string, unknown>[] = [];
  const body = (dataset = 'positions', offset = 0, total = 2) => ({
    schemaVersion: POSTWAR_RUNTIME_SCHEMA,
    requestId,
    ok: true,
    status: total === 0 ? 'EMPTY' : 'AVAILABLE',
    dataset,
    authority,
    source: {
      dataNature: 'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY',
      sourceVersion: hash,
      bindingVersion: hash,
      sourceRevision: 'TEST_REVISION',
      pageHash: 'a'.repeat(64),
      returnedRowsHash: 'a'.repeat(64),
      hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
      sourcePointer: { classification: 'TEST_ONLY_WIRE_METADATA' },
      worldId: config.identity.worldId,
      countryId: config.identity.countryId,
      officeId: 'SOCIAL',
      authSubjectId: config.identity.authSubjectId,
      authorizationRevision: config.identity.authorizationRevision,
      scopeKey: config.identity.scopeKey,
      modelVersion: config.identity.modelVersion,
      seedRef: config.world.seedRef,
      contentHash: config.world.contentHash,
      admissionRef: config.world.admissionRef,
      worldVersion: '0',
      eventSequence: '0',
    },
    page: {
      offset,
      limit: 25,
      returned: total ? 1 : 0,
      total,
      nextOffset: offset + 1 < total ? offset + 1 : null,
    },
    rows: total
      ? [
          {
            positionId: 'TEST_TEACHER',
            requiredCount: '9007199254740993',
            employedCount: '1',
            wageAmount: '11.25',
            wageCurrency: 'LC_TEST',
          },
        ]
      : [],
  });
  const fetcher: typeof fetch = async (_url, init) => {
    const query = JSON.parse(String(init?.body));
    calls.push(query);
    return Response.json({
      ...body(query.dataset, query.page.offset),
      requestId: query.requestId,
    });
  };
  return {
    config,
    calls,
    body,
    fetcher,
    invalidate() {
      valid = false;
      for (const fn of [...listeners]) fn();
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('bounded postwar office client', () => {
  it.each(['pageHash', 'returnedRowsHash', 'hashAlgorithm', 'sourcePointer'])(
    'rejects missing page provenance metadata (%s)',
    async (field) => {
      const f = fixture(),
        wire = f.body();
      Reflect.deleteProperty(wire.source, field);
      const client = createPostwarRuntimeClient(f.config, {
        fetcher: async () => Response.json(wire),
      });
      expect((await client.readPage('positions', requestId)).status).toBe(
        'UNAVAILABLE',
      );
      client.disconnect();
    },
  );
  it.each([
    ['INDUSTRY', 'opening-inventory-entries'],
    ['TRADE', 'opening-inventory-entries'],
    ['CAPTAIN', 'public-service-summary'],
    ['FINANCE', 'currency-fx'],
    ['CENTRAL_BANK', 'cb-holdings'],
  ])(
    'keeps %s opening facts historical after the World advances',
    async (office, dataset) => {
      const f = fixture();
      f.config.identity.officeId = office;
      const wire = f.body(dataset, 0, 1);
      wire.source.officeId = office;
      wire.authority.readback.worldVersion = '6';
      wire.authority.readback.eventSequence = '10';
      Object.assign(wire.source, {
        dataNature: 'ADMITTED_IMMUTABLE_OPENING_FACTS',
        originWorldVersion: '0',
        originEventSequence: '0',
        observedHead: { worldVersion: '6', eventSequence: '10' },
      });
      const client = createPostwarRuntimeClient(f.config, {
        fetcher: async () => Response.json(wire),
      });
      const result = await client.readPage(dataset, requestId);
      expect(result.status).toBe('PAGE');
      if ('source' in result) {
        expect(result.source.worldVersion).toBe('0');
        expect(result.authority.readback.worldVersion).toBe('6');
      }
      client.disconnect();
    },
  );
  it.each([
    'valid',
    'missing-coverage',
    'wrong-head',
    'posting',
    'wrong-origin',
    'unknown-reducer',
    'historical-ledger',
  ])(
    'checks the complete financial prefix without promoting opening claims to cash (%s)',
    async (fault) => {
      const f = fixture();
      f.config.identity.officeId = 'FINANCE';
      const wire = f.body('treasury-capacity', 0, 1);
      wire.source.officeId = 'FINANCE';
      wire.authority.readback.worldVersion = '6';
      wire.authority.readback.eventSequence = '10';
      Object.assign(wire.source, {
        dataNature: 'ADMITTED_CURRENT_FINANCIAL_NO_POSTING_PREFIX',
        worldVersion: '6',
        eventSequence: '10',
        originWorldVersion: fault === 'wrong-origin' ? '1' : '0',
        originEventSequence: '0',
        observedHead: { worldVersion: '6', eventSequence: '10' },
      });
      if (fault !== 'missing-coverage')
        Object.assign(wire.source, {
          currentFinancialCoverage: {
            schemaVersion: 'postwar-financial-current-prefix-coverage-v1',
            reducerVersion:
              fault === 'unknown-reducer'
                ? 'UNKNOWN'
                : 'POSTWAR_FINANCIAL_COMPLETE_NO_POSTING_PREFIX_V1',
            coverageRef: 'FINANCIAL_COVERAGE_TEST_ONLY',
            prefixFingerprint: hash,
            knownEffectsFingerprint: hash,
            globalWorldVersion: fault === 'wrong-head' ? '7' : '6',
            globalEventSequence: '10',
            coveredThroughEventId: 'EVENT_TEST_ONLY',
            coveredThroughEventFingerprint: hash,
            noFinancialPostings: fault !== 'posting',
            noInventoryPostings: true,
          },
        });
      if (fault === 'historical-ledger')
        Object.assign(wire.source, {
          dataNature: 'ADMITTED_IMMUTABLE_OPENING_FACTS',
          worldVersion: '0',
          eventSequence: '0',
        });
      const client = createPostwarRuntimeClient(f.config, {
        fetcher: async () => Response.json(wire),
      });
      expect(
        (await client.readPage('treasury-capacity', requestId)).status,
      ).toBe(fault === 'valid' ? 'PAGE' : 'UNAVAILABLE');
      client.disconnect();
    },
  );
  it.each(['origin', 'observed-head', 'current-label'])(
    'rejects altered historical fact provenance (%s)',
    async (fault) => {
      const f = fixture();
      f.config.identity.officeId = 'INDUSTRY';
      const wire = f.body('opening-inventory-entries', 0, 1);
      wire.source.officeId = 'INDUSTRY';
      wire.authority.readback.worldVersion = '6';
      wire.authority.readback.eventSequence = '10';
      Object.assign(wire.source, {
        dataNature:
          fault === 'current-label'
            ? 'ADMITTED_CURRENT_FINANCIAL_NO_POSTING_PREFIX'
            : 'ADMITTED_IMMUTABLE_OPENING_FACTS',
        originWorldVersion: fault === 'origin' ? '1' : '0',
        originEventSequence: '0',
        observedHead: {
          worldVersion: fault === 'observed-head' ? '5' : '6',
          eventSequence: '10',
        },
      });
      const client = createPostwarRuntimeClient(f.config, {
        fetcher: async () => Response.json(wire),
      });
      expect(
        (await client.readPage('opening-inventory-entries', requestId)).status,
      ).toBe('UNAVAILABLE');
      client.disconnect();
    },
  );
  it.each([
    'valid',
    'missing',
    'foreign-country',
    'wrong-origin',
    'wrong-head',
    'unknown-reducer',
  ])(
    'checks complete-prefix coverage for a prior-country materialization (%s)',
    async (fault) => {
      const f = fixture(),
        wire = f.body();
      wire.authority.readback.worldVersion = '3';
      wire.authority.readback.eventSequence = '3';
      Object.assign(wire.source, {
        worldVersion: '3',
        eventSequence: '3',
        dataNature:
          'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION',
        currentStateBinding: {
          sourceCommandId: 'COMMAND_TEST_ONLY',
          commandFingerprint: hash,
          sourceEventId: 'EVENT_TEST_ONLY',
          eventFingerprint: hash,
          materializationKey: `SOCIAL_EMPLOYMENT_SERVICE_${f.config.identity.countryId}`,
          materializationHash: hash,
          canonicalMaterializationSha256: 'a'.repeat(64),
          sourceStateWorldVersion: '2',
          sourceEventSequence: '2',
        },
      });
      if (fault !== 'missing')
        Object.assign(wire.source, {
          currentPrefixCoverage: {
            schemaVersion: 'postwar-social-current-prefix-coverage-v2',
            coverageRef: 'COVERAGE_TEST_ONLY',
            countryId:
              fault === 'foreign-country'
                ? 'COUNTRY_OTHER'
                : f.config.identity.countryId,
            globalWorldVersion: fault === 'wrong-head' ? '4' : '3',
            globalEventSequence: '3',
            originWorldVersion: fault === 'wrong-origin' ? '1' : '2',
            originEventSequence: '2',
            prefixFingerprint: hash,
            knownEffectsFingerprint: hash,
            coveredThroughEventId: 'EVENT_LATEST_TEST_ONLY',
            coveredThroughEventFingerprint: hash,
            reducerVersion:
              fault === 'unknown-reducer'
                ? 'OTHER_REDUCER'
                : 'POSTWAR_SOCIAL_COMPLETE_PREFIX_SCOPE_V2',
          },
        });
      const client = createPostwarRuntimeClient(f.config, {
        fetcher: async () => Response.json(wire),
      });
      expect((await client.readPage('positions', requestId)).status).toBe(
        fault === 'valid' ? 'PAGE' : 'UNAVAILABLE',
      );
      client.disconnect();
    },
  );
  it.each([
    [
      'positions',
      '2',
      'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION',
      'PAGE',
    ],
    [
      'positions',
      '2',
      'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY',
      'UNAVAILABLE',
    ],
    [
      'positions',
      '0',
      'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION',
      'UNAVAILABLE',
    ],
    [
      'offers',
      '2',
      'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION',
      'UNAVAILABLE',
    ],
  ])(
    'requires the committed-state data kind and supported dataset at head %s/%s',
    async (dataset, version, nature, expected) => {
      const f = fixture();
      const wire = f.body(dataset);
      wire.authority.readback.worldVersion = version;
      wire.authority.readback.eventSequence = version;
      wire.source.worldVersion = version;
      wire.source.eventSequence = version;
      wire.source.dataNature = nature;
      if (version !== '0' && nature.startsWith('ADMITTED_CURRENT_'))
        Object.assign(wire.source, {
          currentStateBinding: {
            sourceCommandId: 'COMMAND_TEST_ONLY',
            commandFingerprint: hash,
            sourceEventId: 'EVENT_TEST_ONLY',
            eventFingerprint: hash,
            materializationKey: `SOCIAL_EMPLOYMENT_SERVICE_${f.config.identity.countryId}`,
            materializationHash: hash,
            canonicalMaterializationSha256: 'a'.repeat(64),
            sourceStateWorldVersion: version,
            sourceEventSequence: version,
          },
        });
      const client = createPostwarRuntimeClient(f.config, {
        fetcher: async () => Response.json(wire),
      });
      expect((await client.readPage(dataset, requestId)).status).toBe(expected);
      client.disconnect();
    },
  );
  it.each(['missing', 'foreign-country', 'wrong-head'])(
    'rejects a current page with a %s event materialization binding',
    async (fault) => {
      const f = fixture(),
        wire = f.body();
      wire.authority.readback.worldVersion = '2';
      wire.authority.readback.eventSequence = '2';
      wire.source.worldVersion = '2';
      wire.source.eventSequence = '2';
      wire.source.dataNature =
        'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION';
      if (fault !== 'missing')
        Object.assign(wire.source, {
          currentStateBinding: {
            sourceCommandId: 'COMMAND_TEST_ONLY',
            commandFingerprint: hash,
            sourceEventId: 'EVENT_TEST_ONLY',
            eventFingerprint: hash,
            materializationKey:
              fault === 'foreign-country'
                ? 'SOCIAL_EMPLOYMENT_SERVICE_COUNTRY_OTHER'
                : `SOCIAL_EMPLOYMENT_SERVICE_${f.config.identity.countryId}`,
            materializationHash: hash,
            canonicalMaterializationSha256: 'a'.repeat(64),
            sourceStateWorldVersion: fault === 'wrong-head' ? '1' : '2',
            sourceEventSequence: '2',
          },
        });
      const client = createPostwarRuntimeClient(f.config, {
        fetcher: async () => Response.json(wire),
      });
      expect(await client.readPage('positions', requestId)).toMatchObject({
        status: 'UNAVAILABLE',
        code: 'CURRENT_STATE_BINDING_MISMATCH',
      });
      client.disconnect();
    },
  );
  it('defaults closed without token/network work', async () => {
    const fetcher = vi.fn();
    const c = createPostwarRuntimeClient(null, { fetcher });
    expect((await c.readPage('positions', requestId)).status).toBe(
      'NOT_CONNECTED',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('retains exact decimal/count strings and both continuation versions', async () => {
    const f = fixture(),
      c = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
    const first = await c.readPage('positions', requestId);
    expect(first.status).toBe('PAGE');
    if (!('page' in first)) throw Error('not page');
    expect(first.rows[0]?.requiredCount).toBe('9007199254740993');
    expect((await c.readPage('positions', requestId, first)).status).toBe(
      'PAGE',
    );
    expect(f.calls[1]?.page).toEqual({
      offset: 1,
      limit: 25,
      sourceVersion: hash,
      bindingVersion: hash,
    });
    c.disconnect();
  });
  it('distinguishes authenticated empty offers from unavailable backend', async () => {
    const f = fixture();
    let unavailable = false;
    const c = createPostwarRuntimeClient(f.config, {
      fetcher: async () =>
        unavailable
          ? Response.json(
              {
                schemaVersion: POSTWAR_RUNTIME_SCHEMA,
                requestId,
                ok: false,
                error: { code: 'UPSTREAM_UNAVAILABLE' },
              },
              { status: 503 },
            )
          : Response.json(f.body('offers', 0, 0)),
    });
    expect((await c.readPage('offers', requestId)).status).toBe('EMPTY');
    unavailable = true;
    expect(await c.readPage('offers', requestId)).toEqual({
      status: 'UNAVAILABLE',
      code: 'UPSTREAM_UNAVAILABLE',
    });
    c.disconnect();
  });
  it.each([
    'countryId',
    'officeId',
    'authSubjectId',
    'authorizationRevision',
    'scopeKey',
    'admissionRef',
  ])('rejects source %s scope substitution', async (field) => {
    const f = fixture(),
      body = f.body();
    Object.assign(body.source, { [field]: 'OTHER_SCOPE' });
    const c = createPostwarRuntimeClient(f.config, {
      fetcher: async () => Response.json(body),
    });
    expect((await c.readPage('positions', requestId)).status).toBe(
      'UNAVAILABLE',
    );
    c.disconnect();
  });
  it('rejects nonprogressing pagination and oversized response', async () => {
    const f = fixture(),
      body = f.body();
    body.page.nextOffset = 0;
    const c = createPostwarRuntimeClient(f.config, {
      fetcher: async () => Response.json(body),
    });
    expect((await c.readPage('positions', requestId)).status).toBe(
      'UNAVAILABLE',
    );
    c.disconnect();
    const large = createPostwarRuntimeClient(f.config, {
      fetcher: async () =>
        Response.json({ ...f.body(), padding: 'x'.repeat(65536) }),
    });
    expect((await large.readPage('positions', requestId)).status).toBe(
      'UNAVAILABLE',
    );
    large.disconnect();
  });
  it('aborts delayed token work on session invalidation and late response cannot revive it', async () => {
    const f = fixture();
    let release!: (s: string) => void;
    const fetcher = vi.fn();
    f.config.getAccessToken = () =>
      new Promise<string>((r) => {
        release = r;
      });
    const c = createPostwarRuntimeClient(f.config, { fetcher });
    const pending = c.readPage('positions', requestId);
    f.invalidate();
    expect((await pending).status).toBe('STALE');
    release('TEST_ONLY');
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('bounds stalled body reading and retires superseded reads', async () => {
    const f = fixture();
    const c = createPostwarRuntimeClient(f.config, {
      timeoutMs: 5,
      fetcher: async () =>
        new Response(new ReadableStream({ start() {} }), {
          headers: { 'content-type': 'application/json' },
        }),
    });
    expect(await c.readPage('positions', requestId)).toEqual({
      status: 'UNAVAILABLE',
      code: 'CANCELLED_OR_TIMEOUT',
    });
    c.disconnect();
    let release!: (response: Response) => void;
    let first = true;
    const d = createPostwarRuntimeClient(f.config, {
      fetcher: async () =>
        first
          ? ((first = false),
            new Promise<Response>((r) => {
              release = r;
            }))
          : Response.json(f.body('offers', 0, 0)),
    });
    const old = d.readPage('positions', requestId);
    await Promise.resolve();
    await Promise.resolve();
    const next = d.readPage('offers', requestId);
    expect((await old).status).toBe('STALE');
    expect((await next).status).toBe('EMPTY');
    release(Response.json(f.body()));
    d.disconnect();
  });
  it('renders actual business fields and clears private rows on invalidation', async () => {
    const f = fixture();
    vi.stubGlobal('fetch', f.fetcher);
    const doc = new HostDocument('social'),
      view = createPostwarRuntimeView(f.config, () => undefined);
    await view.refresh();
    expect(view.render(doc as unknown as Document).textContent).toContain(
      '9007199254740993',
    );
    f.invalidate();
    expect(view.render(doc as unknown as Document).textContent).not.toContain(
      'TEST_TEACHER',
    );
    view.disconnect();
  });
});

describe('new current-seat version / actual installed page consumers TEST_ONLY', () => {
  it.each([true, false])(
    'requires an actual bounded page read before host connect (page available=%s)',
    async (available) => {
      const f = fixture(),
        doc = new HostDocument('social'),
        mutations: (() => void)[] = [];
      vi.stubGlobal(
        'MutationObserver',
        class {
          constructor(fn: () => void) {
            mutations.push(fn);
          }
          observe() {}
        },
      );
      vi.stubGlobal(
        'fetch',
        available ? f.fetcher : async () => Response.json({}),
      );
      const document = doc as unknown as Document,
        window = { addEventListener() {} } as unknown as Window;
      const projection = installOfficeProjection(document, window),
        financial = installFinancialIntake(document, window);
      const host = installTrustedHost(document, window, {
        projection,
        financial,
        localTrade: { disconnect() {} },
      });
      const now = Math.floor(Date.now() / 1000);
      const adapter = installFormalSessionAdapter(document, window, host, {
        requestId: () => requestId,
      });
      try {
        expect(
          adapter.configure({
            auth: {
              currentSession: () => ({
                subject: f.config.identity.authSubjectId,
                sessionRef: 'TEST_SESSION',
                expiresAtEpochSeconds: now + 60,
              }),
              getAccessToken: f.config.getAccessToken,
              subscribe: () => () => undefined,
            },
            seats: {
              readSeat: async (request) => ({
                schemaVersion: AUTHENTICATED_CURRENT_SEAT_SCHEMA,
                requestId: request.requestId,
                ok: true,
                session: {
                  authSubjectId: f.config.identity.authSubjectId,
                  issuedAtEpochSeconds: now - 1,
                  expiresAtEpochSeconds: now + 60,
                },
                world: f.config.world,
                bindings: [f.body().authority],
              }),
            },
            targets: { read: f.config.endpoints },
            world: f.config.world,
            countryIdsByDisplayId: { '01': f.config.identity.countryId },
          }),
        ).toBe(true);
        const connected = await adapter.bindCurrentView();
        expect(connected, JSON.stringify(adapter.getState())).toBe(available);
        if (!available) {
          expect(projection.getState().status).toBe('MISSING');
          return;
        }
        expect(f.calls).toHaveLength(1);
        expect(f.calls[0]?.operation).toBe('READ_CURRENT_OFFICE_OPENING');
        doc.root.querySelector('[data-office-projection-entry]')?.click();
        const dialog = doc.root.querySelector(
          '[data-office-projection-dialog]',
        );
        const read = dialog
          ?.all()
          .find((n) => n.textContent === 'Read current authorized page');
        read?.click();
        for (let i = 0; i < 30; i++) await Promise.resolve();
        expect(dialog?.textContent).toContain('TEST_TEACHER');
        expect(dialog?.textContent).toContain('9007199254740993');
        doc.root.dataset.office = 'finance';
        mutations.forEach((fn) => fn());
        expect(dialog?.textContent).not.toContain('TEST_TEACHER');
        expect(projection.getState().status).toBe('MISSING');
      } finally {
        adapter.disconnect();
      }
    },
  );
});
