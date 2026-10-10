import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
  type ManualOfficeQueueAcknowledgementDto,
} from '@econmind/core/authenticated-office-command-contract';
import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
import { row, type ProductionReadConfig } from '../production-read/contract.js';
import {
  exactKeys,
  parseOfficeIntent,
  parseQueueAck,
  validOfficeEndpoint,
  type OfficeCommandEndpoint,
} from './contract.js';

export type OfficeSubmitResult =
  | {
      readonly status: 'QUEUE_ACK';
      readonly acknowledgement: ManualOfficeQueueAcknowledgementDto;
    }
  | { readonly status: 'UNKNOWN' | 'NOT_CONNECTED' | 'INVALID_REQUEST' }
  | { readonly status: 'DENIED'; readonly outcomeUnknown: boolean }
  | { readonly status: 'REJECTED'; readonly code: string };

/** One dispatch only. No redirects, cookies, retries, receipt synthesis or storage. */
export function createOfficeCommandClient(
  endpoint: OfficeCommandEndpoint,
  supplied: ProductionReadConfig,
  options: { readonly fetcher?: typeof fetch } = {},
) {
  const usable = validOfficeEndpoint(endpoint, supplied),
    target = usable ? new URL(endpoint.path, endpoint.origin).href : null;
  const c = {
    ...supplied,
    identity: { ...supplied.identity },
    world: { ...supplied.world },
    endpoints: { ...supplied.endpoints },
    session: { ...supplied.session },
  };
  const active = new Set<AbortController>();
  let retired = false;
  const live = () => {
    try {
      return (
        !retired &&
        c.session.isCurrent() &&
        sameAuthorizedIdentity(c.currentIdentity(), c.identity)
      );
    } catch {
      return false;
    }
  };
  function disconnect() {
    retired = true;
    for (const a of active) a.abort();
    active.clear();
  }
  return Object.freeze({
    disconnect,
    async submit(
      input: AuthenticatedOfficeCommandRequestDto,
    ): Promise<OfficeSubmitResult> {
      if (!target || !live()) return { status: 'NOT_CONNECTED' };
      const request = parseOfficeIntent(input, c);
      if (!request) return { status: 'INVALID_REQUEST' };
      const controller = new AbortController();
      active.add(controller);
      let dispatched = false,
        denied = false;
      const interrupted = (): OfficeSubmitResult =>
        denied
          ? { status: 'DENIED', outcomeUnknown: dispatched }
          : { status: dispatched ? 'UNKNOWN' : 'NOT_CONNECTED' };
      let cancel: (result: OfficeSubmitResult) => void = () => undefined;
      const cancellation = new Promise<OfficeSubmitResult>((resolve) => {
        cancel = resolve;
      });
      controller.signal.addEventListener('abort', () => cancel(interrupted()), {
        once: true,
      });
      const timer = setTimeout(() => controller.abort(), 10000);
      async function execute(): Promise<OfficeSubmitResult> {
        try {
          const token = await c.getAccessToken();
          if (!live() || controller.signal.aborted) return interrupted();
          if (
            !token ||
            token.length > 8192 ||
            !/^[A-Za-z0-9._~-]+$/u.test(token)
          )
            return { status: 'NOT_CONNECTED' };
          dispatched = true;
          const response = await (options.fetcher ?? fetch)(target!, {
            method: 'POST',
            body: JSON.stringify(request),
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            credentials: 'omit',
            redirect: 'error',
            cache: 'no-store',
            signal: controller.signal,
          });
          denied = response.status === 401 || response.status === 403;
          if (!live() || controller.signal.aborted || denied)
            return interrupted();
          if (
            response.redirected ||
            (response.url && response.url !== target) ||
            !response.headers
              .get('content-type')
              ?.match(/^application\/json(?:;|$)/iu) ||
            !response.body
          )
            return interrupted();
          const reader = response.body.getReader(),
            chunks: Uint8Array[] = [];
          let size = 0;
          try {
            while (true) {
              const next = await reader.read();
              if (!live() || controller.signal.aborted) return interrupted();
              if (next.done) break;
              size += next.value.byteLength;
              if (size > 1024 * 1024) return interrupted();
              chunks.push(next.value);
            }
          } finally {
            void reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          const e = row(
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
          );
          if (
            !live() ||
            controller.signal.aborted ||
            !e ||
            e.schemaVersion !== AUTHENTICATED_OFFICE_COMMAND_SCHEMA ||
            e.requestId !== request!.requestId ||
            typeof e.ok !== 'boolean'
          )
            return interrupted();
          if (e.ok === true) {
            const ack = parseQueueAck(e.state, request!);
            return response.ok &&
              exactKeys(e, ['schemaVersion', 'requestId', 'ok', 'state']) &&
              ack
              ? { status: 'QUEUE_ACK', acknowledgement: ack }
              : interrupted();
          }
          const error = row(e.error),
            s = row(e.state);
          if (
            !error ||
            !exactKeys(error, ['code', 'retryable']) ||
            typeof error.code !== 'string' ||
            !/^[A-Z][A-Z0-9_]{0,127}$/u.test(error.code) ||
            typeof error.retryable !== 'boolean' ||
            !exactKeys(
              e,
              s
                ? ['schemaVersion', 'requestId', 'ok', 'error', 'state']
                : ['schemaVersion', 'requestId', 'ok', 'error'],
            )
          )
            return interrupted();
          if (error.code === 'WRITE_OUTCOME_UNKNOWN')
            return { status: 'UNKNOWN' };
          if (
            s &&
            exactKeys(s, [
              'status',
              'reason',
              'commandType',
              'submitted',
              'queued',
              'missing',
            ]) &&
            s.status === 'REJECTED' &&
            s.reason === 'SOURCE_RUNTIME_UNAVAILABLE' &&
            error.code === s.reason &&
            s.commandType === request!.request.commandType &&
            s.submitted === false &&
            s.queued === false &&
            Array.isArray(s.missing) &&
            s.missing.length > 0 &&
            s.missing.every((v) =>
              ['ADMITTED_DOMAIN_SOURCE', 'SOLE_DURABLE_CONSUMER'].includes(v),
            )
          )
            return { status: 'REJECTED', code: error.code };
          return !s && response.status >= 400 && response.status < 500
            ? { status: 'REJECTED', code: error.code }
            : interrupted();
        } catch {
          return interrupted();
        }
      }
      try {
        return await Promise.race([execute(), cancellation]);
      } finally {
        clearTimeout(timer);
        active.delete(controller);
        controller.abort();
      }
    },
  });
}
