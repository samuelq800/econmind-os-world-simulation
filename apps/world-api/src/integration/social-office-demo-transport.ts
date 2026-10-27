/** Exact isolated HTTP parsing only. F owns the one listener and physical lifecycle. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { types } from 'node:util';
import {
  assertSocialOfficeDemoService,
  type SocialOfficeDemoService,
  type SocialOfficeDemoReply,
} from './social-office-demo-service.js';

class ProtocolError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function reply(response: ServerResponse, result: SocialOfficeDemoReply): void {
  if (response.destroyed || response.writableEnded) return;
  const raw = Buffer.from(JSON.stringify(result.body), 'utf8');
  if (raw.byteLength > 262144)
    throw new ProtocolError(503, 'Response exceeded its bound');
  response.writeHead(result.httpStatus, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(raw.byteLength),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(raw);
}
async function jsonBody(request: IncomingMessage): Promise<unknown> {
  if (
    request.headers['transfer-encoding'] !== undefined ||
    typeof request.headers['content-length'] !== 'string' ||
    !/^(?:0|[1-9]\d*)$/u.test(request.headers['content-length'])
  )
    throw new ProtocolError(411, 'A bounded Content-Length is required');
  const expected = BigInt(request.headers['content-length']);
  if (expected > 4096n)
    throw new ProtocolError(413, 'Request body is too large');
  if (
    (request.headers['content-type'] ?? '')
      .split(';')[0]
      ?.trim()
      .toLowerCase() !== 'application/json' ||
    request.headers['content-encoding'] !== undefined
  )
    throw new ProtocolError(415, 'Uncompressed JSON is required');
  const chunks: Buffer[] = [];
  let size = 0n;
  for await (const part of request) {
    const chunk = Buffer.isBuffer(part)
      ? part
      : Buffer.from(part as Uint8Array);
    size += BigInt(chunk.byteLength);
    if (size > expected || size > 4096n)
      throw new ProtocolError(413, 'Request body exceeded its bound');
    chunks.push(chunk);
  }
  if (size !== expected || request.aborted)
    throw new ProtocolError(400, 'Incomplete request body');
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    return JSON.parse(utf8) as unknown;
  } catch {
    throw new ProtocolError(400, 'Invalid UTF-8 JSON');
  }
}
function checkHeaders(request: IncomingMessage) {
  const critical = new Set([
    'authorization',
    'origin',
    'host',
    'content-type',
    'content-length',
    'transfer-encoding',
    'content-encoding',
  ]);
  const seen = new Set<string>();
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    const name = request.rawHeaders[i]!.toLowerCase();
    if (critical.has(name) && seen.has(name))
      throw new ProtocolError(400, 'Duplicate security header');
    seen.add(name);
  }
}
export function createSocialOfficeDemoTransport(
  input: Readonly<{
    service: Readonly<SocialOfficeDemoService>;
    allocatedOrigin: string;
  }>,
) {
  if (
    !input ||
    types.isProxy(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    throw Error('SOCIAL_DEMO_TRANSPORT: own composition required');
  const ds = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(ds).length !== 2 ||
    !['service', 'allocatedOrigin'].every(
      (k) => ds[k] && Object.hasOwn(ds[k], 'value') && ds[k]!.enumerable,
    )
  )
    throw Error('SOCIAL_DEMO_TRANSPORT: closed composition required');
  const service: unknown = ds.service!.value;
  assertSocialOfficeDemoService(service);
  const allocatedOrigin: unknown = ds.allocatedOrigin!.value;
  if (typeof allocatedOrigin !== 'string')
    throw Error('SOCIAL_DEMO_TRANSPORT: allocated origin required');
  const origin = new URL(allocatedOrigin);
  if (
    origin.protocol !== 'http:' ||
    origin.hostname !== '127.0.0.1' ||
    !origin.port ||
    origin.origin !== allocatedOrigin ||
    origin.username ||
    origin.password
  )
    throw Error('SOCIAL_DEMO_TRANSPORT: exact loopback origin required');
  return Object.freeze({
    async handle(
      request: IncomingMessage,
      response: ServerResponse,
    ): Promise<boolean> {
      if (!request.url?.startsWith('/isolated/v1/social-office/')) return false;
      const controller = new AbortController();
      const abort = () => controller.abort();
      const close = () => {
        if (!response.writableEnded) controller.abort();
      };
      request.once('aborted', abort);
      response.once('close', close);
      try {
        checkHeaders(request);
        if (request.url.startsWith('//'))
          throw new ProtocolError(400, 'Origin-form request required');
        const url = new URL(request.url, allocatedOrigin);
        if (url.origin !== allocatedOrigin || url.hash)
          throw new ProtocolError(400, 'Invalid request target');
        const post = request.method === 'POST',
          get = request.method === 'GET';
        if (!post && !get) throw new ProtocolError(405, 'Method not supported');
        const suppliedOrigin = request.headers.origin;
        if (
          (post && suppliedOrigin !== allocatedOrigin) ||
          (suppliedOrigin !== undefined && suppliedOrigin !== allocatedOrigin)
        )
          throw new ProtocolError(403, 'Same-origin request required');
        const authorization: unknown = request.headers.authorization;
        const signal = controller.signal;
        let result: SocialOfficeDemoReply;
        if (
          url.pathname === '/isolated/v1/social-office/session' &&
          post &&
          url.search === ''
        ) {
          const body = await jsonBody(request);
          if (
            !body ||
            typeof body !== 'object' ||
            Array.isArray(body) ||
            Object.keys(body).length !== 0
          )
            throw new ProtocolError(
              400,
              'Session accepts no identity overrides',
            );
          result = await service.session({ signal });
        } else if (
          url.pathname === '/isolated/v1/social-office/command' &&
          post &&
          url.search === ''
        ) {
          result = await service.handle({
            authorization,
            request: await jsonBody(request),
            signal,
          });
        } else if (
          url.pathname === '/isolated/v1/social-office/projection' &&
          get &&
          url.search === ''
        ) {
          if (
            request.headers['transfer-encoding'] !== undefined ||
            (request.headers['content-length'] !== undefined &&
              request.headers['content-length'] !== '0')
          )
            throw new ProtocolError(400, 'Projection is bodyless');
          result = await service.projection({ authorization, signal });
        } else if (
          url.pathname === '/isolated/v1/social-office/receipt' &&
          get &&
          [...url.searchParams.keys()].join('|') === 'requestId'
        ) {
          if (
            request.headers['transfer-encoding'] !== undefined ||
            (request.headers['content-length'] !== undefined &&
              request.headers['content-length'] !== '0')
          )
            throw new ProtocolError(400, 'Receipt lookup is bodyless');
          result = await service.receipt({
            authorization,
            requestId: url.searchParams.get('requestId'),
            signal,
          });
        } else throw new ProtocolError(404, 'Isolated route not found');
        reply(response, result);
      } catch (error) {
        reply(response, {
          httpStatus: error instanceof ProtocolError ? error.status : 503,
          body: {
            schemaVersion: 'g-social-office-error-v1',
            message:
              error instanceof ProtocolError
                ? error.message
                : 'Result unavailable. Recover the same original request receipt.',
          },
        });
      } finally {
        request.removeListener('aborted', abort);
        response.removeListener('close', close);
      }
      return true;
    },
  });
}
