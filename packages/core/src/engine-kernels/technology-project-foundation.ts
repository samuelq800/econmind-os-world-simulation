import {
  calculateProjectProgress,
  calculateResearchProgress,
  canCommissionProject,
  canStartProject,
  canUseTechnologyForNewBuild,
  type TechnologyState,
} from './technology-project-household-fiscal.js';
import {
  decimal,
  kernelInvalid,
  minimum,
  physicalQuantity,
  render,
  renderQuantity,
  sameUnit,
  type ExactQuantity,
  type ExactRatio,
  type ExactUnitRate,
  type WorldDecimalValue,
} from './common.js';
import {
  exactQuantityTransition,
  foundationFactPayload,
  foundationReplayProof,
  type ExactQuantityTransition,
  type FoundationFact,
  type FoundationReplayProof,
  type FoundationTraceRequest,
} from './foundation-provenance.js';

/**
 * V14's pure E11/E12 foundation. Technology rights, approvals, finance,
 * materials, labour, and commissioning are immutable caller facts. This module
 * emits deterministic proposals only and owns no technology, project, or
 * facility state.
 */
export const V14_FOUNDATION_STATUS =
  'FOUNDATION_IMPLEMENTED_UNVERIFIED' as const;

export type V14TechnologyRightCategory =
  'MASTERED' | 'LICENSED' | 'TRANSFER' | 'JOINT' | 'RESTRICTED';

const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;

function reference(value: string, label: string): string {
  if (!STABLE_REFERENCE.test(value)) {
    kernelInvalid(`${label} must be a stable reference`);
  }
  return value;
}

function factorFromAvailability(input: {
  readonly available: ExactQuantity;
  readonly required: ExactQuantity;
  readonly label: string;
}): ExactRatio {
  sameUnit(input.available, input.required, input.label);
  const available = physicalQuantity(
    input.available,
    `${input.label}.available`,
  ).amount;
  const required = physicalQuantity(
    input.required,
    `${input.label}.required`,
  ).amount;
  return Object.freeze({
    amount: render(
      required.isZero()
        ? decimal('1', `${input.label}.one`)
        : minimum(
            [decimal('1', `${input.label}.one`), available.dividedBy(required)],
            input.label,
          ),
    ),
    unit: 'ratio',
  });
}

function factor(value: ExactRatio, label: string): WorldDecimalValue {
  if (value.unit !== 'ratio') kernelInvalid(`${label} must use ratio`);
  const amount = decimal(value.amount, label);
  if (amount.isNegative() || amount.greaterThan(1)) {
    kernelInvalid(`${label} must be in [0, 1]`);
  }
  return amount;
}

function technologyState(
  category: V14TechnologyRightCategory,
): TechnologyState {
  switch (category) {
    case 'MASTERED':
      return 'MASTERED';
    case 'LICENSED':
      return 'LICENSED';
    case 'TRANSFER':
      return 'TRANSFER_IN_PROGRESS';
    case 'JOINT':
      return 'JOINTLY_OWNED';
    case 'RESTRICTED':
      return 'RESTRICTED';
    default:
      return kernelInvalid(
        'Technology category must be MASTERED, LICENSED, TRANSFER, JOINT, or RESTRICTED',
      );
  }
}

export interface V14TechnologyRightInput {
  readonly rightRef: string;
  readonly category: V14TechnologyRightCategory;
  readonly licenceUnexpired: boolean;
  readonly productionLimitSatisfied: boolean;
  readonly requiredPrerequisitesSatisfied: boolean;
  /** Required only for an already-MASTERED caller-owned right. */
  readonly masteryEvidenceRef: string | null;
}

export interface V14ResearchInput {
  readonly researchRef: string;
  readonly accumulatedOutput: ExactQuantity;
  readonly requiredOutput: ExactQuantity;
  readonly researchLabourHours: ExactQuantity;
  readonly fundingAvailability: ExactRatio;
  readonly equipmentAvailability: ExactRatio;
  readonly researchOutputPerLabourHour: ExactUnitRate;
  readonly researchEfficiency: ExactRatio;
}

export interface V14TechnologyRightsInput {
  readonly trace: FoundationTraceRequest;
  readonly outcomeRef: string;
  readonly right: FoundationFact<V14TechnologyRightInput>;
  readonly research: FoundationFact<V14ResearchInput>;
}

