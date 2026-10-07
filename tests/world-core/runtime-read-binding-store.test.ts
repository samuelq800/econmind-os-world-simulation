import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  authenticateIdentity,
  authorizeOfficeCapability,
  authSubject,
  countryId,
  officeId,
  teamId,
  worldId,
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  createOpeningSource,
  createOpeningSeed,
  openingSourceId,
  openingSeedId,
  canonicalSerialize,
  type AuthenticatedPrincipal,
  type MembershipSnapshot,
  type AuthorizedOfficeContext,
} from '@econmind/core';
import {
  RuntimeReadBindingStore,
  ADMISSION_PUBLICATION_BLOCKER,
} from '../../apps/world-worker/src/persistence/runtime-read-binding-store.js';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import type {
  SqlDatabase,
  SqlExecutor,
  SqlQueryResult,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';

// Exact SQL proposal in a fresh in-memory fixture; NO DSN/network/production,
// real assignment/admission or released schema/role. All identities are INERT.
const SUBJECT = '11111111-1111-4111-8111-111111111111',
  OTHER = '22222222-2222-4222-8222-222222222222';
const WORLD = 'WORLD_INERT_BINDING',
  COUNTRY = 'COUNTRY_01',
  TEAM = 'TEAM_INERT';
const PUB = 'fixture_binding_publisher',
  READER = 'fixture_binding_reader';
const root = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

async function principal(): Promise<AuthenticatedPrincipal> {
  return authenticateIdentity({
    token: 'INERT_TOKEN',
    profile: { user_id: SUBJECT, display_name: null, school_id: null },
    verifier: {
      verify: async () => ({
        subject: SUBJECT,
        issuer: 'INERT_ISSUER',
        audience: 'INERT_AUDIENCE',
        issuedAt: '2026-10-07T00:00:00.000Z',
        expiresAt: '2026-10-08T00:00:00.000Z',
      }),
    },
  });
}
async function fixture() {
  const db = createPGliteV09AtomicTestDatabase();
  try {
    for (const name of [
      '0001_world_v2_namespace.sql',
      '0002_world_v2_command_event_ledger.sql',
      '0011_world_v2_current_commit_authorization.sql',
      '0016_world_v2_opening_seed.sql',
    ])
      await db.executeScript(read(`database/migrations/artifacts/${name}`));
    await db.executeScript(`create role ${PUB} nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
      create role ${READER} nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
      create role world_v2_api_reader nologin nosuperuser nobypassrls;
      create role world_v2_api_login nologin nosuperuser nobypassrls;`);
    await db.executeScript(
      read('database/proposals/runtime-read-binding-storage.sql'),
    );
    // FIXTURE-ONLY privileges, not delivered provisioning. Publisher already
    // owns the source projection; runtime reader has no DML or economic rights.
    await db.executeScript(`grant usage on schema world_v2 to ${PUB},${READER};
      grant select,update on world_v2.current_commit_authorization to ${PUB};
      grant select,insert on world_v2.runtime_read_seat to ${PUB};
      grant select on world_v2.current_commit_authorization,world_v2.runtime_read_seat,world_v2.runtime_opening_admission to ${READER};`);
    await db.query(
      'insert into world_v2.world_head(world_id,world_version,event_sequence) values($1,0,0)',
      [WORLD],
    );
    for (const [office, capability] of [
      ['FINANCE', 'FINANCE_TREASURY'],
      ['FINANCE', 'FINANCE_BUDGET'],
      ['TRADE', 'TRADE_POLICY'],
    ])
      await db.query(
        `insert into world_v2.current_commit_authorization
        (world_id,auth_subject,country_id,office_id,capability,team_id,authorization_version,active,refreshed_at_real)
        values($1,$2::uuid,$3,$4,$5,$6,'REV_1',true,'2026-10-07T00:00:00.000Z')`,
        [WORLD, SUBJECT, COUNTRY, office, capability, TEAM],
      );
    const state: { membership: MembershipSnapshot } = {
      membership: {
        authorizationVersion: 'REV_1',
        authSubject: authSubject(SUBJECT),
        worldId: worldId(WORLD),
        teamId: teamId(TEAM),
        countryId: countryId(COUNTRY),
        officeAssignments: [officeId('FINANCE'), officeId('TRADE')],
        active: true,
        suspended: false,
        isWorldAdmin: false,
        negotiationPartyIds: [],
      },
    };
    const p = await principal(),
      resolver = {
        resolveCurrentIdentity: async () => p.authSubject,
        resolveCurrentMembership: async () => state.membership,
      };
    const authorization = (office: 'FINANCE' | 'TRADE' = 'FINANCE') =>
      authorizeOfficeCapability({
        principal: p,
        resolver,
        worldId: worldId(WORLD),
        requestedCountryId: countryId(COUNTRY),
        requestedOfficeId: officeId(office),
        capability: office === 'FINANCE' ? 'FINANCE_TREASURY' : 'TRADE_POLICY',
      });
    const publisherDatabase: SqlDatabase = {
      query: db.query,
      transaction: (fn) =>
        db.transaction(async (tx) => {
          await tx.query(`set local role ${PUB}`);
          await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
            SUBJECT,
          ]);
          return fn(tx);
        }),
    };
    const store = new RuntimeReadBindingStore({
      database: publisherDatabase,
      authorizationPublisherRole: PUB,
      runtimeReaderRole: READER,
    });
    const asReader = <T>(
      fn: (tx: SqlExecutor) => Promise<T>,
      subject = SUBJECT,
      role = READER,
    ) =>
      db.transaction(async (tx) => {
        if (![READER, PUB, 'postgres'].includes(role))
          throw new Error('FIXTURE_ROLE_NOT_ALLOWED');
        await tx.query(`set local role ${role}`);
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
          subject,
        ]);
        return fn(tx);
      });
    const seat = (office = 'FINANCE', subject = SUBJECT) =>
      asReader(
        (tx) =>
          store.readCurrentSeatFrom({
            executor: tx,
            verifiedSubject: subject,
            worldId: WORLD,
            countryId: COUNTRY,
            officeId: office,
          }),
        subject,
      );
    return { db, state, store, authorization, asReader, seat };
  } catch (e) {
    await db.close();
    throw e;
  }
}
async function using<T>(
  fn: (f: Awaited<ReturnType<typeof fixture>>) => Promise<T>,
) {
  const f = await fixture();
  try {
    return await fn(f);
  } finally {
    await f.db.close();
  }
}
function inertSeed(
  kind: 'AUTHORITATIVE_DATASET' | 'TEST_FIXTURE' = 'AUTHORITATIVE_DATASET',
) {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_INERT_BINDING'),
      sourceKind: kind,
      locator: 'fixture://inert-binding-NOT-ADMISSION',
      sourceVersion: 'INERT_V1',
      payload: { label: 'INERT_ONLY_NOT_REAL_OPENING_ADOPTION' },
    },
    sha,
  );
  return createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_INERT_BINDING'),
      worldId: worldId(WORLD),
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
}
function unwrapMessage(e: unknown): string {
  if (e instanceof Error)
    return `${e.message} ${'cause' in e ? unwrapMessage(e.cause) : ''}`;
  return '';
}
async function rejectsWith(operation: Promise<unknown>, fragment: string) {
  let failure: unknown;
  try {
    await operation;
  } catch (e) {
    failure = e;
  }
  expect(failure).toBeDefined();
  expect(unwrapMessage(failure)).toContain(fragment);
}

