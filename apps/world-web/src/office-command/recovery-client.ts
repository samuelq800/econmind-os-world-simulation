/** Read-only recovery of the exact original request. No command retry, source
 * assertion, storage, synthesized fingerprint or economic result is created. */
import {
  AUTHENTICATED_COMMAND_RECOVERY_PATH,
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  type AuthenticatedCommandRecoveryResponseDto,
  type ManualCommandFinalReceiptDto,
} from '@econmind/core/authenticated-command-recovery-contract';
import type { AuthenticatedOfficeCommandRequestDto } from '@econmind/core/authenticated-office-command-contract';
import { sameAuthorizedIdentity } from '../prototype/authorized-read-adapter.js';
import {
  canonicalId,
  hash,
  row,
  uuid,
  version,
  type ProductionReadConfig,
} from '../production-read/contract.js';
import {
  exactKeys,
  officeRecoveryRequest,
  parseOfficeIntent,
  validOfficeEndpoint,
  MAX_OFFICE_TRANSPORT_REQUEST_BYTES,
  type OfficeCommandEndpoint,
} from './contract.js';
export type OfficeRecoveryResult =
  | {
      readonly status: 'PENDING';
      readonly state: Extract<
        Extract<AuthenticatedCommandRecoveryResponseDto, { ok: true }>['state'],
        { status: 'QUEUED' | 'CLAIMED' }
      >;
    }
  | { readonly status: 'FINAL'; readonly receipt: ManualCommandFinalReceiptDto }
  | {
      readonly status:
        'DENIED' | 'NOT_CONNECTED' | 'INVALID_REQUEST' | 'UNAVAILABLE';
      readonly code?: string;
    };
