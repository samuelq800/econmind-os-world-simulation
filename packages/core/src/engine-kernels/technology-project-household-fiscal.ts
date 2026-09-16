import {
  addMoney,
  decimal,
  kernelInvalid,
  maximum,
  minimum,
  money,
  nonNegative,
  physicalQuantity,
  ratio,
  render,
  renderMoney,
  renderQuantity,
  sameUnit,
  subtractMoney,
  type ExactMoney,
  type ExactQuantity,
  type ExactRatio,
  type ExactUnitRate,
} from './common.js';

export type TechnologyState =
  | 'UNKNOWN'
  | 'RESEARCHABLE'
  | 'RESEARCHING'
  | 'MASTERED'
  | 'LICENSED'
  | 'TRANSFER_IN_PROGRESS'
  | 'JOINTLY_OWNED'
  | 'RESTRICTED'
  | 'OBSOLETE';

export interface ResearchProgressInput {
  readonly accumulatedOutput: ExactQuantity;
  readonly requiredOutput: ExactQuantity;
  readonly researchLabourHours: ExactQuantity;
  readonly fundingAvailability: ExactRatio;
  readonly equipmentAvailability: ExactRatio;
  /** Research points generated per one research-labour hour. */
  readonly researchOutputPerLabourHour: ExactUnitRate;
  readonly researchEfficiency: ExactRatio;
}

/** E11's R&D equation; it does not itself grant a technology right or capacity. */
export function calculateResearchProgress(input: ResearchProgressInput) {
  const accumulated = physicalQuantity(
    input.accumulatedOutput,
    'accumulatedOutput',
  );
  const required = physicalQuantity(input.requiredOutput, 'requiredOutput');
  if (
    accumulated.unit !== 'research_point' ||
    required.unit !== 'research_point'
  ) {
    kernelInvalid('Research output must use research_point');
  }
  if (required.amount.isZero())
    kernelInvalid('requiredOutput must be positive');
  const labour = physicalQuantity(
    input.researchLabourHours,
    'researchLabourHours',
  );
  if (labour.unit !== 'research_labour_hour') {
    kernelInvalid('researchLabourHours must use research_labour_hour');
  }
  if (
    input.researchOutputPerLabourHour.inputUnit !== labour.unit ||
    input.researchOutputPerLabourHour.outputUnit !== accumulated.unit
  ) {
    kernelInvalid(
      'researchOutputPerLabourHour must be research_point per research_labour_hour',
    );
  }
  const periodOutput = labour.amount
    .times(
      nonNegative(
        input.researchOutputPerLabourHour.amount,
        'researchOutputPerLabourHour',
      ),
    )
    .times(ratio(input.fundingAvailability, 'fundingAvailability'))
    .times(ratio(input.equipmentAvailability, 'equipmentAvailability'))
    .times(ratio(input.researchEfficiency, 'researchEfficiency'));
  const next = accumulated.amount.plus(periodOutput);
  return Object.freeze({
    periodResearchOutput: renderQuantity(periodOutput, accumulated.unit),
    accumulatedResearchOutput: renderQuantity(next, accumulated.unit),
    progress: Object.freeze({
      amount: render(
        minimum(
          [next.dividedBy(required.amount), decimal('1', 'one')],
          'research progress',
        ),
      ),
      unit: 'ratio',
    }),
    complete: next.greaterThanOrEqualTo(required.amount),
  });
}

export interface TechnologyRightCheck {
  readonly state: TechnologyState;
  readonly licenceUnexpired: boolean;
  readonly productionLimitSatisfied: boolean;
  readonly requiredPrerequisitesSatisfied: boolean;
}

/** A license remains distinct from mastery; expiry or prerequisite failure blocks new use. */
export function canUseTechnologyForNewBuild(
  input: TechnologyRightCheck,
): boolean {
  const rightAllows =
    input.state === 'MASTERED' ||
    input.state === 'JOINTLY_OWNED' ||
    (input.state === 'LICENSED' && input.licenceUnexpired);
  return (
    rightAllows &&
    input.productionLimitSatisfied &&
    input.requiredPrerequisitesSatisfied
  );
}

