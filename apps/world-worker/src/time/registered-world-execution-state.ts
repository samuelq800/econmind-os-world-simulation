/** Server-owned, database-backed manual finite control. No timer, clock
 * advancement, permission registration or environment discovery occurs here. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  createSimulationClockState,
  SimTime,
} from '@econmind/core';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import type { DurableConsumptionClock } from '../preparation/durable-command-consumption.js';

export const WORLD_EXECUTION_STATE_QUERY =
  'select * from world_v2.lock_world_command_execution_registration($1,$2,$3)';
export interface RegisteredWorldExecutionState {
  readonly schemaVersion: 'world-command-execution-registration-v1';
  readonly registrationRef: string;
  readonly worldId: string;
  readonly workerId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly modelVersion: string;
  readonly consumerRole: string;
  readonly controlMode: 'MANUAL_FINITE';
  readonly clockSourceRef: string;
  readonly clockSourceSha256: string;
  readonly controlSourceRef: string;
  readonly controlSourceSha256: string;
  readonly soleConsumerRef: string;
  readonly clockVersion: 'SIMULATION_CLOCK_V1';
  readonly simTime: string;
  readonly validFromReal: string;
  readonly validUntilReal: string;
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const refs = [
  'registrationRef',
  'worldId',
  'workerId',
  'seedId',
  'admissionRef',
  'clockSourceRef',
  'controlSourceRef',
  'soleConsumerRef',
] as const;
export function parseRegisteredWorldExecutionState(
  text: string,
): Readonly<RegisteredWorldExecutionState> {
  if (Buffer.byteLength(text) > 16384) throw Error('FORMAL_EXECUTION_BOUNDED');
  const v = JSON.parse(text) as RegisteredWorldExecutionState;
  const keys = [
    ...refs,
    'schemaVersion',
    'seedFingerprint',
    'modelVersion',
    'consumerRole',
    'controlMode',
    'clockSourceSha256',
    'controlSourceSha256',
    'clockVersion',
    'simTime',
    'validFromReal',
    'validUntilReal',
  ];
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).sort().join('|') !== keys.sort().join('|') ||
    canonicalSerialize(v) !== text ||
    v.schemaVersion !== 'world-command-execution-registration-v1' ||
    v.controlMode !== 'MANUAL_FINITE' ||
    v.clockVersion !== 'SIMULATION_CLOCK_V1' ||
    refs.some(
      (k) =>
        typeof v[k] !== 'string' || !/^[A-Z][A-Z0-9_-]{0,255}$/u.test(v[k]),
    ) ||
    !/^sha256:[a-f0-9]{64}$/u.test(v.seedFingerprint) ||
    !/^[a-f0-9]{64}$/u.test(v.clockSourceSha256) ||
    !/^[a-f0-9]{64}$/u.test(v.controlSourceSha256) ||
    typeof v.modelVersion !== 'string' ||
    !v.modelVersion ||
    !/^[a-z][a-z0-9_]{0,62}$/u.test(v.consumerRole) ||
    !['validFromReal', 'validUntilReal'].every((k) => {
      const t = v[k as 'validFromReal' | 'validUntilReal'];
      return (
        typeof t === 'string' &&
        Number.isFinite(Date.parse(t)) &&
        new Date(t).toISOString() === t
      );
    }) ||
    v.validFromReal >= v.validUntilReal
  )
    throw Error('FORMAL_EXECUTION_EXACT_ORIGINAL_REQUIRED');
  // Existing Core type/precision semantics, with no advancement or default time.
  const clock = createSimulationClockState(SimTime.fromTicks(v.simTime));
  if (clock.simTime.toCanonicalValue() !== v.simTime)
    throw Error('FORMAL_EXECUTION_CANONICAL_TIME_REQUIRED');
  return Object.freeze(v);
}
interface Entry {
  database: SqlDatabase;
  worldId: string;
  workerId: string;
  registrationRef: string;
}
const clocks = new WeakMap<object, Readonly<Entry>>();
const consumerOwners = new Map<string, object>();
export function reserveRegisteredWorldFiniteConsumer(
  clock: object,
  owner: object,
): void {
  const e = registeredWorldExecutionClockScope(clock);
  if (!e) return; // A plain callback still cannot pass the execution blocker.
  if (consumerOwners.has(e.worldId))
    throw Error('FORMAL_WORLD_FINITE_CONSUMER_ALREADY_BOUND');
  consumerOwners.set(e.worldId, owner);
}
export function releaseRegisteredWorldFiniteConsumer(
  clock: object,
  owner: object,
): void {
  const e = registeredWorldExecutionClockScope(clock);
  if (e && consumerOwners.get(e.worldId) === owner)
    consumerOwners.delete(e.worldId);
}
const databases = new WeakMap<object, object>();
export function isRegisteredWorldExecutionDatabase(
  database: object,
  clock: object,
): boolean {
  return databases.get(database) === clock;
}
export function registeredWorldExecutionClockScope(
  clock: unknown,
): Readonly<Entry> | null {
  return clock && typeof clock === 'object'
    ? (clocks.get(clock) ?? null)
    : null;
}
export async function readRegisteredWorldExecutionFrom(
  tx: SqlExecutor,
  clock: DurableConsumptionClock,
): Promise<Readonly<RegisteredWorldExecutionState>> {
  const e = registeredWorldExecutionClockScope(clock);
  if (!e) throw Error('REGISTERED_WORLD_EXECUTION_CLOCK_REQUIRED');
  const r = await tx.query<{
    registration_text: string;
    registration_sha256: string;
  }>(WORLD_EXECUTION_STATE_QUERY, [e.worldId, e.workerId, e.registrationRef]);
  const row = r.rows[0];
  if (
    r.rows.length !== 1 ||
    !row ||
    sha(row.registration_text) !== row.registration_sha256
  )
    throw Error('FORMAL_EXECUTION_ORIGINAL_MISSING_OR_CHANGED');
  const v = parseRegisteredWorldExecutionState(row.registration_text);
  if (
    v.worldId !== e.worldId ||
    v.workerId !== e.workerId ||
    v.registrationRef !== e.registrationRef
  )
    throw Error('FORMAL_EXECUTION_SCOPE_MISMATCH');
  return v;
}
/** Construction registers only a fixed DB reader. Absent/revoked durable
 * originals still reject every operation. The real-time callback measures a
 * cutoff; it cannot supply simulated time or grant execution authority. */
