/** Real private installers, protocol-only pools. No source is prepared,
 * admitted or economically executed by these identity/lifecycle tests. */
import path from 'node:path';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { Money } from '@econmind/core';
import { projectPostwarOpeningFinancialEncumbrances } from '../../apps/world-worker/src/persistence/prepared-postwar-finance-social-fx-replay.js';
import {
  bindPostgresFinanceBudgetCapacitySourceToSocialReplay,
  createPostgresFinanceBudgetWorldCapacitySource,
  isPostgresFinanceBudgetWorldCapacitySource,
  readPostgresFinanceBudgetCapacitySourceScope,
} from '../../apps/world-worker/src/persistence/postgres-finance-budget-capacity-source.js';
import {
  createPostwarSocialRuntimeConnection,
  loadPostwarSocialConnectionOpeningAdoption,
  readPostwarSocialRuntimeFinancialReplayBase,
} from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import {
  createPostwarSocialSourcePreparation,
  readPreparedPostwarSocialFinancialReplayBase,
  consumePreparedPostwarSocialFinancialReplayBase,
} from '../../apps/world-worker/src/persistence/prepared-postwar-social-source.js';
const adoption = await loadPostwarSocialConnectionOpeningAdoption(
  path.resolve(import.meta.dirname, '../..'),
);
function fixture() {
  const query = vi.fn(async () => {
    throw Error('NO_SQL_EXPECTED');
  });
  const workerPool = {
    query,
    connect: vi.fn(async () => {
      throw Error('NO_CONNECTION_EXPECTED');
    }),
  } as unknown as Pool;
  const social = createPostwarSocialRuntimeConnection({
    worldId: 'WORLD_TEST_ONLY_FX_BINDING',
    workerId: 'WORKER_TEST_ONLY_FX_BINDING',
    workerRole: 'fixture_fx_binding_worker',
    workerPool,
    openingAdoption: adoption,
  });
  const source = createPostgresFinanceBudgetWorldCapacitySource({
    worldId: social.worldId,
    countries: [{ countryId: 'COUNTRY_01' }, { countryId: 'COUNTRY_02' }],
    historyMode: 'BUDGET_SOCIAL',
  });
  return { social, source, query, workerPool };
}
describe('private same-World financial replay source binding', () => {
  it('projects actual source cents and six-decimal values exactly without rewriting immutable original bytes', () => {
    const source = Object.freeze([
      Object.freeze({
        fundingId: 'FUNDING_TEST_ONLY_CENTS',
        accountId: 'ACCOUNT_TEST_ONLY',
        currency: 'XAA',
        ceilingAmount: '162.720000',
      }),
      Object.freeze({
        fundingId: 'FUNDING_TEST_ONLY_DUST',
        accountId: 'ACCOUNT_TEST_ONLY',
        currency: 'XAA',
        ceilingAmount: '0.0000010',
      }),
    ]);
    const bytes = JSON.stringify(source),
      projected = projectPostwarOpeningFinancialEncumbrances(source);
    expect(projected.map((r) => r.amount)).toEqual(['162.72', '0.000001']);
    expect(
      Money.from(projected[0]!.amount, 'XAA')
        .add(Money.from(projected[1]!.amount, 'XAA'))
        .toCanonicalValue().amount,
    ).toBe('162.720001');
    expect(JSON.stringify(source)).toBe(bytes);
    expect(projected.map((r) => r.reference)).toEqual(
      source.map((r) => r.fundingId),
    );
  });

  it('keeps the original source immutable and preserves the finite country selector', async () => {
    const h = fixture();
    try {
      const bound = bindPostgresFinanceBudgetCapacitySourceToSocialReplay(
        h.source,
        h.social,
      );
      expect(bound).not.toBe(h.source);
      expect(
        isPostgresFinanceBudgetWorldCapacitySource(bound, h.social.worldId),
      ).toBe(true);
      expect(readPostgresFinanceBudgetCapacitySourceScope(bound)).toEqual(
        readPostgresFinanceBudgetCapacitySourceScope(h.source),
      );
      expect(() =>
        readPostgresFinanceBudgetCapacitySourceScope({ ...bound }),
      ).toThrow('genuine');
      expect(() =>
        readPostwarSocialRuntimeFinancialReplayBase(h.social, h.social.worldId),
      ).toThrow('SOURCE_NOT_PREPARED');
      expect(() =>
        readPostwarSocialRuntimeFinancialReplayBase(
          { ...h.social },
          h.social.worldId,
        ),
      ).toThrow('GENUINE');
      expect(() =>
        readPostwarSocialRuntimeFinancialReplayBase(h.social, 'WORLD_OTHER'),
      ).toThrow('GENUINE');
      expect(h.query).not.toHaveBeenCalled();
    } finally {
      await h.social.close();
    }
    expect(() =>
      readPostwarSocialRuntimeFinancialReplayBase(h.social, h.social.worldId),
    ).toThrow('GENUINE');
  });
  it('rejects copied sources, fake/copied Social instances, wrong Worlds and unprepared data before SQL', async () => {
    const h = fixture();
    try {
      expect(() =>
        bindPostgresFinanceBudgetCapacitySourceToSocialReplay(
          { ...h.source },
          h.social,
        ),
      ).toThrow('genuine');
      expect(() =>
        bindPostgresFinanceBudgetCapacitySourceToSocialReplay(h.source, {
          ...h.social,
        }),
      ).toThrow('genuine');
      const other = createPostgresFinanceBudgetWorldCapacitySource({
        worldId: 'WORLD_OTHER',
        countries: [{ countryId: 'COUNTRY_01' }],
        historyMode: 'BUDGET_SOCIAL',
      });
      expect(() =>
        bindPostgresFinanceBudgetCapacitySourceToSocialReplay(other, h.social),
      ).toThrow('genuine');
      expect(() =>
        readPreparedPostwarSocialFinancialReplayBase(
          createPostwarSocialSourcePreparation(),
        ),
      ).toThrow('SOURCE_NOT_PREPARED');
      expect(() =>
        consumePreparedPostwarSocialFinancialReplayBase({} as never),
      ).toThrow('GENUINE');
      expect(h.query).not.toHaveBeenCalled();
    } finally {
      await h.social.close();
    }
  });
});
