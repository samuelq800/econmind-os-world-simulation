/** Synthetic wire DATA only. No admission, actual WORK/payment, utility
 * capacity, command queue, economic receipt or backend acceptance is issued. */
import { officeProjectionFixture } from '../world-web/office-projection-fixture.js';
import {
  INDUSTRY_UTILITY_PLANNING_DATASET,
  INDUSTRY_UTILITY_PLANNING_NATURE,
  parseIndustryUtilityPlanningRow,
  type IndustryUtilityPlanningRow,
} from '../../packages/core/src/read-models/postwar-industry-utility-planning-contract.js';
export const planningFp = 'sha256:' + 'a'.repeat(64),
  planningRaw = 'b'.repeat(64),
  planningRequestId = '11111111-1111-4111-8111-111111111111';
export function planningRow(
  serviceKind: 'POWER' | 'LOGISTICS' | 'WATER' = 'POWER',
  action = 'BOOK',
  countryId = 'COUNTRY_TEST_ONLY',
): Readonly<IndustryUtilityPlanningRow> {
  const parameters =
    action === 'BOOK'
      ? serviceKind === 'POWER'
        ? {
            purpose: 'INDUSTRY_SELF_USE',
            quantityUnit: 'MWh',
            capacityFacts: [
              { name: 'TEST_ONLY_REMAINING_STORAGE', value: '10', unit: 'MWh' },
            ],
          }
        : {
            quantityUnit: 'tonne',
            fromLocationId: 'WAREHOUSE_TEST_ONLY',
            toLocationId: 'LOCATION_TEST_ONLY',
            materialRef: 'MATERIAL_TEST_ONLY',
            titleHolderId: 'OP_TEST_ONLY',
            riskBearerId: 'OP_TEST_ONLY',
            capacityFacts: [
              { name: 'TEST_ONLY_THROUGHPUT', value: '10', unit: 'tonne/day' },
            ],
          }
      : {
          operation:
            serviceKind === 'POWER'
              ? {
                  action: 'DELIVER',
                  bookingRef: 'BOOKING_TEST_ONLY',
                  workEventFingerprint: planningFp,
                  paymentEventFingerprint: planningFp,
                }
              : serviceKind === 'WATER'
                ? {
                    action: 'DELIVER',
                    workEventFingerprint: planningFp,
                    paymentEventFingerprint: planningFp,
                    powerEventFingerprints: [planningFp],
                    additionalProtectedClaims: [],
                  }
                : action === 'SERVICE_WORK'
                  ? {
                      action,
                      transferId: 'TRANSFER_TEST_ONLY',
                      workOrderRef: 'ORDER_TEST_ONLY',
                      workOrderSha256: planningRaw,
                    }
                  : action === 'PAY_INPUTS'
                    ? {
                        action,
                        transferId: 'TRANSFER_TEST_ONLY',
                        workEventFingerprint: planningFp,
                        expenseOrderRef: 'EXPENSE_TEST_ONLY',
                        expenseOrderSha256: planningRaw,
                      }
                    : { action, transferId: 'TRANSFER_TEST_ONLY' },
        };
  return parseIndustryUtilityPlanningRow({
    schemaVersion: 'postwar-industry-utility-planning-row-v1',
    planningRef: 'PLANNING_TEST_ONLY_' + serviceKind + '_' + action,
    countryId,
    facilityId: 'FACILITY_TEST_ONLY',
    locationId: 'LOCATION_TEST_ONLY',
    operatorId: 'OP_TEST_ONLY',
    runId: 'RUN_COMMITTED_TEST_ONLY',
    sourceRef: 'SOURCE_REGISTERED_TEST_ONLY_' + serviceKind,
    sourceRawSha256: planningRaw,
    runStartsAtSimTime: '10',
    runEndsAtSimTime: '1000',
    serviceKind,
    action,
    parameters,
    measurement: 'PLANNING_DATA_NOT_AUTHORITY',
  });
}
export function industryUtilityPlanningWireFixture() {
  const base = officeProjectionFixture('industry'),
    identity = {
      ...base.config.identity,
      projectionVersion: 'postwar-office-runtime-read-v1',
    },
    read = {
      ...base.config,
      identity,
      currentIdentity: () =>
        base.config.session.isCurrent() ? identity : null,
      endpoints: {
        ...base.config.endpoints,
        projectionPath: '/v1/postwar-office-runtime',
      },
    };
  const view = { role: 'industry' as const, countryDisplayId: '01' };
  let mode:
      'PAGE' | 'EMPTY' | 'UNAVAILABLE' | 'DENIED' | 'FOREIGN' | 'STALE_HEAD' =
      'PAGE',
    head = '7',
    submitted: Record<string, unknown> | undefined;
  let rows: readonly IndustryUtilityPlanningRow[] = [
    planningRow('POWER', 'BOOK', identity.countryId),
  ];
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname,
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ path, body });
    if (path === '/v1/postwar-office-runtime') {
      const planning = body.dataset === INDUSTRY_UTILITY_PLANNING_DATASET;
      if (
        body.dataset === 'industry-run-parameters' ||
        (planning && ['UNAVAILABLE', 'DENIED'].includes(mode))
      )
        return Response.json(
          {
            schemaVersion: identity.projectionVersion,
            requestId: body.requestId,
            ok: false,
            error: { code: 'TEST_ONLY_SOURCE_MISSING', retryable: false },
          },
          { status: planning && mode === 'DENIED' ? 403 : 503 },
        );
      const version = planning && mode === 'STALE_HEAD' ? '8' : head,
        seed = {
          worldId: read.world.worldId,
          seedRef: read.world.seedRef,
          contentHash: read.world.contentHash,
          admissionRef: read.world.admissionRef,
        };
      const values = planning
        ? mode === 'EMPTY'
          ? []
          : rows.map((r) => ({
              ...r,
              countryId:
                mode === 'FOREIGN' ? 'FOREIGN_COUNTRY' : identity.countryId,
            }))
        : [
            {
              schemaVersion: 'postwar-industry-labour-current-row-v1',
              countryId: identity.countryId,
              facilityId: 'FACILITY_TEST_ONLY',
              locationId: 'LOCATION_TEST_ONLY',
              operatorId: 'OP_TEST_ONLY',
              positionId: 'POSITION_TEST_ONLY',
              skill: 'LOW',
              classificationId: 'SKILL_TEST_ONLY',
              requiredCount: '2',
              openingFilledCount: '1',
              currentEmployedCount: '1',
              measurement: 'EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT',
              completedPersonDays: null,
              paidCost: null,
            },
          ];
      return Response.json({
        schemaVersion: identity.projectionVersion,
        requestId: body.requestId,
        ok: true,
        status: values.length ? 'AVAILABLE' : 'EMPTY',
        dataset: body.dataset,
        authority: {
          source: 'SERVER_VERIFIED_READ_BINDING',
          capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
          identity,
          seatRef: read.seatRef,
          seatState: 'ACTIVE',
          seed,
          readback: {
            ...seed,
            worldVersion: version,
            eventSequence: version,
            readbackRef: 'READBACK_TEST_ONLY',
          },
        },
        source: {
          ...identity,
          seedRef: seed.seedRef,
          contentHash: seed.contentHash,
          admissionRef: seed.admissionRef,
          dataNature: planning
            ? INDUSTRY_UTILITY_PLANNING_NATURE
            : 'ADMITTED_CURRENT_INDUSTRY_EMPLOYMENT_HEADCOUNT',
          sourceVersion: planningFp,
          bindingVersion: planningFp,
          sourceRevision: 'TEST_ONLY_WIRE',
          worldVersion: version,
          eventSequence: version,
          originWorldVersion: '0',
          originEventSequence: '0',
          observedHead: { worldVersion: version, eventSequence: version },
          pageHash: planningRaw,
          returnedRowsHash: planningRaw,
          hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
          ...(planning
            ? {
                currentIndustryUtilityPlanningCoverage: {
                  schemaVersion:
                    'postwar-industry-utility-planning-coverage-v1',
                  reducerVersion:
                    'POSTWAR_INDUSTRY_UTILITY_PLANNING_COMPLETE_PREFIX_V1',
                  countryId: identity.countryId,
                  globalWorldVersion: version,
                  globalEventSequence: version,
                  prefixFingerprint: planningFp,
                  pageChainFingerprint: planningFp,
                  sourceOriginalsFingerprint: planningFp,
                  planningRowsFingerprint: planningFp,
                },
              }
            : {
                currentIndustryLabourCoverage: {
                  schemaVersion: 'postwar-industry-labour-current-coverage-v1',
                  countryId: identity.countryId,
                  prefixFingerprint: planningFp,
                  knownEffectsFingerprint: planningFp,
                  coveredThroughEventId: 'EVENT_TEST_ONLY',
                  coveredThroughEventFingerprint: planningFp,
                  financialPostingCount: '0',
                  financialBatchCount: '0',
                  financialPostingsFingerprint: planningFp,
                  globalWorldVersion: version,
                  globalEventSequence: version,
                  rowsHash: planningFp,
                  originalScopeSha256: planningRaw,
                },
              }),
          sourcePointer: planning
            ? {
                rowOrigin: 'fixed-industry-utility-planning-runtime',
                rowBinding: 'planningRef+sourceRef+sourceRawSha256',
              }
            : {
                sourceId: 'SOURCE_TEST_ONLY',
                sourcePayloadHash: planningFp,
                canonicalSeedSha256: planningRaw,
                path: '/carrier/socialEmployment/inputs/sourcePositions',
                selection: {
                  countryId: identity.countryId,
                  sourceBucket: 'INDUSTRY',
                  employerRole: 'OP',
                },
              },
        },
        rows: values,
        page: {
          offset: 0,
          limit: 25,
          returned: values.length,
          total: values.length,
          nextOffset: null,
        },
      });
    }
    if (path === '/v1/office-command') {
      submitted = body.request as Record<string, unknown>;
      return Response.json({
        schemaVersion: body.schemaVersion,
        requestId: body.requestId,
        ok: true,
        state: {
          status: 'QUEUED',
          source: 'NEW',
          submitted: true,
          queued: true,
          commandId: submitted.commandId,
          commandType: submitted.commandType,
          commandFingerprint: planningFp,
        },
      });
    }
    if (path === '/v1/command-recovery') {
      const original = (
        body.request as {
          originalRequest: { request: Record<string, unknown> };
        }
      ).originalRequest.request;
      head = '8';
      return Response.json({
        schemaVersion: body.schemaVersion,
        requestId: body.requestId,
        ok: true,
        state: {
          status: 'FINAL',
          commandType: original.commandType,
          receipt: {
            source: 'DURABLE_FINAL_COMMAND_RECEIPT',
            schemaVersion: 'command-receipt-v2',
            worldId: identity.worldId,
            commandId: original.commandId,
            idempotencyKey: original.idempotencyKey,
            commandFingerprint: planningFp,
            outcome: 'COMMITTED',
            reasonCode: null,
            transitionId: 'TRANSITION_TEST_ONLY',
            worldVersionBefore: '7',
            worldVersionAfter: '8',
            simTime: '20',
            eventIds: ['EVENT_TEST_ONLY'],
            recordedAtReal: '2026-11-08T00:00:00.000Z',
          },
        },
      });
    }
    throw Error('UNEXPECTED_SYNTHETIC_ROUTE');
  };
  return {
    binding: {
      read,
      view,
      endpoint: {
        origin: read.endpoints.origin,
        path: '/v1/office-command' as const,
        deploymentRef: read.endpoints.deploymentRef,
      },
    },
    calls,
    fetcher,
    invalidate: base.invalidate,
    setMode(value: typeof mode) {
      mode = value;
    },
    setRows(value: typeof rows) {
      rows = value;
    },
    get head() {
      return head;
    },
  };
}