export type ProjectStatus =
  | 'PROPOSED'
  | 'TECHNICAL_REVIEW'
  | 'AWAITING_FUNDING'
  | 'AWAITING_INPUTS'
  | 'AWAITING_TECHNOLOGY'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'UNDER_CONSTRUCTION'
  | 'DELAYED'
  | 'PARTIALLY_OPERATIONAL'
  | 'OPERATIONAL'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'DECOMMISSIONED';

export interface ProjectStartCheck {
  readonly fundingSecured: boolean;
  readonly materialsReserved: boolean;
  readonly workforceAvailable: boolean;
  readonly technologyRightValid: boolean;
  readonly approvalsValidForVersion: boolean;
}

export function canStartProject(input: ProjectStartCheck): boolean {
  return (
    input.fundingSecured &&
    input.materialsReserved &&
    input.workforceAvailable &&
    input.technologyRightValid &&
    input.approvalsValidForVersion
  );
}

export interface ProjectProgressInput {
  readonly plannedIncrement: ExactQuantity;
  readonly fundingReleasedFactor: ExactRatio;
  readonly materialsDeliveredFactor: ExactRatio;
  readonly labourAvailableFactor: ExactRatio;
  readonly oversightCapacityFactor: ExactRatio;
}

/** E12 progresses by its weakest explicit prerequisite; no capacity is commissioned here. */
export function calculateProjectProgress(input: ProjectProgressInput) {
  const bottleneck = minimum(
    [
      ratio(input.fundingReleasedFactor, 'fundingReleasedFactor'),
      ratio(input.materialsDeliveredFactor, 'materialsDeliveredFactor'),
      ratio(input.labourAvailableFactor, 'labourAvailableFactor'),
      ratio(input.oversightCapacityFactor, 'oversightCapacityFactor'),
    ],
    'project bottleneck',
  );
  return Object.freeze({
    progressIncrement: renderQuantity(
      physicalQuantity(input.plannedIncrement, 'plannedIncrement').amount.times(
        bottleneck,
      ),
      physicalQuantity(input.plannedIncrement, 'plannedIncrement').unit,
    ),
    bottleneckFactor: Object.freeze({
      amount: render(bottleneck),
      unit: 'ratio',
    }),
  });
}

export function calculateProjectFundingGap(
  totalCost: ExactMoney,
  securedFinancing: ExactMoney,
): ExactMoney {
  const total = money(totalCost, 'totalCost');
  const secured = money(securedFinancing, 'securedFinancing');
  if (total.currency !== secured.currency)
    kernelInvalid('Project funding currencies must match');
  if (total.amount.isNegative() || secured.amount.isNegative()) {
    kernelInvalid('Project cost and secured financing must be non-negative');
  }
  return renderMoney(
    maximum(
      [total.amount.minus(secured.amount), decimal('0', 'zero')],
      'project funding gap',
    ),
    total.currency,
  );
}

export function calculateRemainingProjectInputs(
  required: ExactQuantity,
  delivered: ExactQuantity,
  consumed: ExactQuantity,
): ExactQuantity {
  const requiredInput = physicalQuantity(required, 'required inputs');
  physicalQuantity(delivered, 'delivered inputs');
  physicalQuantity(consumed, 'consumed inputs');
  sameUnit(required, delivered, 'remaining project inputs');
  sameUnit(required, consumed, 'remaining project inputs');
  const remaining = requiredInput.amount
    .minus(physicalQuantity(delivered, 'delivered inputs').amount)
    .minus(physicalQuantity(consumed, 'consumed inputs').amount);
  return renderQuantity(
    maximum([remaining, decimal('0', 'zero')], 'remaining project inputs'),
    requiredInput.unit,
  );
}

export function canCommissionProject(input: {
  readonly allMandatoryMilestonesComplete: boolean;
  readonly commissioningPassed: boolean;
}): boolean {
  return input.allMandatoryMilestonesComplete && input.commissioningPassed;
}

export interface HouseholdCashflowInput {
  readonly wageIncome: ExactMoney;
  readonly capitalIncome: ExactMoney;
  /** Only settled Treasury payments belong here; approved-but-unpaid transfers must be omitted. */
  readonly paidTransfers: ExactMoney;
  readonly directTaxes: ExactMoney;
  readonly newCredit: ExactMoney;
  readonly debtService: ExactMoney;
  readonly foodCost: ExactMoney;
  readonly energyCost: ExactMoney;
  readonly housingCost: ExactMoney;
  readonly basicConsumptionCost: ExactMoney;
}

