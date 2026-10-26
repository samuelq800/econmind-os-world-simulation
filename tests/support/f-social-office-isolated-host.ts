/** PREPARATION_ONLY_NOT_V09_2_STARTED. Disposable host engineering only. */
import { execFile } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { createSupabaseJwksSignatureVerifier } from '../../apps/world-api/src/integration/supabase-jwks-signature-verifier.js';
import { verifySupabaseJwtClaims } from '../../apps/world-api/src/integration/identity.js';

const run = promisify(execFile);
const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
const CHILD_ENV = Object.freeze({
  PATH: '/usr/bin:/bin',
  LANG: 'C',
  LC_ALL: 'C',
});
const PG_VERSION = '16.15';
const PG_PORT = 6543; // Unique private Unix directory, no TCP listener.
const BOOTSTRAP = 'f_social_demo_bootstrap';
const MARKER = 'owned-postgres.json';
export const ISOLATED_SOCIAL_CLASSIFICATION = Object.freeze({
  runtimeClass: 'ISOLATED_SIMULATED' as const,
  sourceClass: 'SIMULATED_OPENING' as const,
  sourceAdmitted: false as const,
  genuineIdentity: false as const,
  productionAdmission: false as const,
  WorldClock: false as const,
});
export const ISOLATED_SOCIAL_HOST_LIMITS = Object.freeze({
  bodyBytes: 65_536,
  headerTimeoutMs: 5_000,
  requestTimeoutMs: 10_000,
  responseBytes: 1_048_576,
  inFlightRequests: 2,
});
export class IsolatedSocialHostError extends Error {
  readonly code: string;
  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'IsolatedSocialHostError';
    this.code = code;
  }
}
function demand(condition: unknown, code: string): asserts condition {
  if (!condition) throw new IsolatedSocialHostError(code);
}

/** Pure configuration inspection is not a source/identity grant. */
export function assertIsolatedSocialOfficeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
) {
  demand(process.versions.node === '24.20.0', 'SOCIAL_HOST_NODE_PIN_REQUIRED');
  demand(
    ['local', 'ci'].includes(env.ECONMIND_ENV ?? ''),
    'SOCIAL_HOST_LOCAL_CI_REQUIRED',
  );
  demand(
    env.ECONMIND_SOCIAL_OFFICE_DEMO === '1',
    'SOCIAL_HOST_EXPLICIT_OPT_IN_REQUIRED',
  );
  for (const key of Object.keys(env)) {
    if (
      /^(?:DATABASE_URL|PGHOST|PGHOSTADDR|PGPORT|PGDATABASE|PGUSER|PGPASSWORD|PGSERVICE|PGSERVICEFILE|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_URL|VITE_SUPABASE_SERVICE_ROLE_KEY)$/u.test(
        key,
      )
    )
      demand(!env[key], 'SOCIAL_HOST_EXTERNAL_DATABASE_ENV_REFUSED');
  }
  demand(
    typeof process.getuid === 'function' && process.getuid() !== 0,
    'SOCIAL_HOST_OWNED_NONROOT_REQUIRED',
  );
  demand(
    ['darwin', 'linux'].includes(process.platform),
    'SOCIAL_HOST_PLATFORM_REFUSED',
  );
}

