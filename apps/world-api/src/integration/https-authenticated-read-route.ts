import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createHttpsAuthenticatedReadComposition,
  type HttpsReadCompositionConfig,
} from './https-authenticated-read-composition.js';
import { OFFICIAL_COUNTRY_LIST_PATH } from './official-country-baseline.js';
import { OFFICIAL_DATASET_LIST_PATH } from './official-dataset-route.js';
import { OFFICIAL_MAP_ASSET_LIST_PATH } from './official-map-asset-route.js';
import { SEASON1_MY_TEAM_PATH } from './season1-my-team-route.js';

export interface HttpsAuthenticatedReadRouteOptions {
  /** Exact canonical HTTPS browser origins, not identity or TLS evidence. */
  readonly allowedOrigins: readonly string[];
  /** May lower, but never increase, the browser contract's 16 KiB bound. */
  readonly maxBodyBytes?: number;
  readonly bodyTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
}
const fallbackId = '00000000-0000-4000-8000-000000000000';
const responseLimit = 1024 * 1024;
class TransportFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
function bounded(value: number | undefined, defaultValue: number, cap: number) {
  const result = value ?? defaultValue;
  if (!Number.isSafeInteger(result) || result < 1 || result > cap)
    throw new RangeError('Invalid authenticated read transport limits');
  return result;
}
function httpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.origin === value &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.pathname === '/' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
function singleHeader(request: IncomingMessage, name: string): string | null {
  let count = 0;
  for (let i = 0; i < request.rawHeaders.length; i += 2)
    if (request.rawHeaders[i]?.toLowerCase() === name) count++;
  const value = request.headers[name];
  return count === 1 && typeof value === 'string' ? value : null;
}
function failure(code: string, requestId = fallbackId) {
  return {
    schemaVersion: 'world-authorized-read-binding-v1',
    requestId,
    ok: false,
    error: { code, retryable: false },
  };
}
function jsonReply(response: ServerResponse, status: number, body: unknown) {
  if (response.destroyed || response.writableEnded) return;
  let encoded: string;
  try {
    encoded = JSON.stringify(body);
    if (Buffer.byteLength(encoded) > responseLimit)
      throw new TransportFailure(502, 'RESPONSE_TOO_LARGE');
  } catch (error) {
    status = error instanceof TransportFailure ? error.status : 503;
    encoded = JSON.stringify(
      failure(
        error instanceof TransportFailure ? error.code : 'UPSTREAM_UNAVAILABLE',
      ),
    );
  }
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(encoded),
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    // A partially read or rejected upload must not become the next request.
    connection: 'close',
  });
  response.end(encoded);
}
function readJson(
  request: IncomingMessage,
  signal: AbortSignal,
  maxBytes: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const finish = (error?: unknown, value?: unknown) => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      signal.removeEventListener('abort', onAbort);
      chunks.length = 0;
      // Discard remaining upload bytes without retaining buffers. Replies close
      // the connection; the adapter never destroys a response before replying.
      request.resume();
      if (error) reject(error);
      else resolve(value);
    };
    const onAbort = () => finish(signal.reason);
    const onError = () => finish(new TransportFailure(400, 'INVALID_REQUEST'));
    const onData = (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        finish(new TransportFailure(413, 'REQUEST_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(
          Buffer.concat(chunks, bytes),
        );
        finish(undefined, JSON.parse(text) as unknown);
      } catch {
        finish(new TransportFailure(400, 'INVALID_JSON'));
      }
    };
    if (signal.aborted) {
      finish(signal.reason);
      return;
    }
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * PREPARE_ONLY, explicitly mounted by a future server owner, never by default.
 * true = handled; false = NOT_HANDLED (caller retains public/lobby/health/404).
 * This adapter does not establish actual TLS, provider deployment or admission.
 * No Host/forwarded-header/URL role is trusted; config and ports are server-owned.
 */
