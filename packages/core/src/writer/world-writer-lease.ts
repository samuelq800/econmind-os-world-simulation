import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { workerId, worldId, type WorkerId, type WorldId } from '../ids.js';
import { canonicalSerialize } from '../serialization/canonical.js';

/**
 * V09.1 keeps operational writer liveness separate from SimTime. Every time
 * value accepted here is explicit, canonical UTC wall time; this module never
 * reads an ambient clock or changes replay/economic ordering.
 */
export const WORLD_WRITER_LEASE_SCHEMA_VERSION =
  'world-writer-lease-v1' as const;
export const WORLD_WRITER_COMMIT_ASSERTION_SCHEMA_VERSION =
  'world-writer-commit-assertion-v1' as const;

export type WorldWriterLeaseAcquisitionKind =
  'ACQUIRED' | 'RENEWED' | 'TAKEN_OVER';

export interface WorldWriterLease {
  readonly acquiredAtReal: string;
  readonly expiresAtReal: string;
  readonly fencingToken: string;
  readonly holderId: WorkerId;
  readonly renewedAtReal: string;
  readonly schemaVersion: typeof WORLD_WRITER_LEASE_SCHEMA_VERSION;
  readonly worldId: WorldId;
}

export interface WorldWriterLeaseRequest {
  readonly expiresAtReal: string;
  readonly holderId: WorkerId;
  readonly observedAtReal: string;
  readonly worldId: WorldId;
}

export interface WorldWriterLeaseAcquisition {
  readonly kind: WorldWriterLeaseAcquisitionKind;
  readonly lease: WorldWriterLease;
}

export interface WorldWriterCommitAssertion {
  readonly expectedWorldVersion: string;
  readonly fencingToken: string;
  readonly holderId: WorkerId;
  readonly schemaVersion: typeof WORLD_WRITER_COMMIT_ASSERTION_SCHEMA_VERSION;
  readonly worldId: WorldId;
}

const CANONICAL_NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const CANONICAL_POSITIVE_INTEGER = /^[1-9]\d*$/u;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const RFC3339_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const LEASE_FIELDS = Object.freeze([
  'acquiredAtReal',
  'expiresAtReal',
  'fencingToken',
  'holderId',
  'renewedAtReal',
  'schemaVersion',
  'worldId',
]);

const worldWriterLeases = new WeakSet<object>();
const worldWriterLeaseRequests = new WeakSet<object>();
const worldWriterCommitAssertions = new WeakSet<object>();

function invalidLease(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.WRITER_LEASE_INVALID, message);
}

function canonicalOperationalTime(value: string, label: string): string {
  if (typeof value !== 'string' || !RFC3339_MILLISECONDS.test(value)) {
    invalidLease(`${label} must be canonical RFC3339 UTC milliseconds`);
  }
  return value;
}

function canonicalPositiveInteger(value: string, label: string): string {
  if (typeof value !== 'string' || !CANONICAL_POSITIVE_INTEGER.test(value)) {
    invalidLease(`${label} must be a canonical positive integer string`);
  }
  if (BigInt(value) > MAX_POSTGRES_BIGINT) {
    invalidLease(`${label} exceeds the authoritative PostgreSQL bigint range`);
  }
  return value;
}

function canonicalWorldVersion(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    !CANONICAL_NON_NEGATIVE_INTEGER.test(value)
  ) {
    invalidLease(`${label} must be a canonical non-negative integer string`);
  }
  if (BigInt(value) > MAX_POSTGRES_BIGINT) {
    invalidLease(`${label} exceeds the authoritative PostgreSQL bigint range`);
  }
  return value;
}

function nextFencingToken(fencingToken: string): string {
  const current = BigInt(fencingToken);
  if (current === MAX_POSTGRES_BIGINT) {
    invalidLease('World writer fencing token is exhausted');
  }
  return (current + 1n).toString();
}

function operationalTimeBefore(left: string, right: string): boolean {
  return left < right;
}

function operationalTimeAtOrBefore(left: string, right: string): boolean {
  return left <= right;
}

function assertTrustedLease(
  lease: WorldWriterLease,
): asserts lease is WorldWriterLease {
  if (
    typeof lease !== 'object' ||
    lease === null ||
    !worldWriterLeases.has(lease)
  ) {
    invalidLease('World writer lease is not a trusted canonical lease record');
  }
}

