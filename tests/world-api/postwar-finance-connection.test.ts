/** Real installer/standard Worker constructors over unconnected mock ports.
 * No source admission, SQL authority or production activation is asserted. */
import { describe, it, expect } from 'vitest';
import {
  createPostwarFinanceConnection,
  type PostwarFinanceConnectionConfig,
} from '../../apps/world-api/src/runtime/postwar-finance-connection.js';
const origin = 'https://world.example';
function fixture() {
  let connections = 0,
    queries = 0,
    clockReads = 0;
  const pool = () => ({
    async connect() {
      connections++;
      throw Error('UNEXPECTED_DB_CONNECT');
    },
  });
  const readPool = pool(),
    intakePool = pool();
  const database = {
    async query() {
      queries++;
      throw Error('UNEXPECTED_DB_QUERY');
    },
    async transaction() {
      throw Error('UNEXPECTED_DB_TRANSACTION');
    },
  };
  const clock = Object.freeze({
    nowReal: () => {
      clockReads++;
      return '2026-10-29T00:00:00.000Z';
    },
    simTime: async () => {
      clockReads++;
      return '0';
    },
  });
  const projectRef = 'a'.repeat(20),
    issuer = 'https://' + projectRef + '.supabase.co/auth/v1';
  const config: PostwarFinanceConnectionConfig = {
    worldId: 'WORLD_CONNECTION_TEST',
    countryId: 'COUNTRY_01',
    workerId: 'WORKER_CONNECTION_TEST',
    admittedWorldPins: {
      worldId: 'WORLD_CONNECTION_TEST',
      seedRef: 'SEED_CONNECTION_TEST',
      contentHash: 'sha256:' + '1'.repeat(64),
      admissionRef: 'ADMISSION_CONNECTION_TEST',
      minimumWorldVersion: '0',
    },
    readPool: readPool as unknown as PostwarFinanceConnectionConfig['readPool'],
    intakePool:
      intakePool as unknown as PostwarFinanceConnectionConfig['intakePool'],
    workerDatabase: database,
    readerRole: 'finance_connection_reader',
    intakeRole: 'finance_connection_intake',
    authorizationPublisherRole: 'finance_connection_publisher',
    auth: {
      projectRef,
      expectedIssuer: issuer,
      jwksUrl: issuer + '/.well-known/jwks.json',
      audience: 'authenticated',
    },
    resolveActorId: async () => null,
    clock,
    allowedOrigins: [origin],
    environment: { ECONMIND_ENV: 'ci', NODE_ENV: 'test' },
  };
  return { config, counts: () => ({ connections, queries, clockReads }) };
}
const request = (
  path = '/v1/office-command',
  method = 'POST',
  headers: Record<string, string> = {},
) =>
  new Request('https://api.example' + path, {
    method,
    headers: { origin, 'content-type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: '{}' } : {}),
  });
describe('explicit bounded Finance connection installer, unconnected dependency ports', () => {
  it('defaults both command paths to503 and leaves unrelated host routes alone', async () => {
    const c = createPostwarFinanceConnection();
    expect(c.runtime).toBeNull();
    expect(c.status).toBe('NOT_CONNECTED');
    for (const p of ['/v1/office-command', '/v1/command-recovery'])
      expect((await c.handle(request(p)))?.status).toBe(503);
    expect(await c.handle(request('/healthz', 'GET'))).toBeNull();
    expect((await c.consumeOnce()).status).toBe('BLOCKED');
    await c.stop();
  });
  it('installs real bounded handlers and a genuine prepared runtime without reading source, clock or opening a connection', async () => {
    const f = fixture(),
      c = createPostwarFinanceConnection(f.config);
    expect(c.runtime?.consumer.state()).toBe('PREPARED');
    expect(
      (
        await c.handle(
          request('/v1/office-command', 'OPTIONS', {
            'access-control-request-method': 'POST',
          }),
        )
      )?.status,
    ).toBe(204);
    expect((await c.handle(request()))?.status).toBe(401);
    // Recovery validates the original-request envelope before authentication.
    expect((await c.handle(request('/v1/command-recovery')))?.status).toBe(400);
    expect(f.counts()).toEqual({ connections: 0, queries: 0, clockReads: 0 });
    c.prepareManualConsumption();
    expect(c.runtime?.consumer.state()).toBe('READY');
    await c.stop();
    expect(c.runtime?.consumer.state()).toBe('STOPPED');
    expect((await c.handle(request()))?.status).toBe(503);
    expect(() => c.prepareManualConsumption()).toThrow('UNAVAILABLE');
    expect(f.counts()).toEqual({ connections: 0, queries: 0, clockReads: 0 });
  });
  it('does not turn a production host into CI or remove the inherited formal activation gate', () => {
    const f = fixture();
    for (const name of ['staging', 'production'])
      expect(() =>
        createPostwarFinanceConnection({
          ...f.config,
          environment: { ECONMIND_ENV: name },
        }),
      ).toThrow('local/CI only');
    expect(f.counts()).toEqual({ connections: 0, queries: 0, clockReads: 0 });
  });
  it('rejects inconsistent scope, shared reader/intake ports and mutable clock objects before I/O', () => {
    const f = fixture();
    expect(() =>
      createPostwarFinanceConnection({ ...f.config, worldId: 'WORLD_OTHER' }),
    ).toThrow('EXACT_SERVER_DEPENDENCIES');
    expect(() =>
      createPostwarFinanceConnection({
        ...f.config,
        intakePool: f.config.readPool,
      }),
    ).toThrow('EXACT_SERVER_DEPENDENCIES');
    expect(() =>
      createPostwarFinanceConnection({
        ...f.config,
        clock: { ...f.config.clock },
      }),
    ).toThrow('IMMUTABLE_SERVER_CLOCK');
    expect(f.counts()).toEqual({ connections: 0, queries: 0, clockReads: 0 });
  });
});
