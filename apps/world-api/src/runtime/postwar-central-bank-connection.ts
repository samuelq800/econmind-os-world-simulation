/** Explicit server-only HTTP borrower of one genuinely issued Central Bank
 * runtime. No consumer, source, pool, credential or policy is created here. */
import {
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  CENTRAL_BANK_OMO_COMMAND,
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
export interface PostwarCentralBankHandleRequest {
  readonly authorization: unknown;
  readonly request: unknown;
  readonly signal?: AbortSignal;
}
export interface PostwarCentralBankConnection {
  readonly environment: 'local' | 'ci' | 'staging' | 'production' | null;
  readonly transportOrigins: readonly string[];
  readonly status: 'EXPLICIT_MANUAL_CENTRAL_BANK_CONNECTION' | 'NOT_CONNECTED';
  handleCommand(input: PostwarCentralBankHandleRequest): Promise<{
    readonly httpStatus: number;
    readonly body: AuthenticatedOfficeCommandResponseDto;
  }>;
  recover(input: PostwarCentralBankHandleRequest): Promise<{
    readonly httpStatus: number;
    readonly body: AuthenticatedCommandRecoveryResponseDto;
  }>;
  stop(): Promise<void>;
}
export interface PostwarCentralBankHttpConfiguration {
  readonly readPool: AuthenticatedOfficeCommandServiceConfig['readPool'];
  readonly readerRole: string;
  readonly intakeRole: string;
  readonly authorizationPublisherRole: string;
  readonly admittedWorldPins: AuthenticatedOfficeCommandServiceConfig['admittedWorldPins'];
  readonly auth: AuthenticatedOfficeCommandServiceConfig['auth'];
  readonly resolveActorId: AuthenticatedOfficeCommandServiceConfig['resolveActorId'];
  readonly allowedOrigins: readonly string[];
}
export function createPostwarCentralBankConnection(
  config: PostwarCentralBankHttpConfiguration | null = null,
  sharedConnection?: Readonly<PostwarFinanceSocialRuntimeConnection>,
): Readonly<PostwarCentralBankConnection> {
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
  if (c && (!shared || !shared.centralBankOmo))
    throw Error('CENTRAL_BANK_EXACT_SHARED_SOURCE_REQUIRED');
  if (!c && shared)
    throw Error('CENTRAL_BANK_EXACT_HTTP_CONFIGURATION_REQUIRED');
  const ports = shared;
  const environment = shared?.environment;
  // Formal transports borrow only the privately issued shared controller.
  // An environment label or a standalone local controller is never a permit.
  if (
    ports &&
    !['local', 'ci'].includes(environment ?? '') &&
    !(
      shared?.formalBinding &&
      ['staging', 'production'].includes(environment ?? '')
    )
  )
    throw Error('CENTRAL_BANK_LOCAL_CI_ONLY');
  if (
    c &&
    ports &&
    (ports.worldId !== c.admittedWorldPins.worldId ||
      ports.intakePool === c.readPool)
  )
    throw Error('CENTRAL_BANK_EXACT_SERVER_BINDING_REQUIRED');
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
    throw Error('CENTRAL_BANK_EXPLICIT_HTTPS_ORIGINS_REQUIRED');
  const composition: AuthenticatedOfficeCommandServiceConfig | null =
    c && ports
      ? {
          readPool: c.readPool,
          writerPool: ports.intakePool,
          recoveryBindingMode: 'POSTWAR_CENTRAL_BANK_READ_ONLY_V1',
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
        throw Error('CENTRAL_BANK_HTTP_CLEANUP_UNCONFIRMED');
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
    environment: shared
      ? shared.environment
      : ports && environment === 'ci'
        ? ('ci' as const)
        : ports && environment === 'local'
          ? ('local' as const)
          : null,
    status: c
      ? ('EXPLICIT_MANUAL_CENTRAL_BANK_CONNECTION' as const)
      : ('NOT_CONNECTED' as const),
    transportOrigins: c?.allowedOrigins ?? Object.freeze([]),
    async handleCommand(input: PostwarCentralBankHandleRequest) {
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
          r.request.commandType !== CENTRAL_BANK_OMO_COMMAND ||
          r.request.officeId !== 'CENTRAL_BANK'
        )
          return fail(400, 'UNSUPPORTED_CENTRAL_BANK_COMMAND');
        if (r.request.worldId !== ports!.worldId)
          return fail(403, 'WORLD_BINDING_MISMATCH');
      } catch {
        return fail(400, 'PROTOCOL_ERROR');
      }
      return run(input.signal, (signal) =>
        commands.handle({ ...input, signal }),
      );
    },
    async recover(input: PostwarCentralBankHandleRequest) {
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
          o.commandType !== CENTRAL_BANK_OMO_COMMAND ||
          o.officeId !== 'CENTRAL_BANK'
        )
          return fail(400, 'UNSUPPORTED_CENTRAL_BANK_RECOVERY');
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
        if (cleanupFailed) throw Error('CENTRAL_BANK_HTTP_CLEANUP_UNCONFIRMED');
      })();
      return stopping;
    },
  });
}
