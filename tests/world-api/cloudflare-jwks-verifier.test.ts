import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createCloudflareJwksVerifier } from '../../apps/world-api/src/runtime-preparation/cloudflare-jwks-verifier.js';

// TEST_ONLY offline transport: ephemeral public keys, no real account/session.
const projectRef = 'abcdefghijklmnopqrst';
const issuer = `https://${projectRef}.supabase.co/auth/v1`;
const jwksUrl = issuer + '/.well-known/jwks.json';
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const claims = {
  sub: '11111111-1111-4111-8111-111111111111',
  iss: issuer,
  aud: 'authenticated',
  iat: 1,
  exp: 2,
};
const data =
  encode({ alg: 'ES256', kid: 'TEST_ONLY_KEY', typ: 'JWT' }) +
  '.' +
  encode(claims);
const token =
  data +
  '.' +
  sign('sha256', Buffer.from(data), {
    key: pair.privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
function fixture(status = 200, responseUrl = jwksUrl, redirected = false) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const response = new Response(
      JSON.stringify({
        keys: [
          {
            ...pair.publicKey.export({ format: 'jwk' }),
            alg: 'ES256',
            kid: 'TEST_ONLY_KEY',
            use: 'sig',
          },
        ],
      }),
      {
        status,
        headers: {
          'content-type': 'application/json',
          location: 'https://unapproved.invalid/jwks',
        },
      },
    );
    Object.defineProperties(response, {
      url: { value: responseUrl },
      redirected: { value: redirected },
    });
    return response;
  });
  return {
    fetch,
    verifier: createCloudflareJwksVerifier({
      projectRef,
      expectedIssuer: issuer,
      jwksUrl,
      fetch,
    }),
  };
}
describe('Cloudflare JWKS transport preserves fixed origin and fail-closed validation', () => {
  it('uses a bounded manual-redirect request without authorization/cookies and retains real signature verification', async () => {
    const f = fixture();
    expect(await f.verifier.verify(token)).toEqual(claims);
    expect(f.fetch).toHaveBeenCalledWith(
      jwksUrl,
      expect.objectContaining({
        redirect: 'manual',
        credentials: 'omit',
        signal: expect.any(AbortSignal),
      }),
    );
    const headers = new Headers(f.fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.has('authorization')).toBe(false);
    expect(headers.has('cookie')).toBe(false);
  });
  it.each([301, 302, 307, 308])(
    'rejects HTTP %s without following Location',
    async (status) => {
      const f = fixture(status);
      await expect(f.verifier.verify(token)).rejects.toThrow(
        'SUPABASE_JWT_VERIFICATION_FAILED',
      );
      expect(f.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { url: 'https://unapproved.invalid/jwks', redirected: false },
    { url: jwksUrl, redirected: true },
  ])('rejects response provenance mismatch %j', async (value) => {
    const f = fixture(200, value.url, value.redirected);
    await expect(f.verifier.verify(token)).rejects.toThrow(
      'SUPABASE_JWT_VERIFICATION_FAILED',
    );
  });
});
