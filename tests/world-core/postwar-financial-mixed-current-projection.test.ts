import { POSTWAR_PROJECTION_PAGE_QUERY } from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
/** TEST_ONLY protocol vectors, not native source/currentness evidence. */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  createPostwarFinancialMixedCurrentProjectionStore,
  POSTWAR_FINANCIAL_MIXED_CURRENT_PAGE_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-financial-mixed-current-projection.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const fp = 'sha256:' + 'a'.repeat(64),
  subject = '11111111-1111-4111-8111-111111111111';
const store = createPostwarFinancialMixedCurrentProjectionStore({
  runtimeReaderRole: 'test_financial_reader',
  authorizationPublisherRole: 'test_financial_publisher',
});
function protocol(
  current = true,
  changes: (row: Record<string, unknown>) => void = () => {},
  openingMode?: 'empty' | 'missing' | 'wrong-seed',
) {
  const raw = '[]',
    row: Record<string, unknown> = {
      status: 'EMPTY',
      scope: {
        worldId: 'WORLD_TEST',
        countryId: 'COUNTRY_01',
        officeId: 'FINANCE',
        authSubject: subject,
        teamId: 'TEAM_TEST',
        authorizationVersion: 'REV_TEST',
        seatRef: 'SEAT_TEST',
        scopeKey: 'OFFICE_434F554E5452595F3031_46494E414E4345',
      },
      source: {
        dataNature: current
          ? 'ADMITTED_CURRENT_FINANCIAL_MIXED_POSTING_PREFIX'
          : 'ADMITTED_IMMUTABLE_OPENING_FACTS',
        sourceVersion: fp,
        sourceRevision: 'SOURCE_TEST',
        seedId: 'SEED_TEST',
        seedFingerprint: fp,
        admissionRef: 'ADMISSION_TEST',
        modelVersion: 'MODEL_TEST',
        replayBinding: '{}',
        canonicalSeedSha256: 'b'.repeat(64),
        sourceBundleSha256: 'c'.repeat(64),
        worldVersion: current ? '6' : '0',
        eventSequence: current ? '10' : '0',
        originWorldVersion: '0',
        originEventSequence: '0',
        observedHead: { worldVersion: '6', eventSequence: '10' },
        currentFinancialCoverage: {
          schemaVersion: 'postwar-financial-current-prefix-coverage-v2',
          reducerVersion: 'POSTWAR_FINANCIAL_SOCIAL_FX_COMPLETE_PREFIX_V2',
          coverageRef: 'COVERAGE_TEST',
          countryId: 'COUNTRY_01',
          prefixFingerprint: fp,
          knownEffectsFingerprint: fp,
          globalWorldVersion: '6',
          globalEventSequence: '10',
          coveredThroughEventId: 'EVENT_TEST',
          coveredThroughEventFingerprint: fp,
          financialPostingCount: '6',
          financialBatchCount: '2',
          financialPostingsFingerprint: fp,
        },
        pageHash: createHash('sha256').update(raw).digest('hex'),
        returnedRowsHash: createHash('sha256').update(raw).digest('hex'),
        hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
        sourcePointer: {},
      },
      page: {
        offset: 0,
        limit: 25,
        returned: 0,
        total: 0,
        nextOffset: null,
      },
      rows_text: raw,
    };
  changes(row);
  const selectedStore = openingMode
    ? createPostwarFinancialMixedCurrentProjectionStore({
        runtimeReaderRole: 'test_financial_reader',
        authorizationPublisherRole: 'test_financial_publisher',
        includeCentralBankOpeningInstruments: true,
      })
    : store;
  const tx: SqlExecutor = {
    async query<Row extends object>(q: string, args: readonly unknown[] = []) {
      if (q === POSTWAR_PROJECTION_PAGE_QUERY) {
        if (openingMode === 'missing')
          return { rowCount: 1, rows: [{ status: 'UNAVAILABLE' }] as Row[] };
        const dataset = args[2],
          items =
            dataset === 'cb-categories'
              ? [
                  {
                    category: 'DOMESTIC_GOVERNMENT_SECURITIES',
                    disposition: 'NO_DECLARED_INSTRUMENT',
                  },
                ]
              : dataset === 'cb-holdings'
                ? [{ category: 'TREASURY_GOVERNMENT_DEPOSIT', amount: '100' }]
                : [],
          raw = JSON.stringify(items),
          h = createHash('sha256').update(raw).digest('hex');
        return {
          rowCount: 1,
          rows: [
            {
              status: items.length ? 'PAGE' : 'EMPTY',
              scope_json: row.scope,
              source_json: {
                ...(row.source as object),
                dataNature: 'DERIVED_RAW_FROM_ADMITTED_H0_NOT_AUTHORITY',
                worldVersion: '0',
                eventSequence: '0',
                pageHash: h,
                returnedRowsHash: h,
                ...(openingMode === 'wrong-seed'
                  ? { seedFingerprint: 'sha256:' + 'd'.repeat(64) }
                  : {}),
              },
              page_json: {
                offset: 0,
                limit: 100,
                returned: items.length,
                total: items.length,
                nextOffset: null,
              },
              rows_text: raw,
            },
          ] as Row[],
        };
      }
      return {
        rowCount: 1,
        rows: (q === POSTWAR_FINANCIAL_MIXED_CURRENT_PAGE_QUERY
          ? [row]
          : [
              {
                role_name: 'test_financial_reader',
                subject,
                read_only: 'on',
                isolation: 'repeatable read',
                unsafe: false,
                publisher: false,
                unsafe_role: false,
                publisher_member: false,
              },
            ]) as Row[],
      };
    },
  };
  return () =>
    selectedStore.readPageFrom(tx, {
      worldId: 'WORLD_TEST',
      officeId: openingMode ? 'CENTRAL_BANK' : 'FINANCE',
      dataset: current ? 'ledger-balances' : 'currency-fx',
    });
}
describe('bounded posting-aware financial current protocol', () => {
  it('allows legal empty current result with actual head coverage', async () =>
    expect((await protocol()()).status).toBe('EMPTY'));
  it('retains historical origin zero while observing H6', async () => {
    const p = await protocol(false)();
    expect(p.status).toBe('EMPTY');
    if (p.status === 'EMPTY') {
      expect(p.source.worldVersion).toBe('0');
      expect(p.source.observedHead).toEqual({
        worldVersion: '6',
        eventSequence: '10',
      });
    }
  });
  it('rejects historical rows relabelled current', async () =>
    expect(
      protocol(false, (r) => {
        (r.source as Record<string, unknown>).worldVersion = '6';
      })(),
    ).rejects.toThrow('CURRENT_POSTING_AWARE_SOURCE_REQUIRED'));
  it('rejects incomplete prefix/forged coverage head', async () =>
    expect(
      protocol(true, (r) => {
        (
          (r.source as Record<string, unknown>)
            .currentFinancialCoverage as Record<string, unknown>
        ).globalEventSequence = '9';
      })(),
    ).rejects.toThrow('EXACT_COMPLETE_POSTING_COVERAGE_REQUIRED'));
  it('rejects rows changed after hash', async () =>
    expect(
      protocol(true, (r) => {
        r.rows_text = '[{}]';
      })(),
    ).rejects.toThrow('PAGE_HASH_OR_SIZE'));
  it('rejects empty page hiding available rows', async () =>
    expect(
      protocol(true, (r) => {
        (r.page as Record<string, unknown>).total = 1;
      })(),
    ).rejects.toThrow('EMPTY_PAGE_CONTRACT'));
  it.each(['DENIED', 'STALE', 'UNAVAILABLE'])(
    'preserves %s without pretending it is empty',
    async (status) => {
      expect(
        await protocol(true, (r) => {
          r.status = status;
          delete r.rows_text;
        })(),
      ).toEqual({ status, code: 'CURRENT_FINANCIAL_' + status });
    },
  );
  it('does not accept old no-posting coverage after FX', async () => {
    await expect(
      protocol(true, (r) => {
        const source = r.source as Record<string, unknown>;
        source.currentFinancialCoverage = {
          schemaVersion: 'postwar-financial-current-prefix-coverage-v1',
          noFinancialPostings: true,
        };
      })(),
    ).rejects.toThrow('EXACT_FIELDS_REQUIRED');
  });
  it('rejects a country selector that differs from the actual seat', async () => {
    await expect(
      protocol(true, (r) => {
        (r.scope as Record<string, unknown>).countryId = 'COUNTRY_02';
      })(),
    ).rejects.toThrow('ACTUAL_SCOPE_MISMATCH');
  });
});

