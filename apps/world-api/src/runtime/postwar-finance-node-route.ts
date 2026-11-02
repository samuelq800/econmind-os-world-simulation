/** Explicit Node transport only. All JWT/current-seat/CORS/intent decisions
 * remain in the installed Fetch handler. Pools and manual execution stay with
 * the owner of that installation; no environment or Host header is consulted. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AUTHENTICATED_COMMAND_RECOVERY_PATH } from '@econmind/core';
import { AUTHENTICATED_OFFICE_COMMAND_PATH } from '@econmind/core/authenticated-office-command-contract';
import {
  createPostwarOfficeCommandFetchHandler,
  type PostwarOfficeCommandConnections,
} from './postwar-office-command-fetch-handler.js';
import type { PostwarFinanceConnection } from './postwar-finance-connection.js';

const origin = 'http://world-api.invalid';
const paths = [
  AUTHENTICATED_OFFICE_COMMAND_PATH,
  AUTHENTICATED_COMMAND_RECOVERY_PATH,
];
const hop = new Set([
  'host',
  'connection',
  'transfer-encoding',
  'keep-alive',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
]);
const disconnected = () =>
  new DOMException('Node client disconnected', 'AbortError');
function createNodeCommandRoute(
  connection: Pick<PostwarFinanceConnection, 'handle' | 'stop'>,
  options: Readonly<{ timeoutMs?: number }> = {},
) {
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
    throw Error('FINANCE_NODE_BOUNDED_TIMEOUT_REQUIRED');
  let accepting = true;
  const active = new Set<Promise<void>>();
  const matches = (req: IncomingMessage) =>
    paths.some((p) => req.url === p || req.url?.startsWith(p + '?'));
  async function serve(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const controller = new AbortController();
    let dispatched = false;
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined,
      bodyStopped = false;
    const stopBody = () => {
      if (bodyStopped) return;
      bodyStopped = true;
      req.off('data', data);
      req.off('end', end);
      req.off('error', bodyError);
      req.pause();
    };
    const data = (chunk: Buffer) => {
      if (bodyStopped) return;
      bodyController!.enqueue(chunk);
      if ((bodyController!.desiredSize ?? 0) <= 0) req.pause();
    };
    const end = () => {
      if (bodyStopped) return;
      stopBody();
      bodyController!.close();
    };
    const bodyError = (error: Error) => {
      if (bodyStopped || !bodyController) return;
      stopBody();
      bodyController!.error(error);
    };
    const abort = () => {
      if (!controller.signal.aborted) controller.abort(disconnected());
    };
    const close = () => {
      if (!res.writableFinished) abort();
    };
    req.once('aborted', abort);
    res.once('close', close);
    // A destroyed upload may emit its error after the Fetch cancellation has
    // settled. Keep this request-local one-shot listener for that late error.
    req.once('error', abort);
    const cancelled = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => {
          bodyError(disconnected());
          reject(controller.signal.reason);
        },
        { once: true },
      );
    });
    void cancelled.catch(() => {});
    const timer = setTimeout(abort, timeoutMs);
    timer.unref();
    try {
      if (!accepting) {
        res.writeHead(503, { 'cache-control': 'private, no-store' });
        res.end();
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (hop.has(name) || value === undefined) continue;
        for (const v of Array.isArray(value) ? value : [value])
          headers.append(name, v);
      }
      const method = req.method ?? 'GET';
      const body = ['GET', 'HEAD'].includes(method)
        ? undefined
        : new ReadableStream<Uint8Array>(
            {
              start(c) {
                bodyController = c;
                req.pause();
                req.on('data', data);
                req.once('end', end);
                req.once('error', bodyError);
              },
              pull() {
                if (!bodyStopped) req.resume();
              },
              cancel() {
                stopBody();
              },
            },
            { highWaterMark: 0 },
          );
      const init: RequestInit & { duplex?: 'half' } = {
        method,
        headers,
        signal: controller.signal,
        ...(body === undefined ? {} : { body, duplex: 'half' as const }),
      };
      const request = new Request(origin + req.url, init);
      dispatched = true;
      const operation = connection.handle(request);
      // A late result after disconnect/deadline must not retain a response body.
      void operation.then(
        (r) => {
          if (controller.signal.aborted) void r?.body?.cancel().catch(() => {});
        },
        () => {},
      );
      const response = await Promise.race([operation, cancelled]);
      if (!response) throw Error('FIXED_FINANCE_HANDLER_DID_NOT_MATCH');
      const reader = response.body?.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        if (reader)
          for (;;) {
            const part = await Promise.race([reader.read(), cancelled]);
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 65536) throw Error('FINANCE_NODE_RESPONSE_BOUND');
            chunks.push(part.value);
          }
      } finally {
        await reader?.cancel().catch(() => {});
        reader?.releaseLock();
      }
      if (res.destroyed || controller.signal.aborted) return;
      const output: Record<string, string | string[]> = {};
      response.headers.forEach((v, k) => {
        if (!hop.has(k) && k !== 'content-length' && k !== 'set-cookie')
          output[k] = v;
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) output['set-cookie'] = cookies;
      if (![204, 304].includes(response.status))
        output['content-length'] = String(size);
      // An early CORS/method/size rejection must flush its actual handler reply
      // before closing an unfinished upload, rather than destroying the socket.
      if (!req.complete) output.connection = 'close';
      res.writeHead(response.status, output);
      res.end(method === 'HEAD' ? undefined : Buffer.concat(chunks), () => {
        if (!req.complete) req.destroy();
      });
    } catch {
      if (!res.destroyed && !res.headersSent) {
        const unknownWrite =
          dispatched &&
          req.method === 'POST' &&
          req.url?.split('?', 1)[0] === AUTHENTICATED_OFFICE_COMMAND_PATH;
        res.writeHead(503, {
          'cache-control': 'private, no-store',
          'content-type': 'application/json',
          connection: 'close',
        });
        res.end(
          JSON.stringify({
            ok: false,
            error: {
              code: unknownWrite
                ? 'WRITE_OUTCOME_UNKNOWN'
                : 'UPSTREAM_UNAVAILABLE',
              retryable: !unknownWrite,
            },
          }),
        );
      }
    } finally {
      clearTimeout(timer);
      stopBody();
      req.off('aborted', abort);
      res.off('close', close);
    }
  }
  return Object.freeze({
    matches,
    handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
      if (!matches(req))
        return Promise.reject(Error('FINANCE_NODE_FIXED_PATH_REQUIRED'));
      const task = serve(req, res);
      active.add(task);
      void task.then(
        () => active.delete(task),
        () => active.delete(task),
      );
      return task;
    },
    stopAccepting() {
      accepting = false;
    },
    async drain() {
      while (active.size) await Promise.allSettled([...active]);
      await connection.stop();
    },
  });
}

/** Compatibility entry: preserves the existing Finance-only Fetch behavior. */
export function createPostwarFinanceNodeRoute(
  connection: PostwarFinanceConnection,
  options: Readonly<{ timeoutMs?: number }> = {},
) {
  return createNodeCommandRoute(connection, options);
}
/** Fixed dual-office entry: only the explicit Finance/Social structured ports. */
export function createPostwarOfficeNodeRoute(
  connections: PostwarOfficeCommandConnections,
  options: Readonly<{ timeoutMs?: number }> = {},
) {
  return createNodeCommandRoute(
    createPostwarOfficeCommandFetchHandler(connections),
    options,
  );
}
