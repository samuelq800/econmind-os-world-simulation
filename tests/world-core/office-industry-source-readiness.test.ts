// Contract positives and real-reader negatives only. No native custody or
// production-readiness positive is asserted by these offline fixtures.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  canonicalSerialize,
  commandId,
  countryId,
  createOpeningSeed,
  createOpeningSource,
  eventId,
  inventoryPostingId,
  openingSeedId,
  openingSourceId,
  worldId,
} from '@econmind/core';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import {
  withValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../../apps/world-worker/src/persistence/validated-canonical-lineage.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import type { IndustryGoverningCustodyPort } from '../../apps/world-worker/src/projections/industry-production-governing-source.js';
import {
  checkOfficeIndustrySourceResult,
  readOfficeIndustrySourceReadinessFrom,
} from '../../apps/world-worker/src/projections/office-industry-source-readiness.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const WORLD = worldId('WORLD_INDUSTRY_READINESS_TEST');
const COUNTRY = countryId('COUNTRY_INDUSTRY_READINESS_TEST');
const expected = {
  head: { worldId: WORLD, worldVersion: '3', eventSequence: '4' },
  cause: {
    commandId: 'COMMAND_READINESS_TEST',
    commandFingerprint: `sha256:${sha('COMMAND_TEST_ONLY')}`,
    eventId: 'EVENT_READINESS_TEST',
    eventFingerprint: `sha256:${sha('EVENT_TEST_ONLY')}`,
  },
};
function contractResult() {
  return {
    disclosure: {
      status: 'AUTHORIZED',
      sourceUnits: ['CONSTITUTION-U0381', 'INDUSTRY-U0282'],
    },
    resultSummary: {
      status: 'AUTHORIZED_RESULT_ONLY',
      purpose: 'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY',
      sourceHead: { ...expected.head, worldId: String(expected.head.worldId) },
      causeBinding: { ...expected.cause },
    },
  };
}

/** Reuse the existing genuine-reader empty SQL-protocol pattern. This never
 * relabels a TEST_FIXTURE production posting as native/admitted data. */
function emptyLineage() {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_INDUSTRY_READINESS_TEST'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: 'dataset://TEST_ONLY_EMPTY_PROTOCOL_NOT_ADMITTED',
      sourceVersion: 'TEST_ONLY.1',
      payload: { TEST_ONLY: 'EMPTY_PROTOCOL_NOT_SOURCE_ADMISSION' },
    },
    sha,
  );
  const seed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_INDUSTRY_READINESS_TEST'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
  const { fingerprint, ...intent } = seed;
  const trace: string[] = [];
  const executor: SqlExecutor = {
    async query<Row extends object>(sql: string) {
      trace.push(sql);
      let rows: readonly object[];
      if (sql.includes('from world_v2.world_head'))
        rows = [{ world_version: '0', event_sequence: '0' }];
      else if (sql.includes('from world_v2.opening_seed'))
        rows = [
          {
            world_id: WORLD,
            seed_id: seed.seedId,
            opening_world_version: '0',
            replay_binding: canonicalSerialize(seed.replayBinding),
            canonical_payload: canonicalSerialize(intent),
            seed_fingerprint: fingerprint,
          },
        ];
      else if (
        [
          'authoritative_event event',
          'inventory_posting',
          'financial_posting_batch',
          'command_receipt',
        ].some((name) => sql.includes('from world_v2.' + name))
      )
        rows = [];
      else throw Error('UNEXPECTED_SQL_PROTOCOL_QUERY');
      return { rows: rows as readonly Row[], rowCount: rows.length };
    },
  };
  const database: SqlDatabase = {
    query: async () => {
      throw Error('NO_POOL_QUERY');
    },
    transaction: async () => {
      throw Error('NO_NESTED_TRANSACTION');
    },
  };
  const reader = new DurableV08LedgerLineageReader({
    database,
    sha256Hex: sha,
  });
  const selectors = {
    worldId: WORLD,
    countryId: COUNTRY,
    commandId: commandId('COMMAND_ABSENT_READINESS'),
    eventId: eventId('EVENT_ABSENT_READINESS'),
    postingId: inventoryPostingId('POSTING_ABSENT_READINESS'),
    expectedPublicationHead: {
      worldId: WORLD,
      worldVersion: '0',
      eventSequence: '0',
    },
  };
  const scope = {
    worldId: WORLD,
    countryId: COUNTRY,
    classification: 'OFFICE_PRIVATE' as const,
    officeId: 'INDUSTRY',
  };
  return { reader, executor, selectors, scope, trace, worldId: WORLD };
}

