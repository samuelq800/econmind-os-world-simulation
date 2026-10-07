import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSupabaseJwksSignatureVerifier,
  SUPABASE_JWKS_LIMITS,
} from '../../apps/world-api/src/integration/supabase-jwks-signature-verifier.js';
import { verifySupabaseJwtClaims } from '../../apps/world-api/src/integration/identity.js';
import { executeAuthenticatedWorldProjectionRead } from '../../apps/world-api/src/integration/authenticated-read-boundary.js';
import { createWorldReadRequest } from '../../apps/world-api/src/integration/contracts.js';

// TEST_ONLY real local keys/signatures, mocked HTTPS JWKS responses and no DB.
// The named project is invented: never fetch a real project/account.
const projectRef = 'abcdefghijklmnopqrst';
const issuer = `https://${projectRef}.supabase.co/auth/v1`;
const url = issuer + '/.well-known/jwks.json';
const subject = '22222222-2222-4222-8222-222222222222';
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const rotated = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const claims = {
  sub: subject,
  iss: issuer,
  aud: 'authenticated',
  iat: 500,
  exp: 2000,
};
const policy = {
  expectedIssuer: issuer,
  expectedAudience: 'authenticated',
  nowEpochSeconds: 1000,
};
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
function key(publicKey = ec.publicKey, kid = 'TEST_KEY', alg = 'ES256') {
  return {
    ...publicKey.export({ format: 'jwk' }),
    kid,
    alg,
    use: 'sig',
    key_ops: ['verify'],
  };
}
function token(
  options: {
    privateKey?: KeyObject;
    alg?: string;
    kid?: string;
    header?: Record<string, unknown>;
    claims?: Record<string, unknown>;
  } = {},
) {
  const alg = options.alg ?? 'ES256';
  const data =
    encode({
      typ: 'JWT',
      alg,
      kid: options.kid ?? 'TEST_KEY',
      ...options.header,
    }) +
    '.' +
    encode(options.claims ?? claims);
  const signature = sign(
    'sha256',
    Buffer.from(data),
    alg === 'RS256'
      ? (options.privateKey ?? rsa.privateKey)
      : { key: options.privateKey ?? ec.privateKey, dsaEncoding: 'ieee-p1363' },
  );
  return data + '.' + signature.toString('base64url');
}
function response(
  body: string | ReadableStream<Uint8Array>,
  options: {
    status?: number;
    url?: string;
    redirected?: boolean;
    headers?: Record<string, string>;
  } = {},
) {
  const result = new Response(body, {
    status: options.status ?? 200,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  Object.defineProperties(result, {
    url: { value: options.url ?? url },
    redirected: { value: options.redirected ?? false },
  });
  return result;
}
function fixture(keys: unknown[] = [key()]) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    response(JSON.stringify({ keys })),
  );
  const verifier = createSupabaseJwksSignatureVerifier({
    projectRef,
    expectedIssuer: issuer,
    jwksUrl: url,
    fetch,
  });
  return { verifier, fetch };
}
afterEach(() => vi.useRealTimers());

