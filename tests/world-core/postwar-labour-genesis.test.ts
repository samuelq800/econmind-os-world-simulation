import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import { preparePostwarSocialServiceGenesis } from '../../apps/world-worker/src/preparation/postwar-social-service-genesis.js';
import { createPostwarPublicSafetyGenesis } from '../../apps/world-worker/src/preparation/postwar-public-safety-genesis.js';
import { createPostwarMonetaryGenesis } from '../../apps/world-worker/src/preparation/postwar-monetary-genesis.js';
import {
  createPostwarWagePolicy,
  POSTWAR_WAGE_POLICY_PATH,
} from '../../apps/world-worker/src/preparation/postwar-wage-policy.js';
import {
  preparePostwarLabourGenesis,
  consumePostwarLabourGenesis,
  materializePostwarLabourGenesis,
  PostwarLabourConstraintError,
  POSTWAR_LABOUR_POLICY,
  type PostwarLabourDemand,
} from '../../apps/world-worker/src/preparation/postwar-labour-genesis.js';

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
const worldId = 'WORLD_POSTWAR_LABOUR_TEST',
  seed = 'SEED_POSTWAR_LABOUR_20261028';
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
const sum = (values: readonly string[]) =>
  values.reduce((total, value) => total + BigInt(value), 0n).toString();

