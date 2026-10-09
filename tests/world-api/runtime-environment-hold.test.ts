import { afterEach, describe, expect, it } from 'vitest';
import { request, type Server } from 'node:http';
import { AUTHENTICATED_OFFICE_COMMAND_PATH } from '@econmind/core/authenticated-office-command-contract';
import { createHoldApiServer } from '../../apps/world-api/src/runtime-preparation/hold-api-server.js';
import { handleHoldExecutor } from '../../apps/world-worker/src/runtime-preparation/hold-executor.js';

const servers: Server[] = [];
async function api() {
  const server = createHoldApiServer();
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('LOOPBACK_REQUIRED');
  return { server, port: address.port };
}
function call(
  port: number,
  path: string,
  method = 'GET',
  headers: Record<string, string> = {},
  body = '',
) {
  return new Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>((resolve, reject) => {
    const outgoing = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: { connection: 'close', ...headers },
        agent: false,
        signal: AbortSignal.timeout(3000),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.once('error', reject);
        res.once('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    outgoing.once('error', reject);
    outgoing.end(body);
  });
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    if (!server.listening) continue;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
const origin = 'https://world.econmind.group';

describe('nonactivated runtime environment', () => {
  it('separates health from economic readiness and omits secrets', async () => {
    const { port } = await api();
    const health = await call(port, '/healthz');
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toMatchObject({
      runtimeMode: 'HOLD',
      simulationEnabled: false,
      clockEnabled: false,
      databaseConnected: false,
      authoritativeCommandsEnabled: false,
    });
    expect(health.headers['cache-control']).toBe('private, no-store');
    expect(
      (
        await call(port, '/readyz', 'GET', {
          authorization: 'Bearer fake.activation',
          'x-enable-simulation': 'true',
        })
      ).status,
    ).toBe(503);
    expect(health.body).not.toContain('postgresql://');
  });
  it('retains the reviewed Office rejection and CORS boundaries', async () => {
    const { port } = await api();
    const headers = {
      origin,
      authorization: 'Bearer test.token',
      'content-type': 'application/json',
    };
    const denied = await call(
      port,
      AUTHENTICATED_OFFICE_COMMAND_PATH,
      'POST',
      headers,
      '{}',
    );
    expect(denied.status).toBe(503);
    expect(JSON.parse(denied.body).error.code).toBe('NOT_CONNECTED');
    expect(denied.headers['access-control-allow-origin']).toBe(origin);
    expect(
      (
        await call(
          port,
          AUTHENTICATED_OFFICE_COMMAND_PATH,
          'POST',
          { origin, 'content-type': 'application/json' },
          '{}',
        )
      ).status,
    ).toBe(401);
    const outside = await call(
      port,
      AUTHENTICATED_OFFICE_COMMAND_PATH,
      'POST',
      { ...headers, origin: 'https://unapproved.invalid' },
      '{}',
    );
    expect(outside.status).toBe(403);
    expect(outside.headers['access-control-allow-origin']).toBeUndefined();
    expect(
      (
        await call(
          port,
          AUTHENTICATED_OFFICE_COMMAND_PATH,
          'POST',
          { ...headers, cookie: 'session=not-supported' },
          '{}',
        )
      ).status,
    ).toBe(403);
  });
  it('permits exact preflight but rejects unsupported headers and oversized bodies', async () => {
    const { port } = await api();
    const headers = {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, content-type',
    };
    expect(
      (await call(port, AUTHENTICATED_OFFICE_COMMAND_PATH, 'OPTIONS', headers))
        .status,
    ).toBe(204);
    expect(
      (
        await call(port, AUTHENTICATED_OFFICE_COMMAND_PATH, 'OPTIONS', {
          ...headers,
          'access-control-request-headers': 'authorization, x-admin',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          port,
          AUTHENTICATED_OFFICE_COMMAND_PATH,
          'POST',
          {
            origin,
            authorization: 'Bearer test.token',
            'content-type': 'application/json',
            'content-length': '17000',
          },
          'x'.repeat(17000),
        )
      ).status,
    ).toBe(413);
  });
  it('does not mount opening, lease, dispatch or tick and releases its listener', async () => {
    const { server, port } = await api();
    for (const path of ['/open', '/seed', '/tick', '/lease', '/dispatch'])
      expect((await call(port, path, 'POST')).status).toBe(405);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    expect(server.listening).toBe(false);
    await expect(call(port, '/healthz')).rejects.toMatchObject({
      code: 'ECONNREFUSED',
    });
  });
  it('keeps the separate executor alive with no execution readiness or lifecycle writes', async () => {
    const health = handleHoldExecutor(
      new Request('https://executor.internal/healthz'),
    );
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      simulationEnabled: false,
      clockEnabled: false,
      databaseConnected: false,
      leaseAcquired: false,
      automaticConsumerEnabled: false,
    });
    expect(
      handleHoldExecutor(new Request('https://executor.internal/readyz'))
        .status,
    ).toBe(503);
    for (const path of ['/tick', '/seed', '/lease', '/dispatch'])
      expect(
        handleHoldExecutor(
          new Request('https://executor.internal' + path, { method: 'POST' }),
        ).status,
      ).toBe(405);
    const head = handleHoldExecutor(
      new Request('https://executor.internal/healthz', { method: 'HEAD' }),
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });
});
