/** New owned infrastructure controls, not the future three-function demo. */
import { chmod, lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createOwnedSocialOfficeDatabase } from '../support/f-social-office-isolated-host.js';
const native =
  process.env.ECONMIND_SOCIAL_OFFICE_NATIVE_TESTS === '1'
    ? describe
    : describe.skip;
native('F Social fixed role-pool preflight', () => {
  it('uses only the owned installer connection and closes cached pools once', async () => {
    const database = await createOwnedSocialOfficeDatabase();
    let closed = false;
    try {
      const [first, second] = await Promise.all([
        database.rolePool('installer'),
        database.rolePool('installer'),
      ]);
      expect(first).toBe(second);
      const row = (
        await first.query<{
          database: string;
          role: string;
          listen: string;
          schema: string | null;
        }>(
          "select current_database() as database,current_user as role,current_setting('listen_addresses') as listen,to_regnamespace('world_v2')::text as schema",
        )
      ).rows[0];
      expect(row).toEqual({
        database: database.marker.database,
        role: 'f_social_demo_bootstrap',
        listen: '',
        schema: null,
      });
      let calls = 0;
      const proxy = new Proxy(
        {},
        {
          get() {
            calls++;
            throw Error('must not read caller behavior');
          },
          ownKeys() {
            calls++;
            throw Error('must not read caller behavior');
          },
        },
      );
      for (const args of [[], ['foreign'], ['installer', '/foreign'], [proxy]])
        await expect(database.rolePool(...args)).rejects.toThrow(
          'SOCIAL_HOST_FIXED_ROLE_REQUIRED',
        );
      expect(calls).toBe(0);
      const closing = database.close();
      await expect(database.rolePool('installer')).rejects.toThrow(
        'SOCIAL_HOST_ROLE_POOL_CLOSED',
      );
      const cleanup = await closing;
      closed = true;
      expect(cleanup).toMatchObject({
        status: 'STOPPED',
        roleSessions: 0,
        pgStatus: 3,
      });
      await expect(database.rolePool('installer')).rejects.toThrow(
        'SOCIAL_HOST_ROLE_POOL_CLOSED',
      );
      await expect(
        lstat(path.join(database.marker.data, 'postmaster.pid')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      console.log(
        JSON.stringify({
          case: 'OWNED_INSTALLER_POOL_NO_WORLD_SQL',
          marker: database.marker,
          actual: row,
          cleanup,
        }),
      );
    } finally {
      if (!closed) await database.close();
    }
  }, 45_000);
});
native('F Social isolated host — actual owned PG16 empty fixture', () => {
  it('verifies actual private-socket identity and stops only its own server with no sessions', async () => {
    const database = await createOwnedSocialOfficeDatabase();
    let closed = false;
    try {
      const actual = await database.inspect();
      expect(actual).toMatchObject({
        listen: '',
        database: 'postgres',
        status: 'EMPTY_FIXTURE_NOT_READY',
        sourceAdmitted: false,
        productionAdmission: false,
        WorldClock: false,
      });
      expect(database.marker.database).toMatch(
        /^econmind_v09_f_social_demo_[a-f0-9]{32}$/u,
      );
      expect((await lstat(database.marker.root)).mode & 0o777).toBe(0o700);
      expect(
        (await lstat(path.join(database.marker.root, 'owned-postgres.json')))
          .mode & 0o777,
      ).toBe(0o600);
      console.log(
        JSON.stringify({
          case: 'OWNED_EMPTY_DATABASE_NOT_OFFICE_SUCCESS',
          marker: database.marker,
          actual,
        }),
      );
      const markerPath = path.join(database.marker.root, 'owned-postgres.json');
      await chmod(markerPath, 0o644);
      try {
        await expect(database.close()).rejects.toMatchObject({
          code: 'SOCIAL_HOST_CLEANUP_INCOMPLETE',
          cause: { code: 'SOCIAL_HOST_MARKER_CHANGED' },
        });
        expect(
          (
            await lstat(path.join(database.marker.data, 'postmaster.pid'))
          ).isFile(),
        ).toBe(true);
      } finally {
        await chmod(markerPath, 0o600);
      }
      const instance = JSON.parse(
        await readFile(
          path.join(database.marker.root, 'server-instance.json'),
          'utf8',
        ),
      );
      expect(instance.postmasterPID).toBe(actual.postmasterPID);
      const pidPath = path.join(database.marker.data, 'postmaster.pid');
      const originalPIDFile = await readFile(pidPath, 'utf8');
      const wrongPID = originalPIDFile.split('\n');
      wrongPID[0] = '2147483647'; // Positive sentinel; never queried/signalled.
      await writeFile(pidPath, wrongPID.join('\n'));
      try {
        await expect(database.close()).rejects.toMatchObject({
          code: 'SOCIAL_HOST_CLEANUP_INCOMPLETE',
          cause: { code: 'SOCIAL_HOST_PID_INSTANCE_MISMATCH' },
        });
        expect((await readFile(pidPath, 'utf8')).split('\n')[0]).toBe(
          '2147483647',
        );
        console.log(
          JSON.stringify({
            case: 'WRONG_CURRENT_PID_REFUSED_BEFORE_PROCESS_CONTROL',
            originalPostmaster: instance,
            foreignProcessTouched: false,
          }),
        );
      } finally {
        await writeFile(pidPath, originalPIDFile);
      }
      expect((await database.inspect()).postmasterPID).toBe(
        instance.postmasterPID,
      );
      // A deliberate new, verified cleanup attempt can recover; no automatic
      // retry or stop of a foreign target was made after the custody refusal.
      const closes = await Promise.all([database.close(), database.close()]);
      expect(closes[0]).toEqual(closes[1]);
      const cleanup = closes[0];
      closed = true;
      expect(cleanup).toMatchObject({
        status: 'STOPPED',
        roleSessions: 0,
        pgStatus: 3,
      });
      await expect(
        lstat(path.join(database.marker.data, 'postmaster.pid')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      const raw = JSON.parse(
        await readFile(path.join(database.marker.root, 'cleanup.json'), 'utf8'),
      );
      expect(raw).toEqual(cleanup);
      expect(await database.close()).toMatchObject({
        status: 'ALREADY_STOPPED',
      });
      await expect(database.inspect()).rejects.toThrow(
        'SOCIAL_HOST_DATABASE_SCOPE_CLOSED',
      );
      console.log(JSON.stringify({ cleanup }));
    } finally {
      if (!closed) await database.close();
    }
  }, 45_000);
});
