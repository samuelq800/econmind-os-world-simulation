import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import type {
  AuthenticatedNarrowTransferCommandHandler,
  WorldCommandResponseEnvelope,
} from './authenticated-narrow-transfer-command-handler.js';
import type {
  AuthenticatedFinalReceiptQueryHandler,
  WorldFinalReceiptReadResponseEnvelope,
} from './authenticated-final-receipt-query-handler.js';
import type { AuthenticatedWorldReadQueryHandler } from './authenticated-read-query-handler.js';
import type { WorldReadResponseEnvelope } from './contracts.js';

export const LOCAL_WORLD_HTTP_BRIDGE_STATUS = 'NOT_AVAILABLE' as const;
export const LOCAL_WORLD_HTTP_BRIDGE_READ_PATH =
  '/local/v1/world-read' as const;
export const LOCAL_WORLD_HTTP_BRIDGE_COMMAND_PATH =
  '/local/v1/narrow-transfer-command' as const;
export const LOCAL_WORLD_HTTP_BRIDGE_RECEIPT_PATH =
  '/local/v1/narrow-transfer-receipt' as const;
export const MAX_LOCAL_WORLD_HTTP_BODY_BYTES = 16 * 1024;

export interface LocalNonproductionWorldHttpBridge {
  readonly bindHost: '127.0.0.1' | 'localhost' | '::1';
  handle(request: IncomingMessage, response: ServerResponse): Promise<void>;
}

export interface RunningLocalNonproductionWorldHttpBridge {
  readonly origin: string;
  readonly port: number;
  readonly shutdown: () => Promise<void>;
}

export interface LocalNonproductionWorldHttpBridgeInput {
  /** One explicitly approved loopback page origin; omitted means no browser access. */
  readonly allowedBrowserOrigin?: string;
  readonly bindHost?: '127.0.0.1' | 'localhost' | '::1';
  readonly commandHandler?: AuthenticatedNarrowTransferCommandHandler;
  readonly environment: NodeJS.ProcessEnv;
  readonly readHandler?: AuthenticatedWorldReadQueryHandler;
  readonly receiptHandler?: AuthenticatedFinalReceiptQueryHandler;
}

const LOOPBACK_BIND_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const BRIDGE_PATHS = new Set<string>([
  LOCAL_WORLD_HTTP_BRIDGE_READ_PATH,
  LOCAL_WORLD_HTTP_BRIDGE_COMMAND_PATH,
  LOCAL_WORLD_HTTP_BRIDGE_RECEIPT_PATH,
]);

function localOnlyFailure(message: string): never {
  throw new Error(`LOCAL_WORLD_HTTP_BRIDGE_INVALID: ${message}`);
}

function assertNonproductionEnvironment(environment: NodeJS.ProcessEnv): void {
  if (
    environment.ECONMIND_ENV !== 'local' &&
    environment.ECONMIND_ENV !== 'ci'
  ) {
    localOnlyFailure('ECONMIND_ENV must be local or ci');
  }
  for (const [name, value] of Object.entries(environment)) {
    if (/^(?:VITE_)?SUPABASE_/u.test(name) && value) {
      localOnlyFailure(`${name} must be absent from the local HTTP bridge`);
    }
  }
}

function loopbackPeer(value: string | undefined): boolean {
  return (
    value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1'
  );
}

function browserOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return localOnlyFailure('allowedBrowserOrigin must be a loopback origin');
  }
  const port = Number(parsed.port);
  if (
    parsed.protocol !== 'http:' ||
    !LOOPBACK_BIND_HOSTS.has(parsed.hostname.replace(/^\[|\]$/g, '')) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    value !== parsed.origin
  ) {
    localOnlyFailure('allowedBrowserOrigin must be an exact loopback origin');
  }
  return parsed.origin;
}

function allowedPreflightHeaders(
  value: string | string[] | undefined,
): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'string') return false;
  const headers = value.split(',').map((header) => header.trim().toLowerCase());
  return headers.every(
    (header) => header === 'authorization' || header === 'content-type',
  );
}

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  statusCode: number,
  body: object,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(request.method === 'HEAD' ? undefined : payload);
}

