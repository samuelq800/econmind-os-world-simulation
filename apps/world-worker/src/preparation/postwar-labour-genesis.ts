/** Owner-authorized generated postwar policy. No hiring events, money issuance or World start. */
import { createHash } from 'node:crypto';
import {
  allocateOpeningPeopleLargestRemainder,
  canonicalSerialize,
  canonicalDecimal,
  parseWorldDecimal,
  materializeOpeningLabourState,
  type OpeningLabourPositionDemand,
  type OpeningLabourTarget,
  type LabourAggregate,
} from '@econmind/core';
import {
  consumeLabourSocialOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from './official-labour-social-opening-adoption.js';
import { OFFICIAL_OPENING_RECONCILIATION_PINS } from './official-opening-decision-reconciliation.js';

export const POSTWAR_LABOUR_POLICY = Object.freeze({
  version: 'POSTWAR_LABOUR_GENESIS_V1',
  provenance: 'GENERATED_POLICY',
  ownerInstructionRef: 'Sentinel_a619bdbe25588191aa05709db76c7567',
  ownerInstructionAt: '2026-10-28T14:27:54.000Z',
  regionalServiceDistribution:
    'SOURCE_POPULATION_WEIGHT_WITH_REMAINING_LF_CAPACITY',
  unemploymentSkillWeights: Object.freeze({ LOW: '3', MEDIUM: '2', HIGH: '1' }),
  ordinaryServices: Object.freeze([
    Object.freeze({ sector: 'RETAIL_AND_DISTRIBUTION', weight: '28' }),
    Object.freeze({ sector: 'HOUSEHOLD_REPAIR', weight: '18' }),
    Object.freeze({ sector: 'FOOD_AND_ACCOMMODATION', weight: '18' }),
    Object.freeze({ sector: 'LOCAL_TRANSPORT_SERVICES', weight: '14' }),
    Object.freeze({ sector: 'PERSONAL_AND_CARE_SERVICES', weight: '12' }),
    Object.freeze({
      sector: 'PROFESSIONAL_AND_BUSINESS_SERVICES',
      weight: '10',
    }),
  ]),
  ordinaryServiceMeaning:
    'Explicit local recovery functions, each with LOW support/MEDIUM technical/HIGH professional task tiers; source otherDomesticServices total is fixed before matching, never an unmatched-person sink.',
});
export type PostwarLabourDemand = Omit<
  OpeningLabourPositionDemand,
  | 'wageAmount'
  | 'wageCurrency'
  | 'wagePeriod'
  | 'wageVersion'
  | 'payrollFundingRef'
> &
  Readonly<{
    sourceBucket:
      | 'INDUSTRY'
      | 'POWER'
      | 'LOGISTICS'
      | 'EDUCATION_AND_HEALTH'
      | 'OTHER_DOMESTIC_SERVICES';
    sourceObjectId: string;
    policyVersion: string;
    provenance: 'SOURCE_MAPPED' | 'GENERATED_POLICY';
  }>;
export interface PostwarFilledPosition extends PostwarLabourDemand {
  readonly filledCount: string;
  /** Half-open ordinal partition of an aggregate source LF skill pool, not invented individual identities. */
  readonly personRange: Readonly<{
    poolId: string;
    startOrdinal: string;
    count: string;
  }>;
}
export interface PostwarLabourConstraint {
  readonly code: string;
  readonly countryId: string;
  readonly locationId: string | null;
  readonly skill: string | null;
  readonly required: string;
  readonly available: string;
  readonly difference: string;
}
export class PostwarLabourConstraintError extends Error {
  constructor(readonly constraints: readonly PostwarLabourConstraint[]) {
    super(`POSTWAR_LABOUR_CONSTRAINT:${canonicalSerialize(constraints)}`);
  }
}
interface RegionResult {
  readonly countryId: string;
  readonly locationId: string;
  readonly sourceRegionId: string;
  readonly population: string;
  readonly workingAge: string;
  readonly labourForce: string;
  readonly employed: string;
  readonly unemployed: string;
  readonly workingAgeOutsideLabourForce: string;
  readonly outsideWorkingAge: string;
}
declare const preparedLabour: unique symbol;
export interface PostwarLabourGenesisPreparation {
  readonly [preparedLabour]: true;
  readonly schemaVersion: 'postwar-labour-genesis-v1';
  readonly status: 'ALLOCATED_PENDING_WAGES_AND_FINANCE_VALIDATION';
  readonly policy: typeof POSTWAR_LABOUR_POLICY;
  readonly sourcePackageId: string;
  readonly sourceChecksumsSha256: string;
  readonly sourceReferences: readonly Readonly<{
    path: string;
    sha256: string;
  }>[];
  readonly positions: readonly PostwarFilledPosition[];
  readonly targets: readonly OpeningLabourTarget[];
  readonly nonEmployedAggregates: readonly LabourAggregate[];
  readonly regions: readonly RegionResult[];
  readonly countries: readonly Readonly<{
    countryId: string;
    population: string;
    labourForce: string;
    employed: string;
    unemployed: string;
    sourceOtherDomesticServices: string;
    publicServiceFromDomesticServices: string;
    ordinaryServiceEmployment: string;
  }>[];
  readonly skillAvailability: OfficialLabourSocialOpeningAdoption['skillAvailability'];
  readonly populationAvailability: OfficialLabourSocialOpeningAdoption['populationAvailability'];
  readonly employers: OfficialLabourSocialOpeningAdoption['employers'];
  readonly preservedSourceSkillProposals: readonly Readonly<{
    sourceFacilityId: string;
    genericSourceSkillDemand: Readonly<
      Record<'LOW' | 'MEDIUM' | 'HIGH', string>
    >;
  }>[];
  readonly generatedHiringEvents: false;
  readonly wagesPaid: false;
}
export type PostwarLabourPreparation = PostwarLabourGenesisPreparation;
const issued = new WeakSet<object>();
const skills = ['LOW', 'MEDIUM', 'HIGH'] as const;
type Row = Record<string, unknown>;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function invalid(reason: string): never {
  throw new Error(`POSTWAR_LABOUR_INVALID:${reason}`);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function row(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('record required');
  return value as Row;
}
function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) invalid('array required');
  return value.map(row);
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) invalid('explicit text required');
  return value;
}
function whole(value: unknown): string {
  const number = parseWorldDecimal(text(value));
  if (number.isNegative() || !number.isInteger())
    invalid('whole nonnegative source count required');
  return canonicalDecimal(number);
}
function lossless(bytes: string): unknown {
  const parse = JSON.parse as (
    input: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  return parse(bytes, (_key, value, context) =>
    typeof value === 'number'
      ? (context.source ?? invalid('lossless source required'))
      : value,
  );
}
const sum = (values: readonly string[]) =>
  values.reduce((total, value) => total + BigInt(value), 0n).toString();
function constraint(
  code: string,
  countryId: string,
  locationId: string | null,
  skill: string | null,
  required: bigint,
  available: bigint,
): never {
  throw new PostwarLabourConstraintError(
    freeze([
      {
        code,
        countryId,
        locationId,
        skill,
        required: required.toString(),
        available: available.toString(),
        difference: (required - available).toString(),
      },
    ]),
  );
}
function allocate(
  total: string,
  demands: readonly Readonly<{
    id: string;
    weight: string;
    capacity: string;
  }>[],
  countryId: string,
  locationId: string | null,
) {
  const result = allocateOpeningPeopleLargestRemainder({ total, demands });
  if (result.unmatched !== '0')
    constraint(
      'UNMATCHED_ALLOCATION',
      countryId,
      locationId,
      null,
      BigInt(total),
      BigInt(total) - BigInt(result.unmatched),
    );
  return new Map(result.assignments.map((entry) => [entry.id, entry.count]));
}
function legal(demand: PostwarLabourDemand): void {
  const allowed: Record<
    OpeningLabourPositionDemand['occupation'],
    readonly string[]
  > = {
    GENERAL: skills,
    TEACHER: ['HIGH'],
    DOCTOR: ['HIGH'],
    NURSE: ['MEDIUM', 'HIGH'],
    MEDICAL_TECHNICIAN: ['MEDIUM'],
    SUPPORT: ['LOW', 'MEDIUM'],
  };
  if (
    !allowed[demand.occupation]?.includes(demand.skill) ||
    !demand.positionId ||
    !demand.sourceObjectId ||
    !demand.policyVersion ||
    !['SOURCE_MAPPED', 'GENERATED_POLICY'].includes(demand.provenance)
  )
    invalid('illegal occupation/skill/provenance');
  if ((demand.owner === 'PUBLIC_SERVICE') !== (demand.employerRole === 'GOV'))
    invalid('employer ownership mismatch');
  if (
    demand.owner === 'PUBLIC_SERVICE' &&
    ![
      'EDUCATION',
      'HEALTHCARE',
      'PUBLIC_SAFETY',
      'PUBLIC_ADMINISTRATION',
    ].includes(demand.classificationId)
  )
    invalid('unsupported public classification');
  if (
    demand.occupation === 'TEACHER' &&
    (demand.owner !== 'PUBLIC_SERVICE' ||
      demand.classificationId !== 'EDUCATION')
  )
    invalid('teacher outside education');
  if (
    ['DOCTOR', 'NURSE', 'MEDICAL_TECHNICIAN'].includes(demand.occupation) &&
    (demand.owner !== 'PUBLIC_SERVICE' ||
      demand.classificationId !== 'HEALTHCARE')
  )
    invalid('clinical occupation outside healthcare');
  if (
    demand.owner === 'PUBLIC_SERVICE' &&
    ['EDUCATION', 'HEALTHCARE'].includes(demand.classificationId) &&
    demand.occupation === 'GENERAL'
  )
    invalid('generic public education/healthcare occupation');
  whole(demand.requiredCount);
  whole(demand.sourceWeight);
  if (BigInt(demand.requiredCount) > 0n && BigInt(demand.sourceWeight) === 0n)
    invalid('positive demand needs positive source weight');
}

/** Exact source targets + separately generated lawful public demands; no implicit zero/public default. */
export function preparePostwarLabourGenesis(
  input: Readonly<{
    adoption: OfficialLabourSocialOpeningAdoption;
    mappingBytes: string;
    facilitiesBytes: string;
    regionsBytes: string;
    serviceDemands: readonly PostwarLabourDemand[];
  }>,
): PostwarLabourGenesisPreparation {
  const adoption = input.adoption;
  consumeLabourSocialOpeningAdoption(adoption);
  for (const [dataset, bytes] of [
    ['facilities', input.facilitiesBytes],
    ['regions', input.regionsBytes],
  ] as const)
    if (
      sha(bytes) !==
      adoption.sourceProvenance.find((source) => source.dataset === dataset)
        ?.sha256
    )
      invalid(`source bytes drift:${dataset}`);
  if (
    sha(input.mappingBytes) !==
    OFFICIAL_OPENING_RECONCILIATION_PINS.mappingSha256
  )
    invalid('mapping bytes drift');
  const mapping = row(row(lossless(input.mappingBytes)).mappings);
  const countries = new Map(
    rows(mapping.countries).map((entry) => [
      text(entry.sourceCountryId),
      text(entry.coreCountryId),
    ]),
  );
  const mappedRegions = new Map(
    rows(mapping.regions).map((entry) => [
      text(entry.sourceRegionId),
      {
        countryId: text(entry.coreCountryId),
        locationId: text(entry.normalizedRegionId),
      },
    ]),
  );
  const sourceRegions = rows(lossless(input.regionsBytes));
  const regions = sourceRegions
    .map((source) => {
      const mapped = mappedRegions.get(text(source.id));
      if (!mapped || countries.get(text(source.countryId)) !== mapped.countryId)
        invalid('region mapping mismatch');
      const initial = row(source.initial);
      const available = Object.fromEntries(
        skills.map((skill) => [
          skill,
          BigInt(whole(row(initial.skills)[skill.toLowerCase()])),
        ]),
      ) as Record<(typeof skills)[number], bigint>;
      const labourForce = whole(initial.labourForce),
        workingAge = whole(initial.workingAge),
        population = whole(initial.population);
      if (
        sum(Object.values(available).map(String)) !== labourForce ||
        BigInt(labourForce) > BigInt(workingAge) ||
        BigInt(workingAge) > BigInt(population)
      )
        invalid('source population bounds');
      return {
        ...mapped,
        sourceRegionId: text(source.id),
        population,
        workingAge,
        labourForce,
        urbanBps: BigInt(
          canonicalDecimal(
            parseWorldDecimal(
              text(row(source.humanGeography).scenarioUrbanShare),
            ).times(10000),
          ),
        ),
        available,
        initial,
      };
    })
    .sort((a, b) => compare(a.locationId, b.locationId));
  const byLocation = new Map(
    regions.map((region) => [region.locationId, region]),
  );
  const employer = (countryId: string, role: 'GOV' | 'OP') => {
    const entries = adoption.employers.filter(
      (entry) => entry.countryId === countryId && entry.role === role,
    );
    if (entries.length !== 1) invalid('nonunique employer');
    return entries[0]!.employerId;
  };
  const fixed: PostwarLabourDemand[] = JSON.parse(
    canonicalSerialize(input.serviceDemands),
  );
  const ids = new Set<string>();
  const admit = (demand: PostwarLabourDemand) => {
    legal(demand);
    const region = byLocation.get(demand.locationId);
    if (
      !region ||
      region.countryId !== demand.countryId ||
      employer(demand.countryId, demand.employerRole) !== demand.employerId
    )
      invalid('cross-country/region/employer demand');
    if (ids.has(demand.positionId)) invalid('duplicate position ID');
    ids.add(demand.positionId);
  };
  for (const demand of fixed) {
    if (
      !['EDUCATION_AND_HEALTH', 'OTHER_DOMESTIC_SERVICES'].includes(
        demand.sourceBucket,
      ) ||
      demand.owner !== 'PUBLIC_SERVICE'
    )
      invalid('external demand must use a public source bucket');
    if (
      demand.sourceBucket === 'OTHER_DOMESTIC_SERVICES' &&
      !['PUBLIC_SAFETY', 'PUBLIC_ADMINISTRATION'].includes(
        demand.classificationId,
      )
    )
      invalid('ordinary source bucket requires named public safety/admin job');
    admit(demand);
  }
  for (const cap of adoption.capacities.filter(
    (entry) =>
      entry.sourceProjectId === 'PROJECT-31' ||
      entry.sourceProjectId === 'PROJECT-35',
  )) {
    const matching = fixed.filter(
      (demand) =>
        demand.sourceBucket === 'EDUCATION_AND_HEALTH' &&
        demand.sourceObjectId === cap.sourceFacilityId,
    );
    if (
      cap.sourceProjectId === 'PROJECT-31' &&
      matching.some(
        (demand) => demand.occupation !== 'TEACHER' || demand.skill !== 'HIGH',
      )
    )
      invalid(
        `source teacher target requires TEACHER/HIGH:${cap.core.countryId}/${cap.core.locationId}`,
      );
    if (
      matching.some(
        (demand) =>
          demand.locationId !== cap.core.locationId ||
          demand.countryId !== cap.core.countryId ||
          demand.classificationId !==
            (cap.sourceProjectId === 'PROJECT-31' ? 'EDUCATION' : 'HEALTHCARE'),
      ) ||
      sum(matching.map((demand) => demand.requiredCount)) !==
        cap.requiredStaffTarget
    )
      constraint(
        'PUBLIC_SOURCE_STAFF_TARGET_NOT_COVERED',
        cap.core.countryId,
        cap.core.locationId,
        null,
        BigInt(cap.requiredStaffTarget!),
        BigInt(sum(matching.map((demand) => demand.requiredCount))),
      );
  }
  if (
    fixed.some(
      (demand) =>
        demand.sourceBucket === 'EDUCATION_AND_HEALTH' &&
        !adoption.capacities.some(
          (cap) =>
            ['PROJECT-31', 'PROJECT-35'].includes(cap.sourceProjectId) &&
            cap.sourceFacilityId === demand.sourceObjectId,
        ),
    )
  )
    invalid('unknown education/health source asset');
  const facilities = rows(lossless(input.facilitiesBytes));
  for (const facility of facilities) {
    if (
      facility.constructionStatusProposal !== 'OPENING_EXISTING_ASSET' ||
      ['PROJECT-31', 'PROJECT-35', 'PROJECT-36'].includes(
        String(facility.projectId),
      )
    )
      continue;
    const countryId = countries.get(text(facility.countryId)),
      mapped = mappedRegions.get(text(facility.regionId));
    if (!countryId || !mapped || mapped.countryId !== countryId)
      invalid('facility region/country mismatch');
    const classificationId =
      typeof facility.commodityId === 'string'
        ? facility.commodityId
        : ['PROJECT-10', 'PROJECT-11', 'PROJECT-13', 'PROJECT-23'].includes(
              String(facility.projectId),
            )
          ? 'POWER'
          : ['PROJECT-21', 'PROJECT-25', 'PROJECT-26'].includes(
                String(facility.projectId),
              )
            ? 'LOGISTICS'
            : invalid('unclassified adopted non-social facility');
    const counts = row(facility.labourBySkill);
    if (
      sum(skills.map((skill) => whole(counts[skill.toLowerCase()]))) !==
      whole(facility.requiredWorkers)
    )
      invalid('facility demand skill totals differ');
    for (const skill of skills) {
      const count = whole(counts[skill.toLowerCase()]);
      if (count === '0') continue;
      const demand: PostwarLabourDemand = {
        positionId: `POSTWAR_SOURCE_${sha(`${facility.id}/${skill}`).toUpperCase()}`,
        countryId,
        locationId: mapped.locationId,
        skill,
        owner: 'PRIVATE_SECTOR',
        classificationId,
        requiredCount: count,
        sourceWeight: count,
        employerId: employer(countryId, 'OP'),
        employerRole: 'OP',
        occupation: 'GENERAL',
        sourceBucket:
          classificationId === 'POWER'
            ? 'POWER'
            : classificationId === 'LOGISTICS'
              ? 'LOGISTICS'
              : 'INDUSTRY',
        sourceObjectId: text(facility.id),
        policyVersion: POSTWAR_LABOUR_POLICY.version,
        provenance: 'SOURCE_MAPPED',
      };
      admit(demand);
      fixed.push(demand);
    }
  }
  // Fixed source requirements are tested before any flexible local-service
  // programme is generated. Scarce/high-skilled public staff cannot be hidden.
  for (const demand of fixed) {
    const region = byLocation.get(demand.locationId)!;
    const remaining =
      region.available[demand.skill] - BigInt(demand.requiredCount);
    if (remaining < 0n)
      constraint(
        'FIXED_OCCUPATION_SKILL_CAPACITY',
        demand.countryId,
        demand.locationId,
        demand.skill,
        BigInt(demand.requiredCount),
        region.available[demand.skill],
      );
    region.available[demand.skill] = remaining;
  }
  const all = [...fixed];
  const nonEmployedAggregates: LabourAggregate[] = [];
  const regionResults: RegionResult[] = [];
  const countryResults: PostwarLabourGenesisPreparation['countries'][number][] =
    [];
  for (const target of [...adoption.employmentTargets].sort((a, b) =>
    compare(a.countryId, b.countryId),
  )) {
    const local = regions.filter(
      (region) => region.countryId === target.countryId,
    );
    const countryFixed = fixed.filter(
      (demand) => demand.countryId === target.countryId,
    );
    for (const [bucket, required] of [
      ['POWER', target.power],
      ['LOGISTICS', target.logistics],
      ['EDUCATION_AND_HEALTH', target.educationAndHealth],
    ] as const)
      if (
        sum(
          countryFixed
            .filter((demand) => demand.sourceBucket === bucket)
            .map((demand) => demand.requiredCount),
        ) !== required
      )
        invalid(`source country bucket changed:${target.countryId}/${bucket}`);
    for (const [sector, required] of Object.entries(target.sectors))
      if (
        sum(
          countryFixed
            .filter(
              (demand) =>
                demand.sourceBucket === 'INDUSTRY' &&
                demand.classificationId === sector,
            )
            .map((demand) => demand.requiredCount),
        ) !== required
      )
        invalid(`source industry target changed:${target.countryId}/${sector}`);
    const publicFromServices = sum(
      countryFixed
        .filter((demand) => demand.sourceBucket === 'OTHER_DOMESTIC_SERVICES')
        .map((demand) => demand.requiredCount),
    );
    const ordinary =
      BigInt(target.otherDomesticServices) - BigInt(publicFromServices);
    if (ordinary < 0n)
      constraint(
        'PUBLIC_SERVICE_EXCEEDS_DOMESTIC_TARGET',
        target.countryId,
        null,
        null,
        BigInt(publicFromServices),
        BigInt(target.otherDomesticServices),
      );
    const regionalOrdinary = allocate(
      ordinary.toString(),
      local.map((region) => ({
        id: region.locationId,
        weight: region.population,
        capacity: sum(Object.values(region.available).map(String)),
      })),
      target.countryId,
      null,
    );
    for (const region of local) {
      const ordinaryCount = regionalOrdinary.get(region.locationId)!;
      const availableTotal = BigInt(
        sum(Object.values(region.available).map(String)),
      );
      const unemployed = availableTotal - BigInt(ordinaryCount);
      const unemployedBySkill = allocate(
        unemployed.toString(),
        skills.map((skill) => ({
          id: skill,
          weight: (
            region.available[skill] *
            BigInt(POSTWAR_LABOUR_POLICY.unemploymentSkillWeights[skill])
          ).toString(),
          capacity: region.available[skill].toString(),
        })),
        target.countryId,
        region.locationId,
      );
      const working = Object.fromEntries(
        skills.map((skill) => [
          skill,
          region.available[skill] - BigInt(unemployedBySkill.get(skill)!),
        ]),
      ) as Record<(typeof skills)[number], bigint>;
      // Country/region differences affect concrete recovery-function weights;
      // no class is created from a later unmatched-person count.
      const sectorCounts = allocate(
        ordinaryCount,
        POSTWAR_LABOUR_POLICY.ordinaryServices.map((service) => ({
          id: service.sector,
          weight: (
            BigInt(service.weight) *
            (service.sector === 'PROFESSIONAL_AND_BUSINESS_SERVICES'
              ? 10000n + region.urbanBps
              : service.sector === 'HOUSEHOLD_REPAIR'
                ? 20000n - region.urbanBps
                : 10000n)
          ).toString(),
          capacity: ordinaryCount,
        })),
        target.countryId,
        region.locationId,
      );
      for (const service of POSTWAR_LABOUR_POLICY.ordinaryServices) {
        const skillCounts = allocate(
          sectorCounts.get(service.sector)!,
          skills.map((skill) => ({
            id: skill,
            weight: working[skill].toString(),
            capacity: working[skill].toString(),
          })),
          target.countryId,
          region.locationId,
        );
        for (const skill of skills) {
          const count = skillCounts.get(skill)!;
          working[skill] -= BigInt(count);
          if (count === '0') continue;
          const demand: PostwarLabourDemand = {
            positionId: `POSTWAR_SERVICE_${region.locationId}_${service.sector}_${skill}`,
            countryId: target.countryId,
            locationId: region.locationId,
            skill,
            owner: 'PRIVATE_SECTOR',
            classificationId: service.sector,
            requiredCount: count,
            sourceWeight: count,
            employerId: employer(target.countryId, 'OP'),
            employerRole: 'OP',
            occupation: 'GENERAL',
            sourceBucket: 'OTHER_DOMESTIC_SERVICES',
            sourceObjectId: `POSTWAR_LOCAL_SERVICE_${region.sourceRegionId}_${service.sector}`,
            policyVersion: POSTWAR_LABOUR_POLICY.version,
            provenance: 'GENERATED_POLICY',
          };
          admit(demand);
          all.push(demand);
        }
      }
      if (Object.values(working).some((value) => value !== 0n))
        invalid('ordinary service skills did not partition exactly');
      for (const skill of skills)
        nonEmployedAggregates.push({
          countryId: target.countryId,
          locationId: region.locationId,
          skill,
          count: unemployedBySkill.get(skill)!,
          status: 'UNEMPLOYED_SEARCHING',
        });
      const employed = sum(
        all
          .filter((demand) => demand.locationId === region.locationId)
          .map((demand) => demand.requiredCount),
      );
      if (BigInt(employed) + unemployed !== BigInt(region.labourForce))
        invalid('region labour-force conservation');
      regionResults.push({
        countryId: region.countryId,
        locationId: region.locationId,
        sourceRegionId: region.sourceRegionId,
        population: region.population,
        workingAge: region.workingAge,
        labourForce: region.labourForce,
        employed,
        unemployed: unemployed.toString(),
        workingAgeOutsideLabourForce: (
          BigInt(region.workingAge) - BigInt(region.labourForce)
        ).toString(),
        outsideWorkingAge: (
          BigInt(region.population) - BigInt(region.workingAge)
        ).toString(),
      });
    }
    const countryRegions = regionResults.filter(
      (region) => region.countryId === target.countryId,
    );
    if (
      sum(countryRegions.map((region) => region.employed)) !==
        target.employed ||
      sum(countryRegions.map((region) => region.unemployed)) !==
        target.unemployed ||
      sum(countryRegions.map((region) => region.labourForce)) !==
        target.labourForce
    )
      invalid(`country employment/unemployment changed:${target.countryId}`);
    countryResults.push({
      countryId: target.countryId,
      population: sum(countryRegions.map((region) => region.population)),
      labourForce: target.labourForce,
      employed: target.employed,
      unemployed: target.unemployed,
      sourceOtherDomesticServices: target.otherDomesticServices,
      publicServiceFromDomesticServices: publicFromServices,
      ordinaryServiceEmployment: ordinary.toString(),
    });
  }
  const positions: PostwarFilledPosition[] = [];
  const targets: OpeningLabourTarget[] = [];
  for (const region of regions)
    for (const skill of skills) {
      const group = all
        .filter(
          (demand) =>
            demand.locationId === region.locationId && demand.skill === skill,
        )
        .sort((a, b) => compare(a.positionId, b.positionId));
      let cursor = 0n;
      for (const demand of group) {
        positions.push({
          ...demand,
          filledCount: demand.requiredCount,
          personRange: {
            poolId: `POSTWAR_LF_${region.locationId}_${skill}`,
            startOrdinal: cursor.toString(),
            count: demand.requiredCount,
          },
        });
        cursor += BigInt(demand.requiredCount);
      }
      targets.push({
        countryId: region.countryId,
        locationId: region.locationId,
        skill,
        count: cursor.toString(),
      });
      const unemployed = nonEmployedAggregates.find(
        (entry) =>
          entry.locationId === region.locationId && entry.skill === skill,
      )!;
      const available = adoption.skillAvailability.find(
        (entry) =>
          entry.locationId === region.locationId && entry.skill === skill,
      );
      if (
        !available ||
        cursor + BigInt(unemployed.count) !== BigInt(available.count)
      )
        invalid('source skill pool was double-occupied or changed');
    }
  if (
    sum(countryResults.map((country) => country.population)) !==
    adoption.totalPopulation
  )
    invalid('world population changed');
  const result = freeze({
    schemaVersion: 'postwar-labour-genesis-v1',
    status: 'ALLOCATED_PENDING_WAGES_AND_FINANCE_VALIDATION',
    policy: POSTWAR_LABOUR_POLICY,
    sourcePackageId: adoption.sourcePackageId,
    sourceChecksumsSha256: adoption.sourceChecksumsSha256,
    sourceReferences: [
      {
        path: 'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
        sha256: sha(input.mappingBytes),
      },
      {
        path: 'artifacts/world-balanced-candidate-v1/data/regions.json',
        sha256: sha(input.regionsBytes),
      },
      {
        path: 'artifacts/world-balanced-candidate-v1/data/facilities.json',
        sha256: sha(input.facilitiesBytes),
      },
    ],
    positions: positions.sort((a, b) => compare(a.positionId, b.positionId)),
    targets,
    nonEmployedAggregates,
    regions: regionResults,
    countries: countryResults,
    skillAvailability: adoption.skillAvailability,
    populationAvailability: adoption.populationAvailability,
    employers: adoption.employers,
    preservedSourceSkillProposals: adoption.capacities
      .filter(
        (cap) =>
          cap.sourceProjectId === 'PROJECT-31' ||
          cap.sourceProjectId === 'PROJECT-35',
      )
      .map((cap) => ({
        sourceFacilityId: cap.sourceFacilityId,
        genericSourceSkillDemand: cap.genericSourceSkillDemand,
      })),
    generatedHiringEvents: false,
    wagesPaid: false,
  }) as unknown as PostwarLabourGenesisPreparation;
  issued.add(result);
  return result;
}
/** Provenance/lifetime check only; not financial backing, runtime admission or a seat grant. */
export function consumePostwarLabourGenesis(
  preparation: PostwarLabourGenesisPreparation,
): PostwarLabourGenesisPreparation {
  if (!issued.has(preparation)) invalid('genuine labour preparation required');
  return preparation;
}
export function materializePostwarLabourGenesis(
  preparation: PostwarLabourGenesisPreparation,
  input: Readonly<{
    wagesByPositionId: Readonly<
      Record<
        string,
        Pick<
          OpeningLabourPositionDemand,
          | 'wageAmount'
          | 'wageCurrency'
          | 'wagePeriod'
          | 'wageVersion'
          | 'payrollFundingRef'
        >
      >
    >;
  }>,
) {
  const prepared = consumePostwarLabourGenesis(preparation);
  const byId = new Map(
    prepared.positions.map((position) => [position.positionId, position]),
  );
  const keys = Object.keys(input.wagesByPositionId);
  if (
    keys.length !== prepared.positions.length ||
    keys.some((key) => !byId.has(key))
  )
    invalid('complete exact wage/funding bindings required');
  const positions = prepared.positions.map(
    (position): OpeningLabourPositionDemand => {
      const quote = input.wagesByPositionId[position.positionId];
      if (!quote) invalid(`missing wage/funding:${position.positionId}`);
      return {
        positionId: position.positionId,
        countryId: position.countryId,
        locationId: position.locationId,
        skill: position.skill,
        owner: position.owner,
        classificationId: position.classificationId,
        requiredCount: position.requiredCount,
        sourceWeight: position.sourceWeight,
        employerId: position.employerId,
        employerRole: position.employerRole,
        occupation: position.occupation,
        wageAmount: quote.wageAmount,
        wageCurrency: quote.wageCurrency,
        wagePeriod: quote.wagePeriod,
        wageVersion: quote.wageVersion,
        payrollFundingRef: quote.payrollFundingRef,
      };
    },
  );
  const materialized = materializeOpeningLabourState({
    targets: prepared.targets,
    positions,
    nonEmployedAggregates: prepared.nonEmployedAggregates,
    skillAvailability: prepared.skillAvailability,
    populationAvailability: prepared.populationAvailability,
    employers: prepared.employers,
  });
  for (const actual of materialized.state.positions)
    if (actual.employedCount !== byId.get(actual.positionId)?.filledCount)
      invalid('Core allocation differs from prepared allocation');
  return materialized;
}
