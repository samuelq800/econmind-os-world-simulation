import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { idempotencyKey, countryId, worldId } from '../ids.js';
import { Money } from '../numeric/money.js';
import {
  canonicalDecimal,
  assertWorldDecimalResult,
} from '../numeric/world-decimal.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  applyLabourFacts,
  type LabourSkill,
  type LabourPopulationAvailability,
} from '../labour/labour-engine.js';
import {
  createE01DailyBoundary,
  type E01DailyBoundary,
} from '../population/population-engine.js';
import {
  isAuthoritativeFinancialLedgerState,
  isAuthoritativeInventoryLedgerState,
} from '../opening/ledger-authority.js';
import {
  createInventoryAccount,
  type InventoryAccount,
  type InventoryLedgerState,
} from '../inventory/inventory-ledger.js';
import {
  createFinancialAccount,
  type FinancialAccount,
  type FinancialLedgerState,
  type FinancialPostingDirection,
} from '../finance/financial-ledger.js';
import {
  calculateEducationFoundation,
  calculateHealthcareFoundation,
  createSocialFoundationFact,
  type SocialFoundationTraceRequest,
} from '../engine-kernels/social-foundation.js';
import {
  canonicalSha256,
  parseCanonicalCommand,
  validateCanonicalCommand,
  type CanonicalCommand,
  type CanonicalSha256,
  type Sha256Hex,
} from './command.js';
import {
  prepareSocialEmploymentServiceOperation,
  parseSocialEmploymentServiceCommand,
  validateSocialEmploymentServiceState,
  type SocialEmploymentServiceState,
  type SocialEmploymentReadFacts,
  type SocialEmploymentOutcome,
} from './social-employment-service.js';
import type { ReplayReducerEvent } from '../replay/replay.js';

export const SOCIAL_COLLEGE_ADMIT_COMMAND = 'CORE_SOCIAL_COLLEGE_ADMIT_V1';
export const SOCIAL_COLLEGE_GRADUATE_COMMAND =
  'CORE_SOCIAL_COLLEGE_GRADUATE_V1';
export const SOCIAL_CLINIC_SERVE_COMMAND = 'CORE_SOCIAL_CLINIC_SERVE_V1';
export const SOCIAL_OFFICE_ACTION_EVENT = 'SOCIAL_OFFICE_ACTION_APPLIED_V1';
type Kind = 'ADMIT' | 'GRADUATE' | 'SERVE' | 'PLAN' | 'MATCH';
type JsonRecord = Readonly<Record<string, unknown>>;
export interface SocialOfficeMoneyV1 {
  readonly amount: string;
  readonly currency: string;
}
export interface SocialOfficeRationalV1 {
  readonly numerator: string;
  readonly denominator: string;
}
export interface SocialOfficeResourceV1 {
  readonly resourceId: string;
  readonly canonicalPhysicalResourceId: string;
  readonly canonicalOriginId: string;
  readonly originalSourceRecordId: string;
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly windowId: string;
  readonly dayIndex: string;
  readonly startSimTime: string;
  readonly endSimTime: string;
  readonly unit: 'staff_minute' | 'facility_minute';
  readonly capacity: string;
  readonly eligibilityRuleVersion: string;
  readonly positionId: string | null;
  readonly qualification: string;
  readonly assignedPeople: string;
}
export interface SocialOfficeResourceWindowV1 {
  readonly allocation: SocialOfficeResourceV1;
  readonly used: string;
  readonly reservations: readonly {
    readonly reservationId: string;
    readonly amount: string;
  }[];
}
export interface SocialOfficeRecipeV1 {
  readonly resourceId: string;
  readonly amountPerUnit: string;
}
export interface SocialOfficeFinancialLegRuleV1 {
  readonly account: FinancialAccount;
  readonly direction: FinancialPostingDirection;
  readonly amountPerUnit: SocialOfficeMoneyV1;
  readonly counterpartyAccountId: string | null;
}
export interface SocialOfficeCostRuleV1 {
  readonly mode:
    | 'BUDGET_VALUATION_ONLY'
    | 'ACCRUED_COST_WITH_ACTUAL_BATCH'
    | 'PAID_COST_WITH_ACTUAL_BATCH';
  readonly budgetId: string;
  readonly budgetPerUnit: SocialOfficeMoneyV1;
  readonly financialLegs: readonly SocialOfficeFinancialLegRuleV1[];
  readonly recognitionRuleVersion: string;
}
export interface SocialOfficeProgrammeRuleV1 {
  readonly programmeId: string;
  readonly ruleVersion: string;
  readonly ruleSourceRecordId: string;
  readonly level: 'VOCATIONAL' | 'HIGHER';
  readonly specialisationId: string;
  readonly sourceSkill: LabourSkill;
  readonly targetSkill: LabourSkill;
  readonly eligibleStatus: 'STUDENT';
  readonly requiredDurationSimDays: string;
  readonly seats: string;
  readonly studentsPerQualifiedTeacher: string;
  readonly teacherPositionId: string;
  readonly teacherQualification: string;
  readonly teachingMinutesPerStudentPerSimDay: string;
  readonly teachingResourceIds: readonly string[];
  readonly admissionRecipe: readonly SocialOfficeRecipeV1[];
  readonly assessmentRecipe: readonly SocialOfficeRecipeV1[];
  readonly dropoutRate: SocialOfficeRationalV1;
  readonly completionRate: SocialOfficeRationalV1;
  readonly integerPolicy:
    'EXACT_OR_REJECT' | 'FLOOR_WHOLE_PEOPLE_RETAIN_REMAINDER';
  readonly nonGraduateDisposition: 'RETAIN_STUDENT_AND_SEAT';
  readonly admissionCost: SocialOfficeCostRuleV1;
  readonly graduationCost: SocialOfficeCostRuleV1;
}
export interface SocialOfficeCohortV1 {
  readonly cohortId: string;
  readonly programmeId: string;
  readonly programmeRuleVersion: string;
  readonly anchorDayIndex: string;
  readonly elapsedSimDaysAtAnchor: string;
  readonly requiredDurationSimDays: string;
  readonly alreadyCompletedTeachingMinutes: string;
  readonly futureTeachingReservations: readonly {
    readonly resourceId: string;
    readonly dayIndex: string;
    readonly amount: string;
  }[];
  readonly originalEnrolled: string;
  readonly graduates: string;
  readonly memberIds: readonly string[];
  readonly state: 'OPEN' | 'GRADUATION_PROCESSED';
}
export interface SocialOfficeClinicRuleV1 {
  readonly clinicId: string;
  readonly ruleVersion: string;
  readonly ruleSourceRecordId: string;
  readonly careType: 'PRIMARY';
  readonly staffRecipe: readonly SocialOfficeRecipeV1[];
  readonly facilityRecipe: readonly SocialOfficeRecipeV1[];
  readonly medicineAccount: InventoryAccount;
  readonly medicineSourceRecordId: string;
  readonly dosesPerCase: string;
  readonly cost: SocialOfficeCostRuleV1;
  readonly demandAdmissionPolicy: 'ONCE_PER_ORIGINAL_DEMAND';
  readonly serviceOrderingPolicy: 'BACKLOG_THEN_SOURCE_ORDER';
  readonly attemptAccountingMode: 'SIMULATED_ATOMIC_COMPLETED_SERVICE_V1';
}
export interface SocialOfficeReadFactsV1 {
  readonly schemaVersion: 'social-office-read-facts-v1';
  readonly sourceBinding: {
    readonly sourceClass: 'SIMULATED_OPENING';
    readonly sourceAdmitted: false;
    readonly sourceGeneration: string;
    readonly manifestHash: CanonicalSha256;
    readonly selectedRecordIds: readonly string[];
    readonly worldId: string;
    readonly countryId: string;
    readonly locationId: string;
    /** null is opening validation data only; prepare requires its exact action kind. */
    readonly purpose: Kind | null;
  };
  readonly simTime: string;
  readonly dayBoundary: E01DailyBoundary;
  readonly populationAvailability: readonly LabourPopulationAvailability[];
  readonly employmentReadFacts: SocialEmploymentReadFacts | null;
  readonly programmeRules: readonly SocialOfficeProgrammeRuleV1[];
  readonly applicantPools: readonly {
    readonly applicantPoolId: string;
    readonly programmeId: string;
    readonly sourceSkill: LabourSkill;
    readonly eligibleStatus: 'STUDENT';
    readonly memberIds: readonly string[];
    readonly sourceRecordId: string;
  }[];
  readonly clinicRules: readonly SocialOfficeClinicRuleV1[];
  readonly demandWindows: readonly {
    readonly clinicId: string;
    readonly careWindowId: string;
    readonly demandId: string;
    readonly canonicalOriginId: string;
    readonly dayIndex: string;
    readonly newCases: string;
    readonly sourceRecordId: string;
  }[];
  readonly resourceAllocations: readonly SocialOfficeResourceV1[];
  readonly approvedBudgets: readonly {
    readonly budgetId: string;
    readonly approvedAmount: SocialOfficeMoneyV1;
    readonly sourceRecordId: string;
  }[];
  readonly employmentRecipes: readonly {
    readonly servicePoolId: string;
    readonly ruleVersion: string;
    readonly perPlannedSlot: readonly SocialOfficeRecipeV1[];
  }[];
}
export interface SocialOfficeOutcomeV1 {
  readonly kind: Kind;
  readonly objectId: string;
  readonly units: string;
  readonly resourceEffects: readonly {
    readonly resourceId: string;
    readonly beforeUsed: string;
    readonly beforeReserved: string;
    readonly consumed: string;
    readonly reserved: string;
    readonly released: string;
    readonly afterUsed: string;
    readonly afterReserved: string;
  }[];
  readonly budgetEffect: {
    readonly budgetId: string;
    readonly amount: SocialOfficeMoneyV1;
  } | null;
  readonly inventoryRequirement: {
    readonly account: InventoryAccount;
    readonly quantity: string;
    readonly unit: 'medical_dose';
  } | null;
  readonly financialRequirement: {
    readonly mode: SocialOfficeCostRuleV1['mode'];
    readonly recognitionRuleVersion: string;
    readonly legs: readonly {
      readonly account: FinancialAccount;
      readonly direction: FinancialPostingDirection;
      readonly amount: SocialOfficeMoneyV1;
      readonly counterpartyAccountId: string | null;
    }[];
  } | null;
  readonly employment: SocialEmploymentOutcome | null;
  readonly calculation: unknown;
  readonly directProductivityEffect: null;
  readonly directHealthEffect: null;
}
export interface SocialOfficeStateV1 {
  readonly schemaVersion: 'social-office-state-v1';
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly employment: SocialEmploymentServiceState;
  readonly programmes: readonly SocialOfficeProgrammeRuleV1[];
  readonly cohorts: readonly SocialOfficeCohortV1[];
  readonly applicantAssignments: readonly string[];
  readonly clinic: {
    readonly clinicId: string;
    readonly backlog: string;
    readonly admittedDemandOrigins: readonly string[];
  };
  readonly resourceWindows: readonly SocialOfficeResourceWindowV1[];
  readonly budgetCommitments: readonly {
    readonly budgetId: string;
    readonly approvedAmount: SocialOfficeMoneyV1;
    readonly committedAmount: SocialOfficeMoneyV1;
  }[];
  readonly appliedOperations: readonly {
    readonly commandId: string;
    readonly fingerprint: CanonicalSha256;
    readonly canonicalPayload: string;
    readonly result: SocialOfficeOutcomeV1;
  }[];
}
export type SocialOfficeActionIntentV1 =
  | {
      readonly kind: 'ADMIT';
      readonly programmeId: string;
      readonly programmeRuleVersion: string;
      readonly cohortId: string;
      readonly applicantPoolId: string;
    }
  | {
      readonly kind: 'GRADUATE';
      readonly cohortId: string;
      readonly programmeRuleVersion: string;
    }
  | {
      readonly kind: 'SERVE';
      readonly clinicId: string;
      readonly careWindowId: string;
      readonly clinicRuleVersion: string;
    };