export function createHttpsAuthenticatedReadRoute(
  config: HttpsReadCompositionConfig | null = null,
  options: HttpsAuthenticatedReadRouteOptions = { allowedOrigins: [] },
) {
  const maxBodyBytes = bounded(options.maxBodyBytes, 16_384, 16_384);
  const bodyTimeoutMs = bounded(options.bodyTimeoutMs, 5_000, 10_000);
  const requestTimeoutMs = bounded(options.requestTimeoutMs, 10_000, 10_000);
  const origins = new Set(options.allowedOrigins);
  if ([...origins].some((origin) => !httpsOrigin(origin)))
    throw new TypeError('Invalid authenticated read browser origin');
  const pins = config ? Object.freeze({ ...config.endpointPins }) : null;
  const reserved = [
    '/healthz',
    '/readyz',
    OFFICIAL_COUNTRY_LIST_PATH,
    OFFICIAL_DATASET_LIST_PATH,
    OFFICIAL_MAP_ASSET_LIST_PATH,
    SEASON1_MY_TEAM_PATH,
  ];
  const path = (value: string) =>
    /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u.test(value) &&
    value.length <= 256 &&
    !value.startsWith('/local/') &&
    // Even a misconfigured read pin cannot shadow the existing public/lobby
    // surfaces. Use their existing server-owned constants, not a new registry.
    !reserved.some(
      (prefix) => value === prefix || value.startsWith(`${prefix}/`),
    );
  const enabled =
    pins !== null &&
    httpsOrigin(pins.origin) &&
    path(pins.projectionPath) &&
    path(pins.finalLookupPath) &&
    pins.projectionPath !== pins.finalLookupPath &&
    origins.size > 0;
  // Construct the existing composition, never accept an arbitrary handler port.
  const composition = createHttpsAuthenticatedReadComposition(
    config && pins ? { ...config, endpointPins: pins } : null,
  );
  return async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> {
    if (
      !enabled ||
      !pins ||
      (request.url !== pins.projectionPath &&
        request.url !== pins.finalLookupPath)
    )
      return false;
    response.setHeader('vary', 'Origin');
    const origin = singleHeader(request, 'origin');
    if (!origin || !origins.has(origin)) {
      jsonReply(response, 403, failure('ORIGIN_DENIED'));
      return true;
    }
    response.setHeader('access-control-allow-origin', origin);
    if (request.method === 'OPTIONS') {
      response.setHeader(
        'vary',
        'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
      );
      const method = singleHeader(request, 'access-control-request-method');
      const supplied = singleHeader(request, 'access-control-request-headers');
      const headers = supplied?.split(',').map((v) => v.trim().toLowerCase());
      if (
        method !== 'POST' ||
        (request.headers['access-control-request-headers'] !== undefined &&
          (!headers ||
            headers.some(
              (v) => !['authorization', 'content-type'].includes(v),
            )))
      ) {
        jsonReply(response, 403, failure('PREFLIGHT_DENIED'));
        return true;
      }
      response.writeHead(204, {
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'Authorization, Content-Type',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        connection: 'close',
      });
      response.end();
      return true;
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST, OPTIONS');
      jsonReply(response, 405, failure('METHOD_NOT_ALLOWED'));
      return true;
    }
    const authorization = singleHeader(request, 'authorization');
    if (
      !authorization ||
      authorization.length > 8192 ||
      !/^Bearer [A-Za-z0-9._~-]+$/u.test(authorization)
    ) {
      jsonReply(response, 401, failure('AUTHORIZATION_DENIED'));
      return true;
    }
    // The existing browser client uses credentials:omit. Cookies never grant
    // access; reject them to keep this endpoint explicitly bearer-only.
    if (request.headers.cookie !== undefined) {
      jsonReply(response, 403, failure('COOKIE_NOT_SUPPORTED'));
      return true;
    }
    const mime = singleHeader(request, 'content-type');
    if (
      !mime ||
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(mime) ||
      request.headers['content-encoding'] !== undefined
    ) {
      jsonReply(response, 415, failure('UNSUPPORTED_MEDIA_TYPE'));
      return true;
    }
    const length = request.headers['content-length'];
    if (
      length !== undefined &&
      (typeof length !== 'string' || !/^\d{1,20}$/u.test(length))
    ) {
      jsonReply(response, 400, failure('INVALID_REQUEST'));
      return true;
    }
    if (length !== undefined && BigInt(length) > BigInt(maxBodyBytes)) {
      jsonReply(response, 413, failure('REQUEST_TOO_LARGE'));
      return true;
    }
    const controller = new AbortController();
    const disconnected = () =>
      controller.abort(new TransportFailure(499, 'CANCELLED'));
    let rejectCancellation: (reason: unknown) => void = () => undefined;
    const cancelled = new Promise<never>((_, reject) => {
      rejectCancellation = reject;
    });
    const onAbort = () => rejectCancellation(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
    request.once('aborted', disconnected);
    response.once('close', disconnected);
    const requestTimer = setTimeout(
      () => controller.abort(new TransportFailure(504, 'UPSTREAM_UNAVAILABLE')),
      requestTimeoutMs,
    );
    const bodyTimer = setTimeout(
      () => controller.abort(new TransportFailure(408, 'REQUEST_TIMEOUT')),
      Math.min(bodyTimeoutMs, requestTimeoutMs),
    );
    let requestId = fallbackId;
    async function execute() {
      const body = await readJson(request, controller.signal, maxBodyBytes);
      clearTimeout(bodyTimer);
      if (controller.signal.aborted) throw controller.signal.reason;
      if (
        body &&
        typeof body === 'object' &&
        'requestId' in body &&
        typeof body.requestId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
          body.requestId,
        )
      )
        requestId = body.requestId;
      const input = { authorization, request: body, signal: controller.signal };
      return request.url === pins!.projectionPath
        ? composition.handleProjection(input)
        : composition.handleFinalLookup(input);
    }
    try {
      if (request.aborted || response.destroyed) disconnected();
      const result = await Promise.race([execute(), cancelled]);
      if (!controller.signal.aborted) {
        // Keep existing bound envelopes (including NOT_CONNECTED and inner
        // NOT_FOUND) intact for the production-read browser protocol.
        const status = !result.ok
          ? result.error.code === 'AUTHORIZATION_DENIED'
            ? 403
            : result.error.code === 'INVALID_REQUEST'
              ? 400
              : 200
          : 200;
        jsonReply(response, status, result);
      }
    } catch (error) {
      const safe =
        error instanceof TransportFailure
          ? error
          : new TransportFailure(503, 'UPSTREAM_UNAVAILABLE');
      if (safe.code !== 'CANCELLED')
        jsonReply(response, safe.status, failure(safe.code, requestId));
    } finally {
      clearTimeout(bodyTimer);
      clearTimeout(requestTimer);
      request.off('aborted', disconnected);
      response.off('close', disconnected);
      controller.signal.removeEventListener('abort', onAbort);
      // Stops outstanding work after any transport failure/response; compliant
      // server ports must honor this signal. No port can restore the response.
      controller.abort(new TransportFailure(499, 'CANCELLED'));
    }
    return true;
  };
}
