import {
  decimal,
  kernelInvalid,
  money,
  nonNegative,
  quantity,
  ratio,
  render,
  renderMoney,
  type ExactDecimal,
  type ExactMoney,
  type ExactQuantity,
  type ExactRatio,
} from './common.js';

/**
 * Pure, exact-unit calculations for the requested Firm Ecology preparation.
 * They do not create firms, post financial entries, resolve bankruptcies, or
 * select a policy. The authoritative caller owns each of those operations.
 */

export interface ExactQuantityRate {
  /** Output quantity units produced by one input quantity unit. */
  readonly amount: ExactDecimal;
  readonly outputUnit: string;
  readonly inputUnit: string;
}

export interface ExactFirmCountPerCurrency {
  /** Whole firms per one currency unit, with no implicit currency conversion. */
  readonly amount: ExactDecimal;
  readonly currency: string;
}

export interface ExactUnitPriceIncrease {
  /** Currency increase per one physical input unit. */
  readonly amount: ExactDecimal;
  readonly currency: string;
  readonly perUnit: string;
}

function canonicalUnit(unit: string, label: string): string {
  return quantity({ amount: '0', unit }, label).unit;
}

function stableIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    kernelInvalid(`${label} must be a stable identifier`);
  }
  return value;
}

function parsedMoney(value: ExactMoney, label: string) {
  return money(value, label);
}

function sameCurrency(
  values: readonly ExactMoney[],
  label: string,
): {
  readonly currency: string;
  readonly amounts: readonly ReturnType<typeof decimal>[];
} {
  const first = values[0];
  if (first === undefined) kernelInvalid(`${label} requires a monetary value`);
  const parsedFirst = parsedMoney(first, label);
  const amounts = [parsedFirst.amount];
  for (const value of values.slice(1)) {
    const parsed = parsedMoney(value, label);
    if (parsed.currency !== parsedFirst.currency) {
      kernelInvalid(`${label} currencies must match`);
    }
    amounts.push(parsed.amount);
  }
  return Object.freeze({
    currency: parsedFirst.currency,
    amounts: Object.freeze(amounts),
  });
}

function nonNegativeQuantity(
  value: ExactQuantity,
  label: string,
  expectedUnit?: string,
) {
  const parsed = quantity(value, label);
  if (expectedUnit !== undefined && parsed.unit !== expectedUnit) {
    kernelInvalid(`${label} unit must be ${expectedUnit}`);
  }
  return Object.freeze({
    amount: nonNegative(value.amount, label),
    unit: parsed.unit,
  });
}

function wholeNonNegativeQuantity(
  value: ExactQuantity,
  label: string,
  expectedUnit: string,
) {
  const parsed = nonNegativeQuantity(value, label, expectedUnit);
  if (!parsed.amount.isInteger()) {
    kernelInvalid(`${label} must be a whole ${expectedUnit} count`);
  }
  return parsed;
}

function quantityResult(
  amount: ReturnType<typeof decimal>,
  unit: string,
): ExactQuantity {
  return Object.freeze({ amount: render(amount), unit });
}

function minimum(
  values: readonly ReturnType<typeof decimal>[],
  label: string,
): ReturnType<typeof decimal> {
  const first = values[0];
  if (first === undefined) kernelInvalid(`${label} requires a value`);
  let result = first;
  for (const value of values.slice(1)) {
    if (value.lessThan(result)) result = value;
  }
  return result;
}

function nonNegativeDifference(
  minuend: ReturnType<typeof decimal>,
  subtrahend: ReturnType<typeof decimal>,
): ReturnType<typeof decimal> {
  const result = minuend.minus(subtrahend);
  return result.isNegative() ? decimal('0', 'zero') : result;
}

function parsedFirmCountPerCurrency(
  value: ExactFirmCountPerCurrency,
  currency: string,
  label: string,
): ReturnType<typeof decimal> {
  const rateCurrency = parsedMoney(
    { amount: '0', currency: value.currency },
    `${label} currency`,
  ).currency;
  if (rateCurrency !== currency) {
    kernelInvalid(`${label} currency must match sector profitability`);
  }
  return nonNegative(value.amount, `${label} amount`);
}