/** Actual crypto with a fixed TEST_ONLY identity. No public arbitrary mint. */
export function createIsolatedSocialOfficeIdentity(input?: unknown) {
  demand(input === undefined, 'SOCIAL_HOST_NO_IDENTITY_ARGUMENTS');
  const projectRef = 'ssssssssssssssssssss';
  const expectedIssuer = `https://${projectRef}.supabase.co/auth/v1`;
  const jwksUrl = expectedIssuer + '/.well-known/jwks.json';
  const subject = '7f1c4f94-75b4-4876-a741-50bd31e14b21';
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const kid = 'isolated_' + randomUUID().replaceAll('-', '');
  const jwks = JSON.stringify({
    keys: [
      {
        ...pair.publicKey.export({ format: 'jwk' }),
        kid,
        alg: 'ES256',
        use: 'sig',
        key_ops: ['verify'],
      },
    ],
  });
  let fetchCount = 0;
  const fetch: typeof globalThis.fetch = async (resource, init) => {
    const url =
      typeof resource === 'string'
        ? resource
        : resource instanceof URL
          ? resource.href
          : resource.url;
    demand(
      url === jwksUrl && (!init?.method || init.method === 'GET'),
      'SOCIAL_HOST_NONLOCAL_JWKS_FETCH_REFUSED',
    );
    demand(!init?.signal?.aborted, 'SOCIAL_HOST_JWKS_CANCELLED');
    fetchCount++;
    const response = new Response(jwks, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    // This fixed in-memory fetch port supplies the exact response metadata
    // required by the unchanged verifier; it is not an actual HTTPS fetch.
    Object.defineProperty(response, 'url', { value: jwksUrl });
    return response;
  };
  const config = Object.freeze({
    projectRef,
    expectedIssuer,
    jwksUrl,
    audience: 'authenticated',
    fetch,
  });
  const verifier = createSupabaseJwksSignatureVerifier(config);
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: subject,
      iss: expectedIssuer,
      aud: 'authenticated',
      iat: issuedAt,
      exp: issuedAt + 600,
      role: 'authenticated',
    }),
  ).toString('base64url');
  const message = header + '.' + payload;
  const token =
    message +
    '.' +
    sign('sha256', Buffer.from(message), {
      key: pair.privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');
  return Object.freeze({
    ...ISOLATED_SOCIAL_CLASSIFICATION,
    subject,
    config,
    /** Server-to-fixed-session handoff only; never evidence, URL or disk. */
    authorization: 'Bearer ' + token,
    verify: async (authorization: string) => {
      demand(
        /^Bearer [A-Za-z0-9._-]+$/u.test(authorization),
        'SOCIAL_HOST_BEARER_REQUIRED',
      );
      return verifySupabaseJwtClaims({
        token: authorization.slice(7),
        verifier,
        policy: {
          expectedIssuer,
          expectedAudience: 'authenticated',
          nowEpochSeconds: Math.floor(Date.now() / 1000),
        },
      });
    },
    inspection: () =>
      Object.freeze({
        ...ISOLATED_SOCIAL_CLASSIFICATION,
        publicKeyCount: 1,
        fetchCount,
        networkFetches: 0,
        identityClass: 'EPHEMERAL_TEST_ONLY' as const,
      }),
  });
}

/** Remove secrets before any evidence serialization; this never changes HTTP data. */
export function redactIsolatedSocialEvidence(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const visit = (v: unknown, depth: number): unknown => {
    if (depth > 24) return '[DEPTH_LIMIT]';
    if (typeof v === 'string')
      return v
        .replace(/\bBearer\s+[A-Za-z0-9._~-]+/giu, '[REDACTED_BEARER]')
        .replace(
          /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
          '[REDACTED_JWT]',
        );
    if (v === null || typeof v === 'boolean' || typeof v === 'number') return v;
    if (typeof v !== 'object') return String(v);
    if (seen.has(v)) return '[CYCLE]';
    seen.add(v);
    if (Array.isArray(v)) return v.map((item) => visit(item, depth + 1));
    const result: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(v),
    )) {
      if (!Object.hasOwn(descriptor, 'value'))
        result[key] = '[ACCESSOR_NOT_READ]';
      else if (
        /authorization|token|password|private.?key|secret|cookie/iu.test(key)
      )
        result[key] = '[REDACTED]';
      else result[key] = visit(descriptor.value, depth + 1);
    }
    return result;
  };
  return visit(value, 0);
}

