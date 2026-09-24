import {
  createScopedProjectionCache,
  type CacheScope,
} from '../reconnect/scoped-cache';
import {
  clearPendingMarker,
  localPendingStorage,
  readPendingMarker,
  reservePendingMarker,
  type PendingMarkerStorage,
} from './pending-marker';

/** Browser-side mirror of E's local-only HTTP protocol; no server runtime import. */
export const LOCAL_WORLD_READ_PATH = '/local/v1/world-read' as const;
export const LOCAL_WORLD_COMMAND_PATH =
  '/local/v1/narrow-transfer-command' as const;
export const WORLD_READ_SCHEMA = 'world-read-api-v1' as const;
export const WORLD_COMMAND_SCHEMA = 'world-command-api-v1' as const;

export interface AuthorizedBrowserIdentity extends CacheScope {
  readonly classification:
    'PUBLIC' | 'COUNTRY' | 'OFFICE_PRIVATE' | 'NEGOTIATION_PARTY' | 'ADMIN';
}

/** Freshness check is client-only: E's current command wire has no version fence. */
export interface NarrowTransferDraft {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly expectedWorldVersion: string;
  readonly proposalRef: string;
  readonly buyerCountryId: string;
  readonly buyerFinanceApprovalRef: string;
}

export interface BrowserFinalReceipt {
  readonly source: 'DURABLE_FINAL_COMMAND_RECEIPT';
  readonly worldId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly outcome: 'COMMITTED' | 'REJECTED' | 'AUTHORIZATION_REVOKED';
  readonly reasonCode: string | null;
  readonly worldVersionAfter: string | null;
  readonly eventIds: readonly string[];
  readonly recordedAtReal: string;
}

export type BrowserUnavailableReason =
  | 'BRIDGE_NOT_CONFIGURED'
  | 'IDENTITY_NOT_READY'
  | 'TOKEN_NOT_READY'
  | 'NO_CURRENT_PROJECTION'
  | 'PENDING_STORAGE_UNAVAILABLE'
  | 'NETWORK_UNAVAILABLE'
  | 'INVALID_RESPONSE';
type ClientFailure =
  | {
      readonly status: 'UNAVAILABLE';
      readonly reason: BrowserUnavailableReason;
    }
  | { readonly status: 'DENIED' }
  | { readonly status: 'STALE' };
export type BrowserReadResult =
  | ClientFailure
  | {
      readonly status: 'PROJECTION';
      readonly worldVersion: string;
      readonly snapshotRef: string;
      readonly payload: unknown;
      readonly source: 'DERIVED_SERVER_PROJECTION';
    };
export type BrowserCommandResult =
  | ClientFailure
  | { readonly status: 'UNKNOWN' }
  | {
      readonly status: 'FINAL_RECEIPT';
      readonly receipt: BrowserFinalReceipt;
    };

