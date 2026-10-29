import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool, PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { canonicalSerialize, type CanonicalCommand } from '@econmind/core';
import { RuntimeReadBindingStore } from '../persistence/runtime-read-binding-store.js';
import type { SqlDatabase, SqlExecutor } from '../persistence/sql-database.js';
import type { DurableConsumptionClock } from '../preparation/durable-command-consumption.js';
import {
  authorizeManualOfficeCommand,
  createManualOfficeCommandComposition,
  type ManualOfficeRuntimeReaders,
} from '../preparation/manual-office-command-composition.js';
import { CommandRequestIdentityRegistry } from './private-command-request-registry.js';

import { createPostwarOfficeProjectionStore } from '../persistence/postwar-office-projection-store.js';
import { createPostgresFinanceBudgetNativeRuntime } from '../persistence/postgres-finance-budget-custody.js';
import {
  isPostgresFinanceBudgetCapacitySource,
  type PostgresFinanceBudgetCapacitySource,
} from '../persistence/postgres-finance-budget-capacity-source.js';

declare const serverBindingBrand: unique symbol;
/** Opaque server dependency registration, never an admission/activation permit. */
export interface ServerCommandHostBinding {
  readonly [serverBindingBrand]: true;
}
export interface ServerCommandHostDependencies {
  readonly worldId: string;
  readonly workerId: string;
  readonly seedRef: string;
  readonly contentHash: string;
  readonly admissionRef: string;
  readonly modelVersion: string;
  readonly intakePool: Pick<Pool, 'connect'>;
  readonly sourcePool: Pick<Pool, 'connect'>;
  readonly readerRole: string;
  readonly authorizationPublisherRole: string;
  readonly workerDatabase: SqlDatabase;
  readonly clock: DurableConsumptionClock;
  readonly resolveActorId: (subject: string) => Promise<string | null>;
  readonly readers: ManualOfficeRuntimeReaders;
  readonly financeCapacitySource?: PostgresFinanceBudgetCapacitySource;
}
const registrations = new WeakMap<
  object,
  Readonly<ServerCommandHostDependencies>
>();
const id = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 256 &&
  /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(value);
/** No environment discovery, DB writes, lease, listener, consumer or Clock start.
 * The token only records explicit server ports. Every preflight below re-reads
 * durable admission, current authorization and canonical domain source facts.
 */
export function createServerCommandHostBinding(
  input: ServerCommandHostDependencies,
): ServerCommandHostBinding {
  if (
    !input ||
    ![input.worldId, input.workerId, input.seedRef, input.admissionRef].every(
      id,
    ) ||
    !/^sha256:[0-9a-f]{64}$/u.test(input.contentHash) ||
    !input.modelVersion ||
    typeof input.intakePool?.connect !== 'function' ||
    typeof input.sourcePool?.connect !== 'function' ||
    input.intakePool === input.sourcePool ||
    typeof input.workerDatabase?.query !== 'function' ||
    typeof input.workerDatabase?.transaction !== 'function' ||
    !Object.isFrozen(input.clock) ||
    typeof input.clock?.nowReal !== 'function' ||
    typeof input.clock?.simTime !== 'function' ||
    typeof input.resolveActorId !== 'function' ||
    !input.readers ||
    (input.financeCapacitySource !== undefined &&
      !isPostgresFinanceBudgetCapacitySource(
        input.financeCapacitySource,
        input.worldId,
      )) ||
    (![
      input.readers.captain,
      input.readers.centralBank,
      input.readers.social,
    ].some(Boolean) &&
      !isPostgresFinanceBudgetCapacitySource(
        input.financeCapacitySource,
        input.worldId,
      ))
  )
    throw new Error('SERVER_COMMAND_DEPENDENCIES_REQUIRED');
  // Reuse the existing reader/publisher role separation validation. No writes.
  new RuntimeReadBindingStore({
    database: input.workerDatabase,
    runtimeReaderRole: input.readerRole,
    authorizationPublisherRole: input.authorizationPublisherRole,
  });
  const binding = Object.freeze({}) as ServerCommandHostBinding;
  registrations.set(
    binding,
    Object.freeze({
      ...input,
      readers: Object.freeze({
        ...input.readers,
        ...(input.financeCapacitySource
          ? {
              financeBudget: createPostgresFinanceBudgetNativeRuntime({
                database: input.workerDatabase,
                workerId: input.workerId,
                sha256Hex: (bytes) =>
                  createHash('sha256').update(bytes).digest('hex'),
                capacitySource: input.financeCapacitySource,
              }),
            }
          : {}),
      }),
    }),
  );
  return binding;
}
/** Dependency data only; never grants Clock/source admission or execution.
 * No caller-provided facts, candidate factory or readiness callback is accepted. */