interface OwnedMarker {
  readonly schemaVersion: 'F_SOCIAL_OFFICE_OWNED_PG16_V1';
  readonly uid: number;
  readonly root: string;
  readonly data: string;
  readonly socket: string;
  readonly port: number;
  readonly database: string;
  readonly bin: string;
  readonly versions: Readonly<Record<string, string>>;
  readonly sourceClass: 'SIMULATED_OPENING';
  readonly codeBinding: Readonly<{
    phase: 'INFRASTRUCTURE_ONLY_NO_DOMAIN_BINDINGS';
    workspace: string;
    head: string;
    tree: string;
    status: string;
    sources: readonly Readonly<{
      path: string;
      bytes: number;
      sha256: string;
    }>[];
  }>;
}
interface NativeServerInstance {
  readonly postmasterPID: string;
  readonly pidFileEpoch: string;
  readonly ownerUID: string;
  readonly osStart: string;
  readonly postgresStartEpoch: string;
}
async function pidFields(marker: OwnedMarker) {
  await ownedDirectory(marker.data, marker.uid);
  const file = await open(
    path.join(marker.data, 'postmaster.pid'),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const s = await file.stat();
    demand(
      s.isFile() &&
        s.uid === marker.uid &&
        s.nlink === 1 &&
        (s.mode & 0o022) === 0,
      'SOCIAL_HOST_PID_CUSTODY',
    );
    const fields = (await file.readFile('utf8')).split('\n');
    demand(
      /^[1-9][0-9]*$/u.test(fields[0] ?? '') &&
        /^[1-9][0-9]*$/u.test(fields[2] ?? '') &&
        fields[1] === marker.data &&
        fields[3] === String(marker.port) &&
        fields[4] === marker.socket,
      'SOCIAL_HOST_PID_IDENTITY',
    );
    return { pid: fields[0]!, epoch: fields[2]! };
  } finally {
    await file.close();
  }
}
async function osIdentity(pid: string) {
  demand(/^[1-9][0-9]*$/u.test(pid), 'SOCIAL_HOST_EXPECTED_PID_REQUIRED');
  const result = await run(
    '/bin/ps',
    ['-p', pid, '-o', 'uid=', '-o', 'lstart='],
    { env: CHILD_ENV, timeout: 5_000 },
  );
  const [uid, ...start] = result.stdout.trim().split(/\s+/u);
  demand(
    uid && /^[0-9]+$/u.test(uid) && start.length >= 5,
    'SOCIAL_HOST_PROCESS_IDENTITY_UNAVAILABLE',
  );
  return { uid, start: start.join(' ') };
}
async function hostCodeBinding(): Promise<OwnedMarker['codeBinding']> {
  const core = await realpath(
    fileURLToPath(import.meta.resolve('@econmind/core')),
  );
  const workspace = path.resolve(path.dirname(core), '../../..');
  const ownModule = await realpath(fileURLToPath(import.meta.url));
  demand(
    core === path.join(workspace, 'packages/core/dist/index.js') &&
      (ownModule ===
        path.join(
          workspace,
          'tests/support/f-social-office-isolated-host.ts',
        ) ||
        ownModule.startsWith(
          path.join(workspace, 'node_modules/.cache/f-social-office-demo') +
            '/',
        )),
    'SOCIAL_HOST_FOREIGN_WORKSPACE_LINK',
  );
  const git = async (args: string[]) =>
    (
      await run('/usr/bin/git', ['--no-replace-objects', ...args], {
        cwd: workspace,
        env: CHILD_ENV,
        timeout: 5_000,
      })
    ).stdout.trim();
  const [head, tree, status] = await Promise.all([
    git(['rev-parse', 'HEAD']),
    git(['rev-parse', 'HEAD^{tree}']),
    git(['status', '--porcelain']),
  ]);
  const sources = await Promise.all(
    [
      'tests/support/f-social-office-isolated-host.ts',
      'tests/support/tsconfig.f-social-office-isolated-host.json',
      'tests/world-core/f-social-office-isolated-host.test.ts',
      'tests/integration/f-social-office-isolated-host-postgres.test.ts',
      'tools/social-office-demo/build-host.mjs',
      'tools/social-office-demo/host.mjs',
    ].map(async (p) => {
      const bytes = await readFile(path.join(workspace, p));
      return Object.freeze({
        path: p,
        bytes: bytes.length,
        sha256: hash(bytes),
      });
    }),
  );
  return Object.freeze({
    phase: 'INFRASTRUCTURE_ONLY_NO_DOMAIN_BINDINGS',
    workspace,
    head,
    tree,
    status,
    sources: Object.freeze(sources),
  });
}
async function ownedDirectory(
  location: string,
  uid: number,
  privateMode = true,
) {
  const s = await lstat(location);
  demand(
    s.isDirectory() &&
      !s.isSymbolicLink() &&
      s.uid === uid &&
      (await realpath(location)) === location &&
      (s.mode & 0o022) === 0 &&
      (!privateMode || (s.mode & 0o777) === 0o700),
    'SOCIAL_HOST_DIRECTORY_CUSTODY',
  );
}
async function tools(uid: number) {
  const configured =
    process.platform === 'darwin'
      ? '/opt/homebrew/opt/postgresql@16/bin'
      : '/usr/lib/postgresql/16/bin';
  const bin = await realpath(configured);
  demand(
    process.platform === 'darwin'
      ? bin === '/opt/homebrew/Cellar/postgresql@16/16.15/bin'
      : bin === configured,
    'SOCIAL_HOST_PG_BINARY_LOCATION',
  );
  const versions: Record<string, string> = {};
  for (const name of ['postgres', 'initdb', 'pg_ctl', 'createdb']) {
    const executable = path.join(bin, name),
      s = await lstat(executable);
    demand(
      s.isFile() &&
        !s.isSymbolicLink() &&
        [0, ...(process.platform === 'darwin' ? [uid] : [])].includes(s.uid) &&
        (s.mode & 0o022) === 0 &&
        (s.mode & 0o111) !== 0,
      'SOCIAL_HOST_PG_EXECUTABLE_CUSTODY',
    );
    const { stdout } = await run(executable, ['--version'], {
      env: CHILD_ENV,
      timeout: 5_000,
    });
    versions[name] = stdout.trim();
    demand(
      versions[name]!.includes(`(PostgreSQL) ${PG_VERSION}`),
      'SOCIAL_HOST_PG_VERSION',
    );
  }
  return { bin, versions };
}