export interface SocialOfficePreparationInputV1 {
  readonly command: CanonicalCommand;
  readonly state: SocialOfficeStateV1;
  readonly readFacts: SocialOfficeReadFactsV1;
  readonly inventoryBefore: InventoryLedgerState;
  readonly financialBefore: FinancialLedgerState;
  readonly sha256Hex: Sha256Hex;
}
export type SocialOfficePreparedOperationV1 = {
  readonly source: 'PREPARED_NOT_COMMITTED' | 'EXACT_DUPLICATE';
  readonly state: SocialOfficeStateV1;
  readonly outcome: SocialOfficeOutcomeV1;
  readonly eventPayload: JsonRecord | null;
};

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.INVALID_IDENTITY_FACTS,
    `SOC-OFFICE: ${message}`,
  );
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v.length || v.length > 256)
    invalid('Explicit bounded text required');
  return v;
}
function uint(v: unknown, positive = false): string {
  const s = text(v);
  if (!(positive ? /^[1-9]\d*$/u : /^(?:0|[1-9]\d*)$/u).test(s))
    invalid('Canonical exact integer required');
  return s;
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('Record required');
  return v as Record<string, unknown>;
}
function keys(v: unknown, fields: readonly string[]): void {
  if (
    canonicalSerialize(Object.keys(record(v)).sort()) !==
    canonicalSerialize([...fields].sort())
  )
    invalid('Missing or unknown fields');
}
function list(v: unknown): readonly unknown[] {
  if (!Array.isArray(v)) invalid('Explicit array required');
  return v;
}
function unique(v: readonly string[]): void {
  for (const x of v) idempotencyKey(text(x));
  if (new Set(v).size !== v.length) invalid('Repeated identity');
}
function frozen<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) frozen(x);
    Object.freeze(v);
  }
  return v;
}
function copy<T>(v: T): T {
  return JSON.parse(canonicalSerialize(v)) as T;
}
const hash = (v: unknown, digest: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(v), digest);
const total = (v: readonly string[]) => v.reduce((n, s) => n + BigInt(s), 0n);
const minimum = (v: readonly bigint[]) => {
  if (!v.length) invalid('Capacity recipe required');
  return v.reduce((a, b) => (a < b ? a : b));
};
function money(v: SocialOfficeMoneyV1, positive = false): Money {
  keys(v, ['amount', 'currency']);
  const m = Money.from(text(v.amount), text(v.currency));
  if (
    m.amount.isNegative() ||
    (positive && !m.amount.greaterThan('0')) ||
    canonicalSerialize(m.toCanonicalValue()) !== canonicalSerialize(v)
  )
    invalid('Canonical nonnegative Money required');
  return m;
}
function times(v: SocialOfficeMoneyV1, n: string): SocialOfficeMoneyV1 {
  const m = money(v);
  return Money.from(
    canonicalDecimal(assertWorldDecimalResult(m.amount.times(uint(n)))),
    m.currency,
  ).toCanonicalValue();
}
function rational(v: SocialOfficeRationalV1): void {
  keys(v, ['numerator', 'denominator']);
  if (BigInt(uint(v.numerator)) > BigInt(uint(v.denominator, true)))
    invalid('Rate must be in [0,1]');
}
function recipe(v: readonly SocialOfficeRecipeV1[]): void {
  unique(v.map((x) => x.resourceId));
  for (const x of v) {
    keys(x, ['resourceId', 'amountPerUnit']);
    uint(x.amountPerUnit, true);
  }
}
function cost(v: SocialOfficeCostRuleV1): void {
  keys(v, [
    'mode',
    'budgetId',
    'budgetPerUnit',
    'financialLegs',
    'recognitionRuleVersion',
  ]);
  if (
    ![
      'BUDGET_VALUATION_ONLY',
      'ACCRUED_COST_WITH_ACTUAL_BATCH',
      'PAID_COST_WITH_ACTUAL_BATCH',
    ].includes(v.mode)
  )
    invalid('Explicit cost mode required');
  idempotencyKey(text(v.budgetId));
  text(v.recognitionRuleVersion);
  money(v.budgetPerUnit);
  list(v.financialLegs);
  for (const l of v.financialLegs) {
    keys(l, ['account', 'direction', 'amountPerUnit', 'counterpartyAccountId']);
    keys(l.account, [
      'worldId',
      'accountId',
      'ownerId',
      'countryId',
      'accountClass',
      'currency',
      'claimId',
      'counterpartyEntityId',
    ]);
    createFinancialAccount(l.account);
    money(l.amountPerUnit, true);
    if (
      !['DEBIT', 'CREDIT'].includes(l.direction) ||
      l.account.currency !== l.amountPerUnit.currency ||
      l.amountPerUnit.currency !== v.budgetPerUnit.currency
    )
      invalid('Financial recipe currency/direction mismatch');
    if (l.counterpartyAccountId !== null)
      idempotencyKey(text(l.counterpartyAccountId));
  }
  if (
    v.mode === 'BUDGET_VALUATION_ONLY'
      ? v.financialLegs.length !== 0
      : money(v.budgetPerUnit).amount.greaterThan('0') &&
        !v.financialLegs.some(
          (l) =>
            l.account.accountClass === 'EXPENSE' && l.direction === 'DEBIT',
        )
  )
    invalid('Cost mode lacks its explicit expense basis');
}
function programme(v: SocialOfficeProgrammeRuleV1): void {
  keys(v, [
    'programmeId',
    'ruleVersion',
    'ruleSourceRecordId',
    'level',
    'specialisationId',
    'sourceSkill',
    'targetSkill',
    'eligibleStatus',
    'requiredDurationSimDays',
    'seats',
    'studentsPerQualifiedTeacher',
    'teacherPositionId',
    'teacherQualification',
    'teachingMinutesPerStudentPerSimDay',
    'teachingResourceIds',
    'admissionRecipe',
    'assessmentRecipe',
    'dropoutRate',
    'completionRate',
    'integerPolicy',
    'nonGraduateDisposition',
    'admissionCost',
    'graduationCost',
  ]);
  for (const s of [
    v.programmeId,
    v.ruleVersion,
    v.ruleSourceRecordId,
    v.specialisationId,
    v.teacherPositionId,
    v.teacherQualification,
  ])
    idempotencyKey(text(s));
  if (
    !(
      (v.level === 'VOCATIONAL' &&
        v.sourceSkill === 'LOW' &&
        v.targetSkill === 'MEDIUM') ||
      (v.level === 'HIGHER' &&
        v.sourceSkill === 'MEDIUM' &&
        v.targetSkill === 'HIGH')
    ) ||
    v.eligibleStatus !== 'STUDENT'
  )
    invalid('Only adjacent upward existing-STUDENT programme supported');
  uint(v.requiredDurationSimDays, true);
  uint(v.seats);
  uint(v.studentsPerQualifiedTeacher, true);
  uint(v.teachingMinutesPerStudentPerSimDay, true);
  unique(v.teachingResourceIds);
  recipe(v.admissionRecipe);
  recipe(v.assessmentRecipe);
  rational(v.dropoutRate);
  rational(v.completionRate);
  if (
    v.dropoutRate.numerator !== '0' ||
    v.nonGraduateDisposition !== 'RETAIN_STUDENT_AND_SEAT' ||
    !['EXACT_OR_REJECT', 'FLOOR_WHOLE_PEOPLE_RETAIN_REMAINDER'].includes(
      v.integerPolicy,
    )
  )
    invalid('Unsupported dropout/disposition/integer policy');
  cost(v.admissionCost);
  cost(v.graduationCost);
}