function unavailable(
  operation:
    | 'READ_WORLD_PROJECTION'
    | 'SUBMIT_NARROW_TRANSFER'
    | 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
) {
  return Object.freeze({
    availability: LOCAL_WORLD_HTTP_BRIDGE_STATUS,
    operation,
    reason: 'SERVER_DEPENDENCIES_UNBOUND',
    service: 'world-api',
  });
}

function httpStatusForRead(response: WorldReadResponseEnvelope): number {
  if (response.ok) return 200;
  switch (response.error.code) {
    case 'AUTHENTICATION_REQUIRED':
    case 'AUTHENTICATION_INVALID':
      return 401;
    case 'AUTHORIZATION_DENIED':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'STALE_PROJECTION':
      return 409;
    case 'RATE_LIMITED':
      return 429;
    case 'TIMEOUT':
    case 'UPSTREAM_UNAVAILABLE':
      return 503;
    default:
      return 400;
  }
}

function httpStatusForCommand(response: WorldCommandResponseEnvelope): number {
  if (response.ok) return 200;
  switch (response.error.code) {
    case 'AUTHENTICATION_REQUIRED':
    case 'AUTHENTICATION_INVALID':
      return 401;
    case 'AUTHORIZATION_DENIED':
      return 403;
    case 'UPSTREAM_UNAVAILABLE':
      return 503;
    default:
      return 400;
  }
}

function httpStatusForReceipt(
  response: WorldFinalReceiptReadResponseEnvelope,
): number {
  if (response.ok) return 200;
  switch (response.error.code) {
    case 'AUTHENTICATION_REQUIRED':
    case 'AUTHENTICATION_INVALID':
      return 401;
    case 'NOT_FOUND':
      return 404;
    case 'UPSTREAM_UNAVAILABLE':
      return 503;
    default:
      return 400;
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type'];
  if (
    typeof contentType !== 'string' ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType)
  ) {
    throw new Error('CONTENT_TYPE_INVALID');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const rendered = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += rendered.byteLength;
    if (size > MAX_LOCAL_WORLD_HTTP_BODY_BYTES) {
      throw new Error('BODY_TOO_LARGE');
    }
    chunks.push(rendered);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new Error('BODY_INVALID_JSON');
  }
}

/**
 * Local-only, dependency-injected HTTP wiring. It creates no database client,
 * verifier, approval reader or receipt store; absent server dependencies are a
 * deliberate 503 NOT_AVAILABLE response rather than fixture-backed behavior.
 */