function parsedQuantityRate(
  value: ExactQuantityRate,
  inputUnit: string,
  outputUnit: string,
  label: string,
): ReturnType<typeof decimal> {
  if (canonicalUnit(value.inputUnit, `${label} inputUnit`) !== inputUnit) {
    kernelInvalid(`${label} inputUnit must be ${inputUnit}`);
  }
  if (canonicalUnit(value.outputUnit, `${label} outputUnit`) !== outputUnit) {
    kernelInvalid(`${label} outputUnit must be ${outputUnit}`);
  }
  return nonNegative(value.amount, `${label} amount`);
}

function wholeFloor(
  value: ReturnType<typeof decimal>,
): ReturnType<typeof decimal> {
  return value.floor();
}

export interface FirmEntryExitInput {
  readonly currentFirmCount: ExactQuantity;
  readonly averageProfitPerFirm: ExactMoney;
  readonly entryProfitThresholdPerFirm: ExactMoney;
  readonly exitProfitThresholdPerFirm: ExactMoney;
  readonly entryFirmsPerCurrency: ExactFirmCountPerCurrency;
  readonly exitFirmsPerCurrency: ExactFirmCountPerCurrency;
  readonly currentCapacity: ExactQuantity;
  readonly capacityPerFirm: ExactQuantityRate;
  readonly currentEmployment: ExactQuantity;
  readonly jobsPerFirm: ExactQuantityRate;
  readonly currentMargin: ExactQuantity;
  readonly marginCompressionPerNewFirm: ExactQuantityRate;
}

export interface FirmEntryExitResult {
  readonly firmEntries: ExactQuantity;
  readonly firmExits: ExactQuantity;
  readonly nextFirmCount: ExactQuantity;
  readonly capacityDelta: ExactQuantity;
  readonly nextCapacity: ExactQuantity;
  readonly employmentDelta: ExactQuantity;
  readonly nextEmployment: ExactQuantity;
  readonly marginDelta: ExactQuantity;
  readonly nextMargin: ExactQuantity;
}

/**
 * C101. Converts explicitly calibrated profit thresholds into whole firm entry
 * and exit counts, then propagates only through caller-supplied capacity,
 * labour and margin rates. No behavioural coefficient is implicit.
 */
export function calculateFirmEntryExit(
  input: FirmEntryExitInput,
): FirmEntryExitResult {
  const firms = wholeNonNegativeQuantity(
    input.currentFirmCount,
    'currentFirmCount',
    'firm',
  );
  const financials = sameCurrency(
    [
      input.averageProfitPerFirm,
      input.entryProfitThresholdPerFirm,
      input.exitProfitThresholdPerFirm,
    ],
    'firm entry/exit thresholds',
  );
  const [profit, entryThreshold, exitThreshold] = financials.amounts;
  if (
    profit === undefined ||
    entryThreshold === undefined ||
    exitThreshold === undefined
  ) {
    kernelInvalid('firm entry/exit thresholds are required');
  }
  if (entryThreshold.lessThan(exitThreshold)) {
    kernelInvalid('entry threshold must not be below exit threshold');
  }
  const entryRate = parsedFirmCountPerCurrency(
    input.entryFirmsPerCurrency,
    financials.currency,
    'entryFirmsPerCurrency',
  );
  const exitRate = parsedFirmCountPerCurrency(
    input.exitFirmsPerCurrency,
    financials.currency,
    'exitFirmsPerCurrency',
  );
  const capacity = nonNegativeQuantity(
    input.currentCapacity,
    'currentCapacity',
  );
  const employment = wholeNonNegativeQuantity(
    input.currentEmployment,
    'currentEmployment',
    'person',
  );
  const margin = quantity(input.currentMargin, 'currentMargin');
  const capacityPerFirm = parsedQuantityRate(
    input.capacityPerFirm,
    'firm',
    capacity.unit,
    'capacityPerFirm',
  );
  const jobsPerFirm = parsedQuantityRate(
    input.jobsPerFirm,
    'firm',
    'person',
    'jobsPerFirm',
  );
  if (!jobsPerFirm.isInteger()) {
    kernelInvalid('jobsPerFirm must yield a whole person count per firm');
  }
  const marginCompression = parsedQuantityRate(
    input.marginCompressionPerNewFirm,
    'firm',
    margin.unit,
    'marginCompressionPerNewFirm',
  );

  const entries = wholeFloor(
    nonNegativeDifference(profit, entryThreshold).times(entryRate),
  );
  const exits = minimum(
    [
      firms.amount,
      wholeFloor(nonNegativeDifference(exitThreshold, profit).times(exitRate)),
    ],
    'firm exits',
  );
  const netFirmChange = entries.minus(exits);
  const nextFirmCount = firms.amount.plus(netFirmChange);
  const capacityDelta = netFirmChange.times(capacityPerFirm);
  const employmentDelta = netFirmChange.times(jobsPerFirm);
  const nextCapacity = capacity.amount.plus(capacityDelta);
  const nextEmployment = employment.amount.plus(employmentDelta);
  if (nextCapacity.isNegative() || nextEmployment.isNegative()) {
    kernelInvalid(
      'entry/exit rates cannot produce negative sector capacity or employment',
    );
  }
  const marginDelta = entries.times(marginCompression).negated();
  return Object.freeze({
    firmEntries: quantityResult(entries, 'firm'),
    firmExits: quantityResult(exits, 'firm'),
    nextFirmCount: quantityResult(nextFirmCount, 'firm'),
    capacityDelta: quantityResult(capacityDelta, capacity.unit),
    nextCapacity: quantityResult(nextCapacity, capacity.unit),
    employmentDelta: quantityResult(employmentDelta, 'person'),
    nextEmployment: quantityResult(nextEmployment, 'person'),
    marginDelta: quantityResult(marginDelta, margin.unit),
    nextMargin: quantityResult(margin.amount.plus(marginDelta), margin.unit),
  });
}

