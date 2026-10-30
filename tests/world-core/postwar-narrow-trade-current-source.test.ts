import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as C from '@econmind/core';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import {
  decodePostwarNarrowTradeCurrentPrefix,
  createPostwarNarrowTradeCurrentSource,
  isPostwarNarrowTradeCurrentSourceCommitProtectionPort,
  POSTWAR_NARROW_TRADE_CURRENT_SOURCE_QUERY,
  preparePostwarNarrowTradeOpening,
  POSTWAR_NARROW_TRADE_CURRENT_SOURCE_PURPOSE,
} from '../../apps/world-worker/src/persistence/postwar-narrow-trade-current-source.js';
import {
  installPostwarNarrowTradeCutoffFixture,
  createPostwarNarrowTradeCutoffCandidate,
  narrowCutoffSha,
} from '../support/postwar-narrow-trade-cutoff-fixture.js';
const empty = {
  world_version: '0',
  event_sequence: '0',
  commands: [],
  events: [],
  receipts: [],
  financial_batches: [],
  financial_batch_count: '0',
  inventory_posting_count: '0',
};
describe('Trade current source inert protocol boundaries', () => {
  it('decodes only the complete actual empty prefix, not a supplied head restamp', () => {
    expect(
      decodePostwarNarrowTradeCurrentPrefix(empty, 'WORLD_TEST').head,
    ).toEqual({ worldVersion: '0', eventSequence: '0' });
    expect(() =>
      decodePostwarNarrowTradeCurrentPrefix(
        { ...empty, world_version: '1' },
        'WORLD_TEST',
      ),
    ).toThrow('complete bounded prefix');
  });
  it('rejects inventory effects and uninstalled command families without filtering them away', () => {
    expect(() =>
      decodePostwarNarrowTradeCurrentPrefix(
        { ...empty, inventory_posting_count: '1' },
        'WORLD_TEST',
      ),
    ).toThrow('complete bounded journal');
    expect(() =>
      decodePostwarNarrowTradeCurrentPrefix(
        { ...empty, commands: [{ command_type: 'CORE_GOODS_TRANSFER_V1' }] },
        'WORLD_TEST',
      ),
    ).toThrow('REPLAY_UNAVAILABLE');
  });
  it('does not accept caller-created/copy ports or a fake shared runtime as authority', () => {
    expect(
      isPostwarNarrowTradeCurrentSourceCommitProtectionPort({
        assertCurrentFrom: async () => ({
          status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
        }),
      }),
    ).toBe(false);
    expect(() =>
      createPostwarNarrowTradeCurrentSource({
        runtimeRole: 'trade_test_worker',
        sharedConnection: {} as never,
      }),
    ).toThrow('GENUINE_FINANCE_SOCIAL');
    for (const runtimeRole of [
      'postgres',
      'service_role',
      'anon',
      'authenticated',
      'trade;drop',
    ])
      expect(() =>
        createPostwarNarrowTradeCurrentSource({
          runtimeRole,
          sharedConnection: {} as never,
        }),
      ).toThrow('fixed unprivileged');
  });
  it('the candidate grants no raw seed column or operational authority DML and keeps H first', async () => {
    const sql = await readFile(
      new URL(
        '../../database/proposals/postwar-narrow-trade-current-source.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(sql).not.toContain('seed.canonical_payload');
    expect(sql).not.toMatch(/grant[^;]*canonical_payload[^;]*opening_seed/iu);
    expect(sql.indexOf('into h from world_v2.world_head')).toBeLessThan(
      sql.indexOf('perform 1 from world_v2.current_commit_authorization'),
    );
    expect(sql).toContain('with check(false)');
    expect(sql).not.toMatch(/grant\s+\w+\s+to\s+\w+;/iu);
  });
});
describe('actual embedded PostgreSQL Trade custody candidate (TEST_ONLY, not native/production)', () => {
  let db: PGlite,
    f: Awaited<ReturnType<typeof installPostwarNarrowTradeCutoffFixture>>;
  beforeAll(async () => {
    db = new PGlite();
    f = await installPostwarNarrowTradeCutoffFixture(db);
  }, 60000);
  afterEach(async () => {
    await f.reset();
  });
  afterAll(async () => {
    await db.close();
  });
  it('fixed low role reads hashed sealed stock and independently admitted exact originals', async () => {
    await f.begin();
    const result = await db.query<Record<string, unknown>>(
      POSTWAR_NARROW_TRADE_CURRENT_SOURCE_QUERY,
      f.params,
    );
    expect(result.rows).toHaveLength(1);
    const r = result.rows[0]!;
    expect(r.seed_fingerprint).toBe(f.seed.fingerprint);
    expect(r.admission_ref).toBe(f.admissionRef);
    expect(r.stock_status).toBe('SEALED_ADMITTED_OPENING');
    expect(r.stock).toHaveLength(1);
    expect(r.rights).toHaveLength(1);
    expect(decodePostwarNarrowTradeCurrentPrefix(r, f.world).frames).toEqual(
      [],
    );
  });
  it('private genuine Core H0 preparation and independently admitted later rights pass exact same-executor reserve cutoff', async () => {
    expect(f.seed.sources.some((s) => s.sourceId === f.rights.sourceId)).toBe(
      false,
    );
    await f.begin();
    const c = await createPostwarNarrowTradeCutoffCandidate(f);
    const openingPreparation = preparePostwarNarrowTradeOpening({
      seed: f.seed,
      admissionRef: f.admissionRef,
    });
    const source = createPostwarNarrowTradeCurrentSource({
      runtimeRole: f.readerRole,
      openingPreparation,
    });
    const tx = {
      async query<T extends object>(
        sql: string,
        args: readonly unknown[] = [],
      ) {
        const r = await db.query<T>(sql, [...args]);
        return { rows: r.rows, rowCount: r.rows.length };
      },
    };
    const result = await source.inspectFrom(tx, {
      command: c.command,
      authorization: c.authorization,
      observedAtReal: c.at,
    });
    expect(result.kind).toBe('SOURCE_MATCH');
    if (result.kind !== 'SOURCE_MATCH')
      throw Error('ACTUAL_TEST_SOURCE_NOT_MATCHED');
    expect(
      isPostwarNarrowTradeCurrentSourceCommitProtectionPort(
        source.sourceCommitProtectionPort,
      ),
    ).toBe(true);
    const request = {
      phase: 'BEFORE_EVENTS' as const,
      purpose: POSTWAR_NARROW_TRADE_CURRENT_SOURCE_PURPOSE,
      command: c.command,
      transition: c.transition,
      currentHead: c.head,
      observedAtReal: c.at,
      readBinding: result.binding,
      commitAuthorization: c.proof,
      inventoryPostings: [c.posting],
      financialPostingBatches: [],
    };
    expect(
      await source.sourceCommitProtectionPort.assertCurrentFrom(tx, request),
    ).toMatchObject({
      status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
      protectionMode: 'HELD_SOURCE_GUARDS',
    });
    await expect(
      source.sourceCommitProtectionPort.assertCurrentFrom(tx, {
        ...request,
        readBinding: {
          ...result.binding,
          sellerSettlementAccountId: 'FORGED_ACCOUNT',
        },
      }),
    ).rejects.toThrow('source changed');
    await expect(
      source.sourceCommitProtectionPort.assertCurrentFrom(tx, {
        ...request,
        inventoryPostings: [],
      }),
    ).rejects.toThrow('reserve-only');
    await db.exec('rollback');
  });
  it('genuine H0 data preparation cannot be copied or rebound to another actual admission', async () => {
    expect(() =>
      preparePostwarNarrowTradeOpening({
        seed: { ...f.seed },
        admissionRef: f.admissionRef,
      }),
    ).toThrow('genuine Core seed');
    const constantHash = () => 'f'.repeat(64);
    const forgedDigestSeed = C.createOpeningSeed(
      {
        ...f.seed,
        sources: f.seed.sources.map((original) =>
          C.createOpeningSource(
            {
              schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
              sourceId: original.sourceId,
              sourceKind: original.sourceKind,
              sourceVersion: original.sourceVersion,
              locator: original.locator,
              payload: JSON.parse(original.canonicalPayload),
            },
            constantHash,
          ),
        ),
      },
      constantHash,
    );
    expect(C.isValidatedOpeningSeed(forgedDigestSeed)).toBe(true);
    expect(() =>
      preparePostwarNarrowTradeOpening({
        seed: forgedDigestSeed,
        admissionRef: f.admissionRef,
      }),
    ).toThrow(/hash|fingerprint/iu);
    const token = preparePostwarNarrowTradeOpening({
      seed: f.seed,
      admissionRef: f.admissionRef,
    });
    expect(() =>
      createPostwarNarrowTradeCurrentSource({
        runtimeRole: f.readerRole,
        openingPreparation: { ...token },
      }),
    ).toThrow('genuine Core opening preparation');
    await f.begin();
    const c = await createPostwarNarrowTradeCutoffCandidate(f);
    const wrong = createPostwarNarrowTradeCurrentSource({
      runtimeRole: f.readerRole,
      openingPreparation: preparePostwarNarrowTradeOpening({
        seed: f.seed,
        admissionRef: 'ADMISSION_TEST_ONLY_WRONG',
      }),
    });
    const tx = {
      async query<T extends object>(
        sql: string,
        args: readonly unknown[] = [],
      ) {
        const r = await db.query<T>(sql, [...args]);
        return { rows: r.rows, rowCount: r.rows.length };
      },
    };
    await expect(
      wrong.inspectFrom(tx, {
        command: c.command,
        authorization: c.authorization,
        observedAtReal: c.at,
      }),
    ).rejects.toThrow('actual admission differs');
  });
  it('fixed role cannot read raw seed/rights or acquire source-owner authority', async () => {
    for (const query of [
      'select canonical_payload from world_v2.opening_seed',
      'select * from world_v2.postwar_narrow_trade_current_original',
      'update world_v2.current_commit_authorization set active=false',
    ]) {
      await f.begin();
      await expect(db.query(query)).rejects.toMatchObject({ code: '42501' });
    }
  });
  it('wrong country and revoked actor are denied before originals are returned', async () => {
    await f.begin();
    await expect(
      db.query(POSTWAR_NARROW_TRADE_CURRENT_SOURCE_QUERY, [
        f.world,
        f.buyer,
        f.seller,
        f.account.batchId,
        f.subject,
        f.team,
        f.revision,
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    await f.reset();
    await db.query(
      'update world_v2.current_commit_authorization set active=false where world_id=$1',
      [f.world],
    );
    try {
      await f.begin();
      await expect(
        db.query(POSTWAR_NARROW_TRADE_CURRENT_SOURCE_QUERY, f.params),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await f.reset();
      await db.query(
        'update world_v2.current_commit_authorization set active=true where world_id=$1',
        [f.world],
      );
    }
  });
  it('wrong hash and wrong-seed independent adoptions are rejected, not treated as current originals', async () => {
    await f.reset();
    await db.exec('begin');
    const foreign = C.createOpeningSource(
      {
        schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: C.openingSourceId('SOURCE_TEST_ONLY_FOREIGN_ROUTE'),
        sourceKind: 'TEST_FIXTURE',
        sourceVersion: 'TEST_ONLY',
        locator: 'TEST_ONLY_COUNTRY_ISOLATION',
        payload: {
          schemaVersion: 'postwar-narrow-trade-operating-rights-v1',
          worldId: f.world,
          records: [
            {
              kind: 'CROSS_BORDER_ROUTE',
              fromCountryId: f.buyer,
              toCountryId: f.seller,
              commodityId: 'GRAIN',
            },
          ],
        },
      },
      narrowCutoffSha,
    );
    await db.query(
      'insert into world_v2.postwar_narrow_trade_rights_admission values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        f.world,
        f.seed.fingerprint,
        foreign.sourceId,
        foreign.payloadHash,
        'TEST_ONLY_FOREIGN_ISSUER',
        'TEST_ONLY_FOREIGN_CUSTODIAN',
        'TEST_ONLY_FOREIGN_ADMISSION',
        'TEST_ONLY_FOREIGN_REV',
        '3'.repeat(64),
      ],
    );
    await db.query(
      'insert into world_v2.postwar_narrow_trade_current_original values($1,$2,$3,$4,$5)',
      [
        f.world,
        foreign.sourceId,
        f.seed.fingerprint,
        foreign.payloadHash,
        foreign.canonicalPayload,
      ],
    );
    await db.exec('set local role ' + f.readerRole);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      f.subject,
    ]);
    const filtered = await db.query<{ rights: unknown[] }>(
      POSTWAR_NARROW_TRADE_CURRENT_SOURCE_QUERY,
      f.params,
    );
    expect(filtered.rows[0]!.rights).toHaveLength(1);
    await f.reset();
    await db.exec('begin');
    await expect(
      db.query(
        'insert into world_v2.postwar_narrow_trade_current_original values($1,$2,$3,$4,$5)',
        [
          f.world,
          'SOURCE_WRONG_HASH',
          f.seed.fingerprint,
          'sha256:' + 'f'.repeat(64),
          f.rights.canonicalPayload,
        ],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await f.reset();
    await db.exec('begin');
    await expect(
      db.query(
        'insert into world_v2.postwar_narrow_trade_rights_admission values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          f.world,
          'sha256:' + 'f'.repeat(64),
          'SOURCE_WRONG_SEED',
          f.rights.payloadHash,
          'TEST_ONLY_ISSUER',
          'TEST_ONLY_CUSTODIAN',
          'WRONG_SEED_ADMISSION',
          'TEST_ONLY_REV',
          '2'.repeat(64),
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
  it('domain revocation removes rights immediately, without new events or cash', async () => {
    await f.reset();
    await db.exec('begin');
    await db.query(
      'insert into world_v2.postwar_narrow_trade_rights_revocation values($1,$2)',
      [f.domainAdmissionRef, 'TEST_ONLY_REVOKED'],
    );
    await db.exec('set local role ' + f.readerRole);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      f.subject,
    ]);
    const r = await db.query<Record<string, unknown>>(
      POSTWAR_NARROW_TRADE_CURRENT_SOURCE_QUERY,
      f.params,
    );
    expect(r.rows[0]!.rights).toEqual([]);
    await db.exec('rollback');
    const count = await db.query<{ count: string }>(
      'select count(*)::text from world_v2.authoritative_event',
    );
    expect(count.rows[0]!.count).toBe('0');
  });
  it('operational reader cannot assume inaccessible lock owner or mutate authorization', async () => {
    await f.begin();
    await expect(
      db.exec('set role world_v2_postwar_narrow_trade_current_owner'),
    ).rejects.toMatchObject({ code: '42501' });
    await f.begin();
    await expect(
      db.query(
        'update world_v2.current_commit_authorization set authorization_version=$1 where world_id=$2',
        ['ILLEGAL_REV', f.world],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
