import { createManualOfficeAuthorizationTransactionDatabase } from '../persistence/manual-office-authorization-transaction-scope.js';
/** Fixed local/CI single-World consumer composition. Source ports and SQL
 * currentness remain mandatory; this binding is not admission or activation. */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  createPostgresFinanceBudgetNativeRuntime,
  createFinanceBudgetAuthorizationDatabase,
} from '../persistence/postgres-finance-budget-custody.js';
import { createFinanceBudgetIntakeAuthorizationPool } from '../persistence/finance-budget-intake-authorization.js';
import {
  createPostwarDayOneFxAuthorizationDatabase,
  createPostwarDayOneFxIntakeAuthorizationPool,
} from '../persistence/postgres-postwar-day-one-fx-originals.js';
import {
  createPostwarDayOneFxRuntime,
  type PostwarDayOneFxRuntime,
  type PostwarDayOneFxPreparationInput,
} from '../persistence/postwar-day-one-fx-runtime.js';
import {
  isPostgresFinanceBudgetWorldCapacitySource,
  bindPostgresFinanceBudgetCapacitySourceToSocialReplay,
  readPostgresFinanceBudgetCapacitySourceScope,
  type PostgresFinanceBudgetCapacitySource,
} from '../persistence/postgres-finance-budget-capacity-source.js';
import { createBoundedFinanceSocialIntakeRuntime } from '../intake/prepared-finance-budget-intake-runtime.js';
import type { ManualOfficeIntakeRuntime } from '../intake/manual-office-intake-runtime.js';
import type { ManualOfficeRuntimeReaders } from '../preparation/manual-office-command-composition.js';
import type {
  DurableConsumptionClock,
  DurableConsumptionStep,
} from '../preparation/durable-command-consumption.js';
import type { SqlDatabase } from '../persistence/sql-database.js';
import {
  createSocialIntakeAuthorizationPool,
  isPostwarSocialRuntimeConnection,
  isPreparedPostwarSocialRuntimeConnection,
  readPostwarSocialRuntimeConnectionResources,
  reservePostwarSocialRuntimeForSharedConsumer,
  releasePostwarSocialRuntimeForSharedConsumer,
  type PostwarSocialRuntimeConnection,
  type PostwarSocialSourcePreparationInput,
} from './social-runtime-connection.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
declare const sourceBinding: unique symbol;
export interface FinanceSocialSourceBinding {
  readonly [sourceBinding]: true;
}
export interface FinanceSocialSourceDependencies {
  readonly worldId: string;
  readonly workerId: string;
  readonly database: SqlDatabase;
  readonly intakePool: Pick<Pool, 'connect'>;
  readonly rawIntakePool: Pick<Pool, 'connect'>;
  readonly workerPool: Pool;
  readonly clock: DurableConsumptionClock;
  readonly environment: NodeJS.ProcessEnv;
  readonly sha256Hex: (input: string) => string;
  readonly readers: Readonly<ManualOfficeRuntimeReaders>;
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
}
const sources = new WeakMap<
  FinanceSocialSourceBinding,
  Readonly<FinanceSocialSourceDependencies>
>();
export function readFinanceSocialSourceBinding(
  value: FinanceSocialSourceBinding,
): Readonly<FinanceSocialSourceDependencies> {
  const data = sources.get(value);
  if (!data) throw Error('GENUINE_FINANCE_SOCIAL_SOURCE_BINDING_REQUIRED');
  return data;
}
export interface PostwarFinanceSocialRuntimeConnectionInput {
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  readonly capacitySource: PostgresFinanceBudgetCapacitySource;
  readonly intakePool: Pick<Pool, 'connect'>;
  readonly clock: DurableConsumptionClock;
  readonly environment: 'local' | 'ci';
  /** Explicit installation of the fixed source only, never another consumer. */
  readonly treasuryFx?: { readonly workerRole: string };
}
export interface PostwarFinanceSocialRuntimePorts {
  readonly worldId: string;
  readonly workerId: string;
  readonly database: SqlDatabase;
  readonly intakePool: Pick<Pool, 'connect'>;
  readonly rawIntakePool: Pick<Pool, 'connect'>;
  readonly workerPool: Pool;
  readonly clock: DurableConsumptionClock;
  readonly environment: 'local' | 'ci';
  readonly runtime: ManualOfficeIntakeRuntime;
  readonly budget: NonNullable<ManualOfficeRuntimeReaders['financeBudget']>;
  readonly treasuryFx: PostwarDayOneFxRuntime | null;
  readonly socialConnection: Readonly<PostwarSocialRuntimeConnection>;
  readonly financeCountryIds: readonly string[];
}
export interface PostwarFinanceSocialRuntimeConnection {
  readonly worldId: string;
  readonly workerId: string;
  prepare(
    input: PostwarSocialSourcePreparationInput,
    fxOpening?: PostwarDayOneFxPreparationInput,
  ): Promise<void>;
  /** Complete the fixed FX source first so a host can release its large seed. */
  prepareTreasuryFx(opening: PostwarDayOneFxPreparationInput): Promise<void>;
  startPreparation(): void;
  consumeOnce(): Promise<DurableConsumptionStep>;
  stop(): Promise<void>;
}
const connections = new WeakMap<
  object,
  Readonly<PostwarFinanceSocialRuntimePorts>
