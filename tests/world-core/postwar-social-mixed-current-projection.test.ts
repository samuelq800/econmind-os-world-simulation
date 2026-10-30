/** Read-wire protocol vectors, not native publication/source admission. */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  parsePostwarSocialMixedCoverage,
  parsePostwarSocialMixedStateBinding,
  POSTWAR_SOCIAL_MIXED_COVERAGE_SCHEMA,
  POSTWAR_SOCIAL_MIXED_REDUCER,
} from '../../packages/core/src/read-models/postwar-social-mixed-current-contract.js';
import {
  createPostwarSocialMixedCurrentProjectionStore,
  POSTWAR_SOCIAL_MIXED_CURRENT_PAGE_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-social-mixed-current-projection.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const fp = 'sha256:' + 'a'.repeat(64),
  sha = (v: string) => createHash('sha256').update(v).digest('hex'),
  subject = '11111111-1111-4111-8111-111111111111',
  scope = { countryId: 'COUNTRY_01', worldVersion: '7', eventSequence: '11' };
const coverage = (origin = '3') => ({
  schemaVersion: POSTWAR_SOCIAL_MIXED_COVERAGE_SCHEMA,
  reducerVersion: POSTWAR_SOCIAL_MIXED_REDUCER,
  countryId: scope.countryId,
  coverageRef: 'COVERAGE_TEST_ONLY',
  globalWorldVersion: '7',
  globalEventSequence: '11',
  originWorldVersion: origin,
  originEventSequence: origin,
  prefixFingerprint: fp,
  knownEffectsFingerprint: fp,
  coveredThroughEventId: 'EVENT_TEST_ONLY',
  coveredThroughEventFingerprint: fp,
  financialPostingCount: '6',
  financialBatchCount: '2',
  financialPostingsFingerprint: fp,
  employmentStateHash: fp,
  materializationHash: fp,
  stateOrigin:
    origin === '0' ? 'ADMITTED_OPENING_SOURCE' : 'COMMITTED_MATERIALIZATION',
});
const binding = () => ({
  sourceCommandId: 'COMMAND_TEST_ONLY',
  commandFingerprint: fp,
  sourceEventId: 'EVENT_ORIGIN_TEST_ONLY',
  eventFingerprint: fp,
  materializationKey: 'SOCIAL_POSITION_LIFECYCLE_COUNTRY_01',
  materializationHash: fp,
  canonicalMaterializationSha256: 'b'.repeat(64),
  sourceStateWorldVersion: '3',
  sourceEventSequence: '3',
});
function protocol(change: (r: Record<string, unknown>) => void = () => {}) {
  const raw = '[]',
    row: Record<string, unknown> = {
      status: 'EMPTY',
      scope: {
        worldId: 'WORLD_TEST',
        countryId: scope.countryId,
        officeId: 'SOCIAL',
        authSubject: subject,
        teamId: 'TEAM_TEST',
        authorizationVersion: 'REV_TEST',
        seatRef: 'SEAT_TEST',
        scopeKey: 'OFFICE_434F554E5452595F3031_534F4349414C',
      },
      source: {
        dataNature: 'ADMITTED_CURRENT_SOCIAL_MIXED_FINANCIAL_PREFIX',
        sourceVersion: fp,
        sourceRevision: 'SOURCE_TEST',
        seedId: 'SEED_TEST',
        seedFingerprint: fp,
        admissionRef: 'ADMISSION_TEST',
        modelVersion: 'MODEL_TEST',
        replayBinding: '{}',
        sourceBundleSha256: 'c'.repeat(64),
        canonicalSeedSha256: 'b'.repeat(64),
        worldVersion: '7',
        eventSequence: '11',
        originWorldVersion: '3',
        originEventSequence: '3',
        observedHead: { worldVersion: '7', eventSequence: '11' },
        currentPrefixCoverage: coverage(),
        currentStateBinding: binding(),
        pageHash: sha(raw),
        returnedRowsHash: sha(raw),
        hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
        sourcePointer: {},
      },
      page: { offset: 0, limit: 25, returned: 0, total: 0, nextOffset: null },
      rows_text: raw,
    };
  change(row);
  const tx: SqlExecutor = {
    async query<Row extends object>(sql: string) {
      return {
        rowCount: 1,
        rows: (sql === POSTWAR_SOCIAL_MIXED_CURRENT_PAGE_QUERY
          ? [row]
          : [
              {
                role_name: 'test_social_reader',
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
    createPostwarSocialMixedCurrentProjectionStore({
      runtimeReaderRole: 'test_social_reader',
      authorizationPublisherRole: 'test_social_publisher',
    }).readPageFrom(tx, {
      worldId: 'WORLD_TEST',
      officeId: 'SOCIAL',
      dataset: 'positions',
    });
}
describe('Social mixed-current V3 wire and bounded store', () => {
  it('keeps last Social origin separate from later FX/Budget head and nonzero postings', async () => {
    const p = await protocol()();
    expect(p.status).toBe('EMPTY');
    if (p.status === 'EMPTY') {
      expect(p.source.originWorldVersion).toBe('3');
      expect(p.source.observedHead.worldVersion).toBe('7');
      expect(p.source.currentPrefixCoverage.financialPostingCount).toBe('6');
    }
  });
  it('accepts origin zero only with opening origin and no committed binding', () => {
    const c = parsePostwarSocialMixedCoverage(coverage('0'), scope);
    expect(parsePostwarSocialMixedStateBinding(undefined, c)).toBeUndefined();
    expect(() => parsePostwarSocialMixedStateBinding(binding(), c)).toThrow();
  });
  it.each([
    { countryId: 'COUNTRY_02' },
    { globalEventSequence: '10' },
    { financialPostingCount: '0' },
    { financialBatchCount: '7' },
    { financialPostingsFingerprint: 'READY' },
    { stateOrigin: 'ADMITTED_OPENING_SOURCE' },
    { originWorldVersion: '8' },
    { originWorldVersion: '0' },
    { noFinancialPostings: true },
  ])('rejects scope/stale/legacy or inconsistent coverage %#', (change) => {
    expect(() =>
      parsePostwarSocialMixedCoverage({ ...coverage(), ...change }, scope),
    ).toThrow();
  });
  it('requires exact materialization binding to actual origin rather than global head', () => {
    const c = parsePostwarSocialMixedCoverage(coverage(), scope);
    expect(() =>
      parsePostwarSocialMixedStateBinding(
        { ...binding(), sourceStateWorldVersion: '7' },
        c,
      ),
    ).toThrow();
  });
  it('rejects tampered response bytes and unknown hash semantics', async () => {
    await expect(
      protocol((r) => {
        r.rows_text = '[{}]';
      })(),
    ).rejects.toThrow('PAGE_HASH_OR_SIZE');
    await expect(
      protocol((r) => {
        (r.source as Record<string, unknown>).hashAlgorithm = 'SHA256';
      })(),
    ).rejects.toThrow('PAGE_HASH_OR_SIZE');
  });
  it('does not turn missing publication into an empty accepted dataset', async () => {
    expect(
      await protocol((r) => {
        r.status = 'UNAVAILABLE';
      })(),
    ).toEqual({ status: 'UNAVAILABLE', code: 'CURRENT_SOCIAL_UNAVAILABLE' });
  });
  it('rejects a legal empty shape hiding available rows', async () => {
    await expect(
      protocol((r) => {
        (r.page as Record<string, unknown>).total = 1;
      })(),
    ).rejects.toThrow('EMPTY_PAGE_CONTRACT');
  });
  it('rejects cross-office/private rows before returning a page', async () => {
    await expect(
      protocol((r) => {
        (r.scope as Record<string, unknown>).officeId = 'FINANCE';
      })(),
    ).rejects.toThrow('ACTUAL_SCOPE_MISMATCH');
  });
});
