import {
  createWorldWriterCommitAssertion,
  parseWorldWriterLease,
  workerId,
  worldId,
  type WorldWriterCommitAssertion,
  type WorldWriterLease,
} from '@econmind/core';

import { PostgresTransactionError } from '../persistence/postgres-sql-database.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';

export type WriterLeaseSupervisorPhase =
  | 'IDLE'
  | 'ACQUIRING'
  | 'ACTIVE'
  | 'RENEWING'
  | 'CHECKING'
  | 'DRAINING'
  | 'DRAINED'
  | 'STOPPED'
  | 'LOST'
  | 'UNKNOWN';

export class WriterLeaseSupervisorError extends Error {
  constructor(
    readonly code: string,
    readonly outcome: 'NOT_STARTED' | 'REJECTED' | 'UNKNOWN',
    cause?: unknown,
  ) {
    super(`Writer lease supervisor: ${code} (${outcome})`, { cause });
    this.name = 'WriterLeaseSupervisorError';
  }
}

function fail(code: string): never {
  throw new WriterLeaseSupervisorError(code, 'NOT_STARTED');
}
const MAX_BIGINT = 9223372036854775807n;
function integer(value: string): string {
  if (
    typeof value !== 'string' ||
    !/^(?:0|[1-9]\d*)$/u.test(value) ||
    value.length > 19 ||
    BigInt(value) > MAX_BIGINT
  )
    fail('INTEGER_INVALID');
  return value;
}
function timestamp(value: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    fail('TIMESTAMP_INVALID');
  return value;
}

const columns = `world_id, holder_id, fencing_token::text,
  to_char(acquired_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as acquired_at_real,
  to_char(renewed_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as renewed_at_real,
  to_char(lease_expires_at_real at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as lease_expires_at_real,
  (acquired_at_real=date_trunc('milliseconds',acquired_at_real)
   and renewed_at_real=date_trunc('milliseconds',renewed_at_real)
   and lease_expires_at_real=date_trunc('milliseconds',lease_expires_at_real)) as aligned`;

interface LeaseRow {
  world_id: string;
  holder_id: string;
  fencing_token: string;
  acquired_at_real: string;
  renewed_at_real: string;
  lease_expires_at_real: string;
  aligned: boolean;
  acquisition_kind?: string;
}

/** Server-owned SQL port only. No listener, timer, admission, consumer, grants,
 * economic mutation or ambient clock. The caller must assign a UNIQUE holder
 * identity per live instance. Confirmed local liveness is advisory, never a
 * substitute for the atomic repository's in-transaction SQL commit guard. */
