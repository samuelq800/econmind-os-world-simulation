import { createAuthenticatedWorldReadQueryHandler } from './authenticated-read-query-handler.js';
import { createAuthenticatedFinalReceiptQueryHandler } from './authenticated-final-receipt-query-handler.js';
import { parseWorldReadRequest } from './contracts.js';
import type { ParameterizedPgReadExecutor } from './postgres-read-adapter.js';
import {
  verifySupabaseJwtClaims,
  type JwtClaimsPolicy,
  type JwtSignatureVerifier,
  type SupabaseAuthSubject,
} from './identity.js';

/** Server contract mirrored by production-read/contract.ts; no browser import. */
export interface ServerVerifiedReadBinding {
  readonly source: 'SERVER_VERIFIED_READ_BINDING';
  readonly capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL';
  readonly seatRef: string;
  readonly seatState: 'ACTIVE';
  readonly identity: {
    readonly authSubjectId: SupabaseAuthSubject;
    readonly worldId: string;
    readonly countryId: string;
    readonly officeId: string;
    readonly scopeKey: string;
    readonly classification: 'COUNTRY' | 'OFFICE_PRIVATE';
    readonly authorizationRevision: string;
    readonly modelVersion: string;
    readonly projectionVersion: string;
  };
  readonly seed: {
    readonly worldId: string;
    readonly seedRef: string;
    readonly contentHash: string;
    readonly admissionRef: string;
  };
  readonly readback: {
    readonly worldId: string;
    readonly seedRef: string;
    readonly contentHash: string;
    readonly admissionRef: string;
    readonly worldVersion: string;
    readonly eventSequence: string;
    readonly readbackRef: string;
  };
}
export interface ServerReadBindingPort {
  /**
   * Production-owned read port, NOT implemented here. Resolve current active
   * seat/revision + projection entitlement + admitted seed/head from server
   * records for the cryptographically verified subject. Never echo request or
   * config as proof, infer a seat from a DOM role, or create an admission.
   * For FINAL, derive the exact original durable submission scope selected by
   * finalSelector and require that same current active seat; do not substitute
   * a different Office the subject also holds. No offer/approval expiry check.
   * Null/missing/ambiguous/revoked/unadmitted bindings fail closed.
   */
  resolve(input: {
    readonly verifiedSubject: SupabaseAuthSubject;
    readonly worldId: string;
    readonly projectionSelector: {
      readonly classification: string;
      readonly scopeKey: string;
    } | null;
    readonly finalSelector: {
      readonly commandId: string;
      readonly idempotencyKey: string;
    } | null;
    readonly signal: AbortSignal;
  }): Promise<ServerVerifiedReadBinding | null>;
}
export interface HttpsReadCompositionConfig {
  readonly endpointPins: {
    readonly origin: string;
    readonly projectionPath: string;
    readonly finalLookupPath: string;
    readonly deploymentRef: string;
  };
  readonly admittedWorldPins: {
    readonly worldId: string;
    readonly seedRef: string;
    readonly contentHash: string;
    readonly admissionRef: string;
    readonly minimumWorldVersion: string;
  };
  readonly verifier: JwtSignatureVerifier;
  readonly currentJwtPolicy: () => JwtClaimsPolicy | null;
  readonly executor: ParameterizedPgReadExecutor;
  readonly bindingReader: ServerReadBindingPort;
}
interface HandlerInput {
  readonly authorization: unknown;
  readonly request: unknown;
  readonly signal?: AbortSignal;
}
type BoundResponse =
  | {
      readonly schemaVersion: 'world-authorized-read-binding-v1';
      readonly requestId: string;
      readonly ok: true;
      readonly authority: ServerVerifiedReadBinding;
      readonly result: unknown;
    }
  | {
      readonly schemaVersion: 'world-authorized-read-binding-v1';
      readonly requestId: string;
      readonly ok: false;
      readonly error: { readonly code: string; readonly retryable: false };
    };
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const id = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(v) &&
  v.length <= 256;
const version = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^(?:0|[1-9]\d*)$/u.test(v) &&
  v.length <= 19 &&
  BigInt(v) <= 9223372036854775807n;
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
    v,
  );
