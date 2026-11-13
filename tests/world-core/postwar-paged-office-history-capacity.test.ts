/** Real Core capacity fixture, not yet an assertion of native SQL capacity. */
import { describe, expect, it } from 'vitest';
import { createPagedCaptainBudgetCapacityFrames } from '../support/postwar-paged-office-history-capacity-fixture.js';
describe('known economic Core frames beyond the old 256 history bound', () => {
  it('builds actual Budget/Captain/FX frames and complete transaction page boundaries without unknown events', async () => {
    const f = await createPagedCaptainBudgetCapacityFrames();
    expect(f.frames).toHaveLength(260);
    expect(
      f.frames.filter(
        (x) => x.command.commandType === 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
      ),
    ).toHaveLength(257);
    expect(f.pages[0]).toHaveLength(256);
    expect(f.pages[0]!.flatMap((x) => x.events)).toHaveLength(256);
    expect(f.pages[1]!.flatMap((x) => x.events)).toHaveLength(6);
    expect(f.final.head).toEqual({ worldVersion: '260', eventSequence: '262' });
    expect(f.frames.every((x) => x.receipt.outcome === 'COMMITTED')).toBe(true);
    expect(
      new Set(f.frames.flatMap((x) => x.events).map((x) => x.eventType)),
    ).not.toContain('UNKNOWN');
  }, 30000);
});

import { createPagedOfficeSqlCapacityFixture } from '../support/postwar-paged-office-history-sql-fixture.js';
import { createPostwarBoundedPrefixPageReaderFrom } from '../../apps/world-worker/src/persistence/postgres-postwar-bounded-prefix-pages.js';
import {
  readPostwarPagedCaptainHistoryOriginalsFrom,
  POSTWAR_PAGED_CAPTAIN_ORIGINALS_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-paged-office-history-originals.js';
it('reads the real 260-frame economic journal and Captain originals across SQL pages using the actual low role', async () => {
  const core = await createPagedCaptainBudgetCapacityFrames();
  const f = await createPagedOfficeSqlCapacityFixture(core);
  const args = [
    f.seed.worldId,
    'COUNTRY_01',
    'FINANCE',
    f.seed.fingerprint,
    f.admission,
    '260',
    '262',
  ];
  try {
    const pages = await f.asFinance(async (tx) => {
      const reader = createPostwarBoundedPrefixPageReaderFrom(tx, {
        worldId: f.seed.worldId,
        countryId: 'COUNTRY_01',
        officeId: 'FINANCE',
        seedFingerprint: f.seed.fingerprint,
        admissionRef: f.admission,
      });
      const all = [];
      for (;;) {
        const page = await reader.readNext();
        if (!page) break;
        const originals = await readPostwarPagedCaptainHistoryOriginalsFrom(
          tx,
          {
            ...page,
            worldId: f.seed.worldId,
            hostCountryId: 'COUNTRY_01',
            officeId: 'FINANCE',
            seedFingerprint: f.seed.fingerprint,
            admissionRef: f.admission,
            sourceMetadata: core.sourceMetadata,
            mode: 'TEST_ONLY_LOCAL',
          },
        );
        expect(originals.captainOriginalStatus).toBe('PRESENT');
        expect(originals.captainCountries).toEqual([core.captain]);
        expect(page.frames.flatMap((x) => x.events).length).toBeLessThanOrEqual(
          256,
        );
        all.push(page);
      }
      expect(reader.inspect().complete).toBe(true);
      return all;
    });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((p) => p.frames)).toHaveLength(260);
    expect(
      pages.flatMap((p) => p.frames.flatMap((x) => x.events)),
    ).toHaveLength(262);
    expect(pages.at(-1)!.throughHead).toEqual(core.expectedHead);
    expect(
      pages.flatMap((p) => p.frames.map((x) => x.command.fingerprint)),
    ).toEqual(core.frames.map((x) => x.command.fingerprint));
    await expect(
      f.asFinance((tx) =>
        tx.query(POSTWAR_PAGED_CAPTAIN_ORIGINALS_QUERY, [
          ...args,
          '256',
          '256',
          '259',
          '260',
        ]),
      ),
    ).rejects.toMatchObject({
      code: '55000',
      message: 'PAGED_ORIGINALS_COMPLETE_TRANSACTION_BOUNDARIES_REQUIRED',
    });
    await expect(
      f.asFinance((tx) =>
        tx.query('select * from world_v2.captain_operating_original'),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await f.db.query(
      'insert into world_v2.finance_budget_policy_revocation values($1)',
      ['FINANCE_' + f.seed.worldId],
    );
    await expect(
      f.asFinance((tx) =>
        tx.query(POSTWAR_PAGED_CAPTAIN_ORIGINALS_QUERY, [
          ...args,
          '256',
          '256',
          '260',
          '262',
        ]),
      ),
    ).rejects.toMatchObject({
      code: '55000',
      message: 'CAPTAIN_HISTORY_CURRENT_HOST_SOURCE_REQUIRED',
    });
    expect(
      (
        await f.db.query(
          'select count(*)::text n from world_v2.command_receipt',
        )
      ).rows,
    ).toEqual([{ n: '260' }]);
  } finally {
    await f.close();
  }
}, 30000);
