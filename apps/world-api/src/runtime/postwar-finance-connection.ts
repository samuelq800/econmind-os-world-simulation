/** Explicit Finance host installer. Borrowed server ports only: no credential
 * discovery, source publication, lease acquisition, listener, polling, Clock,
 * schema installation or automatic command execution. Null stays disconnected.
 * The present standard Worker constructor retains its local/CI safety gate;
 * this installer never spoofs that environment to activate a formal host. */
import { createHash } from 'node:crypto';
import {
  AUTHENTICATED_COMMAND_RECOVERY_PATH,
  type AuthenticatedCommandRecoveryResponseDto,
} from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_PATH,
  type AuthenticatedOfficeCommandResponseDto,
} from '@econmind/core/authenticated-office-command-contract';
import {
  createBoundedFinanceBudgetIntakeRuntime,
  createPostgresFinanceBudgetCapacitySource,
  createFinanceBudgetAuthorizationDatabase,
  createFinanceBudgetIntakeAuthorizationPool,
} from '@econmind/world-worker/finance-budget-runtime';
import { createBoundedOfficeCommandFetchHandler } from '../integration/bounded-office-command-fetch-handler.js';
import { createBoundedAuthenticatedOfficeCommandService } from '../integration/bounded-authenticated-office-command-service.js';
import { createBoundedOfficeCommandRecoveryService } from '../integration/bounded-office-command-recovery-service.js';
import type { AuthenticatedOfficeCommandServiceConfig } from '../integration/authenticated-office-command-service.js';

type RuntimeInput = Parameters<
  typeof createBoundedFinanceBudgetIntakeRuntime
