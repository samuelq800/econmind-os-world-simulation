/** Internal-only hosting preparation. No queue, lease, storage, clock, scheduled
 * event or automatic authoritative consumer is installed by this module. */
export function handleHoldExecutor(request: Request): Response {
  const url = new URL(request.url);
  const allowed = request.method === 'GET' || request.method === 'HEAD';
  const status = !allowed
    ? 405
    : url.pathname === '/healthz' && !url.search
      ? 200
      : url.pathname === '/readyz' && !url.search
        ? 503
        : 404;
  const body = JSON.stringify({
    service: 'world-worker',
    runtimeMode: 'HOLD',
    runtimeReady: false,
    simulationEnabled: false,
    clockEnabled: false,
    databaseConnected: false,
    leaseAcquired: false,
    automaticConsumerEnabled: false,
  });
  return new Response(request.method === 'HEAD' ? null : body, {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'x-world-runtime-mode': 'HOLD',
      ...(!allowed ? { allow: 'GET, HEAD' } : {}),
    },
  });
}

export default { fetch: handleHoldExecutor };