export function parseSocialOfficeActionIntent(
  command: CanonicalCommand,
  digest: Sha256Hex,
): SocialOfficeActionIntentV1 {
  validateCanonicalCommand(command, digest);
  if (command.officeId !== 'SOCIAL' || command.expectedWorldVersion === null)
    invalid('Current Social Office command/version required');
  const p = record(JSON.parse(command.canonicalPayload) as unknown);
  if (command.commandType === SOCIAL_COLLEGE_ADMIT_COMMAND) {
    keys(p, [
      'schemaVersion',
      'programmeId',
      'programmeRuleVersion',
      'cohortId',
      'applicantPoolId',
    ]);
    if (p.schemaVersion !== 'social-college-admit-v1')
      invalid('Wrong admission schema');
    return frozen({
      kind: 'ADMIT',
      programmeId: idempotencyKey(text(p.programmeId)),
      programmeRuleVersion: idempotencyKey(text(p.programmeRuleVersion)),
      cohortId: idempotencyKey(text(p.cohortId)),
      applicantPoolId: idempotencyKey(text(p.applicantPoolId)),
    });
  }
  if (command.commandType === SOCIAL_COLLEGE_GRADUATE_COMMAND) {
    keys(p, ['schemaVersion', 'cohortId', 'programmeRuleVersion']);
    if (p.schemaVersion !== 'social-college-graduate-v1')
      invalid('Wrong graduate schema');
    return frozen({
      kind: 'GRADUATE',
      cohortId: idempotencyKey(text(p.cohortId)),
      programmeRuleVersion: idempotencyKey(text(p.programmeRuleVersion)),
    });
  }
  if (command.commandType === SOCIAL_CLINIC_SERVE_COMMAND) {
    keys(p, ['schemaVersion', 'clinicId', 'careWindowId', 'clinicRuleVersion']);
    if (p.schemaVersion !== 'social-clinic-serve-v1')
      invalid('Wrong care schema');
    return frozen({
      kind: 'SERVE',
      clinicId: idempotencyKey(text(p.clinicId)),
      careWindowId: idempotencyKey(text(p.careWindowId)),
      clinicRuleVersion: idempotencyKey(text(p.clinicRuleVersion)),
    });
  }
  return invalid('Unsupported Social action');
}

function resource(v: SocialOfficeResourceV1): void {
  keys(v, [
    'resourceId',
    'canonicalPhysicalResourceId',
    'canonicalOriginId',
    'originalSourceRecordId',
    'worldId',
    'countryId',
    'locationId',
    'windowId',
    'dayIndex',
    'startSimTime',
    'endSimTime',
    'unit',
    'capacity',
    'eligibilityRuleVersion',
    'positionId',
    'qualification',
    'assignedPeople',
  ]);
  for (const s of [
    v.resourceId,
    v.canonicalPhysicalResourceId,
    v.canonicalOriginId,
    v.originalSourceRecordId,
    v.locationId,
    v.windowId,
    v.eligibilityRuleVersion,
    v.qualification,
  ])
    idempotencyKey(text(s));
  worldId(text(v.worldId));
  countryId(text(v.countryId));
  uint(v.dayIndex);
  uint(v.capacity);
  uint(v.assignedPeople);
  if (
    BigInt(uint(v.startSimTime)) >= BigInt(uint(v.endSimTime, true)) ||
    !['staff_minute', 'facility_minute'].includes(v.unit)
  )
    invalid('Invalid resource interval/unit');
  if (v.unit === 'staff_minute') {
    if (v.positionId === null) invalid('Staff needs original position');
    idempotencyKey(text(v.positionId));
  } else if (v.positionId !== null || v.assignedPeople !== '0')
    invalid('Facility is not staff');
}
function clinicRule(v: SocialOfficeClinicRuleV1): void {
  keys(v, [
    'clinicId',
    'ruleVersion',
    'ruleSourceRecordId',
    'careType',
    'staffRecipe',
    'facilityRecipe',
    'medicineAccount',
    'medicineSourceRecordId',
    'dosesPerCase',
    'cost',
    'demandAdmissionPolicy',
    'serviceOrderingPolicy',
    'attemptAccountingMode',
  ]);
  for (const s of [
    v.clinicId,
    v.ruleVersion,
    v.ruleSourceRecordId,
    v.medicineSourceRecordId,
  ])
    idempotencyKey(text(s));
  if (
    v.careType !== 'PRIMARY' ||
    v.demandAdmissionPolicy !== 'ONCE_PER_ORIGINAL_DEMAND' ||
    v.serviceOrderingPolicy !== 'BACKLOG_THEN_SOURCE_ORDER' ||
    v.attemptAccountingMode !== 'SIMULATED_ATOMIC_COMPLETED_SERVICE_V1'
  )
    invalid('Unsupported clinic policy');
  recipe(v.staffRecipe);
  recipe(v.facilityRecipe);
  if (!v.staffRecipe.length || !v.facilityRecipe.length)
    invalid('Actual staff/facility recipe required');
  keys(v.medicineAccount, [
    'worldId',
    'countryId',
    'commodityId',
    'batchId',
    'unit',
    'physicalLocationId',
    'bucket',
    'reservationId',
    'shipmentId',
    'titleHolderId',
    'riskBearerId',
    'economicRecognitionId',
  ]);
  const a = createInventoryAccount(v.medicineAccount);
  if (
    a.unit !== 'medical_dose' ||
    a.bucket !== 'AVAILABLE' ||
    a.reservationId !== null ||
    a.shipmentId !== null
  )
    invalid('Actual AVAILABLE medicine account required');
  uint(v.dosesPerCase, true);
  cost(v.cost);
}
function readFacts(v: SocialOfficeReadFactsV1): SocialOfficeReadFactsV1 {
  const f = copy(v);
  keys(f, [
    'schemaVersion',
    'sourceBinding',
    'simTime',
    'dayBoundary',
    'populationAvailability',
    'employmentReadFacts',
    'programmeRules',
    'applicantPools',
    'clinicRules',
    'demandWindows',
    'resourceAllocations',
    'approvedBudgets',
    'employmentRecipes',
  ]);
  if (f.schemaVersion !== 'social-office-read-facts-v1')
    invalid('Wrong read schema');
  const b = f.sourceBinding;
  keys(b, [
    'sourceClass',
    'sourceAdmitted',
    'sourceGeneration',
    'manifestHash',
    'selectedRecordIds',
    'worldId',
    'countryId',
    'locationId',
    'purpose',
  ]);
  if (
    b.sourceClass !== 'SIMULATED_OPENING' ||
    b.sourceAdmitted !== false ||
    (b.purpose !== null &&
      !['ADMIT', 'GRADUATE', 'SERVE', 'PLAN', 'MATCH'].includes(b.purpose)) ||
    !/^sha256:[0-9a-f]{64}$/u.test(b.manifestHash)
  )
    invalid('Explicit isolated source/purpose required');
  worldId(text(b.worldId));
  countryId(text(b.countryId));
  idempotencyKey(text(b.locationId));
  uint(b.sourceGeneration);
  unique(b.selectedRecordIds);
  uint(f.simTime);
  keys(f.dayBoundary, ['kind', 'dayIndex']);
  if (f.dayBoundary.kind !== 'E01_DAILY_BOUNDARY')
    invalid('Existing E01 boundary required');
  createE01DailyBoundary(uint(f.dayBoundary.dayIndex));
  list(f.populationAvailability);
  for (const p of f.populationAvailability) {
    keys(p, ['countryId', 'locationId', 'workingAgeAvailable']);
    countryId(text(p.countryId));
    idempotencyKey(text(p.locationId));
    uint(p.workingAgeAvailable);
  }
  for (const a of [
    f.programmeRules,
    f.applicantPools,
    f.clinicRules,
    f.demandWindows,
    f.resourceAllocations,
    f.approvedBudgets,
    f.employmentRecipes,
  ])
    list(a);
  unique(f.programmeRules.map((p) => p.programmeId));
  unique(f.clinicRules.map((c) => c.clinicId));
  unique(f.resourceAllocations.map((r) => r.resourceId));
  unique(f.approvedBudgets.map((b) => b.budgetId));
  for (const p of f.programmeRules) programme(p);
  for (const c of f.clinicRules) clinicRule(c);
  for (const r of f.resourceAllocations) resource(r);
  unique(f.applicantPools.map((p) => p.applicantPoolId));
  for (const p of f.applicantPools) {
    keys(p, [
      'applicantPoolId',
      'programmeId',
      'sourceSkill',
      'eligibleStatus',
      'memberIds',
      'sourceRecordId',
    ]);
    idempotencyKey(text(p.programmeId));
    idempotencyKey(text(p.sourceRecordId));
    unique(p.memberIds);
    if (
      !['LOW', 'MEDIUM', 'HIGH'].includes(p.sourceSkill) ||
      p.eligibleStatus !== 'STUDENT'
    )
      invalid('Only existing STUDENT applicant supported');
  }
  unique(f.demandWindows.map((d) => d.demandId));
  for (const d of f.demandWindows) {
    keys(d, [
      'clinicId',
      'careWindowId',
      'demandId',
      'canonicalOriginId',
      'dayIndex',
      'newCases',
      'sourceRecordId',
    ]);
    for (const s of [
      d.clinicId,
      d.careWindowId,
      d.canonicalOriginId,
      d.sourceRecordId,
    ])
      idempotencyKey(text(s));
    uint(d.dayIndex);
    uint(d.newCases);
  }
  for (const a of f.approvedBudgets) {
    keys(a, ['budgetId', 'approvedAmount', 'sourceRecordId']);
    money(a.approvedAmount);
    idempotencyKey(text(a.sourceRecordId));
  }
  unique(f.employmentRecipes.map((r) => r.servicePoolId));
  for (const r of f.employmentRecipes) {
    keys(r, ['servicePoolId', 'ruleVersion', 'perPlannedSlot']);
    text(r.ruleVersion);
    recipe(r.perPlannedSlot);
    if (!r.perPlannedSlot.length)
      invalid('Physical employment recipe required');
  }
  const selected = new Set(b.selectedRecordIds);
  for (const ref of [
    ...f.programmeRules.map((p) => p.ruleSourceRecordId),
    ...f.applicantPools.map((p) => p.sourceRecordId),
    ...f.clinicRules.flatMap((c) => [
      c.ruleSourceRecordId,
      c.medicineSourceRecordId,
    ]),
    ...f.demandWindows.map((d) => d.sourceRecordId),
    ...f.resourceAllocations.map((r) => r.originalSourceRecordId),
    ...f.approvedBudgets.map((a) => a.sourceRecordId),
  ])
    if (!selected.has(ref))
      invalid('Selected source manifest omits an input record');
  return frozen(f);
}
const reserved = (w: SocialOfficeResourceWindowV1) =>
  total(w.reservations.map((r) => r.amount));
