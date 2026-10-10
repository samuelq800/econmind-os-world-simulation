import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { WORLD_MODEL_VERSION } from '@econmind/core';
import type { AuthenticatedFinancialIntakeCompositionConfig } from '../../apps/world-api/src/integration/authenticated-financial-intake-composition.js';
import type { ExplicitReadPreparationConfig } from '../../apps/world-api/src/runtime-preparation/explicit-read-preparation-config.js';
export const ORIGIN = 'https://browser-test-only.example.invalid';
export function readConfig(
  c: AuthenticatedFinancialIntakeCompositionConfig,
): ExplicitReadPreparationConfig {
  return {
    modelVersion: WORLD_MODEL_VERSION,
    pool: c.readPool,
    readerRole: c.readerRole,
    authorizationPublisherRole: c.authorizationPublisherRole,
    admittedWorldPins: c.admittedWorldPins,
    auth: c.auth,
    routeOptions: { allowedOrigins: [ORIGIN] },
    endpointPins: {
      origin: 'https://api-test-only.example.invalid',
      projectionPath: '/v1/world-read',
      finalLookupPath: '/v1/world-final',
      deploymentRef: 'DEPLOYMENT_TEST_ONLY',
    },
  };
}
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
/** Real loopback Node sockets, intentionally no TLS/workerd/production claim. */
export async function socketHost(
  handler: (request: Request) => Promise<Response | null>,
  internal = false,
) {
  const failures: unknown[] = [],
    server: Server = createServer((req, res) => {
      const abort = new AbortController();
      req.once('aborted', () => abort.abort());
      res.once('close', () => {
        if (!res.writableEnded) abort.abort();
      });
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers))
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(',') : value);
      const init: RequestInit & { duplex: 'half' } = {
        method: req.method ?? 'GET',
        headers,
        signal: abort.signal,
        duplex: 'half',
      };
      if (!['GET', 'HEAD'].includes(init.method!))
        init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
      const request = new Request(
        (internal
          ? 'https://executor.internal'
          : 'https://api-test-only.example.invalid') + (req.url ?? '/'),
        init,
      );
      void handler(request)
        .then(async (response) => {
          if (!response) {
            res.writeHead(404);
            res.end();
            return;
          }
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
        })
        .catch((error: unknown) => {
          failures.push(error);
          res.destroy();
        });
    });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    failures,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
export const jsonRequest = (
  path: string,
  body: unknown,
  token: string,
  signal?: AbortSignal,
) =>
  new Request('https://api-test-only.example.invalid' + path, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      origin: ORIGIN,
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
