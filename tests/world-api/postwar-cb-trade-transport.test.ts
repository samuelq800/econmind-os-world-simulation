/** Protocol routing only: test doubles never supply seat, source or settlement authority. */
import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  CENTRAL_BANK_OMO_COMMAND,
  NARROW_TREASURY_GCU_COMMAND_TYPE,
} from '@econmind/core';
import { AUTHENTICATED_OFFICE_COMMAND_SCHEMA } from '@econmind/core/authenticated-office-command-contract';
import { createPostwarCentralBankConnection } from '../../apps/world-api/src/runtime/postwar-central-bank-connection.js';
import { createPostwarTradeConnection } from '../../apps/world-api/src/runtime/postwar-trade-connection.js';
import { createPostwarOfficeCommandFetchHandler } from '../../apps/world-api/src/runtime/postwar-office-command-fetch-handler.js';
import { boundedOfficeRecoveryBindingQuery } from '../../apps/world-api/src/integration/bounded-office-command-recovery-service.js';
const origin = 'https://world.example';
const requestId = '11111111-1111-4111-8111-111111111111';
function envelope(office: 'CENTRAL_BANK' | 'TRADE') {
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId,
    request: {
      worldId: 'WORLD_TEST_ONLY',
      countryId: 'COUNTRY_02',
      officeId: office,
      commandType:
        office === 'TRADE'
          ? NARROW_TREASURY_GCU_COMMAND_TYPE
          : CENTRAL_BANK_OMO_COMMAND,
      commandId: 'COMMAND_TEST_ONLY',
      idempotencyKey: 'KEY_TEST_ONLY',
      expectedWorldVersion: '0',
      payload:
        office === 'CENTRAL_BANK'
          ? {
              schemaVersion: 'central-bank-omo-intent-v1',
              direction: 'BUY',
              securityRef: 'SECURITY_TEST_ONLY',
              batchRef: 'BATCH_TEST_ONLY',
              faceValue: { amount: '1', currency: 'XAA' },
              settlementSimTime: '10000',
              policyNote: null,
            }
          : {
              schemaVersion: 'core-goods-transfer-v1',
              commodityId: 'GRAIN',
              sellerCountryId: 'COUNTRY_02',
              buyerCountryId: 'COUNTRY_01',
              quantity: { amount: '1', unit: 'tonne' },
              price: { amount: '1', currency: 'GCU', perUnit: 'tonne' },
              threshold: {
                policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
                maxSettlement: { amount: '6', currency: 'GCU' },
              },
              assetSource: {
                batchId: 'BATCH_TEST_ONLY',
                physicalLocationId: 'LOCATION_TEST_ONLY',
                titleHolderId: 'HOLDER_TEST_ONLY',
                riskBearerId: 'HOLDER_TEST_ONLY',
                economicRecognitionId: null,
              },
              paymentSource: 'BUYER_TREASURY_GCU',
              policyVersion: 'V10_TREASURY_GCU_V1',
              expiresAtReal: '2099-01-01T00:00:00.000Z',
            },
    },
  };
}
describe('fixed CB and Trade command/recovery transport', () => {
  it.each(['CENTRAL_BANK', 'TRADE'] as const)(
    'keeps genuine uninstalled %s borrower closed',
    async (office) => {
      const connection =
        office === 'TRADE'
          ? createPostwarTradeConnection(null)
          : createPostwarCentralBankConnection(null);
      expect(connection.status).toBe('NOT_CONNECTED');
      expect(
        await connection.handleCommand({
          authorization: null,
          request: envelope(office),
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
    },
  );
  for (const office of ['CENTRAL_BANK', 'TRADE'] as const)
    for (const recovery of [false, true])
      it(`${office} ${recovery ? 'recovery' : 'command'} selects exactly one borrower without fallback`, async () => {
        let cbCalls = 0,
          tradeCalls = 0;
        const response = (
          schemaVersion:
            | typeof AUTHENTICATED_OFFICE_COMMAND_SCHEMA
            | typeof AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
        ) => ({
          httpStatus: 503,
          body: {
            schemaVersion,
            requestId,
            ok: false as const,
            error: { code: 'TEST_ONLY_SOURCE_UNAVAILABLE', retryable: false },
          },
        });
        const cb = {
          ...createPostwarCentralBankConnection(null),
          transportOrigins: [origin],
          async handleCommand() {
            cbCalls++;
            return response(AUTHENTICATED_OFFICE_COMMAND_SCHEMA) as never;
          },
          async recover() {
            cbCalls++;
            return response(AUTHENTICATED_COMMAND_RECOVERY_SCHEMA) as never;
          },
        };
        const trade = {
          ...createPostwarTradeConnection(null),
          transportOrigins: [origin],
          async handleCommand() {
            tradeCalls++;
            return response(AUTHENTICATED_OFFICE_COMMAND_SCHEMA) as never;
          },
          async recover() {
            tradeCalls++;
            return response(AUTHENTICATED_COMMAND_RECOVERY_SCHEMA) as never;
          },
        };
        const mux = createPostwarOfficeCommandFetchHandler({
          centralBank: cb,
          trade,
        });
        const original = envelope(office);
        const body = recovery
          ? {
              schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
              requestId,
              request: {
                worldId: original.request.worldId,
                commandId: original.request.commandId,
                idempotencyKey: original.request.idempotencyKey,
                originalRequest: original,
                knownCommandFingerprint: 'sha256:' + '2'.repeat(64),
              },
            }
          : original;
        const request = new Request(
          'https://api.example' +
            (recovery ? '/v1/command-recovery' : '/v1/office-command'),
          {
            method: 'POST',
            headers: { origin, 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        try {
          const result = await mux.handle(request);
          expect(result?.status).toBe(503);
          expect(await result?.json()).toMatchObject({
            error: { code: 'TEST_ONLY_SOURCE_UNAVAILABLE' },
          });
          expect(request.bodyUsed).toBe(true);
          expect([cbCalls, tradeCalls]).toEqual(
            office === 'TRADE' ? [0, 1] : [1, 0],
          );
        } finally {
          await mux.stop();
        }
      });
  it('uses the specific nonlocking metadata RPC for each recovery family', () => {
    expect(
      boundedOfficeRecoveryBindingQuery('POSTWAR_TRADE_READ_ONLY_V1'),
    ).toContain('world_v2.read_postwar_trade_recovery_binding(');
    expect(
      boundedOfficeRecoveryBindingQuery('POSTWAR_CENTRAL_BANK_READ_ONLY_V1'),
    ).toContain('world_v2.read_postwar_central_bank_recovery_binding(');
  });
});
