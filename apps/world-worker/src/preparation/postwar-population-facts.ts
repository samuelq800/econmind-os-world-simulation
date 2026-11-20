/** One regional population coordinate system. These derived ranges neither mint
 * people nor admit a seed; the genesis adopter still checks the source totals. */
import { createHash } from 'node:crypto';
import { canonicalSerialize } from '@econmind/core';
import {
  consumePostwarLabourGenesis,
  type PostwarLabourGenesisPreparation,
} from './postwar-labour-genesis.js';
import {
  consumePostwarSocialServiceGenesis,
  consumePostwarFinalizedSocialServiceGenesis,
  type PostwarSocialServiceGenesis,
  type PostwarFinalizedSocialServiceGenesis,
} from './postwar-social-service-genesis.js';
import type { PostwarGenesisPeopleCohort } from './postwar-operating-genesis-adoption.js';

export interface PostwarPopulationReference {
  readonly cohortId: string;
  /** Absolute half-open ordinal in the region, never a skill-pool offset. */
  readonly startOrdinal: string;
  readonly count: string;
}
export interface PostwarServicePopulationReference {
  readonly originalCohortId: string;
  readonly regionId: string;
  readonly populationUse:
    'ELIGIBLE_SUBSET' | 'INPATIENT_OCCUPANCY' | 'STUDENT_ENROLLMENT';
  readonly count: string;
  readonly populationRefs: readonly PostwarPopulationReference[];
}
declare const populationFactsBrand: unique symbol;
export interface PostwarPopulationFacts {
  readonly [populationFactsBrand]: true;
  readonly schemaVersion: 'postwar-population-facts-v1';
  readonly worldId: string;
  readonly seedId: string;
  readonly sourcePackageId: string;
  readonly sourceChecksumsSha256: string;
  readonly sourceReferences: PostwarLabourGenesisPreparation['sourceReferences'];
  readonly coordinatePolicyVersion: 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1';
  readonly labourPolicyVersion: string;
  readonly socialPreparedFingerprint: string;
  readonly socialPolicyFingerprint: string;
  /** Null means eligibility is prepared, with no claimed actual enrollment. */
  readonly enrollmentFingerprint: string | null;
  readonly regions: readonly Readonly<{
    countryId: string;
    regionId: string;
    sourceRegionId: string;
    population: string;
    workingAge: string;
    labourForce: string;
    employed: string;
    unemployed: string;
    children0Through15: string;
    elderly: string;
  }>[];
  readonly people: readonly PostwarGenesisPeopleCohort[];
  readonly positionPopulationRefs: readonly Readonly<
    PostwarPopulationReference & {
      positionId: string;
      regionId: string;
      sourcePoolId: string;
      sourceStartOrdinal: string;
    }
  >[];
  readonly servicePopulationRefs: readonly PostwarServicePopulationReference[];
  /** Cases are episodes, possibly repeat encounters by the same person. No
   * false one-episode/one-person or additional population is inferred. */
  readonly episodeDemands: readonly Readonly<{
    originalDemandId: string;
    regionId: string;
    unit: 'EPISODE';
    newDemand: string;
    priorBacklog: string;
    queuedEpisodes: string;
  }>[];
  readonly agePartitions: readonly Readonly<{
    regionId: string;
    ageBand: string;
    inpatient: boolean;
    populationRef: PostwarPopulationReference;
  }>[];
  readonly fingerprint: string;
}
const issued = new WeakSet<object>();
const skills = ['LOW', 'MEDIUM', 'HIGH'] as const;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function invalid(reason: string): never {
  throw Error(`POSTWAR_POPULATION_INVALID:${reason}`);
}
function whole(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) invalid('nonnegative integer required');
  return BigInt(value);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const sum = (values: readonly string[]) =>
  values.reduce((total, value) => total + whole(value), 0n);