export function registeredFinanceCommandHostDependencies(binding: unknown) {
  const d =
    binding && typeof binding === 'object'
      ? registrations.get(binding)
      : undefined;
  if (
    !d ||
    !isPostgresFinanceBudgetCapacitySource(
      d.financeCapacitySource,
      d.worldId,
    ) ||
    !d.readers.financeBudget
  )
    throw Error('REGISTERED_FIXED_FINANCE_SERVER_BINDING_REQUIRED');
  return d as Readonly<
    ServerCommandHostDependencies & {
      financeCapacitySource: PostgresFinanceBudgetCapacitySource;
    }
  >;
}
export function productionFinanceCommandExecutionBlocker(
  binding: unknown,
): string | null {
  try {
    registeredFinanceCommandHostDependencies(binding);
  } catch {
    return 'REGISTERED_FIXED_FINANCE_SERVER_BINDING_REQUIRED';
  }
  // world_head has no Clock state/control reference. The only durable Clock
  // implementation with a positive path is explicitly TEST_ONLY. A frozen
  // nowReal/simTime callback registers dependencies, NOT a formal Clock original.
  // No environment label, user boolean or structural callback can change this.
  return 'FORMAL_CLOCK_SOURCE_CONTROL_AND_SOLE_CONSUMER_NOT_REGISTERED';
}

declare const productionRuntimeBrand: unique symbol;
export interface ProductionManualIntakeRuntime {
  readonly [productionRuntimeBrand]: true;
}
export interface ProductionWorldCommandHost {
  readonly preparationStatus:
    'SOURCE_ONLY_UNMOUNTED_HOLD' | 'SERVER_COMPOSED_UNMOUNTED';
  diagnostics(): Readonly<{
    status: 'HOLD' | 'COMPOSED_UNMOUNTED' | 'STOPPED';
    missing: readonly string[];
  }>;
  openIntakeRequest(input: unknown): ProductionManualIntakeRuntime | null;
  retireIntakeRequest(runtime: ProductionManualIntakeRuntime): void;
  stop(): Promise<void>;
}
const registry = new CommandRequestIdentityRegistry();
type HostState = {
  dependencies: Readonly<ServerCommandHostDependencies> | null;
  binding: ServerCommandHostBinding | null;
  stopped: boolean;
  requests: Set<object>;
};
const states = new WeakMap<object, HostState>();
const requests = new WeakMap<
  object,
  { host: object; signal: AbortSignal; retire: () => void }
>();
const missing = Object.freeze([
  'FORMAL_SOURCE_CONSTRUCTORS_NOT_INSTALLED',
  'WORLD_CLOCK_CONSTRUCTOR_NOT_INSTALLED',
  'ACTOR_IDENTITY_CONSTRUCTOR_NOT_INSTALLED',
]);
/** A registered server composition can issue request identities; neither a
 * structural object nor copied registration can bypass the private registry.
 * Request identities are not source/admission, a sole-consumer permit or READY.
 */
