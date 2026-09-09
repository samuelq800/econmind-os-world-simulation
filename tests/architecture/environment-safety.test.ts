import { describe, expect, it } from 'vitest';

import { assessEnvironment } from '../../scripts/environment-policy.mjs';
import { findSensitivePatterns } from '../../scripts/repository-secrets-policy.mjs';
import { classifySupabaseArguments } from '../../scripts/supabase-policy.mjs';
import { findForbiddenBrowserVariables } from '../../scripts/vite-environment-policy.mjs';

describe('environment safety policy', () => {
  it('accepts loopback databases for local work', () => {
    expect(
      assessEnvironment({
        ECONMIND_ENV: 'local',
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        WORLD_DATABASE_FINGERPRINT: 'world-v2-local',
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
      'VITE_SUPABASE_SERVICE_ROLE_KEY must never be exposed to browser code; reason=Supabase service-role credential',
    );
  });

  it('classifies server-only browser variables without exposing values', () => {
    expect(
      findForbiddenBrowserVariables({
        VITE_PRIVATE_KEY: 'synthetic-value',
        VITE_SERVER_TOKEN: 'synthetic-value',
        VITE_WORLD_API_BASE_URL: 'https://safe.example.invalid',
      }),
    ).toEqual([
      { name: 'VITE_PRIVATE_KEY', category: 'SERVER_ONLY_KEY' },
      { name: 'VITE_SERVER_TOKEN', category: 'UNAPPROVED_PUBLIC_KEY' },
    ]);
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

  it('validates the values of approved keys, not just their names', () => {
    const jwt = (role: string) =>
      [
        Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
          'base64url',
        ),
        Buffer.from(JSON.stringify({ role })).toString('base64url'),
        Buffer.from('synthetic-signature').toString('base64url'),
      ].join('.');
    const safe = {
      VITE_WORLD_API_URL: 'http://127.0.0.1:4100',
      VITE_WORLD_API_BASE_URL: 'https://api.example.invalid/v1',
      VITE_SUPABASE_ANON_KEY: jwt('anon'),
      VITE_SUPABASE_PUBLISHABLE_KEY: [
        'sb',
        'publishable',
        'abcdefghijklmnop',
      ].join('_'),
      VITE_USER_NODE_ENV: 'production',
    };
    expect(findForbiddenBrowserVariables(safe)).toEqual([]);
    for (const value of [
      ['sb', 'secret', 'abcdefghijklmnop'].join('_'),
      jwt('service_role'),
      ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
      'Bearer synthetic-password',
      'mysql://user:synthetic-password@localhost/test',
    ]) {
      for (const name of Object.keys(safe)) {
        const violations = findForbiddenBrowserVariables({ [name]: value });
        expect(violations).toHaveLength(1);
        expect(JSON.stringify(violations)).not.toContain(value);
      }
    }
  });
});
