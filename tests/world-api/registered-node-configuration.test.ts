import { describe, expect, it } from 'vitest';
import { WORLD_MODEL_VERSION } from '@econmind/core';
import {
  parseRegisteredNodeConfiguration,
  registeredNodeDatabaseUrls,
  REGISTERED_NODE_DATABASE_VARIABLES,
} from '../../apps/world-api/src/runtime/registered-node-configuration.js';

function configuration() {
  return {
    schemaVersion: 'registered-postwar-node-v1',
    environment: 'staging',
    workerId: 'WORKER_TEST',
    executionRegistrationRef: 'EXECUTION_TEST',
    port: 4101,
    seedPath: '/test-only/seed.json',
    seedFileSha256: 'a'.repeat(64),
    roles: {
      source: 'test_source',
      intake: 'test_intake',
      worker: 'test_worker',
      actor: 'test_actor',
    },
    countries: [
      { countryId: 'COUNTRY_01', expectedRawSourceSHA256: 'b'.repeat(64) },
    ],
    read: {
      modelVersion: WORLD_MODEL_VERSION,
      readerRole: 'test_reader',
      authorizationPublisherRole: 'test_publisher',
      endpointPins: {
        origin: 'https://api.example.org',
        projectionPath: '/v1/postwar-office-runtime',
        finalLookupPath: '/v1/final-receipt',
        deploymentRef: 'TEST_DEPLOYMENT',
      },
      admittedWorldPins: {
        worldId: 'WORLD_TEST',
        seedRef: 'SEED_TEST',
        admissionRef: 'ADMISSION_TEST',
        contentHash: 'sha256:' + 'c'.repeat(64),
        minimumWorldVersion: '0',
      },
      auth: {
        projectRef: 'abcdefghijklmnopqrst',
        expectedIssuer: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
        jwksUrl:
          'https://abcdefghijklmnopqrst.supabase.co/auth/v1/.well-known/jwks.json',
        audience: 'authenticated',
      },
      routeOptions: { allowedOrigins: ['https://web.example.org'] },
    },
  };
}
describe('explicit registered host configuration, without network or credentials', () => {
  it('retains immutable exact World/publisher/auth pins and finite countries', () => {
    const c = parseRegisteredNodeConfiguration(JSON.stringify(configuration()));
    expect(c.environment).toBe('staging');
    expect(c.countries).toHaveLength(1);
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(c.countries[0])).toBe(true);
    expect(Object.isFrozen(c.read.admittedWorldPins)).toBe(true);
  });
  it.each([
    'duplicate-country',
    'reader-worker',
    'local',
    'credentials',
    'bad-jwks',
    'bad-hash',
  ])('rejects %s', (reason) => {
    const c = configuration();
    if (reason === 'duplicate-country') c.countries.push(c.countries[0]!);
    if (reason === 'reader-worker') c.read.readerRole = c.roles.worker;
    if (reason === 'local') c.environment = 'local';
    if (reason === 'credentials')
      Object.assign(c, { databasePassword: 'TEST_ONLY' });
    if (reason === 'bad-jwks')
      c.read.auth.jwksUrl = 'https://other.example/jwks';
    if (reason === 'bad-hash') c.seedFileSha256 = 'unknown';
    expect(() => parseRegisteredNodeConfiguration(JSON.stringify(c))).toThrow();
  });
  it('requires explicit boolean installation choices without granting source authority', () => {
    const config = {
      ...configuration(),
      install: { centralBankOmo: true, trade: false },
    };
    const parsed = parseRegisteredNodeConfiguration(JSON.stringify(config));
    expect(parsed.install).toEqual(config.install);
    expect(Object.isFrozen(parsed.install)).toBe(true);
    expect(
      parseRegisteredNodeConfiguration(
        JSON.stringify({
          ...config,
          install: { ...config.install, industry: true },
        }),
      ).install?.industry,
    ).toBe(true);
    expect(
      parseRegisteredNodeConfiguration(
        JSON.stringify({
          ...config,
          install: { ...config.install, industryLabour: true },
        }),
      ).install?.industryLabour,
    ).toBe(true);
    expect(() =>
      parseRegisteredNodeConfiguration(
        JSON.stringify({
          ...config,
          install: { ...config.install, industryLabour: 'true' },
        }),
      ),
    ).toThrow();
    for (const install of [
      { trade: true },
      { centralBankOmo: 'true', trade: false },
      { centralBankOmo: true, trade: true, industry: 'true' },
      {
        centralBankOmo: true,
        trade: true,
        industry: true,
        industryLabour: false,
      },
      { centralBankOmo: true, trade: true, arbitraryOffice: true },
    ])
      expect(() =>
        parseRegisteredNodeConfiguration(
          JSON.stringify({ ...configuration(), install }),
        ),
      ).toThrow();
  });
  it('keeps utility installation explicit and requires the existing Industry host', () => {
    const config = {
      ...configuration(),
      install: { centralBankOmo: true, trade: true, industry: true },
    };
    expect(
      parseRegisteredNodeConfiguration(JSON.stringify(config)).install
        ?.industryUtilities,
    ).toBeUndefined();
    expect(
      parseRegisteredNodeConfiguration(
        JSON.stringify({
          ...config,
          install: { ...config.install, industryUtilities: true },
        }),
      ).install?.industryUtilities,
    ).toBe(true);
    for (const install of [
      { centralBankOmo: true, trade: true, industryUtilities: true },
      { ...config.install, industry: false, industryUtilities: true },
      { ...config.install, industryUtilities: 'true' },
    ]) {
      expect(() =>
        parseRegisteredNodeConfiguration(
          JSON.stringify({ ...config, install }),
        ),
      ).toThrow();
    }
  });
  it('accepts only the exact optional rent artifact segment without restoring caller proofs', () => {
    const beneficialRent = {
      parentSeedPath: '/reviewed/parent.json',
      parentSeedFileSha256: 'd'.repeat(64),
      receiptsPath: '/reviewed/receipts.json',
      receiptsFileSha256: 'e'.repeat(64),
      clockBindingRef: 'CLOCK_RENT_REVIEWED',
    };
    const c = parseRegisteredNodeConfiguration(
      JSON.stringify({ ...configuration(), beneficialRent }),
    );
    expect(c.beneficialRent).toEqual(beneficialRent);
    expect(Object.isFrozen(c.beneficialRent)).toBe(true);
    for (const value of [
      undefined,
      { ...beneficialRent, proof: {} },
      { ...beneficialRent, parentSeedPath: 'relative.json' },
      { ...beneficialRent, clockBindingRef: '' },
      { ...beneficialRent, receiptsFileSha256: 'unknown' },
    ])
      expect(() =>
        parseRegisteredNodeConfiguration(
          JSON.stringify({ ...configuration(), beneficialRent: value ?? null }),
        ),
      ).toThrow();
  });
  it('requires each named binding and never echoes provider credentials', () => {
    expect(() => registeredNodeDatabaseUrls({})).toThrow(
      'NODE_DATABASE_BINDING_REQUIRED:WORLD_NODE_READ_DATABASE_URL',
    );
    expect(() =>
      registeredNodeDatabaseUrls({
        WORLD_NODE_READ_DATABASE_URL: 'TEST_ONLY_PASSWORD',
      }),
    ).toThrow('NODE_DATABASE_BINDING_REQUIRED:WORLD_NODE_READ_DATABASE_URL');
  });
  it('requires a separate Industry publisher binding only when that installation is selected', () => {
    const environment = Object.fromEntries(
      Object.entries(REGISTERED_NODE_DATABASE_VARIABLES).map(([key, name]) => [
        name,
        `postgresql://test_${key}:TEST_ONLY@db.example.org/test_only`,
      ]),
    );
    expect(
      registeredNodeDatabaseUrls(environment).industryPublication,
    ).toBeUndefined();
    expect(() =>
      registeredNodeDatabaseUrls(environment, { industryPublisher: true }),
    ).toThrow(
      'NODE_DATABASE_BINDING_REQUIRED:WORLD_NODE_INDUSTRY_PUBLICATION_DATABASE_URL',
    );
    environment.WORLD_NODE_INDUSTRY_PUBLICATION_DATABASE_URL =
      environment.WORLD_NODE_PUBLICATION_DATABASE_URL!;
    expect(() =>
      registeredNodeDatabaseUrls(environment, { industryPublisher: true }),
    ).toThrow('NODE_DISTINCT_DATABASE_PRINCIPALS_REQUIRED');
    environment.WORLD_NODE_INDUSTRY_PUBLICATION_DATABASE_URL =
      'postgresql://test_industry:TEST_ONLY@db.example.org/test_only?sslmode=disable';
    expect(() =>
      registeredNodeDatabaseUrls(environment, { industryPublisher: true }),
    ).toThrow(
      'NODE_VERIFIED_TLS_DATABASE_BINDING_REQUIRED:WORLD_NODE_INDUSTRY_PUBLICATION_DATABASE_URL',
    );
    environment.WORLD_NODE_INDUSTRY_PUBLICATION_DATABASE_URL =
      'postgresql://test_industry:TEST_ONLY@db.example.org/test_only';
    expect(
      registeredNodeDatabaseUrls(environment, { industryPublisher: true })
        .industryPublication,
    ).toBe(environment.WORLD_NODE_INDUSTRY_PUBLICATION_DATABASE_URL);
    expect(
      registeredNodeDatabaseUrls(environment).industryPublication,
    ).toBeUndefined();
  });
  it('requires distinct principals and rejects TLS query overrides', () => {
    const environment = Object.fromEntries(
      Object.entries(REGISTERED_NODE_DATABASE_VARIABLES).map(([key, name]) => [
        name,
        `postgresql://test_${key}:TEST_ONLY@db.example.org/test_only`,
      ]),
    );
    expect(Object.keys(registeredNodeDatabaseUrls(environment))).toHaveLength(
      5,
    );
    environment.WORLD_NODE_WORKER_DATABASE_URL =
      environment.WORLD_NODE_READ_DATABASE_URL!;
    expect(() => registeredNodeDatabaseUrls(environment)).toThrow(
      'NODE_DISTINCT_DATABASE_PRINCIPALS_REQUIRED',
    );
    environment.WORLD_NODE_WORKER_DATABASE_URL =
      'postgresql://test_worker:TEST_ONLY@db.example.org/test_only?sslmode=disable';
    expect(() => registeredNodeDatabaseUrls(environment)).toThrow(
      'NODE_VERIFIED_TLS_DATABASE_BINDING_REQUIRED',
    );
  });
});
