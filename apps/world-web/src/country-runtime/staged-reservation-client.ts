import {
  createAuthorizedWorldBrowserClient,
  type AuthorizedBrowserIdentity,
  type BrowserFinalReceipt,
} from '../authorized-client/client.js';
import {
  clearPendingMarker,
  localPendingStorage,
  readPendingMarker,
  reservePendingMarker,
  type PendingMarkerStorage,
} from '../authorized-client/pending-marker.js';
import { resolveAuthorizedUi } from '../prototype/authorized-read-adapter.js';
import { parseFinalReceiptLookupResponse } from '../prototype/final-receipt-lookup.js';

export const STAGED_RESERVATION_PATH = '/local/v1/staged-narrow-transfer';
export const RESERVATION_RECEIPT_PATH = '/local/v1/narrow-transfer-receipt';
export interface PreparedReservation {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly approvalRef: string;
  readonly expectedWorldVersion: string;
  /** Complete immutable INSPECT payload from the trusted host; no browser-authored terms. */
  readonly payload: Readonly<Record<string, unknown>>;
}
export type ReservationLifecycle =
  | 'PENDING_APPROVAL_OR_ENQUEUE'
  | 'QUEUED'
  | 'EXECUTING'
  | 'FINAL'
  | 'NOT_FOUND'
  | 'UNKNOWN'
  | 'DENIED'
  | 'UNAVAILABLE';
