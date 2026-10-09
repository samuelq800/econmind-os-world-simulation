import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Operator/CI-only local check. No Wrangler login, cloud deploy, real keys,
// production SQL or user session is used. Repository dependencies stay frozen.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(
  root,
  'artifacts/world-runtime-environment-2026-10-09',
);
const toolRoot = process.env.WORLD_CLOUDFLARE_TOOL_ROOT;
if (!toolRoot || !path.isAbsolute(toolRoot))
  throw new Error('ISOLATED_CLOUDFLARE_TOOL_ROOT_REQUIRED');
const tool = (name, file) => path.join(toolRoot, 'node_modules', name, file);
const wrangler = JSON.parse(
  await readFile(tool('wrangler', 'package.json'), 'utf8'),
);
if (wrangler.version !== '4.148.0') throw new Error('PINNED_WRANGLER_REQUIRED');
const miniflarePackage = JSON.parse(
  await readFile(tool('miniflare', 'package.json'), 'utf8'),
);
const { Miniflare, convertV4MiniflareOptions } = await import(
  pathToFileURL(tool('miniflare', 'dist/src/index.js')).href
);
const { build } = await import(
  pathToFileURL(tool('esbuild', 'lib/main.js')).href
);
const keys = ['ES256', 'RS256'].map((alg) => {
  const pair =
    alg === 'ES256'
      ? generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      : generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    alg,
    privateKey: pair.privateKey,
    publicJwk: {
      ...pair.publicKey.export({ format: 'jwk' }),
      kid: 'TEST_ONLY_' + alg,
      alg,
      use: 'sig',
    },
  };
});
const jwks = { keys: keys.map((key) => key.publicJwk) };
const fixture = path.join(output, 'test-only-jwks.js');
await build({
  stdin: {
    contents: `import { createWorkerdJwtTestFixture } from './tests/support/cloudflare-jwks-workerd-fixture.ts'; export default createWorkerdJwtTestFixture(${JSON.stringify(jwks)});`,
    resolveDir: root,
    sourcefile: 'TEST_ONLY_WORKERD_JWT_FIXTURE',
  },
  outfile: fixture,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  external: ['node:*'],
  banner: { js: "import { Buffer } from 'node:buffer';" },
});
const api = path.join(output, 'api/runtime-api.js');
const executor = path.join(output, 'executor/hold-executor.js');
const options = {
  host: '127.0.0.1',
  port: 0,
  workers: [
    {
      name: 'econmind-world-api-staging',
      modules: true,
      scriptPath: api,
      compatibilityDate: '2026-10-09',
      compatibilityFlags: ['nodejs_compat'],
      bindings: { RUNTIME_MODE: 'HOLD' },
      serviceBindings: { WORLD_EXECUTOR: 'econmind-world-executor-staging' },
    },
    {
      name: 'econmind-world-executor-staging',
      modules: true,
      scriptPath: executor,
      compatibilityDate: '2026-10-09',
      compatibilityFlags: ['nodejs_compat'],
    },
    {
      name: 'TEST_ONLY_AUTH',
      modules: true,
      scriptPath: fixture,
      compatibilityDate: '2026-10-09',
      compatibilityFlags: ['nodejs_compat'],
    },
  ],
};
const mf = new Miniflare(convertV4MiniflareOptions(options));
const checks = [];
async function check(name, operation, expected) {
  const response = await operation();
  const body = await response.text();
  const passed =
    response.status === expected &&
    (name !== 'api-ready-hold' ||
      JSON.parse(body).executorTransport === 'ALIVE_HOLD');
  checks.push({
    name,
    status: response.status,
    expected,
    result: passed ? 'PASS' : 'FAIL',
  });
}
function jwt(key, overrides = {}, invalidSignature = false) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const data =
    b64({ alg: key.alg, kid: key.publicJwk.kid, typ: 'JWT' }) +
    '.' +
    b64({
      sub: '11111111-1111-4111-8111-111111111111',
      iss: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
      aud: 'authenticated',
      iat: now - 1,
      exp: now + 120,
      ...overrides,
    });
  const signature = sign(
    'sha256',
    Buffer.from(data),
    key.alg === 'ES256'
      ? { key: key.privateKey, dsaEncoding: 'ieee-p1363' }
      : key.privateKey,
  );
  if (invalidSignature) signature[0] ^= 1;
  return data + '.' + signature.toString('base64url');
}
try {
  await mf.ready;
  await check(
    'api-health',
    () => mf.dispatchFetch('https://api.test/healthz'),
    200,
  );
  await check(
    'api-ready-hold',
    () => mf.dispatchFetch('https://api.test/readyz'),
    503,
  );

  // Import the actual compiled public path, never duplicate a guessed contract.
  const { AUTHENTICATED_OFFICE_COMMAND_PATH } =
    await import('@econmind/core/authenticated-office-command-contract');

  const headers = {
    origin: 'https://world.econmind.group',
    authorization: 'Bearer TEST_ONLY.fixture',
    'content-type': 'application/json',
  };
  await check(
    'office-not-connected',
    () =>
      mf.dispatchFetch('https://api.test' + AUTHENTICATED_OFFICE_COMMAND_PATH, {
        method: 'POST',
        headers,
        body: '{}',
      }),
    503,
  );
  await check(
    'office-approved-preflight',
    () =>
      mf.dispatchFetch('https://api.test' + AUTHENTICATED_OFFICE_COMMAND_PATH, {
        method: 'OPTIONS',
        headers: {
          origin: headers.origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      }),
    204,
  );
  await check(
    'office-origin-denied',
    () =>
      mf.dispatchFetch('https://api.test' + AUTHENTICATED_OFFICE_COMMAND_PATH, {
        method: 'POST',
        headers: { ...headers, origin: 'https://unapproved.invalid' },
        body: '{}',
      }),
    403,
  );
  await check(
    'tick-not-mounted',
    () => mf.dispatchFetch('https://api.test/tick', { method: 'POST' }),
    405,
  );
  const auth = await mf.getWorker('TEST_ONLY_AUTH');
  for (const key of keys)
    await check(
      'workerd-' + key.alg,
      () =>
        auth.fetch('https://auth.test/', {
          headers: { authorization: 'Bearer ' + jwt(key) },
        }),
      200,
    );
  const es = keys[0];
  await check(
    'workerd-expired-jwt',
    () =>
      auth.fetch('https://auth.test/', {
        headers: {
          authorization:
            'Bearer ' +
            jwt(es, {
              exp: Math.floor(Date.now() / 1000) - 1,
              iat: Math.floor(Date.now() / 1000) - 100,
            }),
        },
      }),
    401,
  );
  await check(
    'workerd-wrong-issuer',
    () =>
      auth.fetch('https://auth.test/', {
        headers: {
          authorization:
            'Bearer ' + jwt(es, { iss: 'https://wrong.invalid/auth/v1' }),
        },
      }),
    401,
  );
  await check(
    'workerd-invalid-signature',
    () =>
      auth.fetch('https://auth.test/', {
        headers: { authorization: 'Bearer ' + jwt(es, {}, true) },
      }),
    401,
  );
} finally {
  await mf.dispose();
}
const hash = async (file) =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
const report = {
  schemaVersion: 'CLOUDFLARE_RUNTIME_LOCAL_V1',
  scope: 'LOCAL_WORKERD_TEST_ONLY_NO_PRODUCTION_AUTH_DB_OR_DEPLOY',
  observedAt: new Date().toISOString(),
  wrangler: wrangler.version,
  miniflare: miniflarePackage.version,
  bundles: { api: await hash(api), executor: await hash(executor) },
  checks,
  result: checks.every((c) => c.result === 'PASS') ? 'PASS' : 'FAIL',
  disposed: true,
};
await writeFile(
  path.join(output, 'workerd-local-evidence.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    result: report.result,
    checks: checks.length,
    failed: checks.filter((c) => c.result === 'FAIL'),
    scope: report.scope,
    disposed: report.disposed,
  }),
);
if (report.result !== 'PASS') process.exitCode = 1;
