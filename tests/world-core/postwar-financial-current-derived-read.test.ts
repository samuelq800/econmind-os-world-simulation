/** TEST_ONLY protocol vectors, not native source/currentness evidence. */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  createPostwarFinancialCurrentProjectionStore,
  POSTWAR_FINANCIAL_CURRENT_PAGE_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-financial-current-projection.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const fp = 'sha256:' + 'a'.repeat(64),
  subject = '11111111-1111-4111-8111-111111111111';
const store = createPostwarFinancialCurrentProjectionStore({
  runtimeReaderRole: 'test_financial_reader',
  authorizationPublisherRole: 'test_financial_publisher',
});
function protocol(
  current = true,
  changes: (row: Record<string, unknown>) => void = () => {},
) {
  const raw = '[]',
    row: Record<string, unknown> = {
      status: 'EMPTY',
      scope_json: {
        worldId: 'WORLD_TEST',
        countryId: 'COUNTRY_01',
        officeId: 'FINANCE',
        authSubject: subject,
        teamId: 'TEAM_TEST',
        authorizationVersion: 'REV_TEST',
        seatRef: 'SEAT_TEST',
        scopeKey: 'OFFICE_434F554E5452595F3031_46494E414E4345',
      },
      source_json: {
        dataNature: current
          ? 'ADMITTED_CURRENT_FINANCIAL_NO_POSTING_PREFIX'
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
          schemaVersion: 'postwar-financial-current-prefix-coverage-v1',
          reducerVersion: 'POSTWAR_FINANCIAL_COMPLETE_NO_POSTING_PREFIX_V1',
          coverageRef: 'COVERAGE_TEST',
          prefixFingerprint: fp,
          knownEffectsFingerprint: fp,
          globalWorldVersion: '6',
          globalEventSequence: '10',
          coveredThroughEventId: 'EVENT_TEST',
          coveredThroughEventFingerprint: fp,
          noFinancialPostings: true,
          noInventoryPostings: true,
        },
        pageHash: createHash('sha256').update(raw).digest('hex'),
        returnedRowsHash: createHash('sha256').update(raw).digest('hex'),
        hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
        sourcePointer: {},
      },
      page_json: {
        offset: 0,
        limit: 25,
        returned: 0,
        total: 0,
        nextOffset: null,
      },
      rows_text: raw,
    };
  changes(row);
  const tx: SqlExecutor = {
    async query<Row extends object>(q: string) {
      return {
        rowCount: 1,
        rows: (q === POSTWAR_FINANCIAL_CURRENT_PAGE_QUERY
          ? [row]
          : [
              {
                role_name: 'test_financial_reader',
                subject,
                read_only: 'on',
                isolation: 'repeatable read',
                unsafe: false,
                publisher: false,
              },
            ]) as Row[],
      };
    },
  };
  return () =>
    store.readPageFrom(tx, {
      worldId: 'WORLD_TEST',
      officeId: 'FINANCE',
      dataset: current ? 'treasury-capacity' : 'currency-fx',
    });
}
describe('bounded financial current protocol', () => {
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
        (r.source_json as Record<string, unknown>).worldVersion = '6';
      })(),
    ).rejects.toThrow('COVERAGE_REQUIRED'));
  it('rejects incomplete prefix/forged coverage head', async () =>
    expect(
      protocol(true, (r) => {
        (
          (r.source_json as Record<string, unknown>)
            .currentFinancialCoverage as Record<string, unknown>
        ).globalEventSequence = '9';
      })(),
    ).rejects.toThrow('COVERAGE_REQUIRED'));
  it('rejects rows changed after hash', async () =>
    expect(
      protocol(true, (r) => {
        r.rows_text = '[{}]';
      })(),
    ).rejects.toThrow('PAGE_HASH_OR_SIZE'));
  it('rejects empty page hiding available rows', async () =>
    expect(
      protocol(true, (r) => {
        (r.page_json as Record<string, unknown>).total = 1;
      })(),
    ).rejects.toThrow('EMPTY_PAGE_CONTRACT'));
});
