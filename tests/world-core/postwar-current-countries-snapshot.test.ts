/** Snapshot lifetime/orchestration only. The page-reader and prepared source
 * are protocol doubles; this is not genuine Core/SQL admission evidence. */
import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  baseline: {},
  financial: Object.freeze({ testOnly: true }),
  database: { transaction: vi.fn() },
  lock: vi.fn(),
  read: vi.fn(),
  release: vi.fn(),
  fence: vi.fn(),
}));
vi.mock(
  '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js',
  async (original) => ({
    ...(await original<object>()),
    isPostwarSocialRuntimeConnection: () => true,
    readPostwarSocialRuntimeFinancialReplayBase: () => f.baseline,
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/prepared-postwar-social-source.js',
  async (original) => ({
    ...(await original<object>()),
    consumePreparedPostwarSocialFinancialReplayBase: () => ({
      pins: {
        contentHash: 'sha256:' + 'a'.repeat(64),
        admissionRef: 'ADMISSION_TEST_ONLY',
        seedRef: 'SEED_TEST_ONLY',
      },
      document: {
        countries: [{ countryId: 'COUNTRY_01' }, { countryId: 'COUNTRY_02' }],
      },
    }),
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-social-position-runtime.js',
  async (original) => ({
    ...(await original<object>()),
    requirePostwarSocialSourceRevocationFence: f.fence,
    createPostwarSocialSourceRoleScope: () => ({
      withSourceReaderFrom: (_tx: unknown, consume: () => unknown) => consume(),
    }),
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postgres-social-operating-custody.js',
  async (original) => ({
    ...(await original<object>()),
    lockRegisteredSourceFrom: f.lock,
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-paged-finance-social-replay.js',
  async (original) => ({
    ...(await original<object>()),
    readPostwarPagedFinanceSocialReplayFrom: f.read,
    releasePostwarPagedFinanceSocialReplay: f.release,
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-paged-current-proof.js',
  async (original) => ({
    ...(await original<object>()),
    readPostwarPagedCurrentProof: () => ({
      coverage: {
        coveredThroughEventId: 'EVENT_TEST_ONLY',
        coveredThroughEventFingerprint: 'sha256:' + 'b'.repeat(64),
      },
    }),
  }),
);
import {
  createPostwarMixedCurrentProjectionSource,
  consumePostwarMixedCurrentProjectionSnapshotFrom,
  type PostwarMixedCurrentProjectionSnapshot,
} from '../../apps/world-worker/src/persistence/postwar-mixed-current-projection-publication.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const countries = [
  { countryId: 'COUNTRY_01', requireCaptain: false },
  { countryId: 'COUNTRY_02', requireCaptain: false },
];
beforeEach(() => {
  vi.resetAllMocks();
  f.database.transaction.mockImplementation(async (consume) => consume({}));
  f.lock.mockResolvedValue({
    rows: [
      {
        seed_fingerprint: 'sha256:' + 'a'.repeat(64),
        admission_ref: 'ADMISSION_TEST_ONLY',
      },
    ],
  });
  f.read.mockResolvedValue({
    view: {
      head: { worldVersion: '3', eventSequence: '4' },
      result: {
        financialState: f.financial,
        socialCountries: [],
        socialReservations: [],
        budgetState: {},
        budgetEncumbrances: [],
      },
    },
    currentProof: {},
    captainOriginalStatuses: {
      COUNTRY_01: 'PRESENT',
      COUNTRY_02: 'NO_REGISTERED_CAPTAIN_ORIGINAL',
    },
  });
});
it.each([
  'success',
  'revokedSecondSource',
  'missingSecondStatus',
  'callbackFailure',
])(
  'holds one replay for both country tokens, retains each source check and retires tokens: %s',
  async (scenario) => {
    if (scenario === 'revokedSecondSource')
      f.lock
        .mockResolvedValueOnce({
          rows: [
            {
              seed_fingerprint: 'sha256:' + 'a'.repeat(64),
              admission_ref: 'ADMISSION_TEST_ONLY',
            },
          ],
        })
        .mockRejectedValueOnce(Error('TEST_ONLY_SECOND_SOURCE_REVOKED'));
    if (scenario === 'missingSecondStatus') {
      const paged = await f.read();
      f.read.mockClear();
      f.read.mockResolvedValue({
        ...paged,
        captainOriginalStatuses: { COUNTRY_01: 'PRESENT' },
      });
    }
    const source = createPostwarMixedCurrentProjectionSource({
      worldId: 'WORLD_TEST_ONLY',
      workerRole: 'worker_protocol_only',
      socialConnection: { database: f.database } as never,
      publicationDatabase: {} as never,
      historyMode: 'PAGED_COMPLETE_V1',
    });
    let tokens: readonly PostwarMixedCurrentProjectionSnapshot[] = [],
      executor: SqlExecutor | undefined;
    const consume = vi.fn(
      async (
        tx: SqlExecutor,
        issued: readonly PostwarMixedCurrentProjectionSnapshot[],
      ) => {
        tokens = issued;
        executor = tx;
        const facts = issued.map((token) =>
          consumePostwarMixedCurrentProjectionSnapshotFrom(tx, token),
        );
        expect(facts.map((value) => value.countryId)).toEqual([
          'COUNTRY_01',
          'COUNTRY_02',
        ]);
        expect(facts[0]!.financial).toBe(facts[1]!.financial);
        expect(facts.map((value) => value.captainOriginalStatus)).toEqual([
          'PRESENT',
          'NO_REGISTERED_CAPTAIN_ORIGINAL',
        ]);
        expect(() =>
          consumePostwarMixedCurrentProjectionSnapshotFrom(
            {} as SqlExecutor,
            issued[0]!,
          ),
        ).toThrow('GENUINE_LIVE');
        if (scenario === 'callbackFailure')
          throw Error('TEST_ONLY_CALLBACK_FAILED');
        return 'published';
      },
    );
    const work = source.withCaptainCountriesSnapshot(countries, consume);
    if (scenario === 'success') expect(await work).toBe('published');
    else
      await expect(work).rejects.toThrow(
        scenario === 'revokedSecondSource'
          ? 'TEST_ONLY_SECOND_SOURCE_REVOKED'
          : scenario === 'missingSecondStatus'
            ? 'ACTUAL_COUNTRY_CAPTAIN_STATUS_REQUIRED'
            : 'TEST_ONLY_CALLBACK_FAILED',
      );
    expect(f.database.transaction).toHaveBeenCalledOnce();
    expect(f.lock.mock.calls.map((call) => call[2])).toEqual([
      'COUNTRY_01',
      'COUNTRY_02',
    ]);
    expect(f.read).toHaveBeenCalledTimes(
      scenario === 'revokedSecondSource' ? 0 : 1,
    );
    expect(f.release).toHaveBeenCalledTimes(
      scenario === 'revokedSecondSource' ? 0 : 1,
    );
    for (const token of tokens)
      expect(() =>
        consumePostwarMixedCurrentProjectionSnapshotFrom(executor!, token),
      ).toThrow('GENUINE_LIVE');
    await source.close();
  },
);
