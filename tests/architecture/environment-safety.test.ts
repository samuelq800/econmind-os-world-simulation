import { describe, expect, it } from 'vitest';

import { assessEnvironment } from '../../scripts/environment-policy.mjs';
import { findSensitivePatterns } from '../../scripts/repository-secrets-policy.mjs';
import { classifySupabaseArguments } from '../../scripts/supabase-policy.mjs';

describe('environment safety policy', () => {
  it('accepts loopback databases for local work', () => {
    expect(
      assessEnvironment({
        ECONMIND_ENV: 'local',
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      }).violations,
    ).toEqual([]);
  });

  it('rejects remote databases for local work', () => {
    expect(
      assessEnvironment({
        ECONMIND_ENV: 'local',
        DATABASE_URL: 'postgresql://example.invalid/postgres',
      }).violations,
    ).toContain('local DATABASE_URL must resolve to a loopback host');
  });

  it('rejects browser-exposed secrets', () => {
    expect(
      assessEnvironment({
        ECONMIND_ENV: 'local',
        VITE_SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-secret',
      }).violations,
    ).toContain(
      'VITE_SUPABASE_SERVICE_ROLE_KEY must never be exposed to browser code',
    );
  });

  it('allows only read-only Supabase wrapper commands', () => {
    expect(classifySupabaseArguments(['status']).allowed).toBe(true);
    expect(classifySupabaseArguments(['--version']).allowed).toBe(true);
    expect(classifySupabaseArguments(['--', 'status']).allowed).toBe(false);
    expect(classifySupabaseArguments(['db', 'push']).allowed).toBe(false);
    expect(classifySupabaseArguments(['db', 'reset']).allowed).toBe(false);
  });

  it('detects credential-shaped repository content', () => {
    const fakeCredential = ['sb', 'secret', 'abcdefghijklmnop'].join('_');

    expect(findSensitivePatterns(fakeCredential)).toEqual([
      'Supabase secret key',
    ]);
    expect(
      findSensitivePatterns('VITE_WORLD_API_BASE_URL=http://127.0.0.1'),
    ).toEqual([]);
  });
});
