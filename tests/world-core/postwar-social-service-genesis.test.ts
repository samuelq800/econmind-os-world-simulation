import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import {
  preparePostwarSocialServiceGenesis,
  consumePostwarSocialServiceGenesis,
  consumePostwarFinalizedSocialServiceGenesis,
  finalizePostwarSocialServiceGenesis,
  createPostwarSocialServiceFundingRequests,
  postwarSocialServiceFundingPurpose,
  type PostwarSocialSupport,
} from '../../apps/world-worker/src/preparation/postwar-social-service-genesis.js';
const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFile(path.join(root, file), 'utf8');
const mappingBytes = await read(
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
);
const mapping = JSON.parse(mappingBytes) as {
  source: { dataFiles: Record<string, unknown> };
};
const sourceBytes: OfficialOpeningSourceBytes = {
  mappingBytes,
  checksumsBytes: await read(
    'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
  ),
  coverageBytes: await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
  ),
  proposalBytes: await read(
    'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
  ),
  datasets: Object.fromEntries(
    await Promise.all(
      Object.keys(mapping.source.dataFiles).map(async (file) => [
        file,
        await read(`artifacts/world-balanced-candidate-v1/${file}`),
      ]),
    ),
  ),
};
const inspected = inspectOfficialOpeningDecisionSource(sourceBytes);
if (!inspected.source) throw Error(JSON.stringify(inspected.blockers));
const source = inspected.source;
const adoption = createOfficialLabourSocialOpeningAdoption({
  source,
  mappingBytes,
  ownerOriginalBytes: await read(
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
  ),
  ownerReceiptBytes: await read(
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
  ),
  datasets: {
    employment: sourceBytes.datasets['data/employment.json']!,
    'population-services':
      sourceBytes.datasets['data/population-services.json']!,
    regions: sourceBytes.datasets['data/regions.json']!,
    facilities: sourceBytes.datasets['data/facilities.json']!,
  },
});

const regionsBytes = sourceBytes.datasets['data/regions.json']!;
const input = {
  adoption,
  mappingBytes,
  regionsBytes,
  worldId: 'WORLD_POSTWAR_SOCIAL_TEST',
  seedId: 'SEED_SOCIAL_TEST',
};
const prepared = preparePostwarSocialServiceGenesis(input);
const sum = (values: readonly string[]) =>
  values.reduce((a, b) => a + BigInt(b), 0n);
// TEST_ONLY finite coverage fixtures: not real funding, hiring, inventory or admission.
const support: PostwarSocialSupport[] = prepared.regions.map((r) => ({
  countryId: r.countryId,
  locationId: r.locationId,
  currency: 'TEST_ONLY_LC',
  sourceRef: 'TEST_ONLY_INPUTS',
  educationBudgetRef: `TEST_ONLY_EDU_${r.locationId}`,
  educationBudgetAvailable: '1000000000000',
  educationUnitCost: '1',
  educationMaterialSeats: r.sourceSchoolSeats,
  healthcareBudgetRef: `TEST_ONLY_CARE_${r.locationId}`,
  healthcareBudgetAvailable: '1000000000000',
  healthcareUnitCost: '1',
  medicineDoses: '1000000000000',
  equipmentEpisodes: '1000000000000',
  waterEpisodes: '1000000000000',
  powerEpisodes: '1000000000000',
  costProvenance: 'GENERATED_POLICY',
}));
const countryBudgets = [
  ...new Set(prepared.regions.map((r) => r.countryId)),
].map((countryId) => ({
  countryId,
  currency: 'TEST_ONLY_LC',
  sourceRef: 'TEST_ONLY_COUNTRY_CEILING',
  educationAmount: '1000000000000000',
  healthcareAmount: '1000000000000000',
}));
const filledPositions = prepared.demands.map((d) => ({
  ...d,
  filledCount: (BigInt(d.requiredCount) / 2n).toString(),
}));
const finalInput = { prepared, support, countryBudgets, filledPositions };