function parseResponse(
  value: unknown,
  original: AuthenticatedOfficeCommandRequestDto,
  requestId: string,
  known?: string,
): OfficeRecoveryResult | null {
  const e = row(value),
    state = row(e?.state);
  if (
    !e ||
    e.schemaVersion !== AUTHENTICATED_COMMAND_RECOVERY_SCHEMA ||
    e.requestId !== requestId ||
    e.ok !== true ||
    !exactKeys(e, ['schemaVersion', 'requestId', 'ok', 'state']) ||
    !state ||
    state.commandType !== original.request.commandType
  )
    return null;
  if (state.status === 'QUEUED' || state.status === 'CLAIMED') {
    if (
      !exactKeys(state, [
        'status',
        'commandType',
        'commandId',
        'idempotencyKey',
        'commandFingerprint',
      ]) ||
      state.commandId !== original.request.commandId ||
      state.idempotencyKey !== original.request.idempotencyKey ||
      !hash(state.commandFingerprint) ||
      (known !== undefined && state.commandFingerprint !== known)
    )
      return null;
    return {
      status: 'PENDING',
      state: Object.freeze({ ...state }) as Extract<
        Extract<AuthenticatedCommandRecoveryResponseDto, { ok: true }>['state'],
        { status: 'QUEUED' | 'CLAIMED' }
      >,
    };
  }
  const r = row(state.receipt);
  if (
    state.status !== 'FINAL' ||
    !exactKeys(state, ['status', 'commandType', 'receipt']) ||
    !r ||
    !exactKeys(r, [
      'source',
      'schemaVersion',
      'worldId',
      'commandId',
      'idempotencyKey',
      'commandFingerprint',
      'outcome',
      'reasonCode',
      'transitionId',
      'worldVersionBefore',
      'worldVersionAfter',
      'simTime',
      'eventIds',
      'recordedAtReal',
    ]) ||
    r.source !== 'DURABLE_FINAL_COMMAND_RECEIPT' ||
    r.schemaVersion !== 'command-receipt-v2' ||
    r.worldId !== original.request.worldId ||
    r.commandId !== original.request.commandId ||
    r.idempotencyKey !== original.request.idempotencyKey ||
    !hash(r.commandFingerprint) ||
    (known !== undefined && r.commandFingerprint !== known) ||
    !['COMMITTED', 'REJECTED', 'AUTHORIZATION_REVOKED'].includes(
      String(r.outcome),
    ) ||
    !version(r.simTime) ||
    !Array.isArray(r.eventIds) ||
    r.eventIds.length > 1000 ||
    !r.eventIds.every(canonicalId) ||
    new Set(r.eventIds).size !== r.eventIds.length ||
    typeof r.recordedAtReal !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(r.recordedAtReal) ||
    Number.isNaN(Date.parse(r.recordedAtReal)) ||
    new Date(r.recordedAtReal).toISOString() !== r.recordedAtReal
  )
    return null;
  const committed = r.outcome === 'COMMITTED';
  if (
    committed
      ? r.reasonCode !== null ||
        !canonicalId(r.transitionId) ||
        !version(r.worldVersionBefore) ||
        !version(r.worldVersionAfter) ||
        r.worldVersionBefore !== original.request.expectedWorldVersion ||
        BigInt(r.worldVersionAfter) !== BigInt(r.worldVersionBefore) + 1n ||
        r.eventIds.length === 0
      : r.transitionId !== null ||
        r.worldVersionBefore !== null ||
        r.worldVersionAfter !== null ||
        r.eventIds.length !== 0 ||
        typeof r.reasonCode !== 'string' ||
        !/^[A-Z][A-Z0-9_]{0,127}$/u.test(r.reasonCode)
  )
    return null;
  return {
    status: 'FINAL',
    receipt: Object.freeze({
      ...r,
      eventIds: Object.freeze([...r.eventIds]),
    }) as unknown as ManualCommandFinalReceiptDto,
  };
}
export function createOfficeRecoveryClient(
  endpoint: OfficeCommandEndpoint,
  supplied: ProductionReadConfig,
  options: { readonly fetcher?: typeof fetch } = {},
) {
  const target = validOfficeEndpoint(endpoint, supplied)
      ? new URL(AUTHENTICATED_COMMAND_RECOVERY_PATH, endpoint.origin).href
      : null,
    c = {
      ...supplied,
      identity: { ...supplied.identity },
      session: { ...supplied.session },
    },
    active = new Set<AbortController>();
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
    async recover(
      original: AuthenticatedOfficeCommandRequestDto,
      requestId: string,
      knownCommandFingerprint?: string,
    ): Promise<OfficeRecoveryResult> {
      if (!target || !live()) return { status: 'NOT_CONNECTED' };
      const parsed = parseOfficeIntent(original, c);
      if (
        !parsed ||
        !uuid(requestId) ||
        (knownCommandFingerprint !== undefined &&
          !hash(knownCommandFingerprint))
      )
        return { status: 'INVALID_REQUEST' };
      const request = officeRecoveryRequest(
          parsed,
          requestId,
          knownCommandFingerprint,
        ),
        body = JSON.stringify(request);
      if (
        new TextEncoder().encode(body).byteLength >
        MAX_OFFICE_TRANSPORT_REQUEST_BYTES
      )
        return {
          status: 'INVALID_REQUEST',
          code: 'RECOVERY_REQUEST_TOO_LARGE',
        };
      const controller = new AbortController();
      active.add(controller);
      let cancelled!: () => void;
      const cancellation = new Promise<OfficeRecoveryResult>((resolve) => {
        cancelled = () => resolve({ status: 'UNAVAILABLE' });
      });
      controller.signal.addEventListener('abort', cancelled, { once: true });
      const timer = setTimeout(() => controller.abort(), 10000);
      async function execute(): Promise<OfficeRecoveryResult> {
        try {
          const token = await c.getAccessToken();
          if (!live() || controller.signal.aborted)
            return { status: 'NOT_CONNECTED' };
          if (
            !token ||
            token.length > 8192 ||
            !/^[A-Za-z0-9._~-]+$/u.test(token)
          )
            return { status: 'NOT_CONNECTED' };
          const response = await (options.fetcher ?? fetch)(target!, {
            method: 'POST',
            body,
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            credentials: 'omit',
            redirect: 'error',
            cache: 'no-store',
            signal: controller.signal,
          });
          if (!live() || controller.signal.aborted)
            return { status: 'NOT_CONNECTED' };
          if (response.status === 401 || response.status === 403)
            return { status: 'DENIED' };
          if (
            response.redirected ||
            (response.url && response.url !== target) ||
            !response.headers
              .get('content-type')
              ?.match(/^application\/json(?:;|$)/iu) ||
            !response.body
          )
            return { status: 'UNAVAILABLE' };
          const reader = response.body.getReader(),
            chunks: Uint8Array[] = [];
          let size = 0;
          try {
            while (true) {
              const r = await reader.read();
              if (!live() || controller.signal.aborted)
                return { status: 'NOT_CONNECTED' };
              if (r.done) break;
              size += r.value.byteLength;
              if (size > 1048576) return { status: 'UNAVAILABLE' };
              chunks.push(r.value);
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
          const value: unknown = JSON.parse(
              new TextDecoder('utf-8', { fatal: true }).decode(bytes),
            ),
            e = row(value);
          if (!live() || controller.signal.aborted)
            return { status: 'NOT_CONNECTED' };
          if (response.ok)
            return (
              parseResponse(
                value,
                parsed!,
                requestId,
                knownCommandFingerprint,
              ) ?? { status: 'UNAVAILABLE' }
            );
          const error = row(e?.error);
          if (
            e &&
            exactKeys(e, ['schemaVersion', 'requestId', 'ok', 'error']) &&
            e.schemaVersion === AUTHENTICATED_COMMAND_RECOVERY_SCHEMA &&
            e.requestId === requestId &&
            e.ok === false &&
            error &&
            exactKeys(error, ['code', 'retryable']) &&
            typeof error.code === 'string' &&
            /^[A-Z][A-Z0-9_]{0,127}$/u.test(error.code) &&
            typeof error.retryable === 'boolean'
          )
            return { status: 'UNAVAILABLE', code: error.code };
          return { status: 'UNAVAILABLE' };
        } catch {
          return { status: live() ? 'UNAVAILABLE' : 'NOT_CONNECTED' };
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
