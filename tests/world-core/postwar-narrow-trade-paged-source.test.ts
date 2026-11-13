/** TEST_ONLY real SQL custody. A header is not complete replay or authority. */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { installPostwarNarrowTradeCutoffFixture } from '../support/postwar-narrow-trade-cutoff-fixture.js';
import {
  POSTWAR_NARROW_TRADE_CURRENT_PAGED_SCOPE_QUERY as query,
  POSTWAR_NARROW_TRADE_AUTOMATIC_PAGED_SCOPE_QUERY as automaticQuery,
  decodePostwarNarrowTradeCurrentPrefix,
  createPostwarNarrowTradeCurrentSource,
  preparePostwarNarrowTradeOpening,
} from '../../apps/world-worker/src/persistence/postwar-narrow-trade-current-source.js';
describe('paged Trade custody preserves real low-role scope and never masquerades as a prefix', () => {
  let db: PGlite,
    f: Awaited<ReturnType<typeof installPostwarNarrowTradeCutoffFixture>>;
  beforeAll(async () => {
    db = new PGlite();
    f = await installPostwarNarrowTradeCutoffFixture(db);
    await db.exec(
      await readFile(
        'database/proposals/postwar-narrow-trade-paged-source.sql',
        'utf8',
      ),
    );
  }, 60000);
  afterEach(async () => {
    await f.reset();
  });
  afterAll(async () => {
    await db.close();
  });
  const begin = async () => {
    await f.begin();
    await db.exec('set transaction isolation level repeatable read');
  };
  it('returns actual stock/rights/admission without history arrays; old decoder rejects it', async () => {
    await begin();
    const r = (await db.query<Record<string, unknown>>(query, f.params))
      .rows[0]!;
    expect(r.seed_fingerprint).toBe(f.seed.fingerprint);
    expect(r.admission_ref).toBe(f.admissionRef);
    expect(r.stock).toHaveLength(1);
    expect(r.rights).toHaveLength(1);
    expect(r.history_mode).toBe('GENUINE_SHARED_PAGED_CORE_REPLAY_REQUIRED');
    for (const field of [
      'commands',
      'events',
      'receipts',
      'financial_batches',
      'inventory_postings',
      'quotes',
    ])
      expect(r).not.toHaveProperty(field);
    expect(() => decodePostwarNarrowTradeCurrentPrefix(r, f.world)).toThrow();
  });
  it('requires an actual stable snapshot and exact subject/country/revision', async () => {
    await f.begin();
    await expect(db.query(query, f.params)).rejects.toMatchObject({
      code: '25001',
    });
    for (const [index, value] of [
      [1, f.buyer],
      [4, '11111111-1111-4111-8111-111111111111'],
      [6, 'WRONG_REVISION'],
    ] as const) {
      await begin();
      const args = [...f.params];
      args[index] = value;
      await expect(db.query(query, args)).rejects.toMatchObject({
        code: '42501',
      });
    }
  });
  it('revoked operating rights remain missing and cannot be replaced by a valid seed', async () => {
    await f.reset();
    await db.exec('begin isolation level repeatable read');
    await db.query(
      'insert into world_v2.postwar_narrow_trade_rights_revocation values($1,$2)',
      [f.domainAdmissionRef, 'TEST_ONLY_PAGED_REVOKED'],
    );
    await db.exec('set local role ' + f.readerRole);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      f.subject,
    ]);
    expect(
      (await db.query<Record<string, unknown>>(query, f.params)).rows[0]!
        .rights,
    ).toEqual([]);
  });
  it('automatic scope rejects absent actual lease/claimed command and low role has no authority DML', async () => {
    await begin();
    await expect(
      db.query(automaticQuery, [
        f.world,
        'MISSING_COMMAND',
        'MISSING_WORKER',
        '2026-11-01T00:00:00.000Z',
        '0',
      ]),
    ).rejects.toThrow();
    await begin();
    await expect(
      db.query(
        'update world_v2.current_commit_authorization set active=false where world_id=$1',
        [f.world],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('cannot turn a genuine opening-only preparation into a complete shared paged source', () => {
    const openingPreparation = preparePostwarNarrowTradeOpening({
      seed: f.seed,
      admissionRef: f.admissionRef,
    });
    expect(() =>
      createPostwarNarrowTradeCurrentSource({
        runtimeRole: f.readerRole,
        openingPreparation,
        historyMode: 'PAGED',
      }),
    ).toThrow('genuine shared Social');
  });
});
