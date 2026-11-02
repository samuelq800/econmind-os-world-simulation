/** Pure transport and strict intent vectors only. No SQL seat/admission,
 * bank mandate, source quote, queued command or economic commit is supplied. */
import { describe, expect, it } from 'vitest';
import { AUTHENTICATED_COMMAND_RECOVERY_SCHEMA } from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
  POSTWAR_DAY_ONE_TREASURY_FX_PAYLOAD_SCHEMA,
} from '@econmind/core/authenticated-office-command-contract';
import {
  parseManualOfficeCommandRequest,
  buildManualOfficeCommandIntent,
  manualOfficeCommandCapability,
} from '../../apps/world-worker/dist/intake/postgres-office-command-intake.js';
import {
  parseOfficeEnvelope,
  parseRecoveryRequest,
} from '../../apps/world-api/src/runtime-preparation/bounded-executor-transport.js';
import { startApiRuntime } from '../../apps/world-api/src/runtime.js';
import { createPostwarTreasuryFxConnection } from '../../apps/world-api/src/runtime/postwar-treasury-fx-connection.js';
import { createPostwarFinanceConnection } from '../../apps/world-api/src/runtime/postwar-finance-connection.js';
import { createPostwarOfficeCommandFetchHandler } from '../../apps/world-api/src/runtime/postwar-office-command-fetch-handler.js';
const payload = () => ({
  schemaVersion: POSTWAR_DAY_ONE_TREASURY_FX_PAYLOAD_SCHEMA,
  quoteRef: 'QUOTE_TEST_ONLY',
  payerTreasuryAccountId: 'TGA_TEST_ONLY',
  payerGcuAccountId: 'GOV_GCU_TEST_ONLY',
  dealerGcuAccountId: 'BANK_GCU_TEST_ONLY',
  localAmount: '1.23',
  localCurrency: 'XAA',
  expectedQuoteSha256: '1'.repeat(64),
});
const request = () => ({
  worldId: 'WORLD_TEST_ONLY',
  countryId: 'COUNTRY_01',
  officeId: 'FINANCE' as const,
  commandType: POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
  commandId: 'COMMAND_TEST_ONLY_FX',
  idempotencyKey: 'KEY_TEST_ONLY_FX',
  expectedWorldVersion: '0',
  payload: payload(),
});
const envelope = () => ({
  schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  requestId: '11111111-1111-4111-8111-111111111111',
  request: request(),
});
function canonical(value: unknown) {
  return buildManualOfficeCommandIntent({
    request: parseManualOfficeCommandRequest(value),
    countryId: 'COUNTRY_01',
    officeId: 'FINANCE',
    authSubject: '11111111-1111-4111-8111-111111111111',
    actor: 'ACTOR_TEST_ONLY',
    simTime: '0',
    submittedAtReal: '2026-10-29T00:00:00.000Z',
    correlationId: 'CORRELATION_TEST_ONLY',
  });
}
describe('Treasury FX canonical intent and read-only recovery transport', () => {
  it('uses the strict Core parser for the exact government-only payload and Treasury capability', () => {
    expect(parseOfficeEnvelope(envelope())).toEqual(envelope());
    const command = canonical(request());
    expect(command.commandType).toBe(POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND);
    expect(JSON.parse(command.canonicalPayload)).toEqual(payload());
    expect(manualOfficeCommandCapability(request())).toBe('FINANCE_TREASURY');
    expect(
      manualOfficeCommandCapability({
        ...request(),
        commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
      }),
    ).toBe('FINANCE_BUDGET');
  });
  it.each(['CAPTAIN', 'CENTRAL_BANK', 'SOCIAL', 'TRADE', 'INDUSTRY'])(
    'refuses %s as the Treasury FX command office',
    (officeId) => {
      expect(() =>
        parseManualOfficeCommandRequest({ ...request(), officeId }),
      ).toThrow();
      expect(() =>
        manualOfficeCommandCapability({ ...request(), officeId } as never),
      ).toThrow();
    },
  );
  it.each([
    { ownerMandateRef: 'CALLER_CANNOT_GRANT_OP_AUTHORITY' },
    { ownerKind: 'PRIVATE_OPERATOR' },
    { exchangeRate: '1' },
    { fee: '0' },
    { localAmount: 1.23 },
    { localAmount: '-1' },
    { localAmount: '1e3' },
    { expectedQuoteSha256: 'sha256:' + '1'.repeat(64) },
    { schemaVersion: 'postwar-day-one-private-fx-command-v1' },
  ])(
    'rejects extra authority/economic fields and malformed exact values %#',
    (changes) => {
      expect(() =>
        canonical({ ...request(), payload: { ...payload(), ...changes } }),
      ).toThrow();
    },
  );
  it('recovers only the identical original request identity; does not allow a recovery selector to choose a different world or intent', () => {
    const original = envelope();
    const value = {
      schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
      requestId: original.requestId,
      request: {
        worldId: original.request.worldId,
        commandId: original.request.commandId,
        idempotencyKey: original.request.idempotencyKey,
        originalRequest: original,
        knownCommandFingerprint: 'sha256:' + '2'.repeat(64),
      },
    };
    expect(parseRecoveryRequest(value)).toEqual(value);
    for (const changes of [
      { worldId: 'WORLD_OTHER' },
      { commandId: 'COMMAND_OTHER' },
      { idempotencyKey: 'KEY_OTHER' },
      { officeId: 'FINANCE' },
      { knownCommandFingerprint: 'CALLER_READY' },
    ])
      expect(() =>
        parseRecoveryRequest({
          ...value,
          request: { ...value.request, ...changes },
        }),
      ).toThrow();
    expect(() =>
      parseOfficeEnvelope({
        ...original,
        request: {
          ...original.request,
          commandType: 'POSTWAR_DAY_ONE_PRIVATE_FX_SPOT_V1',
        },
      }),
    ).toThrow();
  });
});