export type FirmResolutionDirective = 'NONE' | 'RESTRUCTURE' | 'LIQUIDATE';

export type FirmFinancialCondition =
  | 'HEALTHY'
  | 'CASH_FLOW_STRESSED'
  | 'TECHNICAL_DEFAULT'
  | 'INSOLVENT'
  | 'RESTRUCTURING'
  | 'LIQUIDATION';

export interface FirmDistressInput {
  readonly cashAvailable: ExactMoney;
  readonly operatingCashFlowBeforeDebtService: ExactMoney;
  readonly debtServiceDue: ExactMoney;
  readonly liquidatableAssets: ExactMoney;
  readonly totalLiabilities: ExactMoney;
  readonly directive: FirmResolutionDirective;
}

export interface FirmDistressAssessment {
  readonly condition: FirmFinancialCondition;
  readonly cashAvailableForDebtService: ExactMoney;
  readonly debtServiceShortfall: ExactMoney;
  readonly netWorth: ExactMoney;
}

/**
 * C102. Separates a temporary cash-flow stress, technical default, negative
 * net worth, restructuring and liquidation without deciding a resolution.
 */
export function assessFirmDistress(
  input: FirmDistressInput,
): FirmDistressAssessment {
  const values = sameCurrency(
    [
      input.cashAvailable,
      input.operatingCashFlowBeforeDebtService,
      input.debtServiceDue,
      input.liquidatableAssets,
      input.totalLiabilities,
    ],
    'firm distress',
  );
  const [cash, operatingCashFlow, debtServiceDue, assets, liabilities] =
    values.amounts;
  if (
    operatingCashFlow === undefined ||
    debtServiceDue === undefined ||
    assets === undefined ||
    liabilities === undefined
  ) {
    kernelInvalid('firm distress values are required');
  }
  if (cash === undefined || cash.isNegative()) {
    kernelInvalid('cashAvailable must be non-negative');
  }
  if (
    debtServiceDue.isNegative() ||
    assets.isNegative() ||
    liabilities.isNegative()
  ) {
    kernelInvalid('debt service, assets and liabilities must be non-negative');
  }
  const cashAvailableForDebtService = cash.plus(operatingCashFlow);
  const available = cashAvailableForDebtService.isNegative()
    ? decimal('0', 'zero')
    : cashAvailableForDebtService;
  const debtServiceShortfall = nonNegativeDifference(debtServiceDue, available);
  const netWorth = assets.minus(liabilities);
  let condition: FirmFinancialCondition;
  if (netWorth.isNegative()) condition = 'INSOLVENT';
  else if (!debtServiceShortfall.isZero()) condition = 'TECHNICAL_DEFAULT';
  else if (operatingCashFlow.isNegative()) condition = 'CASH_FLOW_STRESSED';
  else condition = 'HEALTHY';

  if (input.directive !== 'NONE' && condition === 'HEALTHY') {
    kernelInvalid('a healthy firm cannot enter restructuring or liquidation');
  }
  if (input.directive === 'RESTRUCTURE') condition = 'RESTRUCTURING';
  if (input.directive === 'LIQUIDATE') condition = 'LIQUIDATION';
  return Object.freeze({
    condition,
    cashAvailableForDebtService: renderMoney(available, values.currency),
    debtServiceShortfall: renderMoney(debtServiceShortfall, values.currency),
    netWorth: renderMoney(netWorth, values.currency),
  });
}

