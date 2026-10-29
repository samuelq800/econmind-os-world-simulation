/** Fixed Social dependency installation only. No source registration, grants,
 * publisher invocation, lease/consumer start, listener or Clock construction. */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { worldId, workerId } from '@econmind/core';
import { PostgresSqlDatabase } from '../persistence/postgres-sql-database.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import {
  createPostwarSocialPositionRuntimeDatabase,
  createPostwarSocialPositionRuntime,
} from '../persistence/postwar-social-position-runtime.js';
import { createPostwarSocialMatchRuntime } from '../persistence/postwar-social-match-runtime.js';
import { createPostgresSocialOperatingCustody } from '../persistence/postgres-social-operating-custody.js';
import { createSocialEmploymentRuntimeSnapshotReader } from '../persistence/social-employment-runtime-snapshot-reader.js';
import {
  consumeLabourSocialOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from '../preparation/official-labour-social-opening-adoption.js';
import type { ManualOfficeRuntimeReaders } from '../preparation/manual-office-command-composition.js';
import {
  createManualOfficeIntakeRuntime,
  type ManualOfficeIntakeRuntime,
} from '../intake/manual-office-intake-runtime.js';
import type { DurableConsumptionClock } from '../preparation/durable-command-consumption.js';
import { loadPostwarSourceContext } from '../preparation/postwar-source-context.js';

export type { OfficialLabourSocialOpeningAdoption } from '../preparation/official-labour-social-opening-adoption.js';
/** Explicit offline repository source-data loader. Private adoption identity is
 * retained in this server package; the result is neither admission nor custody.
 * No env/path discovery, SQL, key, signature, grant or registration is created. */
export async function loadPostwarSocialConnectionOpeningAdoption(
  repositoryRoot: string,
): Promise<OfficialLabourSocialOpeningAdoption> {
  return (await loadPostwarSourceContext(repositoryRoot)).labourSocial;
}
export interface PostwarSocialRuntimeConnectionInput {
  readonly worldId: string;
  readonly workerId: string;
  /** Borrowed server Worker pool. This installer never ends a borrowed pool. */
  readonly workerPool: Pool;
  readonly workerRole: string;
  readonly openingAdoption: OfficialLabourSocialOpeningAdoption;
}
export interface PostwarSocialPreparedIntakeInput {
  readonly environment: 'local' | 'ci';
  readonly intakePool: Pick<Pool, 'connect'>;
  readonly clock: DurableConsumptionClock;
}
export interface PostwarSocialRuntimeConnection {
  readonly classification: 'FIXED_SOCIAL_FACTORIES_NOT_SOURCE_OR_EXECUTION_AUTHORITY';
  readonly worldId: string;
  readonly workerId: string;
  readonly database: SqlDatabase;
  readonly readers: Readonly<ManualOfficeRuntimeReaders>;
  /** Uses the existing genuinely issued local/CI runtime; stays PREPARED. No
   * production environment is relabelled as ci, no startPreparation is called. */
  createPreparedIntake(
    input: PostwarSocialPreparedIntakeInput,
  ): ManualOfficeIntakeRuntime;
  /** Stop accepting source work and join real outstanding DB transactions.
   * Closing the owned transport pools remains the server composition's job. */
  close(): Promise<void>;
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export function createPostwarSocialRuntimeConnection(
  input: PostwarSocialRuntimeConnectionInput,
): Readonly<PostwarSocialRuntimeConnection> {
  const world = worldId(input.worldId),
    holder = workerId(input.workerId);
  const workerPool = input.workerPool;
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(input.workerRole) ||
    input.workerRole.startsWith('pg_') ||
    [
      'postgres',
      'anon',
      'authenticated',
      'service_role',
      'supabase_admin',
      'supabase_auth_admin',
      'world_v2_api_reader',
      'world_v2_api_login',
      'world_v2_social_source_reader',
      'world_v2_social_source_publisher',
      'world_v2_social_source_owner',
    ].includes(input.workerRole)
  )
    throw Error('SOCIAL_CONNECTION_SCOPED_WORKER_ROLE_REQUIRED');
  if (
    typeof input.workerPool?.connect !== 'function' ||
    typeof input.workerPool.query !== 'function'
  )
    throw Error('SOCIAL_CONNECTION_WORKER_POOL_REQUIRED');
  consumeLabourSocialOpeningAdoption(input.openingAdoption);
  const base = new PostgresSqlDatabase(workerPool);
  const pending = new Set<Promise<unknown>>();
  const runtimes = new Set<ManualOfficeIntakeRuntime>();
  let closed = false,
    closing: Promise<void> | null = null;
  function track<T>(operation: () => Promise<T>): Promise<T> {
    if (closed) return Promise.reject(Error('SOCIAL_CONNECTION_RETIRED'));
    const result = Promise.resolve().then(operation);
    pending.add(result);
    void result.then(
      () => pending.delete(result),
      () => pending.delete(result),
    );
    return result;
  }
  const managed: SqlDatabase = Object.freeze({
    query: <Row extends object>(sql: string, parameters?: readonly unknown[]) =>
      track(() => base.query<Row>(sql, parameters)),
    transaction: <T>(consume: (tx: SqlExecutor) => Promise<T>) =>
      track(() => base.transaction(consume)),
  });
  const database = createPostwarSocialPositionRuntimeDatabase(managed, {
    workerRole: input.workerRole,
  });
  const position = createPostwarSocialPositionRuntime({
    database,
    workerRole: input.workerRole,
    workerId: holder,
  });
  const match = createPostwarSocialMatchRuntime({
    database,
    workerRole: input.workerRole,
    workerId: holder,
    openingAdoption: input.openingAdoption,
  });
  const snapshotReader = createSocialEmploymentRuntimeSnapshotReader({
    mode: 'OFFICIAL_RUNTIME',
    database,
    sha256Hex: sha,
    custody: createPostgresSocialOperatingCustody({ database }),
    postgresWorkerRole: input.workerRole,
  });
  const readers: Readonly<ManualOfficeRuntimeReaders> = Object.freeze({
    socialPosition: position,
    socialMatch: match,
    social: Object.freeze({
      mode: 'OFFICIAL_RUNTIME' as const,
      openingAdoption: input.openingAdoption,
      snapshotReader,
    }),
  });
  return Object.freeze({
    classification:
      'FIXED_SOCIAL_FACTORIES_NOT_SOURCE_OR_EXECUTION_AUTHORITY' as const,
    worldId: world,
    workerId: holder,
    database,
    readers,
    createPreparedIntake(
      configuration: PostwarSocialPreparedIntakeInput,
    ): ManualOfficeIntakeRuntime {
      if (closed || closing) throw Error('SOCIAL_CONNECTION_RETIRED');
      if (!['local', 'ci'].includes(configuration.environment))
        throw Error('SOCIAL_PRODUCTION_CONSUMER_NOT_INSTALLED');
      if (configuration.intakePool === workerPool)
        throw Error('SOCIAL_CONNECTION_SEPARATE_INTAKE_REQUIRED');
      const runtime = createManualOfficeIntakeRuntime({
        intakePool: configuration.intakePool,
        workerDatabase: database,
        worldId: world,
        workerId: holder,
        clock: configuration.clock,
        sha256Hex: sha,
        environment: Object.freeze({ ECONMIND_ENV: configuration.environment }),
        readers,
      });
      runtimes.add(runtime);
      return runtime;
    },
    close(): Promise<void> {
      if (closing) return closing;
      // Stop consumers before rejecting DB work needed to finish their active
      // step. No pending promise is mistaken for a completed rollback/commit.
      closing = (async () => {
        await Promise.all([...runtimes].map((r) => r.consumer.stop()));
        closed = true;
        while (pending.size) await Promise.allSettled([...pending]);
      })();
      return closing;
    },
  });
}
