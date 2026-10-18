// B16 preparation only. No roster, grant, source registration or runtime entry.
import {
  IDENTIFIER,
  REVISION,
  SUBJECT,
  canonicalTime,
  canonicalVersion,
  officeCapability,
  parseAuthorizationSourceBytes,
} from './current-authorization-source-contract.js';

export const B16_PERMISSION_BATCH = 'B16' as const;
const COUNTRIES = /^(?:0[1-9]|[1-6][0-9]|70)$/u;
const ENTITY =
  /^ENTITY_(GOVERNMENT|OPERATOR|HOUSEHOLDS|BANK|CENTRAL_BANK)_([0-9]{2})$/u;
const TARGET_KEYS = [
  'stableId',
  'scope',
  'ownerId',
  'countryId',
  'missingField',
] as const;

/** References to already-adopted policies and existing implementation, not a
 * new entity→Office table. An entity label cannot select an actor or capability.
 * Actual permission remains command-specific and is re-resolved at commit.
 */
const EXISTING_AUTHORIZATION_CHAIN = Object.freeze({
  policy: 'docs/architecture/decisions/ADR-20.md',
  offices: 'packages/core/src/authorization/offices.ts#OFFICE_DEFINITIONS',
  principal: 'packages/core/src/authorization/identity.ts#authenticateIdentity',
  intake:
    'packages/core/src/authorization/offices.ts#authorizeOfficeCapability',
  approval:
    'packages/core/src/authorization/offices.ts#reauthorizeOfficeDecision',
  currentSeat:
    'apps/world-api/src/integration/authenticated-current-seat-reader.ts#createAuthenticatedCurrentSeatReader',
  sourceParser:
    'apps/world-worker/src/preparation/current-authorization-source-contract.ts#parseAuthorizationSourceBytes',
  serverBinding:
    'apps/world-worker/src/intake/postgres-office-command-intake.ts#PostgresOfficeCommandIntake',
  commit:
    'apps/world-worker/src/authoritative-execution.ts#createTransactionCutoffAuthorizationGuard',
});

const NOT_AUTHORITY = Object.freeze({
  classification: 'UNTRUSTED_B16_CANDIDATE_NOT_AUTHORITY' as const,
  productionAuthority: false as const,
  sourceAdmitted: false as const,
  runtimeConnected: false as const,
  permissionGranted: false as const,
  currentnessVerified: false as const,
  originalFieldStatus: 'UNKNOWN' as const,
  originalFieldValue: null,
  status: 'PENDING_ROSTER' as const,
});

function refuse(code: string): never {
  throw new Error(`B16_${code}`);
}

/** Only the five identity columns projected from original ledger rows. Parsing
 * names does not establish legal ownership, an assignment or a current subject.
 */
export function parseB16PermissionTarget(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    refuse('TARGET_INVALID');
  const row = input as Record<string, unknown>;
  if (
    Object.keys(row).length !== TARGET_KEYS.length ||
    Object.keys(row).some(
      (key) => !TARGET_KEYS.includes(key as (typeof TARGET_KEYS)[number]),
    ) ||
    TARGET_KEYS.some((key) => typeof row[key] !== 'string')
  )
    refuse('TARGET_KEYS_INVALID');
  const { stableId, scope, ownerId, countryId, missingField } = row as Record<
    (typeof TARGET_KEYS)[number],
    string
  >;
  const suffix = countryId.slice('COUNTRY_'.length);
  if (countryId !== `COUNTRY_${suffix}` || !COUNTRIES.test(suffix))
    refuse('TARGET_COUNTRY_INVALID');
  if (scope === 'COUNTRY') {
    if (ownerId !== countryId || missingField !== 'discretionaryAuthorization')
      refuse('TARGET_SCOPE_INVALID');
  } else if (scope === 'ENTITY') {
    const entity = ENTITY.exec(ownerId);
    if (!entity || entity[2] !== suffix || missingField !== 'currentPermission')
      refuse('TARGET_SCOPE_INVALID');
  } else refuse('TARGET_SCOPE_INVALID');
  if (stableId !== `U2544::${scope}::${ownerId}::${missingField}`)
    refuse('TARGET_STABLE_ID_MISMATCH');
  return Object.freeze({
    batchId: B16_PERMISSION_BATCH,
    stableId,
    scope,
    ownerId,
    countryId,
    missingField,
    ...NOT_AUTHORITY,
    chain: EXISTING_AUTHORIZATION_CHAIN,
    requiredScope:
      'EXISTING_COMMAND_SPECIFIC_POLICY_AND_ACTUAL_ENTITY_SCOPE_REQUIRED' as const,
    entityOfficeAssignment: null,
  });
}

