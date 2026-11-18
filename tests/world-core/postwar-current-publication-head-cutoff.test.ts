/** Publisher orchestration only. Snapshot/mapper/SQL protocol doubles do not
 * issue a genuine admitted source or economic authority. Native acceptance
 * still verifies real same-head/source derivation and SQL publication. */
import { expect, it, vi, beforeEach } from 'vitest';
const fixture = vi.hoisted(() => ({
  source: { withCaptainSnapshot: vi.fn() },
  consume: vi.fn(),
  financial: vi.fn(),
  social: vi.fn(),
  industry: vi.fn(),
}));
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-mixed-current-projection-publication.js',
  async (original) => ({
    ...(await original<
      typeof import('../../apps/world-worker/src/persistence/postwar-mixed-current-projection-publication.js')
    >()),
    isPostwarMixedCurrentProjectionSource: (value: unknown) =>
      value === fixture.source,
    consumePostwarMixedCurrentProjectionSnapshotFrom: fixture.consume,
    derivePostwarMixedSocialCurrentFrom: fixture.social,
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-mixed-financial-current-publication.js',
  async (original) => ({
    ...(await original<
      typeof import('../../apps/world-worker/src/persistence/postwar-mixed-financial-current-publication.js')
    >()),
    derivePostwarMixedFinancialCurrentFrom: fixture.financial,
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-industry-labour-current-publication.js',
  async (original) => ({
    ...(await original<
      typeof import('../../apps/world-worker/src/persistence/postwar-industry-labour-current-publication.js')
    >()),
    derivePostwarIndustryLabourCurrentFrom: fixture.industry,
  }),
);
import { createPostwarCaptainCurrentPublisher } from '../../apps/world-worker/src/persistence/postwar-captain-current-publication.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
beforeEach(() => vi.resetAllMocks());
it('rejects the actual held-head difference inside the fixed publisher before mapping facts or opening a publisher transaction', async () => {
  let publisherBorrows = 0;
  const database: SqlDatabase = {
    query: async () => {
      throw Error('UNEXPECTED_SQL');
    },
    transaction: async () => {
      publisherBorrows++;
      throw Error('UNEXPECTED_PUBLISHER_BORROW');
    },
  };
  fixture.consume.mockReturnValue({
    head: { worldId: 'WORLD_TEST_ONLY', worldVersion: '3', eventSequence: '4' },
  });
  fixture.source.withCaptainSnapshot.mockImplementation(
    async (
      _country: string,
      consume: (tx: unknown, token: unknown) => Promise<unknown>,
    ) => consume({}, {}),
  );
  const publisher = createPostwarCaptainCurrentPublisher({
    source: fixture.source as never,
    publicationDatabase: database,
  });
  for (const expectedHead of [
    { worldId: 'WORLD_TEST_ONLY', worldVersion: '4', eventSequence: '5' },
    { worldId: 'WORLD_TEST_ONLY', worldVersion: '3', eventSequence: '5' },
    { worldId: 'WORLD_OTHER', worldVersion: '3', eventSequence: '4' },
  ])
    await expect(
      publisher.publishOfficeCurrentCountry('COUNTRY_10', {
        requireCaptain: false,
        expectedHead,
      }),
    ).rejects.toThrow('CURRENT_COUNTRIES_EXPECTED_PUBLICATION_HEAD_MISMATCH');
  expect(publisherBorrows).toBe(0);
  expect(fixture.consume).toHaveBeenCalledTimes(3);
});
it('does not convert an actual upstream revoked-source failure into an absent Captain original or a successful rebuild', async () => {
  let publisherBorrows = 0;
  const database: SqlDatabase = {
    query: async () => {
      throw Error('UNEXPECTED_SQL');
    },
    transaction: async () => {
      publisherBorrows++;
      throw Error('UNEXPECTED_PUBLISHER_BORROW');
    },
  };
  const revoked = Object.assign(Error('TEST_ONLY_UPSTREAM_SOURCE_REVOKED'), {
    code: '55000',
  });
  fixture.source.withCaptainSnapshot.mockRejectedValueOnce(revoked);
  const publisher = createPostwarCaptainCurrentPublisher({
    source: fixture.source as never,
    publicationDatabase: database,
  });
  await expect(
    publisher.publishOfficeCurrentCountry('COUNTRY_10', {
      requireCaptain: false,
      expectedHead: {
        worldId: 'WORLD_TEST_ONLY',
        worldVersion: '3',
        eventSequence: '4',
      },
    }),
  ).rejects.toBe(revoked);
  expect(publisherBorrows).toBe(0);
  expect(fixture.consume).not.toHaveBeenCalled();
});

it.each(['success', 'wrongIndustryHead', 'industrySqlFailure'])(
  'shares one held replay and one atomic publication transaction with Industry: %s',
  async (scenario) => {
    const tx = {},
      token = {},
      social = {},
      outcomes: string[] = [],
      queries: string[] = [];
    fixture.consume.mockReturnValue({
      head: {
        worldId: 'WORLD_TEST_ONLY',
        worldVersion: '3',
        eventSequence: '4',
      },
      captainOriginalStatus: 'NO_REGISTERED_CAPTAIN_ORIGINAL',
      coverage: { pageProof: {} },
    });
    fixture.financial.mockReturnValue({ assertion: 'FINANCIAL_TEST_ONLY' });
    fixture.social.mockReturnValue('SOCIAL_TEST_ONLY');
    fixture.industry.mockResolvedValue({ assertion: 'INDUSTRY_TEST_ONLY' });
    fixture.source.withCaptainSnapshot.mockImplementation(
      async (_country, consume) => consume(tx, token),
    );
    const publication = {
      async query(sql: string) {
        queries.push(sql);
        if (sql.startsWith('set ')) return { rows: [] };
        expect(sql).toContain('publish_postwar_office_current_bundle');
        if (scenario === 'industrySqlFailure')
          throw Error('TEST_ONLY_INDUSTRY_SQL_FAILURE');
        return {
          rows: [
            ['FINANCIAL', 10],
            ['SOCIAL', 2],
            ['INDUSTRY', 1],
          ].flatMap(([kind, count]) =>
            Array.from({ length: Number(count) }, () => ({
              publication_kind: kind,
              country_id: 'COUNTRY_10',
              world_version:
                kind === 'INDUSTRY' && scenario === 'wrongIndustryHead'
                  ? '4'
                  : '3',
              event_sequence:
                kind === 'INDUSTRY' && scenario === 'wrongIndustryHead'
                  ? '5'
                  : '4',
            })),
          ),
        };
      },
    };
    const database = {
      async transaction(
        consume: (executor: typeof publication) => Promise<unknown>,
      ) {
        try {
          const value = await consume(publication);
          outcomes.push('COMMIT');
          return value;
        } catch (error) {
          outcomes.push('ROLLBACK');
          throw error;
        }
      },
    } as unknown as SqlDatabase;
    const publisher = createPostwarCaptainCurrentPublisher({
      source: fixture.source as never,
      publicationDatabase: database,
      socialConnection: social as never,
    });
    const work = publisher.publishOfficeCurrentCountry('COUNTRY_10', {
      requireCaptain: false,
      includeIndustryLabour: true,
    });
    if (scenario === 'success') {
      expect(await work).toMatchObject({
        documentCounts: {
          financial: 10,
          social: 2,
          industryLabour: 1,
          total: 13,
        },
        industryLabour: [
          { country_id: 'COUNTRY_10', world_version: '3', event_sequence: '4' },
        ],
      });
      expect(outcomes).toEqual(['COMMIT']);
    } else {
      await expect(work).rejects.toThrow(
        scenario === 'wrongIndustryHead'
          ? 'CURRENT_PUBLICATION_HEAD_DIFFERS_FROM_HELD_CORE'
          : 'TEST_ONLY_INDUSTRY_SQL_FAILURE',
      );
      expect(outcomes).toEqual(['ROLLBACK']);
    }
    expect(fixture.source.withCaptainSnapshot).toHaveBeenCalledOnce();
    expect(fixture.industry).toHaveBeenCalledExactlyOnceWith(tx, token, social);
    expect(queries.filter((q) => q.startsWith('select '))).toHaveLength(1);
  },
);
