import { AUTHENTICATED_COMMAND_RECOVERY_SCHEMA } from '@econmind/core';
import { INDUSTRY_FIRST_DAY_POLICY_VERSION } from '@econmind/core';
/** Actual fixed mux/borrower refusal; no fake queue/runtime/source is issued. */
import { describe, expect, it } from 'vitest';
import { AUTHENTICATED_OFFICE_COMMAND_SCHEMA } from '@econmind/core/authenticated-office-command-contract';
import { INDUSTRY_RUN_SCHEDULE_COMMAND } from '@econmind/core/industry-first-day-work';
import { createPostwarIndustryConnection } from '../../apps/world-api/src/runtime/postwar-industry-connection.js';
import { createPostwarOfficeCommandFetchHandler } from '../../apps/world-api/src/runtime/postwar-office-command-fetch-handler.js';
const envelope = () => ({
  schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  requestId: '11111111-1111-4111-8111-111111111111',
  request: {
    worldId: 'WORLD_TEST_ONLY',
    countryId: 'COUNTRY_02',
    officeId: 'INDUSTRY',
    commandType: INDUSTRY_RUN_SCHEDULE_COMMAND,
    commandId: 'COMMAND_TEST_ONLY_RUN',
    idempotencyKey: 'KEY_TEST_ONLY_RUN',
    expectedWorldVersion: '0',
    payload: {
      schemaVersion: 'postwar-industry-run-schedule-v1',
      runId: 'RUN_TEST_ONLY',
      facilityId: 'FACILITY.TEST_ONLY',
      quantity: { amount: '1', unit: 'barrel equivalent' },
      startsAtSimTime: '0',
      endsAtSimTime: '86400000',
      maximumExpense: { amount: '100', currency: 'XBB' },
      policyVersion: INDUSTRY_FIRST_DAY_POLICY_VERSION,
      sourceRef: 'SOURCE_TEST_ONLY',
      sourceRawSha256: 'b'.repeat(64),
    },
  },
});
const http = (body: unknown) =>
  new Request('https://api-test.example/v1/office-command', {
    method: 'POST',
    headers: {
      origin: 'https://industry-test.example',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
describe('manual RUN HTTP family stays closed without its source runtime', () => {
  it('recognizes the finite family but cannot register/queue through an uninstalled borrower', async () => {
    const c = createPostwarIndustryConnection(null),
      mux = createPostwarOfficeCommandFetchHandler({
        industry: { ...c, transportOrigins: ['https://industry-test.example'] },
      });
    try {
      expect(
        await c.handleCommand({ authorization: null, request: envelope() }),
      ).toMatchObject({ httpStatus: 503 });
      const response = await mux.handle(http(envelope()));
      expect(response?.status).toBe(503);
      const b = await response?.json();
      expect(b).toMatchObject({
        ok: false,
        error: { code: 'NOT_CONNECTED' },
      });
      expect(b.state?.queued).not.toBe(true);
      expect('runtime' in c).toBe(false);
      expect('consumer' in c).toBe(false);
    } finally {
      await mux.stop();
      await c.stop();
    }
  });
  it('keeps original RUN recovery source-uninstalled with its exact original identity', async () => {
    const c = createPostwarIndustryConnection(null),
      mux = createPostwarOfficeCommandFetchHandler({
        industry: { ...c, transportOrigins: ['https://industry-test.example'] },
      }),
      original = envelope();
    try {
      const request = {
        schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
        requestId: original.requestId,
        request: {
          worldId: original.request.worldId,
          commandId: original.request.commandId,
          idempotencyKey: original.request.idempotencyKey,
          originalRequest: original,
        },
      };
      const response = await mux.handle(
        new Request('https://api-test.example/v1/command-recovery', {
          method: 'POST',
          headers: {
            origin: 'https://industry-test.example',
            'content-type': 'application/json',
          },
          body: JSON.stringify(request),
        }),
      );
      expect(response?.status).toBe(503);
      expect(await response?.json()).toMatchObject({
        ok: false,
        error: { code: 'NOT_CONNECTED' },
      });
    } finally {
      await mux.stop();
      await c.stop();
    }
  });
  it.each([
    { commandType: 'CORE_INDUSTRY_RUN_UNKNOWN_V1' },
    { officeId: 'TRADE' },
    { idempotencyKey: null },
    { expectedWorldVersion: null },
  ])(
    'rejects an unknown or mismatched envelope before office selection %j',
    async (change) => {
      const mux = createPostwarOfficeCommandFetchHandler({
        industry: {
          ...createPostwarIndustryConnection(null),
          transportOrigins: ['https://industry-test.example'],
        },
      });
      try {
        expect(
          (
            await mux.handle(
              http({
                ...envelope(),
                request: { ...envelope().request, ...change },
              }),
            )
          )?.status,
        ).toBe(400);
      } finally {
        await mux.stop();
      }
    },
  );
});
