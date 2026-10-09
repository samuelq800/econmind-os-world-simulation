// TEST_ONLY local workerd fixture. Never included in any deployment config.
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { withCloudflarePostgresPools } from '../../apps/world-api/src/runtime-preparation/cloudflare-postgres-pools.js';
import { createCloudflareJwksFetch } from '../../apps/world-api/src/runtime-preparation/cloudflare-jwks-verifier.js';
import { createAuthenticatedFinancialIntakeComposition } from '../../apps/world-api/src/integration/authenticated-financial-intake-composition.js';
import { createNonactivatedRuntimeReadHost } from '../../apps/world-api/src/integration/nonactivated-runtime-read-host.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { createIsolatedFinancialRuntimeComposition } from '../../apps/world-worker/src/preparation/isolated-financial-runtime-composition.js';

interface FixtureConfig {
  readonly opening: {
    worldId: string;
    seedId: string;
    seedFingerprint: string;
  };
  readonly workerId: string;
  readonly roles: { reader: string; writer: string; publisher: string };
  readonly jwks: object;
  readonly auth: {
    projectRef: string;
    expectedIssuer: string;
    jwksUrl: string;
    audience: string;
  };
  readonly actors: Readonly<Record<string, string>>;
}
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export function createCloudflarePostgresTestFixture(config: FixtureConfig) {
  return {
    async fetch(request: Request, env: CloudflarePostgresTestEnv) {
      if (
        config.opening.worldId !== 'WORLD_C_ISOLATED_O_AUTHENTICATED' ||
        config.auth.projectRef !== 'abcdefghijklmnopqrst'
      )
        throw new Error('TEST_ONLY_FIXED_ISOLATION_REQUIRED');
      const path = new URL(request.url).pathname;
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      const body = (await request.json()) as {
        request?: unknown;
        simTime?: string;
      };
      const clock = Object.freeze({
        nowReal: () => new Date().toISOString(),
        simTime: async (world: string) => {
          if (world !== config.opening.worldId)
            throw new Error('TEST_ONLY_CLOCK_WORLD_MISMATCH');
          // Explicit bounded mechanism times, never a production Clock.
          return ['10000', '10100', '10200'].includes(body.simTime ?? '')
            ? body.simTime!
            : '10000';
        },
      });
      if (path === '/test-only/consume') {
        const pool = new Pool({
          connectionString: env.TEST_ONLY_EXECUTOR.connectionString,
          max: 2,
          connectionTimeoutMillis: 3000,
        });
        pool.on('error', () => undefined);
        const host = createIsolatedFinancialRuntimeComposition({
          database: new PostgresSqlDatabase(pool),
          environment: { ECONMIND_ENV: 'ci' },
          workerId: config.workerId,
          opening: config.opening,
          sha256Hex: hash,
          clock,
        });
        try {
          await host.startIsolation();
          const result = await host.consumeOnce();
          return Response.json({
            step: result.step,
            worldVersion: result.readback.headWorldVersion,
            financial: result.readback.ledgers.financial.positions.map((p) => ({
              accountId: p.account.accountId,
              balance: p.netDebitBalance.toCanonicalValue(),
            })),
            inventory: result.readback.ledgers.inventory.balances.map((b) => ({
              countryId: b.account.countryId,
              quantity: b.quantity.toCanonicalValue(),
            })),
          });
        } finally {
          await host.stop();
          await pool.end();
        }
      }
      if (!['/test-only/intake', '/test-only/final'].includes(path))
        return new Response(null, { status: 404 });
      return withCloudflarePostgresPools(
        {
          readerConnectionString: env.TEST_ONLY_READER.connectionString,
          intakeConnectionString: env.TEST_ONLY_INTAKE.connectionString,
        },
        async ({ reader, intake }) => {
          const fetch: typeof globalThis.fetch = async (url, init) => {
            if (
              String(url) !== config.auth.jwksUrl ||
              init?.redirect !== 'manual'
            )
              throw new Error('TEST_ONLY_JWKS_TRANSPORT_MISMATCH');
            const response = Response.json(config.jwks);
            Object.defineProperty(response, 'url', {
              value: config.auth.jwksUrl,
            });
            return response;
          };
          const auth = {
            ...config.auth,
            fetch: createCloudflareJwksFetch(fetch),
          };
          const pins = {
            worldId: config.opening.worldId,
            seedRef: config.opening.seedId,
            contentHash: config.opening.seedFingerprint,
            admissionRef: 'ADMISSION_O_TEST_ONLY',
            minimumWorldVersion: '0',
          };
          const authorization = request.headers.get('authorization');
          if (path === '/test-only/intake') {
            const composition = createAuthenticatedFinancialIntakeComposition({
              readPool: reader,
              writerPool: intake,
              readerRole: config.roles.reader,
              writerRole: config.roles.writer,
              authorizationPublisherRole: config.roles.publisher,
              admittedWorldPins: pins,
              auth,
              clock,
              resolveActorId: async (subject) => config.actors[subject] ?? null,
            });
            const result = await composition.handle({
              authorization,
              request: body.request,
            });
            return Response.json(result.body, { status: result.httpStatus });
          }
          const read = createNonactivatedRuntimeReadHost({
            pool: reader,
            readerRole: config.roles.reader,
            authorizationPublisherRole: config.roles.publisher,
            admittedWorldPins: pins,
            auth,
            endpointPins: {
              origin: 'https://test-only.example.invalid',
              projectionPath: '/v1/world-read',
              finalLookupPath: '/v1/final-receipt',
              deploymentRef: 'TEST_ONLY_NOT_DEPLOYED',
            },
            routeOptions: {
              allowedOrigins: ['https://test-only.example.invalid'],
            },
          });
          return Response.json(
            await read.composition.handleFinalLookup({
              authorization,
              request: body.request,
            }),
          );
        },
      );
    },
  };
}

// The checked-in main cannot execute without the private TEST_ONLY fixture.
export default {
  fetch() {
    return new Response('TEST_ONLY_CONFIG_REQUIRED', { status: 503 });
  },
};