describe('Industry source result contract checker, not source admission', () => {
  it('accepts an exact result-only contract without treating the data as authority', () => {
    const input = contractResult();
    const checked = checkOfficeIndustrySourceResult(input, expected);
    expect(checked.kind).toBe('CONTRACT_MATCHED_NOT_AUTHORITY');
    expect(checked.result).toEqual(input);
    expect(Object.isFrozen(checked.result.resultSummary)).toBe(true);
    input.resultSummary.sourceHead.worldVersion = '99';
    expect(checked.result.resultSummary).toMatchObject({
      sourceHead: expected.head,
    });
    expect(checked).not.toHaveProperty('sourceAdmitted');
    expect(checked.result).not.toHaveProperty('actualOutput');
  });

  it.each([
    'ADMITTED_SOURCE_UNAVAILABLE',
    'OWNER_MAPPING_UNAVAILABLE',
    'SCOPE_NOT_AUTHORIZED',
    'SUMMARY_SOURCE_UNAVAILABLE',
  ])('preserves existing %s denial without a partial result', (reason) => {
    const result = {
      disclosure: { status: 'NOT_AUTHORIZED', reason },
      resultSummary: { status: 'NOT_AUTHORIZED' },
    };
    expect(checkOfficeIndustrySourceResult(result, expected).result).toEqual(
      result,
    );
    expect(() =>
      checkOfficeIndustrySourceResult(
        { ...result, resultSummary: contractResult().resultSummary },
        expected,
      ),
    ).toThrow('Result contract keys differ');
  });

  it.each(['worldId', 'worldVersion', 'eventSequence'] as const)(
    'rejects mismatched current %s',
    (key) => {
      const result = contractResult();
      result.resultSummary.sourceHead[key] = 'DIFFERENT';
      expect(() => checkOfficeIndustrySourceResult(result, expected)).toThrow(
        'head/cause differs',
      );
    },
  );

  it.each([
    'commandId',
    'commandFingerprint',
    'eventId',
    'eventFingerprint',
  ] as const)('rejects mismatched %s', (key) => {
    const result = contractResult();
    result.resultSummary.causeBinding[key] = 'DIFFERENT';
    expect(() => checkOfficeIndustrySourceResult(result, expected)).toThrow(
      'head/cause differs',
    );
  });

  it('rejects additional stock/financial payloads, malformed summary and duplicate source units', () => {
    expect(() =>
      checkOfficeIndustrySourceResult(
        { ...contractResult(), inventoryPositions: [] },
        expected,
      ),
    ).toThrow('contract keys differ');
    const duplicate = contractResult();
    duplicate.disclosure.sourceUnits.push(duplicate.disclosure.sourceUnits[0]!);
    expect(() => checkOfficeIndustrySourceResult(duplicate, expected)).toThrow(
      'exact source-unit',
    );
    expect(() =>
      checkOfficeIndustrySourceResult(
        { disclosure: null, resultSummary: null },
        expected,
      ),
    ).toThrow('Closed result record');
  });
});

describe('Industry readiness actual genuine-view consumer, offline reachable negatives', () => {
  it('reports concrete absent target and custody dependencies without any extra SQL or a fabricated zero output', async () => {
    const f = emptyLineage();
    await withValidatedCanonicalLineageFrom(f, async (view) => {
      const reads = f.trace.length;
      const result = await readOfficeIndustrySourceReadinessFrom({
        ...f,
        view,
        custody: null,
      });
      expect(result).toMatchObject({
        status: 'BLOCKED',
        reason: 'PRODUCTION_TARGET_NOT_FOUND',
        missing: ['COMMITTED_PRODUCTION_TARGET', 'NATIVE_GOVERNING_CUSTODY'],
        authority: 'DIAGNOSTIC_ONLY_NO_ADMISSION_OR_PUBLICATION',
        hostInstallation: 'NOT_ASSESSED',
      });
      expect(result).not.toHaveProperty('result');
      expect(f.trace).toHaveLength(reads);
    });
    expect(f.trace.every((sql) => /^\s*select\b/iu.test(sql))).toBe(true);
  });

  it('does not use custody merely because a callback exists when no production target exists', async () => {
    const f = emptyLineage();
    const custodyCalls = vi.fn();
    const custody: IndustryGoverningCustodyPort = {
      async withSnapshotFrom() {
        custodyCalls();
        throw Error('Absent production target must not consult custody');
      },
    };
    await withValidatedCanonicalLineageFrom(f, async (view) => {
      const result = await readOfficeIndustrySourceReadinessFrom({
        ...f,
        view,
        custody,
      });
      expect(result).toMatchObject({
        status: 'BLOCKED',
        missing: ['COMMITTED_PRODUCTION_TARGET'],
      });
    });
    expect(custodyCalls).not.toHaveBeenCalled();
  });

  it('denies other world/country/office/classification and rejects a changed held head', async () => {
    const f = emptyLineage();
    await withValidatedCanonicalLineageFrom(f, async (view) => {
      for (const scope of [
        { ...f.scope, worldId: 'WORLD_OTHER' },
        { ...f.scope, countryId: 'COUNTRY_OTHER' },
        { ...f.scope, officeId: 'TRADE' },
        { ...f.scope, classification: 'COUNTRY' as const },
      ])
        expect(
          await readOfficeIndustrySourceReadinessFrom({
            ...f,
            view,
            scope,
            custody: null,
          }),
        ).toMatchObject({ status: 'BLOCKED', reason: 'SCOPE_NOT_AUTHORIZED' });
      await expect(
        readOfficeIndustrySourceReadinessFrom({
          ...f,
          view,
          custody: null,
          selectors: {
            ...f.selectors,
            expectedPublicationHead: {
              ...f.selectors.expectedPublicationHead,
              worldVersion: '1',
            },
          },
        }),
      ).rejects.toThrow('held lineage head');
    });
  });

  it('rejects forged, escaped and different-executor views', async () => {
    const f = emptyLineage();
    await expect(
      readOfficeIndustrySourceReadinessFrom({
        ...f,
        view: {} as ValidatedCanonicalLineageView,
        custody: null,
      }),
    ).rejects.toThrow('forged, expired');
    let escaped: ValidatedCanonicalLineageView | undefined;
    await withValidatedCanonicalLineageFrom(f, async (view) => {
      escaped = view;
      await expect(
        readOfficeIndustrySourceReadinessFrom({
          ...f,
          executor: emptyLineage().executor,
          view,
          custody: null,
        }),
      ).rejects.toThrow('another executor');
    });
    await expect(
      readOfficeIndustrySourceReadinessFrom({
        ...f,
        view: escaped!,
        custody: null,
      }),
    ).rejects.toThrow('forged, expired');
  });
});
