/** Credential-free G-INTAKE fixture only. A unique owned PG16.15 container,
 * private parent directory/UDS and no TCP or external network. No env DSN. */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';

const exec = promisify(execFile);
// Same already-cached official digest as the existing isolated native fixture.
const image =
  'postgres@sha256:1beaa3084eee2676f20a9cd9928f0bf2c5bf674f8e49f81017912183d377c61c';
const ownerLabel = 'econmind.g-intake.nonce';
const adminUser = 'g_test_only_cluster_admin';
const run = (args: string[]) =>
  exec('docker', args, { timeout: 20000, maxBuffer: 1048576 });

export async function startGOwnedPg16Cluster() {
  const nonce = randomUUID(),
    suffix = nonce.replaceAll('-', ''),
    container = 'econmind-g-intake-' + suffix,
    volume = 'econmind-g-intake-data-' + suffix,
    root = await mkdtemp('/tmp/g-intake-test-'),
    socket = join(root, 'socket'),
    port = 5448;
  await mkdir(socket);
  // The container's postgres UID differs from the host UID. The socket's
  // enclosing mkdtemp directory remains 0700 and no host port is published.
  await chmod(socket, 0o777);
  const admin = new Pool({
    host: socket,
    port,
    user: adminUser,
    database: 'postgres',
    max: 2,
    connectionTimeoutMillis: 1000,
  });
  const idleErrors: unknown[] = [];
  admin.on('error', (e) => idleErrors.push(e));
  let closed = false;
  async function removeOwned(kind: 'container' | 'volume', name: string) {
    let info: Record<string, unknown>;
    try {
      const result = await run([kind, 'inspect', name]);
      const values = JSON.parse(result.stdout) as Record<string, unknown>[];
      if (values.length !== 1) throw Error('G_INTAKE_OWNERSHIP_READBACK');
      info = values[0]!;
    } catch (e) {
      const stderr = (e as { stderr?: unknown }).stderr;
      if (
        typeof stderr === 'string' &&
        /No such (?:container|volume|object)/u.test(stderr)
      )
        return;
      throw e;
    }
    const labels = (
      kind === 'container'
        ? (info.Config as { Labels?: Record<string, string> })?.Labels
        : info.Labels
    ) as Record<string, string> | undefined;
    if (labels?.[ownerLabel] !== nonce)
      throw Error('G_INTAKE_RESOURCE_OWNERSHIP_MISMATCH');
    await run(
      kind === 'container'
        ? ['container', 'rm', '--force', name]
        : ['volume', 'rm', name],
    );
  }
  async function close() {
    if (closed) return;
    closed = true;
    const errors: unknown[] = [];
    try {
      await admin.end();
    } catch (e) {
      errors.push(e);
    }
    for (const [kind, name] of [
      ['container', container],
      ['volume', volume],
    ] as const) {
      try {
        await removeOwned(kind, name);
      } catch (e) {
        errors.push(e);
      }
    }
    if (!errors.length) await rm(root, { recursive: true, force: true });
    if (errors.length)
      throw new AggregateError(errors, 'G_INTAKE_OWNED_CLEANUP_UNCONFIRMED');
  }
  try {
    await run([
      'volume',
      'create',
      '--label',
      `${ownerLabel}=${nonce}`,
      volume,
    ]);
    await run([
      'run',
      '--detach',
      '--pull=never',
      '--name',
      container,
      '--label',
      `${ownerLabel}=${nonce}`,
      '--network',
      'none',
      '--cpus',
      '1',
      '--memory',
      '768m',
      '--read-only',
      '--mount',
      `type=volume,src=${volume},dst=/var/lib/postgresql/data`,
      '--mount',
      `type=bind,src=${socket},dst=/var/run/postgresql`,
      '--tmpfs',
      '/tmp:rw,nosuid,size=64m',
      '--env',
      `POSTGRES_USER=${adminUser}`,
      '--env',
      'POSTGRES_DB=postgres',
      '--env',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      '--env',
      'POSTGRES_INITDB_ARGS=--no-locale -E UTF8',
      image,
      'postgres',
      '-p',
      String(port),
      '-c',
      'listen_addresses=',
      '-c',
      'unix_socket_directories=/var/run/postgresql',
      '-c',
      'unix_socket_permissions=0777',
      '-c',
      'shared_buffers=64MB',
      '-c',
      'max_connections=64',
      '-c',
      'timezone=UTC',
    ]);
    const deadline = Date.now() + 20000;
    let ready = false;
    while (Date.now() < deadline) {
      const process = await run(['exec', container, 'cat', '/proc/1/comm']);
      if (process.stdout.trim() === 'postgres') {
        try {
          const row = (
            await admin.query(
              "select current_setting('server_version_num') version, current_setting('listen_addresses') listeners, current_user as principal",
            )
          ).rows[0];
          if (
            row?.version !== '160015' ||
            row.listeners !== '' ||
            row.principal !== adminUser
          )
            throw Error('G_INTAKE_EXACT_PRIVATE_PG16_REQUIRED');
          ready = true;
          break;
        } catch (e) {
          if (
            !['ENOENT', 'ECONNREFUSED', '57P03'].includes(
              String((e as { code?: unknown }).code),
            )
          )
            throw e;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw Error('G_INTAKE_OWNED_PG_STARTUP_TIMEOUT');
    // The image initially gives this bind mount a sticky bit and its own UID.
    // Restore the mode on our private socket directory so a forced container
    // exit cannot leave socket files that the host owner cannot remove.
    await run([
      'exec',
      '--user',
      '0',
      container,
      'chmod',
      '0777',
      '/var/run/postgresql',
    ]);
    return Object.freeze({
      admin,
      socket,
      port,
      close,
      ownership: Object.freeze({ container, volume, nonce, image }),
      assertHealthy() {
        if (idleErrors.length)
          throw new AggregateError(
            idleErrors,
            'G_INTAKE_IDLE_CONNECTION_FAILURE',
          );
      },
    });
  } catch (e) {
    try {
      await close();
    } catch (cleanup) {
      throw new AggregateError(
        [e, cleanup],
        'G_INTAKE_STARTUP_AND_CLEANUP_FAILED',
        { cause: cleanup },
      );
    }
    throw e;
  }
}
