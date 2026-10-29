/** Node server composition, deliberately not mounted by runtime.ts. Explicit
 * existing pools/config only: no URL discovery, role/source grants, registration,
 * publisher, listener, lease, consumer start or World/Clock activation. */
import type { Pool } from 'pg';
import {
  canonicalSerialize,
  SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  type CanonicalCommand,
} from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandResponseDto,
} from '@econmind/core/authenticated-office-command-contract';
import {
  createPostwarSocialRuntimeConnection,
  type PostwarSocialRuntimeConnectionInput,
} from '@econmind/world-worker/social-runtime-connection';
import {
  createServerCommandHostBinding,
  WorkerRequestCompletion,
  type ServerCommandHostDependencies,
} from '@econmind/world-worker/runtime-command-host';
import {
  parseManualOfficeCommandRequest,
  type ManualOfficeIntakeRuntime,
} from '@econmind/world-worker/office-command-intake';
import {
  createBoundedAuthenticatedOfficeCommandService,
  type AuthenticatedOfficeCommandServiceConfig,
} from '../integration/bounded-authenticated-office-command-service.js';
import { createSourceOwnedExecutorComposition } from '../runtime-preparation/source-owned-executor-composition.js';
import { RequestCompletion } from '../runtime-preparation/request-completion.js';

export interface PostwarSocialConnectionConfiguration {
  readonly environment: 'local' | 'ci' | 'staging' | 'production';
  /** This composition owns all four distinct pools and ends them on stop.
   * The bounded online API reader must never be the full-source reader. */
  readonly boundedReadPool: Pool;
  readonly intakePool: Pool;
  readonly sourcePool: Pool;
  readonly workerPool: Pool;
  readonly boundedReaderRole: string;
  readonly sourceReaderRole: string;
  readonly intakeRole: string;
  readonly workerRole: string;
  readonly authorizationPublisherRole: string;
  readonly workerId: string;
  readonly openingAdoption: PostwarSocialRuntimeConnectionInput['openingAdoption'];
  readonly admittedWorldPins: AuthenticatedOfficeCommandServiceConfig['admittedWorldPins'];
  readonly modelVersion: string;
  readonly auth: AuthenticatedOfficeCommandServiceConfig['auth'];
  readonly clock: ServerCommandHostDependencies['clock'];
  readonly resolveActorId: ServerCommandHostDependencies['resolveActorId'];
}
export interface SocialCommandServiceResult {
  readonly httpStatus: number;
  readonly body: AuthenticatedOfficeCommandResponseDto;
}
export interface PostwarSocialCommandHandleRequest {
  readonly authorization: unknown;
  readonly request: unknown;
  readonly signal?: AbortSignal;
}
export interface PostwarSocialPreflightRequest {
  readonly command: CanonicalCommand;
  readonly observedAtReal: string;
  readonly signal: AbortSignal;
}
export interface PostwarSocialPreflightResult {
  readonly status:
    | 'SOURCE_PREFLIGHT_PASSED'
    | 'SOURCE_PREFLIGHT_NOT_CONFIRMED'
    | 'CANCELLED'
    | 'SOURCE_RUNTIME_UNAVAILABLE';
  readonly commandQueued: false;
}
export interface PostwarSocialConnection {
  readonly classification: 'SOCIAL_SERVER_DEPENDENCIES_INSTALLED_NOT_RUNTIME_ACCEPTANCE';
  readonly preparationMode:
    'LOCAL_CI_PREPARED_INTAKE' | 'PRODUCTION_SOURCE_PREFLIGHT_ONLY';
  /** Private genuine consumer exists only for explicit local/ci. It remains
   * PREPARED. Calling this constructor never polls/starts it or advances time. */
  readonly preparedRuntime: ManualOfficeIntakeRuntime | null;
  readonly productionGates: readonly string[];
  handle(
    input: PostwarSocialCommandHandleRequest,
  ): Promise<SocialCommandServiceResult>;
  /** Server-only canonical source preflight. False cannot distinguish denied,
   * missing or failed infrastructure in the existing host; expose UNCONFIRMED,
   * never EMPTY or a fabricated definite source denial/admission. */
  preflightOnly(
    input: PostwarSocialPreflightRequest,
  ): Promise<Readonly<PostwarSocialPreflightResult>>;
  stop(): Promise<void>;
}
function role(v: string): string {
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(v) ||
    v.startsWith('pg_') ||
    [
      'postgres',
      'anon',
      'authenticated',
      'service_role',
      'supabase_admin',
      'supabase_auth_admin',
      'world_v2_api_reader',
      'world_v2_api_login',
    ].includes(v)
  )
    throw Error('SOCIAL_CONNECTION_SCOPED_ROLE_REQUIRED');
  return v;
}
function failure(code: string, httpStatus = 503): SocialCommandServiceResult {
  return {
    httpStatus,
    body: {
      schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
      requestId: '00000000-0000-4000-8000-000000000000',
      ok: false,
      error: { code, retryable: false },
    },
  };
}
const gates = Object.freeze([
  'DEFAULT_NODE_RUNTIME_ROUTE_NOT_MOUNTED',
  'PRODUCTION_DURABLE_CONSUMER_NOT_INSTALLED_LOCAL_CI_ONLY',
  'PRODUCTION_MANUAL_INTAKE_POSITION_GATE_CLOSED',
  'SOURCE_PREFLIGHT_REQUIRES_SEPARATE_EXPLICIT_OFFLINE_SEED_READER_NOT_BOUNDED_ONLINE_READER',
  'ACTUAL_ADMISSION_SOURCE_REGISTRATIONS_PUBLISHER_AND_CURRENT_AUTHORITY_MUST_EXIST',
]);
const manualFamilies: ReadonlySet<string> = new Set([
  SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
]);

