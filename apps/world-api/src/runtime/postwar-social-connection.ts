/** Node server composition, deliberately not mounted by runtime.ts. Explicit
 * existing pools/config only: no URL discovery, role/source grants, registration,
 * publisher, listener, lease, consumer start or World/Clock activation. */
import type { Pool } from 'pg';
import {
  readPostwarFinanceSocialRuntimeBinding,
  type PostwarFinanceSocialRuntimeConnection,
} from '@econmind/world-worker/finance-social-runtime-connection';
import {
  canonicalSerialize,
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  type AuthenticatedCommandRecoveryResponseDto,
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
  createSocialIntakeAuthorizationPool,
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
import { createBoundedOfficeCommandRecoveryService } from '../integration/bounded-office-command-recovery-service.js';
import { parseRecoveryRequest } from '../runtime-preparation/bounded-executor-transport.js';

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
  /** Explicit HTTP policy only. Empty/absent keeps the combined HTTP mux
   * closed for this Office; existing structured server calls are unchanged. */
  readonly allowedOrigins?: readonly string[];
}
export interface SocialCommandServiceResult {
  readonly httpStatus: number;
  readonly body: AuthenticatedOfficeCommandResponseDto;
}
export interface SocialRecoveryServiceResult {
  readonly httpStatus: number;
  readonly body: AuthenticatedCommandRecoveryResponseDto;
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
  /** Finite genuine DB preparation. No caller seed/Ready, source registration,
   * lease acquisition, consumer start or clock advance. Required before HTTP. */
  prepare(): Promise<void>;
  /** Hidden until immutable preparation succeeds. Remains PREPARED; the
   * explicit sole dispatcher, never this installer, owns manual consumption. */
  readonly preparedRuntime: ManualOfficeIntakeRuntime | null;
  readonly productionGates: readonly string[];
  readonly transportOrigins: readonly string[];
  handleCommand(
    input: PostwarSocialCommandHandleRequest,
  ): Promise<SocialCommandServiceResult>;
  recover(
    input: PostwarSocialCommandHandleRequest,
  ): Promise<SocialRecoveryServiceResult>;
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
  'DEFAULT_NODE_RUNTIME_HAS_NO_AUTOMATIC_SOCIAL_INSTALLATION',
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
  sharedConnection?: Readonly<PostwarFinanceSocialRuntimeConnection>,
  sharedFxPreparation?: Parameters<
    PostwarFinanceSocialRuntimeConnection['prepare']
  >[1],
): Readonly<PostwarSocialConnection> {
  if (sharedFxPreparation !== undefined && !sharedConnection)
    throw Error('SOCIAL_FX_PREPARATION_REQUIRES_GENUINE_SHARED_BINDING');
  let fxPreparation = sharedFxPreparation;
  const c = Object.freeze({
    ...configuration,
    admittedWorldPins: Object.freeze({ ...configuration.admittedWorldPins }),
    auth: Object.freeze({ ...configuration.auth }),
  });
  const transportOrigins = Object.freeze([...new Set(c.allowedOrigins ?? [])]);
  if (
    transportOrigins.length > 8 ||
    transportOrigins.some((s) => {
      try {
        const u = new URL(s);
        return (
          u.protocol !== 'https:' ||
          u.origin !== s ||
          !!u.username ||
          !!u.password
        );
      } catch {
        return true;
      }
    })
  )
    throw Error('SOCIAL_CONNECTION_TRANSPORT_ORIGINS_INVALID');
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
  const shared = sharedConnection
    ? readPostwarFinanceSocialRuntimeBinding(sharedConnection)
    : null;
  if (
    shared &&
    (shared.worldId !== c.admittedWorldPins.worldId ||
      shared.workerId !== c.workerId ||
      shared.clock !== c.clock ||
      shared.environment !== c.environment ||
      shared.rawIntakePool !== c.intakePool ||
      shared.workerPool !== c.workerPool)
  )
    throw Error('SOCIAL_CONNECTION_SHARED_BINDING_MISMATCH');
  const sources =
    shared?.socialConnection ??
    createPostwarSocialRuntimeConnection({
      worldId: c.admittedWorldPins.worldId,
      workerId: c.workerId,
      workerPool: c.workerPool,
      workerRole: c.workerRole,
      openingAdoption: c.openingAdoption,
    });
  // Same fixed wrapper object is used by runtime construction and HTTP.
  // Its private identity must not differ merely due to two adapter instances.
  const intakePool =
    shared?.intakePool ?? createSocialIntakeAuthorizationPool(c.intakePool);
  const binding = createServerCommandHostBinding({
    worldId: c.admittedWorldPins.worldId,
    workerId: c.workerId,
    seedRef: c.admittedWorldPins.seedRef,
    contentHash: c.admittedWorldPins.contentHash,
    admissionRef: c.admittedWorldPins.admissionRef,
    modelVersion: c.modelVersion,
    intakePool,
    sourcePool: c.sourcePool,
    readerRole: c.sourceReaderRole,
    authorizationPublisherRole: c.authorizationPublisherRole,
    workerDatabase: shared?.database ?? sources.database,
    clock: c.clock,
    resolveActorId: c.resolveActorId,
    readers: sources.readers,
    socialRuntimeConnection: sources,
    socialMetadataRead: Object.freeze({
      pool: c.boundedReadPool,
      readerRole: c.boundedReaderRole,
    }),
  });
  const preflight = createSourceOwnedExecutorComposition(binding);
  const local = c.environment === 'local' || c.environment === 'ci';
  const runtime =
    shared?.runtime ??
    (local
      ? sources.createPreparedIntake({
          environment: c.environment === 'ci' ? 'ci' : 'local',
          intakePool,
          clock: c.clock,
        })
      : null);
  const composition: AuthenticatedOfficeCommandServiceConfig = {
    readPool: c.boundedReadPool,
    writerPool: intakePool,
    readerRole: c.boundedReaderRole,
    writerRole: c.intakeRole,
    authorizationPublisherRole: c.authorizationPublisherRole,
    admittedWorldPins: c.admittedWorldPins,
    auth: c.auth,
    resolveActorId: c.resolveActorId,
    clock: c.clock,
    runtime,
  };
  const service = createBoundedAuthenticatedOfficeCommandService(composition);
  const recovery = createBoundedOfficeCommandRecoveryService(composition);
  let phase: 'OPEN' | 'STOPPING' | 'CLOSED' | 'FAULTED' = 'OPEN',
    stopping: Promise<void> | null = null,
    cleanupFailed = false,
    sourcePrepared = false;
  let preparing: Promise<void> | null = null;
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
  const connection: Readonly<PostwarSocialConnection> = Object.freeze({
    classification:
      'SOCIAL_SERVER_DEPENDENCIES_INSTALLED_NOT_RUNTIME_ACCEPTANCE' as const,
    preparationMode: local
      ? ('LOCAL_CI_PREPARED_INTAKE' as const)
      : ('PRODUCTION_SOURCE_PREFLIGHT_ONLY' as const),
    get preparedRuntime() {
      return sourcePrepared && !shared ? runtime : null;
    },
    prepare(): Promise<void> {
      if (phase !== 'OPEN')
        return Promise.reject(Error('SOCIAL_CONNECTION_RETIRED'));
      preparing ??= run(undefined, async () => {
        const preparation = {
          observedAtReal: c.clock.nowReal(),
          admittedWorldPins: c.admittedWorldPins,
          modelVersion: c.modelVersion,
        };
        if (sharedConnection)
          await sharedConnection.prepare(preparation, fxPreparation);
        else await sources.prepare(preparation);
        fxPreparation = undefined;
        if (phase !== 'OPEN') throw Error('SOCIAL_PREPARATION_RETIRED');
        sourcePrepared = true;
      });
      return preparing;
    },
    productionGates: gates,
    transportOrigins,
    handleCommand(
      request: PostwarSocialCommandHandleRequest,
    ): Promise<SocialCommandServiceResult> {
      return connection.handle(request);
    },
    async recover(
      request: PostwarSocialCommandHandleRequest,
    ): Promise<SocialRecoveryServiceResult> {
      const fail = (
        code: string,
        httpStatus = 503,
      ): SocialRecoveryServiceResult => ({
        httpStatus,
        body: {
          schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
          requestId: '00000000-0000-4000-8000-000000000000',
          ok: false,
          error: { code, retryable: false },
        },
      });
      if (phase !== 'OPEN') return fail('NOT_CONNECTED');
      if (!local) return fail('SOCIAL_PRODUCTION_RECOVERY_NOT_INSTALLED');
      try {
        const parsed = parseRecoveryRequest(
          JSON.parse(canonicalSerialize(request.request)),
        );
        const original = parsed.request.originalRequest.request;
        if (
          original.officeId !== 'SOCIAL' ||
          !manualFamilies.has(original.commandType)
        )
          return fail('UNSUPPORTED_SOCIAL_RECOVERY', 400);
        if (parsed.request.worldId !== c.admittedWorldPins.worldId)
          return fail('WORLD_BINDING_MISMATCH', 403);
      } catch {
        return fail('PROTOCOL_ERROR', 400);
      }
      if (!sourcePrepared) return fail('SOURCE_NOT_PREPARED');
      return run(request.signal, (signal) =>
        recovery.handle({ ...request, signal }),
      );
    },
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
      if (!sourcePrepared) return failure('SOURCE_NOT_PREPARED');
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
      fxPreparation = undefined;
      for (const controller of active.values()) controller.abort();
      stopping = (async () => {
        const errors: unknown[] = [];
        while (active.size) await Promise.allSettled([...active.keys()]);
        try {
          await preflight.stop();
        } catch (e) {
          errors.push(e);
        }
        if (!shared) {
          try {
            await sources.close();
          } catch (e) {
            errors.push(e);
          }
        }
        const results = await Promise.allSettled(
          shared ? [] : pools.map((p) => Promise.resolve().then(() => p.end())),
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
  return connection;
}
