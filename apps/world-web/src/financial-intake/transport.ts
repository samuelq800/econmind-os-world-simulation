import {
  AUTHENTICATED_FINANCIAL_INTAKE_PATH,
  AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
  FINANCIAL_INTAKE_OFFICE_ACTIONS,
  type AuthenticatedFinancialIntakeClientPort,
  type AuthenticatedFinancialIntakeResponseDto,
  type FinancialIntakeStateStatus,
} from '@econmind/core';
import {
  canonicalId,
  parseAuthority,
  row,
  uuid,
  validConfig,
  validEndpoints,
  type ProductionReadConfig,
} from '../production-read/contract.js';
import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';

export interface FinancialIntakeEndpoint {
  readonly origin: string;
  readonly path: typeof AUTHENTICATED_FINANCIAL_INTAKE_PATH;
  /** Configuration provenance only; not a seat or server readiness grant. */
  readonly deploymentRef: string;
}
export function validFinancialEndpoint(
  endpoint: FinancialIntakeEndpoint,
  read: ProductionReadConfig,
) {
  return (
    !!endpoint &&
    endpoint.path === AUTHENTICATED_FINANCIAL_INTAKE_PATH &&
    canonicalId(endpoint.deploymentRef) &&
    validConfig(read) &&
    validEndpoints({ ...read.endpoints, origin: endpoint.origin })
  );
}
const statuses: readonly FinancialIntakeStateStatus[] = [
  'PENDING_APPROVAL_OR_ENQUEUE',
  'QUEUED',
  'EXECUTING',
  'FINAL',
  'NOT_FOUND',
  'UNKNOWN',
  'INTENT',
  'SIGNATURE_RECORDED',
  'REFERENCE_BOUND',
];

/** Implements G's public port. No server parser, economic rules, ActorDirectory,
 * Clock, seat grant, URL/storage config, cookies or local fallback. Server owns
 * signature validation. Tokens exist only in the current call's memory. */