export interface FirmFailureEffectsInput {
  readonly assessment: FirmDistressAssessment;
  readonly workforce: ExactQuantity;
  readonly liquidatableAssetBookValue: ExactMoney;
  readonly supplierTradeCredit: ExactMoney;
  readonly bankDebt: ExactMoney;
  readonly layoffFraction: ExactRatio;
  readonly assetRecoveryFraction: ExactRatio;
  readonly supplierNonpaymentFraction: ExactRatio;
  readonly bankNplFraction: ExactRatio;
}

export interface FirmFailureEffects {
  readonly layoffs: ExactQuantity;
  readonly retainedWorkforce: ExactQuantity;
  readonly liquidatedAssetRecovery: ExactMoney;
  readonly supplierLosses: ExactMoney;
  readonly bankNpl: ExactMoney;
}

/**
 * Quantifies the C102 spillovers only for a caller-authorized liquidation.
 * Fractions are explicit and exact; there is no hidden recovery convention.
 */
export function calculateFirmFailureEffects(
  input: FirmFailureEffectsInput,
): FirmFailureEffects {
  if (input.assessment.condition !== 'LIQUIDATION') {
    kernelInvalid('firm failure effects require a LIQUIDATION assessment');
  }
  const workforce = wholeNonNegativeQuantity(
    input.workforce,
    'workforce',
    'person',
  );
  const monetary = sameCurrency(
    [
      input.liquidatableAssetBookValue,
      input.supplierTradeCredit,
      input.bankDebt,
      input.assessment.netWorth,
    ],
    'firm failure effects',
  );
  const [assets, supplierTradeCredit, bankDebt] = monetary.amounts;
  if (
    assets === undefined ||
    supplierTradeCredit === undefined ||
    bankDebt === undefined
  ) {
    kernelInvalid('firm failure monetary values are required');
  }
  if (
    assets.isNegative() ||
    supplierTradeCredit.isNegative() ||
    bankDebt.isNegative()
  ) {
    kernelInvalid(
      'firm failure assets and debt exposures must be non-negative',
    );
  }
  const layoffs = wholeFloor(
    workforce.amount.times(ratio(input.layoffFraction, 'layoffFraction')),
  );
  const liquidatedAssetRecovery = assets.times(
    ratio(input.assetRecoveryFraction, 'assetRecoveryFraction'),
  );
  const supplierLosses = supplierTradeCredit.times(
    ratio(input.supplierNonpaymentFraction, 'supplierNonpaymentFraction'),
  );
  const bankNpl = bankDebt.times(
    ratio(input.bankNplFraction, 'bankNplFraction'),
  );
  return Object.freeze({
    layoffs: quantityResult(layoffs, 'person'),
    retainedWorkforce: quantityResult(
      workforce.amount.minus(layoffs),
      'person',
    ),
    liquidatedAssetRecovery: renderMoney(
      liquidatedAssetRecovery,
      monetary.currency,
    ),
    supplierLosses: renderMoney(supplierLosses, monetary.currency),
    bankNpl: renderMoney(bankNpl, monetary.currency),
  });
}

export interface FirmEnergyProfile {
  readonly firmId: string;
  readonly profitBeforeEnergyShock: ExactMoney;
  readonly energyUse: ExactQuantity;
  readonly productivity: ExactQuantity;
}

