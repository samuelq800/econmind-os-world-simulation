/** Transport contracts only. These refusing services are not source, actor,
 * admission, queue, economic execution or native acceptance evidence. */
import { describe, expect, it } from 'vitest';
import { AUTHENTICATED_COMMAND_RECOVERY_SCHEMA } from '@econmind/core';
import { AUTHENTICATED_OFFICE_COMMAND_SCHEMA } from '@econmind/core/authenticated-office-command-contract';
import { INDUSTRY_PRODUCTION_COMMAND } from '@econmind/core/industry-production-command';
import { createPostwarIndustryConnection } from '../../apps/world-api/src/runtime/postwar-industry-connection.js';
import { createPostwarTradeConnection } from '../../apps/world-api/src/runtime/postwar-trade-connection.js';
import { createPostwarOfficeCommandFetchHandler } from '../../apps/world-api/src/runtime/postwar-office-command-fetch-handler.js';
import { boundedOfficeRecoveryBindingQuery } from '../../apps/world-api/src/integration/bounded-office-command-recovery-service.js';
const origin = 'https://industry-test.example',
  requestId = '11111111-1111-4111-8111-111111111111';
const envelope = () => ({
  schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  requestId,
  request: {
    worldId: 'WORLD_TEST_ONLY',
    countryId: 'COUNTRY_02',
    officeId: 'INDUSTRY',
    commandType: INDUSTRY_PRODUCTION_COMMAND,
    commandId: 'COMMAND_TEST_ONLY_INDUSTRY',
    idempotencyKey: 'KEY_TEST_ONLY_INDUSTRY',
    expectedWorldVersion: '0',
    payload: { facilityId: 'FACILITY.TEST_ONLY', runId: 'RUN.TEST_ONLY' },
  },
});
function body(recovery: boolean) {
  const original = envelope();
  return recovery
    ? {
        schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
        requestId,
        request: {
          worldId: original.request.worldId,
          commandId: original.request.commandId,
          idempotencyKey: original.request.idempotencyKey,
          originalRequest: original,
        },
      }
    : original;
}
function request(recovery: boolean, bytes = body(recovery), sender = origin) {
  return new Request(
    'https://api-test.example' +
      (recovery ? '/v1/command-recovery' : '/v1/office-command'),
    {
      method: 'POST',
      headers: { origin: sender, 'content-type': 'application/json' },
      body: JSON.stringify(bytes),
    },
  );
}
describe('fixed Industry shared HTTP borrower', () => {
  it('keeps uninstalled production and recovery closed without constructing a consumer or touching SQL', async () => {
    const c = createPostwarIndustryConnection(null);
    expect(c.status).toBe('NOT_CONNECTED');
    expect('runtime' in c).toBe(false);
    expect('consumer' in c).toBe(false);
    expect(
      await c.handleCommand({ authorization: null, request: envelope() }),
    ).toMatchObject({
      httpStatus: 503,
      body: { error: { code: 'NOT_CONNECTED' } },
    });
    expect(
      await c.recover({ authorization: null, request: body(true) }),
    ).toMatchObject({
      httpStatus: 503,
      body: { error: { code: 'NOT_CONNECTED' } },
    });
    await c.stop();
    await c.stop();
  });
  it('uses the nonlocking Industry recovery RPC', () => {
    expect(
      boundedOfficeRecoveryBindingQuery('POSTWAR_INDUSTRY_READ_ONLY_V1'),
    ).toContain('world_v2.read_postwar_industry_recovery_binding(');
  });
  it.each([false, true])(
    'routes the Industry %s request once with no Trade fallback',
    async (recovery) => {
      let industryCalls = 0,
        tradeCalls = 0,
        stops = 0;
      const response = <
        Schema extends
          | typeof AUTHENTICATED_COMMAND_RECOVERY_SCHEMA
          | typeof AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
      >(
        schemaVersion: Schema,
      ) => ({
        httpStatus: 503,
        body: {
          schemaVersion,
          requestId,
          ok: false as const,
          error: { code: 'TEST_ONLY_NO_PREPARED_RUN', retryable: false },
        },
      });
      const industry = {
        ...createPostwarIndustryConnection(null),
        transportOrigins: [origin],
        async handleCommand() {
          industryCalls++;
          return response(AUTHENTICATED_OFFICE_COMMAND_SCHEMA);
        },
        async recover() {
          industryCalls++;
          return response(AUTHENTICATED_COMMAND_RECOVERY_SCHEMA);
        },
        async stop() {
          stops++;
        },
      };
      const trade = {
        ...createPostwarTradeConnection(null),
        transportOrigins: [origin],
        async handleCommand() {
          tradeCalls++;
          return response(AUTHENTICATED_OFFICE_COMMAND_SCHEMA);
        },
        async recover() {
          tradeCalls++;
          return response(AUTHENTICATED_COMMAND_RECOVERY_SCHEMA);
        },
      };
      const mux = createPostwarOfficeCommandFetchHandler({ industry, trade }),
        r = request(recovery);
      try {
        const result = await mux.handle(r);
        expect(result?.status).toBe(503);
        expect(await result?.json()).toMatchObject({
          error: { code: 'TEST_ONLY_NO_PREPARED_RUN' },
        });
        expect(result?.headers.get('cache-control')).toBe('private, no-store');
        expect(r.bodyUsed).toBe(true);
        expect([industryCalls, tradeCalls]).toEqual([1, 0]);
      } finally {
        await mux.stop();
        await mux.stop();
      }
      expect(stops).toBe(1);
    },
  );
  it('refuses an Industry selector when its own service is absent', async () => {
    const trade = {
        ...createPostwarTradeConnection(null),
        transportOrigins: [origin],
      },
      mux = createPostwarOfficeCommandFetchHandler({ trade });
    try {
      const r = await mux.handle(request(false));
      expect(r?.status).toBe(503);
      expect(await r?.json()).toMatchObject({
        error: { code: 'OFFICE_CONNECTION_NOT_INSTALLED' },
      });
    } finally {
      await mux.stop();
    }
  });
  it('rejects wrong-office and unknown-origin selectors without forwarding', async () => {
    let calls = 0;
    const industry = {
        ...createPostwarIndustryConnection(null),
        transportOrigins: [origin],
        async handleCommand() {
          calls++;
          throw Error('MUST_NOT_DISPATCH');
        },
      },
      mux = createPostwarOfficeCommandFetchHandler({ industry });
    try {
      const original = envelope();
      expect(
        (
          await mux.handle(
            request(false, {
              ...original,
              request: { ...original.request, officeId: 'TRADE' },
            }),
          )
        )?.status,
      ).toBe(400);
      expect(
        (
          await mux.handle(
            request(false, original, 'https://foreign-test.example'),
          )
        )?.status,
      ).toBe(403);
      expect(calls).toBe(0);
    } finally {
      await mux.stop();
    }
  });
});
