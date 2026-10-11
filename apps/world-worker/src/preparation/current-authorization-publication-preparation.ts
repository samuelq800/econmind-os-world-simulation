// Pure PREPARATION mechanics. No source binding, SQL executor, routes or grants.
import { PostgresTransactionError } from '../persistence/postgres-sql-database.js';
import {
  IDENTIFIER,
  DIGEST,
  AUTHORIZATION_PREPARATION_SCHEMA,
  REVISION,
  SUBJECT,
  canonicalTime,
  canonicalVersion,
  officeCapability,
  parseAuthorizationSourceBytes,
  preparationRefusal,
  sha256,
  type UntrustedAuthorizationSourceRecord,
} from './current-authorization-source-contract.js';

export interface AuthorizationRowData {
  readonly worldId: string;
  readonly authSubject: string;
  readonly countryId: string;
  readonly officeId: string;
  readonly capability: string;
  readonly teamId: string;
  readonly authorizationVersion: string;
  readonly active: boolean;
}
export interface AuthorizationPublicationRequest {
  readonly worldId: string;
  readonly sourceRecordRef: string;
  readonly expectedWorldVersion: string;
  readonly expectedBeforeSemanticFingerprint: string;
}
export interface AuthorizationPublicationCheckpoint {
  readonly worldId: string;
  readonly authSubject: string;
  readonly sourceOwnerRef: string;
  readonly sourceRegistrationId: string;
  readonly sourceRecordRef: string;
  readonly sourceSchemaVersion: string;
  readonly sourceSha256: string;
  readonly sourceRevision: string;
  readonly predecessorRevision: string | null;
  readonly operationId: string;
  readonly expectedWorldVersion: string;
  readonly expectedBeforeSemanticFingerprint: string;
  readonly afterFingerprint: string;
}
const key = (row: AuthorizationRowData) =>
  [row.countryId, row.officeId, row.capability].join('|');
const compare = (a: AuthorizationRowData, b: AuthorizationRowData) => {
  for (const field of ['countryId', 'officeId', 'capability'] as const) {
    if (a[field] < b[field]) return -1;
    if (a[field] > b[field]) return 1;
  }
  return 0;
};

function validateCheckpoint(c: AuthorizationPublicationCheckpoint | null) {
  if (!c) return;
  const refs = [
    c.sourceOwnerRef,
    c.sourceRegistrationId,
    c.sourceRecordRef,
    c.operationId,
  ];
  if (
    !IDENTIFIER.test(c.worldId) ||
    c.worldId.length > 256 ||
    !SUBJECT.test(c.authSubject) ||
    refs.some(
      (ref) => typeof ref !== 'string' || !/^[\x21-\x7e]{1,256}$/u.test(ref),
    ) ||
    c.sourceSchemaVersion !== AUTHORIZATION_PREPARATION_SCHEMA ||
    typeof c.sourceRevision !== 'string' ||
    !REVISION.test(c.sourceRevision) ||
    (c.predecessorRevision !== null &&
      (!REVISION.test(c.predecessorRevision) ||
        c.predecessorRevision === c.sourceRevision)) ||
    !DIGEST.test(c.sourceSha256) ||
    !DIGEST.test(c.afterFingerprint) ||
    !DIGEST.test(c.expectedBeforeSemanticFingerprint)
  )
    preparationRefusal('AUTHORIZATION_CHECKPOINT_INVALID');
  canonicalVersion(c.expectedWorldVersion);
}

