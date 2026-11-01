/** Narrow negative protocol only. Actual positive metadata/RPC is exercised in
 * first-day-source.test; no fake ready/base/lease is issued in these tests. */
import { describe, it, expect } from 'vitest';
import {
  readPostwarIndustryRunStateFrom,
  consumePostwarIndustryRunStateFrom,
  releasePostwarIndustryRunStateContext,
} from '../../apps/world-worker/src/persistence/postwar-industry-run-state.js';
import {
  projectPostwarIndustryRunSiteSource,
  readPostwarIndustryRunPageOriginalsFrom,
} from '../../apps/world-worker/src/persistence/postwar-industry-run-originals.js';
import { decodePostwarIndustryFirstDaySourceRow } from '../../apps/world-worker/src/persistence/postwar-industry-first-day-source.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
describe('Industry fixed run DATA entrypoints do not accept caller readiness', () => {
  it('rejects an interface-shaped Social before any SQL/role/head work', async () => {
    let calls = 0;
    const tx: SqlExecutor = {
      query: async () => {
        calls++;
        throw Error('UNEXPECTED_SQL');
      },
    };
    await expect(
      readPostwarIndustryRunStateFrom(tx, {
        socialConnection: { worldId: 'WORLD_TEST' } as never,
        worldId: 'WORLD_TEST',
        countryId: 'COUNTRY_02',
        facilityId: 'OPEN-02-REFINED_FUEL',
        expectedHead: { worldVersion: '0', eventSequence: '0' },
      }),
    ).rejects.toThrow('GENUINE_SAME_WORLD');
    expect(calls).toBe(0);
  });
  it('does not mint a live same-executor context, source or wage/work state from DTOs', async () => {
    let calls = 0;
    const tx: SqlExecutor = {
      query: async () => {
        calls++;
        throw Error('UNEXPECTED_SQL');
      },
    };
    expect(() => consumePostwarIndustryRunStateFrom(tx, {} as never)).toThrow(
      'LIVE_SAME_EXECUTOR',
    );
    expect(() => releasePostwarIndustryRunStateContext({} as never)).toThrow(
      'LIVE_GENUINE',
    );
    expect(() =>
      projectPostwarIndustryRunSiteSource({} as never, {} as never),
    ).toThrow();
    await expect(
      readPostwarIndustryRunPageOriginalsFrom(tx, {
        baseline: {} as never,
        worldId: 'WORLD_TEST',
        hostCountryId: 'COUNTRY_02',
        officeId: 'SOCIAL',
        expectedHead: { worldVersion: '0', eventSequence: '0' },
        frames: [],
      }),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it('checks actual original bytes before parsing an alleged source or advancing its head', () => {
    expect(() =>
      decodePostwarIndustryFirstDaySourceRow(
        {
          source_text: '{}',
          source_sha256: 'a'.repeat(64),
          source_ref: 'INDUSTRY_FIRST_DAY_' + 'A'.repeat(64),
          world_version: '0',
          event_sequence: '0',
        },
        {
          worldId: 'WORLD_TEST',
          countryId: 'COUNTRY_02',
          facilityId: 'OPEN-02-REFINED_FUEL',
          head: { worldVersion: '0', eventSequence: '0' },
          expectedPins: {
            seedId: 'SEED_TEST',
            seedFingerprint: 'sha256:' + 'a'.repeat(64),
            admissionRef: 'ADMISSION_TEST',
          },
        },
      ),
    ).toThrow('EXACT_CURRENT_SOURCE_BYTES');
  });
});
