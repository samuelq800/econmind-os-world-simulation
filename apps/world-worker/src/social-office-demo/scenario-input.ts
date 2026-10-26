/** One explicitly selected prospective scenario. Loading it performs no installation. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as C from '@econmind/core';
// @ts-expect-error -- A owns the reviewed .mjs reader without a declaration file; FinanceModule bounds this data-only bridge.
import * as OpeningFinanceData from '../../../../tools/social-office-demo/check-opening-finance.mjs';
import {
  parseSocialOfficeSimulatedPublication,
  type SocialOfficeSimulatedPublication,
  type SocialOfficeSimulatedRecord,
} from '../persistence/social-office-simulated-source-custody.js';
import {
  bindSocialOfficeSimulatedOpening,
  SOCIAL_DEMO_RECORD_IDS as IDS,
  type SocialDemoDomainRecordV1,
} from './source-facts.js';

const ROOT_SHA =
  'b7ff5facc4e3301d265279762d18cec18a5258dfa061ea88cffb4a03693e8036';
const DOMAIN_SHA =
  '46b552733f652a41277ee0e16ec5588f88609f0cae20859c67ba4d294b8d2113';
const DAY = 86400000n;
const digest = (s: string) =>
  createHash('sha256').update(s, 'utf8').digest('hex');
function fail(s: string): never {
  throw Error(`SOCIAL_DEMO_SCENARIO: ${s}`);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
interface PersonPosition {
  readonly personId: string | null;
  readonly positionId: string;
  readonly occupation: string;
  readonly priceRole: string | null;
  readonly dailyAvailableMinutes: string;
}
interface DomainCandidate {
  readonly id: string;
  readonly scope: {
    readonly simulationId: string;
    readonly worldId: string;
    readonly countryId: string;
    readonly locationId: string;
  };
  readonly positions: readonly PersonPosition[];
  readonly employmentGenesis: C.SocialEmploymentServiceState;
  readonly employmentCurrent: {
    readonly populationAvailability: readonly C.LabourPopulationAvailability[];
  };
  readonly education: {
    readonly programmeId: string;
    readonly specialisationId: string;
    readonly teacherSupportedSeats: string;
    readonly availableCapacity: string;
    readonly oldCohort: {
      readonly cohortId: string;
      readonly studentIds: readonly string[];
      readonly enrolled: string;
      readonly requiredDuration: { readonly amount: string };
      readonly dropoutRate: C.SocialOfficeRationalV1;
      readonly completionRate: C.SocialOfficeRationalV1;
    };
    readonly newCohort: {
      readonly cohortId: string;
      readonly applicantIds: readonly string[];
    };
    readonly courseTeaching: {
      readonly minutesPerStudentPerSimDay: string;
      readonly openingOldCohortFutureReservations: readonly {
        readonly dayIndex: string;
        readonly reservedTeacherMinutes: string;
      }[];
    };
  };
  readonly healthcare: {
    readonly institutionId: string;
    readonly episodeId: string;
    readonly priorBacklog: string;
    readonly newDemand: string;
    readonly staff: readonly {
      readonly personId: string;
      readonly minutesPerCase: string;
    }[];
    readonly facility: {
      readonly facilityId: string;
      readonly availableMinutes: string;
      readonly minutesPerCase: string;
    };
    readonly medicine: {
      readonly account: C.InventoryAccount;
      readonly openingQuantity: string;
    };
  };
}
interface FinanceCandidate {
  readonly classification: 'DATA_NOT_AUTHENTICATED';
  readonly ownerSelectedOption: null;
  readonly activationAuthorized: false;
  readonly scope: { readonly proposedSeedId: string };
  readonly financialOpening: {
    readonly positiveOpeningLegTemplates: readonly {
      readonly account: C.FinancialAccount;
      readonly direction: C.FinancialPostingDirection;
      readonly amount: string;
      readonly currency: string;
    }[];
  };
  readonly openingBefore: {
    readonly budgetBefore: readonly {
      readonly budgetId: string;
      readonly approved: string;
      readonly committed: string;
      readonly currency: string;
    }[];
  };
  readonly wageOption: {
    readonly wageCandidateVersionId: string;
    readonly minimumAnnual: string;
    readonly staffRows: readonly {
      readonly personId: string;
      readonly positionId: string;
      readonly annualGross: string;
      readonly employerId: string;
      readonly legalPositionRef: string;
      readonly payrollFundingRef: string;
    }[];
  };
  readonly costRuleProjection: {
    readonly clinic: C.SocialOfficeCostRuleV1;
    readonly collegeAdmission: C.SocialOfficeCostRuleV1;
    readonly collegeGraduation: C.SocialOfficeCostRuleV1;
  };
}
interface FinanceModule {
  readOpeningFinanceDistribution(): string;
  selectOpeningFinanceCandidateData(
    utf8: string,
    selector: Readonly<{
      meaning: string;
      domainVariant: string;
      financeOptionId: string;
    }>,
  ): FinanceCandidate;
}
export interface SocialOfficeDemoScenario {
  readonly sourceClass: 'SIMULATED_OPENING';
  readonly sourceAdmitted: false;
  readonly selectionClass: 'DEMO_SELECTION_ONLY_NOT_ADOPTED_WORLD_POLICY';
  readonly rootSelectionSHA256: string;
  readonly scope: DomainCandidate['scope'];
  readonly seed: Readonly<C.OpeningSeed>;
  readonly socialOpening: C.SocialOfficeStateV1;
  readonly openingReadFacts: C.SocialOfficeReadFactsV1;
  readonly initialPublication: Readonly<SocialOfficeSimulatedPublication>;
  readonly financeData: FinanceCandidate;
  readonly actorId: string;
  readonly authSubject: string;
  publicationForPreset(
    input: Readonly<{
      dayIndex: string;
      expectedGeneration: string;
      expectedManifestHash: string | null;
    }>,
  ): Readonly<SocialOfficeSimulatedPublication>;
}
function original(
  recordId: string,
  role: SocialOfficeSimulatedRecord['role'],
  value: unknown,
  physicalGroupKey: string | null = null,
): SocialOfficeSimulatedRecord {
  const rawUtf8 = C.canonicalSerialize(value);
  return {
    recordId,
    revision: 'G_SOCIAL_DEMO_V1',
    role,
    physicalGroupKey,
    rawUtf8,
    sha256: digest(rawUtf8),
  };
}
function financialOpening(
  finance: FinanceCandidate,
  sourceId: C.OpeningSourceId,
): readonly C.FinancialOpeningBatch[] {
  const rows = finance.financialOpening.positiveOpeningLegTemplates;
  // References link the exact positive A legs. No extra leg, balancing amount or zero descriptor.
  const nominalPeer: Readonly<Record<string, string>> = {
    ACCOUNT_SIM_SOCIAL_GOV_MEDICINE_ASSET:
      'ACCOUNT_SIM_SOCIAL_SUPPLIER_REVENUE',
    ACCOUNT_SIM_SOCIAL_GOV_OPERATING_EXPENSE:
      'ACCOUNT_SIM_SOCIAL_SUPPLIER_REVENUE',
    ACCOUNT_SIM_SOCIAL_SUPPLIER_REVENUE:
      'ACCOUNT_SIM_SOCIAL_GOV_MEDICINE_ASSET',
    ACCOUNT_SIM_SOCIAL_GOV_SCHOLARSHIP_EXPENSE:
      'ACCOUNT_SIM_SOCIAL_HH_SCHOLARSHIP_REVENUE',
    ACCOUNT_SIM_SOCIAL_HH_SCHOLARSHIP_REVENUE:
      'ACCOUNT_SIM_SOCIAL_GOV_SCHOLARSHIP_EXPENSE',
  };
  const legId = (account: C.FinancialAccount) =>
    C.financialOpeningLegId(`OPEN_${account.accountId}`);
  const legs = rows.map((r) => {
    const peers = rows.filter(
      (p) =>
        p.account.accountId !== r.account.accountId &&
        p.direction !== r.direction &&
        (r.account.claimId !== null
          ? p.account.claimId === r.account.claimId &&
            p.account.ownerId === r.account.counterpartyEntityId &&
            p.account.counterpartyEntityId === r.account.ownerId
          : p.account.accountId === nominalPeer[r.account.accountId]),
    );
    if (peers.length !== 1) fail('exact A opening counterpart missing');
    return {
      legId: legId(r.account),
      account: C.createFinancialAccount(r.account),
      direction: r.direction,
      amount: C.Money.from(r.amount, r.currency),
      counterpartLegId: legId(peers[0]!.account),
    };
  });
  return [
    {
      batchId: C.financialOpeningBatchId(
        'SIM_SOCIAL_POSITIVE_FINANCIAL_OPENING_V1',
      ),
      sourceId,
      settlementCurrency: 'XAA',
      legs,
    },
  ];
}

/** No arguments or path overrides. A's explicit selector remains a data query. */
export async function loadSocialOfficeDemoScenario(): Promise<
  Readonly<SocialOfficeDemoScenario>