export function authorizationSliceFingerprint(
  rows: readonly AuthorizationRowData[],
): string {
  // Explicit ASCII field framing; callers validate the bounded domain before use.
  return sha256(
    [...rows]
      .sort(compare)
      .map((r) =>
        [
          r.worldId,
          r.authSubject,
          r.countryId,
          r.officeId,
          r.capability,
          r.teamId,
          r.authorizationVersion,
          r.active ? '1' : '0',
        ].join('|'),
      )
      .join('\n'),
  );
}
function validatedRows(
  rows: readonly AuthorizationRowData[],
  source: UntrustedAuthorizationSourceRecord,
  countryIds: readonly string[],
): readonly AuthorizationRowData[] {
  if (
    !countryIds.length ||
    countryIds.length > 256 ||
    countryIds.some((id) => id.length > 256 || !IDENTIFIER.test(id)) ||
    new Set(countryIds).size !== countryIds.length ||
    !countryIds.includes(source.countryId) ||
    rows.length > countryIds.length * 18
  )
    preparationRefusal('AUTHORIZATION_COUNTRY_CATALOG_OR_SLICE_INVALID');
  const seen = new Set<string>();
  for (const row of rows) {
    if (
      row.worldId !== source.worldId ||
      row.authSubject !== source.authSubject ||
      !SUBJECT.test(row.authSubject) ||
      !countryIds.includes(row.countryId) ||
      typeof row.teamId !== 'string' ||
      row.teamId.length > 256 ||
      !IDENTIFIER.test(row.teamId) ||
      typeof row.authorizationVersion !== 'string' ||
      !REVISION.test(row.authorizationVersion) ||
      typeof row.active !== 'boolean'
    )
      preparationRefusal('AUTHORIZATION_SLICE_IDENTITY_INVALID');
    officeCapability(row.officeId, row.capability); // Including inactive, no silent stripping.
    if (seen.has(key(row))) preparationRefusal('AUTHORIZATION_SLICE_DUPLICATE');
    seen.add(key(row));
  }
  const active = rows.filter((r) => r.active);
  if (
    new Set(
      active.map((r) =>
        [r.countryId, r.teamId, r.authorizationVersion].join('|'),
      ),
    ).size > 1
  )
    preparationRefusal('AUTHORIZATION_SLICE_INCOHERENT');
  return Object.freeze(rows.map((r) => Object.freeze({ ...r })).sort(compare));
}
function sameOperation(
  c: AuthorizationPublicationCheckpoint,
  source: UntrustedAuthorizationSourceRecord,
  request: AuthorizationPublicationRequest,
): boolean {
  return (
    c.worldId === source.worldId &&
    c.authSubject === source.authSubject &&
    c.sourceOwnerRef === source.sourceOwnerRef &&
    c.sourceRegistrationId === source.sourceRegistrationId &&
    c.sourceRecordRef === source.sourceRecordRef &&
    c.sourceSchemaVersion === source.schemaVersion &&
    c.sourceSha256 === source.sourceSha256 &&
    c.sourceRevision === source.sourceRevision &&
    c.predecessorRevision === source.predecessorRevision &&
    c.operationId === source.operationId &&
    c.expectedWorldVersion === request.expectedWorldVersion &&
    c.expectedBeforeSemanticFingerprint ===
      request.expectedBeforeSemanticFingerprint
  );
}
function sourceAndRequest(input: {
  readonly rawBytes: string;
  readonly expectedSha256: string;
  readonly request: AuthorizationPublicationRequest;
  readonly observedAtReal: string;
}) {
  const source = parseAuthorizationSourceBytes(
    input.rawBytes,
    input.expectedSha256,
  );
  const request = input.request;
  if (
    request.worldId !== source.worldId ||
    request.sourceRecordRef !== source.sourceRecordRef ||
    request.expectedWorldVersion !== source.expectedWorldVersion ||
    request.expectedBeforeSemanticFingerprint !==
      source.expectedBeforeSemanticFingerprint
  )
    preparationRefusal('AUTHORIZATION_SOURCE_REQUEST_MISMATCH');
  const now = canonicalTime(input.observedAtReal);
  if (source.effectiveAtReal > now || source.expiresAtReal <= now)
    preparationRefusal('AUTHORIZATION_SOURCE_NOT_EFFECTIVE_OR_EXPIRED');
  return source;
}

/** Returns immutable UNTRUSTED plans only; no current-source/admin proof.
 * Snapshot/catalog inputs are for mechanical analysis, never caller authority.
 * A real adapter must first own H/source/C/all-A and registration/currentness.
 */
