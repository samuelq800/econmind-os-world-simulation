/** Lifecycle/protocol tests only. SQL/source admission remains a separate
 * native acceptance gate; these fixtures do not issue economic authority. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DurableConsumptionStep } from '../../apps/world-worker/src/preparation/durable-command-consumption.js';
import type { PostwarSocialRuntimeConnection } from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
const fixture = vi.hoisted(() => ({
  readCommand: vi.fn(),
  readReceipt: vi.fn(),
  publish: vi.fn(),
  close: vi.fn(),
  queries: [] as string[],
  publisherRole: 'test_publisher',
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
function controller() {
  const database = {
    async query(sql: string) {
      fixture.queries.push(sql);
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
  fixture.publisherRole = 'test_publisher';
  fixture.queries.length = 0;
  fixture.readCommand.mockResolvedValue(command);
  fixture.readReceipt.mockResolvedValue(receipt);
  fixture.publish.mockResolvedValue({
    head: { worldId: world, worldVersion: '3', eventSequence: '4' },
    captain: [{}],
    financial: Array.from({ length: 10 }, () => ({})),
    social: [{}, {}],
  });
  fixture.close.mockResolvedValue(undefined);
});
describe('fixed post-commit derived publication', () => {
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
          sql === 'set transaction isolation level repeatable read read only',
      ),
    ).toBe(true);
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