/** Marker validation is ownership only, never an economic/source authority. */
async function assertMarker(
  marker: OwnedMarker,
  original: string,
  checkPID: boolean,
  instance?: NativeServerInstance,
) {
  demand(
    process.getuid?.() === marker.uid &&
      marker.sourceClass === 'SIMULATED_OPENING',
    'SOCIAL_HOST_FOREIGN_OWNER',
  );
  await ownedDirectory(marker.root, marker.uid);
  const file = await open(
    path.join(marker.root, MARKER),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const s = await file.stat();
    demand(
      s.isFile() &&
        s.uid === marker.uid &&
        s.nlink === 1 &&
        (s.mode & 0o777) === 0o600 &&
        hash(await file.readFile()) === hash(original),
      'SOCIAL_HOST_MARKER_CHANGED',
    );
  } finally {
    await file.close();
  }
  if (!checkPID) return;
  const current = await pidFields(marker);
  demand(
    instance &&
      current.pid === instance.postmasterPID &&
      current.epoch === instance.pidFileEpoch,
    'SOCIAL_HOST_PID_INSTANCE_MISMATCH',
  );
  // Never use a changed PID file as an OS-command target. Only the original
  // independently bound postmaster PID reaches this inspection or pg_ctl.
  const processIdentity = await osIdentity(instance.postmasterPID);
  demand(
    processIdentity.uid === instance.ownerUID &&
      processIdentity.uid === String(marker.uid) &&
      processIdentity.start === instance.osStart,
    'SOCIAL_HOST_PROCESS_INSTANCE_MISMATCH',
  );
}

/** Empty owned native infrastructure only. No schema, World, seat or source is
 * initialized until the separately frozen C/D/G composition is bound. */
