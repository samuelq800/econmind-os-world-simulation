/** Fixed finite Treasury-FX installation. No listeners, SQL publication, grants,
 * auto-start, Clock construction or production activation are performed. */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { worldId, workerId, type Sha256Hex } from '@econmind/core';
import {
  createPostwarDayOneFxRuntime,
  type PostwarDayOneFxRuntime,
  type PostwarDayOneFxPreparationInput,
} from '../persistence/postwar-day-one-fx-runtime.js';
import { createManualOfficeAuthorizationTransactionDatabase } from '../persistence/manual-office-authorization-transaction-scope.js';
import {
  createPostwarDayOneFxAuthorizationDatabase,
  createPostwarDayOneFxIntakeAuthorizationPool,
} from '../persistence/postgres-postwar-day-one-fx-originals.js';
import {
  createTreasuryFxManualOfficeIntakeRuntime,
  type ManualOfficeIntakeRuntime,
} from '../intake/manual-office-intake-runtime.js';
import type { SqlDatabase } from '../persistence/sql-database.js';
import type { DurableConsumptionClock } from '../preparation/durable-command-consumption.js';
export interface PostwarTreasuryFxRuntimeConnectionInput {
  readonly worldId: string;
  readonly workerId: string;
  readonly workerRole: string;
  readonly workerDatabase: SqlDatabase;
  readonly intakePool: Pick<Pool, 'connect'>;
  readonly clock: DurableConsumptionClock;
  readonly environment: 'local' | 'ci';
}
export interface PostwarTreasuryFxRuntimeBinding {
  readonly worldId: string;
  readonly workerId: string;
  readonly workerDatabase: SqlDatabase;
  readonly intakePool: Pick<Pool, 'connect'>;
  readonly clock: DurableConsumptionClock;
  readonly environment: NodeJS.ProcessEnv;
  readonly sha256Hex: Sha256Hex;
  readonly readers: Readonly<{ treasuryFx: PostwarDayOneFxRuntime }>;
  readonly runtime: ManualOfficeIntakeRuntime;
}
export interface PostwarTreasuryFxRuntimeConnection {
  readonly worldId: string;
  readonly workerId: string;
  prepare(input: PostwarDayOneFxPreparationInput): Promise<void>;
  startPreparation(): void;
  consumeOnce(): ReturnType<
    ManualOfficeIntakeRuntime['consumer']['consumeOnce']
  >;
  quotes(): ReturnType<PostwarDayOneFxRuntime['quotes']>;
  treasuryGcuAccountId(countryId: string): string;
  stop(): Promise<void>;
}
declare const fixedSourceBinding: unique symbol;
export interface PostwarTreasuryFxSourceBinding {
  readonly [fixedSourceBinding]: true;
}
export type PostwarTreasuryFxSourceDependencies = Omit<
  PostwarTreasuryFxRuntimeBinding,
  'runtime'
