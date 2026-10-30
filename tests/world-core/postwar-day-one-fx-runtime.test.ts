/** Protocol bounds and missing-source behavior. These tests never admit a
 * quote/seed or claim a native settlement; the native cfc test owns that proof. */
import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { DomainError, parseCanonicalCommand } from '@econmind/core';
import {
  createPostwarDayOneFxRuntime,
  isPostwarDayOneFxRuntime,
  isPostwarDayOneFxSourceCommitProtectionPort,
  DAY_ONE_FX_SOURCE_PURPOSE,
} from '../../apps/world-worker/src/persistence/postwar-day-one-fx-runtime.js';
import { readPostwarDayOneFxHistoryFrom } from '../../apps/world-worker/src/persistence/postwar-day-one-fx-history.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-10-29T00:00:00.000Z';
const command = parseCanonicalCommand(
  {
    schemaVersion: 'command-v1',
    worldId: 'WORLD_FX_RUNTIME_TEST_ONLY',
    countryId: 'COUNTRY_01',
    officeId: 'FINANCE',
    commandType: 'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1',
    commandId: 'COMMAND_FX_RUNTIME_TEST_ONLY',
    idempotencyKey: 'KEY_FX_RUNTIME_TEST_ONLY',
    actorId: 'ACTOR_FX_TEST_ONLY',
    authSubject: '11111111-1111-4111-8111-111111111111',
    expectedWorldVersion: '0',
    simTime: '0',
    submittedAtReal: at,
    correlationId: 'CORRELATION_FX_TEST_ONLY',
    payload: {
      schemaVersion: 'postwar-day-one-treasury-fx-command-v1',
      quoteRef: 'QUOTE_TEST_ONLY',
      payerTreasuryAccountId: 'TGA_TEST_ONLY',
      payerGcuAccountId: 'GOV_GCU_TEST_ONLY',
      dealerGcuAccountId: 'BANK_GCU_TEST_ONLY',
      localAmount: '1',
      localCurrency: 'XAA',
      expectedQuoteSha256: '1'.repeat(64),
    },
  },
  sha,
);
function history(
  input: {
    version?: string;
    sequence?: string;
    inventory?: boolean;
    postingCount?: string;
    postings?: unknown[];
    events?: unknown[];
  } = {},
) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from world_v2.world_head'))
      return {
        rows: [
          {
            world_version: input.version ?? '0',
            event_sequence: input.sequence ?? '0',
          },
        ],
        rowCount: 1,
      };
    if (sql.includes('exists(select 1 from world_v2.inventory_posting'))
      return { rows: [{ present: input.inventory ?? false }], rowCount: 1 };
    if (sql.includes('from world_v2.authoritative_event'))
      return { rows: input.events ?? [], rowCount: input.events?.length ?? 0 };
    if (sql.includes('count(*)::text'))
      return {
        rows: [
          { count: input.postingCount ?? String(input.postings?.length ?? 0) },
        ],
        rowCount: 1,
      };
    if (sql.includes('from world_v2.financial_posting_batch'))
      return {
        rows: input.postings ?? [],
        rowCount: input.postings?.length ?? 0,
      };
    if (sql.includes('from world_v2.command_receipt'))
      return { rows: [], rowCount: 0 };
    throw Error('UNEXPECTED_SQL:' + sql);
  });
  const executor = { query } as SqlExecutor;
  const database = {
    query,
    transaction: async (fn: (tx: SqlExecutor) => Promise<unknown>) =>
      fn(executor),
  } as SqlDatabase;
  return {
    query,
    read: (version = '0') =>
      readPostwarDayOneFxHistoryFrom({
        executor,
        database,
        worldId: command.worldId,
        expectedWorldVersion: version,
      }),
  };
}
describe('fixed first-day Treasury FX Worker boundaries', () => {
  it('reads the exact empty stored prefix without creating a state or performing writes', async () => {
    const h = history();
    const result = await h.read();
    expect(result.frames).toEqual([]);
    expect(result.head).toEqual({
      worldId: command.worldId,
      worldVersion: '0',
      eventSequence: '0',
    });
    expect(h.query.mock.calls.every(([sql]) => sql.startsWith('select '))).toBe(
      true,
    );
  });
  it('rejects an omitted event, stale version and replay overflow', async () => {
    await expect(
      history({ version: '1', sequence: '1' }).read('1'),
    ).rejects.toThrow('COMPLETE_BOUNDED_PREFIX_REQUIRED');
    await expect(history({ version: '1' }).read()).rejects.toThrow(
      'ACTUAL_EXPECTED_HEAD_REQUIRED',
    );
    await expect(history({ sequence: '257' }).read()).rejects.toThrow(
      'BOUNDED_PREFIX_CAPACITY_EXCEEDED',
    );
  });
  it('rejects inventory effects and incomplete/orphan financial posting sets', async () => {
    await expect(history({ inventory: true }).read()).rejects.toThrow(
      'INVENTORY_EFFECT_NOT_SUPPORTED',
    );
    await expect(history({ postingCount: '1' }).read()).rejects.toThrow(
      'COMPLETE_BOUNDED_POSTINGS_REQUIRED',
    );
    await expect(
      history({
        postings: [
          {
            causation_command_id: 'ORPHAN_TEST_ONLY',
            canonical_payload: '{}',
            fingerprint: 'sha256:' + '1'.repeat(64),
          },
        ],
      }).read(),
    ).rejects.toThrow('ORPHAN_POSTING');
  });
  it('issues only the fixed source/guard identities, and missing startup performs no SQL', async () => {
    const query = vi.fn(async () => {
      throw Error('NO_SQL_WITHOUT_STARTUP');
    });
    const database: SqlDatabase = {
      query,
      transaction: async (fn) => fn({ query }),
    };
    const runtime = createPostwarDayOneFxRuntime({
      worldId: command.worldId,
      workerId: 'WORKER_FX_TEST_ONLY',
      workerRole: 'fixture_fx_worker',
      database,
    });
    expect(isPostwarDayOneFxRuntime(runtime)).toBe(true);
    expect(isPostwarDayOneFxRuntime({ ...runtime })).toBe(false);
    expect(
      isPostwarDayOneFxSourceCommitProtectionPort(
        runtime.sourceCommitProtectionPort,
      ),
    ).toBe(true);
    expect(
      isPostwarDayOneFxSourceCommitProtectionPort({
        ...runtime.sourceCommitProtectionPort,
      }),
    ).toBe(false);
    await expect(
      runtime.preflightCanonical(command, at),
    ).rejects.toBeInstanceOf(DomainError);
    expect(query).not.toHaveBeenCalled();
    await runtime.close();
    await expect(runtime.preflightCanonical(command, at)).rejects.toThrow(
      'FX_SOURCE_RETIRED',
    );
  });
  it('does not accept a request DTO as a current Treasury commit authorization', async () => {
    const query = vi.fn(async () => {
      throw Error('NO_SQL_WITHOUT_PROOF');
    });
    const database: SqlDatabase = {
      query,
      transaction: async (fn) => fn({ query }),
    };
    const runtime = createPostwarDayOneFxRuntime({
      worldId: command.worldId,
      workerId: 'WORKER_FX_TEST_ONLY',
      workerRole: 'fixture_fx_worker',
      database,
    });
    await expect(
      runtime.candidateFactory.prepare({
        command,
        commitAuthorization: null,
        observedAtReal: at,
      }),
    ).rejects.toThrow('GENUINE_TREASURY_COMMIT_AUTHORIZATION_REQUIRED');
    await expect(
      runtime.sourceCommitProtectionPort.assertCurrentFrom(
        { query },
        {
          phase: 'BEFORE_EVENTS',
          purpose: DAY_ONE_FX_SOURCE_PURPOSE,
          command,
          currentHead: {
            worldId: command.worldId,
            worldVersion: '0',
            eventSequence: '0',
          },
          observedAtReal: at,
          readBinding: {},
          transition: {} as never,
          financialPostingBatches: [],
          commitAuthorization: {} as never,
        },
      ),
    ).rejects.toThrow('GENUINE_TREASURY_COMMIT_AUTHORIZATION_REQUIRED');
    expect(query).not.toHaveBeenCalled();
    await runtime.close();
  });
});