describe('durable runtime read-binding storage, source-only fixtures', () => {
  it('persists one stable reference per current assignment/revision; capabilities do not multiply seats', () =>
    using(async (f) => {
      const context = await f.authorization(),
        a = await f.store.bindCurrentSeat({ authorization: context }),
        b = await f.store.bindCurrentSeat({ authorization: context });
      expect(a).toEqual(b);
      expect(a.seatRef).toMatch(/^SEAT_[A-Z0-9_]+$/u);
      expect(a).toMatchObject({
        worldId: WORLD,
        authSubject: SUBJECT,
        countryId: COUNTRY,
        officeId: 'FINANCE',
        teamId: TEAM,
        authorizationRevision: 'REV_1',
      });
      expect(await f.seat()).toEqual(a);
      const count = await f.db.query<{ count: number }>(
        'select count(*)::int as count from world_v2.runtime_read_seat',
      );
      expect(count.rows[0]!.count).toBe(1);
    }));
  it('supports many-to-many Offices without auto-approval or Office substitution', () =>
    using(async (f) => {
      const finance = await f.store.bindCurrentSeat({
          authorization: await f.authorization('FINANCE'),
        }),
        trade = await f.store.bindCurrentSeat({
          authorization: await f.authorization('TRADE'),
        });
      expect(finance.seatRef).not.toBe(trade.seatRef);
      expect((await f.seat('FINANCE'))!.seatRef).toBe(finance.seatRef);
      expect((await f.seat('TRADE'))!.seatRef).toBe(trade.seatRef);
      expect(await f.seat('CAPTAIN')).toBeNull();
      expect(
        (
          await f.db.query<{ count: number }>(
            'select count(*)::int as count from world_v2.runtime_opening_admission',
          )
        ).rows[0]!.count,
      ).toBe(0);
    }));
  it('old seat refs do not survive revocation; no role assignment is changed by binding', () =>
    using(async (f) => {
      const context = await f.authorization();
      await f.store.bindCurrentSeat({ authorization: context });
      await f.db.query(
        'update world_v2.current_commit_authorization set active=false where world_id=$1',
        [WORLD],
      );
      expect(await f.seat()).toBeNull();
      f.state.membership = { ...f.state.membership, active: false };
      await rejectsWith(
        f.store.bindCurrentSeat({ authorization: context }),
        'inactive or suspended',
      );
      expect(
        (
          await f.db.query<{ count: number }>(
            'select count(*)::int as count from world_v2.runtime_read_seat',
          )
        ).rows[0]!.count,
      ).toBe(1);
    }));
  it('reauthorizes reassignment/revision and retains the immutable old reference as unusable history', () =>
    using(async (f) => {
      const context = await f.authorization(),
        old = await f.store.bindCurrentSeat({ authorization: context });
      f.state.membership = {
        ...f.state.membership,
        teamId: teamId('TEAM_NEW_INERT'),
        authorizationVersion: 'REV_2',
      };
      await f.db.query(
        "update world_v2.current_commit_authorization set team_id='TEAM_NEW_INERT',authorization_version='REV_2' where world_id=$1",
        [WORLD],
      );
      const next = await f.store.bindCurrentSeat({ authorization: context });
      expect(next.seatRef).not.toBe(old.seatRef);
      expect(next.authorizationRevision).toBe('REV_2');
      expect(await f.seat()).toEqual(next);
      expect(
        (
          await f.db.query<{ count: number }>(
            'select count(*)::int as count from world_v2.runtime_read_seat',
          )
        ).rows[0]!.count,
      ).toBe(2);
    }));
  it('rejects same-revision team reassignment and conflicting active current facts', () =>
    using(async (f) => {
      const context = await f.authorization();
      await f.store.bindCurrentSeat({ authorization: context });
      f.state.membership = {
        ...f.state.membership,
        teamId: teamId('TEAM_NEW_INERT'),
      };
      await f.db.query(
        "update world_v2.current_commit_authorization set team_id='TEAM_NEW_INERT' where world_id=$1",
        [WORLD],
      );
      expect(await f.seat()).toBeNull();
      await rejectsWith(
        f.store.bindCurrentSeat({ authorization: context }),
        'SEAT_REFERENCE_CONFLICT',
      );
      await f.db.query(
        "update world_v2.current_commit_authorization set team_id='TEAM_OTHER_INERT' where world_id=$1 and capability='FINANCE_BUDGET'",
        [WORLD],
      );
      await rejectsWith(
        f.store.bindCurrentSeat({ authorization: context }),
        'CURRENT_AUTHORIZATION_NOT_COHERENT',
      );
    }));
  it('rejects caller-made authorized flags/contexts before any publication', () =>
    using(async (f) => {
      const fake = {
        authSubject: SUBJECT,
        worldId: WORLD,
        countryId: COUNTRY,
        officeId: 'FINANCE',
        teamId: TEAM,
        authorizationVersion: 'REV_1',
        capability: 'FINANCE_TREASURY',
        approved: true,
      };
      await rejectsWith(
        f.store.bindCurrentSeat({
          authorization: fake as unknown as AuthorizedOfficeContext,
        }),
        'not issued by server authorization',
      );
      expect(
        (
          await f.db.query<{ count: number }>(
            'select count(*)::int as count from world_v2.runtime_read_seat',
          )
        ).rows[0]!.count,
      ).toBe(0);
    }));
  it('checks actual subject/effective runtime role and keeps official-source privileges isolated', () =>
    using(async (f) => {
      await f.store.bindCurrentSeat({ authorization: await f.authorization() });
      expect(await f.seat('FINANCE', OTHER)).toBeNull();
      await rejectsWith(
        f.asReader(
          (tx) =>
            f.store.readCurrentSeatFrom({
              executor: tx,
              verifiedSubject: SUBJECT,
              worldId: WORLD,
              countryId: COUNTRY,
              officeId: 'FINANCE',
            }),
          OTHER,
        ),
        'RUNTIME_BINDING_ROLE_OR_SUBJECT_DENIED',
      );
      await rejectsWith(
        f.asReader(
          (tx) =>
            f.store.readCurrentSeatFrom({
              executor: tx,
              verifiedSubject: SUBJECT,
              worldId: WORLD,
              countryId: COUNTRY,
              officeId: 'FINANCE',
            }),
          SUBJECT,
          PUB,
        ),
        'RUNTIME_BINDING_ROLE_OR_SUBJECT_DENIED',
      );
      expect(
        () =>
          new RuntimeReadBindingStore({
            database: f.db,
            authorizationPublisherRole: PUB,
            runtimeReaderRole: 'world_v2_api_reader',
          }),
      ).toThrow('UNSAFE_RUNTIME_BINDING_ROLE');
      expect(
        () =>
          new RuntimeReadBindingStore({
            database: f.db,
            authorizationPublisherRole: PUB,
            runtimeReaderRole: PUB,
          }),
      ).toThrow('MUST_BE_SEPARATE');
      const grants = await f.db.query<{ granted: boolean }>(
        "select has_table_privilege('world_v2_api_reader','world_v2.runtime_read_seat','SELECT') as granted",
      );
      expect(grants.rows[0]!.granted).toBe(false);
      const writes = await f.db.query<{ granted: boolean }>(
        `select has_table_privilege('${READER}','world_v2.runtime_read_seat','INSERT') as granted`,
      );
      expect(writes.rows[0]!.granted).toBe(false);
      await f.db.executeScript(`grant world_v2_api_reader to ${READER};`);
      await rejectsWith(f.seat(), 'RUNTIME_BINDING_ROLE_OR_SUBJECT_DENIED');
      await f.db.executeScript(
        `revoke world_v2_api_reader from ${READER};grant insert on world_v2.runtime_read_seat to ${READER};`,
      );
      await rejectsWith(f.seat(), 'RUNTIME_BINDING_ROLE_OR_SUBJECT_DENIED');
    }));
  it('SQL validates current scope even for a direct privileged fixture insert, and seat history cannot mutate/truncate', () =>
    using(async (f) => {
      await rejectsWith(
        f.db.query(
          `insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)
      values($1,$2::uuid,$3,'FINANCE','TEAM_WRONG','REV_1')`,
          [WORLD, SUBJECT, COUNTRY],
        ),
        'exact Office assignment',
      );
      await f.store.bindCurrentSeat({ authorization: await f.authorization() });
      for (const sql of [
        "update world_v2.runtime_read_seat set team_id='TEAM_WRONG'",
        'delete from world_v2.runtime_read_seat',
        'truncate world_v2.runtime_read_seat',
      ])
        await expect(f.db.query(sql)).rejects.toThrow();
      const flags = await f.db.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        "select relrowsecurity,relforcerowsecurity from pg_class where oid='world_v2.runtime_read_seat'::regclass",
      );
      expect(flags.rows[0]).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
    }));
  it('valid seed/bootstrap/current seat/source never auto-mints admission; every direct admission insert is vetoed', () =>
    using(async (f) => {
      await f.store.bindCurrentSeat({ authorization: await f.authorization() });
      const seed = inertSeed();
      await new WorldOpeningSeedStore({
        database: f.db,
        sha256Hex: sha,
      }).bootstrap({ seed, bootstrappedAtReal: '2026-10-07T00:00:00.000Z' });
      expect(
        await f.asReader((tx) =>
          f.store.readImmutableAdmissionFrom({
            executor: tx,
            verifiedSubject: SUBJECT,
            worldId: WORLD,
          }),
        ),
      ).toBeNull();
      await rejectsWith(
        f.db.query(
          `insert into world_v2.runtime_opening_admission(world_id,seed_id,seed_fingerprint,model_version,replay_binding)
      values($1,$2,$3,$4,$5)`,
          [
            WORLD,
            seed.seedId,
            seed.fingerprint,
            seed.replayBinding.modelVersion,
            canonicalSerialize(seed.replayBinding),
          ],
        ),
        ADMISSION_PUBLICATION_BLOCKER,
      );
      await rejectsWith(
        f.db.query(
          `insert into world_v2.runtime_opening_admission(world_id,seed_id,seed_fingerprint,model_version,replay_binding)
      values($1,$2,$3,'WRONG',$4)`,
          [
            WORLD,
            seed.seedId,
            seed.fingerprint,
            canonicalSerialize(seed.replayBinding),
          ],
        ),
        'exact immutable opening lineage',
      );
      expect(
        (
          await f.db.query<{ count: number }>(
            'select count(*)::int as count from world_v2.runtime_opening_admission',
          )
        ).rows[0]!.count,
      ).toBe(0);
      expect('publishAdmission' in f.store).toBe(false);
      await expect(
        f.db.query('truncate world_v2.runtime_opening_admission'),
      ).rejects.toThrow();
    }));
});