export function createProductionWorldCommandHost(
  binding: ServerCommandHostBinding | null = null,
): ProductionWorldCommandHost {
  const dependencies = (binding && registrations.get(binding)) || null;
  const state: HostState = {
    dependencies,
    binding,
    stopped: false,
    requests: new Set(),
  };
  const host: ProductionWorldCommandHost = Object.freeze({
    preparationStatus: dependencies
      ? 'SERVER_COMPOSED_UNMOUNTED'
      : 'SOURCE_ONLY_UNMOUNTED_HOLD',
    diagnostics() {
      const own = states.get(this);
      if (!own) throw new Error('HOST_IDENTITY_REQUIRED');
      return Object.freeze({
        status: own.stopped
          ? 'STOPPED'
          : own.dependencies
            ? 'COMPOSED_UNMOUNTED'
            : 'HOLD',
        missing: own.dependencies
          ? Object.freeze([
              'FORMAL_CONSUMER_NOT_STARTED',
              'PER_REQUEST_ADMISSION_AND_SOURCE_REQUIRED',
            ])
          : missing,
      });
    },
    openIntakeRequest(input: unknown) {
      const own = states.get(this);
      if (
        !own?.dependencies ||
        own.stopped ||
        !input ||
        typeof input !== 'object'
      )
        return null;
      const value = input as Record<string, unknown>;
      if (
        Object.keys(value).sort().join(',') !== 'route,signal' ||
        value.route !== '/v1/office-command' ||
        !(value.signal instanceof AbortSignal) ||
        value.signal.aborted
      )
        return null;
      const outside = value.signal;
      const runtime = registry.issueRequest({
        host: this,
        worldId: own.dependencies.worldId,
        route: '/v1/office-command',
        intakePool: own.dependencies.intakePool,
        sourcePool: own.dependencies.sourcePool,
        clock: own.dependencies.clock,
        generation: registry.generation(this)!,
      }) as ProductionManualIntakeRuntime;
      const controller = new AbortController();
      const retire = () => {
        registry.retire(runtime);
        own.requests.delete(runtime);
        outside.removeEventListener('abort', retire);
        requests.delete(runtime);
        controller.abort();
      };
      requests.set(runtime, { host: this, signal: controller.signal, retire });
      own.requests.add(runtime);
      outside.addEventListener('abort', retire, { once: true });
      return runtime;
    },
    retireIntakeRequest(runtime: ProductionManualIntakeRuntime) {
      if (!states.has(this)) throw new Error('HOST_IDENTITY_REQUIRED');
      const request = requests.get(runtime);
      if (request?.host === this) request.retire();
    },
    async stop() {
      if (!states.has(this)) throw new Error('HOST_IDENTITY_REQUIRED');
      for (const runtime of state.requests) requests.get(runtime)?.retire();
      registry.stop(this);
      state.stopped = true;
    },
  });
  registry.registerHost(host, dependencies?.worldId ?? null);
  states.set(host, state);
  return host;
}
export function isProductionManualIntakeRuntime(
  runtime: unknown,
): runtime is ProductionManualIntakeRuntime {
  return registry.hasRuntime(runtime);
}
export function boundProductionManualIntakeRuntime(
  runtime: unknown,
  binding: { pool: object; clock: object; worldId: string },
): runtime is ProductionManualIntakeRuntime {
  return registry.boundIntake(runtime, binding);
}

/** Source-pool snapshot only. Fixed read-only SQL and existing canonical seed
 * validator; no client identity/GUC, role escalation or request snapshot trust.
 * An abort destroys the owned client, including a client acquired after abort.
 */
