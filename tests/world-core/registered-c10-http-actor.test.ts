/** Actual disposable ES256 signatures and pre-connection gates. No DB, role,
 * source, actor binding or metadata registration is claimed by these tests. */
import { generateKeyPairSync, verify } from 'node:crypto';
import { it, expect } from 'vitest';
import {
  createRegisteredUtilityFixtureTokenSigner,
  prepareRegisteredC10HttpActorFrom,
} from '../support/registered-c10-http-actor.js';
const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const config = {
  issuer: 'https://registered-test.example/auth/v1',
  kid: 'TEST_ONLY_C10_EPHEMERAL',
  privateKey: keys.privateKey,
};
const one = '11111111-1111-4111-8111-111111111111',
  two = '22222222-2222-4222-8222-222222222222',
  ten = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function body(token: string) {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature)
    throw Error('EXACT_SIGNED_JWT_REQUIRED');
  expect(
    verify(
      'sha256',
      Buffer.from(header + '.' + payload),
      { key: keys.publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    ),
  ).toBe(true);
  expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
    alg: 'ES256',
    typ: 'JWT',
    kid: config.kid,
  });
  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
    sub: string;
    iss: string;
    aud: string;
    iat: number;
    exp: number;
  };
}
it('preserves default C1/C2 subjects and rejects missing C10 instead of falling back', () => {
  const signer = createRegisteredUtilityFixtureTokenSigner({
    ...config,
    subjects: { COUNTRY_01: one, COUNTRY_02: two },
  });
  expect(body(signer('COUNTRY_01')).sub).toBe(one);
  expect(body(signer('COUNTRY_02')).sub).toBe(two);
  expect(() => signer('COUNTRY_10')).toThrow(
    'EXACT_ACTUAL_SUBJECT_COUNTRY_REQUIRED',
  );
});
it('signs the explicit C10 subject with the same disposable JWK and finite expiry', () => {
  const subjects = { COUNTRY_01: one, COUNTRY_02: two, COUNTRY_10: ten };
  const signer = createRegisteredUtilityFixtureTokenSigner({
    ...config,
    subjects,
  });
  subjects.COUNTRY_10 = one; // Caller changes do not replace the installed snapshot.
  const result = body(signer('COUNTRY_10'));
  expect(result.sub).toBe(ten);
  expect(result.iss).toBe(config.issuer);
  expect(result.aud).toBe('authenticated');
  expect(result.exp - result.iat).toBe(3600);
  expect(() => Reflect.apply(signer, undefined, ['COUNTRY_20'])).toThrow(
    'EXACT_ACTUAL_SUBJECT_COUNTRY_REQUIRED',
  );
});
it('does not allow an unknown country in the signer configuration', () => {
  expect(() =>
    Reflect.apply(createRegisteredUtilityFixtureTokenSigner, undefined, [
      { ...config, subjects: { COUNTRY_20: ten } },
    ]),
  ).toThrow('FIXED_FIXTURE_COUNTRIES_REQUIRED');
});
it('does not connect or mint an identity without the explicit native opt-in', async () => {
  const old = process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE;
  delete process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE;
  try {
    await expect(
      Reflect.apply(prepareRegisteredC10HttpActorFrom, undefined, [{}]),
    ).rejects.toThrow('C10_EXPLICIT_TEST_ONLY_PREPARATION_REQUIRED');
  } finally {
    if (old !== undefined)
      process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE = old;
  }
});
it('rejects the original marker database before pool or source access', async () => {
  const old = process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE;
  process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE = '1';
  try {
    await expect(
      Reflect.apply(prepareRegisteredC10HttpActorFrom, undefined, [
        {
          marker: { database: 'postwar_reference' },
          clone: { database: 'postwar_reference' },
        },
      ]),
    ).rejects.toThrow();
  } finally {
    if (old === undefined)
      delete process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE;
    else process.env.ECONMIND_REGISTERED_FINAL_NODE_NATIVE = old;
  }
});
