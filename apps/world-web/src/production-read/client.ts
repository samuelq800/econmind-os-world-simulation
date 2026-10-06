import type { BrowserFinalReceipt } from '../authorized-client/client.js';
import { createScopedProjectionCache } from '../reconnect/scoped-cache.js';
import {
  resolveAuthorizedUi,
  sameAuthorizedIdentity,
} from '../prototype/authorized-read-adapter.js';
import { parseFinalReceiptLookupResponse } from '../prototype/final-receipt-lookup.js';
import {
  AUTHORIZED_READ_BINDING_SCHEMA,
  canonicalId,
  hash,
  parseAuthority,
  row,
  uuid,
  validConfig,
  version,
  type ProductionReadConfig,
  type ServerReadAuthority,
} from './contract.js';

export interface FinalLookupIdentity {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
}
type Failure = {
  readonly status:
    'NOT_CONNECTED' | 'STALE' | 'DENIED' | 'NOT_FOUND' | 'UNAVAILABLE';
};
export type ProjectionResult =
  | Failure
  | {
      readonly status: 'PROJECTION';
      readonly source: 'DERIVED_SERVER_PROJECTION';
      readonly worldVersion: string;
      readonly snapshotRef: string;
      readonly payload: unknown;
      readonly authority: ServerReadAuthority;
    };
export type FinalLookupResult =
  | Failure
  | {
      readonly status: 'FINAL_RECEIPT';
      readonly receipt: BrowserFinalReceipt;
      readonly authority: ServerReadAuthority;
    };
export interface ProductionReadPort {
  state(): 'NOT_CONNECTED' | 'READ_ONLY_BOUND';
  readProjection(requestId: string): Promise<ProjectionResult>;
  lookupFinal(
    requestId: string,
    identity: FinalLookupIdentity,
  ): Promise<FinalLookupResult>;
  disconnect(): void;
}
const disconnected: ProductionReadPort = Object.freeze({
  state: () => 'NOT_CONNECTED',
  readProjection: async (): Promise<ProjectionResult> => ({
    status: 'NOT_CONNECTED',
  }),
  lookupFinal: async (): Promise<FinalLookupResult> => ({
    status: 'NOT_CONNECTED',
  }),
  disconnect: () => undefined,
});
const maxBytes = 1024 * 1024;
const timestamp = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString() === v;

