import { describe, expect, it } from 'vitest';
import { createPostwarBoundedFinancialCurrentPublisher } from '../../apps/world-worker/src/persistence/postwar-bounded-financial-current-publication.js';
import { createPostwarBudgetCurrentReadbackConsumer } from '../../apps/world-worker/src/outbox/postwar-budget-current-readback-consumer.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';

describe('finite Budget derived readback boundary', () => {
  it('rejects a structural publisher that could bypass durable source checks', () => {
    expect(() =>
      createPostwarBudgetCurrentReadbackConsumer({
        publisher: {
          async publishCommittedCommand() {
            throw Error('NOT_A_FIXED_PORT');
          },
        },
      }),
    ).toThrow('FIXED_BOUNDED_FINANCIAL_PUBLISHER_REQUIRED');
  });
  it('keeps an unavailable backend retry separate from world command submission', async () => {
    const statements: string[] = [];
    const source: SqlDatabase = {
      async query(q) {
        statements.push(q);
        throw Error('ACTUAL_BACKEND_UNAVAILABLE');
      },
      async transaction(work) {
        return work(this);
      },
    };
    const publication: SqlDatabase = {
      async query() {
        throw Error('PUBLICATION_MUST_NOT_RUN');
      },
      async transaction() {
        throw Error('PUBLICATION_MUST_NOT_RUN');
      },
    };
    const consumer = createPostwarBudgetCurrentReadbackConsumer({
      publisher: createPostwarBoundedFinancialCurrentPublisher({
        sourceDatabase: source,
        publicationDatabase: publication,
        worldId: 'WORLD_EXAMPLE',
        countryId: 'COUNTRY_01',
        workerId: 'WORKER_TEST',
      }),
    });
    expect(await consumer.dispatchCommittedCommand('COMMAND_TEST')).toEqual({
      status: 'RETRY_PENDING',
      commandId: 'COMMAND_TEST',
      code: 'DERIVED_READBACK_UNAVAILABLE',
      commandResubmitted: false,
    });
    expect(statements.length).toBeGreaterThan(0);
    expect(
      statements.every(
        (q) => !/^\s*(?:insert|update|delete|truncate)/iu.test(q),
      ),
    ).toBe(true);
  });
  it('requires independently configured source and publisher database ports', () => {
    const database: SqlDatabase = {
      async query() {
        throw Error('NOT_USED');
      },
      async transaction() {
        throw Error('NOT_USED');
      },
    };
    expect(() =>
      createPostwarBoundedFinancialCurrentPublisher({
        sourceDatabase: database,
        publicationDatabase: database,
        worldId: 'WORLD_EXAMPLE',
        countryId: 'COUNTRY_01',
        workerId: 'WORKER_TEST',
      }),
    ).toThrow('SEPARATE_CONFIGURED_SOURCE_AND_PUBLISHER_REQUIRED');
  });
});
