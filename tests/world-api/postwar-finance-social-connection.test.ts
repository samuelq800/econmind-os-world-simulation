/** Ownership/identity protocol using genuine constructors and unconnected
 * transports. No admission or economic success is supplied by these fixtures. */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { WORLD_MODEL_VERSION } from '@econmind/core';
import {
  createPostwarSocialRuntimeConnection,
  loadPostwarSocialConnectionOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from '../../apps/world-worker/dist/runtime-preparation/social-runtime-connection.js';
import {
  createPostwarFinanceSocialRuntimeConnection,
  readPostwarFinanceSocialRuntimeBinding,
} from '../../apps/world-worker/dist/runtime-preparation/finance-social-runtime-connection.js';
import { createPostgresFinanceBudgetWorldCapacitySource } from '../../apps/world-worker/dist/persistence/postgres-finance-budget-capacity-source.js';
import {
  createPostwarFinanceSocialApiConnection,
  readPostwarFinanceSocialApiConnection,
} from '../../apps/world-api/src/runtime/postwar-finance-social-connection.js';
import type { PostwarSocialConnectionConfiguration } from '../../apps/world-api/src/runtime/postwar-social-connection.js';
import { startApiRuntime } from '../../apps/world-api/src/runtime.js';
import { createPostwarTreasuryFxConnection } from '../../apps/world-api/src/runtime/postwar-treasury-fx-connection.js';
import { createPostwarOfficeCommandFetchHandler } from '../../apps/world-api/src/runtime/postwar-office-command-fetch-handler.js';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
  POSTWAR_DAY_ONE_TREASURY_FX_PAYLOAD_SCHEMA,
} from '@econmind/core/authenticated-office-command-contract';
let openingAdoption: OfficialLabourSocialOpeningAdoption;
beforeAll(async () => {
  openingAdoption = await loadPostwarSocialConnectionOpeningAdoption(
    process.cwd(),
  );
}, 60_000);
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture(worldId: string, treasuryFx = false) {
  const events: string[] = [];
  function transport(name: string) {
    const control = { ends: 0, connects: 0, end: async () => {} };
    const pool = {
      async connect() {
        control.connects++;
        throw Error('NO_TEST_ONLY_DB_SOURCE');
      },
      async query() {
        throw Error('NO_PROTOCOL_QUERY');
      },
      async end() {
        control.ends++;
        events.push('end:' + name);
        await control.end();
      },
    } as unknown as Pool;
    return { pool, control };
  }
  const bounded = transport('bounded'),
    intake = transport('intake'),
    source = transport('source'),
    worker = transport('worker');
  const clock = Object.freeze({
    nowReal: () => '2026-10-29T00:00:00.000Z',
    simTime: async () => '2000',
  });
  const social = createPostwarSocialRuntimeConnection({
    worldId,
    workerId: 'WORKER_SHARED_API',
    workerPool: worker.pool,
    workerRole: 'fixture_shared_worker',
    openingAdoption,
  });
  const binding = createPostwarFinanceSocialRuntimeConnection({
    socialConnection: social,
    capacitySource: createPostgresFinanceBudgetWorldCapacitySource({
      worldId,
      countries: [{ countryId: 'COUNTRY_01' }, { countryId: 'COUNTRY_02' }],
      historyMode: 'BUDGET_SOCIAL',
    }),
    intakePool: intake.pool,
    clock,
    environment: 'ci',
    ...(treasuryFx
      ? { treasuryFx: { workerRole: 'fixture_shared_worker' } }
      : {}),
  });
  const config: PostwarSocialConnectionConfiguration = {
    environment: 'ci',
    boundedReadPool: bounded.pool,
    intakePool: intake.pool,
    sourcePool: source.pool,
    workerPool: worker.pool,
    boundedReaderRole: 'fixture_shared_bounded',
    sourceReaderRole: 'fixture_shared_offline',
    intakeRole: 'fixture_shared_intake',
    workerRole: 'fixture_shared_worker',
    authorizationPublisherRole: 'fixture_shared_auth_publisher',
    workerId: 'WORKER_SHARED_API',
    openingAdoption,
    admittedWorldPins: {
      worldId,
      seedRef: 'SEED_PROTOCOL_NOT_ADMITTED',
      contentHash: 'sha256:' + '1'.repeat(64),
      admissionRef: 'ADMISSION_PROTOCOL_NOT_REAL',
      minimumWorldVersion: '0',
    },
    modelVersion: WORLD_MODEL_VERSION,
    auth: {
      projectRef: 'a'.repeat(20),
      expectedIssuer: 'https://' + 'a'.repeat(20) + '.supabase.co/auth/v1',
      jwksUrl:
        'https://' +
        'a'.repeat(20) +
        '.supabase.co/auth/v1/.well-known/jwks.json',
      audience: 'authenticated',
      fetch: async () => {
        throw Error('NO_NETWORK');
      },
    },
    clock,
    resolveActorId: async () => null,
    allowedOrigins: ['https://world.example'],
  };
  return { binding, config, pools: [bounded, intake, source, worker], events };
}
const nodeConfig = {
  environment: 'ci',
  host: '127.0.0.1',
  port: 0,
  shutdownGraceMs: 20,
};
describe('genuine shared Finance/Social API owner', () => {
  it('borrows one runtime without wrappers, public consumer controls or shared resource ownership', async () => {
    const f = fixture('WORLD_SHARED_API_IDENTITY');
    const owner = await createPostwarFinanceSocialApiConnection({
      binding: f.binding,
      social: f.config,
    });
    const ports = readPostwarFinanceSocialApiConnection(owner),
      worker = readPostwarFinanceSocialRuntimeBinding(f.binding);
    expect(worker.runtime.consumer.state()).toBe('PREPARED');
    expect(ports.finance.runtime).toBeNull();
    expect(ports.finance.budget).toBeNull();
    expect(ports.social.preparedRuntime).toBeNull();
    expect(() => ports.finance.prepareManualConsumption()).toThrow(
      'UNAVAILABLE',
    );
    expect(await ports.finance.consumeOnce()).toMatchObject({
      status: 'BLOCKED',
    });
    expect(() => owner.control.startPreparation()).toThrow(
      'SOURCE_NOT_PREPARED',
    );
    expect(() => owner.control.consumeOnce()).toThrow('SOURCE_NOT_PREPARED');
    expect(
      (await ports.finance.handleCommand({ authorization: null, request: {} }))
        .body,
    ).toMatchObject({ ok: false, error: { code: 'SOURCE_NOT_PREPARED' } });
    await Promise.all([ports.finance.stop(), ports.social.stop()]);
    expect(readPostwarFinanceSocialRuntimeBinding(f.binding)).toBe(worker);
    expect(f.pools.map((p) => p.control.ends)).toEqual([0, 0, 0, 0]);
    expect(f.pools.map((p) => p.control.connects)).toEqual([0, 0, 0, 0]);
    await owner.stop();
    await owner.stop();
    expect(f.pools.map((p) => p.control.ends)).toEqual([1, 1, 1, 1]);
    expect(() => readPostwarFinanceSocialRuntimeBinding(f.binding)).toThrow(
      'GENUINE',
    );
    expect(() => readPostwarFinanceSocialApiConnection(owner)).toThrow(
      'GENUINE',
    );
    expect(() => owner.control.startPreparation()).toThrow('RETIRED');
  });
  it('rejects copied binding and unrelated exact pool identity before taking pool ownership', async () => {
    const f = fixture('WORLD_SHARED_API_NEGATIVE');
    try {
      await expect(
        createPostwarFinanceSocialApiConnection({
          binding: { ...f.binding },
          social: f.config,
        }),
      ).rejects.toThrow('GENUINE');
      await expect(
        createPostwarFinanceSocialApiConnection({
          binding: f.binding,
          social: { ...f.config, clock: Object.freeze({ ...f.config.clock }) },
        }),
      ).rejects.toThrow('EXACT_BINDING');
      expect(f.pools.map((p) => p.control.ends)).toEqual([0, 0, 0, 0]);
    } finally {
      await f.binding.stop();
    }
  });
  it('holds API World reservation after Worker stop until every pool end settles, even if cleanup fails', async () => {
    const f = fixture('WORLD_SHARED_API_DRAIN');
    const owner = await createPostwarFinanceSocialApiConnection({
      binding: f.binding,
      social: f.config,
    });
    const gate = deferred();
    f.pools[0]!.control.end = () => gate.promise;
    f.pools[1]!.control.end = async () => {
      throw Error('EXPECTED_POOL_END_ERROR');
    };
    const stopping = owner.stop();
    const observed = stopping.catch((e) => e);
    while (f.pools[0]!.control.ends === 0)
      await new Promise((r) => setTimeout(r, 0));
    expect(() => readPostwarFinanceSocialRuntimeBinding(f.binding)).toThrow(
      'GENUINE',
    );
    const replacement = fixture('WORLD_SHARED_API_DRAIN');
    await expect(
      createPostwarFinanceSocialApiConnection({
        binding: replacement.binding,
        social: replacement.config,
      }),
    ).rejects.toThrow('WORLD_ALREADY_OWNED');
    expect(replacement.pools.map((p) => p.control.ends)).toEqual([0, 0, 0, 0]);
    gate.resolve();
    expect(await observed).toBeInstanceOf(AggregateError);
    expect(f.pools.map((p) => p.control.ends)).toEqual([1, 1, 1, 1]);
    const next = await createPostwarFinanceSocialApiConnection({
      binding: replacement.binding,
      social: replacement.config,
    });
    await next.stop();
  });
  it('cleans partial office construction and all owned pools, preserving primary and cleanup failures', async () => {
    const f = fixture('WORLD_SHARED_API_CONSTRUCTION');
    f.pools[1]!.control.end = async () => {
      throw Error('EXPECTED_CONSTRUCTOR_CLEANUP_ERROR');
    };
    const error = await createPostwarFinanceSocialApiConnection({
      binding: f.binding,
      social: {
        ...f.config,
        allowedOrigins: Array.from(
          { length: 4 },
          (_, i) => `https://s${i}.example`,
        ),
      },
      financeAllowedOrigins: Array.from(
        { length: 5 },
        (_, i) => `https://f${i}.example`,
      ),
    }).catch((e) => e);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.cause.message).toContain('HTTPS_ORIGINS_REQUIRED');
    expect(error.errors[1]).toBeInstanceOf(AggregateError);
    expect(f.pools.map((p) => p.control.ends)).toEqual([1, 1, 1, 1]);
    expect(() => readPostwarFinanceSocialRuntimeBinding(f.binding)).toThrow(
      'GENUINE',
    );
  });
  it('standard Node startup awaits actual preparation and cleans the unique owner on real source failure', async () => {
    const f = fixture('WORLD_SHARED_API_STARTUP');
    const owner = await createPostwarFinanceSocialApiConnection({
      binding: f.binding,
      social: f.config,
    });
    await expect(
      startApiRuntime(nodeConfig, { postwarFinanceSocialConnection: owner }),
    ).rejects.toThrow();
    expect(f.pools[3]!.control.connects).toBeGreaterThan(0);
    expect(f.pools.map((p) => p.control.ends)).toEqual([1, 1, 1, 1]);
    expect(() => readPostwarFinanceSocialApiConnection(owner)).toThrow(
      'GENUINE',
    );
  });
  it('standard Node refuses copied owners and exclusive environment conflicts without a listener', async () => {
    const f = fixture('WORLD_SHARED_API_NODE_SCOPE');
    const owner = await createPostwarFinanceSocialApiConnection({
      binding: f.binding,
      social: f.config,
    });
    await expect(
      startApiRuntime(nodeConfig, {
        postwarFinanceSocialConnection: { ...owner },
      }),
    ).rejects.toThrow('GENUINE');
    expect(f.pools.map((p) => p.control.ends)).toEqual([0, 0, 0, 0]);
    await expect(
      startApiRuntime(
        { ...nodeConfig, environment: 'production' },
        { postwarFinanceSocialConnection: owner },
      ),
    ).rejects.toThrow('EXACT_ENVIRONMENT');
    expect(f.pools.map((p) => p.control.ends)).toEqual([1, 1, 1, 1]);
  });
  it('installs the FX HTTP borrower only from the same genuine shared source and keeps its consumer hidden', async () => {
    const f = fixture('WORLD_SHARED_API_FX', true);
    // Deliberately unusable preparation DATA. It is never prepared/admitted;
    // only genuine Worker source validation may turn data into a live source.
    const owner = await createPostwarFinanceSocialApiConnection({
      binding: f.binding,
      social: f.config,
      treasuryFxPreparation: {} as never,
    });
    const api = readPostwarFinanceSocialApiConnection(owner),
      worker = readPostwarFinanceSocialRuntimeBinding(f.binding);
    try {
      expect(api.treasuryFx).toBeDefined();
      expect(worker.treasuryFx).not.toBeNull();
      expect(worker.runtime.consumer.state()).toBe('PREPARED');
      expect(api.finance.runtime).toBeNull();
      expect(api.social.preparedRuntime).toBeNull();
      expect(Object.hasOwn(api.treasuryFx!, 'consumeOnce')).toBe(false);
      expect(() => owner.control.startPreparation()).toThrow(
        'SOURCE_NOT_PREPARED',
      );
      const mux = createPostwarOfficeCommandFetchHandler(api);
      const response = await mux.handle(
        new Request('https://api.example/v1/office-command', {
          method: 'POST',
          headers: {
            origin: 'https://world.example',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
            requestId: '11111111-1111-4111-8111-111111111111',
            request: {
              worldId: f.config.admittedWorldPins.worldId,
              countryId: 'COUNTRY_01',
              officeId: 'FINANCE',
              commandType: POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
              commandId: 'COMMAND_FX_TEST_ONLY',
              idempotencyKey: 'KEY_FX_TEST_ONLY',
              expectedWorldVersion: '0',
              payload: {
                schemaVersion: POSTWAR_DAY_ONE_TREASURY_FX_PAYLOAD_SCHEMA,
                quoteRef: 'QUOTE_TEST_ONLY',
                payerTreasuryAccountId: 'TGA_TEST_ONLY',
                payerGcuAccountId: 'GOV_GCU_TEST_ONLY',
                dealerGcuAccountId: 'BANK_GCU_TEST_ONLY',
                localAmount: '1',
                localCurrency: 'XAA',
                expectedQuoteSha256: '1'.repeat(64),
              },
            },
          }),
        }),
      );
      expect(response?.status).toBe(401);
      expect(await response?.json()).toMatchObject({
        error: { code: 'AUTHENTICATION_REQUIRED' },
      });
      await mux.stop();
      expect(readPostwarFinanceSocialRuntimeBinding(f.binding)).toBe(worker);
      expect(f.pools.map((p) => p.control.ends)).toEqual([0, 0, 0, 0]);
      expect(f.pools.map((p) => p.control.connects)).toEqual([0, 0, 0, 0]);
    } finally {
      await owner.stop();
    }
    expect(f.pools.map((p) => p.control.ends)).toEqual([1, 1, 1, 1]);
  });
  it('rejects missing/extra preparation and shared/standalone controller substitution without taking pools', async () => {
    const enabled = fixture('WORLD_SHARED_API_FX_REQUIRED', true),
      disabled = fixture('WORLD_SHARED_API_FX_ABSENT');
    const http = {
      readPool: enabled.config.boundedReadPool,
      readerRole: enabled.config.boundedReaderRole,
      intakeRole: enabled.config.intakeRole,
      authorizationPublisherRole: enabled.config.authorizationPublisherRole,
      admittedWorldPins: enabled.config.admittedWorldPins,
      auth: enabled.config.auth,
      resolveActorId: enabled.config.resolveActorId,
      allowedOrigins: ['https://world.example'],
    };
    try {
      await expect(
        createPostwarFinanceSocialApiConnection({
          binding: enabled.binding,
          social: enabled.config,
        }),
      ).rejects.toThrow('EXACT_FX_PREPARATION_REQUIRED');
      await expect(
        createPostwarFinanceSocialApiConnection({
          binding: disabled.binding,
          social: disabled.config,
          treasuryFxPreparation: {} as never,
        }),
      ).rejects.toThrow('EXACT_FX_PREPARATION_REQUIRED');
      expect(() =>
        createPostwarTreasuryFxConnection(http, { ...enabled.binding }),
      ).toThrow('GENUINE');
      expect(() =>
        createPostwarTreasuryFxConnection(
          { ...http, binding: {} as never } as never,
          enabled.binding,
        ),
      ).toThrow('EXACT_SHARED_SOURCE');
      expect(() =>
        createPostwarTreasuryFxConnection(
          { ...http, admittedWorldPins: disabled.config.admittedWorldPins },
          disabled.binding,
        ),
      ).toThrow('EXACT_SHARED_SOURCE');
      expect(enabled.pools.map((p) => p.control.ends)).toEqual([0, 0, 0, 0]);
      expect(disabled.pools.map((p) => p.control.ends)).toEqual([0, 0, 0, 0]);
    } finally {
      await enabled.binding.stop();
      await disabled.binding.stop();
    }
  });
  it('holds the triple-owner World reservation until all four pools settle after every HTTP borrower retires', async () => {
    const f = fixture('WORLD_SHARED_API_FX_CLOSE', true);
    const owner = await createPostwarFinanceSocialApiConnection({
      binding: f.binding,
      social: f.config,
      treasuryFxPreparation: {} as never,
    });
    const ports = readPostwarFinanceSocialApiConnection(owner),
      gate = deferred();
    f.pools[0]!.control.end = () => gate.promise;
    const stopping = owner.stop();
    while (!f.pools[0]!.control.ends)
      await new Promise((r) => setTimeout(r, 0));
    expect(
      (
        await ports.treasuryFx!.handleCommand({
          authorization: null,
          request: {},
        })
      ).body,
    ).toMatchObject({ error: { code: 'NOT_CONNECTED' } });
    const replacement = fixture('WORLD_SHARED_API_FX_CLOSE', true);
    try {
      await expect(
        createPostwarFinanceSocialApiConnection({
          binding: replacement.binding,
          social: replacement.config,
          treasuryFxPreparation: {} as never,
        }),
      ).rejects.toThrow('WORLD_ALREADY_OWNED');
    } finally {
      gate.resolve();
      await stopping;
      await replacement.binding.stop();
    }
    expect(f.pools.map((p) => p.control.ends)).toEqual([1, 1, 1, 1]);
  });
  it('drains the genuine triple-owner when Node rejects an independent FX slot before preparation', async () => {
    const f = fixture('WORLD_SHARED_API_FX_NODE_CONFLICT', true);
    const owner = await createPostwarFinanceSocialApiConnection({
      binding: f.binding,
      social: f.config,
      treasuryFxPreparation: {} as never,
    });
    await expect(
      startApiRuntime(nodeConfig, {
        postwarFinanceSocialConnection: owner,
        postwarTreasuryFxConnection: createPostwarTreasuryFxConnection(null),
      }),
    ).rejects.toThrow('SOLE_EXPLICIT_CONSUMER');
    expect(f.pools.map((p) => p.control.ends)).toEqual([1, 1, 1, 1]);
    expect(f.pools.map((p) => p.control.connects)).toEqual([0, 0, 0, 0]);
    expect(() => readPostwarFinanceSocialApiConnection(owner)).toThrow(
      'GENUINE',
    );
  });
});
