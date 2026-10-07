import { createHash } from 'node:crypto';

import {
  assertEmploymentAllocation,
  calculateBedOccupancy,
  calculateEducationOutcome,
  calculateHealthcareDelivery,
  createOpeningSocialCapacity,
  materializeOpeningLabourState,
  canonicalDecimal,
  parseWorldDecimal,
  type EducationOutcomeInput,
  type HealthcareDeliveryInput,
  type OpeningLabourTarget,
} from '@econmind/core';

import {
  isVerifiedOfficialOpeningDecisionSource,
  type VerifiedOfficialOpeningSource,
} from './official-opening-decision-reconciliation.js';

export const LABOUR_SOCIAL_OWNER_PINS = Object.freeze({
  originalSha256:
    '57bfdec38a9a400991cb26362a99d33d7a81c8e6258c03460185e51501fb5ac5',
  receiptSha256:
    '2c06c4bd1157a2d245143190c4d17b0499b5d09f42159a414846d0f9bcb8d99e',
  section: 'D04_SECTION_5_5_AND_5_6',
});

type Row = Readonly<Record<string, unknown>>;
const datasets = [
  'employment',
  'population-services',
  'regions',
  'facilities',
] as const;
type Dataset = (typeof datasets)[number];
const projects = {
  'PROJECT-31': {
    kind: 'EDUCATION',
    sourceUnit: 'student-seat',
    unit: 'person',
    capacityField: 'schoolSeats',
    staffField: 'teachers',
  },
  'PROJECT-35': {
    kind: 'HEALTHCARE',
    sourceUnit: 'bed',
    unit: 'bed',
    capacityField: 'hospitalBeds',
    staffField: 'medicalWorkers',
  },
  'PROJECT-36': {
    kind: 'HOUSING',
    sourceUnit: 'dwelling-unit',
    unit: 'housing_unit',
    capacityField: 'housingUnits',
    staffField: null,
  },
} as const;

