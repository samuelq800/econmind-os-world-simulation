/** Explicit server-only HTTP borrower of one genuinely issued Captain
 * runtime. No consumer, source, pool, credential or policy is created here. */
import {
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  type AuthenticatedCommandRecoveryResponseDto,
} from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandResponseDto,
} from '@econmind/core/authenticated-office-command-contract';
import {
  readPostwarFinanceSocialRuntimeBinding,
  type PostwarFinanceSocialRuntimeConnection,
} from '@econmind/world-worker/finance-social-runtime-connection';
import { createBoundedAuthenticatedOfficeCommandService } from '../integration/bounded-authenticated-office-command-service.js';
import type { AuthenticatedOfficeCommandServiceConfig } from '../integration/authenticated-office-command-service.js';
import { createBoundedOfficeCommandRecoveryService } from '../integration/bounded-office-command-recovery-service.js';
import {
  parseOfficeEnvelope,
  parseRecoveryRequest,
} from '../runtime-preparation/bounded-executor-transport.js';
import { RequestCompletion } from '../runtime-preparation/request-completion.js';
import { WorkerRequestCompletion } from '@econmind/world-worker/runtime-command-host';
export interface PostwarCaptainHandleRequest {
  readonly authorization: unknown;
  readonly request: unknown;
  readonly signal?: AbortSignal;
}
export interface PostwarCaptainConnection {
  readonly environment: 'local' | 'ci' | null;
  readonly transportOrigins: readonly string[];
  readonly status: 'EXPLICIT_MANUAL_CAPTAIN_CONNECTION' | 'NOT_CONNECTED';
  handleCommand(input: PostwarCaptainHandleRequest): Promise<{
    readonly httpStatus: number;
    readonly body: AuthenticatedOfficeCommandResponseDto;
  }>;
  recover(input: PostwarCaptainHandleRequest): Promise<{
    readonly httpStatus: number;
    readonly body: AuthenticatedCommandRecoveryResponseDto;
  }>;
  stop(): Promise<void>;
}
export interface PostwarCaptainHttpConfiguration {
  readonly readPool: AuthenticatedOfficeCommandServiceConfig['readPool'];
  readonly readerRole: string;
  readonly intakeRole: string;
  readonly authorizationPublisherRole: string;
  readonly admittedWorldPins: AuthenticatedOfficeCommandServiceConfig['admittedWorldPins'];
  readonly auth: AuthenticatedOfficeCommandServiceConfig['auth'];
  readonly resolveActorId: AuthenticatedOfficeCommandServiceConfig['resolveActorId'];
  readonly allowedOrigins: readonly string[];
}
export function createPostwarCaptainConnection(
  config: PostwarCaptainHttpConfiguration | null = null,
  sharedConnection?: Readonly<PostwarFinanceSocialRuntimeConnection>,
): Readonly<PostwarCaptainConnection> {
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
  if (c && (!shared || !shared.captain))
    throw Error('CAPTAIN_EXACT_SHARED_SOURCE_REQUIRED');
  if (!c && shared) throw Error('CAPTAIN_EXACT_HTTP_CONFIGURATION_REQUIRED');
  const ports = shared;
  const environment = shared?.environment;
  if (ports && !['local', 'ci'].includes(environment ?? ''))
    throw Error('CAPTAIN_LOCAL_CI_ONLY');
  if (
    c &&
    ports &&
    (ports.worldId !== c.admittedWorldPins.worldId ||
      ports.intakePool === c.readPool)
  )
    throw Error('CAPTAIN_EXACT_SERVER_BINDING_REQUIRED');
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
    throw Error('CAPTAIN_EXPLICIT_HTTPS_ORIGINS_REQUIRED');
  const composition: AuthenticatedOfficeCommandServiceConfig | null =
    c && ports
      ? {
          readPool: c.readPool,
          writerPool: ports.intakePool,
          recoveryBindingMode: 'POSTWAR_CAPTAIN_READ_ONLY_V1',
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
        throw Error('CAPTAIN_HTTP_CLEANUP_UNCONFIRMED');
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
      return (
        !sharedConnection ||
        readPostwarFinanceSocialRuntimeBinding(sharedConnection) !== shared
      );
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
      ? ('EXPLICIT_MANUAL_CAPTAIN_CONNECTION' as const)
      : ('NOT_CONNECTED' as const),
    transportOrigins: c?.allowedOrigins ?? Object.freeze([]),
    async handleCommand(input: PostwarCaptainHandleRequest) {
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
          r.request.commandType !== CAPTAIN_POLITICAL_CAPITAL_COMMAND ||
          r.request.officeId !== 'CAPTAIN'
        )
          return fail(400, 'UNSUPPORTED_CAPTAIN_COMMAND');
        if (r.request.worldId !== ports!.worldId)
          return fail(403, 'WORLD_BINDING_MISMATCH');
      } catch {
        return fail(400, 'PROTOCOL_ERROR');
      }
      return run(input.signal, (signal) =>
        commands.handle({ ...input, signal }),
      );
    },
    async recover(input: PostwarCaptainHandleRequest) {
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
          o.commandType !== CAPTAIN_POLITICAL_CAPITAL_COMMAND ||
          o.officeId !== 'CAPTAIN'
        )
          return fail(400, 'UNSUPPORTED_CAPTAIN_RECOVERY');
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
        if (cleanupFailed) throw Error('CAPTAIN_HTTP_CLEANUP_UNCONFIRMED');
      })();
      return stopping;
    },
  });
}