const offices = [
  'CAPTAIN',
  'FINANCE',
  'CENTRAL_BANK',
  'INDUSTRY',
  'TRADE',
  'SOCIAL',
];
function configured(
  c: HttpsReadCompositionConfig | null,
): c is HttpsReadCompositionConfig {
  try {
    if (!c) return false;
    const p = c.endpointPins,
      w = c.admittedWorldPins,
      u = new URL(p.origin);
    const path = (v: string) =>
      /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u.test(v) &&
      v.length <= 256 &&
      !v.startsWith('/local/');
    return (
      u.protocol === 'https:' &&
      u.origin === p.origin &&
      u.pathname === '/' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      path(p.projectionPath) &&
      path(p.finalLookupPath) &&
      p.projectionPath !== p.finalLookupPath &&
      id(p.deploymentRef) &&
      [w.worldId, w.seedRef, w.admissionRef].every(id) &&
      /^sha256:[0-9a-f]{64}$/u.test(w.contentHash) &&
      version(w.minimumWorldVersion) &&
      typeof c.verifier.verify === 'function' &&
      typeof c.currentJwtPolicy === 'function' &&
      typeof c.executor.query === 'function' &&
      typeof c.bindingReader.resolve === 'function'
    );
  } catch {
    return false;
  }
}
function bound(
  value: unknown,
  c: HttpsReadCompositionConfig,
  subject: SupabaseAuthSubject,
  selector: {
    readonly classification: string;
    readonly scopeKey: string;
  } | null,
): ServerVerifiedReadBinding | null {
  const b = record(value),
    i = record(b?.identity),
    s = record(b?.seed),
    r = record(b?.readback);
  if (
    !b ||
    !i ||
    !s ||
    !r ||
    b.source !== 'SERVER_VERIFIED_READ_BINDING' ||
    b.capability !== 'READ_AUTHORIZED_PROJECTION_AND_FINAL' ||
    b.seatState !== 'ACTIVE' ||
    !id(b.seatRef) ||
    i.authSubjectId !== subject ||
    ![i.worldId, i.countryId, i.officeId, i.scopeKey].every(id) ||
    !offices.includes(String(i.officeId)) ||
    !['COUNTRY', 'OFFICE_PRIVATE'].includes(String(i.classification)) ||
    ![i.authorizationRevision, i.modelVersion, i.projectionVersion].every(
      text,
    ) ||
    i.worldId !== c.admittedWorldPins.worldId ||
    (selector &&
      (i.classification !== selector.classification ||
        i.scopeKey !== selector.scopeKey))
  )
    return null;
  for (const key of [
    'worldId',
    'seedRef',
    'contentHash',
    'admissionRef',
  ] as const) {
    if (
      s[key] !== c.admittedWorldPins[key] ||
      r[key] !== c.admittedWorldPins[key]
    )
      return null;
  }
  if (
    !version(r.worldVersion) ||
    !version(r.eventSequence) ||
    !id(r.readbackRef) ||
    BigInt(r.worldVersion) < BigInt(c.admittedWorldPins.minimumWorldVersion)
  )
    return null;
  // Copy only public DTO fields; provider-specific data/credentials cannot leak.
  return Object.freeze({
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    seatRef: b.seatRef,
    seatState: 'ACTIVE',
    identity: Object.freeze({
      authSubjectId: subject,
      worldId: String(i.worldId),
      countryId: String(i.countryId),
      officeId: String(i.officeId),
      scopeKey: String(i.scopeKey),
      classification: i.classification as 'COUNTRY' | 'OFFICE_PRIVATE',
      authorizationRevision: String(i.authorizationRevision),
      modelVersion: String(i.modelVersion),
      projectionVersion: String(i.projectionVersion),
    }),
    seed: Object.freeze({
      worldId: String(s.worldId),
      seedRef: String(s.seedRef),
      contentHash: String(s.contentHash),
      admissionRef: String(s.admissionRef),
    }),
    readback: Object.freeze({
      worldId: String(r.worldId),
      seedRef: String(r.seedRef),
      contentHash: String(r.contentHash),
      admissionRef: String(r.admissionRef),
      worldVersion: r.worldVersion,
      eventSequence: r.eventSequence,
      readbackRef: r.readbackRef,
    }),
  });
}
function error(requestId: string, code: string): BoundResponse {
  return Object.freeze({
    schemaVersion: 'world-authorized-read-binding-v1',
    requestId,
    ok: false,
    error: Object.freeze({ code, retryable: false }),
  });
}

/**
 * PREPARE_ONLY: wraps existing authenticated read handlers with a required
 * server binding port. Installs NO routes, executor, verifier, seed or grants.
 * Conditional module is necessary because existing response DTOs omit current
 * seat/revision/admitted-seed/readback binding. Existing contracts stay intact.
 */
