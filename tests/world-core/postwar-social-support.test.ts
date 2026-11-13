import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { canonicalSerialize, parseWorldDecimal } from '@econmind/core';
import { preparePostwarWorldGenesis } from '../../apps/world-worker/src/preparation/postwar-world-genesis.js';
import {
  createPostwarUtilityInputs,
  allocatePostwarUtilityInputs,
  POSTWAR_UTILITY_POLICY_PATH,
} from '../../apps/world-worker/src/preparation/postwar-utility-inputs.js';
import {
  finalizePostwarSocialSupport,
  assertPostwarSocialSupportPolicyBytes,
  POSTWAR_SOCIAL_SUPPORT_POLICY_PATH,
} from '../../apps/world-worker/src/preparation/postwar-social-support.js';
import { consumePostwarFinalizedSocialServiceGenesis } from '../../apps/world-worker/src/preparation/postwar-social-service-genesis.js';

const root = path.resolve(import.meta.dirname, '../..');
const world = await preparePostwarWorldGenesis({
  repositoryRoot: root,
  worldId: 'WORLD_SOCIAL_SUPPORT_REAL',
  seedId: 'SEED_SOCIAL_SUPPORT_REAL',
  genesisVersion: 'POSTWAR_OPERATING_GENESIS_20261028_V1',
  valueDate: '2026-10-28',
});
const utilities = createPostwarUtilityInputs({
  sourceBytes: world.context.sourceBytes,
  ownerDecisionBytes: world.context.ownerOriginalBytes,
  adoption: world.context.labourSocial,
  social: world.social,
  worldId: world.input.worldId,
  seedId: world.input.seedId,
  openingGregorianTimestamp: '2026-10-28T00:00:00.000Z',
  policyBytes: await readFile(
    path.join(root, POSTWAR_UTILITY_POLICY_PATH),
    'utf8',
  ),
});
const utilityAllocations = allocatePostwarUtilityInputs(utilities);
const input = {
  social: world.social,
  socialRequests: world.socialRequests,
  wages: world.wages,
  funding: world.funding,
  supplies: world.supplies,
  supplyAllocations: world.supplyAllocations,
  utilities,
  utilityAllocations,
  labour: world.labour,
};
const result = finalizePostwarSocialSupport(input);
const sum = (values: readonly string[]) =>
  values.reduce((a, b) => a + BigInt(b), 0n);

