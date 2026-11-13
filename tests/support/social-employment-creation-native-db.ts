/** Owned PG16.15 TEST_ONLY adapter. No DSN, published ports, real source,
 * existing World, credential or old checkpoint is accepted. Retains stopped
 * container/volume and a receipt, never claims recovery of the prior H3 DB. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import type { SocialEmploymentCreationTestDatabase } from './social-employment-creation-sql-fixture.js';
const exec = promisify(execFile);
const image =
  'postgres@sha256:1beaa3084eee2676f20a9cd9928f0bf2c5bf674f8e49f81017912183d377c61c';
export async function createSocialEmploymentCreationNativeDatabase() {
  assert.equal(process.env.ECONMIND_SOCIAL_ORDINAL_NATIVE, '1');
  const base = process.env.ECONMIND_SOCIAL_ORDINAL_EVIDENCE_DIR;
  assert(base && path.isAbsolute(base) && base.startsWith('/workspace/'));
  const nonce = randomUUID();
  const name = 'econmind-social-ordinal-' + nonce.slice(0, 8);
  const volume = name + '-data';
  const directory = path.join(base, nonce.slice(0, 8));
  const socket = path.join(directory, 'socket');
  await mkdir(socket, { recursive: true });
  await chmod(socket, 0o777);
  const report: Record<string, unknown> = {
    classification: 'NEW_TEST_ONLY_SMALL_SOURCE_NATIVE_NOT_RESTORED_H3',
    image,
    nonce,
    ownedContainer: name,
    ownedVolume: volume,
    directory,
    network: 'none',
    ports: [],
    WorldClockStarted: false,
    status: 'STARTING',
  };
  const save = () =>
    writeFile(
      path.join(directory, 'native-db.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  const docker = async (args: string[]) =>
    (await exec('docker', args, { maxBuffer: 4 * 1024 * 1024 })).stdout;
  let started = false;
  let client: Client | undefined;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    if (client) await client.end();
    if (started) {
      const inspected = JSON.parse(await docker(['inspect', name]))[0];
      assert.equal(
        inspected.Config.Labels['econmind.social.ordinal.nonce'],
        nonce,
      );
      await docker(['stop', '--time', '10', name]);
      const stopped = JSON.parse(await docker(['inspect', name]))[0];
      report.finalContainerState = {
        running: stopped.State.Running,
        exitCode: stopped.State.ExitCode,
        oomKilled: stopped.State.OOMKilled,
      };
      assert.equal(stopped.State.Running, false);
    }
    report.resourceState = 'RETAINED_STOPPED_TEST_ONLY';
    await save();
  };
  try {
    const inspected = JSON.parse(await docker(['image', 'inspect', image]))[0];
    assert(inspected.RepoDigests.includes(image));
    report.imageId = inspected.Id;
    await docker([
      'volume',
      'create',
      '--label',
      'econmind.social.ordinal.nonce=' + nonce,
      volume,
    ]);
    await docker([
      'run',
      '--detach',
      '--pull=never',
      '--name',
      name,
      '--label',
      'econmind.social.ordinal.nonce=' + nonce,
      '--network',
      'none',
      '--cpus',
      '1',
      '--memory',
      '512m',
      '--mount',
      `type=volume,src=${volume},dst=/var/lib/postgresql/data`,
      '--mount',
      `type=bind,src=${socket},dst=/var/run/postgresql`,
      '--env',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      image,
      'postgres',
      '-c',
      'listen_addresses=',
      '-c',
      'unix_socket_directories=/var/run/postgresql',
      '-c',
      'unix_socket_permissions=0777',
      '-c',
      'shared_buffers=16MB',
      '-c',
      'max_connections=12',
      '-c',
      'timezone=UTC',
    ]);
    started = true;
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const probe = new Client({
        host: socket,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        ssl: false,
        connectionTimeoutMillis: 1000,
      });
      try {
        await probe.connect();
        const version = await probe.query(
          "select current_setting('server_version_num') version",
        );
        assert.equal(version.rows[0].version, '160015');
        // Only use the final post-init postmaster, never the bootstrap server.
        const command = (
          await docker(['exec', name, 'cat', '/proc/1/comm'])
        ).trim();
        if (command !== 'postgres') {
          await probe.end();
        } else {
          client = probe;
          break;
        }
      } catch {
        await probe.end().catch(() => {});
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    assert(client, 'OWNED_POSTGRES_16_15_READY_REQUIRED');
    const inspect = JSON.parse(await docker(['inspect', name]))[0];
    assert.equal(inspect.HostConfig.NetworkMode, 'none');
    assert.deepEqual(inspect.HostConfig.PortBindings ?? {}, {});
    report.status = 'READY';
    report.serverVersion = '16.15';
    await save();
    const db: SocialEmploymentCreationTestDatabase = {
      async query<T>(sql: string, params: unknown[] = []) {
        const result = await client!.query(sql, params);
        return { rows: result.rows as T[] };
      },
      async exec(sql: string) {
        await client!.query(sql);
      },
      close,
    };
    return { db, report, directory, save };
  } catch (error) {
    report.status = 'FAILED';
    report.error = error instanceof Error ? error.message : String(error);
    await save();
    await close();
    throw error;
  }
}