function invalid(message: string): never {
  throw new Error(`Labour/social opening: ${message}`);
}
function hash(bytes: string) {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}
function record(value: unknown): Row {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid('Expected source record');
  return value as Row;
}
function rows(value: unknown): readonly Row[] {
  if (!Array.isArray(value)) invalid('Expected source rows');
  return value.map(record);
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    invalid('Expected explicit source text');
  return value;
}
function whole(value: unknown): string {
  const raw = text(value);
  const parsed = parseWorldDecimal(raw);
  if (parsed.isNegative() || !parsed.isInteger())
    invalid('Exact whole-person/capacity value required');
  return canonicalDecimal(parsed);
}
function sum(values: readonly string[]): string {
  return values.reduce((a, b) => a + BigInt(b), 0n).toString();
}
function equal(actual: string, expected: string, label: string) {
  if (actual !== expected)
    invalid(`Source alias/conservation differs: ${label}`);
}
function lossless(bytes: string): unknown {
  const parse = JSON.parse as (
    input: string,
    reviver: (
      key: string,
      value: unknown,
      context: { readonly source?: string },
    ) => unknown,
  ) => unknown;
  return parse(bytes, (_key, value, context) => {
    if (typeof value !== 'number') return value;
    if (typeof context?.source !== 'string')
      invalid('Lossless Node JSON context required');
    return context.source;
  });
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export interface LabourSocialOpeningGap {
  readonly countryId: string;
  readonly locationId: string | null;
  readonly sourceObjectId: string;
  readonly field: string;
  readonly code:
    | 'MISSING_OPERATING_INPUT'
    | 'INCOMPATIBLE_SKILL_SEMANTICS'
    | 'UNRESOLVED_HOUSING_TITLE';
  readonly sourcePath: string;
  readonly sourcePointer: string;
  readonly detail: string;
}
export interface LabourSocialEmploymentTarget {
  readonly countryId: string;
  readonly labourForce: string;
  readonly employed: string;
  readonly unemployed: string;
  readonly educationAndHealth: string;
  readonly teachers: string;
  readonly medicalWorkers: string;
  readonly sectors: Readonly<Record<string, string>>;
  readonly power: string;
  readonly logistics: string;
  readonly otherDomesticServices: string;
  readonly sourcePointer: string;
  readonly formalJobs: null;
}
export interface LabourSocialCapacityAlias {
  readonly core: ReturnType<typeof createOpeningSocialCapacity>;
  readonly sourceFacilityId: string;
  readonly sourceServiceId: string;
  readonly sourceProjectId: keyof typeof projects;
  readonly sourceUnit: string;
  readonly rawCapacity: string;
  readonly sourcePointer: string;
  readonly servicePointer: string;
  readonly requiredStaffTarget: string | null;
  /** Source reference only; no time/unit conversion to actual delivered episodes. */
  readonly dailyMedicalVisitsReference: string | null;
  readonly householdsReference: string;
  readonly genericSourceSkillDemand: Readonly<
    Record<'LOW' | 'MEDIUM' | 'HIGH', string>
  >;
  readonly titleHolderId: string | null;
  readonly sourceOwnerProposal: string;
  readonly sourceOperatorProposal: string;
  readonly actualOperatorId: null;
  readonly adoption: 'BUILT_GENESIS_CAPACITY_NOT_OPERATIONAL';
}
export interface OfficialLabourSocialOpeningAdoption {
  readonly status: 'ADOPTED_CAPACITY_AND_TARGETS_NOT_READY';
  readonly authority: typeof LABOUR_SOCIAL_OWNER_PINS;
  readonly sourcePackageId: string;
  readonly sourceChecksumsSha256: string;
  readonly sourceProvenance: readonly {
    readonly dataset: string;
    readonly sha256: string;
    readonly bytes: number;
  }[];
  readonly countryIds: readonly string[];
  readonly employmentTargets: readonly LabourSocialEmploymentTarget[];
  readonly skillAvailability: readonly OpeningLabourTarget[];
  readonly populationAvailability: readonly {
    readonly countryId: string;
    readonly locationId: string;
    readonly workingAgeAvailable: string;
  }[];
  readonly employers: readonly {
    readonly countryId: string;
    readonly role: 'OP' | 'GOV';
    readonly employerId: string;
  }[];
  readonly capacities: readonly LabourSocialCapacityAlias[];
  readonly unbuiltExcluded: readonly {
    readonly sourceFacilityId: string;
    readonly countryId: string;
    readonly sourcePointer: string;
    readonly status: 'NOT_ADOPTED_UNBUILT';
  }[];
  readonly gaps: readonly LabourSocialOpeningGap[];
  readonly totalPopulation: string;
  readonly labourState: null;
  readonly seedAdmissionReady: false;
  readonly generatedHiringOrServiceEvents: false;
}
const prepared = new WeakSet<object>();

/** Source-bound D04 constructor; no files, I/O callbacks, SQL, seat or runtime activation. */
export function createOfficialLabourSocialOpeningAdoption(input: {
  readonly source: VerifiedOfficialOpeningSource;
  readonly mappingBytes: string;
  readonly ownerOriginalBytes: string;
  readonly ownerReceiptBytes: string;
  readonly datasets: Readonly<Record<Dataset, string>>;
}): OfficialLabourSocialOpeningAdoption {
  if (!isVerifiedOfficialOpeningDecisionSource(input.source))
    invalid('A fabricated source inspection cannot establish adoption');
  if (
    hash(input.mappingBytes) !== input.source.pins.mappingSha256 ||
    hash(input.ownerOriginalBytes) !==
      LABOUR_SOCIAL_OWNER_PINS.originalSha256 ||
    hash(input.ownerReceiptBytes) !== LABOUR_SOCIAL_OWNER_PINS.receiptSha256
  )
    invalid('Pinned source/Owner bytes differ');
  // The independently recorded human receipt, not a caller-supplied approval flag.
  const receipt = record(JSON.parse(input.ownerReceiptBytes));
  const decision = rows(receipt.decisions).find((r) => r.id === 'D04');
  if (
    receipt.authority !== 'RESPONSIBLE_HUMAN_OWNER_DIRECT_INSTRUCTION' ||
    decision?.state !== 'DECISION_ADOPTED'
  )
    invalid('D04 adoption receipt absent');
  const sourceRows = new Map<Dataset, readonly Row[]>();
  const provenance = datasets.map((dataset) => {
    const domain = input.source.domains.find((d) => d.dataset === dataset);
    const bytes = input.datasets[dataset];
    if (
      domain === undefined ||
      typeof bytes !== 'string' ||
      hash(bytes) !== domain.sourceSha256
    )
      invalid(`Fixed ${dataset} bytes differ`);
    sourceRows.set(dataset, rows(lossless(bytes)));
    return {
      dataset,
      sha256: domain.sourceSha256,
      bytes: Buffer.byteLength(bytes, 'utf8'),
    };
  });
  const mapping = record(lossless(input.mappingBytes));
  const regionMappings = rows(record(mapping.mappings).regions);
  const countryBySource = new Map<string, string>();
  const employers: OfficialLabourSocialOpeningAdoption['employers'][number][] =
    [];
  for (const entity of input.source.legalEntityProposals) {
    const sourceCountry = text(entity.sourceCountryId),
      country = text(entity.coreCountryId);
    countryBySource.set(sourceCountry, country);
    if (entity.role === 'GOV' || entity.role === 'OP')
      employers.push({
        countryId: country,
        role: entity.role,
        employerId: text(entity.proposedCoreLegalEntityId),
      });
  }
  const countryFor = (id: unknown) =>
    countryBySource.get(text(id)) ?? invalid('Unresolved country mapping');
  const regionBySource = new Map(
    regionMappings.map((r) => [text(r.sourceRegionId), r]),
  );
  const regionFor = (id: unknown, country: string) => {
    const r = regionBySource.get(text(id));
    if (r === undefined || r.coreCountryId !== country)
      invalid('Unresolved/cross-country region mapping');
    return text(r.normalizedRegionId);
  };
  const regions = sourceRows.get('regions')!,
    services = sourceRows.get('population-services')!,
    facilities = sourceRows.get('facilities')!,
    employment = sourceRows.get('employment')!;
  if (
    regions.length !== 122 ||
    services.length !== 122 ||
    employment.length !== 70
  )
    invalid('Fixed source grain changed');
  const skillAvailability: OpeningLabourTarget[] = [],
    populationAvailability: OfficialLabourSocialOpeningAdoption['populationAvailability'][number][] =
      [];
  const regionPopulation = new Map<string, string>(),
    labourByCountry = new Map<string, string[]>();
  const regionInitial = new Map<string, Row>();
  for (const r of regions) {
    const countryId = countryFor(r.countryId),
      locationId = regionFor(r.id, countryId),
      initial = record(r.initial),
      skills = record(initial.skills);
    const counts = (['low', 'medium', 'high'] as const).map((skill) =>
      whole(skills[skill]),
    );
    equal(sum(counts), whole(initial.labourForce), `${r.id}/skills`);
    if (
      BigInt(whole(initial.labourForce)) > BigInt(whole(initial.workingAge)) ||
      BigInt(whole(initial.workingAge)) > BigInt(whole(initial.population))
    )
      invalid('Population/labour bounds fail');
    populationAvailability.push({
      countryId,
      locationId,
      workingAgeAvailable: whole(initial.workingAge),
    });
    for (const [index, skill] of (['LOW', 'MEDIUM', 'HIGH'] as const).entries())
      skillAvailability.push({
        countryId,
        locationId,
        skill,
        count: counts[index]!,
      });
    regionPopulation.set(text(r.id), whole(initial.population));
    regionInitial.set(text(r.id), initial);
    labourByCountry.set(countryId, [
      ...(labourByCountry.get(countryId) ?? []),
      whole(initial.labourForce),
    ]);
  }
  const gaps: LabourSocialOpeningGap[] = [],
    capacities: LabourSocialCapacityAlias[] = [];
  const countryStaff = new Map<
    string,
    { teachers: string[]; medical: string[] }
  >();
  const sourceRegionsSeen = new Set<string>();
  const existingSocial = facilities
    .map((r, index) => ({ r, index }))
    .filter(
      ({ r }) =>
        r.constructionStatusProposal === 'OPENING_EXISTING_ASSET' &&
        typeof r.projectId === 'string' &&
        Object.hasOwn(projects, r.projectId),
    );
  const seenAssets = new Set<string>();
  for (const [serviceIndex, s] of services.entries()) {
    const countryId = countryFor(s.countryId),
      locationId = regionFor(s.regionId, countryId),
      region = text(s.regionId);
    if (sourceRegionsSeen.has(region))
      invalid('Duplicate social service region');
    sourceRegionsSeen.add(region);
    equal(
      whole(s.population),
      regionPopulation.get(region) ??
        invalid('Service has no population region'),
      `${region}/population`,
    );
    const initial = regionInitial.get(region)!;
    for (const field of [
      'teachers',
      'medicalWorkers',
      'schoolSeats',
      'hospitalBeds',
      'housingUnits',
      'households',
    ])
      equal(
        whole(s[field]),
        whole(initial[field]),
        `${region}/${field} service alias`,
      );
    const staff = countryStaff.get(countryId) ?? { teachers: [], medical: [] };
    staff.teachers.push(whole(s.teachers));
    staff.medical.push(whole(s.medicalWorkers));
    countryStaff.set(countryId, staff);
    for (const projectId of Object.keys(
      projects,
    ) as (keyof typeof projects)[]) {
      const config = projects[projectId];
      const aliases = existingSocial.filter(
        ({ r }) => r.regionId === region && r.projectId === projectId,
      );
      if (aliases.length !== 1)
        invalid(
          'Social service must bind exactly one same-asset facility alias',
        );
      const { r, index } = aliases[0]!;
      if (
        countryFor(r.countryId) !== countryId ||
        r.capacityUnit !== config.sourceUnit ||
        r.scenarioRole !== 'OPENING_PORTFOLIO' ||
        r.aggregateFacility !== true
      )
        invalid('Capacity alias unit/scope/status differs');
      equal(
        whole(r.capacity),
        whole(s[config.capacityField]),
        `${r.id}/capacity alias`,
      );
      const requiredStaff =
        config.staffField === null ? null : whole(s[config.staffField]);
      if (requiredStaff !== null)
        equal(whole(r.requiredWorkers), requiredStaff, `${r.id}/staff alias`);
      const rawSkill = record(r.labourBySkill);
      const genericSourceSkillDemand = {
        LOW: whole(rawSkill.low),
        MEDIUM: whole(rawSkill.medium),
        HIGH: whole(rawSkill.high),
      };
      equal(
        sum(Object.values(genericSourceSkillDemand)),
        whole(r.requiredWorkers),
        `${r.id}/source skill demand`,
      );
      const assetId = `SOCIAL_OPENING_${locationId}_${projectId.replace('-', '_')}`;
      if (seenAssets.has(assetId)) invalid('Repeated opening capacity asset');
      seenAssets.add(assetId);
      const gov = input.source.legalEntityProposals.find(
        (e) => e.coreCountryId === countryId && e.role === 'GOV',
      );
      if (gov === undefined || r.ownerId !== gov.sourceEntityId)
        invalid('Unresolved source public owner');
      const core = createOpeningSocialCapacity({
        assetId,
        countryId,
        locationId,
        kind: config.kind,
        capacity: { amount: whole(r.capacity), unit: config.unit },
      });
      capacities.push({
        core,
        sourceFacilityId: text(r.id),
        sourceServiceId: text(s.id),
        sourceProjectId: projectId,
        sourceUnit: config.sourceUnit,
        rawCapacity: text(r.capacity),
        sourcePointer: `/${index}`,
        servicePointer: `/${serviceIndex}`,
        requiredStaffTarget: requiredStaff,
        dailyMedicalVisitsReference:
          config.kind === 'HEALTHCARE' ? whole(s.dailyMedicalVisits) : null,
        householdsReference: whole(s.households),
        genericSourceSkillDemand,
        // Ordinary housing is not made government-owned just because a proposal says GOV.
        titleHolderId:
          config.kind === 'HOUSING'
            ? null
            : text(gov.proposedCoreLegalEntityId),
        sourceOwnerProposal: text(r.ownerId),
        sourceOperatorProposal: text(r.operatorId),
        actualOperatorId: null,
        adoption: 'BUILT_GENESIS_CAPACITY_NOT_OPERATIONAL',
      });
      const add = (
        field: string,
        code: LabourSocialOpeningGap['code'],
        detail: string,
      ) =>
        gaps.push({
          countryId,
          locationId,
          sourceObjectId: text(r.id),
          field,
          code,
          sourcePath: 'data/facilities.json',
          sourcePointer: `/${index}`,
          detail,
        });
      if (config.kind === 'EDUCATION')
        add(
          'staffingByOccupationAndSkill',
          'INCOMPATIBLE_SKILL_SEMANTICS',
          'Source teachers/requiredWorkers alias uses generic LOW/MEDIUM/HIGH demand; SOCIAL-U0196 defines teachers HIGH. Preserve targets; do not treat support posts as teachers or recast the source mix.',
        );
      if (config.kind === 'HEALTHCARE')
        add(
          'staffingByOccupationAndSkill',
          'MISSING_OPERATING_INPUT',
          'Generic skill totals do not identify doctors, nurses, technicians or support staff required by SOCIAL-U0398..U0403.',
        );
      if (config.kind === 'HOUSING')
        add(
          'titleAndTenure',
          'UNRESOLVED_HOUSING_TITLE',
          'Source total ordinary housing and GOV proposal do not establish public title, private subdivision or tenure. Capacity is preserved without assigning GOV ownership.',
        );
    }
  }
  if (
    capacities.length !== existingSocial.length ||
    sourceRegionsSeen.size !== regions.length
  )
    invalid('Orphan/duplicate social capacity or region');
  const employmentTargets: LabourSocialEmploymentTarget[] = [],
    employmentCountries = new Set<string>();
  for (const [index, e] of employment.entries()) {
    const countryId = countryFor(e.countryId),
      staff = countryStaff.get(countryId);
    if (staff === undefined || employmentCountries.has(countryId))
      invalid('Incomplete/duplicate country employment coverage');
    employmentCountries.add(countryId);
    const sectors = Object.fromEntries(
      Object.entries(record(e.sectors)).map(([key, value]) => [
        key,
        whole(value),
      ]),
    );
    const target = {
      countryId,
      labourForce: whole(e.labourForce),
      employed: whole(e.employed),
      unemployed: whole(e.unemployed),
      educationAndHealth: whole(e.educationAndHealth),
      teachers: sum(staff.teachers),
      medicalWorkers: sum(staff.medical),
      sectors,
      power: whole(e.power),
      logistics: whole(e.logistics),
      otherDomesticServices: whole(e.otherDomesticServices),
      sourcePointer: `/${index}`,
      formalJobs: null,
    };
    equal(
      sum([target.employed, target.unemployed]),
      target.labourForce,
      `${countryId}/labourForce`,
    );
    equal(
      sum(labourByCountry.get(countryId) ?? []),
      target.labourForce,
      `${countryId}/regional labourForce`,
    );
    equal(
      sum([target.teachers, target.medicalWorkers]),
      target.educationAndHealth,
      `${countryId}/educationAndHealth`,
    );
    const q = (amount: string) => ({ amount, unit: 'person' });
    assertEmploymentAllocation({
      aggregateEmployed: q(target.employed),
      sectorEmployment: [
        ...Object.values(sectors),
        target.power,
        target.logistics,
        target.otherDomesticServices,
      ].map(q),
      publicServiceEmployment: [q(target.educationAndHealth)],
    });
    employmentTargets.push(target);
    const missing = {
      employmentByRegionAndSkill:
        'Country aggregate is not an employed/unemployed distribution by region and skill. Do not allocate to otherDomesticServices placeholders.',
      wageAmountCurrencyPeriodVersion:
        'SOCIAL-U0201..U0210 defines wage units but fixed sources do not supply per-position numeric wage, currency, period and version.',
      payrollFundingAndObligation:
        'No funded employer payroll/account obligation mapping accompanies these targets. No free labour or wage payment is inferred.',
      educationInitialQueueAndProgramme:
        'Enrollment, applicants, programme/level, duration and initial completion state are absent; seat count is not enrollment.',
      educationStaffAndFiscalCapacity:
        'Actual teacher employment, StudentsPerTeacherStandard, budget and input-supported seat capacity are missing.',
      healthcareInitialDemandAndBacklog:
        'Required/delivered episodes, initial medical backlog, occupied beds and binding care-period semantics are missing. dailyMedicalVisits is retained as a reference, not delivered care.',
      healthcareInputsAndFiscalCapacity:
        'Actual clinical personnel, medical supplies and funded constrained care capacity are not supplied.',
      housingOccupancyHabitabilityAndRent:
        'Initial occupancy/tenure, habitable subset, rent and subsidy rules are absent; housing stock is not occupied households.',
      welfareEligibilityRulesAndPayments:
        'Eligibility/programme and payment state are absent; beneficiaries and payments are not invented.',
      publicSafetyPositionsAndInitialQueue:
        'Explicit safety/administration positions, staff, initial incidents and case queue are absent; generic domestic-service counts are not police posts.',
    };
    for (const [field, detail] of Object.entries(missing))
      gaps.push({
        countryId,
        locationId: null,
        sourceObjectId: text(e.countryId),
        field,
        code: 'MISSING_OPERATING_INPUT',
        sourcePath: 'data/employment.json',
        sourcePointer: `/${index}`,
        detail,
      });
  }
  const unbuiltExcluded = facilities.flatMap((r, index) =>
    r.constructionStatusProposal === 'UNBUILT_OPTION' &&
    typeof r.projectId === 'string' &&
    Object.hasOwn(projects, r.projectId)
      ? [
          {
            sourceFacilityId: text(r.id),
            countryId: countryFor(r.countryId),
            sourcePointer: `/${index}`,
            status: 'NOT_ADOPTED_UNBUILT' as const,
          },
        ]
      : [],
  );
  const totalPopulation = sum([...regionPopulation.values()]);
  equal(totalPopulation, '14712146434', 'fixed population total');
  const result = freeze({
    status: 'ADOPTED_CAPACITY_AND_TARGETS_NOT_READY' as const,
    authority: LABOUR_SOCIAL_OWNER_PINS,
    sourcePackageId: input.source.pins.packageId,
    sourceChecksumsSha256: input.source.pins.checksumsSha256,
    sourceProvenance: provenance,
    countryIds: [...input.source.countryIds],
    employmentTargets,
    skillAvailability,
    populationAvailability,
    employers,
    capacities,
    unbuiltExcluded,
    gaps,
    totalPopulation,
    labourState: null,
    seedAdmissionReady: false as const,
    generatedHiringOrServiceEvents: false as const,
  });
  prepared.add(result);
  return result;
}

/** Public Worker consumer of the branded constructor, never an independent truth. */
export function consumeLabourSocialOpeningAdoption(
  value: OfficialLabourSocialOpeningAdoption,
) {
  if (!prepared.has(value)) invalid('Untrusted adoption object');
  return freeze({
    status: value.status,
    countryIds: value.countryIds,
    openingCapacities: value.capacities.map((c) => c.core),
    preservedEmploymentTargets: value.employmentTargets,
    gaps: value.gaps,
    authoritativeLabourState: null,
    operationalServiceState: null,
    seedAdmissionReady: false as const,
    generatedHiringOrServiceEvents: false as const,
  });
}

/** Explicit synthetic local/CI exercise of real E03/E04/E05 calculations.
 * It cannot promote official targets, issue commands/seats, admit a seed or persist a World.
 */
export function exerciseTestOnlyLabourSocialOpening(input: {
  readonly adoption: OfficialLabourSocialOpeningAdoption;
  readonly environment: 'local' | 'ci';
  readonly countryId: string;
  readonly locationId: string;
  readonly labour: Parameters<typeof materializeOpeningLabourState>[0];
  readonly education: EducationOutcomeInput;
  readonly healthcare: HealthcareDeliveryInput;
  readonly occupiedBeds: string;
}) {
  consumeLabourSocialOpeningAdoption(input.adoption);
  if (!['local', 'ci'].includes(input.environment))
    invalid('TEST_ONLY requires local/CI');
  const aliases = input.adoption.capacities.filter(
    (c) =>
      c.core.countryId === input.countryId &&
      c.core.locationId === input.locationId,
  );
  if (aliases.length !== 3)
    invalid('TEST_ONLY requires one source-bound country/region');
  for (const rows of [
    input.labour.targets,
    input.labour.positions,
    input.labour.nonEmployedAggregates,
    input.labour.skillAvailability,
    input.labour.populationAvailability,
  ])
    if (
      rows.some(
        (r) =>
          r.countryId !== input.countryId || r.locationId !== input.locationId,
      )
    )
      invalid('TEST_ONLY cross-region/country facts');
  for (const row of input.labour.populationAvailability) {
    const available = input.adoption.populationAvailability.find(
      (a) => a.countryId === row.countryId && a.locationId === row.locationId,
    );
    if (
      available === undefined ||
      BigInt(whole(row.workingAgeAvailable)) >
        BigInt(available.workingAgeAvailable)
    )
      invalid('TEST_ONLY population exceeds source availability');
  }
  for (const row of input.labour.skillAvailability) {
    const available = input.adoption.skillAvailability.find(
      (a) =>
        a.countryId === row.countryId &&
        a.locationId === row.locationId &&
        a.skill === row.skill,
    );
    if (
      available === undefined ||
      BigInt(whole(row.count)) > BigInt(available.count)
    )
      invalid('TEST_ONLY skill pool exceeds source availability');
  }
  if (
    input.labour.employers.some(
      (e) =>
        !input.adoption.employers.some(
          (a) =>
            a.countryId === e.countryId &&
            a.role === e.role &&
            a.employerId === e.employerId,
        ),
    )
  )
    invalid('TEST_ONLY employer identity differs');
  const labour = materializeOpeningLabourState(input.labour);
  const school = aliases.find((c) => c.core.kind === 'EDUCATION')!,
    hospital = aliases.find((c) => c.core.kind === 'HEALTHCARE')!;
  if (
    input.education.seats.unit !== 'person' ||
    BigInt(whole(input.education.seats.amount)) >
      BigInt(school.core.capacity.amount)
  )
    invalid('TEST_ONLY school capacity exceeded');
  const teacherCount = sum(
    labour.state.positions
      .filter(
        (p) =>
          p.classificationId === 'EDUCATION' &&
          input.labour.positions.find((d) => d.positionId === p.positionId)
            ?.occupation === 'TEACHER',
      )
      .map((p) => p.employedCount),
  );
  const medicalCount = sum(
    labour.state.positions
      .filter(
        (p) =>
          p.classificationId === 'HEALTHCARE' &&
          ['DOCTOR', 'NURSE', 'MEDICAL_TECHNICIAN'].includes(
            input.labour.positions.find((d) => d.positionId === p.positionId)!
              .occupation,
          ),
      )
      .map((p) => p.employedCount),
  );
  if (
    teacherCount === '0' &&
    whole(input.education.teacherSupportedSeats.amount) !== '0'
  )
    invalid('TEST_ONLY education has no employed teachers');
  if (
    medicalCount === '0' &&
    whole(input.healthcare.staffCapacity.amount) !== '0'
  )
    invalid('TEST_ONLY healthcare has no employed clinical staff');
  return freeze({
    scope: 'TEST_ONLY_NOT_OFFICIAL_OPENING_OR_RUNTIME_ACCEPTANCE' as const,
    labour,
    education: calculateEducationOutcome(input.education),
    healthcare: calculateHealthcareDelivery(input.healthcare),
    bedOccupancy: calculateBedOccupancy(
      { amount: whole(input.occupiedBeds), unit: 'bed' },
      hospital.core.capacity,
    ),
    officialStatus: input.adoption.status,
    seedAdmissionReady: false as const,
    persisted: false as const,
  });
}