export interface V14TechnologyRightsResult {
  readonly foundationStatus: typeof V14_FOUNDATION_STATUS;
  readonly outcomeRef: string;
  readonly rightRef: string;
  /** The exact caller-owned category is preserved; R&D cannot mutate it. */
  readonly categoryAfterResearch: V14TechnologyRightCategory;
  readonly canUseForNewBuild: boolean;
  readonly researchPeriodOutput: ExactQuantity;
  readonly accumulatedResearchOutput: ExactQuantity;
  readonly researchComplete: boolean;
  readonly researchTransition: ExactQuantityTransition;
  readonly replayProof: FoundationReplayProof;
}

function validateTechnologyRight(
  value: V14TechnologyRightInput,
  label: string,
): { readonly rightRef: string; readonly canUseForNewBuild: boolean } {
  const rightRef = reference(value.rightRef, `${label}.rightRef`);
  if (value.category === 'MASTERED') {
    if (value.masteryEvidenceRef === null) {
      kernelInvalid('MASTERED technology requires explicit mastery evidence');
    }
    reference(value.masteryEvidenceRef, `${label}.masteryEvidenceRef`);
  } else if (value.masteryEvidenceRef !== null) {
    kernelInvalid('Only MASTERED technology may carry mastery evidence');
  }
  const canUseForNewBuild = canUseTechnologyForNewBuild({
    state: technologyState(value.category),
    licenceUnexpired: value.licenceUnexpired,
    productionLimitSatisfied: value.productionLimitSatisfied,
    requiredPrerequisitesSatisfied: value.requiredPrerequisitesSatisfied,
  });
  if (
    (value.category === 'TRANSFER' || value.category === 'RESTRICTED') &&
    canUseForNewBuild
  ) {
    kernelInvalid(
      'TRANSFER or RESTRICTED technology cannot authorize a new build',
    );
  }
  return Object.freeze({ rightRef, canUseForNewBuild });
}

/**
 * Calculates R&D progress while preserving right category. A completed R&D
 * vector never converts LICENSED, TRANSFER, JOINT, or RESTRICTED into MASTERED
 * and never adds capacity.
 */
export function calculateV14TechnologyRights(
  input: V14TechnologyRightsInput,
): V14TechnologyRightsResult {
  const right = foundationFactPayload(input.trace, input.right, 'right');
  const research = foundationFactPayload(
    input.trace,
    input.research,
    'research',
  );
  const outcomeRef = reference(input.outcomeRef, 'outcomeRef');
  const rightDecision = validateTechnologyRight(right, 'right');
  reference(research.researchRef, 'research.researchRef');
  const progress = calculateResearchProgress({
    accumulatedOutput: research.accumulatedOutput,
    requiredOutput: research.requiredOutput,
    researchLabourHours: research.researchLabourHours,
    fundingAvailability: research.fundingAvailability,
    equipmentAvailability: research.equipmentAvailability,
    researchOutputPerLabourHour: research.researchOutputPerLabourHour,
    researchEfficiency: research.researchEfficiency,
  });
  const researchTransition = exactQuantityTransition({
    transitionRef: `${outcomeRef}.research_output`,
    inputRefs: [input.research.factRef, input.right.factRef],
    outputRef: `${outcomeRef}.research_output_after`,
    before: research.accumulatedOutput,
    delta: progress.periodResearchOutput,
    after: progress.accumulatedResearchOutput,
  });
  const resultPayload = {
    outcomeRef,
    rightRef: rightDecision.rightRef,
    categoryAfterResearch: right.category,
    canUseForNewBuild: rightDecision.canUseForNewBuild,
    researchPeriodOutput: progress.periodResearchOutput,
    accumulatedResearchOutput: progress.accumulatedResearchOutput,
    researchComplete: progress.complete,
    researchTransition,
  };
  const replayProof = foundationReplayProof({
    module: 'V14_TECHNOLOGY_RIGHTS',
    trace: input.trace,
    inputFacts: [input.right, input.research],
    outputs: [{ outputRef: outcomeRef, payload: resultPayload }],
    transitions: [researchTransition],
  });
  return Object.freeze({
    foundationStatus: V14_FOUNDATION_STATUS,
    outcomeRef,
    rightRef: rightDecision.rightRef,
    categoryAfterResearch: right.category,
    canUseForNewBuild: rightDecision.canUseForNewBuild,
    researchPeriodOutput: progress.periodResearchOutput,
    accumulatedResearchOutput: progress.accumulatedResearchOutput,
    researchComplete: progress.complete,
    researchTransition,
    replayProof,
  });
}

