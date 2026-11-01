/** Shipped Industry browser contract with TEST_ONLY intercepted transport.
 * No source, runtime, native production, payment or FINAL is fabricated. */
import { describe, expect, it } from 'vitest';
import { officeProjectionFixture } from './office-projection-fixture.js';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { createOfficeCommandClient } from '../../apps/world-web/src/office-command/client.js';
import { createOfficeRecoveryClient } from '../../apps/world-web/src/office-command/recovery-client.js';
import {
  parseOfficeIntent,
  officeFamilies,
} from '../../apps/world-web/src/office-command/contract.js';
import {
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
const requestId = '11111111-1111-4111-8111-111111111111';
function fixture() {
  const base = officeProjectionFixture('industry'),
    identity = {
      ...base.config.identity,
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    },
    read = {
      ...base.config,
      identity,
      currentIdentity: () => identity,
      endpoints: {
        ...base.config.endpoints,
        projectionPath: POSTWAR_RUNTIME_PATH,
      },
    },
    endpoint = {
      origin: read.endpoints.origin,
      path: '/v1/office-command' as const,
      deploymentRef: read.endpoints.deploymentRef,
    },
    view = { role: 'industry' as const, countryDisplayId: '01' },
    request: AuthenticatedOfficeCommandRequestDto = {
      schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
      requestId,
      request: {
        worldId: identity.worldId,
        countryId: identity.countryId,
        officeId: 'INDUSTRY',
        commandType: 'CORE_INDUSTRY_PRODUCTION_V1',
        commandId: 'COMMAND_TEST_ONLY_INDUSTRY',
        idempotencyKey: 'KEY_TEST_ONLY_INDUSTRY',
        expectedWorldVersion: '1',
        payload: { facilityId: 'FACILITY.TEST_ONLY', runId: 'RUN.TEST_ONLY' },
      },
    };
  return { read, endpoint, view, request };
}
describe('Industry reference-only intent and bounded labour read surface', () => {
  it('allows only the fixed Industry command envelope in its authorized office', () => {
    const f = fixture();
    expect(officeFamilies.INDUSTRY).toEqual([
      'CORE_INDUSTRY_PRODUCTION_V1',
      'CORE_INDUSTRY_RUN_SCHEDULE_V1',
    ]);
    expect(parseOfficeIntent(f.request, f.read)).toEqual(f.request);
    expect(
      parseOfficeIntent(
        { ...f.request, request: { ...f.request.request, officeId: 'TRADE' } },
        f.read,
      ),
    ).toBeNull();
    expect(
      parseOfficeIntent(
        {
          ...f.request,
          request: {
            ...f.request.request,
            commandType: 'CORE_GOODS_TRANSFER_V1',
          },
        },
        f.read,
      ),
    ).toBeNull();
  });
  it('reads industry-labour-current, preserves missing-source state and cannot submit while unavailable', async () => {
    const f = fixture(),
      calls: { path: string; body: Record<string, unknown> }[] = [],
      fetcher: typeof fetch = async (url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push({ path: new URL(String(url)).pathname, body });
        return Response.json(
          {
            schemaVersion: POSTWAR_RUNTIME_SCHEMA,
            requestId: body.requestId,
            ok: false,
            error: { code: 'CURRENT_SOURCE_UNAVAILABLE', retryable: false },
          },
          { status: 503 },
        );
      };
    const c = createOfficeCommandController(
      { read: f.read, endpoint: f.endpoint, view: f.view },
      () => f.view,
      { fetcher, requestId: () => requestId },
    );
    await c.refresh();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      path: POSTWAR_RUNTIME_PATH,
      body: {
        operation: 'READ_CURRENT_OFFICE_OPENING',
        officeId: 'INDUSTRY',
        dataset: 'industry-labour-current',
      },
    });
    expect(c.getState()).toMatchObject({
      status: 'UNAVAILABLE',
      canConfirm: false,
    });
    expect(c.stage(f.request)).toBe(false);
    expect(calls).toHaveLength(1);
    c.disconnect();
  });
  it('uses the original request recovery path without a guessed fingerprint or economic retry', async () => {
    const f = fixture(),
      calls: { path: string; body: Record<string, unknown> }[] = [],
      fetcher: typeof fetch = async (url, init) => {
        const b = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push({ path: new URL(String(url)).pathname, body: b });
        return Response.json(
          {
            schemaVersion: 'world-command-recovery-v1',
            requestId: b.requestId,
            ok: false,
            error: { code: 'SOURCE_NOT_PREPARED', retryable: false },
          },
          { status: 503 },
        );
      },
      c = createOfficeRecoveryClient(f.endpoint, f.read, { fetcher });
    expect(await c.recover(f.request, requestId)).toMatchObject({
      status: 'UNAVAILABLE',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      path: '/v1/command-recovery',
      body: {
        request: {
          originalRequest: f.request,
          commandId: f.request.request.commandId,
          idempotencyKey: f.request.request.idempotencyKey,
        },
      },
    });
    expect(
      Object.hasOwn(
        calls[0]!.body.request as object,
        'knownCommandFingerprint',
      ),
    ).toBe(false);
    c.disconnect();
  });
  it('does not synthesize ACK or retry a denied production request', async () => {
    const f = fixture();
    let calls = 0;
    const c = createOfficeCommandClient(f.endpoint, f.read, {
      fetcher: async () => {
        calls++;
        return Response.json(
          {
            schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
            requestId,
            ok: false,
            error: { code: 'SOURCE_RUNTIME_UNAVAILABLE', retryable: false },
            state: {
              status: 'REJECTED',
              reason: 'SOURCE_RUNTIME_UNAVAILABLE',
              commandType: 'CORE_INDUSTRY_PRODUCTION_V1',
              submitted: false,
              queued: false,
              missing: ['ADMITTED_DOMAIN_SOURCE', 'SOLE_DURABLE_CONSUMER'],
            },
          },
          { status: 503 },
        );
      },
    });
    expect(await c.submit(f.request)).toMatchObject({
      status: 'REJECTED',
      code: 'SOURCE_RUNTIME_UNAVAILABLE',
    });
    expect(calls).toBe(1);
    c.disconnect();
  });
});