export function createHttpsAuthenticatedReadComposition(
  config: HttpsReadCompositionConfig | null = null,
) {
  const c = configured(config)
    ? {
        ...config,
        endpointPins: Object.freeze({ ...config.endpointPins }),
        admittedWorldPins: Object.freeze({ ...config.admittedWorldPins }),
      }
    : null;
  async function handle(
    kind: 'PROJECTION' | 'FINAL_LOOKUP',
    input: HandlerInput,
  ): Promise<BoundResponse> {
    const raw = record(input.request),
      payload = record(raw?.payload);
    const requestId = uuid(raw?.requestId)
      ? raw.requestId
      : '00000000-0000-4000-8000-000000000000';
    if (!c) return error(requestId, 'NOT_CONNECTED');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (input.signal?.aborted) controller.abort();
    else input.signal?.addEventListener('abort', cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let resolveCancellation: ((value: BoundResponse) => void) | undefined;
    const cancelled = new Promise<BoundResponse>((resolve) => {
      resolveCancellation = resolve;
    });
    const onAbort = () =>
      resolveCancellation?.(
        error(requestId, timedOut ? 'UPSTREAM_UNAVAILABLE' : 'CANCELLED'),
      );
    controller.signal.addEventListener('abort', onAbort, { once: true });
    const timeout = new Promise<BoundResponse>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        resolve(error(requestId, 'UPSTREAM_UNAVAILABLE'));
      }, 10_000);
    });
    async function execute(): Promise<BoundResponse> {
      try {
        if (
          !raw ||
          !payload ||
          !uuid(raw.requestId) ||
          payload.worldId !== c!.admittedWorldPins.worldId
        )
          return error(requestId, 'INVALID_REQUEST');
        let selector: {
          readonly classification: string;
          readonly scopeKey: string;
        } | null = null;
        if (kind === 'PROJECTION') {
          const parsed = parseWorldReadRequest(input.request);
          selector = {
            classification: parsed.payload.classification,
            scopeKey: parsed.payload.scopeKey,
          };
        } else if (
          raw.schemaVersion !== 'world-final-receipt-read-v1' ||
          raw.operation !== 'READ_FINAL_NARROW_TRANSFER_RECEIPT' ||
          !id(payload.commandId) ||
          !id(payload.idempotencyKey)
        )
          return error(requestId, 'INVALID_REQUEST');
        const suppliedPolicy = c!.currentJwtPolicy();
        const policy = suppliedPolicy
          ? Object.freeze({ ...suppliedPolicy })
          : null;
        if (
          !policy ||
          !text(policy.expectedIssuer) ||
          !text(policy.expectedAudience)
        )
          return error(requestId, 'NOT_CONNECTED');
        let issuer: URL;
        try {
          issuer = new URL(policy.expectedIssuer);
        } catch {
          return error(requestId, 'NOT_CONNECTED');
        }
        if (
          issuer.protocol !== 'https:' ||
          issuer.username ||
          issuer.password ||
          issuer.search ||
          issuer.hash
        )
          return error(requestId, 'NOT_CONNECTED');
        if (controller.signal.aborted) return error(requestId, 'CANCELLED');
        if (
          typeof input.authorization !== 'string' ||
          input.authorization.length > 8192 ||
          !/^Bearer [A-Za-z0-9._~-]+$/u.test(input.authorization)
        )
          return error(requestId, 'AUTHORIZATION_DENIED');
        const claims = await verifySupabaseJwtClaims({
          token: input.authorization.slice(7),
          verifier: c!.verifier,
          policy,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return error(requestId, 'CANCELLED');
        const bindingInput = {
          verifiedSubject: claims.authSubject,
          worldId: c!.admittedWorldPins.worldId,
          projectionSelector: selector,
          finalSelector:
            kind === 'FINAL_LOOKUP'
              ? {
                  commandId: String(payload.commandId),
                  idempotencyKey: String(payload.idempotencyKey),
                }
              : null,
          signal: controller.signal,
        };
        const before = bound(
          await c!.bindingReader.resolve(bindingInput),
          c!,
          claims.authSubject,
          selector,
        );
        if (controller.signal.aborted) return error(requestId, 'CANCELLED');
        if (!before) return error(requestId, 'NOT_CONNECTED');
        // Both existing handlers independently verify JWT and real read entitlement.
        const result =
          kind === 'PROJECTION'
            ? await createAuthenticatedWorldReadQueryHandler({
                executor: c!.executor,
                verifier: c!.verifier,
                policy: { jwt: policy, timeoutMs: 10000 },
              }).handle({
                authorization: input.authorization,
                request: input.request,
                signal: controller.signal,
              })
            : await createAuthenticatedFinalReceiptQueryHandler({
                executor: c!.executor,
                verifier: c!.verifier,
                policy,
              }).handle({
                authorization: input.authorization,
                request: input.request,
                signal: controller.signal,
              });
        if (controller.signal.aborted) return error(requestId, 'CANCELLED');
        const after = bound(
          await c!.bindingReader.resolve(bindingInput),
          c!,
          claims.authSubject,
          selector,
        );
        if (controller.signal.aborted) return error(requestId, 'CANCELLED');
        if (!after || JSON.stringify(after) !== JSON.stringify(before))
          return error(requestId, 'AUTHORIZATION_DENIED');
        if (result.ok) {
          if (
            'data' in result &&
            (result.data.watermark.worldVersion !==
              after.readback.worldVersion ||
              result.data.watermark.eventSequence !==
                after.readback.eventSequence)
          )
            return error(requestId, 'STALE_PROJECTION');
          if (
            'receipt' in result &&
            result.receipt.worldVersionAfter !== null &&
            BigInt(result.receipt.worldVersionAfter) >
              BigInt(after.readback.worldVersion)
          )
            return error(requestId, 'STALE_PROJECTION');
        }
        return Object.freeze({
          schemaVersion: 'world-authorized-read-binding-v1',
          requestId,
          ok: true,
          authority: after,
          result,
        });
      } catch {
        return error(requestId, 'AUTHORIZATION_DENIED');
      }
    }
    try {
      return await Promise.race([execute(), timeout, cancelled]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      input.signal?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', onAbort);
    }
  }
  return Object.freeze({
    handleProjection: (input: HandlerInput) => handle('PROJECTION', input),
    handleFinalLookup: (input: HandlerInput) => handle('FINAL_LOOKUP', input),
  });
}
