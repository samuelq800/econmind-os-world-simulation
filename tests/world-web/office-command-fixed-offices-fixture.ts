/** TEST_ONLY wire fixtures. No actual source, signature, queue or economic
 * outcome is asserted by these transport responses. Also used by Chromium. */
import { officeProjectionFixture } from './office-projection-fixture.js';
import {
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import { AUTHENTICATED_COMMAND_RECOVERY_SCHEMA } from '@econmind/core/authenticated-command-recovery-contract';
import {
  POSTWAR_FINANCIAL_MIXED_COVERAGE_SCHEMA,
  POSTWAR_FINANCIAL_MIXED_REDUCER,
} from '@econmind/core/postwar-financial-mixed-current-contract';
export function fixedOfficeCommandFixture(role: 'trade' | 'central_bank') {
  const base = officeProjectionFixture(role),
    identity = {
      ...base.config.identity,
      ...(role === 'trade'
        ? {
            countryId: 'COUNTRY_01',
            scopeKey: 'OFFICE_434F554E5452595F3031_5452414445',
          }
        : {}),
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    };
  let alive = true,
    head = '2',
    submitMode: 'ack' | 'unknown' | 'source-rejected' = 'unknown',
    recoveryMode: 'pending' | 'final' | 'unavailable' = 'pending',
    pageMode: 'page' | 'empty' | 'unavailable' = 'page';
  const listeners = new Set<() => void>(),
    calls: {
      path: string;
      body: Record<string, unknown>;
      init: RequestInit;
    }[] = [];
  const config = {
    ...base.config,
    identity,
    currentIdentity: () => (alive ? identity : null),
    world: { ...base.config.world, minimumWorldVersion: '0' },
    endpoints: {
      ...base.config.endpoints,
      projectionPath: POSTWAR_RUNTIME_PATH,
    },
    session: {
      sessionRef: 'SESSION_FIXED_OFFICE_TEST_ONLY',
      isCurrent: () => alive,
      onInvalidate(fn: () => void) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
  };
  const hash = base.lookup.commandFingerprint,
    endpoint = {
      origin: config.endpoints.origin,
      path: '/v1/office-command' as const,
      deploymentRef: 'DEPLOYMENT_FIXED_OFFICE_TEST_ONLY',
    };
  const payload =
    role === 'trade'
      ? {
          schemaVersion: 'core-goods-transfer-v1',
          commodityId: 'GRAIN',
          sellerCountryId: identity.countryId,
          buyerCountryId: 'COUNTRY_02',
          quantity: { amount: '1', unit: 'tonne' },
          price: { amount: '1', currency: 'GCU', perUnit: 'tonne' },
          assetSource: {
            batchId: 'BATCH_TEST_ONLY',
            physicalLocationId: 'LOCATION_TEST_ONLY',
            titleHolderId: 'ENTITY_TEST_ONLY_OWNER',
            riskBearerId: 'ENTITY_TEST_ONLY_OWNER',
            economicRecognitionId: null,
          },
          paymentSource: 'BUYER_TREASURY_GCU',
          policyVersion: 'V10_TREASURY_GCU_V1',
          threshold: {
            policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
            maxSettlement: { amount: '6', currency: 'GCU' },
          },
          expiresAtReal: '2026-11-01T00:10:00.000Z',
        }
      : {
          schemaVersion: 'central-bank-omo-intent-v1',
          direction: 'BUY_GOVERNMENT_SECURITIES',
          securityRef: 'SECURITY_TEST_ONLY',
          batchRef: 'BATCH_TEST_ONLY',
          faceValue: { amount: '1', currency: 'LC_TEST' },
          settlementSimTime: '0',
        };
  const request: AuthenticatedOfficeCommandRequestDto = {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: '11111111-1111-4111-8111-111111111111',
    request: {
      worldId: identity.worldId,
      countryId: identity.countryId,
      officeId: role === 'trade' ? 'TRADE' : 'CENTRAL_BANK',
      commandType:
        role === 'trade'
          ? 'CORE_GOODS_TRANSFER_V1'
          : 'CORE_CENTRAL_BANK_OMO_V1',
      commandId: 'COMMAND_FIXED_OFFICE_TEST_ONLY',
      idempotencyKey: 'KEY_FIXED_OFFICE_TEST_ONLY',
      expectedWorldVersion: '2',
      payload,
    },
  };
  const authority = () => ({
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    identity,
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
      worldVersion: head,
      eventSequence: head,
      readbackRef: 'READBACK_FIXED_OFFICE_TEST_ONLY',
    },
  });
  const page = (requestId: string, dataset: string) => ({
    schemaVersion: POSTWAR_RUNTIME_SCHEMA,
    requestId,
    ok: true,
    status: pageMode === 'empty' ? 'EMPTY' : 'AVAILABLE',
    dataset,
    authority: authority(),
    source: {
      dataNature:
        role === 'trade'
          ? dataset === 'opening-inventory-entries'
            ? 'ADMITTED_IMMUTABLE_OPENING_FACTS'
            : 'ADMITTED_CURRENT_TRADE_COMPLETE_PREFIX'
          : 'ADMITTED_CURRENT_FINANCIAL_MIXED_POSTING_PREFIX',
      sourceVersion: hash,
      bindingVersion: hash,
      sourceRevision: 'TEST_ONLY',
      pageHash: 'a'.repeat(64),
      returnedRowsHash: 'a'.repeat(64),
      hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
      sourcePointer: { classification: 'TEST_ONLY_WIRE' },
      worldId: identity.worldId,
      countryId: identity.countryId,
      officeId: identity.officeId,
      authSubjectId: identity.authSubjectId,
      authorizationRevision: identity.authorizationRevision,
      scopeKey: identity.scopeKey,
      modelVersion: identity.modelVersion,
      seedRef: config.world.seedRef,
      contentHash: config.world.contentHash,
      admissionRef: config.world.admissionRef,
      worldVersion:
        role === 'trade' && dataset === 'opening-inventory-entries'
          ? '0'
          : head,
      eventSequence:
        role === 'trade' && dataset === 'opening-inventory-entries'
          ? '0'
          : head,
      originWorldVersion:
        role === 'trade' && dataset !== 'opening-inventory-entries'
          ? head
          : '0',
      originEventSequence:
        role === 'trade' && dataset !== 'opening-inventory-entries'
          ? head
          : '0',
      observedHead: { worldVersion: head, eventSequence: head },
      ...(role === 'trade' && dataset !== 'opening-inventory-entries'
        ? {
            currentTradeCoverage: {
              schemaVersion: 'postwar-trade-current-page-chain-coverage-v1',
              reducerVersion: 'POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1',
              countryId: identity.countryId,
              coverageRef: 'COVERAGE_TEST_ONLY_TRADE',
              globalWorldVersion: head,
              globalEventSequence: head,
              prefixFingerprint: hash,
              knownEffectsFingerprint: hash,
              coveredThroughEventId: 'EVENT_TEST_ONLY_LAST',
              coveredThroughEventFingerprint: hash,
              financialPostingCount: '0',
              financialBatchCount: '0',
              financialPostingsFingerprint: hash,
              pageProof: {
                schemaVersion: 'postwar-complete-page-proof-v1',
                hashAlgorithm: 'COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1',
                pageCount: '1',
                frameCount: head,
              },
              inventoryRowsHash: hash,
              transferRowsHash: hash,
            },
          }
        : {}),
      ...(role === 'central_bank'
        ? {
            currentFinancialCoverage: {
              schemaVersion: POSTWAR_FINANCIAL_MIXED_COVERAGE_SCHEMA,
              reducerVersion: POSTWAR_FINANCIAL_MIXED_REDUCER,
              countryId: identity.countryId,
              coverageRef: 'COVERAGE_TEST_ONLY',
              prefixFingerprint: hash,
              knownEffectsFingerprint: hash,
              globalWorldVersion: head,
              globalEventSequence: head,
              coveredThroughEventId: 'EVENT_TEST_ONLY_LAST',
              coveredThroughEventFingerprint: hash,
              financialPostingCount: '6',
              financialBatchCount: '2',
              financialPostingsFingerprint: hash,
            },
          }
        : {}),
    },
    page: {
      offset: 0,
      limit: 25,
      returned: pageMode === 'empty' ? 0 : 1,
      total: pageMode === 'empty' ? 0 : 1,
      nextOffset: null,
    },
    rows:
      pageMode === 'empty'
        ? []
        : role === 'trade'
          ? dataset === 'inventory-current'
            ? [
                {
                  schemaVersion: 'postwar-trade-current-inventory-row-v1',
                  countryId: identity.countryId,
                  commodityId: 'GRAIN',
                  batchId: 'BATCH_TEST_ONLY',
                  unit: 'tonne',
                  physicalLocationId: 'LOCATION_TEST_ONLY',
                  bucket: 'AVAILABLE',
                  reservationId: null,
                  shipmentId: null,
                  titleHolderId: 'ENTITY_TEST_ONLY_OWNER',
                  riskBearerId: 'ENTITY_TEST_ONLY_OWNER',
                  economicRecognitionId: null,
                  quantity: '1',
                },
              ]
            : dataset === 'goods-transfers-current'
              ? [
                  {
                    schemaVersion: 'postwar-trade-current-transfer-row-v1',
                    transferCommandId: request.request.commandId,
                    transferFingerprint: hash,
                    sellerCountryId: identity.countryId,
                    buyerCountryId: 'COUNTRY_02',
                    commodityId: 'GRAIN',
                    batchId: 'BATCH_TEST_ONLY',
                    quantity: '0.000001',
                    unit: 'tonne',
                    reservationId: 'RESERVATION_TEST_ONLY',
                    shipmentId: 'SHIPMENT_TEST_ONLY',
                    status: 'DELIVERED',
                  },
                ]
              : [
                  {
                    account: {
                      countryId: identity.countryId,
                      commodityId: 'GRAIN',
                      bucket: 'AVAILABLE',
                    },
                    quantity: { amount: '1', unit: 'tonne' },
                  },
                ]
          : [
              {
                schemaVersion: 'postwar-current-financial-balance-row-v2',
                countryId: identity.countryId,
                accountId: 'ACCOUNT_TEST_ONLY_CB',
                ownerEntityId: 'ENTITY_TEST_ONLY_CB',
                ownerKind: 'CB',
                currency: 'GCU',
                accountClass: 'CASH',
                claimId: null,
                counterpartyEntityId: null,
                netDebitBalance: '1',
                balanceNature: 'GCU_CASH',
              },
            ],
  });
  const receipt = () => ({
    source: 'DURABLE_FINAL_COMMAND_RECEIPT',
    schemaVersion: 'command-receipt-v2',
    worldId: identity.worldId,
    commandId: request.request.commandId,
    idempotencyKey: request.request.idempotencyKey,
    commandFingerprint: hash,
    outcome: 'COMMITTED',
    reasonCode: null,
    transitionId: 'TRANSITION_TEST_ONLY',
    worldVersionBefore: '2',
    worldVersionAfter: '3',
    simTime: '0',
    eventIds: ['EVENT_TEST_ONLY_COMMIT'],
    recordedAtReal: '2026-11-01T00:00:00.000Z',
  });
  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname,
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ path, body, init: init! });
    if (path === POSTWAR_RUNTIME_PATH)
      return pageMode === 'unavailable'
        ? Response.json(
            {
              schemaVersion: POSTWAR_RUNTIME_SCHEMA,
              requestId: body.requestId,
              ok: false,
              error: { code: 'SOURCE_UNAVAILABLE', retryable: true },
            },
            { status: 503 },
          )
        : Response.json(page(String(body.requestId), String(body.dataset)));
    if (path === endpoint.path) {
      if (submitMode === 'unknown') throw Error('TEST_ONLY_LOST_ACK');
      return submitMode === 'source-rejected'
        ? Response.json(
            {
              schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
              requestId: body.requestId,
              ok: false,
              error: { code: 'SOURCE_RUNTIME_UNAVAILABLE', retryable: false },
              state: {
                status: 'REJECTED',
                reason: 'SOURCE_RUNTIME_UNAVAILABLE',
                commandType: request.request.commandType,
                submitted: false,
                queued: false,
                missing: ['ADMITTED_DOMAIN_SOURCE'],
              },
            },
            { status: 503 },
          )
        : Response.json(
            {
              schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
              requestId: body.requestId,
              ok: true,
              state: {
                status: 'QUEUED',
                source: 'NEW',
                commandType: request.request.commandType,
                commandId: request.request.commandId,
                commandFingerprint: hash,
                submitted: true,
                queued: true,
              },
            },
            { status: 202 },
          );
    }
    if (path === '/v1/command-recovery') {
      if (recoveryMode === 'unavailable')
        return Response.json(
          {
            schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
            requestId: body.requestId,
            ok: false,
            error: { code: 'NOT_FOUND', retryable: false },
          },
          { status: 404 },
        );
      if (recoveryMode === 'final') {
        head = '3';
        return Response.json({
          schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
          requestId: body.requestId,
          ok: true,
          state: {
            status: 'FINAL',
            commandType: request.request.commandType,
            receipt: receipt(),
          },
        });
      }
      return Response.json({
        schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
        requestId: body.requestId,
        ok: true,
        state: {
          status: 'CLAIMED',
          commandType: request.request.commandType,
          commandId: request.request.commandId,
          idempotencyKey: request.request.idempotencyKey,
          commandFingerprint: hash,
        },
      });
    }
    throw Error('UNEXPECTED_TEST_ONLY_ROUTE');
  };
  return {
    config,
    request,
    endpoint,
    calls,
    fetcher,
    page,
    receipt,
    binding: { read: config, view: base.binding.view, endpoint },
    submit: (mode: typeof submitMode) => {
      submitMode = mode;
    },
    recover: (mode: typeof recoveryMode) => {
      recoveryMode = mode;
    },
    read: (mode: typeof pageMode) => {
      pageMode = mode;
    },
    setHead: (value: string) => {
      head = value;
    },
    invalidate() {
      alive = false;
      for (const fn of [...listeners]) fn();
    },
  };
}