async function readCurrentBinding(
  d: Readonly<ServerCommandHostDependencies>,
  command: CanonicalCommand,
  signal: AbortSignal,
) {
  let client: PoolClient | null = null;
  let open = false,
    released = false;
  const release = (destroy: boolean) => {
    if (client && !released) {
      released = true;
      client.release(destroy);
    }
  };
  const check = () => {
    if (signal.aborted || released) throw new Error('COMMAND_REQUEST_RETIRED');
  };
  const abort = () => release(true);
  signal.addEventListener('abort', abort, { once: true });
  try {
    check();
    client = await d.sourcePool.connect();
    if (signal.aborted) {
      release(true);
      throw new Error('COMMAND_REQUEST_RETIRED');
    }
    const executor: SqlExecutor = {
      async query<Row extends object>(
        statement: string,
        parameters: readonly unknown[] = [],
      ) {
        check();
        const result = await client!.query(statement, [...parameters]);
        check();
        return { rows: result.rows as Row[], rowCount: result.rowCount };
      },
    };
    await executor.query('begin isolation level repeatable read read only');
    open = true;
    await executor.query("select set_config('statement_timeout','10000',true)");
    await executor.query("select set_config('request.jwt.claim.sub',$1,true)", [
      command.authSubject,
    ]);
    if (d.financeCapacitySource && command.officeId === 'FINANCE') {
      const store = createPostwarOfficeProjectionStore({
        runtimeReaderRole: d.readerRole,
        authorizationPublisherRole: d.authorizationPublisherRole,
      });
      const headers = await store.readCurrentSeatHeadersFrom(executor, {
        worldId: d.worldId,
      });
      const matches = headers.filter(
        (h) =>
          h.scope.officeId === 'FINANCE' &&
          h.scope.countryId === command.countryId &&
          h.scope.authSubject === command.authSubject,
      );
      const h = matches[0];
      if (
        matches.length !== 1 ||
        !h ||
        h.source.seedId !== d.seedRef ||
        h.source.seedFingerprint !== d.contentHash ||
        h.source.admissionRef !== d.admissionRef ||
        h.source.modelVersion !== d.modelVersion ||
        h.source.worldVersion !== command.expectedWorldVersion
      )
        throw Error('CURRENT_ADMISSION_AND_SEAT_REQUIRED');
      await executor.query('commit');
      open = false;
      return Object.freeze({
        seat: { authorizationRevision: h.scope.authorizationVersion },
        admission: {
          seedRef: h.source.seedId,
          contentHash: h.source.seedFingerprint,
          admissionRef: h.source.admissionRef,
          modelVersion: h.source.modelVersion,
        },
        head: {
          world_version: h.source.worldVersion,
          event_sequence: h.source.eventSequence,
        },
      });
    }
    const store = new RuntimeReadBindingStore({
      database: d.workerDatabase,
      runtimeReaderRole: d.readerRole,
      authorizationPublisherRole: d.authorizationPublisherRole,
    });
    const seat = await store.readCurrentSeatFrom({
      executor,
      verifiedSubject: command.authSubject,
      worldId: d.worldId,
      countryId: command.countryId,
      officeId: command.officeId!,
    });
    const admission = await store.readImmutableAdmissionFrom({
      executor,
      verifiedSubject: command.authSubject,
      worldId: d.worldId,
    });
    const head = await executor.query<{
      world_version: string;
      event_sequence: string;
    }>(
      'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
      [d.worldId],
    );
    if (
      !seat ||
      !admission ||
      admission.seedRef !== d.seedRef ||
      admission.contentHash !== d.contentHash ||
      admission.admissionRef !== d.admissionRef ||
      admission.modelVersion !== d.modelVersion ||
      head.rows.length !== 1 ||
      head.rows[0]?.world_version !== command.expectedWorldVersion
    )
      throw new Error('CURRENT_ADMISSION_AND_SEAT_REQUIRED');
    await executor.query('commit');
    open = false;
    return Object.freeze({ seat, admission, head: head.rows[0]! });
  } catch (error) {
    if (client && open && !released) {
      try {
        await client.query('rollback');
        open = false;
      } catch {
        release(true);
        activeCompletion.getStore()?.recordCleanupFailure();
        throw new Error('COMMAND_HOST_READ_CLEANUP_UNCONFIRMED');
      }
    }
    release(true);
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    release(false);
  }
}

/** Real, conditional manual source preflight. This can succeed for a coherent
 * registered server source; it never queues, claims, settles or starts a loop.
 * Intake must additionally use its existing atomic current-authority cutoff.
 */
