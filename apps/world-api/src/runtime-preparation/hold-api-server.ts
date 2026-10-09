import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { AUTHENTICATED_OFFICE_COMMAND_PATH } from '@econmind/core/authenticated-office-command-contract';
import { createHttpsAuthenticatedOfficeCommandRoute } from '../integration/https-authenticated-office-command-route.js';

function reply(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  code: string,
) {
  const body = JSON.stringify({
    service: 'world-api',
    status: code,
    runtimeMode: 'HOLD',
    runtimeReady: false,
    simulationEnabled: false,
    clockEnabled: false,
    databaseConnected: false,
    authoritativeCommandsEnabled: false,
  });
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'x-world-runtime-mode': 'HOLD',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/** Deployable hosting preparation. There is deliberately no environment or
 * request switch that can supply economic composition, seats or database pools.
 * The existing reviewed Office route is mounted with its fail-closed default.
 */
export function createHoldApiServer() {
  const office = createHttpsAuthenticatedOfficeCommandRoute({
    path: AUTHENTICATED_OFFICE_COMMAND_PATH,
    allowedOrigins: [
      'https://world.econmind.group',
      'https://samuelq800.github.io',
    ],
    composition: null,
  });
  return createServer((req, res) => {
    void office(req, res)
      .then((handled) => {
        if (handled || res.writableEnded || res.destroyed) return;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.setHeader('allow', 'GET, HEAD');
          reply(req, res, 405, 'METHOD_NOT_ALLOWED');
        } else if (req.url === '/healthz') {
          reply(req, res, 200, 'ALIVE_NOT_ACTIVATED');
        } else if (req.url === '/readyz') {
          reply(req, res, 503, 'OPENING_IDENTITY_DATABASE_AND_REVIEW_REQUIRED');
        } else {
          reply(req, res, 404, 'NOT_FOUND');
        }
      })
      .catch(() => {
        if (!res.writableEnded && !res.destroyed)
          reply(req, res, 503, 'UNAVAILABLE');
      });
  });
}