/** LF LOW/MEDIUM/HIGH prefixes, then working-age non-LF (16/17/other),
 * children 0..15, then elderly. Each skill pool places E before U. Within a
 * non-LF age pool current inpatients precede remaining eligible people. This
 * is a deterministic aggregate coordinate policy, not individual identities. */
export function createPostwarPopulationFacts(input: {
  readonly labourPreparation: PostwarLabourGenesisPreparation;
  readonly socialPrepared: PostwarSocialServiceGenesis;
  readonly socialFinalized?: PostwarFinalizedSocialServiceGenesis;
}): PostwarPopulationFacts {
  const labour = consumePostwarLabourGenesis(input.labourPreparation);
  const social = consumePostwarSocialServiceGenesis(input.socialPrepared);
  const final = input.socialFinalized
    ? consumePostwarFinalizedSocialServiceGenesis(input.socialFinalized, social)
    : null;
  if (
    final &&
    (final.worldId !== social.worldId ||
      final.seedId !== social.seedId ||
      final.policyFingerprint !== social.policyFingerprint ||
      final.preparedFingerprint !== social.fingerprint)
  )
    invalid('finalized enrollment lineage mismatch');
  const finalRegions = new Map(
    final?.regions.map((r) => [r.locationId, r]) ?? [],
  );
  if (
    final &&
    (finalRegions.size !== social.regions.length ||
      finalRegions.size !== final.regions.length)
  )
    invalid('finalized enrollment region coverage');
  if (
    labour.sourcePackageId !== social.sourcePackageId ||
    labour.sourceChecksumsSha256 !== social.sourceChecksumsSha256
  )
    invalid('different source packages');
  const socialRegions = new Map(social.regions.map((r) => [r.locationId, r]));
  if (
    socialRegions.size !== social.regions.length ||
    social.regions.length !== labour.regions.length
  )
    invalid('region coverage mismatch');
  // The social policy must be the one whose actual legal demands were filled.
  for (const demand of social.demands) {
    const position = labour.positions.find(
      (p) => p.positionId === demand.positionId,
    );
    if (
      !position ||
      Object.entries(demand).some(
        ([key, value]) => position[key as keyof typeof position] !== value,
      )
    )
      invalid('social staffing preparation mismatch');
  }
  const people: PostwarGenesisPeopleCohort[] = [];
  const positionPopulationRefs: PostwarPopulationFacts['positionPopulationRefs'][number][] =
    [];
  const servicePopulationRefs: PostwarServicePopulationReference[] = [];
  const agePartitions: PostwarPopulationFacts['agePartitions'][number][] = [];
  const regions: PostwarPopulationFacts['regions'][number][] = [];
  const episodeDemands: PostwarPopulationFacts['episodeDemands'][number][] = [];
  for (const region of [...labour.regions].sort((a, b) =>
    compare(a.locationId, b.locationId),
  )) {
    const service = socialRegions.get(region.locationId);
    if (!service || service.countryId !== region.countryId)
      invalid(`region identity:${region.locationId}`);
    const d = service.demography;
    const finalized = finalRegions.get(region.locationId);
    const enrolledByAge = new Map<string, bigint>();
    if (finalized) {
      if (
        finalized.countryId !== region.countryId ||
        finalized.students.cohorts.length !== service.studentCohorts.length
      )
        invalid('finalized enrollment region identity');
      if (
        finalized.staffing.length !==
        social.demands.filter((p) => p.locationId === region.locationId).length
      )
        invalid('finalized staffing coverage');
      const staffingIds = new Set<string>();
      for (const staff of finalized.staffing) {
        const position = labour.positions.find(
          (p) => p.positionId === staff.positionId,
        );
        if (
          !position ||
          staffingIds.has(staff.positionId) ||
          position.locationId !== region.locationId ||
          staff.occupation !== position.occupation ||
          staff.skill !== position.skill ||
          staff.requiredCount !== position.requiredCount ||
          staff.filledCount !== position.filledCount
        )
          invalid('finalized staffing differs from actual labour allocation');
        staffingIds.add(staff.positionId);
      }
      for (const cohort of finalized.students.cohorts) {
        const original = service.studentCohorts.find(
          (c) => c.cohortId === cohort.cohortId,
        );
        if (
          !original ||
          enrolledByAge.has(cohort.age) ||
          Object.entries(original).some(
            ([key, value]) => cohort[key as keyof typeof cohort] !== value,
          ) ||
          whole(cohort.enrolled) > whole(original.desiredEnrollment) ||
          whole(cohort.enrolled) + whole(cohort.waiting) !==
            whole(original.applicants)
        )
          invalid('finalized student lineage');
        enrolledByAge.set(cohort.age, whole(cohort.enrolled));
      }
      if (
        sum(finalized.students.cohorts.map((c) => c.enrolled)) !==
        whole(finalized.students.actualEnrollment)
      )
        invalid('actual enrollment conservation');
    }
    if (
      d.population !== region.population ||
      d.workingAge !== region.workingAge ||
      d.labourForce !== region.labourForce ||
      d.workingAgeOutsideLabourForce !== region.workingAgeOutsideLabourForce ||
      sum([d.children, d.elderly]) !== whole(region.outsideWorkingAge) ||
      d.childAges.length !== 16 ||
      d.hospitalizedChildrenByAge.length !== 16 ||
      d.youth16And17.length !== 2 ||
      d.hospitalizedYouth16And17.length !== 2 ||
      sum(d.childAges) !== whole(d.children)
    )
      invalid(`demographic mismatch:${region.locationId}`);
    let cursor = 0n;
    const add = (
      suffix: string,
      count: bigint,
      workingAge: boolean,
      labourForce: boolean,
      activity: PostwarGenesisPeopleCohort['activity'],
    ): PostwarPopulationReference | null => {
      if (count < 0n)
        invalid(`negative population:${region.locationId}:${suffix}`);
      if (count === 0n) return null;
      const ref = {
        cohortId: `POSTWAR_PEOPLE_${region.locationId}_${suffix}`,
        startOrdinal: cursor.toString(),
        count: count.toString(),
      };
      people.push({
        ...ref,
        regionId: region.locationId,
        workingAge,
        labourForce,
        activity,
      });
      cursor += count;
      return ref;
    };
    for (const skill of skills) {
      const available = labour.skillAvailability.find(
        (p) => p.locationId === region.locationId && p.skill === skill,
      );
      const target = labour.targets.find(
        (p) => p.locationId === region.locationId && p.skill === skill,
      );
      const unemployed = labour.nonEmployedAggregates.find(
        (p) => p.locationId === region.locationId && p.skill === skill,
      );
      if (
        !available ||
        !target ||
        !unemployed ||
        whole(target.count) + whole(unemployed.count) !== whole(available.count)
      )
        invalid(`skill conservation:${region.locationId}:${skill}`);
      const offset = cursor;
      const employedRef = add(
        `${skill}_EMPLOYED`,
        whole(target.count),
        true,
        true,
        'EMPLOYED',
      );
      const positions = labour.positions
        .filter((p) => p.locationId === region.locationId && p.skill === skill)
        .sort((a, b) => compare(a.positionId, b.positionId));
      let local = 0n;
      for (const position of positions) {
        if (
          !employedRef ||
          position.personRange.poolId !==
            `POSTWAR_LF_${region.locationId}_${skill}` ||
          whole(position.personRange.startOrdinal) !== local ||
          position.personRange.count !== position.filledCount
        )
          invalid(`position range:${position.positionId}`);
        positionPopulationRefs.push({
          positionId: position.positionId,
          regionId: region.locationId,
          cohortId: employedRef.cohortId,
          startOrdinal: (offset + local).toString(),
          count: position.filledCount,
          sourcePoolId: position.personRange.poolId,
          sourceStartOrdinal: position.personRange.startOrdinal,
        });
        local += whole(position.filledCount);
      }
      if (local !== whole(target.count)) invalid('position coverage');
      add(
        `${skill}_UNEMPLOYED`,
        whole(unemployed.count),
        true,
        true,
        'UNEMPLOYED',
      );
    }
    if (cursor !== whole(region.labourForce)) invalid('LF ordinal coverage');
    const patientRefs: PostwarPopulationReference[] = [];
    const eligibleByAge = new Map<string, PostwarPopulationReference[]>();
    const studentRefsByAge = new Map<string, PostwarPopulationReference[]>();
    const agePool = (
      ageBand: string,
      total: bigint,
      patients: bigint,
      workingAge: boolean,
    ) => {
      if (patients > total)
        invalid(`inpatients exceed pool:${region.locationId}:${ageBand}`);
      const inpatient = add(
        `${ageBand}_INPATIENT`,
        patients,
        workingAge,
        false,
        workingAge ? 'OUTSIDE_LABOUR_FORCE' : 'DEPENDENT',
      );
      const students = enrolledByAge.get(ageBand.replace(/^AGE_/u, '')) ?? 0n;
      if (students > total - patients)
        invalid('students exceed nonhospitalized age pool');
      const studentRef = add(
        `${ageBand}_STUDENT`,
        students,
        workingAge,
        false,
        'STUDENT',
      );
      const eligible = add(
        `${ageBand}_ELIGIBLE`,
        total - patients - students,
        workingAge,
        false,
        workingAge ? 'OUTSIDE_LABOUR_FORCE' : 'DEPENDENT',
      );
      if (inpatient) {
        patientRefs.push(inpatient);
        agePartitions.push({
          regionId: region.locationId,
          ageBand,
          inpatient: true,
          populationRef: inpatient,
        });
      }
      if (eligible)
        agePartitions.push({
          regionId: region.locationId,
          ageBand,
          inpatient: false,
          populationRef: eligible,
        });
      if (studentRef)
        agePartitions.push({
          regionId: region.locationId,
          ageBand,
          inpatient: false,
          populationRef: studentRef,
        });
      eligibleByAge.set(
        ageBand,
        [studentRef, eligible].filter(
          (r): r is PostwarPopulationReference => r !== null,
        ),
      );
      studentRefsByAge.set(ageBand, studentRef ? [studentRef] : []);
    };
    d.youth16And17.forEach((count, i) =>
      agePool(
        `AGE_${i + 16}`,
        whole(count),
        whole(d.hospitalizedYouth16And17[i]!),
        true,
      ),
    );
    const otherWorking =
      whole(d.workingAgeOutsideLabourForce) - sum(d.youth16And17);
    const otherPatients =
      whole(d.hospitalizedWorkingAgeOutsideLabourForce) -
      sum(d.hospitalizedYouth16And17);
    if (otherPatients < 0n)
      invalid('youth inpatients exceed working-age inpatients');
    agePool('AGE_18_64_NON_LF', otherWorking, otherPatients, true);
    if (cursor !== whole(region.workingAge))
      invalid('working-age ordinal coverage');
    d.childAges.forEach((count, i) =>
      agePool(
        `AGE_${i}`,
        whole(count),
        whole(d.hospitalizedChildrenByAge[i]!),
        false,
      ),
    );
    agePool(
      'AGE_65_PLUS',
      whole(d.elderly),
      whole(d.hospitalizedElderly),
      false,
    );
    if (cursor !== whole(region.population))
      invalid('regional population ordinal coverage');
    const ages = new Set<string>();
    for (const cohort of service.studentCohorts) {
      if (
        ages.has(cohort.age) ||
        whole(cohort.age) < 6n ||
        whole(cohort.age) > 17n
      )
        invalid('school age coverage');
      ages.add(cohort.age);
      const refs = eligibleByAge.get(`AGE_${cohort.age}`)!;
      if (
        !refs ||
        sum(refs.map((r) => r.count)) !== whole(cohort.applicants) ||
        whole(cohort.desiredEnrollment) > whole(cohort.applicants)
      )
        invalid('school applicant lineage');
      servicePopulationRefs.push({
        originalCohortId: cohort.cohortId,
        regionId: region.locationId,
        populationUse: 'ELIGIBLE_SUBSET',
        count: cohort.applicants,
        populationRefs: refs,
      });
      if (finalized) {
        const refs = studentRefsByAge.get(`AGE_${cohort.age}`)!;
        servicePopulationRefs.push({
          originalCohortId: cohort.cohortId,
          regionId: region.locationId,
          populationUse: 'STUDENT_ENROLLMENT',
          count: (enrolledByAge.get(cohort.age) ?? 0n).toString(),
          populationRefs: refs,
        });
      }
    }
    if (ages.size !== 12) invalid('school age coverage');
    if (
      sum(patientRefs.map((r) => r.count)) !==
      whole(service.healthcare.occupiedBeds)
    )
      invalid('inpatient conservation');
    servicePopulationRefs.push({
      originalCohortId: service.healthcare.occupiedPatientCohortId,
      regionId: region.locationId,
      populationUse: 'INPATIENT_OCCUPANCY',
      count: service.healthcare.occupiedBeds,
      populationRefs: patientRefs,
    });
    episodeDemands.push({
      originalDemandId: service.healthcare.demandId,
      regionId: region.locationId,
      unit: 'EPISODE',
      newDemand: service.healthcare.newDemand,
      priorBacklog: service.healthcare.priorBacklog,
      queuedEpisodes: service.healthcare.queuedEpisodes,
    });
    const regionalPeople = people.filter(
      (p) => p.regionId === region.locationId,
    );
    for (const [activity, expected] of [
      ['EMPLOYED', region.employed],
      ['UNEMPLOYED', region.unemployed],
    ] as const)
      if (
        sum(
          regionalPeople
            .filter((p) => p.activity === activity)
            .map((p) => p.count),
        ) !== whole(expected)
      )
        invalid(`${activity} source total`);
    regions.push({
      countryId: region.countryId,
      regionId: region.locationId,
      sourceRegionId: region.sourceRegionId,
      population: region.population,
      workingAge: region.workingAge,
      labourForce: region.labourForce,
      employed: region.employed,
      unemployed: region.unemployed,
      children0Through15: d.children,
      elderly: d.elderly,
    });
  }
  const ids = people.map((p) => p.cohortId);
  if (
    new Set(ids).size !== ids.length ||
    positionPopulationRefs.length !== labour.positions.length
  )
    invalid('duplicate population or omitted position');
  const data = {
    schemaVersion: 'postwar-population-facts-v1' as const,
    worldId: social.worldId,
    seedId: social.seedId,
    sourcePackageId: labour.sourcePackageId,
    sourceChecksumsSha256: labour.sourceChecksumsSha256,
    sourceReferences: labour.sourceReferences,
    coordinatePolicyVersion: 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1' as const,
    labourPolicyVersion: labour.policy.version,
    socialPreparedFingerprint: social.fingerprint,
    socialPolicyFingerprint: social.policyFingerprint,
    enrollmentFingerprint: final
      ? createHash('sha256')
          .update(
            canonicalSerialize(
              final.regions.map((r) => ({
                regionId: r.locationId,
                cohorts: r.students.cohorts.map((c) => ({
                  cohortId: c.cohortId,
                  enrolled: c.enrolled,
                })),
              })),
            ),
          )
          .digest('hex')
      : null,
    regions,
    people,
    positionPopulationRefs,
    servicePopulationRefs,
    episodeDemands,
    agePartitions,
  };
  const result = freeze({
    ...data,
    fingerprint: createHash('sha256')
      .update(canonicalSerialize(data))
      .digest('hex'),
  }) as unknown as PostwarPopulationFacts;
  issued.add(result);
  return result;
}
export function consumePostwarPopulationFacts(
  value: PostwarPopulationFacts,
): PostwarPopulationFacts {
  if (!value || !issued.has(value))
    invalid('preparation not issued by population normalizer');
  return value;
}