describe('postwar labour genesis — exact source population, generated lawful positions, no payments', () => {
  it('conserves all 70 countries source employed/unemployed and complete 14,712,146,434 population', () => {
    expect(preparation.countries).toHaveLength(70);
    expect(preparation.regions).toHaveLength(122);
    expect(
      sum(preparation.countries.map((country) => country.population)),
    ).toBe('14712146434');
    for (const country of preparation.countries) {
      const target = adoption.employmentTargets.find(
        (entry) => entry.countryId === country.countryId,
      )!;
      expect(
        sum(
          preparation.positions
            .filter((position) => position.countryId === country.countryId)
            .map((position) => position.filledCount),
        ),
      ).toBe(target.employed);
      expect(country.employed).toBe(target.employed);
      expect(country.unemployed).toBe(target.unemployed);
      expect(BigInt(country.employed) + BigInt(country.unemployed)).toBe(
        BigInt(target.labourForce),
      );
    }
    for (const region of preparation.regions) {
      expect(BigInt(region.employed) + BigInt(region.unemployed)).toBe(
        BigInt(region.labourForce),
      );
      expect(
        BigInt(region.labourForce) +
          BigInt(region.workingAgeOutsideLabourForce),
      ).toBe(BigInt(region.workingAge));
      expect(BigInt(region.workingAge) + BigInt(region.outsideWorkingAge)).toBe(
        BigInt(region.population),
      );
    }
    expect(preparation.generatedHiringEvents).toBe(false);
    expect(preparation.wagesPaid).toBe(false);
  });
  it('partitions every real region/skill LF pool into nonoverlapping job ordinals and exact source unemployment', () => {
    expect(
      new Set(preparation.positions.map((position) => position.positionId))
        .size,
    ).toBe(preparation.positions.length);
    for (const pool of adoption.skillAvailability) {
      const positions = preparation.positions
        .filter(
          (position) =>
            position.locationId === pool.locationId &&
            position.skill === pool.skill,
        )
        .sort((a, b) =>
          BigInt(a.personRange.startOrdinal) <
          BigInt(b.personRange.startOrdinal)
            ? -1
            : 1,
        );
      let cursor = 0n;
      for (const position of positions) {
        expect(position.personRange.startOrdinal).toBe(cursor.toString());
        expect(position.personRange.count).toBe(position.filledCount);
        expect(position.personRange.poolId).toBe(
          `POSTWAR_LF_${pool.locationId}_${pool.skill}`,
        );
        cursor += BigInt(position.filledCount);
      }
      const unemployed = preparation.nonEmployedAggregates.find(
        (entry) =>
          entry.locationId === pool.locationId && entry.skill === pool.skill,
      )!;
      expect(unemployed.status).toBe('UNEMPLOYED_SEARCHING');
      expect(cursor + BigInt(unemployed.count)).toBe(BigInt(pool.count));
    }
  });
  it('keeps source sectors and named public staff targets while giving ordinary source services six explicit recovery functions', () => {
    for (const target of adoption.employmentTargets) {
      const positions = preparation.positions.filter(
        (position) => position.countryId === target.countryId,
      );
      for (const [sector, count] of Object.entries(target.sectors))
        expect(
          sum(
            positions
              .filter(
                (position) =>
                  position.sourceBucket === 'INDUSTRY' &&
                  position.classificationId === sector,
              )
              .map((position) => position.filledCount),
          ),
        ).toBe(count);
      expect(
        sum(
          positions
            .filter(
              (position) => position.sourceBucket === 'OTHER_DOMESTIC_SERVICES',
            )
            .map((position) => position.filledCount),
        ),
      ).toBe(target.otherDomesticServices);
      expect(
        sum(
          positions
            .filter(
              (position) => position.sourceBucket === 'EDUCATION_AND_HEALTH',
            )
            .map((position) => position.filledCount),
        ),
      ).toBe(target.educationAndHealth);
    }
    const ordinary = preparation.positions.filter((position) =>
      position.positionId.startsWith('POSTWAR_SERVICE_'),
    );
    expect(
      new Set(ordinary.map((position) => position.classificationId)),
    ).toEqual(
      new Set(
        POSTWAR_LABOUR_POLICY.ordinaryServices.map((service) => service.sector),
      ),
    );
    expect(
      ordinary.every(
        (position) =>
          position.classificationId !== 'OTHER_DOMESTIC_SERVICES' &&
          position.provenance === 'GENERATED_POLICY' &&
          position.policyVersion === POSTWAR_LABOUR_POLICY.version,
      ),
    ).toBe(true);
  });
  it('retains original generic teacher proposals separately while actual new teacher positions obey Core HIGH', () => {
    expect(preparation.preservedSourceSkillProposals).toHaveLength(244);
    expect(
      preparation.preservedSourceSkillProposals.some(
        (entry) => BigInt(entry.genericSourceSkillDemand.LOW) > 0n,
      ),
    ).toBe(true);
    expect(
      preparation.positions
        .filter((position) => position.occupation === 'TEACHER')
        .every(
          (position) =>
            position.skill === 'HIGH' && position.employerRole === 'GOV',
        ),
    ).toBe(true);
    expect(
      preparation.positions
        .filter((position) => position.occupation === 'MEDICAL_TECHNICIAN')
        .every((position) => position.skill === 'MEDIUM'),
    ).toBe(true);
  });
  it('is byte-identical on rerun and with the same public demands supplied in a different order', () => {
    const before = JSON.stringify(adoption);
    expect(canonicalSerialize(preparePostwarLabourGenesis(input))).toBe(
      canonicalSerialize(preparation),
    );
    expect(
      canonicalSerialize(
        preparePostwarLabourGenesis({
          ...input,
          serviceDemands: [...input.serviceDemands].reverse(),
        }),
      ),
    ).toBe(canonicalSerialize(preparation));
    expect(JSON.stringify(adoption)).toBe(before);
    expect(Object.isFrozen(preparation.positions[0]!.personRange)).toBe(true);
  });
  it('rejects duplicates, wrong employers and missing public targets before matching rather than silently dropping them', () => {
    const first = input.serviceDemands[0]!;
    expect(() =>
      preparePostwarLabourGenesis({
        ...input,
        serviceDemands: [...input.serviceDemands, first],
      }),
    ).toThrow('duplicate position');
    expect(() =>
      preparePostwarLabourGenesis({
        ...input,
        serviceDemands: [
          { ...first, employerId: 'WRONG_EMPLOYER' },
          ...input.serviceDemands.slice(1),
        ],
      }),
    ).toThrow('cross-country/region/employer');
    expect(() =>
      preparePostwarLabourGenesis({
        ...input,
        serviceDemands: input.serviceDemands.filter(
          (demand) => demand.positionId !== first.positionId,
        ),
      }),
    ).toThrow('PUBLIC_SOURCE_STAFF_TARGET_NOT_COVERED');
  });
  it('rejects illegal teacher/technician skill changes without modifying source skill pools', () => {
    for (const [occupation, skill] of [
      ['TEACHER', 'LOW'],
      ['MEDICAL_TECHNICIAN', 'HIGH'],
    ] as const) {
      const index = input.serviceDemands.findIndex(
        (demand) => demand.occupation === occupation,
      );
      expect(index).toBeGreaterThanOrEqual(0);
      expect(() =>
        preparePostwarLabourGenesis({
          ...input,
          serviceDemands: input.serviceDemands.map((demand, at) =>
            at === index ? { ...demand, skill } : demand,
          ),
        }),
      ).toThrow('illegal occupation/skill');
    }
    const teacher = input.serviceDemands.find(
      (demand) => demand.occupation === 'TEACHER',
    )!;
    expect(() =>
      preparePostwarLabourGenesis({
        ...input,
        serviceDemands: input.serviceDemands.map((demand) =>
          demand.positionId === teacher.positionId
            ? { ...demand, occupation: 'SUPPORT', skill: 'LOW' }
            : demand,
        ),
      }),
    ).toThrow('source teacher target requires TEACHER/HIGH');
  });
  it('reports the actual country, region, HIGH skill and deficit for an infeasible demand, without increasing unemployment', () => {
    const country = adoption.employmentTargets[0]!,
      region = preparation.regions.find(
        (entry) => entry.countryId === country.countryId,
      )!;
    const existing = sum(
      safety.demands
        .filter((demand) => demand.countryId === country.countryId)
        .map((demand) => demand.requiredCount),
    );
    const demand: PostwarLabourDemand = {
      positionId: 'TEST_ONLY_INFEASIBLE_HIGH_PUBLIC_POSITION',
      countryId: country.countryId,
      locationId: region.locationId,
      skill: 'HIGH',
      owner: 'PUBLIC_SERVICE',
      classificationId: 'PUBLIC_SAFETY',
      requiredCount: (
        BigInt(country.otherDomesticServices) - BigInt(existing)
      ).toString(),
      sourceWeight: '1',
      employerId: adoption.employers.find(
        (entry) =>
          entry.countryId === country.countryId && entry.role === 'GOV',
      )!.employerId,
      employerRole: 'GOV',
      occupation: 'GENERAL',
      sourceBucket: 'OTHER_DOMESTIC_SERVICES',
      sourceObjectId: 'TEST_ONLY_INVALID_PUBLIC_DEMAND',
      policyVersion: 'TEST_ONLY_INVALID',
      provenance: 'GENERATED_POLICY',
    };
    try {
      preparePostwarLabourGenesis({
        ...input,
        serviceDemands: [...input.serviceDemands, demand],
      });
      throw Error('unexpected success');
    } catch (error) {
      expect(error).toBeInstanceOf(PostwarLabourConstraintError);
      const issue = (error as PostwarLabourConstraintError).constraints[0]!;
      expect(issue).toMatchObject({
        code: 'FIXED_OCCUPATION_SKILL_CAPACITY',
        countryId: country.countryId,
        locationId: region.locationId,
        skill: 'HIGH',
      });
      expect(BigInt(issue.difference)).toBeGreaterThan(0n);
    }
  });
  it('rejects edited source bytes, forged preparation and missing wage/funding input', () => {
    expect(() =>
      preparePostwarLabourGenesis({
        ...input,
        regionsBytes: input.regionsBytes + ' ',
      }),
    ).toThrow('source bytes drift');
    expect(() => consumePostwarLabourGenesis({ ...preparation })).toThrow(
      'genuine labour preparation',
    );
    expect(() =>
      materializePostwarLabourGenesis(preparation, { wagesByPositionId: {} }),
    ).toThrow('exact wage/funding');
  });
  it('materializes through the actual Core with generated source-calibrated wages and no payment or hiring events', async () => {
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
      monetaryBindings: monetary.bindings,
      labourPreparation: preparation,
    });
    // Explicit TEST_ONLY linkage exercises Core consistency, NOT a certificate
    // of payroll backing. Root's financial validation must supply real refs.
    const wagesByPositionId = Object.fromEntries(
      preparation.positions.map((position) => [
        position.positionId,
        {
          ...wages.wagesByPositionId[position.positionId]!,
          payrollFundingRef: `TEST_ONLY_NOT_FUNDING_${createHash('sha256').update(position.positionId).digest('hex').slice(0, 24).toUpperCase()}`,
        },
      ]),
    );
    const actual = materializePostwarLabourGenesis(preparation, {
      wagesByPositionId,
    });
    expect(
      sum(actual.state.positions.map((position) => position.employedCount)),
    ).toBe(sum(adoption.employmentTargets.map((target) => target.employed)));
    expect(actual.unmatched).toBe('0');
    expect(actual.generatedHiringEvents).toBe(false);
    expect(actual.wagesPaid).toBe(false);
    expect(actual.state.appliedFactBindings).toEqual([]);
  });
});