function physicalKey(a: SocialOfficeResourceV1): string {
  return canonicalSerialize([
    a.worldId,
    a.countryId,
    a.canonicalPhysicalResourceId,
    a.windowId,
    a.unit,
  ]);
}
function compatibleResource(
  a: SocialOfficeResourceV1,
  b: SocialOfficeResourceV1,
): void {
  if (a.worldId !== b.worldId || a.countryId !== b.countryId) return;
  const samePhysical =
      a.canonicalPhysicalResourceId === b.canonicalPhysicalResourceId,
    sameOrigin = a.canonicalOriginId === b.canonicalOriginId;
  if (sameOrigin && !samePhysical)
    invalid('Physical source origin cannot acquire an alias allowance');
  if (!samePhysical) return;
  if (!sameOrigin || a.unit !== b.unit || a.locationId !== b.locationId)
    invalid('Physical identity cannot change origin/unit/location');
  if (
    BigInt(a.startSimTime) < BigInt(b.endSimTime) &&
    BigInt(b.startSimTime) < BigInt(a.endSimTime)
  )
    invalid('Physical allocation windows overlap or duplicate');
}
export function validateSocialOfficeState(
  input: SocialOfficeStateV1,
  facts: SocialOfficeReadFactsV1,
  digest: Sha256Hex,
): SocialOfficeStateV1 {
  const s = copy(input),
    f = readFacts(facts);
  keys(s, [
    'schemaVersion',
    'worldId',
    'countryId',
    'locationId',
    'employment',
    'programmes',
    'cohorts',
    'applicantAssignments',
    'clinic',
    'resourceWindows',
    'budgetCommitments',
    'appliedOperations',
  ]);
  if (
    s.schemaVersion !== 'social-office-state-v1' ||
    s.worldId !== f.sourceBinding.worldId ||
    s.countryId !== f.sourceBinding.countryId ||
    s.locationId !== f.sourceBinding.locationId ||
    s.employment.worldId !== s.worldId
  )
    invalid('Mixed single-office scope');
  const labour = applyLabourFacts({
    state: s.employment.labour,
    boundary: f.dayBoundary,
    populationAvailability: f.populationAvailability,
    facts: [],
  }).state;
  if (canonicalSerialize(labour) !== canonicalSerialize(s.employment.labour))
    invalid('Labour state must be canonical');
  if (f.employmentReadFacts !== null)
    validateSocialEmploymentServiceState(
      s.employment,
      f.employmentReadFacts,
      digest,
    );
  unique(s.programmes.map((p) => p.programmeId));
  for (const p of s.programmes) programme(p);
  unique(s.cohorts.map((c) => c.cohortId));
  unique(s.applicantAssignments);
  const members: string[] = [];
  for (const c of s.cohorts) {
    keys(c, [
      'cohortId',
      'programmeId',
      'programmeRuleVersion',
      'anchorDayIndex',
      'elapsedSimDaysAtAnchor',
      'requiredDurationSimDays',
      'alreadyCompletedTeachingMinutes',
      'futureTeachingReservations',
      'originalEnrolled',
      'graduates',
      'memberIds',
      'state',
    ]);
    const p = s.programmes.find(
      (p) =>
        p.programmeId === c.programmeId &&
        p.ruleVersion === c.programmeRuleVersion,
    );
    if (!p) invalid('Cohort original programme missing');
    uint(c.anchorDayIndex);
    uint(c.elapsedSimDaysAtAnchor);
    uint(c.originalEnrolled);
    uint(c.graduates);
    uint(c.requiredDurationSimDays, true);
    uint(c.alreadyCompletedTeachingMinutes);
    if (
      c.requiredDurationSimDays !== p.requiredDurationSimDays ||
      BigInt(c.alreadyCompletedTeachingMinutes) !==
        BigInt(c.originalEnrolled) *
          BigInt(p.teachingMinutesPerStudentPerSimDay) *
          BigInt(c.elapsedSimDaysAtAnchor)
    )
      invalid('Original course duration/completed teaching differs');
    unique(c.futureTeachingReservations.map((r) => r.resourceId));
    const remainingDays =
      BigInt(p.requiredDurationSimDays) - BigInt(c.elapsedSimDaysAtAnchor);
    if (
      BigInt(c.futureTeachingReservations.length) !== remainingDays &&
      c.originalEnrolled !== '0'
    )
      invalid('Complete original instructional reservation vector required');
    for (let n = 0; n < c.futureTeachingReservations.length; n++) {
      const r = c.futureTeachingReservations[n]!;
      keys(r, ['resourceId', 'dayIndex', 'amount']);
      uint(r.dayIndex);
      uint(r.amount, true);
      const w = s.resourceWindows.find(
        (w) => w.allocation.resourceId === r.resourceId,
      );
      if (
        !w ||
        r.dayIndex !== (BigInt(c.anchorDayIndex) + BigInt(n)).toString() ||
        w.allocation.dayIndex !== r.dayIndex ||
        !p.teachingResourceIds.includes(r.resourceId) ||
        w.allocation.positionId !== p.teacherPositionId ||
        w.allocation.qualification !== p.teacherQualification ||
        BigInt(r.amount) !==
          BigInt(c.originalEnrolled) *
            BigInt(p.teachingMinutesPerStudentPerSimDay)
      )
        invalid('Original course instructional window differs');
      const held = w.reservations.find((x) => x.reservationId === c.cohortId);
      if (
        c.state === 'OPEN'
          ? !held || held.amount !== r.amount
          : held !== undefined
      )
        invalid('Cohort original instructional reservation absent/reused');
    }
    unique(c.memberIds);
    members.push(...c.memberIds);
    if (
      BigInt(c.originalEnrolled) !== BigInt(c.memberIds.length) ||
      BigInt(c.graduates) > BigInt(c.originalEnrolled) ||
      !['OPEN', 'GRADUATION_PROCESSED'].includes(c.state) ||
      (c.state === 'OPEN' && c.graduates !== '0') ||
      BigInt(c.elapsedSimDaysAtAnchor) > BigInt(p.requiredDurationSimDays)
    )
      invalid('Invalid original cohort/members');
  }
  unique(members);
  if (
    s.applicantAssignments.some((id) => !members.includes(id)) ||
    members.some((id) => !s.applicantAssignments.includes(id))
  )
    invalid('Cohort assignments do not reconcile');
  for (const skill of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    const held = s.cohorts
      .filter(
        (c) =>
          s.programmes.find((p) => p.programmeId === c.programmeId)!
            .sourceSkill === skill,
      )
      .reduce(
        (n, c) => n + BigInt(c.originalEnrolled) - BigInt(c.graduates),
        0n,
      );
    const actual = total(
      labour.aggregates
        .filter(
          (a) =>
            a.countryId === s.countryId &&
            a.locationId === s.locationId &&
            a.skill === skill &&
            a.status === 'STUDENT',
        )
        .map((a) => a.count),
    );
    if (held > actual)
      invalid('Cohort holdings exceed sole E03 source STUDENT count');
  }
  keys(s.clinic, ['clinicId', 'backlog', 'admittedDemandOrigins']);
  idempotencyKey(text(s.clinic.clinicId));
  uint(s.clinic.backlog);
  unique(s.clinic.admittedDemandOrigins);
  unique(s.resourceWindows.map((w) => w.allocation.resourceId));
  for (let i = 0; i < s.resourceWindows.length; i++) {
    const w = s.resourceWindows[i]!;
    keys(w, ['allocation', 'used', 'reservations']);
    resource(w.allocation);
    uint(w.used);
    unique(w.reservations.map((r) => r.reservationId));
    for (const r of w.reservations) {
      keys(r, ['reservationId', 'amount']);
      uint(r.amount, true);
    }
    if (
      w.allocation.worldId !== s.worldId ||
      w.allocation.countryId !== s.countryId ||
      w.allocation.locationId !== s.locationId ||
      BigInt(w.used) + reserved(w) > BigInt(w.allocation.capacity)
    )
      invalid('Resource scope/capacity exceeded');
    for (let j = 0; j < i; j++)
      compatibleResource(w.allocation, s.resourceWindows[j]!.allocation);
  }
  unique(s.budgetCommitments.map((b) => b.budgetId));
  for (const b of s.budgetCommitments) {
    keys(b, ['budgetId', 'approvedAmount', 'committedAmount']);
    money(b.approvedAmount);
    money(b.committedAmount);
    if (
      b.approvedAmount.currency !== b.committedAmount.currency ||
      money(b.committedAmount).amount.greaterThan(
        money(b.approvedAmount).amount,
      )
    )
      invalid('Budget overcommitted');
  }
  unique(s.appliedOperations.map((o) => o.commandId));
  for (const o of s.appliedOperations) {
    keys(o, ['commandId', 'fingerprint', 'canonicalPayload', 'result']);
    if (
      !/^sha256:[0-9a-f]{64}$/u.test(o.fingerprint) ||
      typeof o.canonicalPayload !== 'string'
    )
      invalid('Invalid operation binding');
  }
  return frozen(s);
}