>();
const connectionSources = new WeakMap<object, FinanceSocialSourceBinding>();
const preparedTreasuryFxConnections = new WeakSet<object>();
/** Startup state only; never authorization, admission or permission to consume. */
export function hasPreparedPostwarFinanceSocialTreasuryFx(
  value: Readonly<PostwarFinanceSocialRuntimeConnection>,
): boolean {
  return connections.has(value) && preparedTreasuryFxConnections.has(value);
}
const worldOwners = new Map<string, object>();
export function isPostwarFinanceSocialRuntimeConnection(
  value: unknown,
  world: string,
): value is Readonly<PostwarFinanceSocialRuntimeConnection> {
  return (
    value !== null &&
    typeof value === 'object' &&
    connections.get(value)?.worldId === world &&
    sources.has(connectionSources.get(value)!)
  );
}
/** Server-only fixed ports for HTTP registration/recovery. Callers may not
 * replace a reader, candidate, adapter, clock, or source with a callback. */
export function readPostwarFinanceSocialRuntimeBinding(
  value: Readonly<PostwarFinanceSocialRuntimeConnection>,
): Readonly<PostwarFinanceSocialRuntimePorts> {
  const ports = connections.get(value);
  if (!ports || !sources.has(connectionSources.get(value)!))
    throw Error('GENUINE_FINANCE_SOCIAL_RUNTIME_CONNECTION_REQUIRED');
  return ports;
}
export function createPostwarFinanceSocialRuntimeConnection(
  input: PostwarFinanceSocialRuntimeConnectionInput,
): Readonly<PostwarFinanceSocialRuntimeConnection> {
  const social = input.socialConnection,
    world = social?.worldId;
  if (!isPostwarSocialRuntimeConnection(social, world))
    throw Error('GENUINE_SOCIAL_RUNTIME_CONNECTION_REQUIRED');
  if (!['local', 'ci'].includes(input.environment))
    throw Error('FINANCE_SOCIAL_LOCAL_CI_ONLY');
  if (!isPostgresFinanceBudgetWorldCapacitySource(input.capacitySource, world))
    throw Error('GENUINE_FINITE_WORLD_FINANCE_CAPACITY_SOURCE_REQUIRED');
  if (
    !Object.isFrozen(input.clock) ||
    typeof Object.getOwnPropertyDescriptor(input.clock, 'nowReal')?.value !==
      'function' ||
    typeof Object.getOwnPropertyDescriptor(input.clock, 'simTime')?.value !==
      'function'
  )
    throw Error('FINANCE_SOCIAL_IMMUTABLE_SERVER_CLOCK_REQUIRED');
  const resources = readPostwarSocialRuntimeConnectionResources(social),
    scope = readPostgresFinanceBudgetCapacitySourceScope(input.capacitySource);
  if (
    scope.historyMode !== 'BUDGET_SOCIAL' ||
    scope.countryIds.some((c) => !resources.countryIds.includes(c))
  )
    throw Error('FINANCE_SOCIAL_EXACT_COUNTRY_SCOPE_REQUIRED');
  if (
    typeof input.intakePool?.connect !== 'function' ||
    input.intakePool === resources.workerPool
  )
    throw Error('FINANCE_SOCIAL_SEPARATE_INTAKE_REQUIRED');
  if (worldOwners.has(world))
    throw Error('FINANCE_SOCIAL_WORLD_CONSUMER_ALREADY_BOUND');
  const reservation = Object.freeze({});
  worldOwners.set(world, reservation);
  const token = Object.freeze({}) as FinanceSocialSourceBinding;
  let reserved = false;
  try {
    // The Finance adapter must be outermost: Social's general authority lock
    // adapter also serves Social's dual-capability read and must not consume the
    // Finance execution cutoff before Finance's exact fixed helper sees it.
    const fxDatabase = input.treasuryFx
      ? createPostwarDayOneFxAuthorizationDatabase(social.database)
      : social.database;
    const database = createManualOfficeAuthorizationTransactionDatabase(
      createFinanceBudgetAuthorizationDatabase(fxDatabase),
    );
    const socialIntake = createSocialIntakeAuthorizationPool(input.intakePool);
    const intakePool = createFinanceBudgetIntakeAuthorizationPool(
      input.treasuryFx
        ? createPostwarDayOneFxIntakeAuthorizationPool(socialIntake)
        : socialIntake,
    );
    const treasuryFx = input.treasuryFx
      ? createPostwarDayOneFxRuntime({
          database,
          worldId: world,
          workerId: social.workerId,
          workerRole: input.treasuryFx.workerRole,
        })
      : null;
    const budget = createPostgresFinanceBudgetNativeRuntime({
      database,
      workerId: social.workerId,
      sha256Hex: sha,
      capacitySource: bindPostgresFinanceBudgetCapacitySourceToSocialReplay(
        input.capacitySource,
        social,
      ),
    });
    const readers: Readonly<ManualOfficeRuntimeReaders> = Object.freeze({
      ...social.readers,
      financeBudget: budget,
      ...(treasuryFx ? { treasuryFx } : {}),
    });
    sources.set(
      token,
      Object.freeze({
        worldId: world,
        workerId: social.workerId,
        database,
        intakePool,
        rawIntakePool: input.intakePool,
        workerPool: resources.workerPool,
        clock: input.clock,
        environment: Object.freeze({ ECONMIND_ENV: input.environment }),
        sha256Hex: sha,
        readers,
        socialConnection: social,
      }),
    );
    reservePostwarSocialRuntimeForSharedConsumer(social, token);
    reserved = true;
    const issued = createBoundedFinanceSocialIntakeRuntime(token),
      runtime = issued.runtime;
    let stopped = false,
      stopping: Promise<void> | null = null;
    let fxPrepared = false;
    let fxPreparing: Promise<void> | null = null;
    let fxPreparationPin: string | null = null;
    const requireLive = () => {
      if (stopped || stopping || !sources.has(token))
        throw Error('FINANCE_SOCIAL_RUNTIME_RETIRED');
    };
    const requirePrepared = () => {
      requireLive();
      if (
        !isPreparedPostwarSocialRuntimeConnection(social, world) ||
        (treasuryFx !== null && !fxPrepared)
      )
        throw Error('FINANCE_SOCIAL_SOURCE_NOT_PREPARED');
    };
    const prepareTreasuryFx = async (
      opening: PostwarDayOneFxPreparationInput,
    ): Promise<void> => {
      requireLive();
      if (!treasuryFx) throw Error('FINANCE_SOCIAL_FX_SOURCE_NOT_INSTALLED');
      const pin = sha(
        JSON.stringify({
          world: opening.seed.worldId,
          seed: opening.seed.fingerprint,
          policy: sha(opening.policyBytes),
          adoption: sha(opening.userReceiptBytes),
        }),
      );
      if (fxPreparationPin !== null && fxPreparationPin !== pin)
        throw Error('FINANCE_SOCIAL_FX_PREPARATION_PINS_CHANGED');
      fxPreparationPin = pin;
      fxPreparing ??= treasuryFx.prepare(opening).then(() => {
        fxPrepared = true;
      });
      await fxPreparing;
      requireLive();
      preparedTreasuryFxConnections.add(connection);
    };
    const connection: Readonly<PostwarFinanceSocialRuntimeConnection> =
      Object.freeze({
        worldId: world,
        workerId: social.workerId,
        async prepare(
          configuration: PostwarSocialSourcePreparationInput,
          fxOpening?: PostwarDayOneFxPreparationInput,
        ) {
          requireLive();
          if (
            (!treasuryFx && fxOpening) ||
            (treasuryFx && !fxPrepared && !fxOpening)
          )
            throw Error('FINANCE_SOCIAL_FX_EXACT_PREPARATION_REQUIRED');
          if (fxOpening) await prepareTreasuryFx(fxOpening);
          // Hosts controlling peak memory can call prepareTreasuryFx first,
          // release their raw seed, then call prepare without an FX argument.
          await social.prepare(configuration);
          requireLive();
        },
        prepareTreasuryFx,
        startPreparation() {
          requirePrepared();
          runtime.consumer.startPreparation();
        },
        consumeOnce() {
          requirePrepared();
          return runtime.consumer.consumeOnce();
        },
        stop() {
          if (stopping) return stopping;
          stopped = true;
          preparedTreasuryFxConnections.delete(connection);
          stopping = (async () => {
            await runtime.consumer.stop();
            if (fxPreparing) await Promise.allSettled([fxPreparing]);
            await treasuryFx?.close();
            releasePostwarSocialRuntimeForSharedConsumer(social, token);
            sources.delete(token);
            await social.close();
            connections.delete(connection);
            connectionSources.delete(connection);
            if (worldOwners.get(world) === connection)
              worldOwners.delete(world);
          })();
          return stopping;
        },
      });
    connections.set(
      connection,
      Object.freeze({
        worldId: world,
        workerId: social.workerId,
        database,
        intakePool,
        rawIntakePool: input.intakePool,
        workerPool: resources.workerPool,
        clock: input.clock,
        environment: input.environment,
        runtime,
        budget: issued.budget,
        treasuryFx,
        socialConnection: social,
        financeCountryIds: scope.countryIds,
      }),
    );
    connectionSources.set(connection, token);
    worldOwners.set(world, connection);
    return connection;
  } catch (error) {
    if (reserved) releasePostwarSocialRuntimeForSharedConsumer(social, token);
    sources.delete(token);
    if (worldOwners.get(world) === reservation) worldOwners.delete(world);
    throw error;
  }
}
