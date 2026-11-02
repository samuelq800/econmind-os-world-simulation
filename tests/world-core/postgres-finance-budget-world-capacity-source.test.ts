/** Selector protocol only: SQL intentionally denies or returns malformed data.
 * No policy/cash/custody/admission is fabricated as a positive source result. */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { parseCanonicalCommand, type CanonicalCommand } from '@econmind/core';
import type { FinanceNativeBudgetPolicy } from '@econmind/core/finance-budget-native';
import {
  createPostgresFinanceBudgetCapacitySource,
  createPostgresFinanceBudgetWorldCapacitySource,
  isPostgresFinanceBudgetCapacitySource,
  isPostgresFinanceBudgetWorldCapacitySource,
  readPostgresFinanceBudgetCapacitySourceScope,
  readPostgresFinanceBudgetCapacitySourceFrom,
} from '../../apps/world-worker/src/persistence/postgres-finance-budget-capacity-source.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

const worldId = 'WORLD_TEST_ONLY_FINITE_CAPACITY';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const countries = Array.from({ length: 70 }, (_, i) => ({
  countryId: `COUNTRY_${String(i + 1).padStart(2, '0')}`,
}));
function command(countryId: string, world = worldId) {
  return parseCanonicalCommand(
    {
      schemaVersion: 'command-v1',
      actorId: 'ACTOR_TEST_ONLY_FINANCE',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: 'COMMAND_TEST_ONLY_FINITE_' + countryId,
      commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
      correlationId: 'CORRELATION_TEST_ONLY_FINITE',
      countryId,
      expectedWorldVersion: '0',
      idempotencyKey: null,
      officeId: 'FINANCE',
      payload: {},
      simTime: '0',
      submittedAtReal: '2026-10-29T00:00:00.000Z',
      worldId: world,
    },
    sha,
  );
}
function fixture(
  source: ReturnType<typeof createPostgresFinanceBudgetCapacitySource>,
  c: CanonicalCommand,
  row?: Readonly<Record<string, unknown>>,
) {
  const calls: { sql: string; parameters: readonly unknown[] }[] = [];
  const denied = new Error('TEST_ONLY_ACTUAL_SQL_POLICY_NOT_AVAILABLE');
  const executor: SqlExecutor = {
    async query<Row extends object>(
      sql: string,
      parameters: readonly unknown[] = [],
    ) {
      calls.push({ sql, parameters });
      if (sql.startsWith('select set_config')) return { rows: [], rowCount: 0 };
      if (row) return { rows: [row as Row], rowCount: 1 };
      throw denied;
    },
  };
  const database: SqlDatabase = {
    query: executor.query,
    async transaction() {
      throw Error('NO_NEW_TRANSACTION_EXPECTED');
    },
  };
  // Metadata placeholders are never accepted by a positive source path here:
  // the fixed SQL port denies before any policy/capacity can be issued.
  const policy: FinanceNativeBudgetPolicy = {
    schemaVersion: 'finance-native-budget-policy-v1',
    ruleRef: 'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1',
    ruleRevision: 'TEST_ONLY_RULE',
    sourceDocumentSHA256: 'sha256:' + '1'.repeat(64),
    normativeUnits: [],
    worldId: c.worldId,
    countryId: c.countryId,
    governmentEntityId: 'GOV_TEST_ONLY',
    currency: 'XAA',
    envelopeRef: 'ENVELOPE_TEST_ONLY_' + c.countryId,
    effectivePeriodRef: 'PERIOD_TEST_ONLY',
    periodRevision: 'TEST_ONLY_REVISION',
    validFromSimTime: '0',
    validUntilSimTime: '1000',
    requestingOfficeId: 'FINANCE',
    programmeOwnerOfficeId: 'FINANCE',
    requiredApprovalOffices: ['FINANCE'],
    classification: 'ORDINARY_DEPARTMENTAL',
    funding: 'FULL_UNCONDITIONAL',
  };
  return {
    calls,
    denied,
    read: () =>
      readPostgresFinanceBudgetCapacitySourceFrom({
        source,
        executor,
        database,
        command: c,
        policy,
        sourceRow: {},
        workerId: 'WORKER_TEST_ONLY_FINITE',
        observedAtReal: '2026-10-29T00:00:00.000Z',
      }),
  };
}
describe('finite genuine Finance world capacity selector', () => {
  it('registers an immutable 70-country server selector using the original private issuer', () => {
    const source = createPostgresFinanceBudgetWorldCapacitySource({
      worldId,
      countries,
      historyMode: 'BUDGET_SOCIAL',
    });
    expect(isPostgresFinanceBudgetCapacitySource(source, worldId)).toBe(true);
    expect(isPostgresFinanceBudgetWorldCapacitySource(source, worldId)).toBe(
      true,
    );
    expect(
      isPostgresFinanceBudgetWorldCapacitySource(source, 'WORLD_OTHER'),
    ).toBe(false);
    const scope = readPostgresFinanceBudgetCapacitySourceScope(source);
    expect(scope).toEqual({
      kind: 'FINITE_WORLD',
      worldId,
      countryIds: countries.map((c) => c.countryId),
      historyMode: 'BUDGET_SOCIAL',
    });
    expect(Object.isFrozen(scope.countryIds)).toBe(true);
    expect(
      isPostgresFinanceBudgetWorldCapacitySource({ ...source }, worldId),
    ).toBe(false);
    expect(() =>
      readPostgresFinanceBudgetCapacitySourceScope({ ...source }),
    ).toThrow('genuine');
  });
  it('rejects empty, duplicate, overbounded, malformed and non-mixed configurations', () => {
    const create = (input: unknown) =>
      createPostgresFinanceBudgetWorldCapacitySource(
        input as Parameters<
          typeof createPostgresFinanceBudgetWorldCapacitySource
        >[0],
      );
    for (const c of [
      [],
      [countries[0], countries[0]],
      [...countries, { countryId: 'COUNTRY_71' }],
      [{ countryId: '' }],
      [{ countryId: 'COUNTRY_01', expectedRawSourceSHA256: 'READY' }],
    ])
      expect(() =>
        create({ worldId, countries: c, historyMode: 'BUDGET_SOCIAL' }),
      ).toThrow();
    expect(() =>
      create({ worldId, countries, historyMode: 'BUDGET_ONLY' }),
    ).toThrow('mixed history');
    expect(() =>
      create({ worldId: '', countries, historyMode: 'BUDGET_SOCIAL' }),
    ).toThrow();
  });
  it('routes every actual canonical country to its own fixed SQL selector and preserves policy denial', async () => {
    const source = createPostgresFinanceBudgetWorldCapacitySource({
      worldId,
      countries,
      historyMode: 'BUDGET_SOCIAL',
    });
    for (const c of countries) {
      const f = fixture(source, command(c.countryId));
      await expect(f.read()).rejects.toBe(f.denied);
      expect(f.calls).toHaveLength(2);
      expect(f.calls[1]?.parameters.slice(0, 2)).toEqual([
        worldId,
        c.countryId,
      ]);
    }
  });
  it('rejects unconfigured/foreign scope and forged command fingerprints before SQL, never falls back to COUNTRY_01', async () => {
    const source = createPostgresFinanceBudgetWorldCapacitySource({
      worldId,
      countries: countries.slice(0, 2),
      historyMode: 'BUDGET_SOCIAL',
    });
    for (const c of [
      command('COUNTRY_03'),
      command('COUNTRY_01', 'WORLD_OTHER'),
      { ...command('COUNTRY_01'), countryId: command('COUNTRY_02').countryId },
    ]) {
      const f = fixture(source, c);
      await expect(f.read()).rejects.toThrow();
      expect(f.calls).toEqual([]);
    }
  });
  it('uses the selected country hash pin and never accepts another country source bytes', async () => {
    const one = '{}',
      two = '{"country":"COUNTRY_02"}';
    const source = createPostgresFinanceBudgetWorldCapacitySource({
      worldId,
      countries: [
        { countryId: 'COUNTRY_01', expectedRawSourceSHA256: sha(one) },
        { countryId: 'COUNTRY_02', expectedRawSourceSHA256: sha(two) },
      ],
      historyMode: 'BUDGET_SOCIAL',
    });
    const wrong = fixture(source, command('COUNTRY_02'), {
      source_text: one,
      source_sha256: sha(one),
      canonical_seed_sha256: '0'.repeat(64),
    });
    await expect(wrong.read()).rejects.toThrow(
      'sealed source bytes/hash mismatch',
    );
    const matchedButInvalid = fixture(source, command('COUNTRY_02'), {
      source_text: two,
      source_sha256: sha(two),
      canonical_seed_sha256: '0'.repeat(64),
    });
    const error = await matchedButInvalid.read().then(
      () => null,
      (error) => error as Error,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).not.toContain('sealed source bytes/hash mismatch');
  });
  it('copies selectors so mutation cannot retarget an issued port', async () => {
    const config = [{ countryId: 'COUNTRY_02' }];
    const source = createPostgresFinanceBudgetWorldCapacitySource({
      worldId,
      countries: config,
      historyMode: 'BUDGET_SOCIAL',
    });
    config[0]!.countryId = 'COUNTRY_01';
    config.push({ countryId: 'COUNTRY_03' });
    expect(
      readPostgresFinanceBudgetCapacitySourceScope(source).countryIds,
    ).toEqual(['COUNTRY_02']);
    const f = fixture(source, command('COUNTRY_01'));
    await expect(f.read()).rejects.toThrow('exact source scope');
    expect(f.calls).toEqual([]);
  });
  it('preserves single-country default history and fixed-country denial', async () => {
    const source = createPostgresFinanceBudgetCapacitySource({
      worldId,
      countryId: 'COUNTRY_01',
    });
    expect(isPostgresFinanceBudgetWorldCapacitySource(source, worldId)).toBe(
      false,
    );
    expect(readPostgresFinanceBudgetCapacitySourceScope(source)).toEqual({
      kind: 'COUNTRY',
      worldId,
      countryIds: ['COUNTRY_01'],
      historyMode: 'BUDGET_ONLY',
    });
    const fixed = fixture(source, command('COUNTRY_02'));
    await expect(fixed.read()).rejects.toThrow('exact source scope');
    expect(fixed.calls).toEqual([]);
    const selected = fixture(source, command('COUNTRY_01'));
    await expect(selected.read()).rejects.toBe(selected.denied);
  });
});