function admitSources(
  s: SocialOfficeStateV1,
  f: SocialOfficeReadFactsV1,
): SocialOfficeStateV1 {
  const resources = [...s.resourceWindows],
    budgets = [...s.budgetCommitments];
  for (const a of f.resourceAllocations) {
    if (
      a.worldId !== s.worldId ||
      a.countryId !== s.countryId ||
      a.locationId !== s.locationId
    )
      invalid('Resource source outside office scope');
    const old = resources.find((w) => w.allocation.resourceId === a.resourceId);
    if (old) {
      if (canonicalSerialize(old.allocation) !== canonicalSerialize(a))
        invalid('Resource original changed or refilled');
      continue;
    }
    for (const w of resources) {
      if (physicalKey(a) === physicalKey(w.allocation))
        invalid('Physical window already has an identity');
      compatibleResource(a, w.allocation);
    }
    resources.push({ allocation: a, used: '0', reservations: [] });
  }
  for (const a of f.approvedBudgets) {
    const old = budgets.find((b) => b.budgetId === a.budgetId);
    if (old) {
      if (
        canonicalSerialize(old.approvedAmount) !==
        canonicalSerialize(a.approvedAmount)
      )
        invalid('Budget cannot be refreshed through a read');
    } else
      budgets.push({
        budgetId: a.budgetId,
        approvedAmount: a.approvedAmount,
        committedAmount: { amount: '0', currency: a.approvedAmount.currency },
      });
  }
  return { ...s, resourceWindows: resources, budgetCommitments: budgets };
}
function windowFor(
  s: SocialOfficeStateV1,
  f: SocialOfficeReadFactsV1,
  id: string,
): SocialOfficeResourceWindowV1 {
  const w = s.resourceWindows.find((w) => w.allocation.resourceId === id),
    current = f.resourceAllocations.find((r) => r.resourceId === id);
  if (
    !w ||
    !current ||
    canonicalSerialize(w.allocation) !== canonicalSerialize(current)
  )
    invalid('Original current-qualified resource absent');
  if (w.allocation.unit === 'staff_minute') {
    const a = w.allocation,
      p = s.employment.labour.positions.find(
        (p) =>
          p.positionId === a.positionId &&
          p.countryId === s.countryId &&
          p.locationId === s.locationId &&
          p.owner === 'PUBLIC_SERVICE',
      );
    if (
      !p ||
      BigInt(a.assignedPeople) > BigInt(p.employedCount) ||
      (a.capacity !== '0' && a.assignedPeople === '0')
    )
      invalid('Resource lacks actual filled public position');
    const sameDay = s.resourceWindows.filter(
      (x) =>
        x.allocation.positionId === a.positionId &&
        x.allocation.dayIndex === a.dayIndex &&
        x.allocation.unit === 'staff_minute',
    );
    if (
      total(sameDay.map((x) => x.allocation.assignedPeople)) >
      BigInt(p.employedCount)
    )
      invalid('Distinct staff resources exceed actual E03 filled headcount');
    const q = a.qualification;
    if (
      (['DOCTOR', 'TEACHER'].includes(q) && p.skill !== 'HIGH') ||
      (['NURSE', 'MEDICAL_TECHNICIAN'].includes(q) &&
        !['MEDIUM', 'HIGH'].includes(p.skill))
    )
      invalid('Original profession/skill mismatch');
  }
  return w;
}
function recipeResource(
  s: SocialOfficeStateV1,
  f: SocialOfficeReadFactsV1,
  id: string,
): string {
  if (s.resourceWindows.some((w) => w.allocation.resourceId === id)) return id;
  const windows = s.resourceWindows.filter(
    (w) =>
      w.allocation.canonicalPhysicalResourceId === id &&
      w.allocation.dayIndex === f.dayBoundary.dayIndex,
  );
  if (windows.length !== 1)
    invalid('Recipe physical resource lacks one current original window');
  return windows[0]!.allocation.resourceId;
}
function recipeCapacity(
  s: SocialOfficeStateV1,
  f: SocialOfficeReadFactsV1,
  r: readonly SocialOfficeRecipeV1[],
  unit?: SocialOfficeResourceV1['unit'],
): bigint {
  if (!r.length) return 0n;
  return minimum(
    r.map((x) => {
      const w = windowFor(s, f, recipeResource(s, f, x.resourceId)),
        a = w.allocation;
      if (
        (unit !== undefined && a.unit !== unit) ||
        BigInt(f.simTime) < BigInt(a.startSimTime) ||
        BigInt(f.simTime) >= BigInt(a.endSimTime)
      )
        invalid('Recipe outside its original resource window/unit');
      return (
        (BigInt(a.capacity) - BigInt(w.used) - reserved(w)) /
        BigInt(x.amountPerUnit)
      );
    }),
  );
}
function changeResources(
  s: SocialOfficeStateV1,
  f: SocialOfficeReadFactsV1,
  r: readonly SocialOfficeRecipeV1[],
  units: string,
  mode: 'USE' | 'RESERVE' | 'SPEND_RESERVATION',
  reservationId: string,
): {
  state: SocialOfficeStateV1;
  effects: SocialOfficeOutcomeV1['resourceEffects'];
} {
  const effects: SocialOfficeOutcomeV1['resourceEffects'][number][] = [],
    windows = [...s.resourceWindows];
  for (const x of r) {
    const id = recipeResource(
      { ...s, resourceWindows: windows },
      f,
      x.resourceId,
    );
    const original = windowFor({ ...s, resourceWindows: windows }, f, id),
      a = original.allocation;
    const amount = BigInt(x.amountPerUnit) * BigInt(uint(units)),
      held = reserved(original),
      used = BigInt(original.used);
    if (amount === 0n) continue;
    let nextUsed = used,
      nextReservations = [...original.reservations];
    if (mode === 'SPEND_RESERVATION') {
      const old = original.reservations.find(
        (v) => v.reservationId === reservationId,
      );
      if (!old || BigInt(old.amount) !== amount)
        invalid('Missing or changed original resource reservation');
      nextUsed += amount;
      nextReservations = nextReservations.filter(
        (v) => v.reservationId !== reservationId,
      );
    } else {
      if (
        mode === 'USE' &&
        (BigInt(f.simTime) < BigInt(a.startSimTime) ||
          BigInt(f.simTime) >= BigInt(a.endSimTime))
      )
        invalid('Consumption outside original window');
      if (used + held + amount > BigInt(a.capacity))
        invalid('Physical capacity exhausted');
      if (mode === 'USE') nextUsed += amount;
      else {
        if (nextReservations.some((v) => v.reservationId === reservationId))
          invalid('Resource already reserved');
        nextReservations.push({ reservationId, amount: amount.toString() });
      }
    }
    const next = {
      allocation: a,
      used: nextUsed.toString(),
      reservations: nextReservations,
    };
    windows[windows.findIndex((w) => w.allocation.resourceId === id)] = next;
    effects.push({
      resourceId: id,
      beforeUsed: used.toString(),
      beforeReserved: held.toString(),
      consumed: mode === 'RESERVE' ? '0' : amount.toString(),
      reserved: mode === 'RESERVE' ? amount.toString() : '0',
      released: mode === 'SPEND_RESERVATION' ? amount.toString() : '0',
      afterUsed: next.used,
      afterReserved: reserved(next).toString(),
    });
  }
  return { state: { ...s, resourceWindows: windows }, effects };
}
function budgetCapacity(
  s: SocialOfficeStateV1,
  c: SocialOfficeCostRuleV1,
): bigint {
  const b = s.budgetCommitments.find((b) => b.budgetId === c.budgetId);
  if (!b || b.approvedAmount.currency !== c.budgetPerUnit.currency)
    invalid('Original approved budget absent');
  const per = money(c.budgetPerUnit),
    remaining = money(b.approvedAmount).subtract(money(b.committedAmount));
  if (per.amount.isZero())
    invalid('Explicit positive budget unit cost required');
  const fraction = (amount: string) => {
    const [whole, part = ''] = amount.split('.');
    return { n: BigInt(`${whole}${part}`), d: 10n ** BigInt(part.length) };
  };
  const a = fraction(remaining.toCanonicalValue().amount),
    p = fraction(per.toCanonicalValue().amount);
  return (a.n * p.d) / (a.d * p.n);
}
function commitCost(
  s: SocialOfficeStateV1,
  c: SocialOfficeCostRuleV1,
  n: string,
): {
  state: SocialOfficeStateV1;
  budget: SocialOfficeOutcomeV1['budgetEffect'];
  financial: SocialOfficeOutcomeV1['financialRequirement'];
} {
  const amount = times(c.budgetPerUnit, n),
    b = s.budgetCommitments.find((b) => b.budgetId === c.budgetId);
  if (!b || b.approvedAmount.currency !== amount.currency)
    invalid('Approved budget missing');
  const next = money(b.committedAmount).add(money(amount));
  if (next.amount.greaterThan(money(b.approvedAmount).amount))
    invalid('Approved budget exhausted');
  return {
    state: {
      ...s,
      budgetCommitments: s.budgetCommitments.map((x) =>
        x.budgetId === b.budgetId
          ? { ...b, committedAmount: next.toCanonicalValue() }
          : x,
      ),
    },
    budget: { budgetId: b.budgetId, amount },
    financial: {
      mode: c.mode,
      recognitionRuleVersion: c.recognitionRuleVersion,
      legs:
        BigInt(n) === 0n
          ? []
          : c.financialLegs.map((l) => ({
              account: l.account,
              direction: l.direction,
              amount: times(l.amountPerUnit, n),
              counterpartyAccountId: l.counterpartyAccountId,
            })),
    },
  };
}
function kernelTools(
  s: SocialOfficeStateV1,
  f: SocialOfficeReadFactsV1,
  digest: Sha256Hex,
) {
  const prefix = hash([s, f.sourceBinding], digest).slice(7).toUpperCase();
  const trace: SocialFoundationTraceRequest = {
    traceId: `TRACE_${prefix}`,
    calculationVersion: 'SOCIAL_OFFICE_ACTIONS_V1',
    lineageId: `LINEAGE_${prefix}`,
    sourceVersion: `SOURCE_${f.sourceBinding.manifestHash.slice(7).toUpperCase()}`,
    snapshotId: `SNAPSHOT_${prefix}`,
    snapshotAt: { amount: f.simTime, unit: 'sim_millisecond' },
  };
  function fact<T>(name: string, payload: T) {
    return createSocialFoundationFact({
      trace,
      factId: `FACT_${name}_${prefix}`,
      sourceId: `SOURCE_${prefix}`,
      predecessorFactIds: [`PREDECESSOR_${prefix}`],
      payload,
    });
  }
  return { trace, fact, id: (name: string) => `${name}_${prefix}` };
}
function joinedBefore(i: SocialOfficePreparationInputV1): void {
  if (
    !isAuthoritativeInventoryLedgerState(i.inventoryBefore) ||
    !isAuthoritativeFinancialLedgerState(i.financialBefore) ||
    i.inventoryBefore.worldId !== i.command.worldId ||
    i.financialBefore.worldId !== i.command.worldId ||
    i.inventoryBefore.worldVersion !== i.command.expectedWorldVersion ||
    i.financialBefore.worldVersion !== i.command.expectedWorldVersion
  )
    invalid('Same-head actual joined ledger predecessor required');
}
function commandWire(c: CanonicalCommand): JsonRecord {
  return {
    actorId: c.actorId,
    authSubject: c.authSubject,
    commandId: c.commandId,
    commandType: c.commandType,
    correlationId: c.correlationId,
    countryId: c.countryId,
    expectedWorldVersion: c.expectedWorldVersion,
    idempotencyKey: c.idempotencyKey,
    officeId: c.officeId,
    payload: JSON.parse(c.canonicalPayload) as unknown,
    schemaVersion: c.schemaVersion,
    simTime: c.simTime.toCanonicalValue(),
    submittedAtReal: c.submittedAtReal,
    worldId: c.worldId,
  };
}
function teachingWindows(
  s: SocialOfficeStateV1,
  f: SocialOfficeReadFactsV1,
  p: SocialOfficeProgrammeRuleV1,
  anchor: string,
  remaining: string,
) {
  const selected: SocialOfficeResourceWindowV1[] = [];
  for (let n = 0n; n < BigInt(remaining); n++) {
    const day = (BigInt(anchor) + n).toString();
    const ids = p.teachingResourceIds.filter((id) =>
      s.resourceWindows.some(
        (w) => w.allocation.resourceId === id && w.allocation.dayIndex === day,
      ),
    );
    if (ids.length !== 1)
      invalid(
        'Every original future teaching day needs exactly one qualified resource window',
      );
    const w = windowFor(s, f, ids[0]!);
    if (
      w.allocation.unit !== 'staff_minute' ||
      w.allocation.positionId !== p.teacherPositionId ||
      w.allocation.qualification !== p.teacherQualification
    )
      invalid('Teaching source role/qualification differs');
    selected.push(w);
  }
  return selected;
}