export async function createOwnedSocialOfficeDatabase(input?: unknown) {
  demand(input === undefined, 'SOCIAL_HOST_NO_DATABASE_ARGUMENTS');
  assertIsolatedSocialOfficeEnvironment();
  const uid = process.getuid!(),
    verified = await tools(uid);
  const codeBinding = await hostCodeBinding();
  const temp = await realpath(tmpdir());
  demand(/^[A-Za-z0-9_./-]+$/u.test(temp), 'SOCIAL_HOST_SAFE_NATIVE_TEMP_PATH');
  const root = await mkdtemp(path.join(temp, 'econmind-f-social-demo-'));
  await chmod(root, 0o700);
  const marker: OwnedMarker = Object.freeze({
    schemaVersion: 'F_SOCIAL_OFFICE_OWNED_PG16_V1',
    uid,
    root,
    data: path.join(root, 'data'),
    socket: path.join(root, 'socket'),
    port: PG_PORT,
    database: 'econmind_v09_f_social_demo_' + randomUUID().replaceAll('-', ''),
    ...verified,
    sourceClass: 'SIMULATED_OPENING',
    codeBinding,
  });
  await mkdir(marker.socket, { mode: 0o700 });
  const original = JSON.stringify(marker, null, 2) + '\n';
  await writeFile(path.join(root, MARKER), original, {
    flag: 'wx',
    mode: 0o600,
  });
  const pools: Pool[] = [];
  let control: Pool | undefined,
    started = false,
    startRequested = false,
    closed = false;
  let instance: Readonly<NativeServerInstance> | undefined;
  let bindingAttempted = false;
  const pool = (database: string) =>
    new Pool({
      host: marker.socket,
      port: PG_PORT,
      user: BOOTSTRAP,
      database,
      max: 2,
      options: '-c lock_timeout=2000 -c statement_timeout=10000',
      connectionTimeoutMillis: 3_000,
    });
  const nativeRow = async () => {
    const result = await control!.query<{
      data: string;
      listen: string;
      database: string;
      version: string;
      backend_pid: string;
      postmaster_start_epoch: string;
    }>(
      "select current_setting('data_directory') as data,current_setting('listen_addresses') as listen,current_database() as database,current_setting('server_version') as version,pg_backend_pid()::text as backend_pid,extract(epoch from pg_postmaster_start_time())::text as postmaster_start_epoch",
    );
    const row = result.rows[0];
    demand(
      row?.data === marker.data &&
        row.listen === '' &&
        row.database === 'postgres' &&
        row.version.startsWith(PG_VERSION),
      'SOCIAL_HOST_NATIVE_IDENTITY',
    );
    return row;
  };
  const bindInstance = async () => {
    if (instance) return;
    demand(!bindingAttempted, 'SOCIAL_HOST_SERVER_INSTANCE_NOT_VERIFIED');
    bindingAttempted = true;
    await assertMarker(marker, original, false);
    const current = await pidFields(marker);
    control ??= pool('postgres');
    const row = await nativeRow();
    demand(
      /^[1-9][0-9]*$/u.test(row.backend_pid),
      'SOCIAL_HOST_BACKEND_PID_REQUIRED',
    );
    const backend = await run(
      '/bin/ps',
      ['-p', row.backend_pid, '-o', 'ppid=', '-o', 'uid='],
      { env: CHILD_ENV, timeout: 5_000 },
    );
    const [actualParent, actualUID] = backend.stdout.trim().split(/\s+/u);
    demand(
      actualParent === current.pid && actualUID === String(marker.uid),
      'SOCIAL_HOST_ACTUAL_POSTMASTER_PARENT_MISMATCH',
    );
    const processIdentity = await osIdentity(current.pid);
    demand(
      processIdentity.uid === String(marker.uid),
      'SOCIAL_HOST_ACTUAL_POSTMASTER_OWNER_MISMATCH',
    );
    instance = Object.freeze({
      postmasterPID: current.pid,
      pidFileEpoch: current.epoch,
      ownerUID: processIdentity.uid,
      osStart: processIdentity.start,
      postgresStartEpoch: row.postmaster_start_epoch,
    });
    await assertMarker(marker, original, true, instance);
    await writeFile(
      path.join(root, 'server-instance.json'),
      JSON.stringify(instance, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  };
  const native = async () => {
    demand(!closed && started && instance, 'SOCIAL_HOST_DATABASE_SCOPE_CLOSED');
    await assertMarker(marker, original, true, instance);
    const row = await nativeRow();
    demand(
      row.postmaster_start_epoch === instance.postgresStartEpoch,
      'SOCIAL_HOST_POSTGRES_INSTANCE_CHANGED',
    );
    return Object.freeze({
      ...ISOLATED_SOCIAL_CLASSIFICATION,
      ...row,
      ownedDatabase: marker.database,
      status: 'EMPTY_FIXTURE_NOT_READY' as const,
      postmasterPID: instance.postmasterPID,
    });
  };
  const performClose = async () => {
    if (closed)
      return Object.freeze({ status: 'ALREADY_STOPPED' as const, root });
    try {
      await Promise.all(pools.splice(0).map((p) => p.end()));
      await assertMarker(marker, original, false);
      const hasPIDFile =
        startRequested &&
        (await lstat(path.join(marker.data, 'postmaster.pid')).then(
          () => true,
          () => false,
        ));
      if (hasPIDFile) {
        // A failed pg_ctl start may have created a server. Bind it through the
        // fixed native connection and OS parent only once, or refuse control.
        await bindInstance();
        await assertMarker(marker, original, true, instance);
      }
      let roleSessions: number | null = null;
      if (control) {
        if (instance)
          demand(
            (await nativeRow()).postmaster_start_epoch ===
              instance.postgresStartEpoch,
            'SOCIAL_HOST_POSTGRES_INSTANCE_CHANGED',
          );
        roleSessions = Number(
          (
            await control.query<{ count: string }>(
              'select count(*)::text as count from pg_catalog.pg_stat_activity where datname=$1',
              [marker.database],
            )
          ).rows[0]!.count,
        );
        await control.end();
        control = undefined;
        demand(roleSessions === 0, 'SOCIAL_HOST_SESSIONS_REMAIN');
      }
      if (startRequested) {
        const pidPresent = await lstat(
          path.join(marker.data, 'postmaster.pid'),
        ).then(
          () => true,
          () => false,
        );
        if (pidPresent) {
          await assertMarker(marker, original, true, instance);
          await run(
            path.join(marker.bin, 'pg_ctl'),
            ['-D', marker.data, '-m', 'fast', '-w', '-t', '30', 'stop'],
            { env: CHILD_ENV, timeout: 35_000 },
          );
        }
        const status = await run(
          path.join(marker.bin, 'pg_ctl'),
          ['-D', marker.data, 'status'],
          { env: CHILD_ENV, timeout: 5_000 },
        ).then(
          () => 0,
          (e: unknown) => Number((e as { code?: unknown }).code),
        );
        demand(
          status === 3 &&
            !(await lstat(path.join(marker.data, 'postmaster.pid')).then(
              () => true,
              () => false,
            )),
          'SOCIAL_HOST_STOP_NOT_CONFIRMED',
        );
      }
      const evidence = Object.freeze({
        ...ISOLATED_SOCIAL_CLASSIFICATION,
        status: 'STOPPED' as const,
        root,
        privateDataRetained: true,
        roleSessions,
        pgStatus: startRequested ? 3 : null,
      });
      await writeFile(
        path.join(root, 'cleanup.json'),
        JSON.stringify(evidence, null, 2) + '\n',
        { flag: 'wx', mode: 0o600 },
      );
      closed = true;
      started = false;
      return evidence;
    } catch (cause) {
      throw new IsolatedSocialHostError(
        'SOCIAL_HOST_CLEANUP_INCOMPLETE',
        cause,
      );
    }
  };
  let closing: ReturnType<typeof performClose> | undefined;
  const close = () => {
    if (closing) return closing;
    const operation = performClose();
    closing = operation;
    void operation
      .finally(() => {
        if (closing === operation) closing = undefined;
      })
      .catch(() => undefined);
    return operation;
  };
  try {
    await assertMarker(marker, original, false);
    await run(
      path.join(marker.bin, 'initdb'),
      [
        '-D',
        marker.data,
        '-U',
        BOOTSTRAP,
        '--no-locale',
        '--encoding=UTF8',
        '--auth-local=trust',
        '--auth-host=reject',
      ],
      { env: CHILD_ENV, timeout: 30_000 },
    );
    startRequested = true;
    await run(
      path.join(marker.bin, 'pg_ctl'),
      [
        '-D',
        marker.data,
        '-l',
        path.join(root, 'server.log'),
        '-o',
        `-k ${marker.socket} -p ${PG_PORT} -c listen_addresses=''`,
        '-w',
        '-t',
        '30',
        'start',
      ],
      { env: CHILD_ENV, timeout: 35_000 },
    );
    started = true;
    await bindInstance();
    await native();
    demand(control, 'SOCIAL_HOST_VERIFIED_CONTROL_REQUIRED');
    await control.query(`create database ${marker.database}`);
    const bootstrapPool = pool(marker.database);
    pools.push(bootstrapPool);
    demand(
      (
        await bootstrapPool.query<{ schema: string | null }>(
          "select to_regnamespace('world_v2')::text as schema",
        )
      ).rows[0]?.schema === null,
      'SOCIAL_HOST_REQUIRES_EMPTY_DATABASE',
    );
    return Object.freeze({
      ...ISOLATED_SOCIAL_CLASSIFICATION,
      marker,
      inspect: native,
      close,
    });
  } catch (cause) {
    try {
      await close();
    } catch (cleanup) {
      throw new AggregateError(
        [cause, cleanup],
        'SOCIAL_HOST_START_FAILED_CLEANUP_INCOMPLETE',
        { cause: cleanup },
      );
    }
    throw cause;
  }
}

/** Infrastructure probe only: no domain handler/callback, no false READY.
 * G owns the future exact req/res body and business routes. */
export async function startIsolatedSocialOfficeTransportProbe(input?: unknown) {
  demand(input === undefined, 'SOCIAL_HOST_NO_LISTENER_ARGUMENTS');
  assertIsolatedSocialOfficeEnvironment();
  let origin = '',
    inFlight = 0;
  const server: Server = createServer((req, res) => {
    const headers = req.rawHeaders
      .filter((_, index) => index % 2 === 0)
      .map((s) => s.toLowerCase());
    const allowed =
      req.socket.remoteAddress === '127.0.0.1' &&
      headers.filter((s) => s === 'host').length === 1 &&
      req.headers.host === origin.slice('http://'.length);
    const status = !allowed
      ? 403
      : inFlight >= ISOLATED_SOCIAL_HOST_LIMITS.inFlightRequests
        ? 503
        : req.method !== 'GET' || req.url !== '/__social-office-demo/health'
          ? 404
          : 503;
    inFlight++;
    res.once('close', () => {
      inFlight--;
    });
    const body = JSON.stringify({
      ...ISOLATED_SOCIAL_CLASSIFICATION,
      status: 'NOT_READY',
      code:
        status === 403
          ? 'HOST_OR_PEER_DENIED'
          : status === 404
            ? 'ROUTE_NOT_MOUNTED'
            : 'DEPENDENT_COMPOSITION_NOT_BOUND',
      completeOffice: false,
    });
    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      connection: 'close',
    });
    res.end(body);
    req.resume();
  });
  server.headersTimeout = ISOLATED_SOCIAL_HOST_LIMITS.headerTimeoutMs;
  server.requestTimeout = ISOLATED_SOCIAL_HOST_LIMITS.requestTimeoutMs;
  server.maxConnections = 2;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  demand(
    address && typeof address !== 'string' && address.address === '127.0.0.1',
    'SOCIAL_HOST_LOOPBACK_BIND_REQUIRED',
  );
  origin = `http://127.0.0.1:${address.port}`;
  let closed = false;
  let closing: Promise<void> | undefined;
  return Object.freeze({
    ...ISOLATED_SOCIAL_CLASSIFICATION,
    origin,
    completeOffice: false as const,
    close: () => {
      if (closed) return Promise.resolve();
      if (closing) return closing;
      closing = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      })
        .then(() => {
          closed = true;
        })
        .finally(() => {
          closing = undefined;
        });
      return closing;
    },
  });
}
