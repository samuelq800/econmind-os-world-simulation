/** Lifecycle/protocol tests only. SQL/source admission remains a separate
 * native acceptance gate; these fixtures do not issue economic authority. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { parseCanonicalCommand, COMMAND_SCHEMA_VERSION } from '@econmind/core';
import type { DurableConsumptionStep } from '../../apps/world-worker/src/preparation/durable-command-consumption.js';
import type { PostwarSocialRuntimeConnection } from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
const fixture = vi.hoisted(() => ({
  readCommand: vi.fn(),
  readReceipt: vi.fn(),
  publish: vi.fn(),
  openingPublish: vi.fn(),
  head: { world_version: '0', event_sequence: '0' },
  industryPublish: vi.fn(),
  close: vi.fn(),
  queries: [] as string[],
  publisherRole: 'test_publisher',
  executionControlLockRequired: false,
}));
vi.mock(
  '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js',
  () => ({
    DurableV08LedgerLineageReader: class {
      readCommandReadOnlyFrom = fixture.readCommand;
    },
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/atomic-transition-repository.js',
  () => ({ readFinalReceiptFrom: fixture.readReceipt }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-mixed-current-projection-publication.js',
  () => ({
    createPostwarMixedCurrentProjectionSource: () => ({ close: fixture.close }),
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-captain-current-publication.js',
  () => ({
    createPostwarCaptainCurrentPublisher: () => ({
      publishOfficeCurrentCountry: fixture.publish,
    }),
    createPostwarCaptainOpeningCurrentPublisher: () => ({
      publishCountry: fixture.openingPublish,
    }),
  }),
);
vi.mock(
  '../../apps/world-worker/src/persistence/postwar-industry-labour-current-publication.js',
  () => ({
    createPostwarIndustryLabourCurrentPublisher: () => ({
      publishCountry: fixture.industryPublish,
    }),
  }),
);
vi.mock(
  '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js',
  () => ({
    readPostwarSocialRuntimeConnectionResources: () => ({
      workerRole: 'test_worker',
      countryIds: ['COUNTRY_01', 'COUNTRY_02', 'COUNTRY_10'],
    }),
  }),
);
import { createPostwarOfficePublicationController } from '../../apps/world-worker/src/persistence/postwar-office-publication-controller.js';
const world = 'WORLD_TEST';
const command = {
  worldId: world,
  commandId: 'COMMAND_TEST',
  countryId: 'COUNTRY_02',
  officeId: 'CAPTAIN',
  fingerprint: 'sha256:' + 'a'.repeat(64),
};
const receipt = {
  outcome: 'COMMITTED',
  commandFingerprint: command.fingerprint,
  commandId: command.commandId,
};
const step = {
  status: 'PROCESSED',
  commandId: command.commandId,
  source: 'NEW_FINAL',
  receipt,
} as unknown as Extract<DurableConsumptionStep, { status: 'PROCESSED' }>;
function controller(
  industryLabour = false,
  tradeCurrent = false,
  currentCountryIds?: readonly string[],
) {
  const database = {
    async query(sql: string) {
      fixture.queries.push(sql);
      if (sql.includes('from world_v2.world_head'))
        return { rowCount: 1, rows: [fixture.head] };
      if (fixture.executionControlLockRequired && /read only/iu.test(sql))
        throw Object.assign(
          Error('FOR SHARE cannot run in a read-only transaction'),
          { code: '25006' },
        );
      return {
        rowCount: 1,
        rows: [
          { role_name: 'test_worker', rolsuper: false, rolbypassrls: false },
        ],
      };
    },
    async transaction<T>(fn: (tx: unknown) => Promise<T>) {
      return fn(database);
    },
  } as unknown as SqlDatabase;
  return createPostwarOfficePublicationController({
    worldId: world,
    database,
    ...(currentCountryIds === undefined ? {} : { currentCountryIds }),
    ...(tradeCurrent ? { tradeCurrent: true as const } : {}),
    ...(industryLabour ? { industryLabour: true as const } : {}),
    workerRole: 'test_worker',
    publicationDatabase: {
      ...database,
      async transaction(fn) {
        return fn({
          async query() {
            return {
              rowCount: 1,
              rows: [
                {
                  role_name: fixture.publisherRole,
                  rolsuper: false,
                  rolbypassrls: false,
                  owner_member: false,
                  publisher_member: true,
                },
              ],
            };
          },
        } as unknown as SqlDatabase);
      },
    },
    socialConnection: {} as PostwarSocialRuntimeConnection,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.head = { world_version: '0', event_sequence: '0' };
  fixture.openingPublish.mockResolvedValue({});
  fixture.publisherRole = 'test_publisher';
  fixture.executionControlLockRequired = false;
  fixture.queries.length = 0;
  fixture.readCommand.mockResolvedValue(command);
  fixture.readReceipt.mockResolvedValue(receipt);
  fixture.publish.mockResolvedValue({
    head: { worldId: world, worldVersion: '3', eventSequence: '4' },
    captain: [{}],
    financial: Array.from({ length: 10 }, () => ({})),
    social: [{}, {}],
    trade: [],
  });
  fixture.industryPublish.mockResolvedValue({
    head: { worldId: world, worldVersion: '3', eventSequence: '4' },
    documents: [{}],
  });
  fixture.close.mockResolvedValue(undefined);
});
describe('fixed post-commit derived publication', () => {
  it('refreshes the registered C1/C2/C10 scope after a C10 RUN advances the global head, deduplicating the primary country', async () => {
    fixture.readCommand.mockResolvedValue({
      ...command,
      countryId: 'COUNTRY_10',
      officeId: 'INDUSTRY',
      commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
    });
    const c = controller(true, true, [
      'COUNTRY_01',
      'COUNTRY_02',
      'COUNTRY_10',
    ]);
    const result = await c.afterCommitted(step);
    expect(result).toMatchObject({
      status: 'PROCESSED',
      receipt,
      derivedPublication: {
        status: 'PUBLISHED',
        countryId: 'COUNTRY_10',
        documentCount: 42,
      },
    });
    expect(fixture.publish.mock.calls.map((call) => call[0])).toEqual([
      'COUNTRY_10',
      'COUNTRY_01',
      'COUNTRY_02',
    ]);
    expect(fixture.industryPublish.mock.calls.map((call) => call[0])).toEqual([
      'COUNTRY_10',
      'COUNTRY_01',
      'COUNTRY_02',
    ]);
    for (const country of ['COUNTRY_01', 'COUNTRY_02'])
      expect(fixture.publish).toHaveBeenCalledWith(country, {
        requireCaptain: false,
        includeTrade: true,
        expectedHead: { worldId: world, worldVersion: '3', eventSequence: '4' },
      });
    await c.close();
  });
  it.each([
    { scope: [] },
    { scope: ['COUNTRY_02', 'COUNTRY_02'] },
    { scope: ['COUNTRY_02', 'COUNTRY_03'] },
    { scope: ['COUNTRY_10'] },
  ])(
    'refuses an invalid registered scope or out-of-scope committed country before any derived writes: %j',
    async ({ scope }) => {
      const c = controller(true, false, scope);
      const result = await c.afterCommitted(step);
      expect(result).toMatchObject({
        status: 'PROCESSED',
        receipt,
        derivedPublication: { status: 'UNAVAILABLE' },
      });
      expect(fixture.publish).not.toHaveBeenCalled();
      expect(fixture.industryPublish).not.toHaveBeenCalled();
      await c.close();
    },
  );
  it('retains the C10 FINAL on later C2 publication failure and retries only the same registered derived scope', async () => {
    fixture.readCommand.mockResolvedValue({
      ...command,
      countryId: 'COUNTRY_10',
      officeId: 'INDUSTRY',
    });
    const c = controller(true, false, ['COUNTRY_02', 'COUNTRY_10']);
    const published = await fixture.publish();
    fixture.publish.mockClear();
    fixture.publish
      .mockResolvedValueOnce(published)
      .mockRejectedValueOnce(Error('C2_ACK_UNKNOWN'));
    const failed = await c.afterCommitted(step);
    expect(failed).toMatchObject({
      status: 'PROCESSED',
      receipt,
      derivedPublication: { status: 'UNAVAILABLE' },
    });
    expect(failed.status === 'PROCESSED' && failed.receipt).toBe(step.receipt);
    expect((await c.retryCommitted(command.commandId)).status).toBe(
      'PUBLISHED',
    );
    expect(fixture.publish.mock.calls.map((call) => call[0])).toEqual([
      'COUNTRY_10',
      'COUNTRY_02',
      'COUNTRY_10',
      'COUNTRY_02',
    ]);
    expect(fixture.readCommand).toHaveBeenCalledTimes(2);
    expect(fixture.readReceipt).toHaveBeenCalledTimes(2);
    expect(
      fixture.queries.every(
        (sql) =>
          sql.startsWith('select ') ||
          sql === 'set transaction isolation level repeatable read',
      ),
    ).toBe(true);
    await c.close();
  });
  it('refuses a later registered country or Industry publisher at another head while preserving the FINAL', async () => {
    const c = controller(true, false, ['COUNTRY_02', 'COUNTRY_10']);
    const published = await fixture.publish();
    fixture.publish.mockClear();
    fixture.publish.mockResolvedValueOnce(published).mockResolvedValueOnce({
      ...published,
      head: { worldId: world, worldVersion: '4', eventSequence: '5' },
    });
    expect((await c.afterCommitted(step)).derivedPublication?.status).toBe(
      'UNAVAILABLE',
    );
    expect(fixture.industryPublish).toHaveBeenCalledTimes(1);
    fixture.industryPublish
      .mockResolvedValueOnce({ head: published.head, documents: [{}] })
      .mockResolvedValueOnce({
        head: { worldId: world, worldVersion: '4', eventSequence: '5' },
        documents: [{}],
      });
    expect((await c.retryCommitted(command.commandId)).status).toBe(
      'UNAVAILABLE',
    );
    await c.close();
  });

  it('explicitly rebuilds configured C10 current pages at the held expected head without inventing a Command or FINAL', async () => {
    const c = controller(true, true, ['COUNTRY_02', 'COUNTRY_10']);
    fixture.publish.mockResolvedValueOnce({
      head: { worldId: world, worldVersion: '3', eventSequence: '4' },
      captain: [{}],
      financial: Array.from({ length: 10 }, () => ({})),
      social: [{}, {}],
      trade: [{}, {}],
    });
    const result = await c.publishCurrentCountries({
      countryIds: ['COUNTRY_10'],
      expectedHead: { worldVersion: '3', eventSequence: '4' },
    });
    expect(result).toEqual({
      status: 'PUBLISHED',
      head: { worldId: world, worldVersion: '3', eventSequence: '4' },
      countries: ['COUNTRY_10'],
      publications: [
        {
          countryId: 'COUNTRY_10',
          documentCount: 16,
          captain: 'PUBLISHED',
          industryLabour: 'PUBLISHED',
        },
      ],
    });
    expect(fixture.publish).toHaveBeenCalledExactlyOnceWith('COUNTRY_10', {
      requireCaptain: false,
      includeTrade: true,
      expectedHead: { worldId: world, worldVersion: '3', eventSequence: '4' },
    });
    expect(fixture.industryPublish).toHaveBeenCalledWith(
      'COUNTRY_10',
      result.head,
    );
    expect(fixture.readCommand).not.toHaveBeenCalled();
    expect(fixture.readReceipt).not.toHaveBeenCalled();
    await c.close();
  });
  it('does not enable the current rebuild for legacy controllers or unconfigured/foreign countries and malformed heads', async () => {
    const legacy = controller(),
      c = controller(false, false, ['COUNTRY_10']);
    const request = {
      countryIds: ['COUNTRY_10'],
      expectedHead: { worldVersion: '3', eventSequence: '4' },
    };
    await expect(legacy.publishCurrentCountries(request)).rejects.toThrow(
      'REGISTERED_CURRENT_PUBLICATION_SCOPE_REQUIRED',
    );
    for (const bad of [
      { ...request, countryIds: [] },
      { ...request, countryIds: ['COUNTRY_10', 'COUNTRY_10'] },
      { ...request, countryIds: ['COUNTRY_02'] },
      { ...request, countryIds: ['COUNTRY_03'] },
      { ...request, expectedHead: { worldVersion: '0', eventSequence: '0' } },
      { ...request, expectedHead: { worldVersion: '4', eventSequence: '3' } },
      {
        ...request,
        expectedHead: { worldVersion: '3', eventSequence: '4', simTime: '0' },
      },
      { ...request, simTime: '0' },
    ])
      await expect(c.publishCurrentCountries(bad)).rejects.toThrow(
        'EXACT_CONFIGURED_CURRENT_COUNTRIES_AND_POSITIVE_HEAD_REQUIRED',
      );
    const invalidScope = controller(false, false, ['COUNTRY_03']);
    await expect(
      invalidScope.publishCurrentCountries({
        ...request,
        countryIds: ['COUNTRY_03'],
      }),
    ).rejects.toThrow(
      'EXACT_CONFIGURED_CURRENT_COUNTRIES_AND_POSITIVE_HEAD_REQUIRED',
    );
    expect(fixture.publish).not.toHaveBeenCalled();
    expect(fixture.readCommand).not.toHaveBeenCalled();
    await legacy.close();
    await c.close();
    await invalidScope.close();
  });
  it('reuses the separate publisher identity check before current source work', async () => {
    const c = controller(false, false, ['COUNTRY_10']);
    fixture.publisherRole = 'test_worker';
    await expect(
      c.publishCurrentCountries({
        countryIds: ['COUNTRY_10'],
        expectedHead: { worldVersion: '3', eventSequence: '4' },
      }),
    ).rejects.toThrow('EXACT_SEPARATE_DERIVED_PUBLISHER_REQUIRED');
    expect(fixture.publish).not.toHaveBeenCalled();
    expect(fixture.readCommand).not.toHaveBeenCalled();
    await c.close();
  });
  it('passes the expected head to the existing held-snapshot publisher and refuses drift or a withdrawn source without economic retry', async () => {
    const c = controller(true, false, ['COUNTRY_10']);
    const request = {
      countryIds: ['COUNTRY_10'],
      expectedHead: { worldVersion: '4', eventSequence: '5' },
    };
    await expect(c.publishCurrentCountries(request)).rejects.toThrow(
      'CURRENT_COUNTRIES_EXPECTED_PUBLICATION_HEAD_MISMATCH',
    );
    expect(fixture.publish).toHaveBeenCalledWith('COUNTRY_10', {
      requireCaptain: false,
      expectedHead: { worldId: world, worldVersion: '4', eventSequence: '5' },
    });
    expect(fixture.industryPublish).not.toHaveBeenCalled();
    const rejection = Object.assign(Error('ACTUAL_SOURCE_REVOKED'), {
      code: '55000',
    });
    fixture.publish.mockRejectedValueOnce(rejection);
    await expect(
      c.publishCurrentCountries({
        ...request,
        expectedHead: { worldVersion: '3', eventSequence: '4' },
      }),
    ).rejects.toBe(rejection);
    expect(fixture.readReceipt).not.toHaveBeenCalled();
    await c.close();
  });
  it('keeps acknowledged derived countries on a later failure and can repeat the same finite list/head without inventing FINALs', async () => {
    const c = controller(false, false, ['COUNTRY_02', 'COUNTRY_10']);
    const request = {
      countryIds: ['COUNTRY_02', 'COUNTRY_10'],
      expectedHead: { worldVersion: '3', eventSequence: '4' },
    };
    fixture.publish
      .mockResolvedValueOnce({
        head: { worldId: world, worldVersion: '3', eventSequence: '4' },
        captain: [{}],
        financial: Array(10).fill({}),
        social: [{}, {}],
        trade: [],
      })
      .mockRejectedValueOnce(Error('DERIVED_WRITE_ACK_UNKNOWN'));
    await expect(c.publishCurrentCountries(request)).rejects.toThrow(
      'DERIVED_WRITE_ACK_UNKNOWN',
    );
    expect(fixture.publish.mock.calls.map((c) => c[0])).toEqual([
      'COUNTRY_02',
      'COUNTRY_10',
    ]);
    expect((await c.publishCurrentCountries(request)).countries).toEqual(
      request.countryIds,
    );
    expect(fixture.readCommand).not.toHaveBeenCalled();
    expect(fixture.readReceipt).not.toHaveBeenCalled();
    await c.close();
  });
  it('joins an explicit current rebuild before retiring the source and refuses another rebuild after close starts', async () => {
    const c = controller(false, false, ['COUNTRY_10']);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fixture.publish.mockImplementationOnce(async () => {
      await gate;
      return {
        head: { worldId: world, worldVersion: '3', eventSequence: '4' },
        captain: [{}],
        financial: Array(10).fill({}),
        social: [{}, {}],
        trade: [],
      };
    });
    const request = {
      countryIds: ['COUNTRY_10'],
      expectedHead: { worldVersion: '3', eventSequence: '4' },
    };
    const work = c.publishCurrentCountries(request);
    await vi.waitFor(() => expect(fixture.publish).toHaveBeenCalledOnce());
    const closing = c.close();
    expect(fixture.close).not.toHaveBeenCalled();
    await expect(c.publishCurrentCountries(request)).rejects.toThrow(
      'PUBLICATION_CONTROLLER_CLOSED',
    );
    release();
    await work;
    await closing;
    expect(fixture.close).toHaveBeenCalledOnce();
  });
  it('publishes finite configured Captain H0 countries before any economic command, without a country01 fallback', async () => {
    const c = controller();
    expect(
      await c.publishOpeningCaptainCountries(['COUNTRY_02', 'COUNTRY_03']),
    ).toMatchObject({
      status: 'PUBLISHED',
      head: { worldVersion: '0', eventSequence: '0' },
      countries: ['COUNTRY_02', 'COUNTRY_03'],
    });
    expect(fixture.openingPublish.mock.calls.map((v) => v[0])).toEqual([
      'COUNTRY_02',
      'COUNTRY_03',
    ]);
    expect(fixture.readCommand).not.toHaveBeenCalled();
    expect(fixture.publish).not.toHaveBeenCalled();
    await c.close();
  });
  it('skips an actual nonzero head, rejects malformed scope/head, and does not hide a withdrawn H0 source', async () => {
    const c = controller();
    fixture.head = { world_version: '1', event_sequence: '3' };
    expect(
      (await c.publishOpeningCaptainCountries(['COUNTRY_02'])).status,
    ).toBe('SKIPPED_NONZERO_HEAD');
    expect(fixture.openingPublish).not.toHaveBeenCalled();
    await expect(c.publishOpeningCaptainCountries([])).rejects.toThrow(
      'FINITE',
    );
    await expect(
      c.publishOpeningCaptainCountries(['COUNTRY_02', 'COUNTRY_02']),
    ).rejects.toThrow('FINITE');
    fixture.head = { world_version: '0', event_sequence: '1' };
    await expect(
      c.publishOpeningCaptainCountries(['COUNTRY_02']),
    ).rejects.toThrow('ACTUAL_OPENING');
    fixture.head = { world_version: '0', event_sequence: '0' };
    const rejected = Error('ACTUAL_SOURCE_REVOKED');
    fixture.openingPublish.mockRejectedValueOnce(rejected);
    await expect(c.publishOpeningCaptainCountries(['COUNTRY_02'])).rejects.toBe(
      rejected,
    );
    await c.close();
    await expect(
      c.publishOpeningCaptainCountries(['COUNTRY_02']),
    ).rejects.toThrow('CLOSED');
  });
  it('rejects an ordinary worker wired as publisher before holding a source or reading commands', async () => {
    const c = controller();
    fixture.publisherRole = 'test_worker';
    const result = await c.afterCommitted(step);
    expect(result.derivedPublication?.status).toBe('UNAVAILABLE');
    expect(fixture.readCommand).not.toHaveBeenCalled();
    expect(fixture.publish).not.toHaveBeenCalled();
    await c.close();
  });
  it('keeps a durable FINAL and retries only its derived readback after publication fails', async () => {
    const c = controller();
    fixture.publish.mockRejectedValueOnce(
      Error('TEST_ONLY_PUBLICATION_CONNECTION_LOST'),
    );
    const first = await c.afterCommitted(step);
    if (first.status !== 'PROCESSED')
      throw Error('FINAL_MUST_REMAIN_PROCESSED');
    expect(first.receipt).toBe(step.receipt);
    expect(first.status).toBe('PROCESSED');
    expect(first.derivedPublication?.status).toBe('UNAVAILABLE');
    const retried = await c.retryCommitted(command.commandId);
    expect(retried).toMatchObject({
      status: 'PUBLISHED',
      countryId: 'COUNTRY_02',
      documentCount: 13,
    });
    expect(fixture.publish).toHaveBeenLastCalledWith('COUNTRY_02', {
      requireCaptain: true,
    });
    expect(
      fixture.queries.every(
        (sql) =>
          sql.startsWith('select ') ||
          sql === 'set transaction isolation level repeatable read',
      ),
    ).toBe(true);
    await c.close();
  });
  it('allows the formal execution-control SHARE lock while retrying only durable readback', async () => {
    fixture.executionControlLockRequired = true;
    const c = controller();
    expect(await c.retryCommitted(command.commandId)).toMatchObject({
      status: 'PUBLISHED',
      documentCount: 13,
    });
    expect(fixture.readCommand).toHaveBeenCalledOnce();
    expect(fixture.readReceipt).toHaveBeenCalledOnce();
    expect(fixture.queries[0]).toBe(
      'set transaction isolation level repeatable read',
    );
    expect(
      fixture.queries.some((sql) => /\b(insert|update|delete)\b/iu.test(sql)),
    ).toBe(false);
    await c.close();
  });
  it('publishes explicitly installed Industry headcount at the same head and counts actual documents', async () => {
    const c = controller(true);
    expect(await c.retryCommitted(command.commandId)).toMatchObject({
      status: 'PUBLISHED',
      documentCount: 14,
      industryLabour: 'PUBLISHED',
    });
    expect(fixture.industryPublish).toHaveBeenCalledWith('COUNTRY_02', {
      worldId: world,
      worldVersion: '3',
      eventSequence: '4',
    });
    await c.close();
  });
  it('retains the FINAL on partial page failure and retries without accepting a mismatched head', async () => {
    const c = controller(true);
    fixture.industryPublish.mockRejectedValueOnce(
      Error('INDUSTRY_SCOPE_MISSING'),
    );
    const first = await c.afterCommitted(step);
    expect(first).toMatchObject({
      status: 'PROCESSED',
      receipt: step.receipt,
      derivedPublication: { status: 'UNAVAILABLE' },
    });
    fixture.industryPublish.mockResolvedValueOnce({
      head: { worldId: world, worldVersion: '4', eventSequence: '5' },
      documents: [{}],
    });
    expect((await c.retryCommitted(command.commandId)).status).toBe(
      'UNAVAILABLE',
    );
    expect((await c.retryCommitted(command.commandId)).status).toBe(
      'PUBLISHED',
    );
    expect(fixture.readReceipt).toHaveBeenCalledTimes(3);
    await c.close();
  });
  it('does not infer a country or committed outcome from the caller receipt', async () => {
    const c = controller();
    fixture.readCommand.mockResolvedValueOnce({
      ...command,
      worldId: 'WORLD_OTHER',
    });
    expect((await c.afterCommitted(step)).derivedPublication?.status).toBe(
      'UNAVAILABLE',
    );
    fixture.readReceipt.mockResolvedValueOnce({
      ...receipt,
      commandFingerprint: 'sha256:' + 'b'.repeat(64),
    });
    expect((await c.retryCommitted(command.commandId)).status).toBe(
      'UNAVAILABLE',
    );
    fixture.readReceipt.mockResolvedValueOnce(null);
    expect((await c.retryCommitted(command.commandId)).status).toBe(
      'UNAVAILABLE',
    );
    expect(fixture.publish).not.toHaveBeenCalled();
    await c.close();
  });
  it('leaves idle, blocked, failed and rejected results untouched without reading a source', async () => {
    const c = controller();
    const cases = [
      { status: 'IDLE' },
      { status: 'BLOCKED', reason: 'SOURCE_MISSING', commandId: null },
      {
        status: 'FAILED',
        reason: 'OPERATIONAL_FAILURE_REQUIRES_RECOVERY',
        commandId: null,
      },
      { ...step, receipt: { ...receipt, outcome: 'REJECTED' } },
    ] as DurableConsumptionStep[];
    for (const input of cases)
      expect(await c.afterCommitted(input)).toBe(input);
    expect(fixture.readCommand).not.toHaveBeenCalled();
    expect(fixture.publish).not.toHaveBeenCalled();
    await c.close();
  });
  it('drains an in-flight publication before closing the source and closes once', async () => {
    const c = controller();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fixture.publish.mockImplementationOnce(async () => {
      await gate;
      return {
        head: { worldId: world, worldVersion: '3', eventSequence: '4' },
        captain: [{}],
        financial: Array(10).fill({}),
        social: [{}, {}],
        trade: [],
      };
    });
    const pending = c.afterCommitted(step);
    await vi.waitFor(() => expect(fixture.publish).toHaveBeenCalledOnce());
    const closing = c.close();
    expect(c.close()).toBe(closing);
    expect(fixture.close).not.toHaveBeenCalled();
    expect((await c.retryCommitted(command.commandId)).status).toBe(
      'UNAVAILABLE',
    );
    release();
    await pending;
    await closing;
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.publish).toHaveBeenCalledOnce();
  });
});

it('publishes both actual committed Trade parties at one observed head, and retries projection only when their heads differ', async () => {
  const sha = (text: string) => createHash('sha256').update(text).digest('hex');
  const original = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: world,
      countryId: 'COUNTRY_01',
      officeId: 'TRADE',
      actorId: 'ACTOR_TEST_TRADE',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: 'COMMAND_TEST_TRADE_CURRENT',
      commandType: 'CORE_GOODS_TRANSFER_V1',
      expectedWorldVersion: '0',
      idempotencyKey: 'KEY_TEST_TRADE_CURRENT',
      correlationId: 'CORRELATION_TEST_TRADE_CURRENT',
      simTime: '0',
      submittedAtReal: '2026-11-08T00:00:00.000Z',
      payload: {
        schemaVersion: 'core-goods-transfer-v1',
        commodityId: 'GRAIN',
        sellerCountryId: 'COUNTRY_01',
        buyerCountryId: 'COUNTRY_02',
        quantity: { amount: '1', unit: 'tonne' },
        price: { amount: '1', currency: 'GCU', perUnit: 'tonne' },
        assetSource: {
          batchId: 'BATCH_TEST',
          physicalLocationId: 'LOCATION_TEST',
          titleHolderId: 'ENTITY_TEST',
          riskBearerId: 'ENTITY_TEST',
          economicRecognitionId: null,
        },
        paymentSource: 'BUYER_TREASURY_GCU',
        policyVersion: 'V10_TREASURY_GCU_V1',
        threshold: {
          policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
          maxSettlement: { amount: '6', currency: 'GCU' },
        },
        expiresAtReal: '2026-11-08T01:00:00.000Z',
      },
    },
    sha,
  );
  fixture.readCommand.mockResolvedValue(original);
  fixture.readReceipt.mockResolvedValue({
    outcome: 'COMMITTED',
    commandFingerprint: original.fingerprint,
    commandId: original.commandId,
  });
  fixture.publish.mockResolvedValue({
    head: { worldId: world, worldVersion: '3', eventSequence: '4' },
    captain: [{}],
    financial: Array(10).fill({}),
    social: [{}, {}],
    trade: [{}, {}],
  });
  const c = controller(false, true);
  try {
    expect(await c.retryCommitted(original.commandId)).toMatchObject({
      status: 'PUBLISHED',
      countryId: 'COUNTRY_01',
      documentCount: 30,
    });
    expect(fixture.publish.mock.calls.map((x) => x[0])).toEqual([
      'COUNTRY_01',
      'COUNTRY_02',
    ]);
    expect(
      fixture.publish.mock.calls.every((x) => x[1].includeTrade === true),
    ).toBe(true);
    const formal = controller(true, true, ['COUNTRY_01', 'COUNTRY_10']);
    fixture.publish.mockClear();
    expect(await formal.retryCommitted(original.commandId)).toMatchObject({
      status: 'PUBLISHED',
      documentCount: 48,
    });
    expect(fixture.publish.mock.calls.map((call) => call[0])).toEqual([
      'COUNTRY_01',
      'COUNTRY_10',
      'COUNTRY_02',
    ]);
    expect(fixture.industryPublish.mock.calls.map((call) => call[0])).toEqual([
      'COUNTRY_01',
      'COUNTRY_10',
      'COUNTRY_02',
    ]);
    await formal.close();
    fixture.publish
      .mockResolvedValueOnce({
        head: { worldId: world, worldVersion: '3', eventSequence: '4' },
        captain: [],
        financial: Array(10).fill({}),
        social: [{}, {}],
        trade: [{}, {}],
      })
      .mockResolvedValueOnce({
        head: { worldId: world, worldVersion: '4', eventSequence: '5' },
        captain: [],
        financial: Array(10).fill({}),
        social: [{}, {}],
        trade: [{}, {}],
      });
    expect(await c.retryCommitted(original.commandId)).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'DERIVED_PUBLICATION_REQUIRES_RETRY',
    });
  } finally {
    await c.close();
  }
});
