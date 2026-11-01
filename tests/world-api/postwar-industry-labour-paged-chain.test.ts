/** Genuine small Core page continuation + actual fixed SQL verifier and JWT
 * API. TEST_ONLY embedded installation, not the 70-country Worker issuer. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostwarIndustryLabourChainFixture } from '../support/postwar-industry-labour-chain-fixture.js';
let f: Awaited<ReturnType<typeof createPostwarIndustryLabourChainFixture>>;
beforeAll(async () => {
  f = await createPostwarIndustryLabourChainFixture({ paged: true });
}, 30000);
afterAll(async () => {
  await f?.close();
});
describe('Industry true cumulative page-chain publication', () => {
  it('keeps opening unavailable at the new head, publishes independently verified V2, and expires V1 cursor at that same head', async () => {
    const h0 = await f.call();
    expect(h0.status, JSON.stringify(h0.body)).toBe(200);
    await f.planAndMatch();
    expect((await f.call()).status).toBe(503);
    await f.publishCurrent();
    const v1 = await f.call();
    expect(v1.status, JSON.stringify(v1.body)).toBe(200);
    expect(v1.body.source).toHaveProperty(
      'currentIndustryLabourCoverage.schemaVersion',
      'postwar-industry-labour-current-coverage-v1',
    );
    const result = await f.publishCurrent('COUNTRY_01', 'PAGED');
    expect(result.allocation?.currentEmployedCount).toBe('3');
    expect(result.coverage).toHaveProperty('pageProof.frameCount', '2');
    const v2 = await f.call();
    expect(v2.status, JSON.stringify(v2.body)).toBe(200);
    expect(v2.body.source).toHaveProperty(
      'currentIndustryLabourCoverage.schemaVersion',
      'postwar-industry-labour-current-page-chain-coverage-v2',
    );
    expect(v2.body.source).toMatchObject({
      worldVersion: '2',
      eventSequence: '2',
    });
    expect((v2.body.rows as Record<string, unknown>[])[0]).toMatchObject({
      currentEmployedCount: '3',
      completedPersonDays: null,
      paidCost: null,
    });
    const old = v1.body.source as Record<string, unknown>;
    expect(
      (
        await f.call({
          sourceVersion: old.sourceVersion,
          bindingVersion: old.bindingVersion,
        })
      ).status,
    ).toBe(409);
    const again = await f.publishCurrent('COUNTRY_01', 'PAGED');
    expect(again.result).toEqual(result.result);
    await f.reopen();
    const restored = await f.call();
    expect(restored.status).toBe(200);
    expect(restored.body.source).toMatchObject({
      sourceVersion: (v2.body.source as Record<string, unknown>).sourceVersion,
    });
    await f.revokeAuthority(false);
    expect((await f.call()).status).toBe(403);
    await f.revokeAuthority(true);
    await f.revokeSource();
    expect((await f.call()).status).toBe(503);
    expect(f.counts().acquired).toBe(f.counts().released);
  });
});
