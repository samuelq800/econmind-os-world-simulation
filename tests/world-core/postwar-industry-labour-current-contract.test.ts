import { describe, it, expect } from 'vitest';
import {
  parsePostwarIndustryLabourCurrentRow,
  parsePostwarIndustryLabourCurrentCoverage,
} from '../../packages/core/src/read-models/postwar-industry-labour-current-contract.js';
const fp = 'sha256:' + 'a'.repeat(64);
const row = {
  schemaVersion: 'postwar-industry-labour-current-row-v1',
  countryId: 'COUNTRY_01',
  facilityId: 'FACILITY_01',
  locationId: 'REGION_01',
  operatorId: 'OP_01',
  positionId: 'POSITION_01',
  skill: 'HIGH',
  classificationId: 'STEEL',
  requiredCount: '10',
  openingFilledCount: '6',
  currentEmployedCount: '7',
  measurement: 'EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT',
  completedPersonDays: null,
  paidCost: null,
};
const coverage = {
  schemaVersion: 'postwar-industry-labour-current-coverage-v1',
  countryId: 'COUNTRY_01',
  prefixFingerprint: fp,
  knownEffectsFingerprint: fp,
  coveredThroughEventId: 'EVENT_01',
  coveredThroughEventFingerprint: fp,
  financialPostingCount: '6',
  financialBatchCount: '2',
  financialPostingsFingerprint: fp,
  globalWorldVersion: '3',
  globalEventSequence: '5',
  rowsHash: fp,
  originalScopeSha256: 'b'.repeat(64),
};
describe('Industry headcount browser-safe DATA contract', () => {
  it('distinguishes genuine page-chain DATA shape from the old full-prefix schema', () => {
    const pageProof = {
      schemaVersion: 'postwar-complete-page-proof-v1',
      hashAlgorithm: 'COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1',
      pageCount: '1',
      frameCount: '3',
    };
    const paged = {
      ...coverage,
      schemaVersion: 'postwar-industry-labour-current-page-chain-coverage-v2',
      pageProof,
    };
    expect(
      parsePostwarIndustryLabourCurrentCoverage(paged).pageProof?.frameCount,
    ).toBe('3');
    expect(() =>
      parsePostwarIndustryLabourCurrentCoverage({ ...coverage, pageProof }),
    ).toThrow();
    expect(() =>
      parsePostwarIndustryLabourCurrentCoverage({
        ...paged,
        pageProof: { ...pageProof, frameCount: '2' },
      }),
    ).toThrow();
    expect(() =>
      parsePostwarIndustryLabourCurrentCoverage({
        ...paged,
        globalWorldVersion: '0',
        globalEventSequence: '0',
        coveredThroughEventId: null,
        coveredThroughEventFingerprint: null,
        financialPostingCount: '0',
        financialBatchCount: '0',
      }),
    ).toThrow();
  });

  it('allows only exact empty-prefix H0 metadata without invented event IDs', () => {
    const h0 = {
      ...coverage,
      globalWorldVersion: '0',
      globalEventSequence: '0',
      coveredThroughEventId: null,
      coveredThroughEventFingerprint: null,
      financialPostingCount: '0',
      financialBatchCount: '0',
    };
    expect(
      parsePostwarIndustryLabourCurrentCoverage(h0).coveredThroughEventId,
    ).toBeNull();
    for (const change of [
      { coveredThroughEventId: 'FAKE_EVENT' },
      { financialPostingCount: '1' },
      { globalEventSequence: '1' },
    ])
      expect(() =>
        parsePostwarIndustryLabourCurrentCoverage({ ...h0, ...change }),
      ).toThrow();
    expect(() =>
      parsePostwarIndustryLabourCurrentCoverage({
        ...coverage,
        coveredThroughEventId: null,
        coveredThroughEventFingerprint: null,
      }),
    ).toThrow();
  });

  it('distinguishes opening/current headcount and leaves actual work/payment unknown', () => {
    const r = parsePostwarIndustryLabourCurrentRow(row);
    expect(r.currentEmployedCount).toBe('7');
    expect(r.completedPersonDays).toBeNull();
    expect(r.paidCost).toBeNull();
    expect(Object.isFrozen(r)).toBe(true);
    expect(
      parsePostwarIndustryLabourCurrentCoverage(coverage).financialPostingCount,
    ).toBe('6');
  });
  it.each([
    { currentEmployedCount: '11' },
    { openingFilledCount: '11' },
    { completedPersonDays: '7' },
    { paidCost: '0' },
    { currentEmployedCount: '07' },
    { skill: 'TEACHER' },
    { authority: true },
  ])('rejects capacity/units/unknown facts %j', (changes) => {
    expect(() =>
      parsePostwarIndustryLabourCurrentRow({ ...row, ...changes }),
    ).toThrow();
  });
  it.each([
    { globalEventSequence: '2' },
    { financialPostingCount: '-1' },
    { prefixFingerprint: 'unknown' },
    { originalScopeSha256: fp },
    { schemaVersion: 'old' },
    { ready: true },
  ])('rejects incomplete prefix metadata %j', (changes) => {
    expect(() =>
      parsePostwarIndustryLabourCurrentCoverage({ ...coverage, ...changes }),
    ).toThrow();
  });
});