function cbRow(row: Record<string, unknown>) {
  const scope = row.scope as Record<string, unknown>;
  scope.officeId = 'CENTRAL_BANK';
  scope.scopeKey = 'OFFICE_434F554E5452595F3031_43454E5452414C5F42414E4B';
  const rows = [
      {
        schemaVersion: 'postwar-current-financial-balance-row-v2',
        countryId: 'COUNTRY_01',
        accountId: 'BANK_GCU_CASH_TEST',
        ownerEntityId: 'BANK_TEST',
        ownerKind: 'BANK',
        currency: 'GCU',
        accountClass: 'CASH',
        claimId: null,
        counterpartyEntityId: null,
        netDebitBalance: '12.34',
        balanceNature: 'GCU_CASH',
      },
    ],
    raw = JSON.stringify(rows),
    h = createHash('sha256').update(raw).digest('hex');
  row.status = 'PAGE';
  row.rows_text = raw;
  row.page = { offset: 0, limit: 25, returned: 1, total: 1, nextOffset: null };
  Object.assign(row.source as object, { pageHash: h, returnedRowsHash: h });
}
describe('CB actual financial rows with separately bound opening instrument declarations', () => {
  it('keeps BANK GCU current rows and origin0 no-declared source status without an OMO adoption or 24 dummy accounts', async () => {
    const page = await protocol(true, cbRow, 'empty')();
    if (!('source' in page)) throw Error('PAGE_REQUIRED');
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({
      accountId: 'BANK_GCU_CASH_TEST',
      netDebitBalance: '12.34',
    });
    expect(page.source.observedHead).toEqual({
      worldVersion: '6',
      eventSequence: '10',
    });
    expect(page.source.centralBankOpeningInstruments).toMatchObject({
      status: 'NO_DECLARED_DOMESTIC_GOVERNMENT_SECURITY',
      originWorldVersion: '0',
      governmentSecurityHoldingCount: 0,
      bankLoanRecordCount: 0,
    });
  });
  it('keeps actual current funds but marks missing source unknown rather than zero', async () => {
    const page = await protocol(true, cbRow, 'missing')();
    if (!('source' in page)) throw Error('PAGE_REQUIRED');
    expect(page.rows).toHaveLength(1);
    expect(page.source.centralBankOpeningInstruments).toMatchObject({
      status: 'SOURCE_UNAVAILABLE',
      governmentSecurityHoldingCount: null,
      bankLoanRecordCount: null,
      sourcePages: [],
    });
  });
  it('refuses source seed substitution', async () => {
    await expect(protocol(true, cbRow, 'wrong-seed')()).rejects.toThrow(
      'CB_OPENING_SOURCE_DIFFERS',
    );
  });
});