export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
/** Exact comparison only; economic numeric terms must remain strings. */
export function exactJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(exactJson).join(',')}]`;
  const row = record(value);
  if (!row) throw new Error('Non-exact host intent');
  return `{${Object.keys(row)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${exactJson(row[key])}`)
    .join(',')}}`;
}
export function localRuntimeOrigin(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
      Number(u.port) >= 1024 &&
      Number(u.port) <= 65535 &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname === '/'
      ? u.origin
      : null;
  } catch {
    return null;
  }
}
export function createStagedReservationClient(options: {
  readonly identity: AuthorizedBrowserIdentity;
  readonly origin: string;
  readonly getAccessToken: () => Promise<string | null>;
  readonly isCurrent: () => boolean;
  readonly prepared: PreparedReservation;
  readonly fetcher?: typeof fetch;
  readonly pendingStorage?: PendingMarkerStorage | null;
}) {
  const origin = localRuntimeOrigin(options.origin),
    storage = localPendingStorage(options.pendingStorage),
    prepared = options.prepared;
  let retired = false;
  const i = options.identity;
  const scopeFields = [
    'STAGED_INVENTORY_RESERVATION',
    i.worldId,
    i.countryId,
    i.officeId,
    i.scopeKey,
    i.authSubjectId,
    i.authorizationRevision,
    i.modelVersion,
    i.projectionVersion,
    i.classification,
  ];
  const live = () => {
    try {
      return !retired && options.isCurrent() === true;
    } catch {
      return false;
    }
  };
  const readClient = createAuthorizedWorldBrowserClient({
    currentIdentity: () => (live() ? options.identity : null),
    getAccessToken: options.getAccessToken,
    canDispatchCommand: live,
    bridge: {
      origin: options.origin,
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    },
    pendingStorage: storage,
  });
  const selectors = (action: 'INSPECT' | 'ENQUEUE' | 'READ') => ({
    schemaVersion: 'world-staged-transfer-v1',
    action,
    worldId: options.identity.worldId,
    countryId: options.identity.countryId,
    officeId: options.identity.officeId,
    commandId: prepared.commandId,
    idempotencyKey: prepared.idempotencyKey,
    ...(action === 'ENQUEUE'
      ? {
          commandFingerprint: prepared.commandFingerprint,
          approvalRef: prepared.approvalRef,
        }
      : {}),
  });
  async function post(
    path: string,
    body: object,
  ): Promise<{ status: number; body: unknown } | null> {
    if (!origin || !live()) return null;
    let token: string | null;
    try {
      token = await options.getAccessToken();
    } catch {
      return null;
    }
    if (!token || !/^[A-Za-z0-9._~-]+$/u.test(token) || !live()) return null;
    const timeout = new AbortController(),
      timer = setTimeout(() => timeout.abort(), 10_000);
    try {
      const response = await (options.fetcher ?? fetch)(`${origin}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: timeout.signal,
      });
      if (
        !live() ||
        response.redirected ||
        !response.headers.get('content-type')?.startsWith('application/json') ||
        !response.body
      )
        return null;
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > 1_000_000) {
            await reader.cancel();
            return null;
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return live()
        ? {
            status: response.status,
            body: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
          }
        : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  function lifecycle(
    response: Awaited<ReturnType<typeof post>>,
  ): ReservationLifecycle {
    const body = record(response?.body),
      state = record(body?.state);
    if (body?.schemaVersion !== 'world-staged-transfer-v1') return 'UNKNOWN';
    if (response?.status === 401 || response?.status === 403) return 'DENIED';
    if (body.ok !== true || response?.status !== 200) return 'UNKNOWN';
    if (state?.status === 'NOT_FOUND') return 'NOT_FOUND';
    if (state?.status === 'UNKNOWN') return 'UNKNOWN';
    const ack = record(state?.acknowledgement);
    if (
      !ack ||
      ack.worldId !== options.identity.worldId ||
      ack.commandId !== prepared.commandId ||
      ack.commandFingerprint !== prepared.commandFingerprint ||
      ack.status !== 'ACCEPTED'
    )
      return 'UNKNOWN';
    return [
      'PENDING_APPROVAL_OR_ENQUEUE',
      'QUEUED',
      'EXECUTING',
      'FINAL',
    ].includes(String(state?.status))
      ? (state!.status as ReservationLifecycle)
      : 'UNKNOWN';
  }
  return {
    readProjection: readClient.readProjection,
    cache: readClient.cache,
    pending: () => readPendingMarker(storage),
    retire() {
      retired = true;
      readClient.cache.revokeAuthorization();
    },
    async inspect() {
      const response = await post(
          STAGED_RESERVATION_PATH,
          selectors('INSPECT'),
        ),
        body = record(response?.body),
        state = record(body?.state);
      try {
        return (
          response?.status === 200 &&
          body?.schemaVersion === 'world-staged-transfer-v1' &&
          body.ok === true &&
          state?.status === 'INTENT' &&
          state.commandId === prepared.commandId &&
          state.idempotencyKey === prepared.idempotencyKey &&
          state.commandFingerprint === prepared.commandFingerprint &&
          state.expectedWorldVersion === prepared.expectedWorldVersion &&
          exactJson(state.payload) === exactJson(prepared.payload)
        );
      } catch {
        return false;
      }
    },
    async enqueue(): Promise<ReservationLifecycle> {
      if (!live()) return 'UNAVAILABLE';
      const marker = await reservePendingMarker({
        storage,
        scopeFields,
        requestId: crypto.randomUUID(),
        commandId: prepared.commandId,
        expectedWorldVersion: prepared.expectedWorldVersion,
      });
      if (marker !== 'RESERVED' || !live()) return 'UNAVAILABLE';
      return lifecycle(
        await post(STAGED_RESERVATION_PATH, selectors('ENQUEUE')),
      );
    },
    async readLifecycle() {
      return lifecycle(await post(STAGED_RESERVATION_PATH, selectors('READ')));
    },
    async lookupFinalReceipt(): Promise<BrowserFinalReceipt | null> {
      const requestId = crypto.randomUUID(),
        response = await post(RESERVATION_RECEIPT_PATH, {
          schemaVersion: 'world-final-receipt-read-v1',
          requestId,
          operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
          payload: {
            worldId: options.identity.worldId,
            commandId: prepared.commandId,
            idempotencyKey: prepared.idempotencyKey,
          },
        });
      const receipt =
        response?.status === 200
          ? parseFinalReceiptLookupResponse(response.body, requestId)
          : null;
      if (
        !receipt ||
        receipt.commandId !== prepared.commandId ||
        receipt.idempotencyKey !== prepared.idempotencyKey ||
        receipt.commandFingerprint !== prepared.commandFingerprint
      )
        return null;
      const ui = resolveAuthorizedUi({
        currentIdentity: options.identity,
        read: null,
        command: {
          identity: options.identity,
          commandId: prepared.commandId,
          result: { status: 'FINAL_RECEIPT', receipt },
        },
      });
      if (
        !['SUCCEEDED', 'REJECTED', 'AUTHORIZATION_REVOKED'].includes(
          ui.command.kind,
        ) ||
        !live()
      )
        return null;
      const marker = readPendingMarker(storage);
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(scopeFields)),
      );
      const scopeDigest = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
      if (
        marker.state === 'PENDING' &&
        marker.marker.commandId === prepared.commandId &&
        marker.marker.scopeDigest === scopeDigest &&
        live()
      )
        clearPendingMarker(storage);
      return receipt;
    },
  };
}
export type StagedReservationPort = ReturnType<
  typeof createStagedReservationClient
>;
