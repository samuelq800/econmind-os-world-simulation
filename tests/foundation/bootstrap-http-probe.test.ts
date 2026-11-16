import { createServer } from 'node:http';
import { expect, it } from 'vitest';

import { singleProbe } from '../../scripts/bootstrap-http-probe.mjs';

it.each(['ok', 'redirect', 'malformed', 'oversized', 'aborted', 'timeout'])(
  'closes the owned HTTP transport and validates %s responses',
  async (mode) => {
    let requests = 0;
    const sockets = new Set<import('node:net').Socket>();
    const server = createServer((_request, response) => {
      requests++;
      if (mode === 'timeout') return;
      if (mode === 'aborted') return response.destroy();
      if (mode === 'redirect') {
        response.writeHead(302, { location: '/redirect-target' }).end();
        return;
      }
      response.end(
        mode === 'ok'
          ? '{"ready":true}'
          : mode === 'oversized'
            ? 'x'.repeat(4097)
            : '{',
      );
    });
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('missing address');
      expect(
        await singleProbe(
          `http://127.0.0.1:${address.port}`,
          (v: { ready?: boolean }) => v.ready === true,
          250,
        ),
      ).toBe(mode === 'ok');
      expect(requests).toBe(1);
      await new Promise((resolve) => setImmediate(resolve));
      await waitForClosed(sockets);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

async function waitForClosed(sockets: Set<import('node:net').Socket>) {
  const deadline = Date.now() + 1000;
  while (sockets.size && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
  expect(sockets.size).toBe(0);
}
