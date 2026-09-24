import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';

const CANONICAL_CONNECTION_STRING =
  'postgresql://postgres@127.0.0.1:5432/econmind_v09';

function environment(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    ECONMIND_ENV: 'ci',
    V09_TEST_DATABASE_FINGERPRINT: 'world-v2-v09-test-ci',
    V09_TEST_DATABASE_URL: CANONICAL_CONNECTION_STRING,
    ...overrides,
  };
}

describe('V09 disposable PostgreSQL target boundary', () => {
  it('rejects pg URL parameter redirection before a pool can be created', () => {
    for (const connectionString of [
      'postgresql://postgres@127.0.0.1:5432/econmind_v09?host=pg.example.com&port=6432',
      'postgresql://postgres@127.0.0.1:5432/econmind_v09?application_name=redirectable',
      'postgresql://postgres@127.0.0.1:5432/econmind_v09#pg.example.com',
    ]) {
      expect(() =>
        assertV09PostgresTestEnvironment(
          environment({ V09_TEST_DATABASE_URL: connectionString }),
        ),
      ).toThrow('must not contain query or fragment connection overrides');
    }
  });

  it('rejects URL credentials and ambient pg connection overrides', () => {
    expect(() =>
      assertV09PostgresTestEnvironment(
        environment({
          V09_TEST_DATABASE_URL:
            'postgresql://postgres:password@127.0.0.1:5432/econmind_v09',
        }),
      ),
    ).toThrow('without URL credentials');
    expect(() =>
      assertV09PostgresTestEnvironment(
        environment({ PGHOST: 'pg.example.com' }),
      ),
    ).toThrow('PGHOST must be absent');
  });

  it('admits only the canonical target that pg itself resolves', () => {
    const authorized = assertV09PostgresTestEnvironment(environment());
    const parameters = new Client({
      connectionString: authorized.connectionString,
    }).connectionParameters;

    expect(authorized.connectionString).toBe(CANONICAL_CONNECTION_STRING);
    expect(parameters).toMatchObject({
      database: 'econmind_v09',
      host: '127.0.0.1',
      password: null,
      port: 5432,
      ssl: false,
      user: 'postgres',
    });
  });
});
