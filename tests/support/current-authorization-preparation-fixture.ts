// TEST_ONLY bytes/data. No actual ADMIN, source registry, seat or admission.
import {
  AUTHORIZATION_PREPARATION_SCHEMA,
  sha256,
} from '../../apps/world-worker/src/preparation/current-authorization-source-contract.js';
import {
  authorizationSliceFingerprint,
  type AuthorizationRowData,
} from '../../apps/world-worker/src/preparation/current-authorization-publication-preparation.js';

export const TEST_SUBJECT = '00000000-0000-4000-8000-000000000011';
export const TEST_COUNTRIES = ['COUNTRY_AUTHZ_TEST_A', 'COUNTRY_AUTHZ_TEST_B'];
export const TEST_NOW = '2026-10-10T00:00:01.000Z';
export function sourceBytes(
  revision = 'TEST_ONLY_REV_1',
  predecessorRevision: string | null = null,
  before: readonly AuthorizationRowData[] = [],
  override: Record<string, unknown> = {},
) {
  const body = {
    schemaVersion: AUTHORIZATION_PREPARATION_SCHEMA,
    sourceOwnerRef: 'TEST_ONLY_NOT_ACTUAL_OWNER',
    sourceRegistrationId: 'TEST_ONLY_NOT_REGISTERED',
    sourceRecordRef: 'TEST_ONLY_RECORD_' + revision,
    sourceRevision: revision,
    predecessorRevision,
    operationId: 'TEST_ONLY_OPERATION_' + revision,
    worldId: 'WORLD_AUTHZ_TEST_DEFAULT',
    authSubject: TEST_SUBJECT,
    expectedWorldVersion: '0',
    expectedBeforeSemanticFingerprint: authorizationSliceFingerprint(before),
    verifiedActorSubject: '00000000-0000-4000-8000-000000000012',
    issuer: 'TEST_ONLY_NOT_VERIFIED',
    audience: 'TEST_ONLY_NOT_VERIFIED',
    actorApprovalRef: 'TEST_ONLY_NO_APPROVAL',
    adminRevision: 'TEST_ONLY_ADMIN_1',
    adminScopeRef: 'TEST_ONLY_NO_ADMIN_AUTHORITY',
    sourceWatermark: revision,
    cutoffProtocol: 'SAME_TRANSACTION_H',
    effectiveAtReal: '2026-10-10T00:00:00.000Z',
    expiresAtReal: '2026-10-11T00:00:00.000Z',
    operation: 'REPLACE_ACTIVE_SET',
    countryId: TEST_COUNTRIES[0],
    teamId: 'TEAM_AUTHZ_TEST_A',
    grants: [{ officeId: 'CAPTAIN', capability: 'CAPTAIN_STRATEGY' }],
    ...override,
  };
  const rawBytes = JSON.stringify(body);
  return {
    rawBytes,
    expectedSha256: sha256(rawBytes),
    request: {
      worldId: body.worldId,
      sourceRecordRef: body.sourceRecordRef,
      expectedWorldVersion: body.expectedWorldVersion,
      expectedBeforeSemanticFingerprint: body.expectedBeforeSemanticFingerprint,
    },
  };
}