export interface FirmSelectionInput {
  readonly firms: readonly FirmEnergyProfile[];
  readonly energyPriceIncrease: ExactUnitPriceIncrease;
  readonly exitProfitThresholdPerFirm: ExactMoney;
}

export interface FirmSelectionOutcome {
  readonly firmId: string;
  readonly additionalEnergyCost: ExactMoney;
  readonly profitAfterEnergyShock: ExactMoney;
  readonly exits: boolean;
}

export interface FirmSelectionResult {
  readonly outcomes: readonly FirmSelectionOutcome[];
  readonly exitingFirmCount: ExactQuantity;
  readonly survivingFirmCount: ExactQuantity;
  readonly averageProductivityBefore: ExactQuantity;
  readonly averageProductivityAfter: ExactQuantity | null;
}

/**
 * C103. Prices an energy shock in currency per physical energy unit, assesses
 * each firm separately, and reports the exact compositional selection effect.
 */
export function calculateFirmSelection(
  input: FirmSelectionInput,
): FirmSelectionResult {
  if (input.firms.length === 0) kernelInvalid('firm selection requires a firm');
  const priceCurrency = parsedMoney(
    { amount: '0', currency: input.energyPriceIncrease.currency },
    'energyPriceIncrease currency',
  ).currency;
  const priceIncrease = nonNegative(
    input.energyPriceIncrease.amount,
    'energyPriceIncrease amount',
  );
  const energyUnit = canonicalUnit(
    input.energyPriceIncrease.perUnit,
    'energyPriceIncrease perUnit',
  );
  const threshold = parsedMoney(
    input.exitProfitThresholdPerFirm,
    'exitProfitThresholdPerFirm',
  );
  if (threshold.currency !== priceCurrency) {
    kernelInvalid('energy price and exit threshold currencies must match');
  }
  const seen = new Set<string>();
  let productivityUnit: string | undefined;
  let productivityTotal = decimal('0', 'zero');
  let survivingProductivityTotal = decimal('0', 'zero');
  let exiting = decimal('0', 'zero');
  let surviving = decimal('0', 'zero');
  const outcomes: FirmSelectionOutcome[] = [];
  for (const profile of input.firms) {
    const firmId = stableIdentifier(profile.firmId, 'firmId');
    if (seen.has(firmId))
      kernelInvalid('firm selection firmIds must be unique');
    seen.add(firmId);
    const profit = parsedMoney(profile.profitBeforeEnergyShock, firmId);
    if (profit.currency !== priceCurrency) {
      kernelInvalid('firm selection profit currency must match energy price');
    }
    const energyUse = nonNegativeQuantity(
      profile.energyUse,
      `${firmId} energyUse`,
      energyUnit,
    );
    const productivity = nonNegativeQuantity(
      profile.productivity,
      `${firmId} productivity`,
    );
    if (productivityUnit === undefined) productivityUnit = productivity.unit;
    if (productivity.unit !== productivityUnit) {
      kernelInvalid('firm selection productivity units must match');
    }
    const additionalEnergyCost = energyUse.amount.times(priceIncrease);
    const profitAfterEnergyShock = profit.amount.minus(additionalEnergyCost);
    const exits = profitAfterEnergyShock.lessThan(threshold.amount);
    productivityTotal = productivityTotal.plus(productivity.amount);
    if (exits) exiting = exiting.plus(1);
    else {
      surviving = surviving.plus(1);
      survivingProductivityTotal = survivingProductivityTotal.plus(
        productivity.amount,
      );
    }
    outcomes.push(
      Object.freeze({
        firmId,
        additionalEnergyCost: renderMoney(additionalEnergyCost, priceCurrency),
        profitAfterEnergyShock: renderMoney(
          profitAfterEnergyShock,
          priceCurrency,
        ),
        exits,
      }),
    );
  }
  const firmCount = decimal(String(input.firms.length), 'firm count');
  return Object.freeze({
    outcomes: Object.freeze(outcomes),
    exitingFirmCount: quantityResult(exiting, 'firm'),
    survivingFirmCount: quantityResult(surviving, 'firm'),
    averageProductivityBefore: quantityResult(
      productivityTotal.dividedBy(firmCount),
      productivityUnit ?? 'unit',
    ),
    averageProductivityAfter: surviving.isZero()
      ? null
      : quantityResult(
          survivingProductivityTotal.dividedBy(surviving),
          productivityUnit ?? 'unit',
        ),
  });
}