export function calculateHouseholdCashflow(input: HouseholdCashflowInput) {
  const gross = addMoney(
    [input.wageIncome, input.capitalIncome, input.paidTransfers],
    'household gross income',
  );
  const disposable = subtractMoney(
    gross,
    [input.directTaxes],
    'household disposable income',
  );
  const resources = addMoney(
    [disposable, input.newCredit],
    'household disposable resources before debt',
  );
  const afterDebt = subtractMoney(
    resources,
    [input.debtService],
    'household disposable resources',
  );
  const essentials = addMoney(
    [
      input.foodCost,
      input.energyCost,
      input.housingCost,
      input.basicConsumptionCost,
    ],
    'household essential living cost',
  );
  const margin = subtractMoney(
    disposable,
    [essentials],
    'household real margin',
  );
  return Object.freeze({
    grossIncome: gross,
    disposableIncome: disposable,
    disposableResources: afterDebt,
    essentialLivingCost: essentials,
    realMargin: margin,
  });
}

/** Consumption is an observed, final purchase; this only derives residual saving. */
export function calculateHouseholdSaving(
  disposableResources: ExactMoney,
  actualFinalConsumption: ExactMoney,
): ExactMoney {
  return subtractMoney(
    disposableResources,
    [actualFinalConsumption],
    'household saving',
  );
}

export interface PersonalIncomeTaxBand {
  /** Inclusive upper bound for the band; null is the terminal band. */
  readonly upperBound: ExactMoney | null;
  readonly marginalRate: ExactRatio;
}

export function calculatePersonalIncomeTax(input: {
  readonly taxableIncome: ExactMoney;
  readonly allowances: ExactMoney;
  readonly bands: readonly PersonalIncomeTaxBand[];
}): ExactMoney {
  const income = money(input.taxableIncome, 'taxableIncome');
  const allowance = money(input.allowances, 'allowances');
  if (income.currency !== allowance.currency)
    kernelInvalid('PIT currencies must match');
  if (income.amount.isNegative() || allowance.amount.isNegative()) {
    kernelInvalid('PIT income and allowances must be non-negative');
  }
  let remaining = maximum(
    [income.amount.minus(allowance.amount), decimal('0', 'zero')],
    'taxable income after allowances',
  );
  let lower = decimal('0', 'PIT lower bound');
  let total = decimal('0', 'PIT total');
  if (input.bands.length === 0)
    kernelInvalid('PIT requires at least one tax band');
  for (const [index, band] of input.bands.entries()) {
    const rate = ratio(band.marginalRate, `PIT band ${index} rate`);
    const upper =
      band.upperBound === null
        ? null
        : money(band.upperBound, `PIT band ${index} upper bound`);
    if (upper !== null && upper.currency !== income.currency) {
      kernelInvalid('PIT band upper-bound currency must match taxable income');
    }
    if (upper !== null && upper.amount.lessThanOrEqualTo(lower))
      kernelInvalid('PIT band upper bounds must be strictly increasing');
    const width =
      upper === null
        ? remaining
        : minimum([remaining, upper.amount.minus(lower)], 'PIT band width');
    total = total.plus(width.times(rate));
    remaining = remaining.minus(width);
    if (remaining.isZero()) break;
    if (upper === null) break;
    lower = upper.amount;
  }
  if (remaining.greaterThan(0))
    kernelInvalid('PIT terminal tax band is missing');
  return renderMoney(total, income.currency);
}

export function calculateProportionalTax(
  taxableBase: ExactMoney,
  rate: ExactRatio,
  compliance: ExactRatio,
): ExactMoney {
  const base = money(taxableBase, 'taxableBase');
  if (base.amount.isNegative())
    kernelInvalid('Taxable base must be non-negative');
  return renderMoney(
    base.amount
      .times(ratio(rate, 'tax rate'))
      .times(ratio(compliance, 'tax compliance')),
    base.currency,
  );
}