export function planAuthorizationReplacement(input: {
  readonly rawBytes: string;
  readonly expectedSha256: string;
  readonly request: AuthorizationPublicationRequest;
  readonly observedAtReal: string;
  readonly headVersion: string | null;
  readonly countryIds: readonly string[];
  readonly rows: readonly AuthorizationRowData[];
  readonly checkpoint: AuthorizationPublicationCheckpoint | null;
}) {
  const source = sourceAndRequest(input);
  if (input.headVersion === null)
    preparationRefusal('AUTHORIZATION_WORLD_HEAD_MISSING');
  canonicalVersion(input.headVersion);
  const rows = validatedRows(input.rows, source, input.countryIds);
  const beforeFingerprint = authorizationSliceFingerprint(rows);
  const current = input.checkpoint;
  validateCheckpoint(current);
  if (
    current &&
    (current.worldId !== source.worldId ||
      current.authSubject !== source.authSubject ||
      current.sourceOwnerRef !== source.sourceOwnerRef ||
      current.sourceRegistrationId !== source.sourceRegistrationId)
  )
    preparationRefusal('AUTHORIZATION_CHECKPOINT_IDENTITY_CONFLICT');
  if (current && sameOperation(current, source, input.request)) {
    if (current.afterFingerprint !== beforeFingerprint)
      preparationRefusal('AUTHORIZATION_CHECKPOINT_SLICE_CONFLICT');
    return Object.freeze({
      classification: 'UNTRUSTED_PLAN_NOT_AUTHORITY' as const,
      action: 'EXISTING_METADATA_ONLY' as const,
      beforeFingerprint,
      rows,
      checkpoint: Object.freeze({ ...current }),
    });
  }
  if (
    current &&
    (current.operationId === source.operationId ||
      current.sourceRevision === source.sourceRevision)
  )
    preparationRefusal('AUTHORIZATION_OPERATION_OR_REVISION_CONFLICT');
  if (!current && rows.length)
    preparationRefusal('AUTHORIZATION_PREDECESSOR_UNESTABLISHED');
  if (
    source.predecessorRevision !== (current?.sourceRevision ?? null) ||
    (current !== null && current.afterFingerprint !== beforeFingerprint) ||
    beforeFingerprint !== input.request.expectedBeforeSemanticFingerprint ||
    input.headVersion !== input.request.expectedWorldVersion
  )
    preparationRefusal('AUTHORIZATION_PREDECESSOR_OR_CAS_CONFLICT');
  const desired = new Map(
    source.grants.map((g) => [
      [source.countryId, g.officeId, g.capability].join('|'),
      g,
    ]),
  );
  const after = rows.map((row): AuthorizationRowData => {
    const active = desired.delete(key(row));
    return Object.freeze({
      ...row,
      active,
      authorizationVersion: source.sourceRevision,
      teamId: active ? source.teamId : row.teamId,
    });
  });
  for (const grant of desired.values())
    after.push(
      Object.freeze({
        worldId: source.worldId,
        authSubject: source.authSubject,
        countryId: source.countryId,
        officeId: grant.officeId,
        capability: grant.capability,
        teamId: source.teamId,
        authorizationVersion: source.sourceRevision,
        active: true,
      }),
    );
  const next = validatedRows(after, source, input.countryIds);
  const checkpoint = Object.freeze({
    worldId: source.worldId,
    authSubject: source.authSubject,
    sourceOwnerRef: source.sourceOwnerRef,
    sourceRegistrationId: source.sourceRegistrationId,
    sourceRecordRef: source.sourceRecordRef,
    sourceSchemaVersion: source.schemaVersion,
    sourceSha256: source.sourceSha256,
    sourceRevision: source.sourceRevision,
    predecessorRevision: source.predecessorRevision,
    operationId: source.operationId,
    expectedWorldVersion: input.request.expectedWorldVersion,
    expectedBeforeSemanticFingerprint:
      input.request.expectedBeforeSemanticFingerprint,
    afterFingerprint: authorizationSliceFingerprint(next),
  });
  return Object.freeze({
    classification: 'UNTRUSTED_PLAN_NOT_AUTHORITY' as const,
    action: 'REPLACE_METADATA_PLAN_ONLY' as const,
    beforeFingerprint,
    rows: next,
    checkpoint,
  });
}

/** Fresh A/C metadata cannot prove real source/admin/currentness or original ACK. */
export function compareAuthorizationPublicationReadback(input: {
  readonly rawBytes: string;
  readonly expectedSha256: string;
  readonly request: AuthorizationPublicationRequest;
  readonly observedAtReal: string;
  readonly rows: readonly AuthorizationRowData[];
  readonly countryIds: readonly string[];
  readonly checkpoint: AuthorizationPublicationCheckpoint | null;
}) {
  const source = sourceAndRequest(input);
  const rows = validatedRows(input.rows, source, input.countryIds);
  validateCheckpoint(input.checkpoint);
  if (!input.checkpoint) return 'CURRENT_MATCH_ONLY_UNKNOWN_STOP' as const;
  return sameOperation(input.checkpoint, source, input.request) &&
    input.checkpoint.afterFingerprint === authorizationSliceFingerprint(rows)
    ? ('METADATA_MATCH_REAL_SOURCE_REQUIRED' as const)
    : ('SUPERSEDED_OR_CONFLICT_UNKNOWN_STOP' as const);
}

export function classifyAuthorizationPublicationFailure(error: unknown) {
  return Object.freeze({
    status:
      error instanceof PostgresTransactionError &&
      (error.outcome === 'ROLLED_BACK' || error.outcome === 'NOT_STARTED')
        ? ('REJECTED_CONFIRMED_NO_CHANGE' as const)
        : ('AUTHORIZATION_WRITE_OUTCOME_UNKNOWN' as const),
    retryable: false as const,
  });
}

/** No activation/config/resolver factory. Not exported from a product entrypoint.
 * Extra JS arguments/parsed DTOs cannot enable it. No database is held.
 */
export function createUnregisteredAuthorizationPublicationPreparation() {
  const deny = (request: unknown) => {
    void request; // Do not inspect caller-controlled authority-like objects.
    return Object.freeze({
      status: 'AUTHORIZATION_SOURCE_NOT_REGISTERED' as const,
      retryable: false as const,
    });
  };
  return Object.freeze({ apply: deny, readback: deny });
}
