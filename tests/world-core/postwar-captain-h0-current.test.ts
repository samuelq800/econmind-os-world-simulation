/** Actual embedded PostgreSQL, signed TEST_ONLY opening admission, fixed
 * original publisher and least-privilege reads. No native/production approval. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { startGOwnedPg16Cluster } from '../support/g-owned-pg16-cluster.js';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { installPostwarNarrowTradeCutoffFixture } from '../support/postwar-narrow-trade-cutoff-fixture.js';
import {
  loadAdoptedCaptainOpeningPolicy,
  createAdoptedCaptainOpeningCandidate,
} from '../../apps/world-worker/src/preparation/postwar-captain-opening-source.js';
import { createPostwarCaptainCurrentProjectionStore } from '../../apps/world-worker/src/persistence/postwar-captain-current-projection.js';
import { createPostwarCaptainOpeningCurrentPublisher } from '../../apps/world-worker/src/persistence/postwar-captain-current-publication.js';
import { canonicalSerialize } from '../../packages/core/src/serialization/canonical.js';
import { buildCaptainCapitalRequest } from '../../apps/world-web/src/captain-capital/form.js';
import { buildManualOfficeCommandIntent } from '../../apps/world-worker/src/intake/manual-office-command-intent.js';
import {
  parsePostwarCaptainCurrentCoverage,
  parsePostwarCaptainAllocationOptions,
  POSTWAR_CAPTAIN_OPENING_COVERAGE_SCHEMA,
} from '../../packages/core/src/read-models/postwar-captain-current-contract.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
const reader = 'test_captain_h0_reader',
  publisher = 'test_captain_h0_publisher';
const page =
  'select * from world_v2.read_postwar_captain_current_page($1,$2,$3,$4)';
const native = process.env.ECONMIND_CAPTAIN_H0_NATIVE === '1';
interface TestDatabase {
  exec(sql: string): Promise<unknown>;
  query<Row extends object = Record<string, unknown>>(
    sql: string,
    args?: unknown[],
  ): Promise<{ rows: Row[]; affectedRows?: number }>;
  close(): Promise<void>;
}
let actualReasonRef = '';
describe('actual Captain admitted-genesis H0 current publication and reads', () => {
  let db: TestDatabase,
    f: Awaited<ReturnType<typeof installPostwarNarrowTradeCutoffFixture>>,
    legacyBody: string,
    adoptionRef: string,
    parentRef: string;
  const executor: SqlExecutor = {
    async query<Row extends object>(
      sql: string,
      args: readonly unknown[] = [],
    ) {
      const r = await db.query<Row>(sql, [...args]);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
  const database: SqlDatabase = {
    query: executor.query,
    async transaction<T>(consume: (tx: SqlExecutor) => Promise<T>) {
      await db.exec('begin');
      try {
        const value = await consume(executor);
        await db.exec('commit');
        return value;
      } catch (e) {
        await db.exec('rollback');
        throw e;
      }
    },
  };
  async function admin() {
    await f.reset();
  }
  async function asReader(subject?: string) {
    await admin();
    await db.exec('set session authorization ' + reader);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      subject ?? f.subject,
    ]);
    await db.exec('begin isolation level repeatable read read only');
  }
  async function asPublisher() {
    await admin();
    await db.exec('set session authorization ' + publisher);
  }
  beforeAll(async () => {
    if (native) {
      const cluster = await startGOwnedPg16Cluster();
      try {
        const client = await cluster.admin.connect(),
          admin = (
            await client.query<{ name: string }>('select current_user as name')
          ).rows[0]!.name;
        // The existing small fixture names its setup administrator "postgres".
        // This owned cluster deliberately uses another administrator name.
        // Only that exact TEST_ONLY reset literal is adapted; online roles,
        // JWT scope, functions, policies and all economic SQL stay verbatim.
        const statement = (sql: string) =>
          sql.replaceAll(
            'set session authorization postgres',
            'set session authorization "' + admin + '"',
          );
        db = {
          async exec(sql) {
            await client.query(statement(sql));
          },
          async query<Row extends object>(sql: string, args: unknown[] = []) {
            const r = await client.query<Row>(statement(sql), args);
            return { rows: r.rows, affectedRows: r.rowCount ?? 0 };
          },
          async close() {
            client.release();
            await cluster.close();
            cluster.assertHealthy();
          },
        };
      } catch (e) {
        await cluster.close();
        throw e;
      }
    } else db = new PGlite();
    f = await installPostwarNarrowTradeCutoffFixture(db);
    // Actual immutable H0 parent was derived by the fixture's real fixed
    // publisher from its stored small Core seed, not manually labelled rows.
    parentRef = (
      await db.query<{ document_ref: string }>(
        'select document_ref from world_v2.postwar_office_projection_document where world_id=$1',
        [f.world],
      )
    ).rows[0]!.document_ref;
    for (const p of [
      'database/migrations/artifacts/0005_world_v2_writer_lease_fencing.sql',
      'database/proposals/captain-operating-custody.sql',
      'database/proposals/postwar-captain-source-publication.sql',
      'database/proposals/postwar-social-current-derived-read.sql',
      'database/proposals/postwar-social-current-prefix-read.sql',
      'database/proposals/postwar-mixed-current-projection-read.sql',
      'database/proposals/postwar-captain-current-derived-read.sql',
    ])
      await db.exec(await read(p));
    legacyBody = (
      await db.query<{ prosrc: string }>(
        "select prosrc from pg_proc where oid='world_v2.read_postwar_captain_current_page(text,integer,integer,text)'::regprocedure",
      )
    ).rows[0]!.prosrc;
    await db.exec(
      await read('database/proposals/postwar-captain-h0-current.sql'),
    );
    await db.exec(
      `create role ${reader} login nosuperuser nobypassrls nocreatedb nocreaterole;create role ${publisher} login nosuperuser nobypassrls nocreatedb nocreaterole;grant world_v2_postwar_projection_reader to ${reader};grant world_v2_postwar_projection_publisher to ${publisher}`,
    );
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'CAPTAIN','CAPTAIN_CABINET',$4,$5,true,now())",
      [f.world, f.subject, f.seller, f.team, f.revision],
    );
    await db.query(
      "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,'CAPTAIN',$4,$5)",
      [f.world, f.subject, f.seller, f.team, f.revision],
    );
    await db.query(
      "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,$4,true,now(),null)",
      [
        f.world,
        f.subject,
        'OFFICE_' +
          Buffer.from(f.seller).toString('hex').toUpperCase() +
          '_4341505441494E',
        f.revision,
      ],
    );
    const policy = await loadAdoptedCaptainOpeningPolicy(
        new URL('../../', import.meta.url).pathname,
      ),
      candidate = createAdoptedCaptainOpeningCandidate(policy, {
        worldId: f.world,
        seedId: f.seed.seedId,
        seedFingerprint: f.seed.fingerprint,
        worldAdmissionRef: f.admissionRef,
        countryIds: Array.from(
          { length: 70 },
          (_, i) => 'COUNTRY_' + String(i + 1).padStart(2, '0'),
        ),
      }),
      packet = candidate.packets.find(
        (p) => p.adoption.countryId === f.seller,
      )!;
    adoptionRef = packet.adoption.adoptionRef;
    actualReasonRef = packet.reasons[0]!.factRef;
    const text = canonicalSerialize(packet),
      crypto = await import('node:crypto'),
      sha = crypto.createHash('sha256').update(text).digest('hex');
    await db.exec('set role world_v2_admission_release');
    await db.query(
      'select world_v2.register_captain_source_publication($1,$2)',
      [text, sha],
    );
    await db.query(
      'select * from world_v2.publish_captain_operating_source($1,$2)',
      [text, sha],
    );
    await db.exec('reset role');
    // Real reviewed fence, installed last so all actual revocation tables and
    // authorization triggers participate. No substitute admission/header RPC.
    await db.exec(
      await read('database/proposals/postwar-source-revocation-fence.sql'),
    );
  }, 60000);
  afterEach(admin);
  afterAll(async () => {
    await db?.close();
  });
  it('publishes actual approved 70=7x10 genesis at real H0 with zero events/journals, exact idempotency and no raw reader privileges', async () => {
    await asReader();
    expect(
      (await db.query<{ status: string }>(page, [f.world, 0, 25, null])).rows[0]
        ?.status,
    ).toBe('UNAVAILABLE');
    await asPublisher();
    const p = createPostwarCaptainOpeningCurrentPublisher({
        worldId: f.world,
        publicationDatabase: database,
      }),
      first = await p.publishCountry(f.seller),
      second = await p.publishCountry(f.seller);
    expect(second).toEqual(first);
    expect(first.seedFingerprint).toBe(f.seed.fingerprint);
    expect(first.admissionRef).toBe(f.admissionRef);
    expect(first.rows).toHaveLength(7);
    expect(first.rows.map((r) => r.balance)).toEqual(Array(7).fill('10'));
    expect(
      first.rows.every(
        (r) =>
          r.opening === '70' &&
          r.total === '70' &&
          r.closing === '70' &&
          r.generated === '0' &&
          r.spent === '0',
      ),
    ).toBe(true);
    expect(first.coverage).toMatchObject({
      schemaVersion: POSTWAR_CAPTAIN_OPENING_COVERAGE_SCHEMA,
      globalWorldVersion: '0',
      globalEventSequence: '0',
      coveredThroughEventId: null,
      coveredThroughEventFingerprint: null,
    });
    await asReader();
    const store = createPostwarCaptainCurrentProjectionStore({
        runtimeReaderRole: reader,
        authorizationPublisherRole: publisher,
      }),
      r = await store.readPageFrom(executor, { worldId: f.world });
    expect(r.status).toBe('PAGE');
    if (r.status !== 'PAGE') throw Error('ACTUAL_H0_PAGE_REQUIRED');
    expect(r.source.dataNature).toBe(
      'ADMITTED_OPENING_POLITICAL_CAPITAL_GENESIS',
    );
    expect(r.rows).toEqual(first.rows);
    const options = parsePostwarCaptainAllocationOptions(
      r.source.currentCaptainAllocationOptions,
    );
    expect(options.countryId).toBe(f.seller);
    expect(options.originalPacketSha256).toBe(
      r.source.currentCaptainCoverage.originalPacketSha256,
    );
    expect(options.reasons.map((x) => x.factRef)).toEqual([actualReasonRef]);
    const request = buildCaptainCapitalRequest({
      rows: r.rows,
      options,
      coverage: r.source.currentCaptainCoverage,
      draft: {
        fromBucket: 'UNALLOCATED_CRISIS_RESERVE',
        toBucket: 'FISCAL_REFORM',
        amount: '2.5',
        reasonFactRef: actualReasonRef,
      },
      worldId: f.world,
      countryId: f.seller,
      worldVersion: '0',
      eventSequence: '0',
      requestId: '11111111-1111-4111-8111-111111111111',
      commandId: 'COMMAND_ACTUAL_CAPTAIN_FORM',
      idempotencyKey: 'KEY_ACTUAL_CAPTAIN_FORM',
    });
    const command = buildManualOfficeCommandIntent({
      request: request.request,
      countryId: f.seller,
      officeId: 'CAPTAIN',
      authSubject: f.subject,
      actor: 'ACTOR_TEST_ONLY_CAPTAIN_FORM',
      simTime: '0',
      submittedAtReal: new Date().toISOString(),
      correlationId: 'CORRELATION_ACTUAL_CAPTAIN_FORM',
    });
    expect(JSON.parse(command.canonicalPayload)).toEqual({
      schemaVersion: 'captain-political-capital-allocation-v1',
      fromBucket: 'UNALLOCATED_CRISIS_RESERVE',
      toBucket: 'FISCAL_REFORM',
      amount: { amount: '2.5', unit: 'political_capital' },
      reasonFactRef: actualReasonRef,
    });
    expect(command.expectedWorldVersion).toBe('0');
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege(current_user,'world_v2.postwar_captain_allocation_options(jsonb,text)','EXECUTE')as allowed",
        )
      ).rows[0]?.allowed,
    ).toBe(false);
    expect(r.source.sourcePointer.lastCaptainEvent).toBeNull();
    const acl = await db.query(
      "select has_column_privilege(current_user,'world_v2.opening_seed','canonical_payload','SELECT')raw_seed,has_table_privilege(current_user,'world_v2.postwar_captain_h0_current_document','SELECT')raw_page,has_column_privilege(current_user,'world_v2.current_commit_authorization','authorization_version','UPDATE')auth_update",
    );
    expect(acl.rows[0]).toEqual({
      raw_seed: false,
      raw_page: false,
      auth_update: false,
    });
    await admin();
    for (const table of [
      'authoritative_event',
      'financial_posting_batch',
      'inventory_posting',
    ])
      expect(
        (
          await db.query<{ n: number }>(
            'select count(*)::int n from world_v2.' +
              table +
              ' where world_id=$1',
            [f.world],
          )
        ).rows[0]?.n,
      ).toBe(0);
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::int n from world_v2.postwar_captain_h0_current_document where world_id=$1',
          [f.world],
        )
      ).rows[0]?.n,
    ).toBe(1);
  });
  it('paginates the seven real buckets and rejects stale cursors, wrong subjects/countries and unauthorized publishers', async () => {
    await asReader();
    const first = (
        await db.query<{ source: { sourceVersion: string } }>(page, [
          f.world,
          0,
          3,
          null,
        ])
      ).rows[0]!,
      v = first.source.sourceVersion;
    const next = await db.query<{
      status: string;
      page: { nextOffset: number };
      rows_text: string;
    }>(page, [f.world, 3, 3, v]);
    expect(JSON.parse(next.rows[0]!.rows_text)).toHaveLength(3);
    expect(next.rows[0]!.page.nextOffset).toBe(6);
    expect(
      (await db.query<{ status: string }>(page, [f.world, 7, 25, v])).rows[0]
        ?.status,
    ).toBe('EMPTY');
    expect(
      (
        await db.query<{ status: string }>(page, [
          f.world,
          0,
          25,
          'sha256:' + 'a'.repeat(64),
        ])
      ).rows[0]?.status,
    ).toBe('STALE');
    await expect(
      db.query(
        'select * from world_v2.publish_postwar_captain_h0_current($1,$2)',
        [f.world, f.seller],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await asReader('00000000-0000-4000-8000-000000000002');
    expect(
      (await db.query<{ status: string }>(page, [f.world, 0, 25, null])).rows[0]
        ?.status,
    ).toBe('DENIED');
    await asPublisher();
    await expect(
      createPostwarCaptainOpeningCurrentPublisher({
        worldId: f.world,
        publicationDatabase: database,
      }).publishCountry(f.buyer),
    ).rejects.toMatchObject({ code: '55000' });
  });
  it('preserves the previous H>0 dispatcher body and refuses H0 as fallback for a nonzero or inconsistent head', async () => {
    await admin();
    expect(
      (
        await db.query<{ prosrc: string }>(
          "select prosrc from pg_proc where oid='world_v2.read_postwar_captain_current_page_before_h0_v1(text,integer,integer,text)'::regprocedure",
        )
      ).rows[0]?.prosrc,
    ).toBe(legacyBody);
    await db.exec('begin');
    await db.query(
      'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
      [f.world],
    );
    await db.exec('set session authorization ' + reader);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      f.subject,
    ]);
    expect(
      (await db.query<{ status: string }>(page, [f.world, 0, 25, null])).rows[0]
        ?.status,
    ).toBe('UNAVAILABLE');
    await db.exec('rollback');
  });
  it('refuses current reads after actual source or canonical-parent withdrawal, and does not manufacture an empty capital page', async () => {
    for (const which of ['SOURCE', 'PARENT'] as const) {
      await admin();
      await db.exec('begin isolation level repeatable read');
      if (which === 'SOURCE') {
        await db.exec('set role world_v2_captain_source_owner');
        await db.query(
          'insert into world_v2.captain_operating_source_revocation(adoption_ref,reason_ref)values($1,$2)',
          [adoptionRef, 'TEST_ONLY_SOURCE_WITHDRAWAL'],
        );
      } else {
        await db.exec('set role world_v2_postwar_projection_publisher');
        await db.query(
          'select world_v2.revoke_postwar_office_projection($1,$2,$3)',
          [f.world, parentRef, 'TEST_ONLY_PARENT_WITHDRAWAL'],
        );
      }
      await db.exec('reset role;set session authorization ' + reader);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        f.subject,
      ]);
      expect(
        (await db.query<{ status: string }>(page, [f.world, 0, 25, null]))
          .rows[0]?.status,
      ).toBe('UNAVAILABLE');
      await db.exec('rollback');
    }
  });
  it('allows null event references only for explicit zero coverage, never for legacy/current nonzero state', () => {
    const base = {
      schemaVersion: POSTWAR_CAPTAIN_OPENING_COVERAGE_SCHEMA,
      reducerVersion: 'POSTWAR_CAPTAIN_ADMITTED_GENESIS_EXACT_H0_V1',
      countryId: 'COUNTRY_01',
      coverageRef: 'H0_TEST_ONLY',
      prefixFingerprint: 'sha256:' + 'a'.repeat(64),
      knownEffectsFingerprint: 'sha256:' + 'b'.repeat(64),
      globalWorldVersion: '0',
      globalEventSequence: '0',
      coveredThroughEventId: null,
      coveredThroughEventFingerprint: null,
      financialPostingCount: '0',
      financialBatchCount: '0',
      financialPostingsFingerprint: 'sha256:' + 'c'.repeat(64),
      capitalStateHash: 'sha256:' + 'd'.repeat(64),
      originalPacketSha256: 'e'.repeat(64),
      originWorldVersion: '0',
      originEventSequence: '0',
    };
    expect(
      parsePostwarCaptainCurrentCoverage(base).coveredThroughEventId,
    ).toBeNull();
    for (const bad of [
      { ...base, globalWorldVersion: '1' },
      { ...base, financialBatchCount: '1' },
      { ...base, coveredThroughEventId: 'FAKE_EVENT' },
      {
        ...base,
        schemaVersion: 'postwar-captain-current-prefix-coverage-v1',
        reducerVersion: 'POSTWAR_CAPTAIN_FINANCE_SOCIAL_FX_COMPLETE_PREFIX_V1',
      },
    ])
      expect(() => parsePostwarCaptainCurrentCoverage(bad)).toThrow();
  });
});