export async function preflightProductionManualIntakeRuntime(
  runtime: unknown,
  command: CanonicalCommand,
  observedAtReal: string,
): Promise<boolean> {
  const request =
    runtime && typeof runtime === 'object' ? requests.get(runtime) : null;
  const state = request ? states.get(request.host) : null;
  const d = state?.dependencies;
  if (
    !request ||
    !d ||
    state?.stopped ||
    command.worldId !== d.worldId ||
    command.officeId === null ||
    !registry.boundIntake(runtime, {
      pool: d.intakePool,
      clock: d.clock,
      worldId: d.worldId,
    })
  )
    return false;
  if (
    command.officeId === 'FINANCE' &&
    productionFinanceCommandExecutionBlocker(state!.binding) !== null
  )
    return false;
  const live = () =>
    !request.signal.aborted &&
    requests.has(runtime as object) &&
    !state.stopped;
  const execute = async () => {
    try {
      const before = await readCurrentBinding(d, command, request.signal);
      if (!live()) return false;
      const authority = await authorizeManualOfficeCommand({
        database: d.workerDatabase,
        command,
      });
      if (
        !live() ||
        authority.authorizationVersion !== before.seat.authorizationRevision
      )
        return false;
      const actor = await d.resolveActorId(command.authSubject);
      if (!live() || actor === null || actor !== command.actorId) return false;
      const simTime = await d.clock.simTime(d.worldId);
      const now = d.clock.nowReal();
      if (
        !live() ||
        simTime !== command.simTime.toCanonicalValue() ||
        !Number.isFinite(Date.parse(observedAtReal)) ||
        new Date(observedAtReal).toISOString() !== observedAtReal ||
        !Number.isFinite(Date.parse(now)) ||
        new Date(now).toISOString() !== now ||
        observedAtReal > now
      )
        return false;
      const composition = createManualOfficeCommandComposition({
        command,
        database: d.workerDatabase,
        workerId: d.workerId,
        sha256Hex: (bytes) => createHash('sha256').update(bytes).digest('hex'),
        readers: d.readers,
      });
      if (!composition) return false;
      await composition.assertSourceBeforeClaim(observedAtReal);
      if (!live()) return false;
      const after = await readCurrentBinding(d, command, request.signal);
      const current = await authorizeManualOfficeCommand({
        database: d.workerDatabase,
        command,
      });
      if (
        !live() ||
        current.authorizationVersion !== authority.authorizationVersion ||
        canonicalSerialize(after) !== canonicalSerialize(before)
      )
        return false;
      if ((await d.resolveActorId(command.authSubject)) !== actor || !live())
        return false;
      return (await d.clock.simTime(d.worldId)) === simTime && live();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'COMMAND_HOST_READ_CLEANUP_UNCONFIRMED'
      )
        throw error;
      return false;
    }
  };
  let cancel: () => void = () => undefined;
  const cancelled = new Promise<false>((resolve) => {
    cancel = () => resolve(false);
  });
  request.signal.addEventListener('abort', cancel, { once: true });
  try {
    // Keep actual SQL/source work in the request drain even if cancellation
    // settles the outward result first. Pool cleanup cannot certify completion
    // merely because the abort race resolved.
    const operation = trackWorkerRequestCompletion(execute());
    return await Promise.race([operation, cancelled]);
  } finally {
    request.signal.removeEventListener('abort', cancel);
  }
}

const activeCompletion = new AsyncLocalStorage<WorkerRequestCompletion>();
/** Worker operations only; cannot issue runtime/source/authorization identity. */
export class WorkerRequestCompletion {
  readonly #pending = new Set<Promise<unknown>>();
  #retired = false;
  #cleanupFailed = false;
  run<T>(operation: () => T): T {
    if (this.#retired) throw new Error('WORKER_REQUEST_RETIRED');
    return activeCompletion.run(this, operation);
  }
  track<T>(operation: Promise<T>): Promise<T> {
    // Fixed callers must stop new operations before retirement. A late
    // registration is still joined, but can never certify clean completion.
    if (this.#retired) this.#cleanupFailed = true;
    this.#pending.add(operation);
    void operation.then(
      () => this.#pending.delete(operation),
      () => this.#pending.delete(operation),
    );
    return operation;
  }
  async drain(): Promise<void> {
    while (this.#pending.size) await Promise.allSettled([...this.#pending]);
  }
  retire(): void {
    if (this.#pending.size) throw new Error('WORKER_REQUEST_NOT_DRAINED');
    this.#retired = true;
  }
  recordCleanupFailure(): void {
    this.#cleanupFailed = true;
  }
  cleanupFailed(): boolean {
    return this.#cleanupFailed;
  }
  pending(): number {
    return this.#pending.size;
  }
  retired(): boolean {
    return this.#retired;
  }
}
export function trackWorkerRequestCompletion<T>(
  operation: Promise<T>,
): Promise<T> {
  return activeCompletion.getStore()?.track(operation) ?? operation;
}
