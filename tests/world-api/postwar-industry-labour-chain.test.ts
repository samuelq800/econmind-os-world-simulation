/** Real small Core calculations + actual embedded canonical journal, complete
 * SQL prefix, publisher, JWT API and engine reopen. NOT the registered Worker
 * Atomic source-cutoff/70-country fixture, native PG or production approval. */
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createPostwarIndustryLabourChainFixture } from '../support/postwar-industry-labour-chain-fixture.js';
let f: Awaited<ReturnType<typeof createPostwarIndustryLabourChainFixture>>,
  opening: Record<string, unknown>,
  current: Record<string, unknown>;
beforeAll(async () => {
  f = await createPostwarIndustryLabourChainFixture();
}, 30000);
afterAll(async () => {
  await f?.close();
});
describe('Industry actual small Core / SQL publication / API readback', () => {
  it('serves actual H0 industry headcount and a true empty foreign-country industry roster separately', async () => {
    const r = await f.call();
    expect(
      r.status,
      JSON.stringify({ body: r.body, sqlErrors: f.apiSqlErrors }),
    ).toBe(200);
    opening = r.body.source as Record<string, unknown>;
    expect(opening.dataNature).toBe(
      'ADMITTED_OPENING_INDUSTRY_EMPLOYMENT_HEADCOUNT',
    );
    expect((r.body.rows as Record<string, unknown>[])[0]).toMatchObject({
      openingFilledCount: '2',
      currentEmployedCount: '2',
      completedPersonDays: null,
      paidCost: null,
    });
    const empty = await f.call({}, f.other);
    expect(empty.status).toBe(200);
    expect(empty.body.status).toBe('EMPTY');
    expect(empty.body.rows).toEqual([]);
    await expect(f.readAsWrongRole()).rejects.toMatchObject({ code: '42501' });
    expect(
      (await f.call({}, '33333333-3333-4333-8333-333333333333')).status,
    ).toBe(403);
    expect(
      (await f.call({}, f.subject, { countryId: 'COUNTRY_02' })).status,
    ).toBe(400);
  });
  it('advances through real Core PLAN/MATCH and independently matches the complete SQL prefix before publishing current rows', async () => {
    const { plan, match } = await f.planAndMatch();
    expect(plan.state.labour.positions[0]!.employedCount).toBe('2');
    expect(match.state.labour.positions[0]!.employedCount).toBe('3');
    expect((await f.call()).status).toBe(503);
    expect(
      (
        await f.call({
          sourceVersion: opening.sourceVersion,
          bindingVersion: opening.bindingVersion,
        })
      ).status,
    ).toBe(409);
    const first = await f.publishCurrent(),
      again = await f.publishCurrent();
    expect(first.result).toEqual(again.result);
    expect(first.allocation?.currentEmployedCount).toBe('3');
    expect((await f.call({}, f.other)).status).toBe(503);
    await f.publishCurrent('COUNTRY_02');
    const foreign = await f.call({}, f.other);
    expect(foreign.status).toBe(200);
    expect(foreign.body.status).toBe('EMPTY');
    expect(foreign.body.source).toMatchObject({
      worldVersion: '2',
      eventSequence: '2',
    });
    const r = await f.call();
    expect(
      r.status,
      JSON.stringify({ body: r.body, sqlErrors: f.apiSqlErrors }),
    ).toBe(200);
    current = r.body.source as Record<string, unknown>;
    expect(current).toMatchObject({
      dataNature: 'ADMITTED_CURRENT_INDUSTRY_EMPLOYMENT_HEADCOUNT',
      worldVersion: '2',
      eventSequence: '2',
    });
    expect((r.body.rows as Record<string, unknown>[])[0]).toMatchObject({
      openingFilledCount: '2',
      currentEmployedCount: '3',
      completedPersonDays: null,
      paidCost: null,
    });
  });
  it('reopens the actual disk-backed engine and reads the same immutable page, then enforces fresh authority/source revocation', async () => {
    await f.reopen();
    const r = await f.call();
    expect(
      r.status,
      JSON.stringify({ body: r.body, sqlErrors: f.apiSqlErrors }),
    ).toBe(200);
    expect(r.body.source).toMatchObject({
      sourceVersion: current.sourceVersion,
      worldVersion: '2',
    });
    await f.revokeAuthority(false);
    expect((await f.call()).status).toBe(403);
    await f.revokeAuthority(true);
    expect((await f.call()).status).toBe(200);
    await f.revokeSource();
    const unavailable = await f.call();
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.rows).toBeUndefined();
    expect(f.counts().acquired).toBe(f.counts().released);
    expect(f.apiSql.some((s) => s.includes('canonical_payload'))).toBe(false);
  });
});
