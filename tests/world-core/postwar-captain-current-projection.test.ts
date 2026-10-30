/** Fixed getter protocol vectors only, not source admission/native evidence. */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  POSTWAR_CAPTAIN_CURRENT_BUCKETS,
  parsePostwarCaptainCurrentCoverage,
} from '@econmind/core/postwar-captain-current-contract';
import {
  createPostwarCaptainCurrentProjectionStore,
  POSTWAR_CAPTAIN_CURRENT_PAGE_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-captain-current-projection.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const fp = 'sha256:' + 'a'.repeat(64),
  subject = '11111111-1111-4111-8111-111111111111',
  big = '12345678901234567890.123456';
const store = createPostwarCaptainCurrentProjectionStore({
  runtimeReaderRole: 'captain_wire_reader',
  authorizationPublisherRole: 'captain_wire_auth_publisher',
});
function fixture() {
  const rows = POSTWAR_CAPTAIN_CURRENT_BUCKETS.map((bucket, i) => ({
      schemaVersion: 'postwar-captain-political-capital-row-v1',
      countryId: 'COUNTRY_01',
      capitalRef: 'CAPITAL_TEST_ONLY',
      bucket,
      unit: 'political_capital',
      balance: i === 0 ? big : '0',
      opening: big,
      generated: '0',
      total: big,
      available: big,
      spent: '0',
      closing: big,
      allocationNature: 'REALLOCATION_NOT_GENERATION_OR_SPENDING',
    })),
    raw = JSON.stringify(rows),
    hash = createHash('sha256').update(raw).digest('hex');
  const row = {
    status: 'PAGE',
    scope: {
      worldId: 'WORLD_TEST_ONLY',
      countryId: 'COUNTRY_01',
      officeId: 'CAPTAIN',
      authSubject: subject,
      teamId: 'TEAM_TEST_ONLY',
      authorizationVersion: 'REV_TEST_ONLY',
      seatRef: 'SEAT_TEST_ONLY',
      scopeKey: 'OFFICE_434F554E5452595F3031_4341505441494E',
    },
    source: {
      dataNature: 'ADMITTED_CURRENT_POLITICAL_CAPITAL_MIXED_PREFIX',
      sourceVersion: fp,
      sourceRevision: 'REV_TEST_ONLY',
      seedId: 'SEED_TEST_ONLY',
      seedFingerprint: fp,
      admissionRef: 'ADMISSION_TEST_ONLY',
      modelVersion: 'MODEL_TEST_ONLY',
      replayBinding: 'TEST_ONLY_BINDING',
      sourceBundleSha256: 'b'.repeat(64),
      canonicalSeedSha256: 'c'.repeat(64),
      worldVersion: '3',
      eventSequence: '3',
      originWorldVersion: '1',
      originEventSequence: '1',
      observedHead: { worldVersion: '3', eventSequence: '3' },
      currentCaptainCoverage: {
        schemaVersion: 'postwar-captain-current-prefix-coverage-v1',
        reducerVersion: 'POSTWAR_CAPTAIN_FINANCE_SOCIAL_FX_COMPLETE_PREFIX_V1',
        countryId: 'COUNTRY_01',
        coverageRef: 'COVERAGE_TEST_ONLY',
        prefixFingerprint: fp,
        knownEffectsFingerprint: fp,
        globalWorldVersion: '3',
        globalEventSequence: '3',
        coveredThroughEventId: 'EVENT_TEST_ONLY',
        coveredThroughEventFingerprint: fp,
        financialPostingCount: '0',
        financialBatchCount: '0',
        financialPostingsFingerprint: fp,
        capitalStateHash: fp,
        originalPacketSha256: 'd'.repeat(64),
        originWorldVersion: '1',
        originEventSequence: '1',
      },
      pageHash: hash,
      returnedRowsHash: hash,
      hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
      sourcePointer: { table: 'captain_operating_original' },
    },
    page: { offset: 0, limit: 25, returned: 7, total: 7, nextOffset: null },
    rows_text: raw,
  };
  let queryCount = 0;
  const tx: SqlExecutor = {
    async query<Row extends object>(q: string) {
      queryCount++;
      const rows =
        q === POSTWAR_CAPTAIN_CURRENT_PAGE_QUERY
          ? [structuredClone(row)]
          : [
              {
                role_name: 'captain_wire_reader',
                subject,
                read_only: 'on',
                isolation: 'repeatable read',
                unsafe: false,
                publisher: false,
              },
            ];
      return { rows: rows as Row[], rowCount: 1 };
    },
  };
  return { row, tx, queryCount: () => queryCount };
}
describe('Captain current fixed small-page adapter', () => {
  it('retains exact large political quantities and separate origin versus observed current head', async () => {
    const f = fixture(),
      r = await store.readPageFrom(f.tx, { worldId: 'WORLD_TEST_ONLY' });
    expect(r.status).toBe('PAGE');
    if (r.status !== 'PAGE') throw Error('EXPECTED_PAGE');
    expect(r.rows[0]?.balance).toBe(big);
    expect(r.source.worldVersion).toBe('3');
    expect(r.source.originWorldVersion).toBe('1');
    expect(r.rows).toHaveLength(7);
    expect(f.queryCount()).toBe(2);
  });
  it('rejects corrupted same-head bytes and cross-country projection rows', async () => {
    const f = fixture();
    f.row.rows_text = f.row.rows_text.replace(big, '1');
    await expect(
      store.readPageFrom(f.tx, { worldId: 'WORLD_TEST_ONLY' }),
    ).rejects.toThrow('HASHED_ROWS');
    const g = fixture();
    g.row.scope.countryId = 'COUNTRY_02';
    g.row.scope.scopeKey = 'OFFICE_434F554E5452595F3032_4341505441494E';
    await expect(
      store.readPageFrom(g.tx, { worldId: 'WORLD_TEST_ONLY' }),
    ).rejects.toThrow('ORIGIN_HEAD');
  });
  it('refuses unpinned continuation/foreign origin and does not reuse a prior role observation', async () => {
    const f = fixture();
    await expect(
      store.readPageFrom(f.tx, { worldId: 'WORLD_TEST_ONLY', offset: 1 }),
    ).rejects.toThrow('INVALID_PAGE');
    expect(f.queryCount()).toBe(0);
    await store.readPageFrom(f.tx, { worldId: 'WORLD_TEST_ONLY' });
    f.row.source.currentCaptainCoverage.originWorldVersion = '4';
    expect(() =>
      parsePostwarCaptainCurrentCoverage(f.row.source.currentCaptainCoverage),
    ).toThrow('ORIGIN');
    await expect(
      store.readPageFrom(f.tx, { worldId: 'WORLD_TEST_ONLY' }),
    ).rejects.toThrow('ORIGIN');
    expect(f.queryCount()).toBe(4);
  });
});
