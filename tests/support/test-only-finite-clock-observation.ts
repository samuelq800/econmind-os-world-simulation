/** Explicit TEST_ONLY observation bridge. It never starts a service, chooses a
 * target SimTime, changes permissions, or exports a positive production Clock.
 * SQL samples PostgreSQL real time and stores the immutable observation; Core
 * alone derives the proposed next time. An UNKNOWN transaction is recovered,
 * never automatically repeated. Call only on an authorized fresh H6 clone. */
import { createHash } from 'node:crypto';
import {
  advanceClockInput,
  advanceSimulationClock,
  canonicalSerialize,
  createSimulationClockState,
  SimTime,
} from '@econmind/core';
import {
  parseRegisteredWorldExecutionState,
  type RegisteredWorldExecutionState,
} from '../../apps/world-worker/src/time/registered-world-execution-state.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
export interface FiniteClockScope {
  readonly worldId: string;
  readonly workerId: string;
  readonly oldRegistrationRef: string;
  readonly fencingToken: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly observationRef: string;
}
interface Observation {
  readonly schemaVersion: 'test-only-finite-clock-observation-v1';
  readonly classification: 'TEST_ONLY_ACTUAL_POSTGRES_OBSERVATION_NOT_PRODUCTION';
  readonly worldId: string;
  readonly workerId: string;
  readonly fencingToken: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
  readonly observationRef: string;
  readonly clockVersion: 'SIMULATION_CLOCK_V1';
  readonly startedRealMilliseconds: string;
  readonly finishedRealMilliseconds: string;
  readonly activeRealMilliseconds: string;
  readonly previousRegistrationText: string;
  readonly previousClockText: string;
  readonly previousControlText: string;
}
const integer = (v: unknown): bigint => {
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]{0,18})$/u.test(v))
    throw Error('FINITE_CLOCK_CANONICAL_INTEGER_REQUIRED');
  return BigInt(v);
};
function scope(s: FiniteClockScope) {
  for (const v of [s.worldId, s.workerId, s.oldRegistrationRef])
    if (!/^[A-Z][A-Z0-9_-]{0,255}$/u.test(v))
      throw Error('FINITE_CLOCK_EXACT_SCOPE_REQUIRED');
  if (!/^CLOCK_OBSERVATION_[A-F0-9]{32}$/u.test(s.observationRef))
    throw Error('FINITE_CLOCK_OBSERVATION_REFERENCE_REQUIRED');
  if (integer(s.fencingToken) === 0n)
    throw Error('FINITE_CLOCK_POSITIVE_FENCE_REQUIRED');
  integer(s.worldVersion);
  integer(s.eventSequence);
}
export function prepareTestOnlyFiniteClockPublication(input: {
  readonly scope: FiniteClockScope;
  readonly observationText: string;
  readonly observationSha256: string;
}) {
  scope(input.scope);
  if (
    Buffer.byteLength(input.observationText) > 65536 ||
    sha(input.observationText) !== input.observationSha256
  )
    throw Error('FINITE_CLOCK_EXACT_OBSERVATION_BYTES_REQUIRED');
  const o = JSON.parse(input.observationText) as Observation;
  if (
    !o ||
    o.schemaVersion !== 'test-only-finite-clock-observation-v1' ||
    o.classification !==
      'TEST_ONLY_ACTUAL_POSTGRES_OBSERVATION_NOT_PRODUCTION' ||
    o.clockVersion !== 'SIMULATION_CLOCK_V1' ||
    Object.keys(o).length !== 15 ||
    [
      'worldId',
      'workerId',
      'fencingToken',
      'worldVersion',
      'eventSequence',
      'observationRef',
    ].some(
      (k) =>
        o[k as keyof Observation] !== input.scope[k as keyof FiniteClockScope],
    )
  )
    throw Error('FINITE_CLOCK_OBSERVATION_SCOPE_MISMATCH');
  const elapsed =
    integer(o.finishedRealMilliseconds) - integer(o.startedRealMilliseconds);
  if (
    elapsed < 120n ||
    elapsed > 5000n ||
    integer(o.activeRealMilliseconds) !== elapsed
  )
    throw Error('FINITE_CLOCK_REAL_INTERVAL_OUT_OF_BOUND');
  const previous = parseRegisteredWorldExecutionState(
    o.previousRegistrationText,
  );
  if (
    previous.registrationRef !== input.scope.oldRegistrationRef ||
    previous.worldId !== o.worldId ||
    previous.workerId !== o.workerId ||
    sha(o.previousClockText) !== previous.clockSourceSha256 ||
    sha(o.previousControlText) !== previous.controlSourceSha256
  )
    throw Error('FINITE_CLOCK_PREDECESSOR_MISMATCH');
  const oldClock = JSON.parse(o.previousClockText) as Record<string, unknown>;
  if (
    oldClock.simTime !== previous.simTime ||
    oldClock.worldId !== previous.worldId ||
    oldClock.seedFingerprint !== previous.seedFingerprint ||
    oldClock.sourceRef !== previous.clockSourceRef ||
    oldClock.clockVersion !== 'SIMULATION_CLOCK_V1'
  )
    throw Error('FINITE_CLOCK_PREDECESSOR_CLOCK_MISMATCH');
  const next = advanceSimulationClock(
    createSimulationClockState(SimTime.fromTicks(previous.simTime)),
    advanceClockInput(elapsed.toString()),
  ).simTime.toCanonicalValue();
  if (BigInt(next) > 86400000n) throw Error('FINITE_CLOCK_FIRST_DAY_BOUND');
  const clockText = canonicalSerialize({
    ...oldClock,
    sourceRef: o.observationRef,
    simTime: next,
    issuerRef: 'TEST_ONLY_POSTGRES_REAL_OBSERVATION',
    provenanceRef:
      'TEST_ONLY_OBSERVATION_SHA256_' + input.observationSha256.toUpperCase(),
  });
  const registrationText = canonicalSerialize({
    ...previous,
    registrationRef: 'EXECUTION_OBSERVED_' + o.observationRef.slice(18),
    clockSourceRef: o.observationRef,
    clockSourceSha256: sha(clockText),
    simTime: next,
  });
  const registration = parseRegisteredWorldExecutionState(registrationText);
  return Object.freeze({
    classification: 'TEST_ONLY_FINITE_CORE_RESULT_NOT_YET_PUBLISHED' as const,
    observationText: input.observationText,
    observationSha256: input.observationSha256,
    registration,
    registrationText,
    registrationSha256: sha(registrationText),
    clockText,
    activeRealMilliseconds: elapsed.toString(),
  });
}
/** The database must use the existing restricted release session, and must not
 * retry transaction callbacks. No supplied callback can override SQL checks. */