export function prepareSocialOfficeOperation(
  i: SocialOfficePreparationInputV1,
): SocialOfficePreparedOperationV1 {
  validateCanonicalCommand(i.command, i.sha256Hex);
  const f = readFacts(i.readFacts),
    original = validateSocialOfficeState(i.state, f, i.sha256Hex),
    c = i.command;
  if (
    c.worldId !== original.worldId ||
    c.countryId !== original.countryId ||
    c.expectedWorldVersion === null ||
    c.simTime.toCanonicalValue() !== f.simTime
  )
    invalid('Command/head/source scope mismatch');
  const duplicate = original.appliedOperations.find(
    (o) => o.commandId === c.commandId,
  );
  if (duplicate) {
    if (
      duplicate.fingerprint !== c.fingerprint ||
      duplicate.canonicalPayload !== c.canonicalPayload
    )
      invalid('Operation identity conflict');
    return frozen({
      source: 'EXACT_DUPLICATE',
      state: original,
      outcome: duplicate.result,
      eventPayload: null,
    });
  }
  joinedBefore(i);
  let s = admitSources(original, f);
  let kind: Kind,
    objectId: string,
    units = '0',
    effects: SocialOfficeOutcomeV1['resourceEffects'] = [],
    budget: SocialOfficeOutcomeV1['budgetEffect'] = null,
    financial: SocialOfficeOutcomeV1['financialRequirement'] = null,
    inventory: SocialOfficeOutcomeV1['inventoryRequirement'] = null,
    employment: SocialEmploymentOutcome | null = null,
    calculation: unknown;
  if (
    c.commandType !== SOCIAL_COLLEGE_ADMIT_COMMAND &&
    c.commandType !== SOCIAL_COLLEGE_GRADUATE_COMMAND &&
    c.commandType !== SOCIAL_CLINIC_SERVE_COMMAND
  ) {
    const parsed = parseSocialEmploymentServiceCommand(c, i.sha256Hex);
    kind = parsed.kind;
    if (
      !f.employmentReadFacts ||
      f.employmentReadFacts.simTime !== f.simTime ||
      canonicalSerialize(f.employmentReadFacts.boundary) !==
        canonicalSerialize(f.dayBoundary) ||
      canonicalSerialize(f.employmentReadFacts.populationAvailability) !==
        canonicalSerialize(f.populationAvailability)
    )
      invalid('Joined employment facts absent');
    const p = prepareSocialEmploymentServiceOperation({
      command: c,
      state: s.employment,
      readFacts: f.employmentReadFacts,
      sha256Hex: i.sha256Hex,
    });
    if (p.source !== 'APPLIED')
      invalid('Child duplicate differs from aggregate duplicate');
    employment = p.result;
    objectId = p.result.planCommandId;
    const r = f.employmentRecipes.find(
      (r) => r.servicePoolId === p.result.servicePoolId,
    );
    if (!r) invalid('Original employment physical recipe missing');
    const previousPlan = s.employment.plans.find(
      (p) => p.planCommandId === objectId,
    );
    if (parsed.kind === 'MATCH' && !previousPlan)
      invalid('Original PLAN missing');
    const pool = s.employment.servicePools.find(
      (v) => v.poolId === r.servicePoolId,
    );
    if (!pool || pool.ruleVersion !== r.ruleVersion)
      invalid('Physical recipe and original service rule differ');
    for (const x of r.perPlannedSlot) {
      const w = windowFor(s, f, recipeResource(s, f, x.resourceId));
      if (
        w.allocation.dayIndex !== pool.dayIndex ||
        w.allocation.unit !== 'staff_minute'
      )
        invalid(
          'PLAN physical reservation must use its original due-day staff window',
        );
    }
    units = p.result.allocatedSlots;
    const effect = changeResources(
      s,
      f,
      r.perPlannedSlot,
      units,
      parsed.kind === 'PLAN' ? 'RESERVE' : 'SPEND_RESERVATION',
      objectId,
    );
    s = { ...effect.state, employment: p.state };
    effects = effect.effects;
    calculation = p.eventPayload;
  } else {
    const action = parseSocialOfficeActionIntent(c, i.sha256Hex);
    kind = action.kind;
    if (action.kind === 'SERVE') {
      objectId = action.clinicId;
      const rule = f.clinicRules.find(
          (r) =>
            r.clinicId === action.clinicId &&
            r.ruleVersion === action.clinicRuleVersion,
        ),
        demand = f.demandWindows.find(
          (d) =>
            d.clinicId === action.clinicId &&
            d.careWindowId === action.careWindowId,
        );
      if (
        !rule ||
        !demand ||
        demand.dayIndex !== f.dayBoundary.dayIndex ||
        s.clinic.clinicId !== rule.clinicId ||
        rule.medicineAccount.worldId !== s.worldId ||
        rule.medicineAccount.countryId !== s.countryId
      )
        invalid('Clinic original rule/demand/scope missing');
      const stock = i.inventoryBefore.balances.find(
        (b) =>
          canonicalSerialize(b.account) ===
          canonicalSerialize(rule.medicineAccount),
      );
      const doses = stock
        ? BigInt(uint(stock.quantity.toCanonicalValue().amount))
        : 0n;
      const staff = recipeCapacity(s, f, rule.staffRecipe, 'staff_minute'),
        facility = recipeCapacity(s, f, rule.facilityRecipe, 'facility_minute'),
        supply = doses / BigInt(rule.dosesPerCase),
        funds = budgetCapacity(s, rule.cost);
      const clinicalRoles = rule.staffRecipe.map(
        (r) =>
          windowFor(s, f, recipeResource(s, f, r.resourceId)).allocation
            .qualification,
      );
      if (
        !clinicalRoles.includes('DOCTOR') ||
        !clinicalRoles.includes('NURSE') ||
        !clinicalRoles.includes('MEDICAL_TECHNICIAN') ||
        !clinicalRoles.includes('SUPPORT')
      )
        invalid('Minimal clinic qualified role mix absent');
      const isNew = !s.clinic.admittedDemandOrigins.includes(
          demand.canonicalOriginId,
        ),
        newDemand = isNew ? demand.newCases : '0',
        k = kernelTools(s, f, i.sha256Hex),
        q = (amount: string, unit: string) => ({ amount, unit });
      const result = calculateHealthcareFoundation({
        trace: k.trace,
        outcomeId: k.id('OUTCOME'),
        deliveredCareId: k.id('DELIVERED'),
        backlog: k.fact('BACKLOG', {
          backlogStateId: k.id('BACKLOG'),
          priorBacklog: q(s.clinic.backlog, 'case'),
        }),
        demand: k.fact('DEMAND', {
          demandId: k.id('DEMAND'),
          newDemand: q(newDemand, 'case'),
        }),
        staff: k.fact('STAFF', {
          workforceId: k.id('WORKFORCE'),
          staffedPeople: q(
            total(
              rule.staffRecipe.map(
                (r) =>
                  windowFor(s, f, recipeResource(s, f, r.resourceId)).allocation
                    .assignedPeople,
              ),
            ).toString(),
            'person',
          ),
          careCapacity: q(staff.toString(), 'case'),
        }),
        facility: k.fact('FACILITY', {
          facilityId: k.id('FACILITY'),
          careCapacity: q(facility.toString(), 'case'),
          bedStateId: k.id('NO_BEDS'),
          totalBeds: q('0', 'bed'),
          occupiedBeds: q('0', 'bed'),
        }),
        medicalSupply: k.fact('SUPPLY', {
          inventoryId: k.id('INVENTORY'),
          availableMedicalDoses: q(doses.toString(), 'medical_dose'),
          careCapacity: q(supply.toString(), 'case'),
        }),
        budget: k.fact('BUDGET', {
          budgetId: k.id('BUDGET'),
          observedOperatingBudget: s.budgetCommitments.find(
            (b) => b.budgetId === rule.cost.budgetId,
          )!.approvedAmount,
          careCapacity: q(funds.toString(), 'case'),
        }),
      });
      units = result.deliveredCare.amount;
      calculation = result;
      const used = changeResources(
        s,
        f,
        [...rule.staffRecipe, ...rule.facilityRecipe],
        units,
        'USE',
        c.commandId,
      );
      s = used.state;
      effects = used.effects;
      const paid = commitCost(s, rule.cost, units);
      s = paid.state;
      budget = paid.budget;
      financial = paid.financial;
      s = {
        ...s,
        clinic: {
          ...s.clinic,
          backlog: result.nextBacklog.amount,
          admittedDemandOrigins: isNew
            ? [...s.clinic.admittedDemandOrigins, demand.canonicalOriginId]
            : s.clinic.admittedDemandOrigins,
        },
      };
      if (units !== '0')
        inventory = {
          account: rule.medicineAccount,
          quantity: (BigInt(units) * BigInt(rule.dosesPerCase)).toString(),
          unit: 'medical_dose',
        };
    } else {
      const cohort =
        action.kind === 'GRADUATE'
          ? s.cohorts.find((x) => x.cohortId === action.cohortId)
          : undefined;
      const programmeId =
        action.kind === 'ADMIT' ? action.programmeId : cohort?.programmeId;
      const rule = f.programmeRules.find(
        (p) =>
          p.programmeId === programmeId &&
          p.ruleVersion === action.programmeRuleVersion,
      );
      if (!rule) invalid('Original programme rule absent');
      const retained = s.programmes.find(
        (p) => p.programmeId === rule.programmeId,
      );
      if (retained && canonicalSerialize(retained) !== canonicalSerialize(rule))
        invalid('Original programme changed');
      if (!retained) s = { ...s, programmes: [...s.programmes, rule] };
      const teacher = s.employment.labour.positions.find(
        (p) =>
          p.positionId === rule.teacherPositionId &&
          p.countryId === s.countryId &&
          p.locationId === s.locationId &&
          p.owner === 'PUBLIC_SERVICE' &&
          p.classificationId === 'EDUCATION',
      );
      const teachers = teacher ? BigInt(teacher.employedCount) : 0n;
      const seats = BigInt(rule.seats),
        teacherSeats = teachers * BigInt(rule.studentsPerQualifiedTeacher);
      const occupied = s.cohorts
        .filter((x) => x.programmeId === rule.programmeId)
        .reduce(
          (n, x) => n + BigInt(x.originalEnrolled) - BigInt(x.graduates),
          0n,
        );
      const k = kernelTools(s, f, i.sha256Hex),
        q = (amount: string, unit: string) => ({ amount, unit });
      objectId = action.cohortId;
      if (action.kind === 'ADMIT') {
        if (s.cohorts.some((x) => x.cohortId === action.cohortId))
          invalid('Cohort already exists');
        const pool = f.applicantPools.find(
          (p) =>
            p.applicantPoolId === action.applicantPoolId &&
            p.programmeId === rule.programmeId,
        );
        if (!pool || pool.sourceSkill !== rule.sourceSkill)
          invalid('Original eligible STUDENT applicant pool absent');
        const applicants = pool.memberIds.filter(
          (id) => !s.applicantAssignments.includes(id),
        );
        const student = total(
          s.employment.labour.aggregates
            .filter(
              (a) =>
                a.countryId === s.countryId &&
                a.locationId === s.locationId &&
                a.skill === rule.sourceSkill &&
                a.status === 'STUDENT',
            )
            .map((a) => a.count),
        );
        const alreadyHeld = s.cohorts
          .filter(
            (x) =>
              s.programmes.find((p) => p.programmeId === x.programmeId)!
                .sourceSkill === rule.sourceSkill,
          )
          .reduce(
            (n, x) => n + BigInt(x.originalEnrolled) - BigInt(x.graduates),
            0n,
          );
        if (BigInt(applicants.length) > student - alreadyHeld)
          invalid(
            'Applicant assignments exceed actual unassigned STUDENT pool',
          );
        const budgetSeats = budgetCapacity(s, rule.admissionCost),
          capacity = minimum([seats, teacherSeats, occupied + budgetSeats]);
        if (occupied > capacity)
          invalid('Existing cohorts exceed current real capacity');
        const future = teachingWindows(
          s,
          f,
          rule,
          f.dayBoundary.dayIndex,
          rule.requiredDurationSimDays,
        );
        const jointRates = new Map<string, bigint>();
        for (const r of rule.admissionRecipe) {
          const id = recipeResource(s, f, r.resourceId);
          jointRates.set(
            id,
            (jointRates.get(id) ?? 0n) + BigInt(r.amountPerUnit),
          );
        }
        for (const w of future)
          jointRates.set(
            w.allocation.resourceId,
            (jointRates.get(w.allocation.resourceId) ?? 0n) +
              BigInt(rule.teachingMinutesPerStudentPerSimDay),
          );
        const teachingCapacity = minimum(
          [...jointRates].map(([id, rate]) => {
            const w = windowFor(s, f, id);
            return (
              (BigInt(w.allocation.capacity) - BigInt(w.used) - reserved(w)) /
              rate
            );
          }),
        );
        const admitted = minimum([
          BigInt(applicants.length),
          capacity - occupied,
          recipeCapacity(s, f, rule.admissionRecipe),
          teachingCapacity,
        ]);
        units = admitted.toString();
        calculation = calculateEducationFoundation({
          trace: k.trace,
          outcomeId: k.id('OUTCOME'),
          nextCohortId: k.id('NEXT_COHORT'),
          applicantPool: k.fact('APPLICANTS', {
            applicantPoolId: k.id('APPLICANTS'),
            applicants: q(applicants.length.toString(), 'person'),
          }),
          capacity: k.fact('CAPACITY', {
            teacherWorkforceId: k.id('TEACHERS'),
            teachers: q(teachers.toString(), 'person'),
            facilityId: k.id('FACILITY'),
            seats: q(seats.toString(), 'person'),
            budgetCapacityId: k.id('BUDGET'),
            budgetSupportedSeats: q(
              (occupied + budgetSeats).toString(),
              'person',
            ),
            teacherSupportedSeats: q(teacherSeats.toString(), 'person'),
            availableEnrollmentCapacity: q(capacity.toString(), 'person'),
          }),
          cohort: k.fact('COHORT', {
            cohortId: k.id('CAPACITY_COHORT'),
            trainingProgrammeId: k.id('PROGRAMME'),
            level: rule.level,
            specialisationId: rule.specialisationId,
            enrolled: q(occupied.toString(), 'person'),
            cumulativeGraduates: q('0', 'person'),
            elapsedDuration: q('0', 'sim_day'),
            requiredDuration: q(rule.requiredDurationSimDays, 'sim_day'),
          }),
          outcome: k.fact('OUTCOME', {
            admitted: q(units, 'person'),
            graduates: q('0', 'person'),
          }),
          skillTarget: null,
        });
        const use = changeResources(
          s,
          f,
          rule.admissionRecipe,
          units,
          'USE',
          c.commandId,
        );
        s = use.state;
        effects = use.effects;
        const bookings: SocialOfficeCohortV1['futureTeachingReservations'][number][] =
          [];
        if (admitted !== 0n)
          for (const w of future) {
            const booked = changeResources(
              s,
              f,
              [
                {
                  resourceId: w.allocation.resourceId,
                  amountPerUnit: rule.teachingMinutesPerStudentPerSimDay,
                },
              ],
              units,
              'RESERVE',
              action.cohortId,
            );
            s = booked.state;
            effects = [...effects, ...booked.effects];
            bookings.push({
              resourceId: w.allocation.resourceId,
              dayIndex: w.allocation.dayIndex,
              amount: (
                admitted * BigInt(rule.teachingMinutesPerStudentPerSimDay)
              ).toString(),
            });
          }
        const obligation = commitCost(s, rule.admissionCost, units);
        s = obligation.state;
        budget = obligation.budget;
        financial = obligation.financial;
        const selected = applicants.slice(0, Number(admitted));
        s = {
          ...s,
          cohorts: [
            ...s.cohorts,
            {
              cohortId: action.cohortId,
              programmeId: rule.programmeId,
              programmeRuleVersion: rule.ruleVersion,
              anchorDayIndex: f.dayBoundary.dayIndex,
              elapsedSimDaysAtAnchor: '0',
              requiredDurationSimDays: rule.requiredDurationSimDays,
              alreadyCompletedTeachingMinutes: '0',
              futureTeachingReservations: bookings,
              originalEnrolled: units,
              graduates: '0',
              memberIds: selected,
              state: 'OPEN',
            },
          ],
          applicantAssignments: [...s.applicantAssignments, ...selected],
        };
      } else {
        if (
          !cohort ||
          cohort.state !== 'OPEN' ||
          BigInt(f.dayBoundary.dayIndex) < BigInt(cohort.anchorDayIndex)
        )
          invalid('Original open cohort missing');
        const elapsed =
          BigInt(cohort.elapsedSimDaysAtAnchor) +
          BigInt(f.dayBoundary.dayIndex) -
          BigInt(cohort.anchorDayIndex);
        if (elapsed < BigInt(rule.requiredDurationSimDays))
          invalid('Cohort programme duration not completed');
        const numerator =
            BigInt(cohort.originalEnrolled) *
            BigInt(rule.completionRate.numerator),
          denominator = BigInt(rule.completionRate.denominator),
          remainder = numerator % denominator;
        if (remainder !== 0n && rule.integerPolicy === 'EXACT_OR_REJECT')
          invalid('Graduation result is not a whole person');
        units = (numerator / denominator).toString();
        for (const r of cohort.futureTeachingReservations) {
          const w = windowFor(s, f, r.resourceId);
          if (BigInt(w.allocation.endSimTime) > BigInt(f.simTime))
            invalid('Original instructional window has not ended');
          const spent = changeResources(
            s,
            f,
            [{ resourceId: r.resourceId, amountPerUnit: r.amount }],
            '1',
            'SPEND_RESERVATION',
            cohort.cohortId,
          );
          s = spent.state;
          effects = [...effects, ...spent.effects];
        }
        if (
          recipeCapacity(s, f, rule.assessmentRecipe) <
          BigInt(cohort.originalEnrolled)
        )
          invalid('Whole assessed cohort lacks resource capacity');
        const use = changeResources(
          s,
          f,
          rule.assessmentRecipe,
          cohort.originalEnrolled,
          'USE',
          c.commandId,
        );
        s = use.state;
        effects = [...effects, ...use.effects];
        const obligation = commitCost(
          s,
          rule.graduationCost,
          cohort.originalEnrolled,
        );
        s = obligation.state;
        budget = obligation.budget;
        financial = obligation.financial;
        const targetStock = total(
          s.employment.labour.aggregates
            .filter(
              (a) =>
                a.countryId === s.countryId &&
                a.locationId === s.locationId &&
                a.skill === rule.targetSkill,
            )
            .map((a) => a.count),
        );
        calculation = {
          integerPolicy: rule.integerPolicy,
          exactNumerator: numerator.toString(),
          exactDenominator: denominator.toString(),
          remainder: remainder.toString(),
          foundation: calculateEducationFoundation({
            trace: k.trace,
            outcomeId: k.id('OUTCOME'),
            nextCohortId: k.id('NEXT_COHORT'),
            applicantPool: k.fact('APPLICANTS', {
              applicantPoolId: k.id('APPLICANTS'),
              applicants: q('0', 'person'),
            }),
            capacity: k.fact('CAPACITY', {
              teacherWorkforceId: k.id('TEACHERS'),
              teachers: q(teachers.toString(), 'person'),
              facilityId: k.id('FACILITY'),
              seats: q(seats.toString(), 'person'),
              budgetCapacityId: k.id('BUDGET'),
              budgetSupportedSeats: q(seats.toString(), 'person'),
              teacherSupportedSeats: q(teacherSeats.toString(), 'person'),
              availableEnrollmentCapacity: q(
                minimum([seats, teacherSeats]).toString(),
                'person',
              ),
            }),
            cohort: k.fact('COHORT', {
              cohortId: k.id('COHORT'),
              trainingProgrammeId: k.id('PROGRAMME'),
              level: rule.level,
              specialisationId: rule.specialisationId,
              enrolled: q(cohort.originalEnrolled, 'person'),
              cumulativeGraduates: q('0', 'person'),
              elapsedDuration: q(elapsed.toString(), 'sim_day'),
              requiredDuration: q(rule.requiredDurationSimDays, 'sim_day'),
            }),
            outcome: k.fact('OUTCOME', {
              admitted: q('0', 'person'),
              graduates: q(units, 'person'),
            }),
            skillTarget:
              units === '0'
                ? null
                : k.fact('TARGET', {
                    handoffId: k.id('HANDOFF'),
                    labourSkillStockId: k.id('SKILL_STOCK'),
                    skill: rule.targetSkill as 'MEDIUM' | 'HIGH',
                    before: q(targetStock.toString(), 'person'),
                  }),
          }),
        };
        if (units !== '0') {
          const labour = applyLabourFacts({
            state: s.employment.labour,
            boundary: f.dayBoundary,
            populationAvailability: f.populationAvailability,
            facts: [
              {
                kind: 'EDUCATION_SKILL_TRANSITION',
                factId: `SOC_GRAD_${hash([c.commandId, cohort.cohortId], i.sha256Hex).slice(7).toUpperCase()}`,
                countryId: s.countryId,
                locationId: s.locationId,
                dayIndex: f.dayBoundary.dayIndex,
                educationTransitionVersion: rule.ruleVersion,
                sourceSkill: rule.sourceSkill,
                targetSkill: rule.targetSkill,
                count: units,
              },
            ],
          }).state;
          s = { ...s, employment: { ...s.employment, labour } };
        }
        s = {
          ...s,
          cohorts: s.cohorts.map((x) =>
            x.cohortId === cohort.cohortId
              ? { ...cohort, graduates: units, state: 'GRADUATION_PROCESSED' }
              : x,
          ),
        };
      }
    }
  }
  if (f.sourceBinding.purpose !== kind)
    invalid('Source purpose does not qualify this action');
  const outcome: SocialOfficeOutcomeV1 = frozen({
    kind,
    objectId,
    units,
    resourceEffects: effects,
    budgetEffect: budget,
    inventoryRequirement: inventory,
    financialRequirement: financial,
    employment,
    calculation,
    directProductivityEffect: null,
    directHealthEffect: null,
  });
  s = validateSocialOfficeState(
    {
      ...s,
      appliedOperations: [
        ...s.appliedOperations,
        {
          commandId: c.commandId,
          fingerprint: c.fingerprint,
          canonicalPayload: c.canonicalPayload,
          result: outcome,
        },
      ],
    },
    f,
    i.sha256Hex,
  );
  return frozen({
    source: 'PREPARED_NOT_COMMITTED',
    state: s,
    outcome,
    eventPayload: {
      schemaVersion: 'social-office-action-event-v1',
      command: commandWire(c),
      readFacts: f,
      beforeStateHash: hash(original, i.sha256Hex),
      afterStateHash: hash(s, i.sha256Hex),
      inventoryBeforeHash: hash(i.inventoryBefore, i.sha256Hex),
      financialBeforeHash: hash(i.financialBefore, i.sha256Hex),
      result: outcome,
    },
  });
}

