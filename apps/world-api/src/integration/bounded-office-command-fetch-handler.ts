/** Explicit, nonactivated fixed route. Pool/credentials/consumer lifecycle
 * belong to the trusted host. This handler starts no server or Worker loop. */
import {
  AUTHENTICATED_OFFICE_COMMAND_PATH,
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
} from '@econmind/core/authenticated-office-command-contract';
import { createBoundedAuthenticatedOfficeCommandService } from './bounded-authenticated-office-command-service.js';
import {
  AUTHENTICATED_COMMAND_RECOVERY_PATH,
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
} from '@econmind/core';
import { createBoundedOfficeCommandRecoveryService } from './bounded-office-command-recovery-service.js';
import type { AuthenticatedOfficeCommandServiceConfig } from './authenticated-office-command-service.js';

export function createBoundedOfficeCommandFetchHandler(
  config: Readonly<{
    allowedOrigins: readonly string[];
    composition: AuthenticatedOfficeCommandServiceConfig;
  }> | null = null,
) {
  const origins = new Set(config?.allowedOrigins ?? []);
  if (
    config &&
    (origins.size === 0 ||
      origins.size > 8 ||
      [...origins].some((origin) => {
        try {
          const u = new URL(origin);
          return (
            u.protocol !== 'https:' ||
            u.origin !== origin ||
            !!u.username ||
            !!u.password
          );
        } catch {
          return true;
        }
      }))
  )
    throw Error('OFFICE_COMMAND_ORIGINS_INVALID');
  const service = createBoundedAuthenticatedOfficeCommandService(
    config?.composition ?? null,
  );
  const recovery = createBoundedOfficeCommandRecoveryService(
    config?.composition ?? null,
  );
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const recovering = url.pathname === AUTHENTICATED_COMMAND_RECOVERY_PATH;
    const origin = request.headers.get('origin');
    const headers = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      vary: 'Origin',
    });
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers });
    const fail = (status: number, code: string) =>
      reply(status, {
        schemaVersion: recovering
          ? AUTHENTICATED_COMMAND_RECOVERY_SCHEMA
          : AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
        requestId: '00000000-0000-4000-8000-000000000000',
        ok: false,
        error: { code, retryable: false },
      });
    if (
      (url.pathname !== AUTHENTICATED_OFFICE_COMMAND_PATH && !recovering) ||
      url.search
    )
      return fail(404, 'NOT_FOUND');
    if (!config) return fail(503, 'NOT_CONNECTED');
    if (!origin || !origins.has(origin)) return fail(403, 'ORIGIN_DENIED');
    headers.set('access-control-allow-origin', origin);
    if (request.method === 'OPTIONS') {
      if (request.headers.get('access-control-request-method') !== 'POST')
        return fail(405, 'METHOD_NOT_ALLOWED');
      headers.set('access-control-allow-methods', 'POST');
      headers.set('access-control-allow-headers', 'authorization,content-type');
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
    if (
      request.headers.get('content-type')?.split(';')[0]?.trim() !==
      'application/json'
    )
      return fail(415, 'CONTENT_TYPE_INVALID');
    if (request.signal.aborted) return fail(499, 'CANCELLED');
    const reader = request.body?.getReader();
    if (!reader) return fail(400, 'INVALID_JSON');
    const controller = new AbortController();
    const abort = () => controller.abort();
    const cancelBody = () => {
      void reader.cancel().catch(() => undefined);
    };
    request.signal.addEventListener('abort', abort, { once: true });
    controller.signal.addEventListener('abort', cancelBody, { once: true });
    const timer = setTimeout(abort, 10000);
    if (request.signal.aborted) abort();
    try {
      let raw = '';
      try {
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 16384) {
            await reader.cancel();
            return fail(413, 'REQUEST_TOO_LARGE');
          }
          chunks.push(part.value);
        }
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        raw = new TextDecoder('utf-8', { fatal: true }).decode(body);
      } catch {
        return fail(
          controller.signal.aborted ? 499 : 400,
          controller.signal.aborted ? 'CANCELLED' : 'INVALID_JSON',
        );
      } finally {
        reader.releaseLock();
      }
      if (controller.signal.aborted) return fail(499, 'CANCELLED');
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return fail(400, 'INVALID_JSON');
      }
      const result = await (recovering ? recovery : service).handle({
        authorization: request.headers.get('authorization'),
        request: body,
        signal: controller.signal,
      });
      return reply(result.httpStatus, result.body);
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', cancelBody);
    }
  };
}