describe('real fixed Supabase JWKS signature verifier (offline)', () => {
  it.each([
    { expectedIssuer: issuer + '/' },
    { expectedIssuer: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co/auth/v1' },
    { jwksUrl: url + '?other=1' },
    { jwksUrl: url.replace('https:', 'http:') },
    { jwksUrl: 'https://other.invalid/key.json' },
    { projectRef: 'invalid-project' },
  ])('rejects inconsistent server pins without network', (override) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(() =>
      createSupabaseJwksSignatureVerifier({
        projectRef,
        expectedIssuer: issuer,
        jwksUrl: url,
        fetch,
        ...override,
      }),
    ).toThrow('SUPABASE_JWKS_CONFIGURATION_INVALID');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['ES256', 'RS256'])(
    'really verifies %s and composes the existing claims policy',
    async (alg) => {
      const h = fixture([
        key(alg === 'RS256' ? rsa.publicKey : ec.publicKey, 'TEST_KEY', alg),
      ]);
      expect(h.fetch).not.toHaveBeenCalled(); // no default mount or construction I/O
      const jwt = token({ alg });
      expect(await h.verifier.verify(jwt)).toEqual(claims);
      expect(
        await verifySupabaseJwtClaims({
          token: jwt,
          verifier: h.verifier,
          policy,
        }),
      ).toMatchObject({
        authSubject: subject,
        issuer,
        audience: 'authenticated',
      });
      expect(h.fetch).toHaveBeenCalledTimes(1);
      expect(h.fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'GET',
          redirect: 'error',
          credentials: 'omit',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: expect.any(AbortSignal),
        }),
      );
    },
  );

  it('rejects wrong key, payload tampering and DER rather than JWT P1363 signature', async () => {
    const h = fixture();
    const valid = token();
    const tampered = valid.split('.');
    tampered[1] = encode({
      ...claims,
      sub: '33333333-3333-4333-8333-333333333333',
    });
    const data = valid.slice(0, valid.lastIndexOf('.'));
    const der = sign('sha256', Buffer.from(data), ec.privateKey).toString(
      'base64url',
    );
    for (const jwt of [
      token({ privateKey: rotated.privateKey }),
      tampered.join('.'),
      data + '.' + der,
    ])
      await expect(h.verifier.verify(jwt)).rejects.toThrow(
        'SUPABASE_JWT_VERIFICATION_FAILED',
      );
    expect(h.fetch).toHaveBeenCalledTimes(1); // signature failure never refreshes
  });

  it.each([
    { alg: 'none' },
    { alg: 'HS256' },
    { kid: '' },
    { header: { jku: 'https://untrusted.invalid/jwks' } },
    { header: { x5u: 'https://untrusted.invalid/cert' } },
    { header: { jwk: key() } },
    { header: { crit: ['b64'], b64: false } },
  ])('rejects forbidden JWT headers before any key fetch', async (options) => {
    const h = fixture();
    await expect(h.verifier.verify(token(options))).rejects.toThrow(
      'SUPABASE_JWT_VERIFICATION_FAILED',
    );
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('rejects malformed/noncanonical or oversized token without fetching', async () => {
    const h = fixture();
    for (const jwt of [
      'decode-only',
      token() + '.',
      'a'.repeat(8193),
      token().replace('.', '=.'),
    ])
      await expect(h.verifier.verify(jwt)).rejects.toThrow(
        'SUPABASE_JWT_VERIFICATION_FAILED',
      );
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('rejects signed claims from another issuer using only the fixed URL', async () => {
    const h = fixture();
    await expect(
      h.verifier.verify(
        token({ claims: { ...claims, iss: 'https://attacker.invalid' } }),
      ),
    ).rejects.toThrow('SUPABASE_JWT_VERIFICATION_FAILED');
    expect(h.fetch.mock.calls[0]?.[0]).toBe(url);
  });

  it.each([
    { exp: 900 },
    { aud: 'wrong-audience' },
    { iat: 1001 },
    { iss: issuer + '/' },
  ])(
    'requires existing policy in addition to authentic signatures',
    async (override) => {
      const h = fixture();
      const jwt = token({ claims: { ...claims, ...override } });
      await expect(
        verifySupabaseJwtClaims({ token: jwt, verifier: h.verifier, policy }),
      ).rejects.toThrow();
    },
  );

  it.each([
    { alg: 'RS256' },
    { crv: 'P-384' },
    { kty: 'oct' },
    { use: 'enc' },
    { key_ops: ['sign'] },
    { d: 'private-material' },
    { x5u: 'https://untrusted.invalid' },
    { x: 'AA' },
    { use: undefined, key_ops: undefined },
  ])(
    'fails closed on inconsistent/private/ineligible JWK',
    async (override) => {
      const h = fixture([{ ...key(), ...override }]);
      await expect(h.verifier.verify(token())).rejects.toThrow(
        'SUPABASE_JWT_VERIFICATION_FAILED',
      );
    },
  );

  it('rejects duplicate/empty/excess key sets and supports explicit verify-only purpose', async () => {
    for (const keys of [
      [key(), key()],
      [],
      Array.from({ length: 9 }, (_, i) => key(ec.publicKey, 'KEY_' + i)),
    ]) {
      const h = fixture(keys);
      await expect(h.verifier.verify(token())).rejects.toThrow(
        'SUPABASE_JWT_VERIFICATION_FAILED',
      );
    }
    const h = fixture([{ ...key(), use: undefined }]);
    expect(await h.verifier.verify(token())).toEqual(claims);
  });

  it('rejects undersized RSA, key-alg confusion and wrong RSA signature', async () => {
    const weak = generateKeyPairSync('rsa', { modulusLength: 1024 });
    const h = fixture([key(weak.publicKey, 'TEST_KEY', 'RS256')]);
    await expect(
      h.verifier.verify(token({ alg: 'RS256', privateKey: weak.privateKey })),
    ).rejects.toThrow('SUPABASE_JWT_VERIFICATION_FAILED');
    const strong = fixture([key(rsa.publicKey, 'TEST_KEY', 'RS256')]);
    await expect(strong.verifier.verify(token())).rejects.toThrow(
      'SUPABASE_JWT_VERIFICATION_FAILED',
    );
    const jwt = token({ alg: 'RS256' }).split('.');
    jwt[2] = Buffer.alloc(256).toString('base64url');
    await expect(strong.verifier.verify(jwt.join('.'))).rejects.toThrow(
      'SUPABASE_JWT_VERIFICATION_FAILED',
    );
  });

  it('single-flights initial cache fill and cooldown-gates one rotation refresh', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const h = fixture();
    await Promise.all([h.verifier.verify(token()), h.verifier.verify(token())]);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    const next = token({ kid: 'ROTATED_KEY', privateKey: rotated.privateKey });
    await expect(h.verifier.verify(next)).rejects.toThrow(
      'SUPABASE_JWT_VERIFICATION_FAILED',
    );
    expect(h.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SUPABASE_JWKS_LIMITS.refreshCooldownMs);
    h.fetch.mockImplementation(async () =>
      response(
        JSON.stringify({
          keys: [key(), key(rotated.publicKey, 'ROTATED_KEY')],
        }),
      ),
    );
    await Promise.all([h.verifier.verify(next), h.verifier.verify(next)]);
    expect(h.fetch).toHaveBeenCalledTimes(2);
    for (const id of ['UNKNOWN_1', 'UNKNOWN_2'])
      await expect(h.verifier.verify(token({ kid: id }))).rejects.toThrow(
        'SUPABASE_JWT_VERIFICATION_FAILED',
      );
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it('expired cache fails closed on outage, with no stale keys or retry amplification', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const h = fixture();
    await h.verifier.verify(token());
    await vi.advanceTimersByTimeAsync(SUPABASE_JWKS_LIMITS.cacheTtlMs);
    h.fetch.mockRejectedValue(new Error('REMOTE_SECRET_SHOULD_NOT_LEAK'));
    await expect(h.verifier.verify(token())).rejects.toThrow(
      'SUPABASE_JWT_VERIFICATION_FAILED',
    );
    await expect(h.verifier.verify(token())).rejects.toThrow(
      'SUPABASE_JWT_VERIFICATION_FAILED',
    );
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    { status: 503 },
    { redirected: true },
    { url: 'https://other.invalid/key' },
    { headers: { 'content-type': 'text/html' } },
    { headers: { 'content-length': '65537' } },
  ])(
    'rejects HTTP/target/media/declared bound failure without leaking remote contents',
    async (options) => {
      const h = fixture();
      h.fetch.mockResolvedValue(
        response('REMOTE_SECRET_SHOULD_NOT_LEAK', options),
      );
      const error = await h.verifier.verify(token()).catch((e: unknown) => e);
      expect(error).toEqual(new Error('SUPABASE_JWT_VERIFICATION_FAILED'));
      expect(String(error)).not.toContain('REMOTE_SECRET');
    },
  );

  it('bounds decoded bytes independently from encoded HTTP Content-Length', async () => {
    const h = fixture();
    h.fetch.mockResolvedValue(
      response(JSON.stringify({ keys: [key()] }), {
        headers: { 'content-encoding': 'gzip', 'content-length': '200' },
      }),
    );
    // The trusted native-fetch port exposes decompressed bytes; no gzip/JSON
    // algorithm is replaced in the verifier and the observed stream cap stays.
    expect(await h.verifier.verify(token())).toEqual(claims);
  });

  it('bounds chunked body, rejects invalid UTF8/JSON and cancels streams', async () => {
    const h = fixture();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(40000));
        c.enqueue(new Uint8Array(30000));
      },
      cancel,
    });
    h.fetch.mockResolvedValue(response(body));
    await expect(h.verifier.verify(token())).rejects.toThrow(
      'SUPABASE_JWT_VERIFICATION_FAILED',
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    for (const raw of ['{"keys":', '{"keys":[null]}']) {
      h.verifier.invalidateCache();
      h.fetch.mockResolvedValue(response(raw));
      await expect(h.verifier.verify(token())).rejects.toThrow(
        'SUPABASE_JWT_VERIFICATION_FAILED',
      );
    }
    h.verifier.invalidateCache();
    h.fetch.mockResolvedValue(
      response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([0xff]));
            c.close();
          },
        }),
      ),
    );
    await expect(h.verifier.verify(token())).rejects.toThrow(
      'SUPABASE_JWT_VERIFICATION_FAILED',
    );
  });

  it('aborted caller never returns claims or cancels another load waiter', async () => {
    let release!: (value: Response) => void;
    const h = fixture();
    h.fetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const firstController = new AbortController(),
      secondController = new AbortController();
    const first = h.verifier.verify(token(), firstController.signal);
    const second = h.verifier.verify(token(), secondController.signal);
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1));
    firstController.abort();
    await expect(first).rejects.toThrow('JWT_VERIFICATION_CANCELLED');
    expect(h.fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    release(response(JSON.stringify({ keys: [key()] })));
    expect(await second).toEqual(claims);
    const aborted = new AbortController();
    aborted.abort();
    await expect(h.verifier.verify(token(), aborted.signal)).rejects.toThrow(
      'JWT_VERIFICATION_CANCELLED',
    );
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it('last cancelled waiter aborts transport and ignored abort never publishes late keys', async () => {
    let release!: (value: Response) => void;
    const h = fixture();
    h.fetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const controller = new AbortController();
    const result = h.verifier.verify(token(), controller.signal);
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(result).rejects.toThrow('JWT_VERIFICATION_CANCELLED');
    expect(h.fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    release(response(JSON.stringify({ keys: [key()] })));
    await expect(h.verifier.verify(token())).rejects.toThrow(
      'SUPABASE_JWT_VERIFICATION_FAILED',
    );
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['FETCH', 'BODY'])(
    'bounds a hung %s despite ignored transport cancellation',
    async (stage) => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'performance'],
      });
      const h = fixture();
      h.fetch.mockImplementation(async () =>
        stage === 'FETCH'
          ? await new Promise<Response>(() => undefined)
          : response(
              new ReadableStream<Uint8Array>({ start: () => undefined }),
            ),
      );
      const result = expect(h.verifier.verify(token())).rejects.toThrow(
        'SUPABASE_JWT_VERIFICATION_FAILED',
      );
      await vi.advanceTimersByTimeAsync(SUPABASE_JWKS_LIMITS.timeoutMs);
      await result;
      expect(h.fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      await expect(h.verifier.verify(token())).rejects.toThrow(
        'SUPABASE_JWT_VERIFICATION_FAILED',
      );
      expect(h.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('operator purge drops trust immediately and cannot be refilled by an old in-flight load', async () => {
    let release!: (value: Response) => void;
    const h = fixture();
    h.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const oldResult = expect(h.verifier.verify(token())).rejects.toThrow(
      'SUPABASE_JWT_VERIFICATION_FAILED',
    );
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1));
    h.verifier.invalidateCache();
    h.fetch.mockImplementation(async () =>
      response(
        JSON.stringify({ keys: [key(rotated.publicKey, 'ROTATED_KEY')] }),
      ),
    );
    const next = token({ kid: 'ROTATED_KEY', privateKey: rotated.privateKey });
    expect(await h.verifier.verify(next)).toEqual(claims);
    release(response(JSON.stringify({ keys: [key()] })));
    await oldResult;
    await expect(h.verifier.verify(token())).rejects.toThrow(
      'SUPABASE_JWT_VERIFICATION_FAILED',
    );
    expect(await h.verifier.verify(next)).toEqual(claims);
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it('injects directly into existing read boundary and never reaches DB on a bad signature', async () => {
    const h = fixture();
    const executor = { query: vi.fn(async () => ({ rows: [] })) };
    const request = createWorldReadRequest({
      requestId: '11111111-1111-4111-8111-111111111111',
      worldId: 'TEST_WORLD',
      classification: 'COUNTRY',
      scopeKey: 'TEST_SCOPE',
    });
    await expect(
      executeAuthenticatedWorldProjectionRead({
        authorization: 'Bearer ' + token({ privateKey: rotated.privateKey }),
        executor,
        request,
        verifier: h.verifier,
        policy: { jwt: policy, timeoutMs: 5000 },
      }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_INVALID' });
    expect(executor.query).not.toHaveBeenCalled();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(
      await executeAuthenticatedWorldProjectionRead({
        authorization: 'Bearer ' + token(),
        executor,
        request,
        verifier: h.verifier,
        policy: { jwt: policy, timeoutMs: 5000 },
      }),
    ).toBeNull();
    expect(executor.query).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        values: expect.arrayContaining([subject]),
      }),
    );
  });
});