describe('fixed Treasury FX HTTP installation', () => {
  it('keeps the genuine uninstalled services closed for command and recovery', async () => {
    const connection = createPostwarTreasuryFxConnection(null);
    expect(connection.status).toBe('NOT_CONNECTED');
    expect(
      await connection.handleCommand({
        authorization: null,
        request: envelope(),
      }),
    ).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'NOT_CONNECTED' } },
    });
    expect(
      await connection.recover({ authorization: null, request: {} }),
    ).toMatchObject({
      httpStatus: 503,
      body: { ok: false, error: { code: 'NOT_CONNECTED' } },
    });
    await connection.stop();
    await connection.stop();
  });
  it('installs only fixed Node paths and reports configured separately from production readiness', async () => {
    const connection = createPostwarTreasuryFxConnection(null);
    const api = await startApiRuntime(
      { environment: 'ci', host: '127.0.0.1', port: 0, shutdownGraceMs: 30 },
      { postwarTreasuryFxConnection: connection },
    );
    try {
      const health = await (await fetch(api.origin + '/healthz')).json();
      expect(health.postwarTreasuryFx).toEqual({
        routeInstalled: true,
        configured: false,
        productionReady: false,
        manualConsumptionOnly: true,
      });
      expect(
        (
          await fetch(api.origin + '/v1/office-command', {
            method: 'POST',
            headers: {
              origin: 'https://world.example',
              'content-type': 'application/json',
            },
            body: JSON.stringify(envelope()),
          })
        ).status,
      ).toBe(403);
      expect(
        (await fetch(api.origin + '/not-an-fx-route', { method: 'POST' }))
          .status,
      ).toBe(405);
    } finally {
      await api.shutdown();
      await api.shutdown();
    }
  });
  it('selects the FX service once from one body read, without falling back to Budget or Social', async () => {
    let fxCalls = 0,
      budgetCalls = 0;
    const fx = {
      ...createPostwarTreasuryFxConnection(null),
      transportOrigins: ['https://world.example'],
      async handleCommand() {
        fxCalls++;
        return {
          httpStatus: 503,
          body: {
            schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
            requestId: envelope().requestId,
            ok: false as const,
            error: { code: 'TEST_ONLY_SOURCE_UNAVAILABLE', retryable: false },
          },
        };
      },
    };
    const finance = {
      ...createPostwarFinanceConnection(null),
      transportOrigins: ['https://world.example'],
      async handleCommand() {
        budgetCalls++;
        throw Error('MUST_NOT_FALLBACK');
      },
    };
    const mux = createPostwarOfficeCommandFetchHandler({
      treasuryFx: fx,
      finance,
    });
    const request = new Request('https://api.example/v1/office-command', {
      method: 'POST',
      headers: {
        origin: 'https://world.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify(envelope()),
    });
    try {
      const response = await mux.handle(request);
      expect(response?.status).toBe(503);
      expect(await response?.json()).toMatchObject({
        error: { code: 'TEST_ONLY_SOURCE_UNAVAILABLE' },
      });
      expect(request.bodyUsed).toBe(true);
      expect(fxCalls).toBe(1);
      expect(budgetCalls).toBe(0);
    } finally {
      await mux.stop();
    }
  });
  it('rejects competing explicit Node consumer slots before listening and drains both connections', async () => {
    const fx = createPostwarTreasuryFxConnection(null),
      finance = createPostwarFinanceConnection(null);
    await expect(
      startApiRuntime(
        { environment: 'ci', host: '127.0.0.1', port: 0, shutdownGraceMs: 30 },
        { postwarTreasuryFxConnection: fx, postwarFinanceConnection: finance },
      ),
    ).rejects.toThrow('SOLE_EXPLICIT_CONSUMER');
  });
});
