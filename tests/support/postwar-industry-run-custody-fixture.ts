/** Shared TEST_ONLY signed admission and real low-role metadata fixture.
 * No private Social/E03 source brand or successful work is manufactured. */
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { installPostwarNarrowTradeCutoffFixture } from './postwar-narrow-trade-cutoff-fixture.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const read = (path: string) =>
  readFile(new URL('../../database/' + path, import.meta.url), 'utf8');
export async function createPostwarIndustryRunCustodyFixture() {
  const reader = 'world_v2_industry_source_reader',
    worker = 'WORKER_TEST_ONLY_RUN';
  const db = new PGlite();
  const f = await installPostwarNarrowTradeCutoffFixture(db);
  await db.exec(
    await read('migrations/artifacts/0005_world_v2_writer_lease_fencing.sql'),
  );
  await db.exec(await read('proposals/postwar-industry-production-source.sql'));
  await db.exec(await read('proposals/postwar-industry-intake-binding.sql'));
  await db.exec(await read('proposals/postwar-industry-run-custody.sql'));
  await db.exec(`grant ${reader} to ${f.readerRole}`);
  await db.query(
    'update world_v2.current_commit_authorization set active=false where world_id=$1',
    [f.world],
  );
  await db.query(
    "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'INDUSTRY','INDUSTRY_PRODUCTION',$4,$5,true,now())",
    [f.world, f.subject, f.seller, f.team, f.revision],
  );
  const seats = await db.query<{ seat_ref: string }>(
    "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,'INDUSTRY',$4,$5)returning seat_ref",
    [f.world, f.subject, f.seller, f.team, f.revision],
  );
  const seat = seats.rows[0]!.seat_ref;
  await db.query(
    "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,$4,true,now(),null)",
    [
      f.world,
      f.subject,
      'OFFICE_' +
        Buffer.from(f.seller).toString('hex').toUpperCase() +
        '_494E445553545259',
      f.revision,
    ],
  );
  const now = Date.now(),
    at = new Date(now).toISOString(),
    acquired = new Date(now - 60000).toISOString(),
    expiry = new Date(now + 3600000).toISOString();
  await db.query(
    'insert into world_v2.world_writer_lease values($1,$2,1,$3,$3,$4)',
    [f.world, worker, acquired, expiry],
  );
  const params: unknown[] = [f.world, f.seller, f.subject, worker, '0', at];
  async function begin(
    options: { readOnly?: boolean; role?: string; isolation?: string } = {},
  ) {
    await f.reset();
    await db.exec('set session authorization ' + f.readerRole);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      f.subject,
    ]);
    await db.exec(
      'begin isolation level ' +
        (options.isolation ?? 'repeatable read') +
        (options.readOnly ? ' read only' : ''),
    );
    if (options.role !== 'BASE')
      await db.exec('set local role ' + (options.role ?? reader));
  }
  const tx: SqlExecutor = {
    async query<Row extends object>(q: string, p: readonly unknown[] = []) {
      const r = await db.query<Row>(q, [...p]);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
  return {
    classification: 'TEST_ONLY_METADATA_NOT_ECONOMIC_EXECUTION' as const,
    db,
    f,
    params,
    seat,
    begin,
    tx,
    world: f.world,
    countryId: f.seller,
    subject: f.subject,
    worker,
    readerRole: reader,
    at: String(params[5]),
    async close() {
      await f.reset();
      await db.close();
    },
  };
}
