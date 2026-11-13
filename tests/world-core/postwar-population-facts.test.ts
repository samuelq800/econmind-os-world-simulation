import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import {
  preparePostwarSocialServiceGenesis,
  finalizePostwarSocialServiceGenesis,
  type PostwarSocialSupport,
} from '../../apps/world-worker/src/preparation/postwar-social-service-genesis.js';
import { createPostwarPublicSafetyGenesis } from '../../apps/world-worker/src/preparation/postwar-public-safety-genesis.js';
import { preparePostwarLabourGenesis } from '../../apps/world-worker/src/preparation/postwar-labour-genesis.js';
import {
  createPostwarPopulationFacts,
  consumePostwarPopulationFacts,
} from '../../apps/world-worker/src/preparation/postwar-population-facts.js';
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
const regionsBytes = sourceBytes.datasets['data/regions.json']!,
  countriesBytes = sourceBytes.datasets['data/countries.json']!;
const worldId = 'WORLD_POSTWAR_POPULATION_TEST',
  seed = 'SEED_POSTWAR_POPULATION_TEST';
const social = preparePostwarSocialServiceGenesis({
  adoption,
  mappingBytes,
  regionsBytes,
  worldId,
  seedId: seed,
});
const safety = createPostwarPublicSafetyGenesis({
  source,
  adoption,
  mappingBytes,
  regionsBytes,
  countriesBytes,
  worldId,
  seed,
  policyBytes: await read('config/postwar-genesis/public-safety.v1.json'),
});
const input = {
  adoption,
  mappingBytes,
  regionsBytes,
  facilitiesBytes: sourceBytes.datasets['data/facilities.json']!,
  serviceDemands: [...social.demands, ...safety.demands],
};
const preparation = preparePostwarLabourGenesis(input);