function issueLease(input: {
  readonly acquiredAtReal: string;
  readonly expiresAtReal: string;
  readonly fencingToken: string;
  readonly holderId: WorkerId;
  readonly renewedAtReal: string;
  readonly worldId: WorldId;
}): WorldWriterLease {
  if (
    operationalTimeBefore(input.renewedAtReal, input.acquiredAtReal) ||
    operationalTimeAtOrBefore(input.expiresAtReal, input.renewedAtReal)
  ) {
    invalidLease(
      'Lease timestamps must satisfy acquiredAtReal <= renewedAtReal < expiresAtReal',
    );
  }
  const lease = Object.freeze({
    acquiredAtReal: input.acquiredAtReal,
    expiresAtReal: input.expiresAtReal,
    fencingToken: input.fencingToken,
    holderId: input.holderId,
    renewedAtReal: input.renewedAtReal,
    schemaVersion: WORLD_WRITER_LEASE_SCHEMA_VERSION,
    worldId: input.worldId,
  });
  worldWriterLeases.add(lease);
  return lease;
}

function inertRecord(input: unknown): Record<string, unknown> {
  const canonical = canonicalSerialize(input);
  const parsed: unknown = JSON.parse(canonical);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    invalidLease('World writer lease must be an inert canonical record');
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== LEASE_FIELDS.length ||
    keys.some((key) => !LEASE_FIELDS.includes(key))
  ) {
    invalidLease('World writer lease has missing or unknown fields');
  }
  return record;
}

function requiredString(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = record[field];
  if (typeof value !== 'string') {
    invalidLease(`${field} must be a string`);
  }
  return value;
}

/**
 * Parse a row or serialized lease returned by the authoritative persistence
 * adapter. The returned frozen value is the only accepted prior lease input
 * for lease transition and commit-guard helpers.
 */
export function parseWorldWriterLease(input: unknown): WorldWriterLease {
  const record = inertRecord(input);
  if (record.schemaVersion !== WORLD_WRITER_LEASE_SCHEMA_VERSION) {
    invalidLease('Unsupported world writer lease schema version');
  }
  const acquiredAtReal = canonicalOperationalTime(
    requiredString(record, 'acquiredAtReal'),
    'acquiredAtReal',
  );
  const renewedAtReal = canonicalOperationalTime(
    requiredString(record, 'renewedAtReal'),
    'renewedAtReal',
  );
  const expiresAtReal = canonicalOperationalTime(
    requiredString(record, 'expiresAtReal'),
    'expiresAtReal',
  );
  return issueLease({
    acquiredAtReal,
    expiresAtReal,
    fencingToken: canonicalPositiveInteger(
      requiredString(record, 'fencingToken'),
      'fencingToken',
    ),
    holderId: workerId(requiredString(record, 'holderId')),
    renewedAtReal,
    worldId: worldId(requiredString(record, 'worldId')),
  });
}

export function isWorldWriterLease(value: unknown): value is WorldWriterLease {
  return (
    typeof value === 'object' && value !== null && worldWriterLeases.has(value)
  );
}

/**
 * Creates a validated explicit lease request. A caller supplies operational
 * wall time; no system clock is read inside World Core.
 */
export function worldWriterLeaseRequest(
  world: WorldId,
  holder: WorkerId,
  observedAtReal: string,
  expiresAtReal: string,
): WorldWriterLeaseRequest {
  const canonicalObservedAtReal = canonicalOperationalTime(
    observedAtReal,
    'observedAtReal',
  );
  const canonicalExpiresAtReal = canonicalOperationalTime(
    expiresAtReal,
    'expiresAtReal',
  );
  if (
    operationalTimeAtOrBefore(canonicalExpiresAtReal, canonicalObservedAtReal)
  ) {
    invalidLease('Lease expiry must be later than observed operational time');
  }
  const request = Object.freeze({
    expiresAtReal: canonicalExpiresAtReal,
    holderId: workerId(holder),
    observedAtReal: canonicalObservedAtReal,
    worldId: worldId(world),
  });
  worldWriterLeaseRequests.add(request);
  return request;
}

/**
 * Applies the deterministic logical lease transition to an already-read
 * current record. The durable adapter must perform the matching operation and
 * fence check inside a database transaction; this pure helper does not make a
 * process-local lease authoritative.
 */
