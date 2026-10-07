import { createProductionReadClient } from '../../apps/world-web/src/production-read/client.js';
import type { ProductionReadConfig } from '../../apps/world-web/src/production-read/contract.js';
import {
  officeProjectionRoles,
  type OfficeRole,
} from '../../apps/world-web/src/office-projection/model.js';

/** OFFLINE TEST_ONLY. Shape copied from the existing server projection and
 * read-binding envelope. None of these identifiers, seats, tokens, admissions
 * or endpoints exists. The fetcher intercepts ONLY this fixture client. */
export function officeProjectionFixture(role: OfficeRole) {
  const identity = {
    worldId: 'TEST_WORLD',
    countryId: 'TEST_COUNTRY',
    officeId: officeProjectionRoles[role],
    scopeKey: `TEST_SCOPE_${officeProjectionRoles[role]}`,
    authSubjectId: '22222222-2222-4222-8222-222222222222',
    authorizationRevision: 'TEST_REVISION',
    modelVersion: 'TEST_MODEL',
    projectionVersion: 'TEST_PROJECTION',
    classification: 'OFFICE_PRIVATE' as const,
  };
  let alive = true;
  const listeners = new Set<() => void>();
  const fingerprint = `sha256:${'a'.repeat(64)}`;
  const config: ProductionReadConfig = {
    identity,
    seatRef: 'TEST_SEAT',
    currentIdentity: () => (alive ? identity : null),
    getAccessToken: async () => 'TEST_ONLY_TOKEN',
    endpoints: {
      origin: 'https://test-only.example.invalid',
      projectionPath: '/v1/test-only-read',
      finalLookupPath: '/v1/test-only-final',
      deploymentRef: 'TEST_DEPLOYMENT',
    },
    world: {
      worldId: identity.worldId,
      seedRef: 'TEST_SEED',
      contentHash: fingerprint,
      admissionRef: 'TEST_ADMISSION',
      minimumWorldVersion: '1',
    },
    session: {
      sessionRef: 'TEST_SESSION',
      isCurrent: () => alive,
      onInvalidate: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
  };
  const lookup = {
    commandId: 'TEST_COMMAND',
    idempotencyKey: 'TEST_KEY',
    commandFingerprint: fingerprint,
  };
  const payload = {
    schemaVersion: 'world-activity-projection-v1',
    countryId: identity.countryId,
    officeId: identity.officeId,
    activity: {
      authoritativeEventCount: '1',
      lastAuthoritativeEventSequence: '1',
      lastAuthoritativeEventWorldVersion: '1',
    },
    ledger: {
      financialPositions: [
        {
          accountId: 'TEST_TREASURY',
          accountClass: 'TREASURY',
          currency: 'GCU',
          netDebitBalance: '9007199254740993.25',
        },
      ],
      inventoryPositions: [
        {
          bucket: 'RESERVED',
          commodityId: 'TEST_STEEL',
          quantity: '-0.125',
          unit: 'tonne',
        },
      ],
    },
  };
  let worldVersion = '2';
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const authority = () => ({
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    identity,
    seatRef: 'TEST_SEAT',
    seatState: 'ACTIVE',
    seed: {
      worldId: 'TEST_WORLD',
      seedRef: 'TEST_SEED',
      contentHash: fingerprint,
      admissionRef: 'TEST_ADMISSION',
    },
    readback: {
      worldId: 'TEST_WORLD',
      seedRef: 'TEST_SEED',
      contentHash: fingerprint,
      admissionRef: 'TEST_ADMISSION',
      worldVersion,
      eventSequence: worldVersion,
      readbackRef: 'TEST_READBACK',
    },
  });
  const fetcher: typeof fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const path = new URL(String(input)).pathname;
    calls.push({ path, body });
    if (path === config.endpoints.finalLookupPath) {
      worldVersion = '3';
      return Response.json({
        schemaVersion: 'world-authorized-read-binding-v1',
        requestId: body.requestId,
        ok: true,
        authority: authority(),
        result: {
          schemaVersion: 'world-final-receipt-read-v1',
          requestId: body.requestId,
          ok: true,
          receipt: {
            source: 'DURABLE_FINAL_COMMAND_RECEIPT',
            worldId: 'TEST_WORLD',
            ...lookup,
            outcome: 'COMMITTED',
            reasonCode: null,
            worldVersionAfter: '3',
            eventIds: ['TEST_EVENT'],
            recordedAtReal: '2026-10-07T00:00:00.000Z',
          },
        },
      });
    }
    return Response.json({
      schemaVersion: 'world-authorized-read-binding-v1',
      requestId: body.requestId,
      ok: true,
      authority: authority(),
      result: {
        schemaVersion: 'world-read-api-v1',
        requestId: body.requestId,
        ok: true,
        data: {
          schemaVersion: 'world-projection-read-v1',
          worldId: 'TEST_WORLD',
          classification: identity.classification,
          scopeKey: identity.scopeKey,
          watermark: {
            worldVersion,
            eventSequence: worldVersion,
            generatedAt: '2026-10-07T00:00:00.000Z',
          },
          payload,
          receipts: [],
          events: [],
        },
      },
    });
  };
  return {
    config,
    payload,
    calls,
    lookup,
    fetcher,
    binding: {
      read: config,
      view: { countryDisplayId: '01', role },
      finalLookup: lookup,
    },
    client: () => createProductionReadClient(config, { fetcher }),
    invalidate: () => {
      alive = false;
      for (const listener of [...listeners]) listener();
    },
  };
}
