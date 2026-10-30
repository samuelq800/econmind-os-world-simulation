/** Explicit server-only HTTP borrower of one genuinely issued Treasury FX
 * runtime. No consumer, source, pool, credential or policy is created here. */
import {
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  type AuthenticatedCommandRecoveryResponseDto,
} from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
  type AuthenticatedOfficeCommandResponseDto,
} from '@econmind/core/authenticated-office-command-contract';
import {
  readPostwarTreasuryFxRuntimeBinding,
  isPostwarTreasuryFxRuntimeConnection,
  type PostwarTreasuryFxRuntimeConnection,
} from '@econmind/world-worker/postwar-treasury-fx-runtime-connection';
import {
  readPostwarFinanceSocialRuntimeBinding,
  type PostwarFinanceSocialRuntimeConnection,
} from '@econmind/world-worker/finance-social-runtime-connection';
import {
  createBoundedAuthenticatedOfficeCommandService,
  type AuthenticatedOfficeCommandServiceConfig,
} from '../integration/bounded-authenticated-office-command-service.js';
import { createBoundedOfficeCommandRecoveryService } from '../integration/bounded-office-command-recovery-service.js';
import {
  parseOfficeEnvelope,
  parseRecoveryRequest,
} from '../runtime-preparation/bounded-executor-transport.js';
import { RequestCompletion } from '../runtime-preparation/request-completion.js';
import { WorkerRequestCompletion } from '@econmind/world-worker/runtime-command-host';
export interface PostwarTreasuryFxHandleRequest {
  readonly authorization: unknown;
  readonly request: unknown;
  readonly signal?: AbortSignal;
}
export interface PostwarTreasuryFxConnection {
  readonly environment: 'local' | 'ci' | null;
  readonly transportOrigins: readonly string[];
  readonly status: 'EXPLICIT_MANUAL_TREASURY_FX_CONNECTION' | 'NOT_CONNECTED';
  handleCommand(input: PostwarTreasuryFxHandleRequest): Promise<{
    readonly httpStatus: number;
    readonly body: AuthenticatedOfficeCommandResponseDto;
  }>;
  recover(input: PostwarTreasuryFxHandleRequest): Promise<{
    readonly httpStatus: number;
    readonly body: AuthenticatedCommandRecoveryResponseDto;
  }>;
  stop(): Promise<void>;
}
export interface PostwarTreasuryFxHttpConfiguration {
  readonly readPool: AuthenticatedOfficeCommandServiceConfig['readPool'];
  readonly readerRole: string;
  readonly intakeRole: string;
  readonly authorizationPublisherRole: string;
  readonly admittedWorldPins: AuthenticatedOfficeCommandServiceConfig['admittedWorldPins'];
  readonly auth: AuthenticatedOfficeCommandServiceConfig['auth'];
  readonly resolveActorId: AuthenticatedOfficeCommandServiceConfig['resolveActorId'];
  readonly allowedOrigins: readonly string[];
}
export interface PostwarTreasuryFxConnectionConfig extends PostwarTreasuryFxHttpConfiguration {
  readonly binding: Readonly<PostwarTreasuryFxRuntimeConnection>;
}
export function createPostwarTreasuryFxConnection(
  config?: PostwarTreasuryFxConnectionConfig | null,
): Readonly<PostwarTreasuryFxConnection>;
export function createPostwarTreasuryFxConnection(
  config: PostwarTreasuryFxHttpConfiguration,
  sharedConnection: Readonly<PostwarFinanceSocialRuntimeConnection>,
): Readonly<PostwarTreasuryFxConnection>;
export function createPostwarTreasuryFxConnection(
  config:
    | PostwarTreasuryFxConnectionConfig
    | PostwarTreasuryFxHttpConfiguration
    | null = null,
  sharedConnection?: Readonly<PostwarFinanceSocialRuntimeConnection>,
): Readonly<PostwarTreasuryFxConnection> {
  const c = config
    ? Object.freeze({
        ...config,
        admittedWorldPins: Object.freeze({ ...config.admittedWorldPins }),
        auth: Object.freeze({ ...config.auth }),
        allowedOrigins: Object.freeze([...new Set(config.allowedOrigins)]),
      })
    : null;
  const shared = sharedConnection
    ? readPostwarFinanceSocialRuntimeBinding(sharedConnection)
    : null;
  if (shared && (!c || 'binding' in c || !shared.treasuryFx))
    throw Error('TREASURY_FX_EXACT_SHARED_SOURCE_REQUIRED');
  let standaloneController: Readonly<PostwarTreasuryFxRuntimeConnection> | null =
    null;
  if (c && !shared && 'binding' in c) {
    if (!isPostwarTreasuryFxRuntimeConnection(c.binding))
      throw Error('TREASURY_FX_GENUINE_LIVE_CONTROLLER_REQUIRED');
    standaloneController = c.binding;
  }
  const standalone = standaloneController
    ? readPostwarTreasuryFxRuntimeBinding(standaloneController)
    : null;
  if (c && !shared && !standalone)
    throw Error('TREASURY_FX_GENUINE_LIVE_CONTROLLER_REQUIRED');
  const ports = shared ?? standalone;
  const environment =
    shared?.environment ?? standalone?.environment.ECONMIND_ENV;
  if (ports && !['local', 'ci'].includes(environment ?? ''))
    throw Error('TREASURY_FX_LOCAL_CI_ONLY');
  if (
    c &&
    ports &&
    (ports.worldId !== c.admittedWorldPins.worldId ||
      ports.intakePool === c.readPool)
  )
    throw Error('TREASURY_FX_EXACT_SERVER_BINDING_REQUIRED');
  if (
    c &&
    (c.allowedOrigins.length > 8 ||
      c.allowedOrigins.some((s) => {
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
      }))
  )
    throw Error('TREASURY_FX_EXPLICIT_HTTPS_ORIGINS_REQUIRED');
  const composition: AuthenticatedOfficeCommandServiceConfig | null =
    c && ports
      ? {
          readPool: c.readPool,
          writerPool: ports.intakePool,
          readerRole: c.readerRole,
          writerRole: c.intakeRole,
          authorizationPublisherRole: c.authorizationPublisherRole,
          admittedWorldPins: c.admittedWorldPins,
          auth: c.auth,
          resolveActorId: c.resolveActorId,
          clock: ports.clock,
          runtime: ports.runtime,
        }
      : null;
  const commands = createBoundedAuthenticatedOfficeCommandService(composition);
  const recovery = createBoundedOfficeCommandRecoveryService(composition);
  let cleanupFailed = false;
  let stopped = false,
    stopping: Promise<void> | undefined;
  const active = new Map<Promise<unknown>, AbortController>();
  function run<T>(
    signal: AbortSignal | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const aborter = new AbortController(),
      abort = () => aborter.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const completion = new RequestCompletion(),
      workerCompletion = new WorkerRequestCompletion();
    const task = (async () => {
      let result: { ok: true; value: T } | { ok: false; error: unknown };
      try {
        result = {
          ok: true,
          value: await completion.run(() =>
            workerCompletion.run(() => operation(aborter.signal)),
          ),
        };
      } catch (error) {
        result = { ok: false, error };
      } finally {
        aborter.abort();
        await completion.drain();
        await workerCompletion.drain();
        workerCompletion.retire();
        signal?.removeEventListener('abort', abort);
        if (completion.cleanupFailed() || workerCompletion.cleanupFailed())
          cleanupFailed = true;
      }
      if (completion.cleanupFailed() || workerCompletion.cleanupFailed())
        throw Error('TREASURY_FX_HTTP_CLEANUP_UNCONFIRMED');
      if (!result.ok) throw result.error;
      return result.value;
    })();
    active.set(task, aborter);
    void task.then(
      () => active.delete(task),
      () => active.delete(task),
    );
    return task;
  }
  function closed(): boolean {
    if (stopped || !c || !ports) return true;
    try {
      return sharedConnection
        ? readPostwarFinanceSocialRuntimeBinding(sharedConnection) !== shared
        : !standaloneController ||
            readPostwarTreasuryFxRuntimeBinding(standaloneController) !==
              standalone;
    } catch {
      return true;
    }
  }
  return Object.freeze({
    environment: ports
      ? environment === 'ci'
        ? ('ci' as const)
        : ('local' as const)
      : null,
    status: c
      ? ('EXPLICIT_MANUAL_TREASURY_FX_CONNECTION' as const)
      : ('NOT_CONNECTED' as const),
    transportOrigins: c?.allowedOrigins ?? Object.freeze([]),
    async handleCommand(input: PostwarTreasuryFxHandleRequest) {
      const fail = (httpStatus: number, code: string) => ({
        httpStatus,
        body: {
          schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
          requestId: '00000000-0000-4000-8000-000000000000',
          ok: false as const,
          error: { code, retryable: false },
        },
      });
      if (closed()) return fail(503, 'NOT_CONNECTED');
      try {
        const r = parseOfficeEnvelope(input.request);
        if (
          r.request.commandType !== POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND ||
          r.request.officeId !== 'FINANCE'
        )
          return fail(400, 'UNSUPPORTED_TREASURY_FX_COMMAND');
        if (r.request.worldId !== ports!.worldId)
          return fail(403, 'WORLD_BINDING_MISMATCH');
      } catch {
        return fail(400, 'PROTOCOL_ERROR');
      }
      return run(input.signal, (signal) =>
        commands.handle({ ...input, signal }),
      );
    },
    async recover(input: PostwarTreasuryFxHandleRequest) {
      const fail = (httpStatus: number, code: string) => ({
        httpStatus,
        body: {
          schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
          requestId: '00000000-0000-4000-8000-000000000000',
          ok: false as const,
          error: { code, retryable: false },
        },
      });
      if (closed()) return fail(503, 'NOT_CONNECTED');
      try {
        const r = parseRecoveryRequest(input.request),
          o = r.request.originalRequest.request;
        if (
          o.commandType !== POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND ||
          o.officeId !== 'FINANCE'
        )
          return fail(400, 'UNSUPPORTED_TREASURY_FX_RECOVERY');
        if (o.worldId !== ports!.worldId)
          return fail(403, 'WORLD_BINDING_MISMATCH');
      } catch {
        return fail(400, 'PROTOCOL_ERROR');
      }
      return run(input.signal, (signal) =>
        recovery.handle({ ...input, signal }),
      );
    },
    stop() {
      stopped = true;
      stopping ??= (async () => {
        for (const c of active.values()) c.abort();
        while (active.size) await Promise.allSettled([...active.keys()]);
        if (cleanupFailed) throw Error('TREASURY_FX_HTTP_CLEANUP_UNCONFIRMED');
      })();
      return stopping;
    },
  });
}