const canonicalId = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const canonicalUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const canonicalVersion = /^(?:0|[1-9]\d*)$/u;
const positiveVersion = /^[1-9]\d*$/u;
const fingerprint = /^sha256:[0-9a-f]{64}$/u;
const reasonCode = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;
const timestamp =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const maxRequestBytes = 16 * 1024;
const maxResponseBytes = 1024 * 1024;
const classifications = new Set([
  'PUBLIC',
  'COUNTRY',
  'OFFICE_PRIVATE',
  'NEGOTIATION_PARTY',
  'ADMIN',
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validIdentity(
  value: AuthorizedBrowserIdentity | null,
): value is AuthorizedBrowserIdentity {
  return (
    !!value &&
    canonicalId.test(value.worldId) &&
    canonicalId.test(value.countryId) &&
    canonicalId.test(value.officeId) &&
    canonicalId.test(value.scopeKey) &&
    typeof value.authSubjectId === 'string' &&
    value.authSubjectId.length > 0 &&
    typeof value.authorizationRevision === 'string' &&
    value.authorizationRevision.length > 0 &&
    typeof value.modelVersion === 'string' &&
    value.modelVersion.length > 0 &&
    typeof value.projectionVersion === 'string' &&
    value.projectionVersion.length > 0 &&
    classifications.has(value.classification)
  );
}

function sameIdentity(
  left: AuthorizedBrowserIdentity,
  right: AuthorizedBrowserIdentity | null,
): boolean {
  return (
    validIdentity(right) &&
    left.worldId === right.worldId &&
    left.authSubjectId === right.authSubjectId &&
    left.authorizationRevision === right.authorizationRevision &&
    left.countryId === right.countryId &&
    left.officeId === right.officeId &&
    left.scopeKey === right.scopeKey &&
    left.modelVersion === right.modelVersion &&
    left.projectionVersion === right.projectionVersion &&
    left.classification === right.classification
  );
}

function validatedOrigin(origin: string): URL {
  const url = new URL(origin);
  const port = Number(url.port);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('LOCAL_BRIDGE_ORIGIN_INVALID');
  }
  return url;
}

function validReceipt(
  value: unknown,
  worldId: string,
  draft: NarrowTransferDraft,
): BrowserFinalReceipt | null {
  const input = record(value);
  if (
    !input ||
    input.source !== 'DURABLE_FINAL_COMMAND_RECEIPT' ||
    input.worldId !== worldId ||
    input.commandId !== draft.commandId ||
    input.idempotencyKey !== draft.idempotencyKey ||
    typeof input.commandFingerprint !== 'string' ||
    !fingerprint.test(input.commandFingerprint) ||
    !['COMMITTED', 'REJECTED', 'AUTHORIZATION_REVOKED'].includes(
      String(input.outcome),
    ) ||
    typeof input.recordedAtReal !== 'string' ||
    !timestamp.test(input.recordedAtReal) ||
    !Array.isArray(input.eventIds) ||
    input.eventIds.length > 1000 ||
    !input.eventIds.every(
      (id: unknown) => typeof id === 'string' && canonicalId.test(id),
    ) ||
    new Set(input.eventIds).size !== input.eventIds.length ||
    !(
      input.reasonCode === null ||
      (typeof input.reasonCode === 'string' &&
        reasonCode.test(input.reasonCode))
    ) ||
    !(
      input.worldVersionAfter === null ||
      (typeof input.worldVersionAfter === 'string' &&
        positiveVersion.test(input.worldVersionAfter))
    )
  )
    return null;
  const committed = input.outcome === 'COMMITTED';
  if (
    (committed &&
      (input.reasonCode !== null ||
        input.worldVersionAfter === null ||
        input.eventIds.length === 0)) ||
    (!committed &&
      (input.reasonCode === null ||
        input.worldVersionAfter !== null ||
        input.eventIds.length !== 0))
  )
    return null;
  return {
    source: 'DURABLE_FINAL_COMMAND_RECEIPT',
    worldId,
    commandId: draft.commandId,
    idempotencyKey: draft.idempotencyKey,
    commandFingerprint: input.commandFingerprint as string,
    outcome: input.outcome as BrowserFinalReceipt['outcome'],
    reasonCode: input.reasonCode as string | null,
    worldVersionAfter: input.worldVersionAfter as string | null,
    eventIds: [...input.eventIds] as string[],
    recordedAtReal: input.recordedAtReal as string,
  };
}

async function boundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (
    length &&
    /^\d+$/u.test(length) &&
    BigInt(length) > BigInt(maxResponseBytes)
  ) {
    throw new Error('BRIDGE_RESPONSE_TOO_LARGE');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('BRIDGE_RESPONSE_EMPTY');
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxResponseBytes)
        throw new Error('BRIDGE_RESPONSE_TOO_LARGE');
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  ) as unknown;
}