export interface StartupFormationInput {
  readonly qualifiedFounders: ExactQuantity;
  readonly seedFinanceAvailable: ExactMoney;
  readonly minimumSeedFinancePerStartup: ExactMoney;
  readonly marketOpportunitySlots: ExactQuantity;
  readonly institutionalProcessingSlots: ExactQuantity;
  readonly formationRate: ExactRatio;
  readonly jobsPerStartup: ExactQuantityRate;
  readonly innovationPerStartup: ExactQuantityRate;
  readonly earlyFailureRate: ExactRatio;
  readonly scaleUpRate: ExactRatio;
}

export interface StartupFormationResult {
  readonly financeConstrainedStartupCapacity: ExactQuantity;
  readonly eligibleFounderCapacity: ExactQuantity;
  readonly startupsFormed: ExactQuantity;
  readonly earlyStartupFailures: ExactQuantity;
  readonly survivingStartups: ExactQuantity;
  readonly scaleUpFirms: ExactQuantity;
  readonly startupEmploymentAdded: ExactQuantity;
  readonly entrepreneurialInnovationAdded: ExactQuantity;
  readonly seedFinanceCommitted: ExactMoney;
  readonly seedFinanceRemaining: ExactMoney;
}

/**
 * C104. Translates actual founder, funding, market and administrative
 * capacities into a discrete startup cohort and its exact early outcomes.
 */
export function calculateStartupFormation(
  input: StartupFormationInput,
): StartupFormationResult {
  const founders = wholeNonNegativeQuantity(
    input.qualifiedFounders,
    'qualifiedFounders',
    'person',
  );
  const opportunities = wholeNonNegativeQuantity(
    input.marketOpportunitySlots,
    'marketOpportunitySlots',
    'opportunity',
  );
  const processing = wholeNonNegativeQuantity(
    input.institutionalProcessingSlots,
    'institutionalProcessingSlots',
    'permit',
  );
  const finance = sameCurrency(
    [input.seedFinanceAvailable, input.minimumSeedFinancePerStartup],
    'startup finance',
  );
  const [availableFinance, minimumSeedFinance] = finance.amounts;
  if (availableFinance === undefined || minimumSeedFinance === undefined) {
    kernelInvalid('startup finance values are required');
  }
  if (availableFinance.isNegative() || !minimumSeedFinance.isPositive()) {
    kernelInvalid(
      'startup available finance must be non-negative and seed finance positive',
    );
  }
  const jobsPerStartup = parsedQuantityRate(
    input.jobsPerStartup,
    'firm',
    'person',
    'jobsPerStartup',
  );
  if (!jobsPerStartup.isInteger()) {
    kernelInvalid('jobsPerStartup must yield a whole person count per firm');
  }
  const innovationUnit = canonicalUnit(
    input.innovationPerStartup.outputUnit,
    'innovationPerStartup outputUnit',
  );
  const innovationPerStartup = parsedQuantityRate(
    input.innovationPerStartup,
    'firm',
    innovationUnit,
    'innovationPerStartup',
  );
  const financeCapacity = wholeFloor(
    availableFinance.dividedBy(minimumSeedFinance),
  );
  const eligible = minimum(
    [founders.amount, financeCapacity, opportunities.amount, processing.amount],
    'startup eligibility',
  );
  const startups = wholeFloor(
    eligible.times(ratio(input.formationRate, 'formationRate')),
  );
  const failures = wholeFloor(
    startups.times(ratio(input.earlyFailureRate, 'earlyFailureRate')),
  );
  const survivors = startups.minus(failures);
  const scaleUps = wholeFloor(
    survivors.times(ratio(input.scaleUpRate, 'scaleUpRate')),
  );
  const committed = startups.times(minimumSeedFinance);
  return Object.freeze({
    financeConstrainedStartupCapacity: quantityResult(financeCapacity, 'firm'),
    eligibleFounderCapacity: quantityResult(eligible, 'person'),
    startupsFormed: quantityResult(startups, 'firm'),
    earlyStartupFailures: quantityResult(failures, 'firm'),
    survivingStartups: quantityResult(survivors, 'firm'),
    scaleUpFirms: quantityResult(scaleUps, 'firm'),
    startupEmploymentAdded: quantityResult(
      startups.times(jobsPerStartup),
      'person',
    ),
    entrepreneurialInnovationAdded: quantityResult(
      startups.times(innovationPerStartup),
      innovationUnit,
    ),
    seedFinanceCommitted: renderMoney(committed, finance.currency),
    seedFinanceRemaining: renderMoney(
      availableFinance.minus(committed),
      finance.currency,
    ),
  });
}