export interface V14ProjectStateInput {
  readonly projectRef: string;
  readonly facilityRef: string;
  readonly progressBefore: ExactQuantity;
  readonly totalRequiredProgress: ExactQuantity;
  readonly plannedIncrement: ExactQuantity;
  /** Only APPROVED or UNDER_CONSTRUCTION is eligible for a calculation. */
  readonly phase: 'APPROVED' | 'UNDER_CONSTRUCTION';
}

export interface V14ProjectApprovalInput {
  readonly approvalRef: string;
  readonly projectRef: string;
  readonly activeForSnapshot: boolean;
}

export interface V14ProjectFundingInput {
  readonly fundingRef: string;
  readonly projectRef: string;
  readonly fundingSecured: boolean;
  readonly releasedFactor: ExactRatio;
}

export interface V14ProjectMaterialInput {
  readonly materialRef: string;
  readonly projectRef: string;
  readonly v12AvailabilityRef: string;
  readonly inventoryRef: string;
  readonly readOnly: true;
  readonly reservationRef: string;
  readonly reservedForProject: boolean;
  readonly deliveredBefore: ExactQuantity;
  readonly requiredForPlannedIncrement: ExactQuantity;
}

export interface V14ProjectLabourInput {
  readonly labourRef: string;
  readonly projectRef: string;
  readonly workforceAvailableForStart: boolean;
  readonly availableBefore: ExactQuantity;
  readonly requiredForPlannedIncrement: ExactQuantity;
}

export interface V14ProjectTechnologyInput extends V14TechnologyRightInput {
  readonly projectRef: string;
}

export interface V14ProjectOversightInput {
  readonly oversightRef: string;
  readonly projectRef: string;
  readonly availableFactor: ExactRatio;
}

export interface V14ProjectCommissioningInput {
  readonly commissioningRef: string;
  readonly projectRef: string;
  readonly facilityOwnerRef: string;
  readonly commissioningPassed: boolean;
  /** Exact references to caller-owned evidence of each mandatory consumed input. */
  readonly mandatoryInputEvidenceRefs: readonly string[];
  readonly capacityForHandoff: ExactQuantity;
}

export interface V14ProjectLifecycleInput {
  readonly trace: FoundationTraceRequest;
  readonly outcomeRef: string;
  readonly project: FoundationFact<V14ProjectStateInput>;
  readonly approval: FoundationFact<V14ProjectApprovalInput>;
  readonly funding: FoundationFact<V14ProjectFundingInput>;
  readonly materials: readonly FoundationFact<V14ProjectMaterialInput>[];
  readonly labour: FoundationFact<V14ProjectLabourInput>;
  readonly technology: FoundationFact<V14ProjectTechnologyInput>;
  readonly oversight: FoundationFact<V14ProjectOversightInput>;
  readonly commissioning: FoundationFact<V14ProjectCommissioningInput>;
}

export interface V14ProposedProjectConsumption {
  readonly inputRef: string;
  readonly before: ExactQuantity;
  readonly proposedConsumed: ExactQuantity;
  readonly after: ExactQuantity;
  readonly transition: ExactQuantityTransition;
}

export interface V14FacilityHandoffProposal {
  readonly handoffRef: string;
  readonly facilityRef: string;
  readonly facilityOwnerRef: string;
  readonly capacity: ExactQuantity;
  readonly transition: ExactQuantityTransition;
}

export interface V14ProjectLifecycleResult {
  readonly foundationStatus: typeof V14_FOUNDATION_STATUS;
  readonly outcomeRef: string;
  readonly projectRef: string;
  readonly canStart: boolean;
  readonly technologyCanUseForNewBuild: boolean;
  readonly progressBefore: ExactQuantity;
  readonly progressIncrement: ExactQuantity;
  readonly progressAfter: ExactQuantity;
  readonly projectProgressTransition: ExactQuantityTransition;
  readonly materialConsumption: readonly V14ProposedProjectConsumption[];
  readonly labourConsumption: V14ProposedProjectConsumption;
  /** Null unless construction is complete and explicit commissioning inputs pass. */
  readonly facilityHandoff: V14FacilityHandoffProposal | null;
  readonly replayProof: FoundationReplayProof;
}

function projectIdentity(
  expected: string,
  actual: string,
  label: string,
): void {
  if (reference(actual, label) !== expected) {
    kernelInvalid(`${label} must bind to the project fact`);
  }
}