// Synthetic future persisted-row reader checks only; the SQL publication veto
// is NOT removed, no admitted record is inserted, no true admission is claimed.
function futureRowFixture(
  kind: 'AUTHORITATIVE_DATASET' | 'TEST_FIXTURE' = 'AUTHORITATIVE_DATASET',
  overrides: Record<string, unknown> = {},
) {
  const seed = inertSeed(kind),
    { fingerprint: ignored, ...intent } = seed;
  void ignored;
  const row = {
    admission_ref: 'ADMISSION_INERT_READER_FIXTURE',
    world_id: WORLD,
    seed_id: seed.seedId,
    seed_fingerprint: seed.fingerprint,
    model_version: seed.replayBinding.modelVersion,
    replay_binding: canonicalSerialize(seed.replayBinding),
    admitted_at_real: '2026-10-07T00:00:00.000Z',
    ...overrides,
  };
  const calls: string[] = [];
  const executor: SqlExecutor = {
    query: async <Row extends object>(
      sql: string,
    ): Promise<SqlQueryResult<Row>> => {
      calls.push(sql);
      const rows = sql.includes('pg_roles')
        ? [
            {
              role_name: READER,
              rolsuper: false,
              rolbypassrls: false,
              rolcreaterole: false,
              rolcreatedb: false,
              rolreplication: false,
              verified_subject: SUBJECT,
              official_source_member: false,
              publisher_member: false,
              unsafe_reader_privileges: false,
            },
          ]
        : sql.includes('runtime_opening_admission')
          ? [row]
          : sql.includes('from world_v2.opening_seed')
            ? [
                {
                  world_id: WORLD,
                  seed_id: seed.seedId,
                  opening_world_version: '0',
                  replay_binding: canonicalSerialize(seed.replayBinding),
                  canonical_payload: canonicalSerialize(intent),
                  seed_fingerprint: seed.fingerprint,
                },
              ]
            : [];
      return { rows: rows as unknown as Row[], rowCount: rows.length };
    },
  };
  const database: SqlDatabase = {
    query: executor.query,
    transaction: (fn) => fn(executor),
  };
  const store = new RuntimeReadBindingStore({
    database,
    authorizationPublisherRole: PUB,
    runtimeReaderRole: READER,
  });
  return { store, executor, calls, seed };
}
describe('future immutable admission row consistency, not admission publication', () => {
  it('reuses existing seed parser/store and binds exact model/replay/fingerprint', async () => {
    const f = futureRowFixture(),
      r = await f.store.readImmutableAdmissionFrom({
        executor: f.executor,
        verifiedSubject: SUBJECT,
        worldId: WORLD,
      });
    expect(r).toMatchObject({
      admissionRef: 'ADMISSION_INERT_READER_FIXTURE',
      seedRef: f.seed.seedId,
      contentHash: f.seed.fingerprint,
      modelVersion: CURRENT_REPLAY_BINDING.modelVersion,
    });
    expect(f.calls.some((s) => s.includes('from world_v2.opening_seed'))).toBe(
      true,
    );
    expect(
      f.calls.every(
        (s) =>
          !/^\s*(?:insert|update|delete|grant|revoke|set\s+role|create|alter|drop|truncate)\b/iu.test(
            s,
          ),
      ),
    ).toBe(true);
  });
  it('denies mismatched seed/fingerprint/model/replay and TEST_FIXTURE provenance', async () => {
    for (const overrides of [
      { seed_id: 'SEED_OTHER' },
      { seed_fingerprint: `sha256:${'0'.repeat(64)}` },
      { model_version: 'OTHER' },
      { replay_binding: '{}' },
    ]) {
      const f = futureRowFixture('AUTHORITATIVE_DATASET', overrides);
      expect(
        await f.store.readImmutableAdmissionFrom({
          executor: f.executor,
          verifiedSubject: SUBJECT,
          worldId: WORLD,
        }),
      ).toBeNull();
    }
    const f = futureRowFixture('TEST_FIXTURE');
    await expect(
      f.store.readImmutableAdmissionFrom({
        executor: f.executor,
        verifiedSubject: SUBJECT,
        worldId: WORLD,
      }),
    ).rejects.toMatchObject({ code: 'RUNTIME_READ_BINDING_UNAVAILABLE' });
  });
});
