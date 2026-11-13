/** Rejection ordering only. The snapshot consumer/predicate are protocol
 * doubles, not a genuine admitted source. No positive projection or SQL commit
 * is issued; real same-head/current-source acceptance remains Native's gate. */
import { expect, it, vi, beforeEach } from 'vitest';
const fixture = vi.hoisted(() => ({
  source: { withCaptainSnapshot: vi.fn() },
  consume: vi.fn(),
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
