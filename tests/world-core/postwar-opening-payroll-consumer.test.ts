/** Protocol-only denials. No fake lineage/Ready object can create a genuine
 * lexical reader token, completed work or first-day payment authority. */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { COMMAND_SCHEMA_VERSION, parseCanonicalCommand } from '@econmind/core';
import { createHash } from 'node:crypto';
import { createPostwarOpeningPayrollConsumer } from '../../apps/world-worker/src/persistence/postwar-opening-payroll-consumer.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import type { ValidatedCanonicalLineageView } from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';

const policyBytes = await readFile(
  new URL(
    '../../config/postwar-genesis/payroll-settlement.v1.json',
    import.meta.url,
  ),
  'utf8',
);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
describe('unregistered first-day payroll Worker source boundary', () => {
  it('pins exact versioned policy bytes and does not install writer or work-recognition authority', () => {
    const consumer = createPostwarOpeningPayrollConsumer({ policyBytes });
    expect(consumer.classification).toBe(
      'CONDITIONAL_SOURCE_CONSUMER_NOT_ADMISSION_OR_EXECUTION_AUTHORITY',
    );
    for (const name of [
      'sourceCommitProtectionPort',
      'claim',
      'start',
      'recognizeCompletedDay',
    ])
      expect(name in consumer).toBe(false);
    expect(() =>
      createPostwarOpeningPayrollConsumer({ policyBytes: policyBytes + '\n' }),
    ).toThrow('FIXED_POLICY_BYTES_REQUIRED');
    const altered = JSON.parse(policyBytes) as Record<string, unknown>;
    altered.quantization = 'PAY_THE_CEILING_AND_DROP_THE_REMAINDER';
    expect(() =>
      createPostwarOpeningPayrollConsumer({
        policyBytes: JSON.stringify(altered),
      }),
    ).toThrow('FIXED_POLICY_BYTES_REQUIRED');
  });
  it('refuses an invented/copyable scope even when it claims day1, filled employment and completed work', () => {
    let queries = 0;
    const executor: SqlExecutor = {
      async query() {
        queries++;
        throw Error('NO_DATABASE_QUERY_ALLOWED');
      },
    };
    const command = parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        commandType: 'POSTWAR_OPENING_OP_PAYROLL_SETTLE_V1',
        worldId: 'WORLD_TEST_ONLY_PAYROLL_BOUNDARY',
        countryId: 'COUNTRY_01',
        actorId: 'ACTOR_TEST_ONLY',
        authSubject: '11111111-1111-4111-8111-111111111111',
        commandId: 'COMMAND_TEST_ONLY',
        correlationId: 'CORRELATION_TEST_ONLY',
        idempotencyKey: 'TEST_ONLY',
        expectedWorldVersion: '0',
        officeId: null,
        simTime: '86400000',
        submittedAtReal: '2026-10-28T00:00:00.000Z',
        payload: { obligationId: 'FIRST_DAY_TEST_ONLY' },
      },
      sha,
    );
    const consumer = createPostwarOpeningPayrollConsumer({ policyBytes });
    const fake = Object.freeze({
      completed: true,
      recognized: true,
      filledCount: '1',
      dueSimDay: '1',
      status: 'ADMITTED',
    });
    expect(() =>
      consumer.prepareFrom({
        executor,
        lineage: fake as unknown as ValidatedCanonicalLineageView,
        command,
        observedAtReal: command.submittedAtReal,
      }),
    ).toThrow('forged, expired or belongs to another executor');
    expect(queries).toBe(0);
  });
});