>[0];
type Clock = RuntimeInput['clock'];
type HttpConfig = AuthenticatedOfficeCommandServiceConfig;
type FinancePorts = ReturnType<typeof createBoundedFinanceBudgetIntakeRuntime>;
export interface PostwarFinanceStructuredRequest {
  readonly authorization: unknown;
  readonly request: unknown;
  readonly signal?: AbortSignal;
}
export interface PostwarFinanceConnection {
  readonly transportOrigins: readonly string[];
  handleCommand(input: PostwarFinanceStructuredRequest): Promise<{
    readonly httpStatus: number;
    readonly body: AuthenticatedOfficeCommandResponseDto;
  }>;
  recover(input: PostwarFinanceStructuredRequest): Promise<{
    readonly httpStatus: number;
    readonly body: AuthenticatedCommandRecoveryResponseDto;
  }>;
  readonly status: 'EXPLICIT_MANUAL_FINANCE_CONNECTION' | 'NOT_CONNECTED';
  readonly runtime: FinancePorts['runtime'] | null;
  readonly budget: FinancePorts['budget'] | null;
  handle(request: Request): Promise<Response | null>;
  prepareManualConsumption(): void;
  consumeOnce(): Promise<
    | Awaited<ReturnType<FinancePorts['runtime']['consumer']['consumeOnce']>>
    | Readonly<{ status: 'BLOCKED'; reason: string }>
  >;
  stop(): Promise<void>;
}
export interface PostwarFinanceConnectionConfig {
  readonly worldId: string;
  readonly countryId: string;
  readonly workerId: string;
  readonly admittedWorldPins: HttpConfig['admittedWorldPins'];
  readonly expectedCapacitySourceSHA256?: string;
  readonly readPool: HttpConfig['readPool'];
  readonly intakePool: RuntimeInput['intakePool'];
  readonly workerDatabase: RuntimeInput['workerDatabase'];
  readonly readerRole: string;
  readonly intakeRole: string;
  readonly authorizationPublisherRole: string;
  readonly auth: HttpConfig['auth'];
  readonly resolveActorId: HttpConfig['resolveActorId'];
  /** Read the actual server-owned simulation time; never a browser value,
   * copied fixture constant, or an instruction to advance World time. */
  readonly clock: Clock;
  readonly allowedOrigins: readonly string[];
  /** Actual host environment, preserved unchanged. A formal host must use a
   * separately reviewed formal consumer constructor, not pretend to be CI. */
  readonly environment: RuntimeInput['environment'];
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const paths = new Set<string>([
  AUTHENTICATED_OFFICE_COMMAND_PATH,
  AUTHENTICATED_COMMAND_RECOVERY_PATH,
]);
const id = (s: string) =>
  typeof s === 'string' &&
  /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(s) &&
  s.length <= 256;
function clockPort(clock: Clock): void {
  if (
    !clock ||
    !Object.isFrozen(clock) ||
    typeof Object.getOwnPropertyDescriptor(clock, 'nowReal')?.value !==
      'function' ||
    typeof Object.getOwnPropertyDescriptor(clock, 'simTime')?.value !==
      'function'
  )
    throw new TypeError('POSTWAR_FINANCE_IMMUTABLE_SERVER_CLOCK_REQUIRED');
}

/** No endpoint, role, source, actor or clock is inferred from request JSON.
 * HTTP registers/recovers exact intent; only an explicit owner calls the sole
 * manual consume step. The surrounding host owns pools and closes them AFTER
 * stop() drains in-flight work. It must not install competing World consumers. */
export function createPostwarFinanceConnection(
  config: PostwarFinanceConnectionConfig | null = null,
): Readonly<PostwarFinanceConnection> {
  if (
    config &&
    (!id(config.worldId) ||
      !id(config.countryId) ||
      !id(config.workerId) ||
      config.admittedWorldPins.worldId !== config.worldId ||
      config.readPool === config.intakePool ||
      typeof config.resolveActorId !== 'function')
  )
    throw new TypeError('POSTWAR_FINANCE_EXACT_SERVER_DEPENDENCIES_REQUIRED');
  if (config) clockPort(config.clock);
  const c = config
    ? Object.freeze({
        ...config,
        admittedWorldPins: Object.freeze({ ...config.admittedWorldPins }),
        auth: Object.freeze({ ...config.auth }),
        allowedOrigins: Object.freeze([...config.allowedOrigins]),
        environment: Object.freeze({ ...config.environment }),
      })
    : null;
  // Identity is part of the Worker intake binding. Reuse ONE authorization
  // pool wrapper in construction and HTTP, rather than independently wrapping
  // the borrowed pool and losing the private runtime/pool identity check.
  const intakePool = c
    ? createFinanceBudgetIntakeAuthorizationPool(c.intakePool)
    : null;
  const owned =
    c && intakePool
      ? createBoundedFinanceBudgetIntakeRuntime({
          worldId: c.worldId,
          workerId: c.workerId,
          intakePool,
          workerDatabase: createFinanceBudgetAuthorizationDatabase(
            c.workerDatabase,
          ),
          clock: c.clock,
          sha256Hex: sha,
          environment: c.environment,
          capacitySource: createPostgresFinanceBudgetCapacitySource({
            worldId: c.worldId,
            countryId: c.countryId,
            ...(c.expectedCapacitySourceSHA256 === undefined
              ? {}
              : { expectedRawSourceSHA256: c.expectedCapacitySourceSHA256 }),
            historyMode: 'BUDGET_SOCIAL',
          }),
        })
      : null;
  const composition: HttpConfig | null =
    c && owned && intakePool
      ? {
          readPool: c.readPool,
          writerPool: intakePool,
          readerRole: c.readerRole,
          writerRole: c.intakeRole,
          authorizationPublisherRole: c.authorizationPublisherRole,
          admittedWorldPins: c.admittedWorldPins,
          auth: c.auth,
          resolveActorId: c.resolveActorId,
          clock: c.clock,
          runtime: owned.runtime,
        }
      : null;
  const handler = createBoundedOfficeCommandFetchHandler(
    c && composition ? { allowedOrigins: c.allowedOrigins, composition } : null,
  );
  const commands = createBoundedAuthenticatedOfficeCommandService(composition);
  const recovery = createBoundedOfficeCommandRecoveryService(composition);
  let stopped = false,
    stopping: Promise<void> | null = null;
  const pending = new Set<Promise<unknown>>();
  function track<T>(operation: Promise<T>): Promise<T> {
    pending.add(operation);
    void operation.then(
      () => pending.delete(operation),
      () => pending.delete(operation),
    );
    return operation;
  }
  return Object.freeze({
    transportOrigins: c?.allowedOrigins ?? Object.freeze([]),
    handleCommand(input: PostwarFinanceStructuredRequest) {
      return track(
        (stopped
          ? createBoundedAuthenticatedOfficeCommandService(null)
          : commands
        ).handle(input),
      );
    },
    recover(input: PostwarFinanceStructuredRequest) {
      return track(
        (stopped
          ? createBoundedOfficeCommandRecoveryService(null)
          : recovery
        ).handle(input),
      );
    },
    status: c
      ? ('EXPLICIT_MANUAL_FINANCE_CONNECTION' as const)
      : ('NOT_CONNECTED' as const),
    /** Genuine standard ports for the owner of the shared World dispatcher.
     * These are not readiness/admission/production-deployment attestations. */
    runtime: owned?.runtime ?? null,
    budget: owned?.budget ?? null,
    handle(request: Request): Promise<Response | null> {
      if (!paths.has(new URL(request.url).pathname))
        return Promise.resolve(null);
      if (stopped) return createBoundedOfficeCommandFetchHandler(null)(request);
      return track(handler(request));
    },
    prepareManualConsumption(): void {
      if (!owned || stopped)
        throw Error('POSTWAR_FINANCE_CONNECTION_UNAVAILABLE');
      owned.runtime.consumer.startPreparation();
    },
    consumeOnce() {
      if (!owned || stopped)
        return Promise.resolve(
          Object.freeze({
            status: 'BLOCKED' as const,
            reason: 'POSTWAR_FINANCE_CONNECTION_UNAVAILABLE',
          }),
        );
      return owned.runtime.consumer.consumeOnce();
    },
    stop(): Promise<void> {
      stopped = true;
      stopping ??= (async () => {
        while (pending.size) await Promise.allSettled([...pending]);
        await owned?.runtime.consumer.stop();
      })();
      return stopping;
    },
  });
}