>;
const sources = new WeakMap<object, PostwarTreasuryFxSourceDependencies>();
const connections = new WeakMap<object, PostwarTreasuryFxRuntimeBinding>();
const owners = new Map<string, object>();
export function readPostwarTreasuryFxSourceBinding(
  binding: PostwarTreasuryFxSourceBinding,
): PostwarTreasuryFxSourceDependencies {
  const fixed = sources.get(binding);
  if (!fixed) throw Error('TREASURY_FX_FIXED_SOURCE_BINDING_REQUIRED');
  return fixed;
}
export function readPostwarTreasuryFxRuntimeBinding(
  controller: PostwarTreasuryFxRuntimeConnection,
): PostwarTreasuryFxRuntimeBinding {
  const fixed = connections.get(controller);
  if (!fixed) throw Error('TREASURY_FX_GENUINE_LIVE_CONTROLLER_REQUIRED');
  return fixed;
}
export function isPostwarTreasuryFxRuntimeConnection(
  value: unknown,
): value is PostwarTreasuryFxRuntimeConnection {
  return typeof value === 'object' && value !== null && connections.has(value);
}
export function createPostwarTreasuryFxRuntimeConnection(
  input: PostwarTreasuryFxRuntimeConnectionInput,
): PostwarTreasuryFxRuntimeConnection {
  const world = worldId(input.worldId),
    holder = workerId(input.workerId);
  if (!['local', 'ci'].includes(input.environment))
    throw Error('TREASURY_FX_LOCAL_CI_ONLY');
  if (owners.has(world))
    throw Error('TREASURY_FX_WORLD_CONSUMER_ALREADY_BOUND');
  if (
    !input.clock ||
    !Object.isFrozen(input.clock) ||
    !['nowReal', 'simTime'].every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(input.clock, key);
      return (
        descriptor &&
        Object.hasOwn(descriptor, 'value') &&
        typeof descriptor.value === 'function'
      );
    }) ||
    typeof input.clock.nowReal !== 'function' ||
    typeof input.clock.simTime !== 'function' ||
    typeof input.intakePool?.connect !== 'function'
  )
    throw Error('TREASURY_FX_FIXED_SERVER_PORTS_REQUIRED');
  // Membership reauthorization uses the exact current transaction, never a
  // second pooled connection while the sole writer holds source/head locks.
  const database = createManualOfficeAuthorizationTransactionDatabase(
    createPostwarDayOneFxAuthorizationDatabase(input.workerDatabase),
  );
  const source = createPostwarDayOneFxRuntime({
    database,
    worldId: world,
    workerId: holder,
    workerRole: input.workerRole,
  });
  const token = Object.freeze({}) as PostwarTreasuryFxSourceBinding;
  const fixed: PostwarTreasuryFxSourceDependencies = Object.freeze({
    worldId: world,
    workerId: holder,
    workerDatabase: database,
    intakePool: createPostwarDayOneFxIntakeAuthorizationPool(input.intakePool),
    clock: input.clock,
    environment: Object.freeze({ ECONMIND_ENV: input.environment }),
    sha256Hex: (s) => createHash('sha256').update(s).digest('hex'),
    readers: Object.freeze({ treasuryFx: source }),
  });
  sources.set(token, fixed);
  let runtime: ManualOfficeIntakeRuntime;
  try {
    runtime = createTreasuryFxManualOfficeIntakeRuntime(token);
  } catch (error) {
    sources.delete(token);
    throw error;
  }
  let prepared = false,
    preparing: Promise<void> | null = null,
    stopping: Promise<void> | null = null,
    stopped = false;
  const controller: PostwarTreasuryFxRuntimeConnection = Object.freeze({
    worldId: world,
    workerId: holder,
    prepare(opening: PostwarDayOneFxPreparationInput) {
      if (stopped || stopping || preparing || prepared)
        return Promise.reject(
          Error('TREASURY_FX_SINGLE_LIVE_PREPARATION_REQUIRED'),
        );
      const pending = source.prepare(opening);
      preparing = pending;
      return pending
        .then(() => {
          prepared = true;
        })
        .finally(() => {
          preparing = null;
        });
    },
    startPreparation() {
      if (!prepared || stopped || stopping)
        throw Error('TREASURY_FX_ACTUAL_SOURCE_PREPARATION_REQUIRED');
      runtime.consumer.startPreparation();
    },
    consumeOnce() {
      if (!prepared || stopped || stopping)
        return Promise.resolve(
          Object.freeze({
            status: 'BLOCKED' as const,
            reason: 'TREASURY_FX_ACTUAL_SOURCE_PREPARATION_REQUIRED',
            commandId: null,
          }),
        );
      return runtime.consumer.consumeOnce();
    },
    quotes: () => source.quotes(),
    treasuryGcuAccountId: (country: string) =>
      source.treasuryGcuAccountId(country),
    stop() {
      if (stopping) return stopping;
      stopping = (async () => {
        if (preparing) await preparing.catch(() => {});
        await runtime.consumer.stop();
        await source.close();
        stopped = true;
        sources.delete(token);
        connections.delete(controller);
        if (owners.get(world) === controller) owners.delete(world);
      })();
      return stopping;
    },
  });
  connections.set(controller, Object.freeze({ ...fixed, runtime }));
  owners.set(world, controller);
  return controller;
}
