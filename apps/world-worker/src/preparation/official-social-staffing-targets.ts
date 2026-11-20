/** Existing selected-source teacher demand joined to the existing Core labour
 * input shape. These are demand targets, never hiring, payroll or employment. */
import {
  idempotencyKey,
  type OpeningLabourPositionDemand,
} from '@econmind/core';
import {
  consumeLabourSocialOpeningAdoption,
  type LabourSocialOpeningGap,
  type OfficialLabourSocialOpeningAdoption,
} from './official-labour-social-opening-adoption.js';

type Skills = Readonly<Record<'LOW' | 'MEDIUM' | 'HIGH', string>>;
type WageField =
  | 'wageAmount'
  | 'wageCurrency'
  | 'wagePeriod'
  | 'wageVersion'
  | 'payrollFundingRef';
export type OfficialTeacherPositionDemand = Omit<
  OpeningLabourPositionDemand,
  WageField
> &
  Readonly<{
    occupation: 'TEACHER';
    skill: 'HIGH';
    owner: 'PUBLIC_SERVICE';
    classificationId: 'EDUCATION';
    employerRole: 'GOV';
  }>;
export interface SocialStaffingSourceReference {
  readonly namespace: 'DATASET' | 'ADOPTION' | 'OWNER_RULE';
  readonly path: string;
  readonly pointer: string | null;
  readonly sha256: string | null;
}
export interface SocialStaffingSubfield {
  readonly field: string;
  readonly classification: 'KNOWN' | 'DERIVED' | 'MISSING' | 'CONFLICT';
  readonly connection:
    'ALREADY_MAPPED' | 'NEWLY_WIRED' | 'UNBOUND' | 'PRESERVED_CONFLICT';
  readonly value: string | Skills | null;
  readonly sourceReferences: readonly SocialStaffingSourceReference[];
  readonly normativeSourceUnits: readonly string[];
}
const MATERIALIZATION_MISSING = Object.freeze([
  'wageAmount',
  'wageCurrency',
  'wagePeriod',
  'wageVersion',
  'payrollFundingRef',
  'employedTargetsByRegionAndSkill',
  'nonEmployedAggregatesByStatusAndSkill',
  'resolvedSchoolStaffingSkillSemantics',
] as const);
export interface OfficialTeacherStaffingTarget {
  readonly countryId: string;
  readonly locationId: string;
  readonly assetId: string;
  readonly sourceObjectId: string;
  readonly sourceServiceId: string;
  readonly sourceProjectId: 'PROJECT-31';
  readonly serviceGrain: 'REGIONAL_EDUCATION_AGGREGATE';
  readonly originalGapField: 'staffingByOccupationAndSkill';
  readonly positionDemand: Readonly<OfficialTeacherPositionDemand>;
  readonly provenance: Readonly<{
    facility: SocialStaffingSourceReference;
    service: SocialStaffingSourceReference;
    genericSkills: SocialStaffingSourceReference;
  }>;
  readonly sourceSkillDemand: Skills;
  readonly teacherOccupationDemand: Skills;
  /** Signed demand comparison only, not a transfer/upskilling of any person. */
  readonly unresolvedDemandDifference: Skills;
  readonly sourceHighSkillPool: Readonly<{
    count: string;
    adoptionPointer: string;
    purpose: 'TOTAL_SOURCE_SKILL_POOL_NOT_IDLE_OR_EMPLOYED_WORKERS';
    teacherDemandExceedsPool: boolean;
  }>;
  readonly preservedSkillConflict: LabourSocialOpeningGap;
  readonly unbound: Readonly<
    Record<
      | WageField
      | 'actualEmployedCount'
      | 'employmentStatusDistribution'
      | 'teacherSupportedSeats',
      null
    >
  >;
  readonly materializationMissing: typeof MATERIALIZATION_MISSING;
  readonly subfields: readonly SocialStaffingSubfield[];
  readonly fullGapClosed: false;
  readonly materializationReady: false;
}
export interface OfficialSocialStaffingTargets {
  readonly schemaVersion: 'official-social-staffing-targets-v1';
  readonly status: 'SOURCE_BOUND_TEACHER_DEMAND_TARGETS_NOT_OPERATIONAL';
  readonly sourcePackageId: string;
  readonly sourceChecksumsSha256: string;
  readonly records: readonly OfficialTeacherStaffingTarget[];
  readonly preservedOpeningGaps: readonly LabourSocialOpeningGap[];
  readonly summary: Readonly<{
    countryCount: number;
    teacherTargetCount: number;
    teacherRequiredCount: string;
    sourceSkillDemand: Skills;
    teacherOccupationDemand: Skills;
    unresolvedDemandDifference: Skills;
    preservedSkillConflictCount: number;
    originalOpeningGapCount: number;
  }>;
  readonly authoritativeLabourState: null;
  readonly operationalServiceState: null;
  readonly seedAdmissionReady: false;
  readonly generatedHiringOrServiceEvents: false;
  readonly wagesPaid: false;
}