const facts = createPostwarPopulationFacts({
  labourPreparation: preparation,
  socialPrepared: social,
});
const alternativePolicy = JSON.parse(
  await read('config/postwar-genesis/social-services.v1.json'),
);
alternativePolicy.healthcare.doctorHighBps = '1900';
alternativePolicy.healthcare.nurseHighBps = '1100';
// Finite TEST_ONLY support exercises population mechanics, not financial or
// inventory admission. The final adopter must bind actual shared resources.
const support: PostwarSocialSupport[] = social.regions.map((r) => ({
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
const finalInput = {
  prepared: social,
  filledPositions: preparation.positions,
  support,
  countryBudgets: preparation.countries.map((c) => ({
    countryId: c.countryId,
    currency: 'TEST_ONLY_LC',
    sourceRef: 'TEST_ONLY_COUNTRY_CEILING',
    educationAmount: '1000000000000000',
    healthcareAmount: '1000000000000000',
  })),
};
const finalized = finalizePostwarSocialServiceGenesis(finalInput);
const sum = (values: readonly string[]) =>
  values.reduce((a, b) => a + BigInt(b), 0n);

describe('postwar population facts — one source population, cross-domain references', () => {
  it('partitions actual finalized enrollment, waiting applicants and inpatients without duplicating any person', () => {
    const result = createPostwarPopulationFacts({
      labourPreparation: preparation,
      socialPrepared: social,
      socialFinalized: finalized,
    });
    expect(
      sum(
        result.people
          .filter((p) => p.activity === 'STUDENT')
          .map((p) => p.count),
      ),
    ).toBe(sum(finalized.regions.map((r) => r.students.actualEnrollment)));
    expect(sum(result.people.map((p) => p.count))).toBe(14712146434n);
    expect(result.enrollmentFingerprint).toMatch(/^[0-9a-f]{64}$/);
    const people = new Map(result.people.map((p) => [p.cohortId, p]));
    for (const r of finalized.regions) {
      const regionPeople = result.people.filter(
        (p) => p.regionId === r.locationId,
      );
      let cursor = 0n;
      for (const p of regionPeople) {
        expect(BigInt(p.startOrdinal)).toBe(cursor);
        cursor += BigInt(p.count);
      }
      expect(cursor).toBe(
        BigInt(
          preparation.regions.find((p) => p.locationId === r.locationId)!
            .population,
        ),
      );
      for (const c of r.students.cohorts) {
        const enrolled = result.servicePopulationRefs.find(
          (p) =>
            p.originalCohortId === c.cohortId &&
            p.populationUse === 'STUDENT_ENROLLMENT',
        )!;
        const eligible = result.servicePopulationRefs.find(
          (p) =>
            p.originalCohortId === c.cohortId &&
            p.populationUse === 'ELIGIBLE_SUBSET',
        )!;
        expect(enrolled.count).toBe(c.enrolled);
        expect(eligible.count).toBe(c.applicants);
        expect(sum(enrolled.populationRefs.map((p) => p.count))).toBe(
          BigInt(c.enrolled),
        );
        expect(
          enrolled.populationRefs.every(
            (p) => people.get(p.cohortId)!.activity === 'STUDENT',
          ),
        ).toBe(true);
        const waiting = eligible.populationRefs.filter(
          (p) => people.get(p.cohortId)!.activity !== 'STUDENT',
        );
        expect(sum(waiting.map((p) => p.count))).toBe(BigInt(c.waiting));
      }
      const inpatients = result.servicePopulationRefs.find(
        (p) =>
          p.regionId === r.locationId &&
          p.populationUse === 'INPATIENT_OCCUPANCY',
      )!;
      expect(
        inpatients.populationRefs.every(
          (p) =>
            people.get(p.cohortId)!.activity !== 'STUDENT' &&
            !people.get(p.cohortId)!.labourForce,
        ),
      ).toBe(true);
    }
    expect(
      canonicalSerialize(
        createPostwarPopulationFacts({
          labourPreparation: preparation,
          socialPrepared: social,
          socialFinalized: finalized,
        }),
      ),
    ).toBe(canonicalSerialize(result));
  });
  it('rejects copied finalized evidence and real finalization with a staffing allocation different from labour', () => {
    expect(() =>
      createPostwarPopulationFacts({
        labourPreparation: preparation,
        socialPrepared: social,
        socialFinalized: { ...finalized },
      }),
    ).toThrow();
    const underfilled = finalizePostwarSocialServiceGenesis({
      ...finalInput,
      filledPositions: preparation.positions.map((p) => ({
        ...p,
        filledCount: p.occupation === 'TEACHER' ? '0' : p.filledCount,
      })),
    });
    expect(() =>
      createPostwarPopulationFacts({
        labourPreparation: preparation,
        socialPrepared: social,
        socialFinalized: underfilled,
      }),
    ).toThrow('finalized staffing differs');
    const second = preparePostwarSocialServiceGenesis({
      adoption,
      mappingBytes,
      regionsBytes,
      worldId,
      seedId: seed,
    });
    expect(() =>
      createPostwarPopulationFacts({
        labourPreparation: preparation,
        socialPrepared: second,
        socialFinalized: finalized,
      }),
    ).toThrow();
  });
  it('rejects genuinely issued social demand from a different policy than the allocated positions', () => {
    const changed = preparePostwarSocialServiceGenesis({
      adoption,
      mappingBytes,
      regionsBytes,
      worldId,
      seedId: seed,
      policy: alternativePolicy,
    });
    expect(() =>
      createPostwarPopulationFacts({
        labourPreparation: preparation,
        socialPrepared: changed,
      }),
    ).toThrow('social staffing preparation mismatch');
  });
  it('partitions all 122 regions and 70 countries in exactly one 0..P coordinate preserving P/W/LF/E/U', () => {
    expect(new Set(facts.regions.map((r) => r.countryId)).size).toBe(70);
    expect(facts.regions).toHaveLength(122);
    expect(sum(facts.people.map((p) => p.count))).toBe(14712146434n);
    for (const region of preparation.regions) {
      const people = facts.people.filter(
        (p) => p.regionId === region.locationId,
      );
      let cursor = 0n;
      for (const p of people) {
        expect(BigInt(p.startOrdinal)).toBe(cursor);
        expect(BigInt(p.count)).toBeGreaterThan(0n);
        cursor += BigInt(p.count);
      }
      expect(cursor).toBe(BigInt(region.population));
      expect(sum(people.filter((p) => p.workingAge).map((p) => p.count))).toBe(
        BigInt(region.workingAge),
      );
      expect(sum(people.filter((p) => p.labourForce).map((p) => p.count))).toBe(
        BigInt(region.labourForce),
      );
      expect(
        sum(
          people.filter((p) => p.activity === 'EMPLOYED').map((p) => p.count),
        ),
      ).toBe(BigInt(region.employed));
      expect(
        sum(
          people.filter((p) => p.activity === 'UNEMPLOYED').map((p) => p.count),
        ),
      ).toBe(BigInt(region.unemployed));
    }
  });
  it('maps every local skill position into disjoint employed global ranges without another hire', () => {
    expect(facts.positionPopulationRefs).toHaveLength(
      preparation.positions.length,
    );
    const people = new Map(facts.people.map((p) => [p.cohortId, p]));
    for (const ref of facts.positionPopulationRefs) {
      const original = preparation.positions.find(
        (p) => p.positionId === ref.positionId,
      )!;
      const p = people.get(ref.cohortId)!;
      expect(p.activity).toBe('EMPLOYED');
      expect(ref.regionId).toBe(original.locationId);
      expect(ref.count).toBe(original.filledCount);
      expect(ref.sourcePoolId).toBe(original.personRange.poolId);
      expect(BigInt(ref.startOrdinal)).toBeGreaterThanOrEqual(
        BigInt(p.startOrdinal),
      );
      expect(BigInt(ref.startOrdinal) + BigInt(ref.count)).toBeLessThanOrEqual(
        BigInt(p.startOrdinal) + BigInt(p.count),
      );
    }
    for (const p of facts.people.filter((p) => p.activity === 'EMPLOYED')) {
      const refs = facts.positionPopulationRefs
        .filter((r) => r.cohortId === p.cohortId)
        .sort((a, b) =>
          Number(BigInt(a.startOrdinal) - BigInt(b.startOrdinal)),
        );
      let cursor = BigInt(p.startOrdinal);
      for (const r of refs) {
        expect(BigInt(r.startOrdinal)).toBe(cursor);
        cursor += BigInt(r.count);
      }
      expect(cursor).toBe(BigInt(p.startOrdinal) + BigInt(p.count));
    }
  });
  it('keeps applicant eligibility separate from enrollment and inpatient occupancy, without counting episodes as people', () => {
    expect(facts.people.some((p) => p.activity === 'STUDENT')).toBe(false);
    const people = new Map(facts.people.map((p) => [p.cohortId, p]));
    for (const ref of facts.servicePopulationRefs) {
      expect(sum(ref.populationRefs.map((r) => r.count))).toBe(
        BigInt(ref.count),
      );
      for (const range of ref.populationRefs) {
        const p = people.get(range.cohortId)!;
        expect(p.regionId).toBe(ref.regionId);
        expect(range.startOrdinal).toBe(p.startOrdinal);
        expect(range.count).toBe(p.count);
        expect(p.labourForce).toBe(false);
        if (ref.populationUse === 'INPATIENT_OCCUPANCY')
          expect(p.activity).not.toBe('STUDENT');
      }
    }
    for (const region of social.regions) {
      const eligible = facts.servicePopulationRefs.filter(
        (r) =>
          r.regionId === region.locationId &&
          r.populationUse === 'ELIGIBLE_SUBSET',
      );
      const patients = facts.servicePopulationRefs.find(
        (r) => r.originalCohortId === region.healthcare.occupiedPatientCohortId,
      )!;
      expect(eligible).toHaveLength(12);
      expect(patients.count).toBe(region.healthcare.occupiedBeds);
      const patientIds = new Set(
        patients.populationRefs.map((r) => r.cohortId),
      );
      expect(
        eligible
          .flatMap((r) => r.populationRefs)
          .some((r) => patientIds.has(r.cohortId)),
      ).toBe(false);
      const episodes = facts.episodeDemands.find(
        (r) => r.regionId === region.locationId,
      )!;
      expect(episodes.unit).toBe('EPISODE');
      expect(episodes.queuedEpisodes).toBe(region.healthcare.queuedEpisodes);
      expect(episodes).not.toHaveProperty('populationRefs');
    }
  });
  it('preserves the Core age boundary and youth inpatient subset without double counting', () => {
    for (const region of social.regions) {
      const age = facts.agePartitions.filter(
        (a) => a.regionId === region.locationId,
      );
      expect(
        sum(
          age
            .filter((a) => /^AGE_(?:[0-9]|1[0-5])$/.test(a.ageBand))
            .map((a) => a.populationRef.count),
        ),
      ).toBe(BigInt(region.demography.children));
      expect(
        sum(age.filter((a) => a.inpatient).map((a) => a.populationRef.count)),
      ).toBe(BigInt(region.healthcare.occupiedBeds));
      for (const a of age) {
        const p = facts.people.find(
          (p) => p.cohortId === a.populationRef.cohortId,
        )!;
        expect(p.workingAge).toBe(
          a.ageBand === 'AGE_16' ||
            a.ageBand === 'AGE_17' ||
            a.ageBand === 'AGE_18_64_NON_LF',
        );
      }
    }
  });
  it('is byte-identical on repeat, deeply immutable and requires both real issuers', () => {
    expect(
      canonicalSerialize(
        createPostwarPopulationFacts({
          labourPreparation: preparation,
          socialPrepared: social,
        }),
      ),
    ).toBe(canonicalSerialize(facts));
    expect(consumePostwarPopulationFacts(facts)).toBe(facts);
    expect(Object.isFrozen(facts.people[0])).toBe(true);
    expect(() => consumePostwarPopulationFacts({ ...facts })).toThrow(
      'not issued',
    );
    expect(() =>
      createPostwarPopulationFacts({
        labourPreparation: { ...preparation },
        socialPrepared: social,
      }),
    ).toThrow();
    expect(() =>
      createPostwarPopulationFacts({
        labourPreparation: preparation,
        socialPrepared: { ...social },
      }),
    ).toThrow();
  });
});
