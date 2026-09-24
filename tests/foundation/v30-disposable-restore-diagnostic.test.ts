import { describe, expect, it } from 'vitest';

import { assertV30DisposableRestoreTarget } from '../../scripts/v30-disposable-restore-diagnostic.mjs';

const valid = {
  ECONMIND_ENV: 'ci',
  GITHUB_ACTIONS: 'true',
  GITHUB_SHA: 'a'.repeat(40),
  V30_DISPOSABLE_RESTORE_CONFIRMATION: 'EXECUTE_DISPOSABLE_V30_PG_RESTORE',
  V30_DISPOSABLE_POSTGRES_ADMIN_URL:
    'postgresql://postgres@127.0.0.1:5432/postgres',
};

describe('V30 disposable PostgreSQL restore target guard', () => {
  it('permits only the exact credential-free CI loopback service', () => {
    expect(assertV30DisposableRestoreTarget(valid)).toEqual({
      adminUrl: valid.V30_DISPOSABLE_POSTGRES_ADMIN_URL,
      codeSha: valid.GITHUB_SHA,
    });
  });

  it('rejects remote, production, credentialed and shared runtime targets', () => {
    for (const changed of [
      { ECONMIND_ENV: 'production' },
      { GITHUB_ACTIONS: 'false' },
      { GITHUB_SHA: 'moving-main' },
      { V30_DISPOSABLE_RESTORE_CONFIRMATION: 'YES' },
      {
        V30_DISPOSABLE_POSTGRES_ADMIN_URL:
          'postgresql://postgres@db.example/postgres',
      },
      {
        V30_DISPOSABLE_POSTGRES_ADMIN_URL:
          'postgresql://postgres:secret@127.0.0.1:5432/postgres',
      },
      {
        V30_DISPOSABLE_POSTGRES_ADMIN_URL:
          'postgresql://postgres@127.0.0.1:5432/econmind_main',
      },
      { DATABASE_URL: valid.V30_DISPOSABLE_POSTGRES_ADMIN_URL },
      { WORLD_DATABASE_URL: valid.V30_DISPOSABLE_POSTGRES_ADMIN_URL },
      { SUPABASE_DB_URL: valid.V30_DISPOSABLE_POSTGRES_ADMIN_URL },
    ]) {
      expect(() =>
        assertV30DisposableRestoreTarget({ ...valid, ...changed }),
      ).toThrow();
    }
  });
});
