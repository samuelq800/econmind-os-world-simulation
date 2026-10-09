import { handleAsNodeRequest } from 'cloudflare:node';
import { createHoldApiServer } from '../src/runtime-preparation/hold-api-server.js';

// A Workers Node HTTP routing key, not an externally opened TCP listener.
const server = createHoldApiServer();
server.listen(4101);

export default {
  /** @param {Request} request
   * @param {CloudflareRuntimeApiEnv} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      url.pathname === '/readyz' &&
      !url.search
    ) {
      let executorTransport = 'UNAVAILABLE';
      try {
        const response = await env.WORLD_EXECUTOR.fetch(
          'https://executor.internal/healthz',
          {
            method: 'HEAD',
            signal: AbortSignal.timeout(1500),
          },
        );
        if (
          response.status === 200 &&
          response.headers.get('x-world-runtime-mode') === 'HOLD'
        )
          executorTransport = 'ALIVE_HOLD';
        await response.body?.cancel();
      } catch {
        // A healthy service binding never grants economic readiness.
      }
      const body = JSON.stringify({
        service: 'world-api',
        runtimeMode: 'HOLD',
        runtimeReady: false,
        executorTransport,
        databaseConnected: false,
        simulationEnabled: false,
        clockEnabled: false,
        authoritativeCommandsEnabled: false,
      });
      return new Response(request.method === 'HEAD' ? null : body, {
        status: 503,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'private, no-store',
          'x-world-runtime-mode': 'HOLD',
        },
      });
    }
    return handleAsNodeRequest(4101, request);
  },
};