function consumeProjectInput(input: {
  readonly outcomeRef: string;
  readonly inputRef: string;
  readonly sourceFactRef: string;
  readonly before: ExactQuantity;
  readonly required: ExactQuantity;
  readonly scale: WorldDecimalValue;
}): V14ProposedProjectConsumption {
  sameUnit(input.before, input.required, `${input.inputRef}.unit`);
  const before = physicalQuantity(input.before, `${input.inputRef}.before`);
  const required = physicalQuantity(
    input.required,
    `${input.inputRef}.required`,
  );
  const consumed = required.amount.times(input.scale);
  if (consumed.greaterThan(before.amount)) {
    kernelInvalid(
      `${input.inputRef} proposed consumption exceeds delivered input`,
    );
  }
  const after = before.amount.minus(consumed);
  const transition = exactQuantityTransition({
    transitionRef: `${input.outcomeRef}.${input.inputRef}.consumption`,
    inputRefs: [input.sourceFactRef],
    outputRef: `${input.outcomeRef}.${input.inputRef}.after`,
    before: renderQuantity(before.amount, before.unit),
    delta: renderQuantity(consumed.negated(), before.unit),
    after: renderQuantity(after, before.unit),
  });
  return Object.freeze({
    inputRef: reference(input.inputRef, 'inputRef'),
    before: renderQuantity(before.amount, before.unit),
    proposedConsumed: renderQuantity(consumed, before.unit),
    after: renderQuantity(after, before.unit),
    transition,
  });
}