/** Unmounted read-only client. Trusted config is consistency input, never a seat grant. */
export function createProductionReadClient(
  config: ProductionReadConfig | null = null,
  transport: { readonly fetcher?: typeof fetch } = {},
): Readonly<ProductionReadPort> {
  if (!validConfig(config)) return disconnected;
  const c: ProductionReadConfig = {
    ...config,
    endpoints: Object.freeze({ ...config.endpoints }),
    world: Object.freeze({ ...config.world }),
    identity: Object.freeze({ ...config.identity }),
    session: Object.freeze({ ...config.session }),
  };
  const cache = createScopedProjectionCache(),
    active = new Set<AbortController>();
  const fetcher = transport.fetcher ?? fetch;
  let retired = false,
    bound = false,
    unsubscribe: (() => void) | null = null;
  let observedWorldVersion = c.world.minimumWorldVersion;
  let retirementReason: 'STALE' | 'DENIED' = 'STALE';
  function retire(reason: 'STALE' | 'DENIED' = 'STALE') {
    if (!retired) retirementReason = reason;
    retired = true;
    bound = false;
    cache.revokeAuthorization();
    for (const controller of active) controller.abort();
    active.clear();
    const cleanup = unsubscribe;
    unsubscribe = null;
    try {
      cleanup?.();
    } catch {
      /* Already retired; host cleanup cannot reconnect. */
    }
  }
  function current() {
    try {
      return (
        !retired &&
        c.session.isCurrent() === true &&
        sameAuthorizedIdentity(c.currentIdentity(), c.identity)
      );
    } catch {
      return false;
    }
  }
  function ensureCurrent() {
    if (current()) return true;
    retire();
    return false;
  }
  function failure(status: Failure['status']): Failure {
    bound = false;
    cache.revokeAuthorization();
    return { status };
  }
  try {
    const cleanup = c.session.onInvalidate(retire);
    if (typeof cleanup !== 'function') return disconnected;
    unsubscribe = cleanup;
    if (retired) retire();
  } catch {
    retire();
    return disconnected;
  }
  if (!ensureCurrent()) {
    return disconnected;
  }

  async function request(
    path: string,
    requestId: string,
    body: object,
  ): Promise<
    | Failure
    | {
        readonly status: 'RESPONSE';
        readonly result: Record<string, unknown>;
        readonly authority: ServerReadAuthority;
      }
  > {
    if (!ensureCurrent()) {
      return { status: 'NOT_CONNECTED' };
    }
    const controller = new AbortController();
    active.add(controller);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let resolveCancellation: ((value: Failure) => void) | undefined;
    const cancelled = new Promise<Failure>((resolve) => {
      resolveCancellation = resolve;
    });
    const onAbort = () =>
      resolveCancellation?.({
        status: timedOut ? 'UNAVAILABLE' : retirementReason,
      });
    controller.signal.addEventListener('abort', onAbort, { once: true });
    const requestFailure = (status: Failure['status']): Failure =>
      controller.signal.aborted ? { status } : failure(status);
    const timeout = new Promise<Failure>((resolve) => {
      deadline = setTimeout(() => {
        timedOut = true;
        const result = failure('UNAVAILABLE');
        controller.abort();
        resolve(result);
      }, 10_000);
    });
    const operation = async (): Promise<
      | Failure
      | {
          status: 'RESPONSE';
          result: Record<string, unknown>;
          authority: ServerReadAuthority;
        }
    > => {
      try {
        const token = await c.getAccessToken();
        if (!ensureCurrent() || controller.signal.aborted)
          return requestFailure('STALE');
        if (!token || token.length > 8192 || !/^[A-Za-z0-9._~-]+$/u.test(token))
          return failure('NOT_CONNECTED');
        const serialized = JSON.stringify(body);
        if (new TextEncoder().encode(serialized).byteLength > 16384)
          return failure('UNAVAILABLE');
        // No await between the final lifetime fence and dispatch; only fixed read paths.
        if (!ensureCurrent() || controller.signal.aborted)
          return requestFailure('STALE');
        const target = new URL(path, c.endpoints.origin);
        const response = await fetcher(target, {
          method: 'POST',
          body: serialized,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!ensureCurrent() || controller.signal.aborted)
          return requestFailure('STALE');
        if (response.status === 401 || response.status === 403) {
          retire('DENIED');
          return { status: 'DENIED' };
        }
        if (
          !response.ok ||
          response.redirected ||
          (response.url !== '' && response.url !== target.href) ||
          !response.headers
            .get('content-type')
            ?.match(/^application\/json(?:;|$)/iu) ||
          !response.body
        )
          return failure('UNAVAILABLE');
        const reader = response.body.getReader(),
          chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (true) {
            const next = await reader.read();
            if (!ensureCurrent() || controller.signal.aborted) {
              // Retirement precedes best-effort cleanup; a host stream may hang.
              try {
                void reader.cancel().catch(() => undefined);
              } catch {
                /* Cancellation cannot restore the retired lifetime. */
              }
              return requestFailure('STALE');
            }
            if (next.done) break;
            bytes += next.value.byteLength;
            if (bytes > maxBytes) {
              await reader.cancel();
              return failure('UNAVAILABLE');
            }
            chunks.push(next.value);
          }
        } finally {
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
        if (!ensureCurrent() || controller.signal.aborted)
          return requestFailure('STALE');
        if (
          !envelope ||
          envelope.schemaVersion !== AUTHORIZED_READ_BINDING_SCHEMA ||
          envelope.requestId !== requestId
        )
          return failure('UNAVAILABLE');
        if (envelope.ok !== true) {
          if (row(envelope.error)?.code === 'AUTHORIZATION_DENIED') {
            retire('DENIED');
            return { status: 'DENIED' };
          }
          return failure(
            row(envelope.error)?.code === 'NOT_CONNECTED'
              ? 'NOT_CONNECTED'
              : 'UNAVAILABLE',
          );
        }
        const authority = parseAuthority(envelope.authority, c),
          result = row(envelope.result);
        if (!authority || !result || result.requestId !== requestId)
          return failure('UNAVAILABLE');
        if (
          BigInt(authority.readback.worldVersion) < BigInt(observedWorldVersion)
        )
          return { status: 'STALE' };
        if (result.ok !== true) {
          const code = row(result.error)?.code;
          if (
            [
              'AUTHENTICATION_REQUIRED',
              'AUTHENTICATION_INVALID',
              'AUTHORIZATION_DENIED',
            ].includes(String(code))
          ) {
            retire('DENIED');
            return { status: 'DENIED' };
          }
          return failure(code === 'NOT_FOUND' ? 'NOT_FOUND' : 'UNAVAILABLE');
        }
        return { status: 'RESPONSE', result, authority };
      } catch {
        return requestFailure(ensureCurrent() ? 'UNAVAILABLE' : 'STALE');
      }
    };
    try {
      return await Promise.race([operation(), timeout, cancelled]);
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
      active.delete(controller);
      controller.signal.removeEventListener('abort', onAbort);
    }
  }
  return Object.freeze({
    state: () => {
      ensureCurrent();
      return bound && !retired ? 'READ_ONLY_BOUND' : 'NOT_CONNECTED';
    },
    disconnect: () => retire(),
    async readProjection(requestId: string): Promise<ProjectionResult> {
      if (!uuid(requestId)) return failure('UNAVAILABLE');
      const response = await request(c.endpoints.projectionPath, requestId, {
        schemaVersion: 'world-read-api-v1',
        requestId,
        operation: 'READ_WORLD_PROJECTION',
        payload: {
          worldId: c.identity.worldId,
          classification: c.identity.classification,
          scopeKey: c.identity.scopeKey,
        },
      });
      if (response.status !== 'RESPONSE') return response;
      const data = row(response.result.data),
        watermark = row(data?.watermark);
      if (
        response.result.schemaVersion !== 'world-read-api-v1' ||
        !data ||
        !watermark ||
        data.schemaVersion !== 'world-projection-read-v1' ||
        data.worldId !== c.identity.worldId ||
        data.classification !== c.identity.classification ||
        data.scopeKey !== c.identity.scopeKey ||
        !version(watermark.worldVersion) ||
        !version(watermark.eventSequence) ||
        !timestamp(watermark.generatedAt) ||
        watermark.worldVersion !== response.authority.readback.worldVersion ||
        watermark.eventSequence !== response.authority.readback.eventSequence ||
        !Array.isArray(data.receipts) ||
        !Array.isArray(data.events) ||
        data.payload === undefined
      )
        return failure('UNAVAILABLE');
      if (!ensureCurrent()) {
        return { status: 'STALE' };
      }
      cache.bindAuthorization(
        c.identity.authSubjectId,
        c.identity.authorizationRevision,
      );
      const snapshotRef = `projection:${watermark.worldVersion}:${watermark.eventSequence}`;
      const decision = cache.acceptSnapshot({
        scope: c.identity,
        worldVersion: watermark.worldVersion,
        snapshotRef,
        payload: data.payload,
      });
      if (!['ACCEPTED', 'RECONCILED', 'DUPLICATE'].includes(decision))
        return { status: 'STALE' };
      const stored = cache.read(c.identity);
      if (stored.state !== 'DERIVED_CACHE' || stored.reconciliationRequired)
        return failure('UNAVAILABLE');
      bound = true;
      if (BigInt(watermark.worldVersion) > BigInt(observedWorldVersion))
        observedWorldVersion = watermark.worldVersion;
      return {
        status: 'PROJECTION',
        source: 'DERIVED_SERVER_PROJECTION',
        worldVersion: stored.worldVersion,
        snapshotRef: stored.snapshotRef,
        payload: stored.payload,
        authority: response.authority,
      };
    },
    async lookupFinal(
      requestId: string,
      lookup: FinalLookupIdentity,
    ): Promise<FinalLookupResult> {
      if (
        !uuid(requestId) ||
        !lookup ||
        !canonicalId(lookup.commandId) ||
        !canonicalId(lookup.idempotencyKey) ||
        !hash(lookup.commandFingerprint)
      )
        return failure('UNAVAILABLE');
      // No prepared offer, write capability, expiry, registration, signature or enqueue.
      const expected = Object.freeze({ ...lookup });
      const response = await request(c.endpoints.finalLookupPath, requestId, {
        schemaVersion: 'world-final-receipt-read-v1',
        requestId,
        operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
        payload: {
          worldId: c.identity.worldId,
          commandId: expected.commandId,
          idempotencyKey: expected.idempotencyKey,
        },
      });
      if (response.status !== 'RESPONSE') return response;
      const receipt = parseFinalReceiptLookupResponse(
        response.result,
        requestId,
      );
      if (
        !receipt ||
        receipt.idempotencyKey !== expected.idempotencyKey ||
        receipt.commandFingerprint !== expected.commandFingerprint
      )
        return failure('UNAVAILABLE');
      const validated = resolveAuthorizedUi({
        currentIdentity: c.identity,
        read: null,
        command: {
          identity: c.identity,
          commandId: expected.commandId,
          result: { status: 'FINAL_RECEIPT', receipt },
        },
      });
      if (
        validated.command.kind === 'UNAVAILABLE' ||
        (receipt.worldVersionAfter !== null &&
          (!version(receipt.worldVersionAfter) ||
            BigInt(receipt.worldVersionAfter) >
              BigInt(response.authority.readback.worldVersion)))
      )
        return failure('UNAVAILABLE');
      if (!ensureCurrent()) {
        return { status: 'STALE' };
      }
      if (
        BigInt(response.authority.readback.worldVersion) <
        BigInt(observedWorldVersion)
      )
        return { status: 'STALE' };
      cache.bindAuthorization(
        c.identity.authSubjectId,
        c.identity.authorizationRevision,
      );
      cache.observeNotice({
        scope: c.identity,
        worldVersion: response.authority.readback.worldVersion,
        noticeRef: `receipt:${expected.commandId}`,
      });
      bound = true;
      if (
        BigInt(response.authority.readback.worldVersion) >
        BigInt(observedWorldVersion)
      )
        observedWorldVersion = response.authority.readback.worldVersion;
      return {
        status: 'FINAL_RECEIPT',
        receipt,
        authority: response.authority,
      };
    },
  });
}