> {
  if (arguments.length !== 0) fail('fixed packaged inputs only');
  const [domainUtf8, optionsUtf8] = await Promise.all([
    readFile(
      new URL(
        '../../../../data/scenario-candidates/single-social-office-demo-v1/domain-facts.json',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../../../../data/scenario-candidates/single-social-office-demo-v1/scenario-options.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);
  if (digest(domainUtf8) !== DOMAIN_SHA)
    fail('reviewed domain distribution changed');
  const options = JSON.parse(optionsUtf8) as {
    rootSelectionUtf8: string;
    rootSelectionSHA256: string;
    domainDistributionSHA256: string;
    mandatoryGOverlaySHA256: string;
  };
  if (
    digest(options.rootSelectionUtf8) !== ROOT_SHA ||
    options.rootSelectionSHA256 !== ROOT_SHA ||
    options.domainDistributionSHA256 !== DOMAIN_SHA ||
    options.mandatoryGOverlaySHA256 !==
      '5e4a37cff527e4ddf88b1893b498e5dc9df4a7c523e199eb7a3cfc1b21ea20c7'
  )
    fail('exact Root demo choice and mandatory clarification required');
  const selection = JSON.parse(options.rootSelectionUtf8) as {
    selected: {
      gScenarioId: string;
      aFinanceOptionId: string;
      aMeaning: string;
      aDomainVariant: string;
      completionPolicy: string;
    };
    isolatedAuthorization: { authSubject: string };
  };
  const candidates = JSON.parse(domainUtf8) as {
    selection: null;
    options: readonly DomainCandidate[];
  };
  const selected = candidates.options.filter(
    (x) => x.id === selection.selected.gScenarioId,
  );
  if (
    candidates.selection !== null ||
    selected.length !== 1 ||
    selection.selected.completionPolicy !== 'SOCIAL_COMPLETION_FLOOR_RETAIN_V1'
  )
    fail('one separately recorded demo choice required');
  const candidate = selected[0]!,
    { worldId, countryId, locationId, simulationId } = candidate.scope;
  const a: FinanceModule = OpeningFinanceData;
  const finance = a.selectOpeningFinanceCandidateData(
    a.readOpeningFinanceDistribution(),
    {
      meaning: selection.selected.aMeaning,
      domainVariant: selection.selected.aDomainVariant,
      financeOptionId: selection.selected.aFinanceOptionId,
    },
  );
  if (
    finance.classification !== 'DATA_NOT_AUTHENTICATED' ||
    finance.ownerSelectedOption !== null ||
    finance.activationAuthorized !== false
  )
    fail('A query cannot grant authority');
  const staff = candidate.positions.filter((p) => p.personId !== null);
  const teacher = staff.find((p) => p.personId === 'SIM_H001');
  if (!teacher) fail('original teacher required');
  const physicalId = (id: string) => `PHYSICAL_PERSON_${id}`;
  const windowId = (id: string, day: string) => `SIM_PERSON_${id}_DAY_${day}`;
  const resources: C.SocialOfficeResourceV1[] = [];
  const physicalRecords: SocialOfficeSimulatedRecord[] = [];
  for (let day = 0n; day <= 10n; day++) {
    const d = day.toString(),
      recordId = `G_SOCIAL_PHYSICAL_DAY_${d}`;
    const allocations: C.SocialOfficeResourceV1[] = staff.map((p) => ({
      resourceId: windowId(p.personId!, d),
      canonicalPhysicalResourceId: physicalId(p.personId!),
      canonicalOriginId: `ORIGIN_PERSON_${p.personId!}`,
      originalSourceRecordId: recordId,
      worldId,
      countryId,
      locationId,
      windowId: `SIM_DAY_${d}`,
      dayIndex: d,
      startSimTime: (day * DAY).toString(),
      endSimTime: ((day + 1n) * DAY).toString(),
      unit: 'staff_minute',
      capacity: p.dailyAvailableMinutes,
      eligibilityRuleVersion: 'SIM_SOCIAL_QUALIFICATIONS_V1',
      positionId: p.positionId,
      qualification: p.priceRole ?? p.occupation,
      assignedPeople: '1',
    }));
    allocations.push({
      resourceId: `SIM_FACILITY_${candidate.healthcare.facility.facilityId}_DAY_${d}`,
      canonicalPhysicalResourceId: candidate.healthcare.facility.facilityId,
      canonicalOriginId: 'ORIGIN_CLINIC_ROOM_01',
      originalSourceRecordId: recordId,
      worldId,
      countryId,
      locationId,
      windowId: `SIM_DAY_${d}`,
      dayIndex: d,
      startSimTime: (day * DAY).toString(),
      endSimTime: ((day + 1n) * DAY).toString(),
      unit: 'facility_minute',
      capacity: candidate.healthcare.facility.availableMinutes,
      eligibilityRuleVersion: 'SIM_CLINIC_ROOM_V1',
      positionId: null,
      qualification: 'OUTPATIENT_ROOM',
      assignedPeople: '0',
    });
    resources.push(...allocations);
    const group = digest(
      ['SOCIAL_PHYSICAL_GROUP_V1', worldId, countryId, locationId, d].join(
        '\n',
      ),
    );
    physicalRecords.push(
      original(
        recordId,
        'PHYSICAL_ORIGINAL_BODY',
        {
          schemaVersion: 'g-social-office-physical-day-v1',
          worldId,
          countryId,
          locationId,
          dayIndex: d,
          allocations,
        },
        group,
      ),
    );
  }
  physicalRecords.sort((a, b) =>
    a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0,
  );
  const recipe = (
    id: string,
    amountPerUnit: string,
  ): C.SocialOfficeRecipeV1 => ({ resourceId: physicalId(id), amountPerUnit });
  const e = candidate.education,
    h = candidate.healthcare;
  const programme: C.SocialOfficeProgrammeRuleV1 = {
    programmeId: e.programmeId,
    ruleVersion: 'SIM_VOCATIONAL_RULE_V1',
    ruleSourceRecordId: IDS.domain,
    level: 'VOCATIONAL',
    specialisationId: e.specialisationId,
    sourceSkill: 'LOW',
    targetSkill: 'MEDIUM',
    eligibleStatus: 'STUDENT',
    requiredDurationSimDays: e.oldCohort.requiredDuration.amount,
    seats: e.availableCapacity,
    studentsPerQualifiedTeacher: e.teacherSupportedSeats,
    teacherPositionId: teacher.positionId,
    teacherQualification: 'TEACHER',
    teachingMinutesPerStudentPerSimDay:
      e.courseTeaching.minutesPerStudentPerSimDay,
    teachingResourceIds: resources
      .filter((r) => r.canonicalPhysicalResourceId === physicalId('SIM_H001'))
      .map((r) => r.resourceId),
    admissionRecipe: [
      recipe('SIM_M001', '10'),
      recipe('SIM_H001', '15'),
      recipe('SIM_L001', '10'),
    ],
    assessmentRecipe: [
      recipe('SIM_H001', '30'),
      recipe('SIM_M001', '10'),
      recipe('SIM_L001', '10'),
    ],
    dropoutRate: e.oldCohort.dropoutRate,
    completionRate: e.oldCohort.completionRate,
    integerPolicy: 'FLOOR_WHOLE_PEOPLE_RETAIN_REMAINDER',
    nonGraduateDisposition: 'RETAIN_STUDENT_AND_SEAT',
    admissionCost: finance.costRuleProjection.collegeAdmission,
    graduationCost: finance.costRuleProjection.collegeGraduation,
  };
  const medicine = C.createInventoryAccount(h.medicine.account);
  const clinic: C.SocialOfficeClinicRuleV1 = {
    clinicId: h.institutionId,
    ruleVersion: 'SIM_PRIMARY_CARE_RULE_V1',
    ruleSourceRecordId: IDS.domain,
    careType: 'PRIMARY',
    staffRecipe: h.staff.map((s) => recipe(s.personId, s.minutesPerCase)),
    facilityRecipe: [
      {
        resourceId: h.facility.facilityId,
        amountPerUnit: h.facility.minutesPerCase,
      },
    ],
    medicineAccount: medicine,
    medicineSourceRecordId: IDS.domain,
    dosesPerCase: '1',
    cost: finance.costRuleProjection.clinic,
    demandAdmissionPolicy: 'ONCE_PER_ORIGINAL_DEMAND',
    serviceOrderingPolicy: 'BACKLOG_THEN_SOURCE_ORDER',
    attemptAccountingMode: 'SIMULATED_ATOMIC_COMPLETED_SERVICE_V1',
  };
  const labour = C.applyLabourFacts({
    boundary: C.createE01DailyBoundary('0'),
    populationAvailability: candidate.employmentCurrent.populationAvailability,
    state: {
      aggregates: candidate.employmentGenesis.labour.aggregates,
      positions: candidate.employmentGenesis.labour.positions,
      appliedFactBindings: [],
      wageAssertions: finance.wageOption.staffRows.map((r) => ({
        positionId: r.positionId,
        wageVersion: finance.wageOption.wageCandidateVersionId,
        wageAmount: r.annualGross,
      })),
    },
    facts: [],
  }).state;
  const nurse = finance.wageOption.staffRows.find(
    (s) => s.personId === 'SIM_M004',
  );
  if (!nurse) fail('conditional offered nurse original missing');
  const domain: SocialDemoDomainRecordV1 = {
    schemaVersion: 'g-social-office-domain-facts-v1',
    worldId,
    countryId,
    locationId,
    fixedFacts: {
      schemaVersion: 'social-office-read-facts-v1',
      populationAvailability:
        candidate.employmentCurrent.populationAvailability,
      programmeRules: [programme],
      applicantPools: [
        {
          applicantPoolId: 'SIM_STUDENT_APPLICANTS_V1',
          programmeId: e.programmeId,
          sourceSkill: 'LOW',
          eligibleStatus: 'STUDENT',
          memberIds: e.newCohort.applicantIds,
          sourceRecordId: IDS.domain,
        },
      ],
      clinicRules: [clinic],
      demandWindows: [
        {
          clinicId: h.institutionId,
          careWindowId: h.episodeId,
          demandId: 'SIM_CLINIC_DEMAND_D0_V1',
          canonicalOriginId: 'ORIGIN_SIM_CLINIC_DEMAND_D0_V1',
          dayIndex: '0',
          newCases: h.newDemand,
          sourceRecordId: IDS.domain,
        },
      ],
      approvedBudgets: finance.openingBefore.budgetBefore.map((b) => ({
        budgetId: b.budgetId,
        approvedAmount: { amount: b.approved, currency: b.currency },
        sourceRecordId: IDS.domain,
      })),
      employmentRecipes: [
        {
          servicePoolId: 'SIM_EMP_POOL_MEDIUM_D1',
          ruleVersion: 'SOCIAL_JOB_MATCH_RULE_V1',
          perPlannedSlot: [
            { resourceId: windowId('SIM_M001', '1'), amountPerUnit: '55' },
          ],
        },
      ],
    },
    employmentTerms: {
      populationAvailability:
        candidate.employmentCurrent.populationAvailability,
      offer: {
        positionId: nurse.positionId,
        countryId,
        locationId,
        skill: 'MEDIUM',
        employerId: nurse.employerId,
        employerRole: 'GOV',
        legalPositionRef: nurse.legalPositionRef,
        payrollFundingRef: nurse.payrollFundingRef,
        offerVersion: 'SIM_NURSE_OFFER_V1',
        state: 'ACTIVE',
        wageVersion: finance.wageOption.wageCandidateVersionId,
        amount: nurse.annualGross,
        currency: 'XAA',
        period: 'SIM_YEAR',
        validFromDayIndex: '0',
        validUntilDayIndex: '30',
      },
      minimumWage: {
        countryId,
        ruleId: 'SIM_MINIMUM_WAGE_V1',
        ruleVersion: finance.wageOption.wageCandidateVersionId,
        amount: finance.wageOption.minimumAnnual,
        currency: 'XAA',
        period: 'SIM_YEAR',
        validFromDayIndex: '0',
        validUntilDayIndex: '30',
      },
    },
  };
  const socialOpening: C.SocialOfficeStateV1 = {
    schemaVersion: 'social-office-state-v1',
    worldId,
    countryId,
    locationId,
    employment: {
      schemaVersion: 'social-employment-service-state-v1',
      worldId,
      labour,
      servicePools: candidate.employmentGenesis.servicePools,
      plans: [],
      appliedOperations: [],
    },
    programmes: [programme],
    cohorts: [
      {
        cohortId: e.oldCohort.cohortId,
        programmeId: e.programmeId,
        programmeRuleVersion: programme.ruleVersion,
        anchorDayIndex: '0',
        elapsedSimDaysAtAnchor: '0',
        requiredDurationSimDays: programme.requiredDurationSimDays,
        alreadyCompletedTeachingMinutes: '0',
        futureTeachingReservations:
          e.courseTeaching.openingOldCohortFutureReservations.map((r) => ({
            resourceId: windowId('SIM_H001', r.dayIndex),
            dayIndex: r.dayIndex,
            amount: r.reservedTeacherMinutes,
          })),
        originalEnrolled: e.oldCohort.enrolled,
        graduates: '0',
        memberIds: e.oldCohort.studentIds,
        state: 'OPEN',
      },
    ],
    applicantAssignments: e.oldCohort.studentIds,
    clinic: {
      clinicId: h.institutionId,
      backlog: h.priorBacklog,
      admittedDemandOrigins: [],
    },
    resourceWindows: resources.map((allocation) => ({
      allocation,
      used: '0',
      reservations:
        allocation.canonicalPhysicalResourceId === physicalId('SIM_H001') &&
        BigInt(allocation.dayIndex) < 10n
          ? [{ reservationId: e.oldCohort.cohortId, amount: '180' }]
          : [],
    })),
    budgetCommitments: finance.openingBefore.budgetBefore.map((b) => ({
      budgetId: b.budgetId,
      approvedAmount: { amount: b.approved, currency: b.currency },
      committedAmount: { amount: b.committed, currency: b.currency },
    })),
    appliedOperations: [],
  };
  const domainRecord = original(IDS.domain, 'DOMAIN_FACTS', domain);
  const physicalIds = [
    ...new Set(resources.map((r) => r.canonicalPhysicalResourceId)),
  ].sort();
  const catalogRecord = original(IDS.catalog, 'RESOURCE_CATALOG', {
    schemaVersion: 'social-office-simulated-resource-catalog-v1',
    sourceClass: 'SIMULATED_OPENING',
    simulationId,
    worldId,
    countryId,
    resources: physicalIds.map((id) => {
      const rs = resources.filter((r) => r.canonicalPhysicalResourceId === id);
      return {
        resourceId: id,
        kind: rs[0]!.unit === 'staff_minute' ? 'PERSON' : 'FACILITY',
        unit: rs[0]!.unit,
        aliases: [id, ...rs.map((r) => r.resourceId)].sort(),
      };
    }),
  });
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_SOCIAL_SINGLE_SIMULATED_V1'),
      sourceKind: 'DOCUMENTED_ASSUMPTION',
      locator: 'data/scenario-candidates/single-social-office-demo-v1',
      sourceVersion: 'ROOT_SINGLE_SOCIAL_DEMO_SELECTION_V1',
      payload: {
        sourceClass: 'SIMULATED_OPENING',
        sourceAdmitted: false,
        rootSelectionSHA256: ROOT_SHA,
        socialOpeningSHA256: digest(C.canonicalSerialize(socialOpening)),
        domainFactsSHA256: domainRecord.sha256,
        physicalOriginals: physicalRecords.map(({ recordId, sha256 }) => ({
          recordId,
          sha256,
        })),
        catalogSHA256: catalogRecord.sha256,
      },
    },
    digest,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId(finance.scope.proposedSeedId),
      worldId: C.worldId(worldId),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [
        {
          entryId: C.openingInventoryEntryId('SIM_MEDICINE_OPENING_V1'),
          sourceId: source.sourceId,
          account: medicine,
          quantity: C.Quantity.from(h.medicine.openingQuantity, 'medical_dose'),
        },
      ],
      financialBatches: financialOpening(finance, source.sourceId),
    },
    digest,
  );
  const records = [
    ...physicalRecords,
    catalogRecord,
    domainRecord,
    original(IDS.opening, 'DOMAIN_FACTS', {
      schemaVersion: 'g-social-office-simulated-opening-v1',
      worldId,
      countryId,
      locationId,
      openingSeed: JSON.parse(C.canonicalSerialize(seed)) as unknown,
      socialOpening,
    }),
    original(IDS.policy, 'CURRENT_AUTHORIZATION', {
      schemaVersion: 'g-social-office-action-policy-v1',
      worldId,
      countryId,
      locationId,
      actionKinds: ['PLAN', 'MATCH', 'ADMIT', 'GRADUATE', 'SERVE'],
      presets: ['0', '1', '10'],
      rootSelectionSHA256: ROOT_SHA,
    }),
    ...['0', '1', '10'].map((dayIndex) =>
      original(`G_SOCIAL_ASOF_DAY_${dayIndex}`, 'CURRENT_AUTHORIZATION', {
        schemaVersion: 'g-social-office-simulated-asof-v1',
        sourceClass: 'SIMULATED_OPENING',
        simulationId,
        worldId,
        countryId,
        locationId,
        presetId: `G_SOCIAL_PRESET_DAY_${dayIndex}`,
        dayIndex,
        simTime: (BigInt(dayIndex) * DAY).toString(),
        selectionFingerprint: `sha256:${ROOT_SHA}`,
      }),
    ),
  ].sort((a, b) =>
    a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0,
  );
  const publicationForPreset = (
    input: Readonly<{
      dayIndex: string;
      expectedGeneration: string;
      expectedManifestHash: string | null;
    }>,
  ): Readonly<SocialOfficeSimulatedPublication> => {
    if (
      !['0', '1', '10'].includes(input.dayIndex) ||
      Object.keys(input).sort().join('|') !==
        'dayIndex|expectedGeneration|expectedManifestHash'
    )
      fail('only fixed documentary presets/CAS accepted');
    return parseSocialOfficeSimulatedPublication({
      schemaVersion: 'social-office-simulated-source-publication-v1',
      sourceClass: 'SIMULATED_OPENING',
      simulationId,
      worldId,
      countryId,
      operationId: `SIM_SOCIAL_PRESET_${input.dayIndex}_GEN_${input.expectedGeneration}`,
      expectedGeneration: input.expectedGeneration,
      expectedManifestHash: input.expectedManifestHash,
      validFromSimTime: '0',
      validUntilSimTime: (30n * DAY).toString(),
      disposition: 'ACTIVE',
      allowedPurposes: ['EDUCATION', 'EMPLOYMENT', 'HEALTHCARE'],
      selectedRecordIds: records
        .filter(
          (r) =>
            !r.recordId.startsWith('G_SOCIAL_ASOF_DAY_') ||
            r.recordId === `G_SOCIAL_ASOF_DAY_${input.dayIndex}`,
        )
        .map((r) => r.recordId),
      records,
    });
  };
  const initialPublication = publicationForPreset({
    dayIndex: '0',
    expectedGeneration: '0',
    expectedManifestHash: null,
  });
  const publicationUtf8 = C.canonicalSerialize(initialPublication);
  const opening = bindSocialOfficeSimulatedOpening({
    publicationUtf8,
    generation: '1',
    manifestHash: digest(publicationUtf8),
    expectedWorldId: worldId,
    expectedCountryId: countryId,
    expectedSeedId: seed.seedId,
    expectedSeedFingerprint: seed.fingerprint,
  });
  return freeze({
    sourceClass: 'SIMULATED_OPENING',
    sourceAdmitted: false,
    selectionClass: 'DEMO_SELECTION_ONLY_NOT_ADOPTED_WORLD_POLICY',
    rootSelectionSHA256: ROOT_SHA,
    scope: candidate.scope,
    seed,
    ...opening,
    initialPublication,
    financeData: finance,
    actorId: 'ACTOR_SOCIAL_SINGLE_DEMO_V1',
    authSubject: selection.isolatedAuthorization.authSubject,
    publicationForPreset,
  });
}