export function createWriterLeaseSupervisor(input: {
  readonly database: SqlDatabase;
  readonly role: string;
  readonly worldId: string;
  readonly workerId: string;
  /** Explicit operational duration, 1..2147483647 milliseconds; no default. */
  readonly leaseDurationMilliseconds: string;
}) {
  const world = worldId(input.worldId);
  const holder = workerId(input.workerId);
  const role = input.role;
  if (
    typeof role !== 'string' ||
    !/^[a-z][a-z0-9_]{0,62}$/u.test(role) ||
    /^(?:pg_|supabase_)/u.test(role) ||
    ['postgres', 'anon', 'authenticated', 'service_role'].includes(role)
  )
    fail('SCOPED_ROLE_REQUIRED');
  const duration = integer(input.leaseDurationMilliseconds);
  if (duration === '0' || BigInt(duration) > 2147483647n)
    fail('DURATION_INVALID');
  if (typeof input.database?.transaction !== 'function')
    fail('DATABASE_PORT_REQUIRED');
  // Capture the port without freezing or mutating a borrowed database object.
  const transaction = input.database.transaction.bind(input.database);
  let phase: WriterLeaseSupervisorPhase = 'IDLE';
  let failure: 'LOST' | 'UNKNOWN' | null = null;
  let accepting = true;
  let confirmed: WorldWriterLease | null = null;
  let active: Promise<unknown> | null = null;
  let draining: Promise<void> | null = null;
  let stopping: Promise<void> | null = null;

  async function bind(sql: SqlExecutor): Promise<void> {
    const result = await sql.query<Record<string, unknown>>(`
      select current_user as role_name, session_user as session_role,
        r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication,
        current_setting('transaction_read_only') as read_only,
        has_schema_privilege(current_user,'world_v2','CREATE') as schema_creator,
        (has_table_privilege(current_user,'world_v2.world_writer_lease','SELECT')
         and has_table_privilege(current_user,'world_v2.world_writer_lease','INSERT')
         and has_table_privilege(current_user,'world_v2.world_writer_lease','UPDATE')) as lease_access,
        has_table_privilege(current_user,'world_v2.world_writer_lease','DELETE,TRUNCATE') as lease_delete,
        (has_table_privilege(current_user,'world_v2.world_head','SELECT')
         and has_table_privilege(current_user,'world_v2.world_head','UPDATE')) as head_access,
        has_function_privilege(current_user,'world_v2.acquire_world_writer_lease(text,text,timestamptz,bigint)','EXECUTE') as acquire_access,
        has_function_privilege(current_user,'world_v2.assert_world_writer_commit_guard(text,text,bigint,bigint,timestamptz)','EXECUTE') as guard_access
      from pg_roles r where r.rolname=current_user`);
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      !row ||
      row.role_name !== role ||
      row.session_role !== role ||
      row.read_only !== 'off' ||
      [
        'rolsuper',
        'rolbypassrls',
        'rolcreatedb',
        'rolcreaterole',
        'rolreplication',
        'schema_creator',
        'lease_delete',
      ].some((key) => row[key] !== false) ||
      ['lease_access', 'head_access', 'acquire_access', 'guard_access'].some(
        (key) => row[key] !== true,
      )
    )
      fail('DATABASE_ROLE_DENIED');
    const head = await sql.query<{ world_id: string }>(
      'select world_id from world_v2.world_head where world_id=$1',
      [world],
    );
    if (head.rows.length !== 1 || head.rows[0]?.world_id !== world)
      fail('WORLD_HEAD_MISSING');
  }

  function lease(row: LeaseRow | undefined): WorldWriterLease {
    if (!row || row.aligned !== true) fail('LEASE_ROW_INVALID');
    const value = parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: row.world_id,
      holderId: row.holder_id,
      fencingToken: row.fencing_token,
      acquiredAtReal: timestamp(row.acquired_at_real),
      renewedAtReal: timestamp(row.renewed_at_real),
      expiresAtReal: timestamp(row.lease_expires_at_real),
    });
    if (value.worldId !== world || value.holderId !== holder)
      fail('LEASE_BINDING_MISMATCH');
    return value;
  }

  function lose(code: string): never {
    failure = 'LOST';
    accepting = false;
    phase = 'LOST';
    fail(code);
  }

  function current(at: string): WorldWriterLease {
    if (failure !== null || !accepting) fail('SUPERVISOR_CLOSED');
    if (active !== null) fail('OPERATION_IN_FLIGHT');
    if (phase !== 'ACTIVE' || confirmed === null) fail('LEASE_NOT_ACTIVE');
    if (at < confirmed.renewedAtReal) lose('OBSERVATION_MOVED_BACKWARD');
    if (at >= confirmed.expiresAtReal) lose('LEASE_EXPIRED');
    return confirmed;
  }

  function run<T>(
    busy: 'ACQUIRING' | 'RENEWING' | 'CHECKING',
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!accepting || failure !== null) fail('SUPERVISOR_CLOSED');
    if (active !== null) fail('OPERATION_IN_FLIGHT');
    phase = busy;
    const running = Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          phase = accepting ? 'ACTIVE' : 'DRAINING';
          return value;
        },
        (cause: unknown) => {
          const rejected =
            cause instanceof PostgresTransactionError &&
            cause.outcome === 'ROLLED_BACK';
          failure = rejected ? 'LOST' : 'UNKNOWN';
          accepting = false;
          phase = failure;
          throw new WriterLeaseSupervisorError(
            rejected ? 'DATABASE_REJECTED' : 'DATABASE_OUTCOME_UNKNOWN',
            rejected ? 'REJECTED' : 'UNKNOWN',
            cause,
          );
        },
      );
    active = running;
    // Both branches resolve: no detached rejected finally() promise.
    void running.then(
      () => {
        active = null;
      },
      () => {
        active = null;
      },
    );
    return running;
  }

  function expiryFor(at: string): string {
    const expiry = new Date(Date.parse(at) + Number(duration)).toISOString();
    return timestamp(expiry);
  }

  async function change(
    at: string,
    expiry: string,
    prior: WorldWriterLease | null,
  ) {
    const next = await transaction(async (sql) => {
      await bind(sql);
      if (prior !== null) {
        const locked = await sql.query<LeaseRow>(
          `select ${columns} from world_v2.world_writer_lease where world_id=$1 for update`,
          [world],
        );
        const observed = lease(locked.rows[0]);
        if (
          locked.rows.length !== 1 ||
          observed.fencingToken !== prior.fencingToken ||
          observed.acquiredAtReal !== prior.acquiredAtReal ||
          observed.renewedAtReal !== prior.renewedAtReal ||
          observed.expiresAtReal !== prior.expiresAtReal ||
          at >= observed.expiresAtReal
        )
          fail('LEASE_GENERATION_CHANGED');
      }
      const result = await sql.query<LeaseRow>(
        `select ${columns}, acquisition_kind from world_v2.acquire_world_writer_lease($1,$2,$3::timestamptz,$4::bigint)`,
        [world, holder, at, duration],
      );
      const row = result.rows[0];
      const value = lease(row);
      if (
        result.rows.length !== 1 ||
        value.renewedAtReal !== at ||
        value.expiresAtReal !== expiry ||
        (prior === null
          ? !['ACQUIRED', 'TAKEN_OVER'].includes(row?.acquisition_kind ?? '') ||
            value.acquiredAtReal !== at ||
            (row?.acquisition_kind === 'ACQUIRED'
              ? value.fencingToken !== '1'
              : BigInt(value.fencingToken) <= 1n)
          : row?.acquisition_kind !== 'RENEWED' ||
            value.fencingToken !== prior.fencingToken ||
            value.acquiredAtReal !== prior.acquiredAtReal ||
            value.expiresAtReal <= prior.expiresAtReal)
      )
        fail('LEASE_TRANSITION_INVALID');
      await bind(sql);
      return value;
    });
    // Publish only after confirmed COMMIT. UNKNOWN never installs a new lease.
    confirmed = next;
    return next;
  }

  function drain(): Promise<void> {
    accepting = false;
    if (draining !== null) return draining;
    if (phase !== 'STOPPED') phase = 'DRAINING';
    const pending = active;
    draining = (async () => {
      if (pending !== null) await pending.catch(() => undefined);
      if (phase !== 'STOPPED') phase = failure ?? 'DRAINED';
    })();
    return draining;
  }

  return Object.freeze({
    acquire(observedAtReal: string): Promise<WorldWriterLease> {
      const at = timestamp(observedAtReal);
      const expiry = expiryFor(at);
      if (phase !== 'IDLE') fail('ACQUIRE_REQUIRES_IDLE');
      return run('ACQUIRING', () => change(at, expiry, null));
    },
    renew(observedAtReal: string): Promise<WorldWriterLease> {
      const at = timestamp(observedAtReal);
      const expiry = expiryFor(at);
      const prior = current(at);
      if (at <= prior.renewedAtReal) fail('RENEWAL_MUST_ADVANCE');
      return run('RENEWING', () => change(at, expiry, prior));
    },
    /** A real SQL fence/version check, NOT an economic commit reservation.
     * AtomicTransitionRepository must still recheck inside its own transaction. */
    assertCanCommit(input: {
      readonly observedAtReal: string;
      readonly expectedWorldVersion: string;
    }): Promise<WorldWriterCommitAssertion> {
      const at = timestamp(input.observedAtReal);
      const prior = current(at);
      const assertion = createWorldWriterCommitAssertion(
        prior,
        integer(input.expectedWorldVersion),
      );
      return run('CHECKING', async () => {
        await transaction(async (sql) => {
          await bind(sql);
          const result = await sql.query<{
            world_version: string;
            event_sequence: string;
          }>(
            `select world_version::text,event_sequence::text from world_v2.assert_world_writer_commit_guard($1,$2,$3::bigint,$4::bigint,$5::timestamptz)`,
            [
              world,
              holder,
              assertion.fencingToken,
              assertion.expectedWorldVersion,
              at,
            ],
          );
          if (
            result.rows.length !== 1 ||
            result.rows[0]?.world_version !== assertion.expectedWorldVersion
          )
            fail('COMMIT_GUARD_INVALID');
          integer(result.rows[0].event_sequence);
          await bind(sql);
        });
        return assertion;
      });
    },
    /** Explicit observation only; cannot detect a remote change without SQL. */
    status(observedAtReal: string) {
      const at = timestamp(observedAtReal);
      if (
        accepting &&
        phase === 'ACTIVE' &&
        confirmed !== null &&
        (at < confirmed.renewedAtReal || at >= confirmed.expiresAtReal)
      ) {
        failure = 'LOST';
        accepting = false;
        phase = 'LOST';
      }
      return Object.freeze({
        phase,
        failure,
        ready: accepting && phase === 'ACTIVE' && failure === null,
        lastConfirmedLease: confirmed,
      });
    },
    drain,
    stop(): Promise<void> {
      stopping ??= drain().then(() => {
        phase = 'STOPPED';
      });
      return stopping;
    },
  });
}
