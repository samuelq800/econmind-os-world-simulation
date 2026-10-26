import { request } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertIsolatedSocialOfficeEnvironment,
  createIsolatedSocialOfficeIdentity,
  createOwnedSocialOfficeDatabase,
  ISOLATED_SOCIAL_CLASSIFICATION,
  redactIsolatedSocialEvidence,
  startIsolatedSocialOfficeTransportProbe,
} from '../support/f-social-office-isolated-host.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const opted = { ECONMIND_ENV: 'local', ECONMIND_SOCIAL_OFFICE_DEMO: '1' };
describe('F isolated Social infrastructure — no domain/readiness substitute', () => {
  it('requires explicit local/CI opt-in and refuses external database configuration', () => {
    expect(() => assertIsolatedSocialOfficeEnvironment(opted)).not.toThrow();
    expect(() =>
      assertIsolatedSocialOfficeEnvironment({ ...opted, ECONMIND_ENV: 'ci' }),
    ).not.toThrow();
    expect(() => assertIsolatedSocialOfficeEnvironment({})).toThrow(
      'SOCIAL_HOST_LOCAL_CI_REQUIRED',
    );
    expect(() =>
      assertIsolatedSocialOfficeEnvironment({
        ...opted,
        ECONMIND_ENV: 'production',
      }),
    ).toThrow();
    expect(() =>
      assertIsolatedSocialOfficeEnvironment({
        ...opted,
        ECONMIND_SOCIAL_OFFICE_DEMO: '0',
      }),
    ).toThrow();
    expect(() =>
      assertIsolatedSocialOfficeEnvironment({
        ...opted,
        DATABASE_URL: 'postgresql://forbidden.invalid/example',
      }),
    ).toThrow('SOCIAL_HOST_EXTERNAL_DATABASE_ENV_REFUSED');
    expect(() =>
      assertIsolatedSocialOfficeEnvironment({
        ...opted,
        PGHOST: '/tmp/foreign',
      }),
    ).toThrow();
  });
  it('does not accept source/key/DSN or callback arguments, including behavioral objects', async () => {
    let calls = 0;
    const value = new Proxy(
      {},
      {
        ownKeys() {
          calls++;
          throw Error('must not run');
        },
      },
    );
    expect(() => createIsolatedSocialOfficeIdentity(value)).toThrow(
      'SOCIAL_HOST_NO_IDENTITY_ARGUMENTS',
    );
    await expect(createOwnedSocialOfficeDatabase(value)).rejects.toThrow(
      'SOCIAL_HOST_NO_DATABASE_ARGUMENTS',
    );
    await expect(
      startIsolatedSocialOfficeTransportProbe(value),
    ).rejects.toThrow('SOCIAL_HOST_NO_LISTENER_ARGUMENTS');
    expect(calls).toBe(0);
  });
  it('uses actual ES256 and existing claim/signature verifier with fixed no-network JWKS', async () => {
    const identity = createIsolatedSocialOfficeIdentity();
    const result = await identity.verify(identity.authorization);
    expect(result.authSubject).toBe(identity.subject);
    expect(identity.inspection()).toMatchObject({
      publicKeyCount: 1,
      fetchCount: 1,
      networkFetches: 0,
      genuineIdentity: false,
      sourceAdmitted: false,
    });
    await identity.verify(identity.authorization);
    expect(identity.inspection().fetchCount).toBe(1);
  });
  it('refuses another run key and modified signed bytes rather than trusting claims', async () => {
    const first = createIsolatedSocialOfficeIdentity(),
      second = createIsolatedSocialOfficeIdentity();
    await expect(first.verify(second.authorization)).rejects.toThrow();
    const parts = first.authorization.split('.');
    parts[1] = Buffer.from(
      JSON.stringify({
        sub: second.subject,
        iss: first.config.expectedIssuer,
        aud: 'authenticated',
        iat: 1,
        exp: 9999999999,
      }),
    ).toString('base64url');
    await expect(first.verify(parts.join('.'))).rejects.toThrow();
  });
  it('rejects an actually signed expired test token through the existing claims policy', async () => {
    const realNow = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(realNow - 700_000);
    const identity = createIsolatedSocialOfficeIdentity();
    clock.mockRestore();
    await expect(identity.verify(identity.authorization)).rejects.toThrow();
  });
  it('does not use the JWKS test port for arbitrary URLs or methods', async () => {
    const identity = createIsolatedSocialOfficeIdentity();
    await expect(
      identity.config.fetch('https://forbidden.invalid/'),
    ).rejects.toThrow('SOCIAL_HOST_NONLOCAL_JWKS_FETCH_REFUSED');
    await expect(
      identity.config.fetch(identity.config.jwksUrl, { method: 'POST' }),
    ).rejects.toThrow();
    expect(identity.inspection().fetchCount).toBe(0);
  });
  it('redacts credentials recursively without invoking accessors', () => {
    const identity = createIsolatedSocialOfficeIdentity();
    let calls = 0;
    const raw = {
      authorization: identity.authorization,
      nested: [{ text: identity.authorization }],
      get secret() {
        calls++;
        throw Error('not evidence');
      },
    };
    const text = JSON.stringify(redactIsolatedSocialEvidence(raw));
    expect(text).not.toContain(identity.authorization);
    expect(text).not.toContain(identity.authorization.slice(7));
    expect(calls).toBe(0);
  });
  it('always retains explicit simulated classifications and no production admission', () => {
    expect(ISOLATED_SOCIAL_CLASSIFICATION).toEqual({
      runtimeClass: 'ISOLATED_SIMULATED',
      sourceClass: 'SIMULATED_OPENING',
      sourceAdmitted: false,
      genuineIdentity: false,
      productionAdmission: false,
      WorldClock: false,
    });
    expect(Object.isFrozen(ISOLATED_SOCIAL_CLASSIFICATION)).toBe(true);
  });
  it('binds actual loopback and returns NOT_READY until the domain composition is bound', async () => {
    vi.stubEnv('ECONMIND_ENV', 'local');
    vi.stubEnv('ECONMIND_SOCIAL_OFFICE_DEMO', '1');
    const host = await startIsolatedSocialOfficeTransportProbe();
    try {
      expect(host.origin).toMatch(/^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/u);
      const response = await fetch(
        host.origin + '/__social-office-demo/health',
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        status: 'NOT_READY',
        completeOffice: false,
        sourceAdmitted: false,
      });
      const session = await fetch(
        host.origin + '/__social-office-demo/session',
        { method: 'POST' },
      );
      expect(session.status).toBe(404);
      expect(host.completeOffice).toBe(false);
    } finally {
      await host.close();
      await host.close();
    }
  });
  it('rejects a foreign Host on the actual local listener', async () => {
    vi.stubEnv('ECONMIND_ENV', 'local');
    vi.stubEnv('ECONMIND_SOCIAL_OFFICE_DEMO', '1');
    const host = await startIsolatedSocialOfficeTransportProbe();
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(
          host.origin + '/__social-office-demo/health',
          { headers: { Host: 'foreign.invalid' } },
          (res) => {
            res.resume();
            res.once('end', () => resolve(res.statusCode!));
          },
        );
        req.once('error', reject);
        req.end();
      });
      expect(status).toBe(403);
    } finally {
      await host.close();
    }
  });
});