export function createLocalNonproductionWorldHttpBridge(
  input: LocalNonproductionWorldHttpBridgeInput,
): Readonly<LocalNonproductionWorldHttpBridge> {
  assertNonproductionEnvironment(input.environment);
  const bindHost = input.bindHost ?? '127.0.0.1';
  if (!LOOPBACK_BIND_HOSTS.has(bindHost)) {
    localOnlyFailure('bindHost must be a loopback host');
  }
  const allowedOrigin =
    input.allowedBrowserOrigin === undefined
      ? undefined
      : browserOrigin(input.allowedBrowserOrigin);
  return Object.freeze({
    bindHost,
    async handle(request: IncomingMessage, response: ServerResponse) {
      if (!loopbackPeer(request.socket.remoteAddress)) {
        sendJson(request, response, 403, {
          availability: 'NOT_AVAILABLE',
          reason: 'LOOPBACK_PEER_REQUIRED',
          service: 'world-api',
        });
        return;
      }
      const path = request.url?.split('?', 1)[0];
      const origin = request.headers.origin;
      if (
        origin !== undefined &&
        (allowedOrigin === undefined || origin !== allowedOrigin)
      ) {
        sendJson(request, response, 403, {
          availability: 'NOT_AVAILABLE',
          reason: 'BROWSER_ORIGIN_DENIED',
          service: 'world-api',
        });
        return;
      }
      if (origin === allowedOrigin && allowedOrigin !== undefined) {
        response.setHeader('access-control-allow-origin', allowedOrigin);
        response.setHeader(
          'vary',
          'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
        );
      }
      if (request.method === 'OPTIONS') {
        if (
          origin !== allowedOrigin ||
          allowedOrigin === undefined ||
          !BRIDGE_PATHS.has(path ?? '') ||
          request.headers['access-control-request-method'] !== 'POST' ||
          !allowedPreflightHeaders(
            request.headers['access-control-request-headers'],
          )
        ) {
          sendJson(request, response, 403, {
            availability: 'NOT_AVAILABLE',
            reason: 'BROWSER_PREFLIGHT_DENIED',
            service: 'world-api',
          });
          return;
        }
        response.writeHead(204, {
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'POST',
          'cache-control': 'no-store',
        });
        response.end();
        return;
      }
      if (request.method !== 'POST') {
        response.writeHead(405, { allow: 'POST' });
        response.end();
        return;
      }
      if (path === LOCAL_WORLD_HTTP_BRIDGE_READ_PATH) {
        if (input.readHandler === undefined) {
          sendJson(
            request,
            response,
            503,
            unavailable('READ_WORLD_PROJECTION'),
          );
          return;
        }
        let body: unknown;
        try {
          body = await readJsonBody(request);
        } catch {
          sendJson(request, response, 400, {
            availability: 'NOT_AVAILABLE',
            reason: 'REQUEST_BODY_INVALID',
            service: 'world-api',
          });
          return;
        }
        const result = await input.readHandler.handle({
          authorization: request.headers.authorization,
          request: body,
        });
        sendJson(request, response, httpStatusForRead(result), result);
        return;
      }
      if (path === LOCAL_WORLD_HTTP_BRIDGE_COMMAND_PATH) {
        if (input.commandHandler === undefined) {
          sendJson(
            request,
            response,
            503,
            unavailable('SUBMIT_NARROW_TRANSFER'),
          );
          return;
        }
        let body: unknown;
        try {
          body = await readJsonBody(request);
        } catch {
          sendJson(request, response, 400, {
            availability: 'NOT_AVAILABLE',
            reason: 'REQUEST_BODY_INVALID',
            service: 'world-api',
          });
          return;
        }
        const result = await input.commandHandler.handle({
          authorization: request.headers.authorization,
          request: body,
        });
        sendJson(request, response, httpStatusForCommand(result), result);
        return;
      }
      if (path === LOCAL_WORLD_HTTP_BRIDGE_RECEIPT_PATH) {
        if (input.receiptHandler === undefined) {
          sendJson(
            request,
            response,
            503,
            unavailable('READ_FINAL_NARROW_TRANSFER_RECEIPT'),
          );
          return;
        }
        let body: unknown;
        try {
          body = await readJsonBody(request);
        } catch {
          sendJson(request, response, 400, {
            availability: 'NOT_AVAILABLE',
            reason: 'REQUEST_BODY_INVALID',
            service: 'world-api',
          });
          return;
        }
        const result = await input.receiptHandler.handle({
          authorization: request.headers.authorization,
          request: body,
        });
        sendJson(request, response, httpStatusForReceipt(result), result);
        return;
      }
      sendJson(request, response, 404, {
        availability: 'NOT_AVAILABLE',
        reason: 'ROUTE_NOT_FOUND',
        service: 'world-api',
      });
    },
  });
}

export async function startLocalNonproductionWorldHttpBridge(input: {
  readonly bridge: LocalNonproductionWorldHttpBridge;
  readonly port?: number;
}): Promise<RunningLocalNonproductionWorldHttpBridge> {
  const server = createServer((request, response) => {
    void input.bridge.handle(request, response).catch(() => {
      if (!response.headersSent) {
        sendJson(request, response, 503, {
          availability: 'NOT_AVAILABLE',
          reason: 'SERVER_HANDLER_UNAVAILABLE',
          service: 'world-api',
        });
      } else {
        response.destroy();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(input.port ?? 0, input.bridge.bindHost, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('LOCAL_WORLD_HTTP_BRIDGE_NO_TCP_ADDRESS');
  }
  const host =
    input.bridge.bindHost === '::1' ? '[::1]' : input.bridge.bindHost;
  let shutdownPromise: Promise<void> | undefined;
  return Object.freeze({
    origin: `http://${host}:${address.port}`,
    port: address.port,
    shutdown: () => {
      shutdownPromise ??= new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      });
      return shutdownPromise;
    },
  });
}