export function acquireWorldWriterLease(
  currentLease: WorldWriterLease | null,
  request: WorldWriterLeaseRequest,
): WorldWriterLeaseAcquisition {
  if (
    typeof request !== 'object' ||
    request === null ||
    !worldWriterLeaseRequests.has(request)
  ) {
    invalidLease('Lease acquisition requires an explicit canonical request');
  }
  if (currentLease === null) {
    return Object.freeze({
      kind: 'ACQUIRED' as const,
      lease: issueLease({
        acquiredAtReal: request.observedAtReal,
        expiresAtReal: request.expiresAtReal,
        fencingToken: '1',
        holderId: request.holderId,
        renewedAtReal: request.observedAtReal,
        worldId: request.worldId,
      }),
    });
  }

  assertTrustedLease(currentLease);
  if (currentLease.worldId !== request.worldId) {
    invalidLease('Lease request World does not match the current lease World');
  }

  if (currentLease.holderId === request.holderId) {
    if (
      operationalTimeAtOrBefore(
        currentLease.expiresAtReal,
        request.observedAtReal,
      )
    ) {
      return Object.freeze({
        kind: 'TAKEN_OVER' as const,
        lease: issueLease({
          acquiredAtReal: request.observedAtReal,
          expiresAtReal: request.expiresAtReal,
          fencingToken: nextFencingToken(currentLease.fencingToken),
          holderId: request.holderId,
          renewedAtReal: request.observedAtReal,
          worldId: request.worldId,
        }),
      });
    }
    if (
      operationalTimeBefore(request.observedAtReal, currentLease.renewedAtReal)
    ) {
      invalidLease('Lease renewal cannot move operational time backward');
    }
    if (
      operationalTimeAtOrBefore(
        request.expiresAtReal,
        currentLease.expiresAtReal,
      )
    ) {
      invalidLease('Lease renewal must extend the active expiry monotonically');
    }
    return Object.freeze({
      kind: 'RENEWED' as const,
      lease: issueLease({
        acquiredAtReal: currentLease.acquiredAtReal,
        expiresAtReal: request.expiresAtReal,
        fencingToken: currentLease.fencingToken,
        holderId: request.holderId,
        renewedAtReal: request.observedAtReal,
        worldId: request.worldId,
      }),
    });
  }

  if (
    operationalTimeBefore(request.observedAtReal, currentLease.expiresAtReal)
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.WRITER_LEASE_HELD,
      'Another Worker holds the active World writer lease',
    );
  }
  return Object.freeze({
    kind: 'TAKEN_OVER' as const,
    lease: issueLease({
      acquiredAtReal: request.observedAtReal,
      expiresAtReal: request.expiresAtReal,
      fencingToken: nextFencingToken(currentLease.fencingToken),
      holderId: request.holderId,
      renewedAtReal: request.observedAtReal,
      worldId: request.worldId,
    }),
  });
}

/**
 * Binds a command's expected optimistic WorldVersion to the current Worker
 * holder and fencing token at authoritative-transaction cutoff. V09.2 passes
 * the same tuple to its database-side transaction guard.
 */
export function createWorldWriterCommitAssertion(
  lease: WorldWriterLease,
  expectedWorldVersion: string,
): WorldWriterCommitAssertion {
  assertTrustedLease(lease);
  const assertion = Object.freeze({
    expectedWorldVersion: canonicalWorldVersion(
      expectedWorldVersion,
      'expectedWorldVersion',
    ),
    fencingToken: lease.fencingToken,
    holderId: lease.holderId,
    schemaVersion: WORLD_WRITER_COMMIT_ASSERTION_SCHEMA_VERSION,
    worldId: lease.worldId,
  });
  worldWriterCommitAssertions.add(assertion);
  return assertion;
}

/**
 * Verifies only the lease/fence/version prerequisite of an authoritative
 * commit. It deliberately performs no Event, Posting, receipt, outbox, or
 * materialization mutation; that all-or-zero economic boundary belongs to
 * V09.2.
 */
export function assertWorldWriterCanCommit(
  currentLease: WorldWriterLease,
  assertion: WorldWriterCommitAssertion,
  observedAtReal: string,
  actualWorldVersion: string,
): void {
  assertTrustedLease(currentLease);
  if (
    typeof assertion !== 'object' ||
    assertion === null ||
    !worldWriterCommitAssertions.has(assertion)
  ) {
    invalidLease('Commit requires a canonical writer assertion');
  }
  const observed = canonicalOperationalTime(observedAtReal, 'observedAtReal');
  const actual = canonicalWorldVersion(
    actualWorldVersion,
    'actualWorldVersion',
  );
  if (
    assertion.worldId !== currentLease.worldId ||
    assertion.holderId !== currentLease.holderId ||
    assertion.fencingToken !== currentLease.fencingToken
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.WRITER_FENCE_STALE,
      'Commit assertion holder or fencing token is stale',
    );
  }
  if (operationalTimeAtOrBefore(currentLease.expiresAtReal, observed)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.WRITER_LEASE_EXPIRED,
      'Expired World writer lease cannot authorize a commit',
    );
  }
  if (assertion.expectedWorldVersion !== actual) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.WORLD_VERSION_MISMATCH,
      'A valid writer lease cannot commit from a stale WorldVersion',
    );
  }
}
