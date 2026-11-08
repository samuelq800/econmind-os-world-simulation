/** HTTP protocol and uninstalled-source refusal only, not utility delivery. */
import { describe, expect, it } from 'vitest';
import { AUTHENTICATED_COMMAND_RECOVERY_SCHEMA } from '@econmind/core/authenticated-command-recovery-contract';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  MANUAL_INDUSTRY_UTILITY_COMMANDS,
} from '@econmind/core/authenticated-office-command-contract';
import { createPostwarIndustryConnection } from '../../apps/world-api/src/runtime/postwar-industry-connection.js';
import { createPostwarOfficeCommandFetchHandler } from '../../apps/world-api/src/runtime/postwar-office-command-fetch-handler.js';
import {
  manualUtilityCases,
  manualUtilityPayload,
  type ManualUtilityKind,
} from '../support/industry-utility-manual-intent-fixture.js';
const origin = 'https://industry-test.example';
function envelope(kind: ManualUtilityKind, action?: string) {
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: '11111111-1111-4111-8111-111111111111',
    request: {
      worldId: 'WORLD_TEST_ONLY',
      countryId: 'COUNTRY_02',
      officeId: 'INDUSTRY',
      commandType: MANUAL_INDUSTRY_UTILITY_COMMANDS[kind],
      commandId: 'COMMAND_TEST_ONLY',
      idempotencyKey: 'KEY_TEST_ONLY',
      expectedWorldVersion: '0',
      payload: manualUtilityPayload(kind, action),
    },
  };
}
function http(
  original: {
    readonly requestId: string;
    readonly request: {
      readonly worldId: string;
      readonly commandId: string;
      readonly idempotencyKey: string;
    };
  },
  recovering = false,
) {
  const body = recovering
    ? {
        schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
        requestId: original.requestId,
        request: {
          worldId: original.request.worldId,
          commandId: original.request.commandId,
          idempotencyKey: original.request.idempotencyKey,
          originalRequest: original,
        },
      }
    : original;
  return new Request(
    'https://api-test.example' +
      (recovering ? '/v1/command-recovery' : '/v1/office-command'),
    {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}
describe('fixed Industry utilities HTTP scheduling and original recovery', () => {
  it.each(manualUtilityCases)(
    '%s/%s remains uninstalled503 for submission and original-only recovery',
    async (kind, action) => {
      const c = createPostwarIndustryConnection(null),
        mux = createPostwarOfficeCommandFetchHandler({
          industry: { ...c, transportOrigins: [origin] },
        });
      try {
        for (const recovering of [false, true]) {
          const request = http(envelope(kind, action), recovering),
            r = await mux.handle(request);
          expect(request.bodyUsed).toBe(true);
          expect(r?.status).toBe(503);
          expect(await r?.json()).toMatchObject({
            ok: false,
            error: { code: 'NOT_CONNECTED' },
          });
        }
      } finally {
        await mux.stop();
        await c.stop();
      }
    },
  );
  it.each(manualUtilityCases)(
    '%s/%s selects only its Industry borrower once, including recovery at oldH without fingerprint',
    async (kind, action) => {
      let commands = 0,
        recoveries = 0;
      const c = createPostwarIndustryConnection(null),
        mux = createPostwarOfficeCommandFetchHandler({
          industry: {
            ...c,
            transportOrigins: [origin],
            async handleCommand(input) {
              commands++;
              expect(input.request).toEqual(envelope(kind, action));
              return {
                httpStatus: 503,
                body: {
                  schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
                  requestId: envelope(kind, action).requestId,
                  ok: false,
                  error: {
                    code: 'TEST_ONLY_REFUSING_SOURCE',
                    retryable: false,
                  },
                },
              };
            },
            async recover() {
              recoveries++;
              return {
                httpStatus: 503,
                body: {
                  schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
                  requestId: envelope(kind, action).requestId,
                  ok: false,
                  error: {
                    code: 'TEST_ONLY_REFUSING_SOURCE',
                    retryable: false,
                  },
                },
              };
            },
          },
        });
      try {
        for (const recovering of [false, true]) {
          const r = await mux.handle(http(envelope(kind, action), recovering));
          expect(r?.status).toBe(503);
          expect(await r?.json()).toMatchObject({
            error: { code: 'TEST_ONLY_REFUSING_SOURCE' },
          });
        }
        expect([commands, recoveries]).toEqual([1, 1]);
      } finally {
        await mux.stop();
      }
    },
  );
  it('never forwards HTTP-supplied logistics allocations for work or recovery', async () => {
    let calls = 0;
    const mux = createPostwarOfficeCommandFetchHandler({
      industry: {
        ...createPostwarIndustryConnection(null),
        transportOrigins: [origin],
        async handleCommand() {
          calls++;
          throw Error('MUST_NOT_DISPATCH');
        },
        async recover() {
          calls++;
          throw Error('MUST_NOT_DISPATCH');
        },
      },
    });
    const original = envelope('LOGISTICS'),
      changed = {
        ...original,
        request: {
          ...original.request,
          payload: {
            ...manualUtilityPayload('LOGISTICS'),
            operation: {
              action: 'SERVICE_WORK',
              transferId: 'TRANSFER_TEST_ONLY',
              allocations: [],
            },
          },
        },
      };
    try {
      for (const recovering of [false, true])
        expect((await mux.handle(http(changed, recovering)))?.status).toBe(400);
      expect(calls).toBe(0);
    } finally {
      await mux.stop();
    }
  });
  it.each([
    ['POWER', 'DELIVER'],
    ['WATER', 'GRANT_RIGHT'],
  ] as const)(
    'rejects %s/%s before dispatch and recovery',
    async (kind, action) => {
      let calls = 0;
      const mux = createPostwarOfficeCommandFetchHandler({
        industry: {
          ...createPostwarIndustryConnection(null),
          transportOrigins: [origin],
          async handleCommand() {
            calls++;
            throw Error('MUST_NOT_DISPATCH');
          },
          async recover() {
            calls++;
            throw Error('MUST_NOT_DISPATCH');
          },
        },
      });
      const original = envelope(kind),
        changed = {
          ...original,
          request: {
            ...original.request,
            payload: { ...original.request.payload, operation: { action } },
          },
        };
      try {
        for (const recovering of [false, true])
          expect((await mux.handle(http(changed, recovering)))?.status).toBe(
            400,
          );
        expect(calls).toBe(0);
      } finally {
        await mux.stop();
      }
    },
  );
});