export function calculatePayrollTax(
  payrollBase: ExactMoney,
  rate: ExactRatio,
  credits: ExactMoney,
): ExactMoney {
  const collected = calculateProportionalTax(payrollBase, rate, {
    amount: '1',
    unit: 'ratio',
  });
  const beforeCredits = money(collected, 'payroll tax');
  const credit = money(credits, 'payroll credits');
  if (beforeCredits.currency !== credit.currency)
    kernelInvalid('Payroll tax currencies must match');
  return renderMoney(
    maximum(
      [beforeCredits.amount.minus(credit.amount), decimal('0', 'zero')],
      'payroll tax after credits',
    ),
    beforeCredits.currency,
  );
}

export function calculateFiscalBalances(input: {
  readonly revenue: ExactMoney;
  readonly nonInterestSpending: ExactMoney;
  readonly interestSpending: ExactMoney;
}): {
  readonly primaryBalance: ExactMoney;
  readonly overallBalance: ExactMoney;
} {
  const primary = subtractMoney(
    input.revenue,
    [input.nonInterestSpending],
    'primary balance',
  );
  return Object.freeze({
    primaryBalance: primary,
    overallBalance: subtractMoney(
      primary,
      [input.interestSpending],
      'overall balance',
    ),
  });
}

export function calculateDebtStock(input: {
  readonly priorDebt: ExactMoney;
  readonly newBorrowing: ExactMoney;
  readonly principalRepaid: ExactMoney;
  readonly recognisedRestructuring: ExactMoney;
}): ExactMoney {
  const prior = money(input.priorDebt, 'priorDebt');
  const borrowing = money(input.newBorrowing, 'newBorrowing');
  const repaid = money(input.principalRepaid, 'principalRepaid');
  const restructuring = money(
    input.recognisedRestructuring,
    'recognisedRestructuring',
  );
  if (
    [borrowing, repaid, restructuring].some(
      (item) => item.currency !== prior.currency,
    )
  ) {
    kernelInvalid('Debt stock currencies must match');
  }
  const stock = prior.amount
    .plus(borrowing.amount)
    .minus(repaid.amount)
    .plus(restructuring.amount);
  if (stock.isNegative()) kernelInvalid('Debt stock cannot become negative');
  return renderMoney(stock, prior.currency);
}

export function calculateAvailableFiscalCapacity(input: {
  readonly cash: ExactMoney;
  readonly feasibleFinancing: ExactMoney;
  readonly mandatoryPayments: ExactMoney;
  readonly minimumBuffer: ExactMoney;
}): ExactMoney {
  return subtractMoney(
    addMoney(
      [input.cash, input.feasibleFinancing],
      'fiscal capacity resources',
    ),
    [input.mandatoryPayments, input.minimumBuffer],
    'available fiscal capacity',
  );
}

export function calculateGuaranteeExposure(
  coveredOutstandingPrincipal: ExactMoney,
  maximumExposure: ExactMoney,
): ExactMoney {
  const covered = money(
    coveredOutstandingPrincipal,
    'coveredOutstandingPrincipal',
  );
  const maximum = money(maximumExposure, 'maximumExposure');
  if (covered.currency !== maximum.currency)
    kernelInvalid('Guarantee currencies must match');
  if (covered.amount.isNegative() || maximum.amount.isNegative())
    kernelInvalid('Guarantee amounts must be non-negative');
  return renderMoney(
    minimum([covered.amount, maximum.amount], 'guarantee exposure'),
    covered.currency,
  );
}

/** Separates a payable from cash settlement; callers choose the approved priority/delay policy. */
export function assessTreasuryPayment(
  cash: ExactMoney,
  duePayment: ExactMoney,
) {
  const available = money(cash, 'Treasury cash');
  const due = money(duePayment, 'due payment');
  if (available.currency !== due.currency)
    kernelInvalid('Treasury payment currencies must match');
  if (available.amount.isNegative() || due.amount.isNegative())
    kernelInvalid('Treasury cash and due payment must be non-negative');
  return Object.freeze({
    canPayInFull: available.amount.greaterThanOrEqualTo(due.amount),
    cashShortfall: renderMoney(
      maximum(
        [due.amount.minus(available.amount), decimal('0', 'zero')],
        'cash shortfall',
      ),
      due.currency,
    ),
  });
}
