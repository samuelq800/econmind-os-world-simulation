import { describe, expect, it, vi } from 'vitest';
import { withCloudflarePostgresPools } from '../../apps/world-api/src/runtime-preparation/cloudflare-postgres-pools.js';
import { PostgresTransactionError } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';

const connections = {
  readerConnectionString:
    'postgresql://test_reader:TEST_ONLY@127.0.0.1/test_only',
  intakeConnectionString:
    'postgresql://test_intake:TEST_ONLY@127.0.0.1/test_only',
};
describe('request-scoped Cloudflare pg pools (no database I/O in these controls)', () => {
  it('keeps real pool identity, bounds connections and closes both ports', async () => {
    let retained:
      | Parameters<Parameters<typeof withCloudflarePostgresPools>[1]>[0]
      | undefined;
    expect(
      await withCloudflarePostgresPools(connections, async (pools) => {
        retained = pools;
        expect(Object.isFrozen(pools)).toBe(true);
        expect(pools.reader).not.toBe(pools.intake);
        expect(pools.reader.options.max).toBe(2);
        expect(pools.intake.options.max).toBe(2);
        expect(pools.reader.options.connectionTimeoutMillis).toBe(3000);
        return 'COMPLETE';
      }),
    ).toBe('COMPLETE');
    expect(retained).toBeDefined();
    await expect(retained!.reader.connect()).rejects.toThrow(
      'Cannot use a pool after calling end',
    );
    await expect(retained!.intake.connect()).rejects.toThrow(
      'Cannot use a pool after calling end',
    );
  });
  it('preserves an unknown COMMIT outcome and invokes the operation exactly once', async () => {
    const unknown = new PostgresTransactionError({
      outcome: 'COMMIT_OUTCOME_UNKNOWN',
      cause: new Error('TEST_ONLY_ACK_LOSS_CONTROL'),
    });
    const operation = vi.fn(async () => {
      throw unknown;
    });
    await expect(
      withCloudflarePostgresPools(connections, operation),
    ).rejects.toBe(unknown);
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it('refuses a successful result after an idle connection failure without leaking driver details', async () => {
    await expect(
      withCloudflarePostgresPools(connections, async ({ reader }) => {
        reader.emit('error', new Error('TEST_ONLY_CREDENTIAL_MUST_NOT_APPEAR'));
        return 'DO_NOT_ACKNOWLEDGE';
      }),
    ).rejects.toThrow('CLOUDFLARE_POSTGRES_CLEANUP_UNCONFIRMED');
  });
  it('refuses a successful result when cleanup fails', async () => {
    await expect(
      withCloudflarePostgresPools(connections, async ({ intake }) => {
        const end = intake.end.bind(intake);
        vi.spyOn(intake, 'end').mockImplementation(async () => {
          await end();
          throw new Error('TEST_ONLY_CLEANUP_FAILED');
        });
        return 'DO_NOT_ACKNOWLEDGE';
      }),
    ).rejects.toThrow('CLOUDFLARE_POSTGRES_CLEANUP_UNCONFIRMED');
  });
  it.each([
    '',
    'https://example.invalid/secret',
    'postgresql://user@host/',
    'postgresql://user:TEST_ONLY_SECRET@host/db#fragment',
  ])(
    'rejects invalid connection configuration before calling the operation (%s)',
    async (readerConnectionString) => {
      const operation = vi.fn(async () => 'UNREACHABLE');
      await expect(
        withCloudflarePostgresPools(
          { ...connections, readerConnectionString },
          operation,
        ),
      ).rejects.toThrow('CLOUDFLARE_POSTGRES_CONNECTION_INVALID');
      expect(operation).not.toHaveBeenCalled();
    },
  );
});