export function createTestOnlyFiniteClockObservationBridge(
  database: SqlDatabase,
  s: FiniteClockScope,
) {
  scope(s);
  const fixed = Object.freeze({ ...s });
  return Object.freeze({
    async observe() {
      return database.transaction(async (tx) => {
        await tx.query('set local role world_v2_admission_release');
        const result = await tx.query<{
          observation_text: string;
          observation_sha256: string;
        }>(
          'select * from world_v2.observe_test_only_finite_clock($1,$2,$3,$4::bigint,$5::bigint,$6::bigint,$7)',
          [
            fixed.worldId,
            fixed.oldRegistrationRef,
            fixed.workerId,
            fixed.fencingToken,
            fixed.worldVersion,
            fixed.eventSequence,
            fixed.observationRef,
          ],
        );
        if (result.rows.length !== 1)
          throw Error('FINITE_CLOCK_OBSERVATION_CARDINALITY');
        const row = result.rows[0]!;
        return prepareTestOnlyFiniteClockPublication({
          scope: fixed,
          observationText: row.observation_text,
          observationSha256: row.observation_sha256,
        });
      });
    },
    async publish(p: ReturnType<typeof prepareTestOnlyFiniteClockPublication>) {
      // Recompute all bindings; callers cannot smuggle altered time/registration.
      const exact = prepareTestOnlyFiniteClockPublication({
        scope: fixed,
        observationText: p.observationText,
        observationSha256: p.observationSha256,
      });
      if (canonicalSerialize(exact) !== canonicalSerialize(p))
        throw Error('FINITE_CLOCK_PUBLICATION_CHANGED');
      return database.transaction(async (tx) => {
        await tx.query('set local role world_v2_admission_release');
        const r = await tx.query<{ registration_text: string }>(
          'select world_v2.publish_test_only_finite_clock($1,$2,$3,$4,$5) as registration_text',
          [
            fixed.worldId,
            fixed.observationRef,
            exact.registrationText,
            exact.registrationSha256,
            exact.clockText,
          ],
        );
        if (
          r.rows.length !== 1 ||
          r.rows[0]!.registration_text !== exact.registrationText
        )
          throw Error('FINITE_CLOCK_PUBLISH_ACK_MISMATCH');
        return exact.registration;
      });
    },
    async recover(): Promise<
      | Readonly<{ status: 'NOT_RECORDED' }>
      | Readonly<{
          status: 'OBSERVED' | 'PUBLISHED';
          publication: ReturnType<typeof prepareTestOnlyFiniteClockPublication>;
          registration: Readonly<RegisteredWorldExecutionState> | null;
        }>
    > {
      return database.transaction(async (tx) => {
        await tx.query('set local role world_v2_admission_release');
        const r = await tx.query<{
          observation_text: string;
          observation_sha256: string;
          published_registration_text: string | null;
        }>('select * from world_v2.recover_test_only_finite_clock($1,$2)', [
          fixed.worldId,
          fixed.observationRef,
        ]);
        if (!r.rows.length)
          return Object.freeze({ status: 'NOT_RECORDED' as const });
        if (r.rows.length !== 1)
          throw Error('FINITE_CLOCK_RECOVERY_CARDINALITY');
        const row = r.rows[0]!;
        const publication = prepareTestOnlyFiniteClockPublication({
          scope: fixed,
          observationText: row.observation_text,
          observationSha256: row.observation_sha256,
        });
        if (
          row.published_registration_text !== null &&
          row.published_registration_text !== publication.registrationText
        )
          throw Error('FINITE_CLOCK_RECOVERY_BYTES_MISMATCH');
        return Object.freeze({
          status:
            row.published_registration_text === null
              ? ('OBSERVED' as const)
              : ('PUBLISHED' as const),
          publication,
          registration:
            row.published_registration_text === null
              ? null
              : publication.registration,
        });
      });
    },
  });
}