function explicitEvidenceReferences(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (values.length === 0) {
    kernelInvalid(`${label} requires explicit consumed-input evidence`);
  }
  const result = values.map((value, index) =>
    reference(value, `${label}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    kernelInvalid(`${label} must not repeat an evidence reference`);
  }
  return Object.freeze(result);
}

/**
 * Calculates progress from explicit caller-owned inputs and proposes a single
 * facility handoff only after complete construction, mandatory input evidence,
 * and a passed commissioning fact. It never creates a project or facility.
 */
export function calculateV14ProjectLifecycle(
  input: V14ProjectLifecycleInput,
): V14ProjectLifecycleResult {
  if (input.materials.length === 0) {
    kernelInvalid('V14 project lifecycle requires explicit material evidence');
  }
  const project = foundationFactPayload(input.trace, input.project, 'project');
  const approval = foundationFactPayload(
    input.trace,
    input.approval,
    'approval',
  );
  const funding = foundationFactPayload(input.trace, input.funding, 'funding');
  const labour = foundationFactPayload(input.trace, input.labour, 'labour');
  const technology = foundationFactPayload(
    input.trace,
    input.technology,
    'technology',
  );
  const oversight = foundationFactPayload(
    input.trace,
    input.oversight,
    'oversight',
  );
  const commissioning = foundationFactPayload(
    input.trace,
    input.commissioning,
    'commissioning',
  );
  const materials = input.materials.map((fact, index) =>
    foundationFactPayload(input.trace, fact, `materials[${index}]`),
  );
  const outcomeRef = reference(input.outcomeRef, 'outcomeRef');
  const projectRef = reference(project.projectRef, 'project.projectRef');
  const facilityRef = reference(project.facilityRef, 'project.facilityRef');
  if (project.phase !== 'APPROVED' && project.phase !== 'UNDER_CONSTRUCTION') {
    kernelInvalid('Project phase must be APPROVED or UNDER_CONSTRUCTION');
  }
  projectIdentity(projectRef, approval.projectRef, 'approval.projectRef');
  projectIdentity(projectRef, funding.projectRef, 'funding.projectRef');
  projectIdentity(projectRef, labour.projectRef, 'labour.projectRef');
  projectIdentity(projectRef, technology.projectRef, 'technology.projectRef');
  projectIdentity(projectRef, oversight.projectRef, 'oversight.projectRef');
  projectIdentity(
    projectRef,
    commissioning.projectRef,
    'commissioning.projectRef',
  );
  reference(approval.approvalRef, 'approval.approvalRef');
  reference(funding.fundingRef, 'funding.fundingRef');
  reference(labour.labourRef, 'labour.labourRef');
  reference(oversight.oversightRef, 'oversight.oversightRef');
  reference(commissioning.commissioningRef, 'commissioning.commissioningRef');
  reference(commissioning.facilityOwnerRef, 'commissioning.facilityOwnerRef');

  const progressBefore = physicalQuantity(
    project.progressBefore,
    'project.progressBefore',
  );
  const totalRequired = physicalQuantity(
    project.totalRequiredProgress,
    'project.totalRequiredProgress',
  );
  const plannedIncrement = physicalQuantity(
    project.plannedIncrement,
    'project.plannedIncrement',
  );
  if (
    progressBefore.unit !== totalRequired.unit ||
    progressBefore.unit !== plannedIncrement.unit ||
    progressBefore.amount.greaterThan(totalRequired.amount)
  ) {
    kernelInvalid('Project progress facts must use one bounded physical unit');
  }
  const remaining = totalRequired.amount.minus(progressBefore.amount);
  if (plannedIncrement.amount.greaterThan(remaining)) {
    kernelInvalid('plannedIncrement cannot exceed remaining project progress');
  }

  const technologyDecision = validateTechnologyRight(technology, 'technology');
  const materialReferences = new Set<string>();
  const materialFactors: ExactRatio[] = [];
  for (const material of materials) {
    const materialRef = reference(material.materialRef, 'material.materialRef');
    if (materialReferences.has(materialRef)) {
      kernelInvalid(
        'V14 project materials must not repeat a material reference',
      );
    }
    materialReferences.add(materialRef);
    projectIdentity(
      projectRef,
      material.projectRef,
      `${materialRef}.projectRef`,
    );
    reference(material.v12AvailabilityRef, `${materialRef}.v12AvailabilityRef`);
    reference(material.inventoryRef, `${materialRef}.inventoryRef`);
    reference(material.reservationRef, `${materialRef}.reservationRef`);
    if (material.readOnly !== true) {
      kernelInvalid('V14 material availability must be explicitly read-only');
    }
    materialFactors.push(
      factorFromAvailability({
        available: material.deliveredBefore,
        required: material.requiredForPlannedIncrement,
        label: `${materialRef}.availability`,
      }),
    );
  }
  const labourFactor = factorFromAvailability({
    available: labour.availableBefore,
    required: labour.requiredForPlannedIncrement,
    label: 'labour.availability',
  });
  const materialReservationsComplete = materials.every(
    (material) => material.reservedForProject,
  );
  const canStart = canStartProject({
    fundingSecured: funding.fundingSecured,
    materialsReserved: materialReservationsComplete,
    workforceAvailable: labour.workforceAvailableForStart,
    technologyRightValid: technologyDecision.canUseForNewBuild,
    approvalsValidForVersion: approval.activeForSnapshot,
  });
  const combinedMaterialFactor = minimum(
    materialFactors.map((value) => factor(value, 'material availability')),
    'material availability',
  );
  const actualProgress = canStart
    ? calculateProjectProgress({
        plannedIncrement: project.plannedIncrement,
        fundingReleasedFactor: funding.releasedFactor,
        materialsDeliveredFactor: {
          amount: render(combinedMaterialFactor),
          unit: 'ratio',
        },
        labourAvailableFactor: labourFactor,
        oversightCapacityFactor: oversight.availableFactor,
      })
    : Object.freeze({
        progressIncrement: renderQuantity(
          decimal('0', 'blocked progress'),
          progressBefore.unit,
        ),
        bottleneckFactor: Object.freeze({
          amount: '0',
          unit: 'ratio' as const,
        }),
      });
  const increment = physicalQuantity(
    actualProgress.progressIncrement,
    'actualProgress.progressIncrement',
  );
  const progressAfter = progressBefore.amount.plus(increment.amount);
  if (progressAfter.greaterThan(totalRequired.amount)) {
    kernelInvalid('Project progress cannot exceed total required progress');
  }
  const scale = plannedIncrement.amount.isZero()
    ? decimal('0', 'project scale zero')
    : increment.amount.dividedBy(plannedIncrement.amount);
  const materialConsumption = materials.map((material, index) => {
    const sourceFact = input.materials[index];
    if (sourceFact === undefined) {
      return kernelInvalid('Project material source fact is missing');
    }
    return consumeProjectInput({
      outcomeRef,
      inputRef: material.materialRef,
      sourceFactRef: sourceFact.factRef,
      before: material.deliveredBefore,
      required: material.requiredForPlannedIncrement,
      scale,
    });
  });
  const labourConsumption = consumeProjectInput({
    outcomeRef,
    inputRef: labour.labourRef,
    sourceFactRef: input.labour.factRef,
    before: labour.availableBefore,
    required: labour.requiredForPlannedIncrement,
    scale,
  });
  const projectProgressTransition = exactQuantityTransition({
    transitionRef: `${outcomeRef}.project_progress`,
    inputRefs: [
      input.project.factRef,
      input.funding.factRef,
      input.approval.factRef,
    ],
    outputRef: `${outcomeRef}.project_progress_after`,
    before: renderQuantity(progressBefore.amount, progressBefore.unit),
    delta: renderQuantity(increment.amount, progressBefore.unit),
    after: renderQuantity(progressAfter, progressBefore.unit),
  });

  const mandatoryInputEvidenceRefs = explicitEvidenceReferences(
    commissioning.mandatoryInputEvidenceRefs,
    'commissioning.mandatoryInputEvidenceRefs',
  );
  for (const requiredEvidenceRef of [
    ...input.materials.map((material) => material.factRef),
    input.labour.factRef,
  ]) {
    if (!mandatoryInputEvidenceRefs.includes(requiredEvidenceRef)) {
      kernelInvalid(
        'commissioning evidence must name every material and labour input fact',
      );
    }
  }
  const allMandatoryMilestonesComplete = progressAfter.equals(
    totalRequired.amount,
  );
  const fullySuppliedForCommissioning =
    factor(funding.releasedFactor, 'funding.releasedFactor').equals(1) &&
    factor(labourFactor, 'labour.availability').equals(1) &&
    factor(oversight.availableFactor, 'oversight.availableFactor').equals(1) &&
    materialFactors.every((value) =>
      factor(value, 'material availability').equals(1),
    );
  const commissionAllowed =
    canStart &&
    !increment.amount.isZero() &&
    fullySuppliedForCommissioning &&
    canCommissionProject({
      allMandatoryMilestonesComplete,
      commissioningPassed: commissioning.commissioningPassed,
    });
  const facilityHandoff = commissionAllowed
    ? Object.freeze({
        handoffRef: `${outcomeRef}.facility_handoff`,
        facilityRef,
        facilityOwnerRef: commissioning.facilityOwnerRef,
        capacity: commissioning.capacityForHandoff,
        transition: exactQuantityTransition({
          transitionRef: `${outcomeRef}.facility_capacity`,
          inputRefs: [
            input.project.factRef,
            input.commissioning.factRef,
            ...mandatoryInputEvidenceRefs,
          ],
          outputRef: `${outcomeRef}.facility_capacity_after`,
          before: renderQuantity(
            decimal('0', 'facility capacity opening'),
            commissioning.capacityForHandoff.unit,
          ),
          delta: commissioning.capacityForHandoff,
          after: commissioning.capacityForHandoff,
        }),
      })
    : null;
  if (facilityHandoff !== null) {
    physicalQuantity(facilityHandoff.capacity, 'facilityHandoff.capacity');
  }
  const resultPayload = {
    outcomeRef,
    projectRef,
    canStart,
    technologyCanUseForNewBuild: technologyDecision.canUseForNewBuild,
    progressBefore: renderQuantity(progressBefore.amount, progressBefore.unit),
    progressIncrement: actualProgress.progressIncrement,
    progressAfter: renderQuantity(progressAfter, progressBefore.unit),
    projectProgressTransition,
    materialConsumption,
    labourConsumption,
    facilityHandoff,
  };
  const replayProof = foundationReplayProof({
    module: 'V14_PROJECT_LIFECYCLE',
    trace: input.trace,
    inputFacts: [
      input.project,
      input.approval,
      input.funding,
      ...input.materials,
      input.labour,
      input.technology,
      input.oversight,
      input.commissioning,
    ],
    outputs: [{ outputRef: outcomeRef, payload: resultPayload }],
    transitions: [
      projectProgressTransition,
      ...materialConsumption.map((value) => value.transition),
      labourConsumption.transition,
      ...(facilityHandoff === null ? [] : [facilityHandoff.transition]),
    ],
  });
  return Object.freeze({
    foundationStatus: V14_FOUNDATION_STATUS,
    outcomeRef,
    projectRef,
    canStart,
    technologyCanUseForNewBuild: technologyDecision.canUseForNewBuild,
    progressBefore: renderQuantity(progressBefore.amount, progressBefore.unit),
    progressIncrement: actualProgress.progressIncrement,
    progressAfter: renderQuantity(progressAfter, progressBefore.unit),
    projectProgressTransition,
    materialConsumption: Object.freeze(materialConsumption),
    labourConsumption,
    facilityHandoff,
    replayProof,
  });
}
