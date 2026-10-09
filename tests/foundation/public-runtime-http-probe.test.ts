import { createServer, type RequestListener } from 'node:http';
import type { Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { probePublicRuntimeEndpoint } from '../support/public-runtime-http-probe.js';

async function fixture(handler: RequestListener) {
  const server = createServer(handler);
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('Owned HTTP test listener has no loopback port');
  return {
    port: address.port,
    sockets,
    async stop() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function expectPeerClosed(sockets: ReadonlySet<Socket>) {
  // The server observes its own close event after the client socket closes.
  for (let attempt = 0; attempt < 50 && sockets.size > 0; attempt++)
    await delay(10);
  expect(sockets.size).toBe(0);
}

describe('owned public-runtime HTTP probe transport', () => {
  it('consumes a successful body before settling and closes its one-shot connection', async () => {
    let finishBody: (() => void) | undefined;
    let headers: (() => void) | undefined;
    const received = new Promise<void>((resolve) => (headers = resolve));
    const owned = await fixture((request, response) => {
      expect(request.url).toBe('/readyz');
      expect(request.headers.connection).toBe('close');
      expect(request.headers['cache-control']).toBe('no-store');
      response.writeHead(200);
      response.write('first chunk');
      finishBody = () => response.end('last chunk');
      headers?.();
    });
    try {
      let settled = false;
      const pending = probePublicRuntimeEndpoint(owned.port, '/readyz', 1_000);
      void pending.then(
        () => (settled = true),
        () => (settled = true),
      );
      await received;
      await delay(10);
      expect(settled).toBe(false);
      finishBody?.();
      await expect(pending).resolves.toBe(true);
      await expectPeerClosed(owned.sockets);
    } finally {
      await owned.stop();
    }
  });

  it.each([302, 503])(
    'drains HTTP %i rejection and closes the connection',
    async (status) => {
      const owned = await fixture((_request, response) => {
        response.writeHead(status);
        response.end('not ready');
      });
      try {
        await expect(
          probePublicRuntimeEndpoint(owned.port, '/healthz'),
        ).resolves.toBe(false);
        await expectPeerClosed(owned.sockets);
      } finally {
        await owned.stop();
      }
    },
  );

  it('settles an ordinary refused connection without a lingering request', async () => {
    const reserved = await fixture((_request, response) => response.end());
    const port = reserved.port;
    await reserved.stop();
    await expect(
      probePublicRuntimeEndpoint(port, '/readyz'),
    ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  it.each(['headers', 'body'] as const)(
    'settles the absolute timeout while waiting for %s and closes the socket',
    async (stage) => {
      const owned = await fixture((_request, response) => {
        if (stage === 'body') {
          response.writeHead(200);
          response.write('incomplete body');
        }
      });
      try {
        await expect(
          probePublicRuntimeEndpoint(owned.port, '/healthz', 100),
        ).rejects.toMatchObject({ code: 'ETIMEDOUT' });
        await expectPeerClosed(owned.sockets);
      } finally {
        await owned.stop();
      }
    },
  );

  it('rejects an aborted response body instead of treating its 200 headers as success', async () => {
    const owned = await fixture((_request, response) => {
      response.writeHead(200);
      response.write('partial');
      setTimeout(() => response.socket?.destroy(), 10);
    });
    try {
      await expect(
        probePublicRuntimeEndpoint(owned.port, '/healthz'),
      ).rejects.toThrow();
      await expectPeerClosed(owned.sockets);
    } finally {
      await owned.stop();
    }
  });

  it('does not retain a connection across sequential probes and owned server shutdown', async () => {
    const owned = await fixture((_request, response) =>
      response.end('healthy'),
    );
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        await expect(
          probePublicRuntimeEndpoint(owned.port, '/healthz'),
        ).resolves.toBe(true);
        await expectPeerClosed(owned.sockets);
      }
    } finally {
      await owned.stop();
    }
    await expect(
      probePublicRuntimeEndpoint(owned.port, '/healthz'),
    ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });
});
