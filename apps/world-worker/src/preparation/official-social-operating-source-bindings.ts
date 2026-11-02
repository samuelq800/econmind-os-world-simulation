/** Source-backed read bindings only. No World State, admission, hiring or service settlement. */
import {
  consumeLabourSocialOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
  type LabourSocialCapacityAlias,
  type LabourSocialEmploymentTarget,
  type LabourSocialOpeningGap,
} from './official-labour-social-opening-adoption.js';
import { OFFICIAL_OPENING_RECONCILIATION_PINS } from './official-opening-decision-reconciliation.js';

export type SocialOperatingFieldStatus =
  'KNOWN' | 'DERIVED' | 'MISSING' | 'CONFLICT';
export interface SocialOperatingSourceReference {
  readonly kind: 'DATASET' | 'MAPPING' | 'OWNER_RULE';
  readonly path: string;
  readonly pointer: string;
  readonly sha256: string;
  readonly relation:
    'EXACT_SOURCE_VALUE' | 'DERIVATION_INPUT' | 'CHECKED_PARENT_RECORD';
}
export type SocialOperatingValue = string | Readonly<Record<string, string>>;
export interface SocialOperatingSourceField {
  readonly field: string;
  readonly status: SocialOperatingFieldStatus;
  readonly value: SocialOperatingValue | null;
  readonly alreadyMapped: boolean;
  readonly adoptionPointer: string | null;
  readonly sourceReferences: readonly SocialOperatingSourceReference[];
  readonly detail: string;
}
export interface SocialOperatingAssetBinding {
  readonly countryId: string;
  /** Employer target under D04, NOT an actual operator or funded payroll. */
  readonly economicEntityId: string;
  readonly locationId: string;
  readonly assetId: string;
  readonly sourceFacilityId: string;
  readonly serviceKind: 'BASIC_EDUCATION' | 'HOSPITAL';
  readonly fields: readonly SocialOperatingSourceField[];
}
export interface SocialOperatingEmploymentBinding {
  readonly countryId: string;
  /** Country totals span employers and MUST NOT be copied to each employer. */
  readonly economicEntityId: null;
  readonly employerBindings: readonly Readonly<{
    role: 'GOV' | 'OP';
    employerId: string;
  }>[];
  readonly fields: readonly SocialOperatingSourceField[];
}
export interface SocialOperatingGapBinding {
  readonly gapKey: string;
  readonly countryId: string;
  readonly locationId: string | null;
  readonly sourceObjectId: string;
  readonly field: string;
  readonly economicEntityId: string | null;
  readonly originalGap: LabourSocialOpeningGap;
  readonly subfields: readonly SocialOperatingSourceField[];
  readonly fullyClosed: boolean;
}
export interface OfficialSocialOperatingSourceBindings {
  readonly schemaVersion: 'official-social-operating-source-bindings-v1';
  readonly status: 'SELECTED_SOURCE_BINDINGS_NOT_OPERATIONAL';
  readonly sourcePackageId: string;
  readonly sourceChecksumsSha256: string;
  readonly assets: readonly SocialOperatingAssetBinding[];
  readonly employment: readonly SocialOperatingEmploymentBinding[];
  readonly records: readonly SocialOperatingGapBinding[];
  readonly remainingGaps: readonly LabourSocialOpeningGap[];
  readonly summary: Readonly<{
    originalOperatingGaps: number;
    fullyClosedOriginalGaps: number;
    newSourceFacts: 0;
    newlyWiredAssets: number;
    fieldOccurrencesByStatus: Readonly<
      Record<SocialOperatingFieldStatus, number>
    >;
  }>;
}
const issued = new WeakSet<object>();
function invalid(message: string): never {
  throw new Error(`Social operating source: ${message}`);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const ownerPath =
  'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md';
const mappingPath =
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json';

/** Consumes the existing constructor's brand before inspecting any supplied fields. */
export function createOfficialSocialOperatingSourceBindings(
  adoption: OfficialLabourSocialOpeningAdoption,
): OfficialSocialOperatingSourceBindings {
  consumeLabourSocialOpeningAdoption(adoption);
  const sourceRef = (
    dataset: string,
    pointer: string,
    relation: SocialOperatingSourceReference['relation'] = 'EXACT_SOURCE_VALUE',
  ): SocialOperatingSourceReference => {
    const source = adoption.sourceProvenance.find(
      (item) => item.dataset === dataset,
    );
    if (!source) invalid(`missing pinned dataset: ${dataset}`);
    return {
      kind: 'DATASET',
      path: `artifacts/world-balanced-candidate-v1/data/${dataset}.json`,
      pointer,
      sha256: source.sha256,
      relation,
    };
  };
  const ownerRef = (
    section: '5.5' | '5.6',
  ): SocialOperatingSourceReference => ({
    kind: 'OWNER_RULE',
    path: ownerPath,
    pointer: section,
    sha256: adoption.authority.originalSha256,
    relation: 'DERIVATION_INPUT',
  });
  const employerRefs: readonly SocialOperatingSourceReference[] = [
    {
      kind: 'MAPPING',
      path: mappingPath,
      pointer: '/mappings/entityProposals',
      sha256: OFFICIAL_OPENING_RECONCILIATION_PINS.mappingSha256,
      relation: 'DERIVATION_INPUT',
    },
    ownerRef('5.5'),
  ];
  const field = (
    name: string,
    status: SocialOperatingFieldStatus,
    value: SocialOperatingValue | null,
    refs: readonly SocialOperatingSourceReference[],
    detail: string,
    adoptionPointer: string | null = null,
  ): SocialOperatingSourceField => ({
    field: name,
    status,
    value,
    sourceReferences: refs,
    detail,
    adoptionPointer,
    alreadyMapped: adoptionPointer !== null,
  });
  const missing = (
    name: string,
    refs: readonly SocialOperatingSourceReference[],
    detail = 'No complete adopted operating value accompanies these selected-source targets.',
  ) => field(name, 'MISSING', null, refs, detail);
  const employer = (countryId: string, role: 'GOV' | 'OP') => {
    const matches = adoption.employers.filter(
      (item) => item.countryId === countryId && item.role === role,
    );
    if (matches.length !== 1) invalid('employer scope must resolve uniquely');
    return matches[0]!.employerId;
  };
  const capIndex = new Map(
    adoption.capacities.map((cap, index) => [cap.sourceFacilityId, index]),
  );
  const capRefs = (
    cap: LabourSocialCapacityAlias,
    name: string,
    relation: SocialOperatingSourceReference['relation'] = 'EXACT_SOURCE_VALUE',
  ) => [sourceRef('facilities', `${cap.sourcePointer}/${name}`, relation)];
  const assets: SocialOperatingAssetBinding[] = adoption.capacities
    .filter(
      (cap) =>
        cap.sourceProjectId === 'PROJECT-31' ||
        cap.sourceProjectId === 'PROJECT-35',
    )
    .map((cap) => {
      const index = capIndex.get(cap.sourceFacilityId)!;
      const base = `/capacities/${index}`;
      const basic = cap.sourceProjectId === 'PROJECT-31';
      const staffName = basic ? 'teachers' : 'medicalWorkers';
      const gov = employer(cap.core.countryId, 'GOV');
      const refs = capRefs(cap, 'projectId');
      const fields: SocialOperatingSourceField[] = [
        field(
          'sourceFacilityId',
          'KNOWN',
          cap.sourceFacilityId,
          capRefs(cap, 'id'),
          'Existing selected-source asset identity.',
          `${base}/sourceFacilityId`,
        ),
        field(
          'sourceServiceId',
          'KNOWN',
          cap.sourceServiceId,
          [sourceRef('population-services', `${cap.servicePointer}/id`)],
          'Service row is an alias of the same asset; do not count a second facility.',
          `${base}/sourceServiceId`,
        ),
        field(
          'sourceProjectId',
          'KNOWN',
          cap.sourceProjectId,
          refs,
          'Fixed project catalogue identity.',
          `${base}/sourceProjectId`,
        ),
        field(
          'serviceKind',
          'DERIVED',
          basic ? 'BASIC_EDUCATION' : 'HOSPITAL',
          refs,
          basic
            ? 'PROJECT-31 is BASIC; no vocational/higher college is inferred.'
            : 'PROJECT-35 is hospital/emergency infrastructure; no primary clinic is inferred.',
        ),
        field(
          'locationId',
          'KNOWN',
          cap.core.locationId,
          [
            ...capRefs(cap, 'regionId').map((ref) => ({
              ...ref,
              relation: 'DERIVATION_INPUT' as const,
            })),
            {
              kind: 'MAPPING',
              path: mappingPath,
              pointer: '/mappings/regions',
              sha256: OFFICIAL_OPENING_RECONCILIATION_PINS.mappingSha256,
              relation: 'DERIVATION_INPUT',
            },
          ],
          'Existing normalized same-country location from the audited mapping.',
          `${base}/core/locationId`,
        ),
        field(
          'capacity',
          'KNOWN',
          cap.core.capacity.amount,
          capRefs(cap, 'capacity'),
          'Physical seat/bed capacity only, not enrollment, occupied beds or delivered episodes.',
          `${base}/core/capacity/amount`,
        ),
        field(
          'sourceCapacityUnit',
          'KNOWN',
          cap.sourceUnit,
          capRefs(cap, 'capacityUnit'),
          'Preserves student-seat or bed; no case/time conversion.',
          `${base}/sourceUnit`,
        ),
        field(
          'staffTarget',
          'KNOWN',
          cap.requiredStaffTarget!,
          [
            ...capRefs(cap, 'requiredWorkers'),
            sourceRef(
              'population-services',
              `${cap.servicePointer}/${staffName}`,
            ),
          ],
          'Existing personnel requirement target, not currently employed people.',
          `${base}/requiredStaffTarget`,
        ),
        field(
          'genericSkillDemand',
          'KNOWN',
          cap.genericSourceSkillDemand,
          capRefs(cap, 'labourBySkill').map((ref) => ({
            ...ref,
            relation: 'DERIVATION_INPUT' as const,
          })),
          'Existing case-normalized generic skill demand; it does not identify employed occupations.',
          `${base}/genericSourceSkillDemand`,
        ),
        ...(['LOW', 'MEDIUM', 'HIGH'] as const).map((skill) =>
          field(
            `genericSkillDemand:${skill}`,
            'KNOWN',
            cap.genericSourceSkillDemand[skill],
            capRefs(cap, `labourBySkill/${skill.toLowerCase()}`),
            'Exact source skill-demand quantity, not an occupation or employed-person count.',
            `${base}/genericSourceSkillDemand/${skill}`,
          ),
        ),
        field(
          'governmentEmployerId',
          'DERIVED',
          gov,
          employerRefs,
          'Unique GOV employer target under D04; no operator, contract, budget or funding inferred.',
          `/employers/${adoption.employers.findIndex((item) => item.countryId === cap.core.countryId && item.role === 'GOV')}/employerId`,
        ),
        field(
          'sourceOperatorProposal',
          'KNOWN',
          cap.sourceOperatorProposal,
          capRefs(cap, 'operatorId'),
          'Original OP proposal preserved separately from the GOV employer target.',
          `${base}/sourceOperatorProposal`,
        ),
        missing(
          'actualOperatorId',
          capRefs(cap, 'operatorId', 'DERIVATION_INPUT'),
          'An operator proposal and a GOV employer are different roles; neither proves an actual operating appointment.',
        ),
        missing('actualStaffEmployed', [
          ...capRefs(cap, 'requiredWorkers', 'DERIVATION_INPUT'),
          ownerRef('5.5'),
        ]),
        missing('wageAmountCurrencyPeriodVersion', [
          sourceRef('facilities', cap.sourcePointer, 'CHECKED_PARENT_RECORD'),
        ]),
        missing('fundedPayrollAndObligation', [
          sourceRef('facilities', cap.sourcePointer, 'CHECKED_PARENT_RECORD'),
        ]),
      ];
      if (basic)
        fields.push(
          field(
            'teacherSkillSemantics',
            'CONFLICT',
            cap.genericSourceSkillDemand,
            capRefs(cap, 'labourBySkill', 'DERIVATION_INPUT'),
            'Selected teachers/requiredWorkers contain generic LOW/MEDIUM demand; the teacher HIGH qualification cannot be silently recast.',
          ),
          ...[
            'programmeAndLevel',
            'enrollmentAndApplicants',
            'cohortDurationAndCompletion',
            'studentsPerQualifiedTeacher',
            'fundedEducationBudgetAndInputs',
          ].map((name) =>
            missing(name, [
              sourceRef(
                'population-services',
                cap.servicePointer,
                'CHECKED_PARENT_RECORD',
              ),
            ]),
          ),
        );
      else
        fields.push(
          field(
            'dailyMedicalVisitsReference',
            'KNOWN',
            cap.dailyMedicalVisitsReference!,
            [
              sourceRef(
                'population-services',
                `${cap.servicePointer}/dailyMedicalVisits`,
              ),
            ],
            'Reference only: neither required/delivered episodes nor funded capacity.',
            `${base}/dailyMedicalVisitsReference`,
          ),
          ...[
            'doctorsRequired',
            'nursesRequired',
            'medicalTechniciansRequired',
            'emergencyMedicalStaffRequired',
            'publicHealthStaffRequired',
            'supportStaffRequired',
            'staffEmployedByOccupationAndSkill',
            'newDemand',
            'priorBacklog',
            'occupiedBeds',
            'carePeriodSemantics',
            'medicalSupplies',
            'fundedHealthcareBudget',
          ].map((name) =>
            missing(name, [
              sourceRef(
                'population-services',
                cap.servicePointer,
                'CHECKED_PARENT_RECORD',
              ),
              ...capRefs(cap, 'labourBySkill', 'DERIVATION_INPUT'),
            ]),
          ),
        );
      return {
        countryId: cap.core.countryId,
        economicEntityId: gov,
        locationId: cap.core.locationId,
        assetId: cap.core.assetId,
        sourceFacilityId: cap.sourceFacilityId,
        serviceKind: basic ? 'BASIC_EDUCATION' : 'HOSPITAL',
        fields,
      };
    });
  const employment = adoption.employmentTargets.map(
    (target, index): SocialOperatingEmploymentBinding => {
      const exact = [
        'labourForce',
        'employed',
        'unemployed',
        'educationAndHealth',
        'power',
        'logistics',
        'otherDomesticServices',
      ] as const;
      const fields = exact.map((name) =>
        field(
          name,
          'KNOWN',
          target[name],
          [sourceRef('employment', `${target.sourcePointer}/${name}`)],
          'Country-wide adopted target; not per-employer actual employment.',
          `/employmentTargets/${index}/${name}`,
        ),
      );
      for (const [name, value] of Object.entries(target.sectors))
        fields.push(
          field(
            `sector:${name}`,
            'KNOWN',
            value,
            [
              sourceRef(
                'employment',
                `${target.sourcePointer}/sectors/${name}`,
              ),
            ],
            'Existing sector employment target; not a posted position.',
            `/employmentTargets/${index}/sectors/${name}`,
          ),
        );
      for (const [name, project, sourceName] of [
        ['teachers', 'PROJECT-31', 'teachers'],
        ['medicalWorkers', 'PROJECT-35', 'medicalWorkers'],
      ] as const) {
        const refs = adoption.capacities
          .filter(
            (cap) =>
              cap.core.countryId === target.countryId &&
              cap.sourceProjectId === project,
          )
          .map((cap) =>
            sourceRef(
              'population-services',
              `${cap.servicePointer}/${sourceName}`,
              'DERIVATION_INPUT',
            ),
          );
        fields.push(
          field(
            name,
            'DERIVED',
            target[name],
            refs,
            'Already mapped exact regional sum; never a new 50/50 split or generated person.',
            `/employmentTargets/${index}/${name}`,
          ),
        );
      }
      return {
        countryId: target.countryId,
        economicEntityId: null,
        employerBindings: ['GOV', 'OP'].map((role) => ({
          role: role as 'GOV' | 'OP',
          employerId: employer(target.countryId, role as 'GOV' | 'OP'),
        })),
        fields,
      };
    },
  );
  const countryFields = (target: LabourSocialEmploymentTarget) =>
    employment.find((item) => item.countryId === target.countryId)!.fields;
  const aggregateCapacity = (
    target: LabourSocialEmploymentTarget,
    project: 'PROJECT-31' | 'PROJECT-35' | 'PROJECT-36',
    name: string,
    sourceField: string,
  ) => {
    const caps = adoption.capacities.filter(
      (cap) =>
        cap.core.countryId === target.countryId &&
        cap.sourceProjectId === project,
    );
    const value = caps
      .reduce((sum, cap) => sum + BigInt(cap.core.capacity.amount), 0n)
      .toString();
    return field(
      name,
      'DERIVED',
      value,
      caps.map((cap) =>
        sourceRef(
          'population-services',
          `${cap.servicePointer}/${sourceField}`,
          'DERIVATION_INPUT',
        ),
      ),
      'Exact sum of already mapped regional capacity, not actual service.',
      '/capacities',
    );
  };
  const remainingGaps = adoption.gaps.filter(
    (gap) => gap.code === 'MISSING_OPERATING_INPUT',
  );
  const records = remainingGaps.map((gap): SocialOperatingGapBinding => {
    const originalRefs = [
      sourceRef(
        gap.sourcePath.replace(/^data\//u, '').replace(/\.json$/u, ''),
        gap.sourcePointer,
        'CHECKED_PARENT_RECORD',
      ),
    ];
    const asset = assets.find(
      (item) => item.sourceFacilityId === gap.sourceObjectId,
    );
    const target = adoption.employmentTargets.find(
      (item) => item.countryId === gap.countryId,
    )!;
    const available = countryFields(target);
    const select = (...names: string[]) =>
      names.map(
        (name) =>
          available.find((item) => item.field === name) ??
          invalid(`unknown adopted country field: ${name}`),
      );
    const absent = (...names: string[]) =>
      names.map((name) => missing(name, originalRefs));
    let subfields: readonly SocialOperatingSourceField[];
    switch (gap.field) {
      case 'staffingByOccupationAndSkill':
        if (!asset || asset.serviceKind !== 'HOSPITAL')
          invalid('occupation gap must bind one actual hospital asset');
        subfields = asset.fields.filter(
          (item) =>
            item.field.startsWith('genericSkillDemand:') ||
            [
              'staffTarget',
              'genericSkillDemand',
              'governmentEmployerId',
              'doctorsRequired',
              'nursesRequired',
              'medicalTechniciansRequired',
              'emergencyMedicalStaffRequired',
              'publicHealthStaffRequired',
              'supportStaffRequired',
              'staffEmployedByOccupationAndSkill',
            ].includes(item.field),
        );
        break;
      case 'employmentByRegionAndSkill':
        subfields = [
          ...select(
            'labourForce',
            'employed',
            'unemployed',
            'otherDomesticServices',
          ),
          ...absent(
            'employedByRegionSkillAndPosition',
            'unemployedByRegionAndSkill',
            'unlocatedDomesticServicePositions',
          ),
        ];
        break;
      case 'wageAmountCurrencyPeriodVersion':
        subfields = absent(
          'wageAmount',
          'wageCurrency',
          'wagePeriod',
          'wageVersion',
        );
        break;
      case 'payrollFundingAndObligation':
        subfields = [
          ...['GOV', 'OP'].map((role) =>
            field(
              `${role.toLowerCase()}EmployerId`,
              'DERIVED',
              employer(gap.countryId, role as 'GOV' | 'OP'),
              employerRefs,
              'Existing employer identity only; no funded account or payable obligation.',
              '/employers',
            ),
          ),
          ...absent(
            'payrollAccountBinding',
            'fundedPayrollBudget',
            'payrollObligationState',
          ),
        ];
        break;
      case 'educationInitialQueueAndProgramme':
        subfields = [
          aggregateCapacity(
            target,
            'PROJECT-31',
            'basicEducationSeats',
            'schoolSeats',
          ),
          ...absent(
            'programmeAndEducationLevel',
            'applicants',
            'enrolled',
            'durationAndInitialCompletionState',
          ),
        ];
        break;
      case 'educationStaffAndFiscalCapacity':
        subfields = [
          ...select('teachers'),
          field(
            'teacherSkillSemantics',
            'CONFLICT',
            null,
            originalRefs,
            'Teacher HIGH qualification conflicts with selected generic LOW/MEDIUM teacher demand; target counts are retained.',
          ),
          ...absent(
            'teachersEmployed',
            'studentsPerQualifiedTeacher',
            'educationBudget',
            'inputSupportedSeatCapacity',
          ),
        ];
        break;
      case 'healthcareInitialDemandAndBacklog':
        subfields = [
          aggregateCapacity(
            target,
            'PROJECT-35',
            'hospitalBeds',
            'hospitalBeds',
          ),
          ...absent(
            'newDemand',
            'priorBacklog',
            'occupiedBeds',
            'carePeriodSemantics',
          ),
        ];
        break;
      case 'healthcareInputsAndFiscalCapacity':
        subfields = [
          ...select('medicalWorkers'),
          ...absent(
            'actualClinicalPersonnelByOccupation',
            'staffSupportedCareCapacity',
            'facilityEpisodesPerPeriod',
            'medicalSupplies',
            'fundedCareCapacity',
          ),
        ];
        break;
      case 'housingOccupancyHabitabilityAndRent':
        subfields = [
          aggregateCapacity(
            target,
            'PROJECT-36',
            'housingUnits',
            'housingUnits',
          ),
          ...absent(
            'occupiedHouseholdsAndTenure',
            'habitableUnits',
            'rentAndSubsidyRules',
          ),
        ];
        break;
      case 'welfareEligibilityRulesAndPayments':
        subfields = absent(
          'eligibilityRules',
          'programme',
          'benefitAmountCurrencyAndPeriod',
          'beneficiaries',
          'paymentState',
        );
        break;
      case 'publicSafetyPositionsAndInitialQueue':
        subfields = absent(
          'safetyAndAdministrationPositions',
          'employedSafetyStaff',
          'initialIncidents',
          'initialCaseQueue',
          'fundedSafetyBudget',
        );
        break;
      default:
        invalid(
          `unrecognized operating gap must not silently disappear: ${gap.field}`,
        );
    }
    const entity =
      gap.field === 'housingOccupancyHabitabilityAndRent' ||
      gap.field === 'employmentByRegionAndSkill' ||
      gap.field === 'wageAmountCurrencyPeriodVersion' ||
      gap.field === 'payrollFundingAndObligation'
        ? null
        : employer(gap.countryId, 'GOV');
    return {
      gapKey: JSON.stringify([
        gap.countryId,
        gap.locationId,
        gap.sourceObjectId,
        gap.field,
      ]),
      countryId: gap.countryId,
      locationId: gap.locationId,
      sourceObjectId: gap.sourceObjectId,
      field: gap.field,
      economicEntityId: entity,
      originalGap: gap,
      subfields,
      fullyClosed:
        subfields.length > 0 &&
        subfields.every(
          (item) => item.status === 'KNOWN' || item.status === 'DERIVED',
        ),
    };
  });
  const counts: Record<SocialOperatingFieldStatus, number> = {
    KNOWN: 0,
    DERIVED: 0,
    MISSING: 0,
    CONFLICT: 0,
  };
  for (const record of records)
    for (const item of record.subfields) counts[item.status]++;
  const result: OfficialSocialOperatingSourceBindings = freeze({
    schemaVersion: 'official-social-operating-source-bindings-v1',
    status: 'SELECTED_SOURCE_BINDINGS_NOT_OPERATIONAL',
    sourcePackageId: adoption.sourcePackageId,
    sourceChecksumsSha256: adoption.sourceChecksumsSha256,
    assets,
    employment,
    records,
    remainingGaps,
    summary: {
      originalOperatingGaps: remainingGaps.length,
      fullyClosedOriginalGaps: records.filter((record) => record.fullyClosed)
        .length,
      newSourceFacts: 0,
      newlyWiredAssets: assets.length,
      fieldOccurrencesByStatus: counts,
    },
  });
  issued.add(result);
  return result;
}

export type SocialOperatingFieldSelector =
  | Readonly<{
      kind: 'ASSET';
      countryId: string;
      economicEntityId: string;
      assetId: string;
      field: string;
    }>
  | Readonly<{
      kind: 'EMPLOYMENT';
      countryId: string;
      economicEntityId: null;
      field: string;
    }>
  | Readonly<{
      kind: 'GAP';
      countryId: string;
      economicEntityId: string | null;
      gapKey: string;
      field: string;
    }>;
export function readOfficialSocialOperatingSourceField(
  bindings: OfficialSocialOperatingSourceBindings,
  selector: SocialOperatingFieldSelector,
): SocialOperatingSourceField {
  if (!issued.has(bindings)) invalid('constructor-owned bindings required');
  const record =
    selector.kind === 'ASSET'
      ? bindings.assets.find(
          (item) =>
            item.countryId === selector.countryId &&
            item.economicEntityId === selector.economicEntityId &&
            item.assetId === selector.assetId,
        )
      : selector.kind === 'EMPLOYMENT'
        ? bindings.employment.find(
            (item) =>
              item.countryId === selector.countryId &&
              item.economicEntityId === selector.economicEntityId,
          )
        : bindings.records.find(
            (item) =>
              item.countryId === selector.countryId &&
              item.economicEntityId === selector.economicEntityId &&
              item.gapKey === selector.gapKey,
          );
  const fields =
    record && ('subfields' in record ? record.subfields : record.fields);
  return (
    fields?.find((item) => item.field === selector.field) ??
    invalid('unknown field or country/entity/asset scope mismatch')
  );
}
/** Reads selected input data only; UNKNOWN/CONFLICT never becomes an operating default. */
export function requireOfficialSocialOperatingSourceValue(
  bindings: OfficialSocialOperatingSourceBindings,
  selector: SocialOperatingFieldSelector,
): SocialOperatingValue {
  const result = readOfficialSocialOperatingSourceField(bindings, selector);
  if (
    (result.status !== 'KNOWN' && result.status !== 'DERIVED') ||
    result.value === null
  )
    invalid(`unresolved ${result.status}: ${result.field}`);
  return result.value;
}
