/** Shipped clients/controller over TEST_ONLY wire responses, not real HTTP/DB acceptance. */
import { describe, it, expect } from 'vitest';
import { createPostwarRuntimeClient } from '../../apps/world-web/src/postwar-office-runtime/client.js';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import {
  industryUtilityPlanningWireFixture,
  planningFp,
  planningRaw,
  planningRequestId,
} from '../support/industry-utility-planning-fixture.js';
import {
  INDUSTRY_COMMITTED_RUNS_DATASET as dataset,
  INDUSTRY_COMMITTED_RUNS_NATURE,
} from '../../packages/core/src/read-models/postwar-industry-committed-runs-contract.js';
function fixture(mode = 'OK') {
  const f = industryUtilityPlanningWireFixture();
  const fetcher: typeof fetch = async (url, init) => {
    const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (request.dataset !== dataset) return f.fetcher(url, init);
    if (mode === 'MISSING' || mode === 'DENIED')
      return Response.json(
        {
          schemaVersion: 'postwar-office-runtime-read-v1',
          requestId: request.requestId,
          ok: false,
          error: { code: 'TEST_ONLY_MISSING', retryable: false },
        },
        { status: mode === 'DENIED' ? 403 : 503 },
      );
    const old = await f.fetcher(url, {
      ...init,
      body: JSON.stringify({
        ...request,
        dataset: 'industry-utility-planning',
      }),
    });
    const body = await old.json();
    body.dataset = dataset;
    const country =
      mode === 'FOREIGN'
        ? 'COUNTRY_FOREIGN'
        : f.binding.read.identity.countryId;
    const offset = Number((request.page as { offset?: number })?.offset ?? 0);
    const id = offset > 0 && mode !== 'DUPLICATE' ? 'RUN_TWO' : 'RUN_ONE';
    body.rows =
      mode === 'EMPTY'
        ? []
        : [
            {
              schemaVersion: 'postwar-industry-committed-run-row-v1',
              countryId: country,
              facilityId: 'FACILITY_TEST_ONLY',
              runId: id,
              quantity: '1',
              outputUnit: 'tonne',
              startsAtSimTime: '0',
              endsAtSimTime: '100',
              maximumExpense: '0',
              expenseCurrency: 'LBB',
              sourceRef: 'SOURCE_TEST_ONLY',
              sourceRawSha256: planningRaw,
              commandId: 'COMMAND_' + id,
              commandFingerprint: planningFp,
              eventId: 'EVENT_' + id,
              eventFingerprint: planningFp,
              committedWorldVersion: '1',
              performedPersonMilliseconds: '0',
              measurement:
                'COMMITTED_SCHEDULE_AND_RECORDED_WORK_NOT_OUTPUT_PAYMENT_OR_REMAINING_CAPACITY',
            },
          ];
    body.status = body.rows.length ? 'AVAILABLE' : 'EMPTY';
    body.source.dataNature = INDUSTRY_COMMITTED_RUNS_NATURE;
    delete body.source.currentIndustryUtilityPlanningCoverage;
    body.source.currentIndustryCommittedRunsCoverage = {
      schemaVersion: 'postwar-industry-committed-runs-coverage-v1',
      reducerVersion: 'POSTWAR_INDUSTRY_COMMITTED_RUNS_COMPLETE_PREFIX_V1',
      countryId: country,
      facilityId: 'FACILITY_TEST_ONLY',
      globalWorldVersion: mode === 'STALE' ? '8' : body.source.worldVersion,
      globalEventSequence: body.source.eventSequence,
      prefixFingerprint: planningFp,
      pageChainFingerprint: planningFp,
      sourceOriginalsFingerprint: planningFp,
      runRowsFingerprint: planningFp,
    };
    body.source.sourcePointer = {
      rowOrigin: 'fixed-industry-committed-runs-runtime',
      rowBinding: 'runId+commandFingerprint+eventFingerprint',
    };
    if (mode === 'VERSION_CHANGED' && offset > 0)
      body.source.sourceVersion = 'sha256:' + 'c'.repeat(64);
    const total = mode === 'EMPTY' ? 0 : 26;
    body.page = {
      offset,
      limit: 25,
      returned: body.rows.length,
      total,
      nextOffset:
        offset + body.rows.length < total ? offset + body.rows.length : null,
    };
    // The transport requires full pages when more records exist.
    if (offset === 0 && total > 0) {
      body.rows = Array.from({ length: 25 }, (_, i) => ({
        ...body.rows[0],
        runId: 'RUN_' + i,
        commandId: 'COMMAND_' + i,
        eventId: 'EVENT_' + i,
      }));
      body.page.returned = 25;
      body.page.nextOffset = 25;
    }
    if (offset > 0 && mode === 'DUPLICATE') body.rows[0].runId = 'RUN_0';
    return Response.json(body);
  };
  return { ...f, fetcher };
}
describe('Industry committed runs current page', () => {
  it('reads bounded schedules and next page without producing a command', async () => {
    const f = fixture(),
      c = createPostwarRuntimeClient(f.binding.read, { fetcher: f.fetcher });
    const first = await c.readPage(dataset, planningRequestId);
    expect(first.status).toBe('PAGE');
    if (first.status !== 'PAGE') throw Error('PAGE_REQUIRED');
    expect(first.rows).toHaveLength(25);
    const next = await c.readPage(dataset, planningRequestId, first);
    expect(next.status).toBe('PAGE');
    expect(f.calls.every((x) => x.path === '/v1/postwar-office-runtime')).toBe(
      true,
    );
    c.disconnect();
  });
  it.each(['FOREIGN', 'STALE', 'DUPLICATE', 'VERSION_CHANGED'])(
    'refuses %s rows instead of returning current data',
    async (mode) => {
      const f = fixture(mode),
        c = createPostwarRuntimeClient(f.binding.read, { fetcher: f.fetcher });
      const first = await c.readPage(dataset, planningRequestId);
      const result =
        (mode === 'DUPLICATE' || mode === 'VERSION_CHANGED') &&
        first.status === 'PAGE'
          ? await c.readPage(dataset, planningRequestId, first)
          : first;
      expect(result.status).not.toBe('PAGE');
      c.disconnect();
    },
  );
  it.each(['EMPTY', 'MISSING', 'DENIED'])(
    'keeps %s distinct in the actual controller',
    async (mode) => {
      const f = fixture(mode),
        c = createOfficeCommandController(f.binding, () => f.binding.view, {
          fetcher: f.fetcher,
          requestId: () => planningRequestId,
        });
      await c.refresh();
      if (mode === 'EMPTY')
        expect(c.getState().committedRunsPage?.status).toBe('EMPTY');
      else expect(c.getState().committedRunsPage).toBeNull();
      if (mode === 'DENIED') expect(c.getState().runtimePage).toBeNull();
      else expect(c.getState().runtimePage).not.toBeNull();
      c.disconnect();
      expect(c.getState().committedRunsPage).toBeNull();
    },
  );
});
