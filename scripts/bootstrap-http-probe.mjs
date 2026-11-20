import { request } from 'node:http';

// One owned loopback connection per probe, without the global fetch pool.
export function singleProbe(url, validate, timeoutMs) {
  return new Promise((resolve) => {
    let response;
    let settled = false;
    const owned = request(url, {
      agent: false,
      method: 'GET',
      headers: { Connection: 'close', 'Cache-Control': 'no-store' },
    });
    const timeout = setTimeout(() => finish(false), timeoutMs);
    function finish(ok) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const socket = owned.socket;
      if (socket && !socket.closed) socket.once('close', () => resolve(ok));
      response?.destroy();
      owned.destroy();
      if (!socket || socket.closed) resolve(ok);
    }
    owned.on('error', () => finish(false));
    owned.once('response', (incoming) => {
      response = incoming;
      incoming.on('error', () => finish(false));
      incoming.once('aborted', () => finish(false));
      if (incoming.statusCode !== 200) return finish(false);
      const chunks = [];
      let length = 0;
      incoming.on('data', (chunk) => {
        length += chunk.length;
        if (length > 4096) return finish(false);
        chunks.push(chunk);
      });
      incoming.once('end', () => {
        try {
          finish(validate(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
        } catch {
          finish(false);
        }
      });
    });
    owned.end();
  });
}