export function createFinancialIntakeTransport(
  endpoint: FinancialIntakeEndpoint,
  read: ProductionReadConfig,
  isCurrent: () => boolean,
  options: { readonly fetcher?: typeof fetch } = {},
): AuthenticatedFinancialIntakeClientPort {
  const usable = validFinancialEndpoint(endpoint, read),
    target = usable ? new URL(endpoint.path, endpoint.origin).href : null,
    fetcher = options.fetcher ?? fetch;
  if (usable)
    read = {
      ...read,
      identity: Object.freeze({ ...read.identity }),
      world: Object.freeze({ ...read.world }),
      endpoints: Object.freeze({ ...read.endpoints }),
      session: Object.freeze({ ...read.session }),
    };
  return Object.freeze({
    async execute(
      input: Parameters<AuthenticatedFinancialIntakeClientPort['execute']>[0],
    ) {
      const request = input.request;
      const failure = (
        code: string,
        retryable = false,
      ): AuthenticatedFinancialIntakeResponseDto => ({
        schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
        requestId: request.requestId,
        ok: false,
        error: { code, retryable },
      });
      const uncertain = (): AuthenticatedFinancialIntakeResponseDto => ({
        schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
        requestId: request.requestId,
        ok: false,
        state: { status: 'UNKNOWN' },
      });
      const live = () => {
        try {
          return (
            isCurrent() === true &&
            !input.signal?.aborted &&
            read.session.isCurrent() === true &&
            sameAuthorizedIdentity(read.currentIdentity(), read.identity)
          );
        } catch {
          return false;
        }
      };
      if (!target || !live()) return failure('NOT_CONNECTED');
      const selection = request.request;
      const actions: readonly string[] =
        FINANCIAL_INTAKE_OFFICE_ACTIONS[selection.officeId] ?? [];
      if (actions.length === 0)
        return failure('OFFICE_COMMAND_FAMILY_UNSUPPORTED');
      if (!actions.includes(selection.action))
        return failure('OFFICE_ACTION_UNSUPPORTED');
      if (
        request.schemaVersion !== AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA ||
        !uuid(request.requestId) ||
        selection.schemaVersion !== 'world-staged-transfer-v1' ||
        selection.worldId !== read.identity.worldId ||
        selection.countryId !== read.identity.countryId ||
        selection.officeId !== read.identity.officeId ||
        !canonicalId(selection.commandId) ||
        !canonicalId(selection.idempotencyKey)
      )
        return failure('REQUEST_BINDING_MISMATCH');
      if (
        !input.accessToken ||
        input.accessToken.length > 8192 ||
        !/^[A-Za-z0-9._~-]+$/u.test(input.accessToken)
      )
        return failure('NOT_CONNECTED');
      let serialized: string;
      try {
        serialized = JSON.stringify(request);
      } catch {
        return failure('REQUEST_INVALID');
      }
      if (new TextEncoder().encode(serialized).byteLength > 16384)
        return failure('REQUEST_TOO_LARGE');
      const writes = !['INSPECT', 'READ'].includes(selection.action),
        controller = new AbortController();
      let dispatched = false;
      const interrupted = () =>
        dispatched && writes
          ? uncertain()
          : failure('UPSTREAM_UNAVAILABLE', true);
      let finish: (v: AuthenticatedFinancialIntakeResponseDto) => void = () =>
        undefined;
      const cancellation = new Promise<AuthenticatedFinancialIntakeResponseDto>(
        (resolve) => {
          finish = resolve;
        },
      );
      const abort = () => {
        controller.abort();
        finish(interrupted());
      };
      input.signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 10_000);
      const operation =
        async (): Promise<AuthenticatedFinancialIntakeResponseDto> => {
          try {
            if (!live() || controller.signal.aborted)
              return failure('NOT_CONNECTED');
            // No await between the final fence and dispatch. Never follow redirects.
            dispatched = true;
            const response = await fetcher(target, {
              method: 'POST',
              body: serialized,
              headers: {
                authorization: `Bearer ${input.accessToken}`,
                'content-type': 'application/json',
              },
              credentials: 'omit',
              redirect: 'error',
              cache: 'no-store',
              signal: controller.signal,
            });
            if (!live() || controller.signal.aborted) return interrupted();
            const denied = (): AuthenticatedFinancialIntakeResponseDto => ({
              ...failure('AUTHORIZATION_DENIED'),
              ...(writes ? { state: { status: 'UNKNOWN' } } : {}),
            });
            if (
              response.redirected ||
              (response.url && response.url !== target) ||
              !response.headers
                .get('content-type')
                ?.match(/^application\/json(?:;|$)/iu) ||
              !response.body
            )
              return response.status === 401 || response.status === 403
                ? denied()
                : interrupted();
            const reader = response.body.getReader(),
              chunks: Uint8Array[] = [];
            let bytes = 0;
            try {
              while (true) {
                const next = await reader.read();
                if (!live() || controller.signal.aborted) return interrupted();
                if (next.done) break;
                bytes += next.value.byteLength;
                if (bytes > 1024 * 1024) return interrupted();
                chunks.push(next.value);
              }
            } finally {
              try {
                void reader.cancel().catch(() => undefined);
              } catch {
                /* Best effort. */
              }
              reader.releaseLock();
            }
            const raw = new Uint8Array(bytes);
            let offset = 0;
            for (const chunk of chunks) {
              raw.set(chunk, offset);
              offset += chunk.byteLength;
            }
            const envelope = row(
              JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)),
            );
            if (!live() || controller.signal.aborted) return interrupted();
            if (
              !envelope ||
              envelope.schemaVersion !==
                AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA ||
              envelope.requestId !== request.requestId ||
              typeof envelope.ok !== 'boolean'
            )
              return interrupted();
            const state = row(envelope.state),
              error = row(envelope.error);
            // An explicit UNKNOWN wins over HTTP status. A 403 is never proof of
            // economic rollback; no state is inferred from authentication failure.
            if (state?.status === 'UNKNOWN')
              return response.status === 401 || response.status === 403
                ? denied()
                : uncertain();
            if (response.status === 401 || response.status === 403)
              return failure('AUTHORIZATION_DENIED');
            if (envelope.ok !== true) {
              if (state?.status === 'UNKNOWN') return uncertain();
              if (
                typeof error?.code !== 'string' ||
                !/^[A-Z][A-Z0-9_]{0,127}$/u.test(error.code) ||
                typeof error.retryable !== 'boolean'
              )
                return interrupted();
              return failure(error.code, error.retryable);
            }
            // Consume public response fields, reusing the existing read-binding
            // consistency verifier. Not a second server DTO/economic parser.
            const authority = parseAuthority(envelope.authority, read);
            if (
              !response.ok ||
              !authority ||
              !state ||
              !statuses.includes(state.status as FinancialIntakeStateStatus)
            )
              return interrupted();
            const classification = authority.identity.classification;
            if (
              classification !== 'COUNTRY' &&
              classification !== 'OFFICE_PRIVATE'
            )
              return interrupted();
            return {
              schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
              requestId: request.requestId,
              ok: true,
              authority: {
                ...authority,
                identity: { ...authority.identity, classification },
              },
              state: state as unknown as NonNullable<
                AuthenticatedFinancialIntakeResponseDto['state']
              >,
            };
          } catch {
            return interrupted();
          }
        };
      try {
        return await Promise.race([operation(), cancellation]);
      } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener('abort', abort);
        controller.abort();
      }
    },
  });
}