export function reduceSocialOfficeEvent(i: {
  readonly state: SocialOfficeStateV1;
  readonly event: ReplayReducerEvent;
  readonly inventoryBefore: InventoryLedgerState;
  readonly financialBefore: FinancialLedgerState;
  readonly sha256Hex: Sha256Hex;
}): SocialOfficeStateV1 {
  const p = record(i.event.payload);
  keys(p, [
    'schemaVersion',
    'command',
    'readFacts',
    'beforeStateHash',
    'afterStateHash',
    'inventoryBeforeHash',
    'financialBeforeHash',
    'result',
  ]);
  const c = parseCanonicalCommand(p.command, i.sha256Hex),
    e = i.event;
  if (
    p.schemaVersion !== 'social-office-action-event-v1' ||
    e.eventType !== SOCIAL_OFFICE_ACTION_EVENT ||
    e.correctsEventId !== null ||
    e.causationCommandId !== c.commandId ||
    e.transitionId !== c.commandId ||
    e.worldId !== c.worldId ||
    e.worldVersionBefore !== c.expectedWorldVersion ||
    e.worldVersionAfter !== (BigInt(c.expectedWorldVersion!) + 1n).toString() ||
    e.simTime.ticks !== c.simTime.ticks
  )
    invalid('Replay Event binding/correction mismatch');
  uint(e.sequence, true);
  const prepared = prepareSocialOfficeOperation({
    command: c,
    state: i.state,
    readFacts: p.readFacts as unknown as SocialOfficeReadFactsV1,
    inventoryBefore: i.inventoryBefore,
    financialBefore: i.financialBefore,
    sha256Hex: i.sha256Hex,
  });
  if (
    prepared.source !== 'PREPARED_NOT_COMMITTED' ||
    canonicalSerialize(prepared.eventPayload) !== canonicalSerialize(p)
  )
    invalid('Replay predecessor/result differs from actual calculation');
  return prepared.state;
}