describe('postwar social genesis: actual source bounds and generated t0 queues', () => {
  it('binds only existing 122 BASIC schools and 122 HOSPITALS with exact lawful staffing demand', () => {
    expect(prepared.regions).toHaveLength(122);
    expect(new Set(prepared.regions.map((r) => r.countryId)).size).toBe(70);
    expect(prepared.demands).toHaveLength(854);
    expect(new Set(prepared.demands.map((d) => d.positionId)).size).toBe(854);
    for (const region of prepared.regions) {
      expect(region.serviceKinds).toEqual(['BASIC', 'HOSPITAL']);
      const demands = prepared.demands.filter(
        (d) => d.locationId === region.locationId,
      );
      expect(
        sum(
          demands
            .filter((d) => d.occupation === 'TEACHER')
            .map((d) => d.requiredCount),
        ),
      ).toBe(BigInt(region.sourceTeachers));
      expect(
        sum(
          demands
            .filter((d) => d.occupation !== 'TEACHER')
            .map((d) => d.requiredCount),
        ),
      ).toBe(BigInt(region.sourceMedicalWorkers));
      for (const d of demands) {
        expect(d.employerRole).toBe('GOV');
        expect(d.owner).toBe('PUBLIC_SERVICE');
        if (['DOCTOR', 'TEACHER'].includes(d.occupation))
          expect(d.skill).toBe('HIGH');
        if (d.occupation === 'MEDICAL_TECHNICIAN')
          expect(d.skill).toBe('MEDIUM');
        if (d.occupation === 'NURSE')
          expect(['MEDIUM', 'HIGH']).toContain(d.skill);
        if (d.occupation === 'SUPPORT')
          expect(['LOW', 'MEDIUM']).toContain(d.skill);
      }
    }
  });
  it('partitions existing population and excludes hospitalized pupils without creating workers or people', () => {
    expect(sum(prepared.regions.map((r) => r.demography.population))).toBe(
      14712146434n,
    );
    for (const r of prepared.regions) {
      const d = r.demography;
      expect(sum([d.children, d.elderly, d.workingAge])).toBe(
        BigInt(d.population),
      );
      expect(sum(d.childAges)).toBe(BigInt(d.children));
      expect(
        BigInt(d.labourForce) + BigInt(d.workingAgeOutsideLabourForce),
      ).toBe(BigInt(d.workingAge));
      expect(sum(d.youth16And17)).toBeLessThanOrEqual(
        BigInt(d.workingAgeOutsideLabourForce),
      );
      expect(
        sum(d.hospitalizedChildrenByAge) +
          BigInt(d.hospitalizedElderly) +
          BigInt(d.hospitalizedWorkingAgeOutsideLabourForce),
      ).toBe(BigInt(r.healthcare.occupiedBeds));
      expect(BigInt(r.healthcare.occupiedBeds)).toBeLessThanOrEqual(
        BigInt(r.sourceHospitalBeds),
      );
      for (const c of r.studentCohorts) {
        const age = Number(c.age);
        expect(age).toBeGreaterThanOrEqual(6);
        expect(age).toBeLessThanOrEqual(17);
        const eligible =
          age < 16
            ? BigInt(d.childAges[age]!) -
              BigInt(d.hospitalizedChildrenByAge[age]!)
            : BigInt(d.youth16And17[age - 16]!) -
              BigInt(d.hospitalizedYouth16And17[age - 16]!);
        expect(BigInt(c.applicants)).toBe(eligible);
        expect(BigInt(c.desiredEnrollment)).toBeLessThanOrEqual(eligible);
        expect(BigInt(c.elapsedSimDays)).toBeLessThan(
          BigInt(c.requiredSimDays),
        );
      }
    }
  });
  it('creates regional variation and real nonempty initial queues with no historical services or payments', () => {
    expect(
      new Set(prepared.regions.map((r) => r.disruptionBps)).size,
    ).toBeGreaterThan(70);
    for (const r of prepared.regions) {
      expect(BigInt(r.healthcare.newDemand)).toBeGreaterThan(0n);
      expect(BigInt(r.healthcare.priorBacklog)).toBeGreaterThan(0n);
      expect(BigInt(r.healthcare.occupiedBeds)).toBeGreaterThan(0n);
      expect(
        sum(r.studentCohorts.map((c) => c.desiredEnrollment)),
      ).toBeGreaterThan(0n);
      expect(r.provenance.kind).toBe('GENERATED_POLICY');
      expect(r.healthcare.initialDeliveredEpisodes).toBe('0');
      expect(r.healthcare.historicalServiceEvents).toEqual([]);
    }
    expect(prepared.historyEvents).toEqual([]);
    expect(prepared.financialPostings).toEqual([]);
  });
  it('is deterministic and has world/seed/policy scoped idempotency identities', () => {
    expect(preparePostwarSocialServiceGenesis(input)).toEqual(prepared);
    const changed = preparePostwarSocialServiceGenesis({
      ...input,
      seedId: 'SEED_SOCIAL_OTHER',
    });
    expect(changed.regions[0]!.studentCohorts[0]!.cohortId).not.toBe(
      prepared.regions[0]!.studentCohorts[0]!.cohortId,
    );
    expect(changed.regions[0]!.healthcare.demandId).not.toBe(
      prepared.regions[0]!.healthcare.demandId,
    );
    expect(changed.regions[0]!.demography).toEqual(
      prepared.regions[0]!.demography,
    );
    expect(() => consumePostwarSocialServiceGenesis({ ...prepared })).toThrow(
      'genuine',
    );
  });
  it('computes bounded capacity using explicitly half-filled TEST_ONLY jobs and finite nonpayroll inputs', () => {
    const final = finalizePostwarSocialServiceGenesis(finalInput);
    for (const [i, r] of final.regions.entries()) {
      const original = prepared.regions[i]!;
      expect(BigInt(r.students.actualEnrollment)).toBeLessThanOrEqual(
        BigInt(original.sourceSchoolSeats),
      );
      expect(BigInt(r.students.actualEnrollment)).toBeLessThanOrEqual(
        BigInt(r.students.employedTeachers) * 26n,
      );
      expect(sum(r.students.cohorts.map((c) => c.enrolled))).toBe(
        BigInt(r.students.actualEnrollment),
      );
      expect(r.healthcare.queuedEpisodes).toBe(
        original.healthcare.queuedEpisodes,
      );
      expect(r.healthcare.deliveredEpisodesAtGenesis).toBe('0');
      expect(
        BigInt(r.healthcare.staffedOccupiedBeds) +
          BigInt(r.healthcare.occupiedBedsWithoutStaffCoverage),
      ).toBe(BigInt(original.healthcare.occupiedBeds));
      expect(BigInt(r.healthcare.staffedOccupiedBeds)).toBeLessThanOrEqual(
        BigInt(r.healthcare.staffedBeds),
      );
      expect(r.staffing).toHaveLength(7);
      expect(
        BigInt(r.healthcare.potentialEpisodesPerSimDay),
      ).toBeLessThanOrEqual(BigInt(r.healthcare.staffCapacity));
    }
    expect(final.sourceAdmitted).toBe(false);
    expect(final.serviceEvents).toEqual([]);
    expect(final.financialPostings).toEqual([]);
  });
  it('capacity does not become actual service or employment; zero staffing/medicine bind', () => {
    const result = finalizePostwarSocialServiceGenesis({
      ...finalInput,
      filledPositions: filledPositions.map((d) => ({
        ...d,
        filledCount: d.occupation === 'TEACHER' ? '0' : d.filledCount,
      })),
      support: support.map((s) => ({ ...s, medicineDoses: '0' })),
    });
    for (const [i, r] of result.regions.entries()) {
      expect(r.students.actualEnrollment).toBe('0');
      expect(r.healthcare.potentialEpisodesPerSimDay).toBe('0');
      expect(r.healthcare.queuedEpisodes).toBe(
        prepared.regions[i]!.healthcare.queuedEpisodes,
      );
    }
  });
  it('rejects missing/mismatched/overfilled staffing and reused or unfunded money', () => {
    expect(() =>
      finalizePostwarSocialServiceGenesis({
        ...finalInput,
        filledPositions: filledPositions.slice(1),
      }),
    ).toThrow('staffing');
    expect(() =>
      finalizePostwarSocialServiceGenesis({
        ...finalInput,
        filledPositions: [...filledPositions, filledPositions[0]!],
      }),
    ).toThrow('duplicate');
    expect(() =>
      finalizePostwarSocialServiceGenesis({
        ...finalInput,
        filledPositions: filledPositions.map((p, i) =>
          i
            ? p
            : { ...p, filledCount: (BigInt(p.requiredCount) + 1n).toString() },
        ),
      }),
    ).toThrow('staffing');
    expect(() =>
      finalizePostwarSocialServiceGenesis({
        ...finalInput,
        filledPositions: filledPositions.map((p, i) =>
          i ? p : { ...p, skill: 'LOW' },
        ),
      }),
    ).toThrow('staffing');
    expect(() =>
      finalizePostwarSocialServiceGenesis({
        ...finalInput,
        support: support.map((s, i) =>
          i ? s : { ...s, healthcareBudgetRef: s.educationBudgetRef },
        ),
      }),
    ).toThrow('reused');
    expect(() =>
      finalizePostwarSocialServiceGenesis({
        ...finalInput,
        countryBudgets: countryBudgets.map((c) => ({
          ...c,
          educationAmount: '0',
        })),
      }),
    ).toThrow('ceilings');
    expect(() =>
      finalizePostwarSocialServiceGenesis({
        ...finalInput,
        support: support.map((s, i) =>
          i ? s : { ...s, educationUnitCost: '0' },
        ),
      }),
    ).toThrow('positive');
  });
  it('integrates real source-constrained labour and same-source wage prices without duplicating payroll', async () => {
    const { createPostwarPublicSafetyGenesis } =
      await import('../../apps/world-worker/src/preparation/postwar-public-safety-genesis.js');
    const { preparePostwarLabourGenesis, consumePostwarLabourGenesis } =
      await import('../../apps/world-worker/src/preparation/postwar-labour-genesis.js');
    const { createPostwarMonetaryGenesis } =
      await import('../../apps/world-worker/src/preparation/postwar-monetary-genesis.js');
    const { createPostwarWagePolicy, POSTWAR_WAGE_POLICY_PATH } =
      await import('../../apps/world-worker/src/preparation/postwar-wage-policy.js');
    const countriesBytes = sourceBytes.datasets['data/countries.json']!;
    const safety = createPostwarPublicSafetyGenesis({
      source,
      adoption,
      mappingBytes,
      regionsBytes,
      countriesBytes,
      worldId: input.worldId,
      seed: input.seedId,
      policyBytes: await read('config/postwar-genesis/public-safety.v1.json'),
    });
    const labour = preparePostwarLabourGenesis({
      adoption,
      mappingBytes,
      regionsBytes,
      facilitiesBytes: sourceBytes.datasets['data/facilities.json']!,
      serviceDemands: [...prepared.demands, ...safety.demands],
    });
    const monetary = createPostwarMonetaryGenesis({
      source,
      countriesBytes,
      mappingBytes,
      valueDate: '2026-10-28',
    });
    const wages = createPostwarWagePolicy({
      policyBytes: await read(POSTWAR_WAGE_POLICY_PATH),
      adoption,
      financeSource: source,
      labourPreparation: labour,
      monetaryBindings: monetary.bindings,
    });
    const requests = createPostwarSocialServiceFundingRequests(prepared, wages);
    expect(requests.requests).toHaveLength(244);
    expect(() =>
      postwarSocialServiceFundingPurpose(
        prepared,
        'UNKNOWN_REGION',
        'EDUCATION',
      ),
    ).toThrow('scope');
    expect(() =>
      postwarSocialServiceFundingPurpose(
        { ...prepared },
        prepared.regions[0]!.locationId,
        'EDUCATION',
      ),
    ).toThrow('genuine');
    expect(requests.unitCostsByCountry).toHaveLength(70);
    expect(requests.payrollIncluded).toBe(false);
    expect(requests.cashCreated).toBe(false);
    expect(new Set(requests.requests.map((r) => r.requestId)).size).toBe(244);
    for (const r of requests.requests) {
      expect(r.requestId).toBe(r.purposeId);
      expect(
        ['EDUCATION', 'HOSPITAL'].map((service) =>
          postwarSocialServiceFundingPurpose(
            prepared,
            r.locationId,
            service as 'EDUCATION' | 'HOSPITAL',
          ),
        ),
      ).toContain(r.purposeId);
      expect(r.kind).toBe('OPERATING');
      expect(r.periodDays).toBe('1');
      expect(Number(r.amount)).toBeGreaterThan(0);
    }
    expect(createPostwarSocialServiceFundingRequests(prepared, wages)).toEqual(
      requests,
    );
    expect(() =>
      createPostwarSocialServiceFundingRequests(prepared, { ...wages }),
    ).toThrow('genuine');
    const finalized = finalizePostwarSocialServiceGenesis({
      ...finalInput,
      filledPositions: consumePostwarLabourGenesis(labour).positions,
    });
    expect(finalized.regions).toHaveLength(122);
    expect(finalized.serviceEvents).toEqual([]);
  });
  it('brands finalized actual enrollment and binds it to the exact source preparation', () => {
    const finalized = finalizePostwarSocialServiceGenesis(finalInput);
    expect(
      consumePostwarFinalizedSocialServiceGenesis(finalized, prepared),
    ).toBe(finalized);
    expect(() =>
      consumePostwarFinalizedSocialServiceGenesis({ ...finalized }, prepared),
    ).toThrow('genuine finalized');
    const another = preparePostwarSocialServiceGenesis(input);
    expect(() =>
      consumePostwarFinalizedSocialServiceGenesis(finalized, another),
    ).toThrow('another preparation');
  });
  it('rejects changed source bytes and policy that exceeds the fixed demographic or occupation pools', async () => {
    expect(() =>
      preparePostwarSocialServiceGenesis({
        ...input,
        regionsBytes: regionsBytes + ' ',
      }),
    ).toThrow('changed');
    const policy = JSON.parse(
      await read('config/postwar-genesis/social-services.v1.json'),
    );
    expect(() =>
      preparePostwarSocialServiceGenesis({
        ...input,
        policy: {
          ...policy,
          upperSecondaryYouthShareOfWorkingAgeOutsideLabourForceBps: '10001',
        },
      }),
    ).toThrow('youth');
    expect(() =>
      preparePostwarSocialServiceGenesis({
        ...input,
        policy: {
          ...policy,
          healthcare: { ...policy.healthcare, doctorHighBps: '1801' },
        },
      }),
    ).toThrow('conserve');
    expect(() =>
      preparePostwarSocialServiceGenesis({
        ...input,
        policy: { ...policy, ageWeights0Through15: ['1'] },
      }),
    ).toThrow('16 positive');
  });
});
