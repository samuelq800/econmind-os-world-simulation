import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { publishCfcFinanceSocialFixtureSources } from '../support/postwar-finance-social-fixed-source-publisher.js';
describe('mixed fixture bridge to controlled source publication', () => {
  it('rejects a seed DTO before opening or querying a database', async () => {
    let queries = 0;
    await expect(
      publishCfcFinanceSocialFixtureSources({
        seed: { ready: true } as never,
        installer: {
          query: async () => {
            queries++;
            throw Error('must not query');
          },
        } as never,
      }),
    ).rejects.toThrow('GENUINE_CORE_SEED_REQUIRED');
    expect(queries).toBe(0);
  });
  it('keeps role selection fixed and uses the existing transaction adapter without manually registering originals', async () => {
    const source = await readFile(
      new URL(
        '../support/postwar-finance-social-fixed-source-publisher.ts',
        import.meta.url,
      ),
      'utf8',
    );
    expect(source).toContain('publishPostwarFinanceSocialSources({');
    expect(source).toContain('new PostgresSqlDatabase(pool)');
    expect(source).toContain('set local role ');
    expect(source).not.toMatch(
      /insert into world_v2\.(?:social_operating_source_registration|finance_budget_mixed_social_original|finance_budget_capacity_original)/iu,
    );
    expect(source).not.toMatch(/grant\s+(?:[a-z_]+\s+)?to\s/iu);
  });
});
