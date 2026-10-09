import { request, type IncomingMessage } from 'node:http';

/** Test-only, one-request loopback transport. No shared fetch/Undici pool may
 * outlive an owned runtime fixture. Drain the body before reporting status and
 * close the socket before settling, including failures and an absolute deadline.
 */
export function probePublicRuntimeEndpoint(
  port: number,
  endpoint: '/readyz' | '/healthz',
  timeoutMs = 250,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let response: IncomingMessage | undefined;
    let settled = false;
    const ownedRequest = request({
      host: '127.0.0.1',
      port,
      path: endpoint,
      method: 'GET',
      agent: false,
      headers: { Connection: 'close', 'Cache-Control': 'no-store' },
    });
    const deadline = setTimeout(() => {
      finish(
        Object.assign(new Error('Owned loopback HTTP probe timed out'), {
          code: 'ETIMEDOUT',
        }),
      );
    }, timeoutMs);

    function finish(error?: Error, ok = false): void {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      const complete = () => (error ? reject(error) : resolve(ok));
      const socket = ownedRequest.socket;
      // destroy() marks a socket destroyed before its asynchronous close event.
      // Waiting for closed, rather than destroyed, avoids a lingering transport.
      if (socket !== null && !socket.closed) socket.once('close', complete);
      response?.destroy();
      ownedRequest.destroy();
      if (socket === null || socket.closed) complete();
    }

    ownedRequest.on('error', finish);
    ownedRequest.once('response', (incoming) => {
      response = incoming;
      incoming.on('error', finish);
      incoming.once('aborted', () =>
        finish(new Error('Owned loopback HTTP response was aborted')),
      );
      incoming.once('end', () => {
        const status = incoming.statusCode ?? 0;
        finish(undefined, status >= 200 && status < 300);
      });
      // Status alone is insufficient: both successful and rejected responses
      // must finish consuming their bodies before the owned process is killed.
      incoming.resume();
    });
    ownedRequest.end();
  });
}