export function createAuthorizedWorldBrowserClient(options: {
  readonly currentIdentity: () => AuthorizedBrowserIdentity | null;
  readonly getAccessToken: () => Promise<string | null>;
  readonly bridge?: {
    readonly origin: string;
    readonly fetcher?: typeof fetch;
  } | null;
  readonly cache?: ReturnType<typeof createScopedProjectionCache>;
  readonly pendingStorage?: PendingMarkerStorage | null;
}) {
  const cache = options.cache ?? createScopedProjectionCache();
  const origin = options.bridge ? validatedOrigin(options.bridge.origin) : null;
  const fetcher = options.bridge?.fetcher ?? fetch;
  const pendingStorage = localPendingStorage(options.pendingStorage);
  let pendingRead = readPendingMarker(pendingStorage);
  if (pendingRead.state !== 'EMPTY') cache.onReconnect();
  let unresolvedDraft: NarrowTransferDraft | null = null;
  let unresolvedIdentity: AuthorizedBrowserIdentity | null = null;
  let unresolvedRequestId: string | null = null;
  let activeSubmission: {
    readonly identity: AuthorizedBrowserIdentity;
    readonly draft: NarrowTransferDraft;
    readonly requestId: string;
  } | null = null;

  function scopeFields(identity: AuthorizedBrowserIdentity): readonly string[] {
    return [
      identity.worldId,
      identity.authSubjectId,
      identity.authorizationRevision,
      identity.countryId,
      identity.officeId,
      identity.scopeKey,
      identity.modelVersion,
      identity.projectionVersion,
      identity.classification,
    ];
  }

  function observePending(): ReturnType<typeof readPendingMarker> {
    const latest = readPendingMarker(pendingStorage);
    // A missing or unreadable marker cannot silently undo a known pending POST.
    if (latest.state !== 'EMPTY') pendingRead = latest;
    return pendingRead;
  }

  function sameDraft(
    left: NarrowTransferDraft,
    right: NarrowTransferDraft,
  ): boolean {
    return (
      left.commandId === right.commandId &&
      left.idempotencyKey === right.idempotencyKey &&
      left.expectedWorldVersion === right.expectedWorldVersion &&
      left.proposalRef === right.proposalRef &&
      left.buyerCountryId === right.buyerCountryId &&
      left.buyerFinanceApprovalRef === right.buyerFinanceApprovalRef
    );
  }

  async function request(
    path: typeof LOCAL_WORLD_READ_PATH | typeof LOCAL_WORLD_COMMAND_PATH,
    requestId: string,
    identity: AuthorizedBrowserIdentity,
    body: object,
  ): Promise<
    | ClientFailure
    | {
        readonly status: 'UNVERIFIED_POST';
        readonly reason:
          'NETWORK_UNAVAILABLE' | 'INVALID_RESPONSE' | 'STALE_IDENTITY';
      }
    | { readonly status: 'RESPONSE'; readonly body: Record<string, unknown> }
  > {
    if (!origin)
      return { status: 'UNAVAILABLE', reason: 'BRIDGE_NOT_CONFIGURED' };
    let token: string | null;
    try {
      token = await options.getAccessToken();
    } catch {
      return { status: 'UNAVAILABLE', reason: 'TOKEN_NOT_READY' };
    }
    if (!token || !/^[A-Za-z0-9._~-]+$/u.test(token)) {
      return { status: 'UNAVAILABLE', reason: 'TOKEN_NOT_READY' };
    }
    if (!sameIdentity(identity, options.currentIdentity()))
      return { status: 'STALE' };
    const serialized = JSON.stringify(body);
    if (new TextEncoder().encode(serialized).byteLength > maxRequestBytes) {
      return { status: 'UNAVAILABLE', reason: 'INVALID_RESPONSE' };
    }
    let response: Response;
    try {
      response = await fetcher(new URL(path, origin), {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: serialized,
      });
    } catch {
      return { status: 'UNVERIFIED_POST', reason: 'NETWORK_UNAVAILABLE' };
    }
    if (!sameIdentity(identity, options.currentIdentity()))
      return { status: 'UNVERIFIED_POST', reason: 'STALE_IDENTITY' };
    if (response.status === 401 || response.status === 403) {
      cache.revokeAuthorization();
      return { status: 'DENIED' };
    }
    if (response.status === 409) {
      return path === LOCAL_WORLD_READ_PATH
        ? { status: 'STALE' }
        : { status: 'UNVERIFIED_POST', reason: 'INVALID_RESPONSE' };
    }
    if (!response.ok)
      return { status: 'UNVERIFIED_POST', reason: 'NETWORK_UNAVAILABLE' };
    try {
      const parsed = record(await boundedJson(response));
      if (!sameIdentity(identity, options.currentIdentity()))
        return { status: 'UNVERIFIED_POST', reason: 'STALE_IDENTITY' };
      if (
        !parsed ||
        parsed.requestId !== requestId ||
        parsed.ok !== true ||
        parsed.schemaVersion !==
          (path === LOCAL_WORLD_READ_PATH
            ? WORLD_READ_SCHEMA
            : WORLD_COMMAND_SCHEMA)
      ) {
        return { status: 'UNVERIFIED_POST', reason: 'INVALID_RESPONSE' };
      }
      return { status: 'RESPONSE', body: parsed };
    } catch {
      return { status: 'UNVERIFIED_POST', reason: 'INVALID_RESPONSE' };
    }
  }

  function current(): AuthorizedBrowserIdentity | null {
    const identity = options.currentIdentity();
    if (!validIdentity(identity)) {
      cache.revokeAuthorization();
      return null;
    }
    cache.bindAuthorization(
      identity.authSubjectId,
      identity.authorizationRevision,
    );
    return { ...identity };
  }

  function unverifiedCommand(
    identity: AuthorizedBrowserIdentity,
    draft: NarrowTransferDraft,
    requestId: string,
  ): BrowserCommandResult {
    // A fresh authoritative snapshot is required before another command.
    // The cache port exposes whole-cache reconnect invalidation, not a
    // one-scope invalidation method; broad invalidation is fail-closed.
    unresolvedDraft = { ...draft };
    unresolvedIdentity = { ...identity };
    unresolvedRequestId = requestId;
    cache.onReconnect();
    return { status: 'UNKNOWN' };
  }

  return {
    cache,
    async readProjection(requestId: string): Promise<BrowserReadResult> {
      const identity = current();
      if (!identity || !canonicalUuid.test(requestId)) {
        return { status: 'UNAVAILABLE', reason: 'IDENTITY_NOT_READY' };
      }
      const result = await request(LOCAL_WORLD_READ_PATH, requestId, identity, {
        schemaVersion: WORLD_READ_SCHEMA,
        requestId,
        operation: 'READ_WORLD_PROJECTION',
        payload: {
          worldId: identity.worldId,
          classification: identity.classification,
          scopeKey: identity.scopeKey,
        },
      });
      if (result.status === 'UNVERIFIED_POST') {
        if (result.reason === 'STALE_IDENTITY') return { status: 'STALE' };
        return { status: 'UNAVAILABLE', reason: result.reason };
      }
      if (result.status !== 'RESPONSE') return result;
      const data = record(result.body.data);
      const watermark = record(data?.watermark);
      if (
        !data ||
        data.schemaVersion !== 'world-projection-read-v1' ||
        data.worldId !== identity.worldId ||
        data.classification !== identity.classification ||
        data.scopeKey !== identity.scopeKey ||
        !watermark ||
        typeof watermark.worldVersion !== 'string' ||
        !canonicalVersion.test(watermark.worldVersion) ||
        typeof watermark.eventSequence !== 'string' ||
        !canonicalVersion.test(watermark.eventSequence) ||
        typeof watermark.generatedAt !== 'string' ||
        !timestamp.test(watermark.generatedAt) ||
        !Array.isArray(data.receipts) ||
        !Array.isArray(data.events) ||
        data.payload === undefined
      ) {
        return { status: 'UNAVAILABLE', reason: 'INVALID_RESPONSE' };
      }
      if (!sameIdentity(identity, options.currentIdentity()))
        return { status: 'STALE' };
      const snapshotRef = `projection:${watermark.worldVersion}:${watermark.eventSequence}`;
      const decision = cache.acceptSnapshot({
        scope: identity,
        worldVersion: watermark.worldVersion,
        snapshotRef,
        payload: data.payload,
      });
      if (decision === 'STALE' || decision === 'BEHIND_NOTICE')
        return { status: 'STALE' };
      if (!['ACCEPTED', 'RECONCILED', 'DUPLICATE'].includes(decision)) {
        return { status: 'UNAVAILABLE', reason: 'INVALID_RESPONSE' };
      }
      if (observePending().state !== 'EMPTY') cache.onReconnect();
      const cached = cache.read(identity);
      if (cached.state !== 'DERIVED_CACHE') {
        return { status: 'UNAVAILABLE', reason: 'INVALID_RESPONSE' };
      }
      return {
        status: 'PROJECTION',
        worldVersion: cached.worldVersion,
        snapshotRef: cached.snapshotRef,
        payload: cached.payload,
        source: 'DERIVED_SERVER_PROJECTION',
      };
    },
    async submitNarrowTransfer(
      requestId: string,
      draft: NarrowTransferDraft,
    ): Promise<BrowserCommandResult> {
      const identity = current();
      if (
        !identity ||
        !canonicalUuid.test(requestId) ||
        !draft ||
        !canonicalId.test(draft.commandId) ||
        !canonicalId.test(draft.idempotencyKey) ||
        !canonicalId.test(draft.proposalRef) ||
        !canonicalId.test(draft.buyerCountryId) ||
        !canonicalId.test(draft.buyerFinanceApprovalRef) ||
        !canonicalVersion.test(draft.expectedWorldVersion)
      ) {
        return { status: 'UNAVAILABLE', reason: 'IDENTITY_NOT_READY' };
      }
      if (!origin)
        return { status: 'UNAVAILABLE', reason: 'BRIDGE_NOT_CONFIGURED' };
      if (activeSubmission) return { status: 'UNKNOWN' }; // Another POST is already in flight.
      const persisted = observePending();
      if (
        persisted.state === 'CORRUPT' ||
        (persisted.state === 'PENDING' && !unresolvedDraft)
      ) {
        return { status: 'UNKNOWN' }; // Restored marker has no safe lookup/retry payload.
      }
      if (persisted.state === 'UNAVAILABLE') {
        return pendingStorage
          ? { status: 'UNKNOWN' }
          : { status: 'UNAVAILABLE', reason: 'PENDING_STORAGE_UNAVAILABLE' };
      }
      if (
        unresolvedDraft &&
        (!unresolvedIdentity ||
          unresolvedRequestId !== requestId ||
          !sameIdentity(unresolvedIdentity, identity) ||
          !sameDraft(unresolvedDraft, draft))
      ) {
        return { status: 'UNKNOWN' }; // Never retry an unresolved command under new IDs or payload.
      }
      const resolvingUnknown = unresolvedDraft !== null;
      if (resolvingUnknown) {
        const latest = readPendingMarker(pendingStorage);
        if (
          latest.state !== 'PENDING' ||
          latest.marker.requestId !== requestId ||
          latest.marker.commandId !== draft.commandId ||
          latest.marker.expectedWorldVersion !== draft.expectedWorldVersion
        ) {
          return { status: 'UNKNOWN' };
        }
      }
      const cached = cache.read(identity);
      if (
        !resolvingUnknown &&
        (cached.state !== 'DERIVED_CACHE' || cached.reconciliationRequired)
      ) {
        return { status: 'UNAVAILABLE', reason: 'NO_CURRENT_PROJECTION' };
      }
      if (
        !resolvingUnknown &&
        cached.state === 'DERIVED_CACHE' &&
        cached.worldVersion !== draft.expectedWorldVersion
      )
        return { status: 'STALE' };
      // Reserve before the first await: no second command can pass while the
      // first POST is pending. On ambiguity the reservation moves to the
      // unresolved identity guard before this in-flight slot is released.
      activeSubmission = {
        identity: { ...identity },
        draft: { ...draft },
        requestId,
      };
      try {
        if (!resolvingUnknown) {
          const reserved = await reservePendingMarker({
            storage: pendingStorage,
            scopeFields: scopeFields(identity),
            requestId,
            commandId: draft.commandId,
            expectedWorldVersion: draft.expectedWorldVersion,
          });
          if (reserved !== 'RESERVED') {
            pendingRead = readPendingMarker(pendingStorage);
            return reserved === 'EXISTING'
              ? { status: 'UNKNOWN' }
              : {
                  status: 'UNAVAILABLE',
                  reason: 'PENDING_STORAGE_UNAVAILABLE',
                };
          }
          pendingRead = readPendingMarker(pendingStorage);
          if (pendingRead.state !== 'PENDING') return { status: 'UNKNOWN' };
        }
        const result = await request(
          LOCAL_WORLD_COMMAND_PATH,
          requestId,
          identity,
          {
            schemaVersion: WORLD_COMMAND_SCHEMA,
            requestId,
            operation: 'SUBMIT_NARROW_TREASURY_GCU_TRANSFER',
            payload: {
              worldId: identity.worldId,
              countryId: identity.countryId,
              officeId: identity.officeId,
              commandId: draft.commandId,
              idempotencyKey: draft.idempotencyKey,
              proposalRef: draft.proposalRef,
              buyerCountryId: draft.buyerCountryId,
              buyerFinanceApprovalRef: draft.buyerFinanceApprovalRef,
            },
          },
        );
        if (result.status === 'UNVERIFIED_POST')
          return unverifiedCommand(identity, draft, requestId);
        if (result.status !== 'RESPONSE') {
          if (resolvingUnknown || result.status === 'DENIED') {
            return unverifiedCommand(identity, draft, requestId);
          }
          if (!clearPendingMarker(pendingStorage)) {
            return unverifiedCommand(identity, draft, requestId);
          }
          pendingRead = { state: 'EMPTY' };
          return result;
        }
        const receipt = validReceipt(
          result.body.receipt,
          identity.worldId,
          draft,
        );
        if (!receipt) return unverifiedCommand(identity, draft, requestId);
        if (!sameIdentity(identity, options.currentIdentity()))
          return unverifiedCommand(identity, draft, requestId);
        if (!clearPendingMarker(pendingStorage))
          return unverifiedCommand(identity, draft, requestId);
        pendingRead = { state: 'EMPTY' };
        unresolvedDraft = null;
        unresolvedIdentity = null;
        unresolvedRequestId = null;
        if (receipt.outcome === 'COMMITTED' && receipt.worldVersionAfter) {
          cache.observeNotice({
            scope: identity,
            worldVersion: receipt.worldVersionAfter,
            noticeRef: `receipt:${receipt.commandId}`,
          });
        }
        return { status: 'FINAL_RECEIPT', receipt };
      } catch {
        return unverifiedCommand(identity, draft, requestId);
      } finally {
        activeSubmission = null;
      }
    },
    revoke(): void {
      cache.revokeAuthorization();
    },
  };
}