export function createPostwarSocialConnection(
  configuration: PostwarSocialConnectionConfiguration,
): Readonly<PostwarSocialConnection> {
  const c = Object.freeze({
    ...configuration,
    admittedWorldPins: Object.freeze({ ...configuration.admittedWorldPins }),
    auth: Object.freeze({ ...configuration.auth }),
  });
  if (!['local', 'ci', 'staging', 'production'].includes(c.environment))
    throw Error('SOCIAL_CONNECTION_ENVIRONMENT_REQUIRED');
  const pools = [c.boundedReadPool, c.intakePool, c.sourcePool, c.workerPool];
  if (
    new Set(pools).size !== 4 ||
    pools.some(
      (p) =>
        typeof p?.connect !== 'function' ||
        typeof p.query !== 'function' ||
        typeof p.end !== 'function',
    )
  )
    throw Error('SOCIAL_CONNECTION_FOUR_DISTINCT_OWNED_POOLS_REQUIRED');
  const roles = [
    c.boundedReaderRole,
    c.sourceReaderRole,
    c.intakeRole,
    c.workerRole,
    c.authorizationPublisherRole,
  ].map(role);
  if (new Set(roles).size !== roles.length)
    throw Error('SOCIAL_CONNECTION_ROLE_SEPARATION_REQUIRED');
  if (
    !Object.isFrozen(c.clock) ||
    typeof c.clock?.nowReal !== 'function' ||
    typeof c.clock?.simTime !== 'function' ||
    typeof c.resolveActorId !== 'function'
  )
    throw Error('SOCIAL_CONNECTION_SERVER_IDENTITY_CLOCK_REQUIRED');
  const sources = createPostwarSocialRuntimeConnection({
    worldId: c.admittedWorldPins.worldId,
    workerId: c.workerId,
    workerPool: c.workerPool,
    workerRole: c.workerRole,
    openingAdoption: c.openingAdoption,
  });
  const binding = createServerCommandHostBinding({
    worldId: c.admittedWorldPins.worldId,
    workerId: c.workerId,
    seedRef: c.admittedWorldPins.seedRef,
    contentHash: c.admittedWorldPins.contentHash,
    admissionRef: c.admittedWorldPins.admissionRef,
    modelVersion: c.modelVersion,
    intakePool: c.intakePool,
    sourcePool: c.sourcePool,
    readerRole: c.sourceReaderRole,
    authorizationPublisherRole: c.authorizationPublisherRole,
    workerDatabase: sources.database,
    clock: c.clock,
    resolveActorId: c.resolveActorId,
    readers: sources.readers,
  });
  const preflight = createSourceOwnedExecutorComposition(binding);
  const local = c.environment === 'local' || c.environment === 'ci';
  const runtime = local
    ? sources.createPreparedIntake({
        environment: c.environment === 'ci' ? 'ci' : 'local',
        intakePool: c.intakePool,
        clock: c.clock,
      })
    : null;
  const service = createBoundedAuthenticatedOfficeCommandService({
    readPool: c.boundedReadPool,
    writerPool: c.intakePool,
    readerRole: c.boundedReaderRole,
    writerRole: c.intakeRole,
    authorizationPublisherRole: c.authorizationPublisherRole,
    admittedWorldPins: c.admittedWorldPins,
    auth: c.auth,
    resolveActorId: c.resolveActorId,
    clock: c.clock,
    runtime,
  });
  let phase: 'OPEN' | 'STOPPING' | 'CLOSED' | 'FAULTED' = 'OPEN',
    stopping: Promise<void> | null = null,
    cleanupFailed = false;
  const active = new Map<Promise<unknown>, AbortController>();
  function run<T>(
    signal: AbortSignal | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (phase !== 'OPEN')
      return Promise.reject(Error('SOCIAL_CONNECTION_RETIRED'));
    const controller = new AbortController(),
      abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const api = new RequestCompletion(),
      worker = new WorkerRequestCompletion();
    const promise = (async () => {
      let result: { ok: true; value: T } | { ok: false; error: unknown };
      try {
        result = {
          ok: true,
          value: await api.run(() =>
            worker.run(() => operation(controller.signal)),
          ),
        };
      } catch (error) {
        result = { ok: false, error };
      } finally {
        controller.abort();
        await api.drain();
        await worker.drain();
        worker.retire();
        signal?.removeEventListener('abort', abort);
        if (api.cleanupFailed() || worker.cleanupFailed()) {
          cleanupFailed = true;
        }
      }
      if (api.cleanupFailed() || worker.cleanupFailed())
        throw Error('SOCIAL_CONNECTION_REQUEST_CLEANUP_UNCONFIRMED');
      if (!result.ok) throw result.error;
      return result.value;
    })();
    active.set(promise, controller);
    void promise.then(
      () => active.delete(promise),
      () => active.delete(promise),
    );
    return promise;
  }
  return Object.freeze({
    classification:
      'SOCIAL_SERVER_DEPENDENCIES_INSTALLED_NOT_RUNTIME_ACCEPTANCE' as const,
    preparationMode: local
      ? ('LOCAL_CI_PREPARED_INTAKE' as const)
      : ('PRODUCTION_SOURCE_PREFLIGHT_ONLY' as const),
    preparedRuntime: runtime,
    productionGates: gates,
    async handle(
      request: PostwarSocialCommandHandleRequest,
    ): Promise<SocialCommandServiceResult> {
      if (phase !== 'OPEN') return failure('NOT_CONNECTED');
      if (!local) return failure('SOCIAL_PRODUCTION_EXECUTION_NOT_INSTALLED');
      try {
        const raw: unknown = JSON.parse(canonicalSerialize(request.request));
        if (
          !raw ||
          typeof raw !== 'object' ||
          Array.isArray(raw) ||
          !('request' in raw)
        )
          return failure('PROTOCOL_ERROR', 400);
        const selector = parseManualOfficeCommandRequest(raw.request);
        if (
          selector.officeId !== 'SOCIAL' ||
          !manualFamilies.has(selector.commandType)
        )
          return failure('UNSUPPORTED_SOCIAL_COMMAND', 400);
        if (selector.worldId !== c.admittedWorldPins.worldId)
          return failure('WORLD_BINDING_MISMATCH', 403);
      } catch {
        return failure('PROTOCOL_ERROR', 400);
      }
      return run(request.signal, (signal) =>
        service.handle({ ...request, signal }),
      );
    },
    async preflightOnly(
      request: PostwarSocialPreflightRequest,
    ): Promise<Readonly<PostwarSocialPreflightResult>> {
      if (phase !== 'OPEN')
        return {
          status: 'SOURCE_RUNTIME_UNAVAILABLE' as const,
          commandQueued: false as const,
        };
      if (
        request.command.worldId !== c.admittedWorldPins.worldId ||
        request.command.officeId !== 'SOCIAL' ||
        !manualFamilies.has(request.command.commandType)
      )
        return {
          status: 'SOURCE_PREFLIGHT_NOT_CONFIRMED' as const,
          commandQueued: false as const,
        };
      return run(request.signal, async (signal) => {
        const r = await preflight.preflightOnly({ ...request, signal });
        return Object.freeze({
          status:
            r.status === 'SOURCE_PREFLIGHT_DENIED'
              ? ('SOURCE_PREFLIGHT_NOT_CONFIRMED' as const)
              : r.status,
          commandQueued: false as const,
        });
      });
    },
    stop(): Promise<void> {
      if (stopping) return stopping;
      phase = 'STOPPING';
      for (const controller of active.values()) controller.abort();
      stopping = (async () => {
        const errors: unknown[] = [];
        while (active.size) await Promise.allSettled([...active.keys()]);
        try {
          await preflight.stop();
        } catch (e) {
          errors.push(e);
        }
        try {
          await sources.close();
        } catch (e) {
          errors.push(e);
        }
        const results = await Promise.allSettled(
          pools.map((p) => Promise.resolve().then(() => p.end())),
        );
        for (const r of results)
          if (r.status === 'rejected') errors.push(r.reason);
        if (cleanupFailed) errors.push(Error('REQUEST_CLEANUP_UNCONFIRMED'));
        phase = errors.length ? 'FAULTED' : 'CLOSED';
        if (errors.length) throw Error('SOCIAL_CONNECTION_CLEANUP_UNCONFIRMED');
      })();
      return stopping;
    },
  });
}
