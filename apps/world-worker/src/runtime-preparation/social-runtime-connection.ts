import {
  readFinanceSocialSourceBinding,
  type FinanceSocialSourceBinding,
} from './finance-social-runtime-connection.js';
import {
  createPostwarSocialSourcePreparation,
  isPreparedPostwarSocialSource,
  retirePreparedPostwarSocialSource,
  type PreparedPostwarSocialSource,
  preparePostwarSocialSource,
  type PostwarSocialSourcePreparationInput,
} from '../persistence/prepared-postwar-social-source.js';
export type { PostwarSocialSourcePreparationInput } from '../persistence/prepared-postwar-social-source.js';
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
import { createSocialIntakeAuthorizationPool } from '../persistence/social-intake-authorization.js';
export { createSocialIntakeAuthorizationPool } from '../persistence/social-intake-authorization.js';

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
  prepare(input: PostwarSocialSourcePreparationInput): Promise<void>;
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
  const openingScope = consumeLabourSocialOpeningAdoption(
    input.openingAdoption,
  );
  const base = new PostgresSqlDatabase(workerPool);
  const pending = new Set<Promise<unknown>>();
  const runtimes = new Set<ManualOfficeIntakeRuntime>();
  const ownership: { shared: FinanceSocialSourceBinding | null } = {
    shared: null,
  };
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
  const preparedSource = createPostwarSocialSourcePreparation();
  const position = createPostwarSocialPositionRuntime({
    preparedSource,
    database,
    workerRole: input.workerRole,
    workerId: holder,
  });
  const match = createPostwarSocialMatchRuntime({
    preparedSource,
    database,
    workerRole: input.workerRole,
    workerId: holder,
    openingAdoption: input.openingAdoption,
  });
  const snapshotReader = createSocialEmploymentRuntimeSnapshotReader({
    mode: 'OFFICIAL_RUNTIME',
    preparedSource,
    database,
    sha256Hex: sha,
    custody: createPostgresSocialOperatingCustody({ database, preparedSource }),
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
  const connection: Readonly<PostwarSocialRuntimeConnection> = Object.freeze({
    classification:
      'FIXED_SOCIAL_FACTORIES_NOT_SOURCE_OR_EXECUTION_AUTHORITY' as const,
    worldId: world,
    workerId: holder,
    database,
    readers,
    prepare(configuration: PostwarSocialSourcePreparationInput): Promise<void> {
      if (closed || closing)
        return Promise.reject(Error('SOCIAL_CONNECTION_RETIRED'));
      if (configuration.admittedWorldPins.worldId !== world)
        return Promise.reject(
          Error('SOCIAL_CONNECTION_PREPARATION_WORLD_MISMATCH'),
        );
      return track(() =>
        preparePostwarSocialSource({
          preparation: preparedSource,
          database,
          workerRole: input.workerRole,
          countryIds: openingScope.countryIds,
          configuration,
        }),
      );
    },
    createPreparedIntake(
      configuration: PostwarSocialPreparedIntakeInput,
    ): ManualOfficeIntakeRuntime {
      if (closed || closing) throw Error('SOCIAL_CONNECTION_RETIRED');
      if (ownership.shared)
        throw Error('SOCIAL_CONNECTION_SHARED_CONSUMER_ALREADY_BOUND');
      if (!['local', 'ci'].includes(configuration.environment))
        throw Error('SOCIAL_PRODUCTION_CONSUMER_NOT_INSTALLED');
      if (
        configuration.intakePool === workerPool ||
        configuration.intakePool ===
          createSocialIntakeAuthorizationPool(workerPool)
      )
        throw Error('SOCIAL_CONNECTION_SEPARATE_INTAKE_REQUIRED');
      const runtime = createManualOfficeIntakeRuntime({
        intakePool: createSocialIntakeAuthorizationPool(
          configuration.intakePool,
        ),
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
      if (ownership.shared)
        return Promise.reject(
          Error('SOCIAL_SHARED_CONSUMER_OWNER_MUST_STOP_FIRST'),
        );
      // Stop consumers before rejecting DB work needed to finish their active
      // step. No pending promise is mistaken for a completed rollback/commit.
      closing = (async () => {
        await Promise.all([...runtimes].map((r) => r.consumer.stop()));
        closed = true;
        while (pending.size) await Promise.allSettled([...pending]);
        retirePreparedPostwarSocialSource(preparedSource);
        issuedConnections.delete(connection);
      })();
      return closing;
    },
  });
  issuedConnections.set(connection, {
    source: preparedSource,
    world,
    workerPool,
    runtimes,
    ownership,
    countryIds: Object.freeze([...openingScope.countryIds]),
  });
  return connection;
}
const issuedConnections = new WeakMap<
  object,
  {
    source: PreparedPostwarSocialSource;
    world: string;
    workerPool: Pool;
    runtimes: Set<ManualOfficeIntakeRuntime>;
    ownership: { shared: FinanceSocialSourceBinding | null };
    countryIds: readonly string[];
  }
>();
/** Only this fixed instance's actual completed DATA preparation is recognized.
 * A copy/wrapper, same-shaped object or caller flag cannot replace the instance;
 * true does not admit a source or authorize an operation. */
export function isPreparedPostwarSocialRuntimeConnection(
  value: unknown,
  world: string,
): value is Readonly<PostwarSocialRuntimeConnection> {
  if (value === null || typeof value !== 'object') return false;
  const binding = issuedConnections.get(value);
  return (
    binding !== undefined &&
    binding.world === world &&
    isPreparedPostwarSocialSource(binding.source, world)
  );
}

export function isPostwarSocialRuntimeConnection(
  value: unknown,
  world: string,
): value is Readonly<PostwarSocialRuntimeConnection> {
  return (
    value !== null &&
    typeof value === 'object' &&
    issuedConnections.has(value) &&
    issuedConnections.get(value)!.world === world
  );
}

/** Server-only transport ownership metadata, not credentials or source facts. */
export function readPostwarSocialRuntimeConnectionResources(
  value: Readonly<PostwarSocialRuntimeConnection>,
): Readonly<{ workerPool: Pool; countryIds: readonly string[] }> {
  const data = issuedConnections.get(value);
  if (!data) throw Error('GENUINE_SOCIAL_RUNTIME_CONNECTION_REQUIRED');
  return Object.freeze({
    workerPool: data.workerPool,
    countryIds: data.countryIds,
  });
}
export function reservePostwarSocialRuntimeForSharedConsumer(
  value: Readonly<PostwarSocialRuntimeConnection>,
  binding: FinanceSocialSourceBinding,
): void {
  const data = issuedConnections.get(value),
    deps = readFinanceSocialSourceBinding(binding);
  if (
    !data ||
    deps.socialConnection !== value ||
    deps.worldId !== data.world ||
    deps.workerId !== value.workerId ||
    deps.workerPool !== data.workerPool ||
    deps.rawIntakePool === data.workerPool
  )
    throw Error('EXACT_SHARED_SOCIAL_SOURCE_SCOPE_REQUIRED');
  if (data.runtimes.size || data.ownership.shared)
    throw Error('SOCIAL_SOURCE_CONSUMER_ALREADY_BOUND');
  data.ownership.shared = binding;
}
export function releasePostwarSocialRuntimeForSharedConsumer(
  value: Readonly<PostwarSocialRuntimeConnection>,
  binding: FinanceSocialSourceBinding,
): void {
  const data = issuedConnections.get(value);
  if (!data || data.ownership.shared !== binding)
    throw Error('EXACT_SHARED_SOCIAL_OWNER_REQUIRED');
  data.ownership.shared = null;
}