export function createRegisteredWorldExecutionClock(
  input: Entry,
): Readonly<DurableConsumptionClock> {
  if (
    !input.database ||
    typeof input.database.transaction !== 'function' ||
    [input.worldId, input.workerId, input.registrationRef].some(
      (v) => !/^[A-Z][A-Z0-9_-]{0,255}$/u.test(v),
    )
  )
    throw Error('FORMAL_EXECUTION_FIXED_DATABASE_SCOPE_REQUIRED');
  const clock: Readonly<DurableConsumptionClock> = Object.freeze({
    nowReal: () => new Date().toISOString(),
    async simTime(world: string) {
      if (world !== input.worldId)
        throw Error('FORMAL_EXECUTION_WORLD_MISMATCH');
      return input.database.transaction(
        async (tx) =>
          (await readRegisteredWorldExecutionFrom(tx, clock)).simTime,
      );
    },
  });
  clocks.set(clock, Object.freeze({ ...input }));
  return clock;
}
/** Every economic transaction retains the exact permit SHARE lock, rechecks
 * expiry/admission/lease before returning to COMMIT, and exposes no DML port.
 * Revocation uses UPDATE on this same row before append and therefore waits. */
export function createRegisteredWorldExecutionDatabase(
  database: SqlDatabase,
  clock: DurableConsumptionClock,
  expected: Pick<
    RegisteredWorldExecutionState,
    'seedId' | 'seedFingerprint' | 'admissionRef' | 'modelVersion'
  >,
): SqlDatabase {
  const e = registeredWorldExecutionClockScope(clock);
  if (!e || e.database !== database)
    throw Error('FORMAL_EXECUTION_DATABASE_IDENTITY_REQUIRED');
  const guarded: SqlDatabase = Object.freeze({
    query: database.query.bind(database),
    transaction<T>(operation: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      return database.transaction(async (tx) => {
        let before: Readonly<RegisteredWorldExecutionState> | undefined;
        const enter = async () => {
          before ??= await readRegisteredWorldExecutionFrom(tx, clock);
          if (
            Object.entries(expected).some(
              ([key, value]) =>
                before?.[key as keyof typeof expected] !== value,
            )
          )
            throw Error('FORMAL_EXECUTION_EXACT_ADMISSION_PINS_REQUIRED');
        };
        const scoped: SqlExecutor = {
          async query<Row extends object>(
            query: string,
            parameters?: readonly unknown[],
          ) {
            // Isolation must be chosen before any read. No business operation
            // or role switch is allowed ahead of the registration lock.
            if (!/^\s*set\s+transaction\s+/iu.test(query)) await enter();
            return tx.query<Row>(query, parameters);
          },
        };
        const result = await operation(scoped);
        await enter();
        const after = await readRegisteredWorldExecutionFrom(tx, clock);
        if (canonicalSerialize(after) !== canonicalSerialize(before))
          throw Error('FORMAL_EXECUTION_CUTOFF_CHANGED');
        return result;
      });
    },
  });
  databases.set(guarded, clock);
  return guarded;
}