/** 420 unique valid members exhaust the original70×(1 country+5 entity) space.
 * Reject incomplete or duplicate sets rather than quietly dropping bad rows.
 */
export function buildB16PermissionMap(input: readonly unknown[]) {
  if (!Array.isArray(input) || input.length !== 420)
    refuse('TARGET_SET_INCOMPLETE');
  const rows = input.map(parseB16PermissionTarget);
  if (new Set(rows.map((row) => row.stableId)).size !== rows.length)
    refuse('TARGET_SET_DUPLICATE');
  return Object.freeze(
    rows.sort((a, b) =>
      a.stableId < b.stableId ? -1 : a.stableId > b.stableId ? 1 : 0,
    ),
  );
}

/** Expected values are comparison data only, not a trusted resolver or a seat.
 * No callback/positive Boolean can promote a parsed source into authorization.
 */
export interface B16ExpectedScopeData {
  readonly worldId: string;
  readonly worldVersion: string;
  readonly countryId: string;
  readonly authSubject: string;
  readonly teamId: string;
  readonly officeId: string;
  readonly capability: string;
  readonly authorizationRevision: string;
}

/** Reuse the existing strict, byte-pinned, untrusted source parser. This checks
 * a proposed source against an original field and a proposed expected scope;
 * even success cannot satisfy B16's real-roster/current-head/commit standard.
 * Never returns a principal, AuthorizedOfficeContext or commit proof.
 */
export function inspectB16PermissionSourceCandidate(input: {
  readonly target: unknown;
  readonly rawBytes: unknown | null;
  readonly expectedSha256: unknown | null;
  readonly expected: B16ExpectedScopeData | null;
  readonly observedAtReal: string;
}) {
  const target = parseB16PermissionTarget(input.target);
  const outcome = (
    inspection:
      | 'SOURCE_ABSENT'
      | 'EXPECTED_SCOPE_ABSENT'
      | 'CANDIDATE_REVOKED'
      | 'CANDIDATE_WELL_FORMED_NOT_CURRENT',
    candidate: {
      sourceSha256: string;
      sourceRevision: string;
      sourceRecordRef: string;
    } | null = null,
  ) =>
    Object.freeze({
      ...target,
      inspection,
      candidate: candidate ? Object.freeze(candidate) : null,
    });
  if (input.rawBytes === null && input.expectedSha256 === null)
    return outcome('SOURCE_ABSENT');
  if (input.expected === null) return outcome('EXPECTED_SCOPE_ABSENT');
  const source = parseAuthorizationSourceBytes(
    input.rawBytes,
    input.expectedSha256,
  );
  const expected = input.expected;
  for (const value of [expected.worldId, expected.teamId])
    if (
      typeof value !== 'string' ||
      value.length > 256 ||
      !IDENTIFIER.test(value)
    )
      refuse('EXPECTED_SCOPE_INVALID');
  if (
    typeof expected.authSubject !== 'string' ||
    !SUBJECT.test(expected.authSubject) ||
    typeof expected.authorizationRevision !== 'string' ||
    !REVISION.test(expected.authorizationRevision)
  )
    refuse('EXPECTED_SCOPE_INVALID');
  canonicalVersion(expected.worldVersion);
  officeCapability(expected.officeId, expected.capability);
  const now = canonicalTime(input.observedAtReal);
  if (source.effectiveAtReal > now || source.expiresAtReal <= now)
    refuse('CANDIDATE_NOT_EFFECTIVE_OR_EXPIRED');
  if (
    expected.countryId !== target.countryId ||
    source.countryId !== target.countryId ||
    source.worldId !== expected.worldId ||
    source.expectedWorldVersion !== expected.worldVersion ||
    source.authSubject !== expected.authSubject ||
    source.teamId !== expected.teamId ||
    source.sourceRevision !== expected.authorizationRevision
  )
    refuse('CANDIDATE_SCOPE_MISMATCH');
  const candidate = {
    sourceSha256: source.sourceSha256,
    sourceRevision: source.sourceRevision,
    sourceRecordRef: source.sourceRecordRef,
  };
  if (source.operation === 'REVOKE')
    return outcome('CANDIDATE_REVOKED', candidate);
  if (
    !source.grants.some(
      (grant) =>
        grant.officeId === expected.officeId &&
        grant.capability === expected.capability,
    )
  )
    refuse('CANDIDATE_OFFICE_CAPABILITY_ABSENT');
  return outcome('CANDIDATE_WELL_FORMED_NOT_CURRENT', candidate);
}