function invalid(message: string): never {
  throw new Error(`Official social staffing targets: ${message}`);
}
function count(value: string): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(value))
    invalid('Exact source people count required');
  return BigInt(value);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Consumes only the genuine source/adoption constructor. The source's mixed
 * generic skill demand stays unchanged and its 122 conflicts stay unresolved.
 * Occupation/HIGH comes from SOCIAL-U0196 and the existing Core admissible
 * occupation matrix. Public employer follows adopted D04 §5.5, not operatorId.
 * No wage, staffing allocation, curriculum, college or delivered service is
 * inferred. A later complete source-backed join must satisfy the existing
 * materializeOpeningLabourState contract before any labour state exists. */
export function createOfficialSocialStaffingTargets(
  adoption: OfficialLabourSocialOpeningAdoption,
): OfficialSocialStaffingTargets {
  consumeLabourSocialOpeningAdoption(adoption);
  const reference = (
    dataset: string,
    pointer: string,
  ): SocialStaffingSourceReference => {
    const source = adoption.sourceProvenance.filter(
      (item) => item.dataset === dataset,
    );
    if (source.length !== 1 || !source[0])
      invalid(`Unique ${dataset} provenance required`);
    return {
      namespace: 'DATASET',
      path: `data/${dataset}.json`,
      pointer,
      sha256: source[0].sha256,
    };
  };
  const normative = ['SOCIAL-U0196'];
  const ownerReference: SocialStaffingSourceReference = {
    namespace: 'OWNER_RULE',
    path: 'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
    pointer: null,
    sha256: adoption.authority.originalSha256,
  };
  const ids = new Set<string>();
  const records = adoption.capacities
    .filter((alias) => alias.core.kind === 'EDUCATION')
    .map((alias): OfficialTeacherStaffingTarget => {
      if (
        alias.sourceProjectId !== 'PROJECT-31' ||
        alias.requiredStaffTarget === null
      )
        invalid('Explicit school teacher alias required');
      const required = count(alias.requiredStaffTarget);
      const raw = alias.genericSourceSkillDemand;
      const low = count(raw.LOW),
        medium = count(raw.MEDIUM),
        high = count(raw.HIGH);
      if (low + medium + high !== required)
        invalid('Source school skill/teacher alias total differs');
      const countryId = alias.core.countryId,
        locationId = alias.core.locationId;
      const employers = adoption.employers.filter(
        (employer) =>
          employer.countryId === countryId && employer.role === 'GOV',
      );
      if (employers.length !== 1 || !employers[0])
        invalid('Unique adopted public education employer required');
      const employerReference: SocialStaffingSourceReference = {
        namespace: 'ADOPTION',
        path: 'official-labour-social-opening-adoption',
        pointer: `/employers/${adoption.employers.indexOf(employers[0])}/employerId`,
        sha256: null,
      };
      const poolIndices = adoption.skillAvailability.flatMap((pool, index) =>
        pool.countryId === countryId &&
        pool.locationId === locationId &&
        pool.skill === 'HIGH'
          ? [index]
          : [],
      );
      if (poolIndices.length !== 1)
        invalid('Unique source region HIGH pool required');
      const poolIndex = poolIndices[0]!,
        pool = adoption.skillAvailability[poolIndex]!;
      const conflicts = adoption.gaps.filter(
        (gap) =>
          gap.sourceObjectId === alias.sourceFacilityId &&
          gap.countryId === countryId &&
          gap.locationId === locationId &&
          gap.field === 'staffingByOccupationAndSkill' &&
          gap.code === 'INCOMPATIBLE_SKILL_SEMANTICS',
      );
      if (conflicts.length !== 1 || !conflicts[0])
        invalid('Original source skill conflict must remain explicit');
      const positionId = idempotencyKey(`POSITION_TEACHER_${locationId}`);
      if (ids.has(positionId)) invalid('Duplicate teacher demand identity');
      ids.add(positionId);
      const positionDemand: OfficialTeacherPositionDemand = {
        positionId,
        countryId,
        locationId,
        skill: 'HIGH',
        owner: 'PUBLIC_SERVICE',
        classificationId: 'EDUCATION',
        requiredCount: required.toString(),
        sourceWeight: required.toString(),
        employerId: employers[0].employerId,
        employerRole: 'GOV',
        occupation: 'TEACHER',
      };
      const provenance = {
        facility: reference(
          'facilities',
          `${alias.sourcePointer}/requiredWorkers`,
        ),
        service: reference(
          'population-services',
          `${alias.servicePointer}/teachers`,
        ),
        genericSkills: reference(
          'facilities',
          `${alias.sourcePointer}/labourBySkill`,
        ),
      };
      const sourceSkillDemand: Skills = {
        LOW: raw.LOW,
        MEDIUM: raw.MEDIUM,
        HIGH: raw.HIGH,
      };
      const teacherOccupationDemand: Skills = {
        LOW: '0',
        MEDIUM: '0',
        HIGH: required.toString(),
      };
      const unresolvedDemandDifference: Skills = {
        LOW: (-low).toString(),
        MEDIUM: (-medium).toString(),
        HIGH: (required - high).toString(),
      };
      const subfield = (
        field: string,
        classification: SocialStaffingSubfield['classification'],
        connection: SocialStaffingSubfield['connection'],
        value: SocialStaffingSubfield['value'],
        sourceReferences: readonly SocialStaffingSourceReference[],
        normativeSourceUnits: readonly string[] = [],
      ): SocialStaffingSubfield => ({
        field,
        classification,
        connection,
        value,
        sourceReferences,
        normativeSourceUnits,
      });
      const subfields: SocialStaffingSubfield[] = [
        subfield(
          'requiredCount',
          'KNOWN',
          'ALREADY_MAPPED',
          alias.requiredStaffTarget,
          [provenance.facility, provenance.service],
        ),
        subfield(
          'occupation',
          'DERIVED',
          'NEWLY_WIRED',
          'TEACHER',
          [provenance.service],
          normative,
        ),
        subfield(
          'skill',
          'DERIVED',
          'NEWLY_WIRED',
          'HIGH',
          [provenance.service],
          normative,
        ),
        subfield(
          'employerRole',
          'DERIVED',
          'NEWLY_WIRED',
          'GOV',
          [ownerReference],
          ['D04_SECTION_5_5'],
        ),
        subfield(
          'employerId',
          'KNOWN',
          'NEWLY_WIRED',
          employers[0].employerId,
          [employerReference, ownerReference],
          ['D04_SECTION_5_5'],
        ),
        subfield(
          'sourceSkillDemand',
          'CONFLICT',
          'PRESERVED_CONFLICT',
          sourceSkillDemand,
          [provenance.genericSkills, provenance.service],
          normative,
        ),
        subfield(
          'unresolvedDemandDifference',
          'CONFLICT',
          'PRESERVED_CONFLICT',
          unresolvedDemandDifference,
          [provenance.genericSkills, provenance.service],
          normative,
        ),
        ...MATERIALIZATION_MISSING.filter(
          (field) => field !== 'resolvedSchoolStaffingSkillSemantics',
        ).map((field) => subfield(field, 'MISSING', 'UNBOUND', null, [])),
        subfield('actualEmployedCount', 'MISSING', 'UNBOUND', null, []),
        subfield(
          'employmentStatusDistribution',
          'MISSING',
          'UNBOUND',
          null,
          [],
        ),
        subfield('teacherSupportedSeats', 'MISSING', 'UNBOUND', null, []),
      ];
      return {
        countryId,
        locationId,
        assetId: alias.core.assetId,
        sourceObjectId: alias.sourceFacilityId,
        sourceServiceId: alias.sourceServiceId,
        sourceProjectId: 'PROJECT-31',
        serviceGrain: 'REGIONAL_EDUCATION_AGGREGATE',
        originalGapField: 'staffingByOccupationAndSkill',
        positionDemand,
        provenance,
        sourceSkillDemand,
        teacherOccupationDemand,
        unresolvedDemandDifference,
        sourceHighSkillPool: {
          count: pool.count,
          adoptionPointer: `/skillAvailability/${poolIndex}`,
          purpose: 'TOTAL_SOURCE_SKILL_POOL_NOT_IDLE_OR_EMPLOYED_WORKERS',
          teacherDemandExceedsPool: required > count(pool.count),
        },
        preservedSkillConflict: conflicts[0],
        unbound: {
          wageAmount: null,
          wageCurrency: null,
          wagePeriod: null,
          wageVersion: null,
          payrollFundingRef: null,
          actualEmployedCount: null,
          employmentStatusDistribution: null,
          teacherSupportedSeats: null,
        },
        materializationMissing: MATERIALIZATION_MISSING,
        subfields,
        fullGapClosed: false,
        materializationReady: false,
      };
    });
  const teacherRequiredCount = records.reduce(
    (sum, item) => sum + count(item.positionDemand.requiredCount),
    0n,
  );
  for (const country of adoption.employmentTargets) {
    const total = records
      .filter((item) => item.countryId === country.countryId)
      .reduce(
        (sum, item) => sum + count(item.positionDemand.requiredCount),
        0n,
      );
    if (total !== count(country.teachers))
      invalid('Regional teacher targets do not conserve country source total');
  }
  const skills = (
    field:
      | 'sourceSkillDemand'
      | 'teacherOccupationDemand'
      | 'unresolvedDemandDifference',
  ): Skills => ({
    LOW: records
      .reduce((sum, item) => sum + BigInt(item[field].LOW), 0n)
      .toString(),
    MEDIUM: records
      .reduce((sum, item) => sum + BigInt(item[field].MEDIUM), 0n)
      .toString(),
    HIGH: records
      .reduce((sum, item) => sum + BigInt(item[field].HIGH), 0n)
      .toString(),
  });
  return freeze({
    schemaVersion: 'official-social-staffing-targets-v1',
    status: 'SOURCE_BOUND_TEACHER_DEMAND_TARGETS_NOT_OPERATIONAL',
    sourcePackageId: adoption.sourcePackageId,
    sourceChecksumsSha256: adoption.sourceChecksumsSha256,
    records,
    preservedOpeningGaps: adoption.gaps,
    summary: {
      countryCount: new Set(records.map((item) => item.countryId)).size,
      teacherTargetCount: records.length,
      teacherRequiredCount: teacherRequiredCount.toString(),
      sourceSkillDemand: skills('sourceSkillDemand'),
      teacherOccupationDemand: skills('teacherOccupationDemand'),
      unresolvedDemandDifference: skills('unresolvedDemandDifference'),
      preservedSkillConflictCount: records.length,
      originalOpeningGapCount: adoption.gaps.length,
    },
    authoritativeLabourState: null,
    operationalServiceState: null,
    seedAdmissionReady: false,
    generatedHiringOrServiceEvents: false,
    wagesPaid: false,
  });
}