export type SoeContinuationStatus =
  'SUSTAINED' | 'EXIT_OR_RESTRUCTURING_REQUIRED';

export interface SoeSoftBudgetInput {
  readonly operatingLoss: ExactMoney;
  readonly governmentGuaranteeCapacity: ExactMoney;
  readonly bankRolloverCreditCapacity: ExactMoney;
  readonly capitalLocked: ExactMoney;
  readonly labourLocked: ExactQuantity;
}

export interface SoeSoftBudgetResult {
  readonly governmentGuaranteeDrawn: ExactMoney;
  readonly bankRolloverCreditDrawn: ExactMoney;
  readonly uncoveredLoss: ExactMoney;
  readonly futureFiscalLiability: ExactMoney;
  readonly capitalLocked: ExactMoney;
  readonly labourLocked: ExactQuantity;
  readonly continuationStatus: SoeContinuationStatus;
}

/**
 * C105. Quantifies the exact government/bank support needed to keep a loss
 * making SOE operating. It reports factor lock-in and liability; it does not
 * authorize the guarantee, lending, exit, or productivity settlement.
 */
export function calculateSoeSoftBudgetConstraint(
  input: SoeSoftBudgetInput,
): SoeSoftBudgetResult {
  const monetary = sameCurrency(
    [
      input.operatingLoss,
      input.governmentGuaranteeCapacity,
      input.bankRolloverCreditCapacity,
      input.capitalLocked,
    ],
    'SOE soft-budget constraint',
  );
  const [loss, guaranteeCapacity, bankCapacity, capitalLocked] =
    monetary.amounts;
  if (
    loss === undefined ||
    guaranteeCapacity === undefined ||
    bankCapacity === undefined ||
    capitalLocked === undefined
  ) {
    kernelInvalid('SOE soft-budget monetary values are required');
  }
  if (
    loss.isNegative() ||
    guaranteeCapacity.isNegative() ||
    bankCapacity.isNegative() ||
    capitalLocked.isNegative()
  ) {
    kernelInvalid(
      'SOE losses, support capacities and capital lock-in must be non-negative',
    );
  }
  const labourLocked = wholeNonNegativeQuantity(
    input.labourLocked,
    'labourLocked',
    'person',
  );
  const governmentGuaranteeDrawn = minimum(
    [loss, guaranteeCapacity],
    'government guarantee draw',
  );
  const bankRolloverCreditDrawn = minimum(
    [nonNegativeDifference(loss, governmentGuaranteeDrawn), bankCapacity],
    'bank rollover credit draw',
  );
  const uncoveredLoss = nonNegativeDifference(
    loss,
    governmentGuaranteeDrawn.plus(bankRolloverCreditDrawn),
  );
  return Object.freeze({
    governmentGuaranteeDrawn: renderMoney(
      governmentGuaranteeDrawn,
      monetary.currency,
    ),
    bankRolloverCreditDrawn: renderMoney(
      bankRolloverCreditDrawn,
      monetary.currency,
    ),
    uncoveredLoss: renderMoney(uncoveredLoss, monetary.currency),
    futureFiscalLiability: renderMoney(
      governmentGuaranteeDrawn,
      monetary.currency,
    ),
    capitalLocked: renderMoney(capitalLocked, monetary.currency),
    labourLocked: quantityResult(labourLocked.amount, 'person'),
    continuationStatus: uncoveredLoss.isZero()
      ? 'SUSTAINED'
      : 'EXIT_OR_RESTRUCTURING_REQUIRED',
  });
}
