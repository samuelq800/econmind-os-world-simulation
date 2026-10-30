/** OFFLINE TEST_ONLY shipped client/view protocol. Intercepted transport and DOM
 * do not establish actual SQL publication, authority, or native browser PASS. */
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  POSTWAR_CAPTAIN_CURRENT_NATURE,
  POSTWAR_CAPTAIN_CURRENT_DATASET,
  POSTWAR_CAPTAIN_CURRENT_BUCKETS,
} from '@econmind/core/postwar-captain-current-contract';
import {
  createPostwarRuntimeClient,
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import { createPostwarRuntimeView } from '../../apps/world-web/src/postwar-office-runtime/view.js';
import { officeProjectionFixture } from './office-projection-fixture.js';
import { HostDocument } from './trusted-host-dom.js';
const requestId = '11111111-1111-4111-8111-111111111111',
  hash = 'sha256:' + 'a'.repeat(64);
function fixture() {
  const base = officeProjectionFixture('captain'),
    identity = {
      ...base.config.identity,
      countryId: 'COUNTRY_01',
      scopeKey: 'OFFICE_434F554E5452595F3031_4341505441494E',
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    };
  let current: typeof identity | null = identity,
    alive = true;
  const listeners = new Set<() => void>();
  const config = {
    ...base.config,
    identity,
    currentIdentity: () => current,
    endpoints: {
      ...base.config.endpoints,
      projectionPath: POSTWAR_RUNTIME_PATH,
    },
    world: { ...base.config.world, minimumWorldVersion: '0' },
    session: {
      sessionRef: 'SESSION_TEST_ONLY_CAPTAIN',
      isCurrent: () => alive,
      onInvalidate: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
  };
  const seed = {
    worldId: config.world.worldId,
    seedRef: config.world.seedRef,
    contentHash: config.world.contentHash,
    admissionRef: config.world.admissionRef,
  };
  const coverage = {
    schemaVersion: 'postwar-captain-current-prefix-coverage-v1',
    reducerVersion: 'POSTWAR_CAPTAIN_FINANCE_SOCIAL_FX_COMPLETE_PREFIX_V1',
    countryId: identity.countryId,
    coverageRef: 'CAPTAIN_COVERAGE_TEST_ONLY',
    prefixFingerprint: hash,
    knownEffectsFingerprint: hash,
    globalWorldVersion: '3',
    globalEventSequence: '6',
    coveredThroughEventId: 'EVENT_TEST_ONLY_LAST',
    coveredThroughEventFingerprint: hash,
    financialPostingCount: '6',
    financialBatchCount: '2',
    financialPostingsFingerprint: hash,
    capitalStateHash: hash,
    originalPacketSha256: 'b'.repeat(64),
    originWorldVersion: '0',
    originEventSequence: '0',
  };
  const values = POSTWAR_CAPTAIN_CURRENT_BUCKETS.map((bucket) => ({
    schemaVersion: 'postwar-captain-political-capital-row-v1',
    countryId: identity.countryId,
    capitalRef: 'CAPITAL_TEST_ONLY_ADOPTED_PACKET',
    bucket,
    unit: 'political_capital',
    balance: '10',
    opening: '10',
    generated: '0',
    total: '10',
    available: '10',
    spent: '0',
    closing: '10',
    allocationNature: 'REALLOCATION_NOT_GENERATION_OR_SPENDING',
  }));
  const wire = (id = requestId) => ({
    schemaVersion: POSTWAR_RUNTIME_SCHEMA,
    requestId: id,
    ok: true,
    status: 'AVAILABLE',
    dataset: POSTWAR_CAPTAIN_CURRENT_DATASET,
    authority: {
      source: 'SERVER_VERIFIED_READ_BINDING',
      capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
      identity,
      seatRef: config.seatRef,
      seatState: 'ACTIVE',
      seed,
      readback: {
        ...seed,
        worldVersion: '3',
        eventSequence: '6',
        readbackRef: 'READBACK_TEST_ONLY',
      },
    },
    source: {
      dataNature: POSTWAR_CAPTAIN_CURRENT_NATURE,
      sourceVersion: hash,
      bindingVersion: hash,
      sourceRevision: 'REVISION_TEST_ONLY_CAPTAIN',
      worldId: identity.worldId,
      countryId: identity.countryId,
      officeId: 'CAPTAIN',
      authSubjectId: identity.authSubjectId,
      authorizationRevision: identity.authorizationRevision,
      scopeKey: identity.scopeKey,
      modelVersion: identity.modelVersion,
      ...{
        seedRef: seed.seedRef,
        contentHash: seed.contentHash,
        admissionRef: seed.admissionRef,
      },
      worldVersion: '3',
      eventSequence: '6',
      originWorldVersion: '0',
      originEventSequence: '0',
      observedHead: { worldVersion: '3', eventSequence: '6' },
      currentCaptainCoverage: coverage,
      pageHash: 'c'.repeat(64),
      returnedRowsHash: 'c'.repeat(64),
      hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
      sourcePointer: { classification: 'OFFLINE_TEST_ONLY_NOT_AUTHORITY' },
    },
    page: { offset: 0, limit: 25, returned: 7, total: 7, nextOffset: null },
    rows: values,
  });
  let transform: (value: ReturnType<typeof wire>) => unknown = (v) => v,
    status = 200;
  const calls: unknown[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    if (typeof init?.body !== 'string')
      throw Error('TEST_ONLY_EXPECTED_STRICT_REQUEST');
    const request = JSON.parse(init.body) as { requestId: string };
    calls.push(request);
    return Response.json(transform(wire(request.requestId)), { status });
  };
  return {
    config,
    wire,
    fetcher,
    calls,
    change(fn: typeof transform) {
      transform = fn;
    },
    setStatus(value: number) {
      status = value;
    },
    changeOffice() {
      current = { ...identity, officeId: 'FINANCE' };
    },
    invalidate() {
      alive = false;
      current = null;
      for (const fn of [...listeners]) fn();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('Captain current runtime browser-safe wire and view', () => {
  it('requests the fixed dataset and accepts seven scoped buckets with separate origin/current head', async () => {
    const f = fixture(),
      client = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
    const result = await client.readPage(
      POSTWAR_CAPTAIN_CURRENT_DATASET,
      requestId,
    );
    expect(result.status).toBe('PAGE');
    if ('page' in result) {
      expect(result.rows).toHaveLength(7);
      expect(result.source.worldVersion).toBe('3');
      expect(result.source.originWorldVersion).toBe('0');
    }
    expect(f.calls[0]).toMatchObject({
      officeId: 'CAPTAIN',
      dataset: POSTWAR_CAPTAIN_CURRENT_DATASET,
    });
    client.disconnect();
  });
  it('does not accept the old H0 kind or historical facts as the new current dataset', async () => {
    for (const dataNature of [
      'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY',
      'ADMITTED_IMMUTABLE_OPENING_FACTS',
    ]) {
      const f = fixture();
      f.change((w) => ({ ...w, source: { ...w.source, dataNature } }));
      const c = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
      expect(
        (await c.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId)).status,
      ).toBe('UNAVAILABLE');
      c.disconnect();
    }
  });
  it('rejects foreign rows, duplicate buckets and coverage/head drift', async () => {
    const transforms: ((
      w: ReturnType<ReturnType<typeof fixture>['wire']>,
    ) => unknown)[] = [
      (w) => ({
        ...w,
        rows: w.rows.map((v, i) =>
          i === 0 ? { ...v, countryId: 'COUNTRY_02' } : v,
        ),
      }),
      (w) => ({ ...w, rows: [w.rows[0], w.rows[0], ...w.rows.slice(2)] }),
      (w) => ({
        ...w,
        source: {
          ...w.source,
          currentCaptainCoverage: {
            ...w.source.currentCaptainCoverage,
            globalWorldVersion: '4',
          },
        },
      }),
      (w) => ({ ...w, source: { ...w.source, originWorldVersion: '1' } }),
    ];
    for (const transform of transforms) {
      const f = fixture();
      f.change(transform);
      const c = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
      expect(
        (await c.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId)).status,
      ).toBe('UNAVAILABLE');
      c.disconnect();
    }
  });
  it('keeps unavailable and stale responses distinct from a fabricated empty seven-bucket source', async () => {
    const f = fixture();
    f.setStatus(503);
    f.change((w) => ({
      schemaVersion: w.schemaVersion,
      requestId: w.requestId,
      ok: false,
      error: { code: 'CURRENT_CAPTAIN_UNAVAILABLE', retryable: false },
    }));
    const c = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
    expect(
      await c.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId),
    ).toEqual({ status: 'UNAVAILABLE', code: 'CURRENT_CAPTAIN_UNAVAILABLE' });
    c.disconnect();
    const stale = fixture();
    stale.setStatus(409);
    stale.change((w) => ({
      schemaVersion: w.schemaVersion,
      requestId: w.requestId,
      ok: false,
      error: { code: 'CURRENT_CAPTAIN_STALE', retryable: false },
    }));
    const s = createPostwarRuntimeClient(stale.config, {
      fetcher: stale.fetcher,
    });
    expect(
      (await s.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId)).status,
    ).toBe('STALE');
    s.disconnect();
    const empty = fixture();
    empty.change((w) => ({
      ...w,
      status: 'EMPTY',
      page: { ...w.page, total: 0, returned: 0 },
      rows: [],
    }));
    const e = createPostwarRuntimeClient(empty.config, {
      fetcher: empty.fetcher,
    });
    expect(
      (await e.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId)).status,
    ).toBe('UNAVAILABLE');
    e.disconnect();
  });
  it('retiring the session or changing the current role clears scope before another fetch', async () => {
    const f = fixture(),
      c = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
    await c.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId);
    f.changeOffice();
    expect(
      (await c.readPage(POSTWAR_CAPTAIN_CURRENT_DATASET, requestId)).status,
    ).toBe('STALE');
    expect(f.calls).toHaveLength(1);
    f.invalidate();
    c.disconnect();
  });
  it('renders real business fields and clears them on failure or session invalidation', async () => {
    const f = fixture();
    vi.stubGlobal('fetch', f.fetcher);
    const view = createPostwarRuntimeView(f.config, () => {}),
      doc = new HostDocument('captain');
    await view.refresh();
    expect(view.state().status).toBe('CURRENT');
    const rendered = view.render(doc as unknown as Document);
    expect(rendered.textContent).toContain(
      'Verified current political capital',
    );
    expect(rendered.textContent).toContain('Capital origin 0');
    expect(rendered.textContent).toContain('FISCAL_REFORM');
    expect(rendered.textContent).toContain('political_capital');
    f.setStatus(503);
    f.change((w) => ({
      schemaVersion: w.schemaVersion,
      requestId: w.requestId,
      ok: false,
      error: { code: 'CURRENT_CAPTAIN_UNAVAILABLE', retryable: false },
    }));
    await view.refresh();
    expect(view.state().status).toBe('UNAVAILABLE');
    expect(view.render(doc as unknown as Document).textContent).not.toContain(
      'FISCAL_REFORM',
    );
    f.invalidate();
    expect(view.state().status).toBe('MISSING');
    view.disconnect();
  });
});