describe('actual 70-country first-day social support composition', () => {
  it('rejects same-version support policy byte drift against a fixed source SHA', async () => {
    const bytes = await readFile(
      path.join(root, POSTWAR_SOCIAL_SUPPORT_POLICY_PATH),
      'utf8',
    );
    expect(() => assertPostwarSocialSupportPolicyBytes(bytes)).not.toThrow();
    expect(() => assertPostwarSocialSupportPolicyBytes(bytes + ' ')).toThrow(
      'pinned',
    );
    expect(() =>
      assertPostwarSocialSupportPolicyBytes(bytes.replace('8500', '8501')),
    ).toThrow('pinned');
  });
  it('joins genuine labour, source cash, supplemental stock and operational utilities into branded actual enrollment', () => {
    expect(result.regions).toHaveLength(122);
    expect(new Set(result.regions.map((r) => r.countryId)).size).toBe(70);
    expect(
      consumePostwarFinalizedSocialServiceGenesis(result, world.social),
    ).toBe(result);
    expect(
      sum(result.regions.map((r) => r.students.actualEnrollment)),
    ).toBeGreaterThan(0n);
    expect(
      sum(result.regions.map((r) => r.healthcare.potentialEpisodesPerSimDay)),
    ).toBeGreaterThan(0n);
    for (const [index, r] of result.regions.entries()) {
      const source = world.social.regions[index]!,
        utility = utilityAllocations.regions.find(
          (u) => u.locationId === r.locationId,
        )!;
      const teacher = world.labour.positions.find(
        (p) => p.locationId === r.locationId && p.occupation === 'TEACHER',
      )!;
      expect(r.students.employedTeachers).toBe(teacher.filledCount);
      expect(BigInt(r.students.actualEnrollment)).toBeLessThanOrEqual(
        BigInt(teacher.filledCount) * 26n,
      );
      expect(BigInt(r.students.actualEnrollment)).toBeLessThanOrEqual(
        BigInt(utility.operationalEducationWaterStudentDays),
      );
      expect(BigInt(r.students.actualEnrollment)).toBeLessThanOrEqual(
        BigInt(utility.operationalEducationPowerStudentDays),
      );
      expect(
        BigInt(r.healthcare.potentialEpisodesPerSimDay),
      ).toBeLessThanOrEqual(BigInt(utility.operationalWaterEpisodes));
      expect(
        BigInt(r.healthcare.potentialEpisodesPerSimDay),
      ).toBeLessThanOrEqual(BigInt(utility.operationalPowerEpisodes));
      expect(
        BigInt(r.healthcare.potentialEpisodesPerSimDay),
      ).toBeLessThanOrEqual(BigInt(r.funding.equipmentEpisodes));
      expect(BigInt(r.funding.equipmentEpisodes)).toBeLessThan(
        BigInt(source.sourceHospitalBeds) * 4n,
      );
      expect(r.healthcare.queuedEpisodes).toBe(
        source.healthcare.queuedEpisodes,
      );
      expect(r.healthcare.deliveredEpisodesAtGenesis).toBe('0');
    }
  });
  it('uses only same purpose shared cash once and includes utility costs in each service price', () => {
    const refs = result.regions.flatMap((r) => [
      r.funding.educationBudgetRef,
      r.funding.healthcareBudgetRef,
    ]);
    expect(new Set(refs).size).toBe(244);
    for (const r of result.regions) {
      const base = world.socialRequests.unitCostsByCountry.find(
        (c) => c.countryId === r.countryId,
      )!;
      expect(
        parseWorldDecimal(r.funding.educationUnitCost).gt(
          base.educationUnitCost,
        ),
      ).toBe(true);
      expect(
        parseWorldDecimal(r.funding.healthcareUnitCost).gt(
          base.healthcareUnitCost,
        ),
      ).toBe(true);
      const e = world.funding.allocations.find(
          (a) => a.fundingRef === r.funding.educationBudgetRef,
        )!,
        h = world.funding.allocations.find(
          (a) => a.fundingRef === r.funding.healthcareBudgetRef,
        )!;
      expect(r.funding.educationBudgetAvailable).toBe(e.amount);
      expect(r.funding.healthcareBudgetAvailable).toBe(h.amount);
      expect(
        parseWorldDecimal(r.funding.educationRequiredPerSimDay).lte(e.amount),
      ).toBe(true);
      expect(
        parseWorldDecimal(r.funding.healthcarePotentialCostPerSimDay).lte(
          h.amount,
        ),
      ).toBe(true);
    }
    expect(result.financialPostings).toEqual([]);
    expect(result.serviceEvents).toEqual([]);
    expect(result.sourceAdmitted).toBe(false);
  });
  it('uses genuine first-day grants, never the whole multi-day reserve or OP stock', () => {
    for (const r of result.regions) {
      const med = world.supplies.stocks.find(
        (s) => s.locationId === r.locationId && s.kind === 'MEDICINE',
      )!;
      const mat = world.supplies.stocks.find(
        (s) => s.locationId === r.locationId && s.kind === 'SCHOOL_MATERIALS',
      )!;
      expect(BigInt(r.funding.medicineDoses)).toBeLessThanOrEqual(
        BigInt(med.dailyBasis),
      );
      expect(BigInt(r.funding.educationMaterialSeats)).toBeLessThanOrEqual(
        BigInt(mat.dailyBasis),
      );
      const gov = world.funding.accounts.find(
        (a) => a.countryId === r.countryId && a.payerRole === 'GOV',
      )!;
      expect(med.entry.account.titleHolderId).toBe(gov.payerEntityId);
      expect(mat.entry.account.titleHolderId).toBe(gov.payerEntityId);
    }
  });
  it('replays deterministically without changing stock, cash or historical service', () => {
    const stocks = canonicalSerialize(world.supplies),
      cash = canonicalSerialize(world.funding);
    expect(finalizePostwarSocialSupport(input)).toEqual(result);
    expect(canonicalSerialize(world.supplies)).toBe(stocks);
    expect(canonicalSerialize(world.funding)).toBe(cash);
  });
  it('rejects forged allocation/funding/labour and altered prices or source requests', () => {
    expect(() =>
      finalizePostwarSocialSupport({ ...input, funding: { ...world.funding } }),
    ).toThrow('Issued');
    expect(() =>
      finalizePostwarSocialSupport({ ...input, labour: { ...world.labour } }),
    ).toThrow();
    expect(() =>
      finalizePostwarSocialSupport({
        ...input,
        supplyAllocations: { ...world.supplyAllocations },
      }),
    ).toThrow('genuine');
    expect(() =>
      finalizePostwarSocialSupport({
        ...input,
        utilityAllocations: { ...utilityAllocations },
      }),
    ).toThrow('Issued');
    expect(() =>
      finalizePostwarSocialSupport({
        ...input,
        socialRequests: { ...world.socialRequests, unitCostsByCountry: [] },
      }),
    ).toThrow('source-wage');
  });
  it('rejects missing genuine utility coverage rather than assuming readiness', () => {
    const incomplete = allocatePostwarUtilityInputs(
      utilities,
      utilities.requests.slice(1),
    );
    expect(() =>
      finalizePostwarSocialSupport({
        ...input,
        utilityAllocations: incomplete,
      }),
    ).toThrow('both finite');
  });
});
