import {
  exactQuantityTransition,
  foundationFactPayload,
  foundationReplayProof,
  type FoundationFact,
  type FoundationTraceRequest,
  type V13V14FoundationReplayProof,
} from './foundation-provenance.js';
import {
  kernelInvalid,
  minimum,
  money,
  nonNegative,
  nonNegativeQuantity,
  ratio,
  render,
  renderMoney,
  renderQuantity,
  type ExactMoney,
  type ExactQuantity,
  type ExactRatio,
  type WorldDecimalValue,
} from './common.js';

/** Pure V21 preparation only; no order-book, customs, stock, or ledger write. */
export const TRADE_LOGISTICS_FOUNDATION_STATUS =
  'FOUNDATION_IMPLEMENTED_UNVERIFIED' as const;

export type TradeLogisticsTraceRequest = FoundationTraceRequest;
export type TradeLogisticsFact<T> = FoundationFact<T>;
export type TradeDirection = 'IMPORT' | 'EXPORT';
export type TariffSource = 'GENERAL' | 'BILATERAL' | 'TREATY';
export type TradeControlKind = 'BAN' | 'SANCTION_BAN' | 'QUOTA' | 'EXPORT_CAP';

const REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;

function ref(value: string, label: string): string {
  if (!REFERENCE.test(value))
    kernelInvalid(`${label} must be a stable reference`);
  return value;
}

function tick(value: ExactQuantity, label: string): WorldDecimalValue {
  const parsed = nonNegativeQuantity(value, 'sim_millisecond', label).amount;
  if (!parsed.isInteger())
    kernelInvalid(`${label} must be an integer sim_millisecond tick`);
  return parsed;
}

function physical(
  value: ExactQuantity,
  label: string,
): { amount: WorldDecimalValue; unit: string } {
  const parsed = nonNegativeQuantity(value, value.unit, label);
  if (
    parsed.unit === 'person' ||
    parsed.unit === 'case' ||
    parsed.unit === 'ratio'
  ) {
    kernelInvalid(`${label} must use a commodity unit`);
  }
  return parsed;
}

function sameCommodity(
  values: readonly {
    readonly amount: WorldDecimalValue;
    readonly unit: string;
  }[],
  label: string,
): string {
  const first = values[0];
  if (first === undefined) kernelInvalid(`${label} requires a quantity`);
  if (values.some((value) => value.unit !== first.unit)) {
    kernelInvalid(`${label} commodity units must match`);
  }
  return first.unit;
}

function activeAt(
  evaluatedAt: WorldDecimalValue,
  effectiveAt: ExactQuantity,
  expiryAt: ExactQuantity | null,
  label: string,
): void {
  const start = tick(effectiveAt, `${label}.effectiveAt`);
  if (evaluatedAt.lessThan(start)) kernelInvalid(`${label} is not effective`);
  if (
    expiryAt !== null &&
    !evaluatedAt.lessThan(tick(expiryAt, `${label}.expiryAt`))
  ) {
    kernelInvalid(`${label} is expired`);
  }
}

export interface TariffPolicy {
  readonly policyRef: string;
  readonly importerCountryRef: string;
  readonly exporterCountryRef: string | null;
  readonly commodityRef: string;
  readonly rate: ExactRatio;
  readonly effectiveAt: ExactQuantity;
  readonly expiryAt: ExactQuantity | null;
}

export interface TradeControl {
  readonly controlRef: string;
  readonly kind: TradeControlKind;
  readonly direction: TradeDirection;
  readonly enforcingCountryRef: string;
  readonly counterpartyCountryRef: string | null;
  readonly commodityRef: string;
  readonly effectiveAt: ExactQuantity;
  readonly expiryAt: ExactQuantity | null;
  /** Mandatory only for quota/cap; consumption/reservation are caller facts. */
  readonly quantityLimit: ExactQuantity | null;
  readonly deliveredQuantity: ExactQuantity | null;
  readonly reservedQuantity: ExactQuantity | null;
}

export interface TradeEligibilityRequest {
  readonly requestRef: string;
  readonly importerCountryRef: string;
  readonly exporterCountryRef: string;
  readonly commodityRef: string;
  readonly direction: TradeDirection;
  readonly requestedQuantity: ExactQuantity;
  readonly evaluatedAt: ExactQuantity;
}

export interface TradeEligibilityResult {
  readonly foundationStatus: typeof TRADE_LOGISTICS_FOUNDATION_STATUS;
  readonly requestRef: string;
  readonly decision: 'ALLOWED' | 'BLOCKED';
  readonly blockReason: 'BAN_OR_SANCTION' | 'QUOTA_OR_CAP_EXHAUSTED' | null;
  readonly effectiveTariffRate: ExactRatio | null;
  readonly tariffSource: TariffSource | null;
  readonly permittedQuantity: ExactQuantity;
  readonly bindingControlRefs: readonly string[];
  readonly replayProof: V13V14FoundationReplayProof;
}

function policyMatches(
  policy: TariffPolicy,
  request: TradeEligibilityRequest,
  exporter: string | null,
  evaluatedAt: WorldDecimalValue,
): WorldDecimalValue {
  if (
    policy.importerCountryRef !== request.importerCountryRef ||
    policy.exporterCountryRef !== exporter ||
    policy.commodityRef !== request.commodityRef
  ) {
    kernelInvalid(
      'Tariff policy does not match the importer/exporter/commodity request',
    );
  }
  activeAt(evaluatedAt, policy.effectiveAt, policy.expiryAt, 'tariff policy');
  return ratio(policy.rate, 'tariff policy rate');
}

function controlMatches(
  control: TradeControl,
  request: TradeEligibilityRequest,
  evaluatedAt: WorldDecimalValue,
): boolean {
  ref(control.controlRef, 'controlRef');
  if (
    control.direction !== request.direction ||
    control.commodityRef !== request.commodityRef
  ) {
    return false;
  }
  const subject =
    request.direction === 'IMPORT'
      ? request.importerCountryRef
      : request.exporterCountryRef;
  const counterparty =
    request.direction === 'IMPORT'
      ? request.exporterCountryRef
      : request.importerCountryRef;
  if (
    control.enforcingCountryRef !== subject ||
    (control.counterpartyCountryRef !== null &&
      control.counterpartyCountryRef !== counterparty)
  )
    return false;
  activeAt(
    evaluatedAt,
    control.effectiveAt,
    control.expiryAt,
    `control ${control.controlRef}`,
  );
  return true;
}

function controlRemaining(
  control: TradeControl,
  expectedUnit: string,
): WorldDecimalValue {
  if (
    control.quantityLimit === null ||
    control.deliveredQuantity === null ||
    control.reservedQuantity === null
  )
    kernelInvalid(
      `Control ${control.controlRef} requires explicit limit, delivered, and reserved quantities`,
    );
  const limit = physical(control.quantityLimit, 'control.quantityLimit');
  const delivered = physical(
    control.deliveredQuantity,
    'control.deliveredQuantity',
  );
  const reserved = physical(
    control.reservedQuantity,
    'control.reservedQuantity',
  );
  if (
    limit.unit !== expectedUnit ||
    delivered.unit !== expectedUnit ||
    reserved.unit !== expectedUnit
  ) {
    kernelInvalid('Control quantities must use the requested commodity unit');
  }
  const remaining = limit.amount.minus(delivered.amount).minus(reserved.amount);
  if (remaining.isNegative())
    kernelInvalid(
      `Control ${control.controlRef} has over-consumed its quantity`,
    );
  return remaining;
}

/**
 * Single resolver for treaty/bilateral/general tariff precedence and concrete
 * controls. It only reports an eligibility fact for V21.1; it never reserves
 * quota, creates an order, or collects a tariff.
 */
export function resolveTradeEligibility(input: {
  readonly trace: TradeLogisticsTraceRequest;
  readonly requestFact: TradeLogisticsFact<TradeEligibilityRequest>;
  readonly generalTariffFact: TradeLogisticsFact<TariffPolicy>;
  readonly bilateralTariffFact: TradeLogisticsFact<TariffPolicy> | null;
  readonly treatyTariffFact: TradeLogisticsFact<TariffPolicy> | null;
  readonly controlsFact: TradeLogisticsFact<readonly TradeControl[]>;
  readonly outputRef: string;
}): TradeEligibilityResult {
  const request = foundationFactPayload(
    input.trace,
    input.requestFact,
    'requestFact',
  );
  const general = foundationFactPayload(
    input.trace,
    input.generalTariffFact,
    'generalTariffFact',
  );
  const bilateral =
    input.bilateralTariffFact === null
      ? null
      : foundationFactPayload(
          input.trace,
          input.bilateralTariffFact,
          'bilateralTariffFact',
        );
  const treaty =
    input.treatyTariffFact === null
      ? null
      : foundationFactPayload(
          input.trace,
          input.treatyTariffFact,
          'treatyTariffFact',
        );
  const controls = foundationFactPayload(
    input.trace,
    input.controlsFact,
    'controlsFact',
  );
  const evaluatedAt = tick(request.evaluatedAt, 'request.evaluatedAt');
  ref(request.requestRef, 'requestRef');
  ref(request.importerCountryRef, 'importerCountryRef');
  ref(request.exporterCountryRef, 'exporterCountryRef');
  ref(request.commodityRef, 'commodityRef');
  if (request.importerCountryRef === request.exporterCountryRef)
    kernelInvalid('Trade eligibility requires different countries');
  const requested = physical(request.requestedQuantity, 'requestedQuantity');
  const generalRate = policyMatches(general, request, null, evaluatedAt);
  const bilateralRate =
    bilateral === null
      ? null
      : policyMatches(
          bilateral,
          request,
          request.exporterCountryRef,
          evaluatedAt,
        );
  const treatyRate =
    treaty === null
      ? null
      : policyMatches(treaty, request, request.exporterCountryRef, evaluatedAt);
  const tariffRate = treatyRate ?? bilateralRate ?? generalRate;
  const tariffSource: TariffSource =
    treatyRate !== null
      ? 'TREATY'
      : bilateralRate !== null
        ? 'BILATERAL'
        : 'GENERAL';
  const matchingControls = controls.filter((control) =>
    controlMatches(control, request, evaluatedAt),
  );
  const blocking = matchingControls.filter(
    (control) => control.kind === 'BAN' || control.kind === 'SANCTION_BAN',
  );
  const quantityControls = matchingControls.filter(
    (control) => control.kind === 'QUOTA' || control.kind === 'EXPORT_CAP',
  );
  const permitted =
    quantityControls.length === 0
      ? requested.amount
      : minimum(
          [
            requested.amount,
            ...quantityControls.map((control) =>
              controlRemaining(control, requested.unit),
            ),
          ],
          'permitted quantity',
        );
  const blockedByQuantity = permitted.isZero() && !requested.amount.isZero();
  const decision =
    blocking.length > 0 || blockedByQuantity ? 'BLOCKED' : 'ALLOWED';
  const blockReason =
    blocking.length > 0
      ? 'BAN_OR_SANCTION'
      : blockedByQuantity
        ? 'QUOTA_OR_CAP_EXHAUSTED'
        : null;
  const permittedQuantity = renderQuantity(
    decision === 'BLOCKED' ? nonNegative('0', 'blocked quantity') : permitted,
    requested.unit,
  );
  const result = Object.freeze({
    foundationStatus: TRADE_LOGISTICS_FOUNDATION_STATUS,
    requestRef: request.requestRef,
    decision,
    blockReason,
    effectiveTariffRate:
      decision === 'BLOCKED'
        ? null
        : Object.freeze({ amount: render(tariffRate), unit: 'ratio' as const }),
    tariffSource: decision === 'BLOCKED' ? null : tariffSource,
    permittedQuantity,
    bindingControlRefs: Object.freeze(
      matchingControls.map((control) => ref(control.controlRef, 'controlRef')),
    ),
    replayProof: foundationReplayProof({
      module: 'V21_TARIFF_CUSTOMS_SHIPMENT',
      trace: input.trace,
      inputFacts: [
        input.requestFact,
        input.generalTariffFact,
        input.controlsFact,
        ...(input.bilateralTariffFact === null
          ? []
          : [input.bilateralTariffFact]),
        ...(input.treatyTariffFact === null ? [] : [input.treatyTariffFact]),
      ],
      outputs: [
        {
          outputRef: input.outputRef,
          payload: {
            decision,
            blockReason,
            effectiveTariffRate:
              decision === 'BLOCKED' ? null : render(tariffRate),
            tariffSource: decision === 'BLOCKED' ? null : tariffSource,
            permittedQuantity,
          },
        },
      ],
      transitions: [],
    }),
  });
  return result;
}

export interface CustomsDeclaration {
  readonly declarationRef: string;
  readonly contractRef: string;
  readonly shipmentRef: string;
  readonly importerCountryRef: string;
  readonly exporterCountryRef: string;
  readonly commodityRef: string;
  readonly customsValue: ExactMoney;
  readonly transportCost: ExactMoney;
  readonly insuranceCost: ExactMoney;
  readonly borderFees: ExactMoney;
  readonly declaredAt: ExactQuantity;
}

export interface CustomsAssessment {
  readonly foundationStatus: typeof TRADE_LOGISTICS_FOUNDATION_STATUS;
  readonly assessmentRef: string;
  readonly declarationRef: string;
  readonly tariffDue: ExactMoney;
  readonly landedCost: ExactMoney;
  readonly collectionEligible: true;
  readonly replayProof: V13V14FoundationReplayProof;
}

export interface CustomsCollectionWitness {
  readonly witnessRef: string;
  readonly previouslyAssessedRefs: readonly string[];
}

/** Tariff is assessed once per caller-scoped assessment reference; no posting occurs. */
export function assessCustomsTariff(input: {
  readonly trace: TradeLogisticsTraceRequest;
  readonly declarationFact: TradeLogisticsFact<CustomsDeclaration>;
  readonly eligibilityFact: TradeLogisticsFact<TradeEligibilityResult>;
  readonly collectionWitnessFact: TradeLogisticsFact<CustomsCollectionWitness>;
  readonly assessmentRef: string;
}): CustomsAssessment {
  const declaration = foundationFactPayload(
    input.trace,
    input.declarationFact,
    'declarationFact',
  );
  const eligibility = foundationFactPayload(
    input.trace,
    input.eligibilityFact,
    'eligibilityFact',
  );
  const witness = foundationFactPayload(
    input.trace,
    input.collectionWitnessFact,
    'collectionWitnessFact',
  );
  const assessmentRef = ref(input.assessmentRef, 'assessmentRef');
  ref(witness.witnessRef, 'collectionWitnessRef');
  if (
    witness.previouslyAssessedRefs
      .map((value) => ref(value, 'previouslyAssessedRef'))
      .includes(assessmentRef)
  ) {
    kernelInvalid('Tariff assessment has already been collected');
  }
  if (
    eligibility.decision !== 'ALLOWED' ||
    eligibility.effectiveTariffRate === null
  ) {
    kernelInvalid('Customs cannot assess a blocked trade eligibility result');
  }
  tick(declaration.declaredAt, 'declaration.declaredAt');
  const value = money(declaration.customsValue, 'customsValue');
  const transport = money(declaration.transportCost, 'transportCost');
  const insurance = money(declaration.insuranceCost, 'insuranceCost');
  const fees = money(declaration.borderFees, 'borderFees');
  if (
    value.amount.isNegative() ||
    transport.amount.isNegative() ||
    insurance.amount.isNegative() ||
    fees.amount.isNegative()
  )
    kernelInvalid('Customs amounts must be non-negative');
  if (
    new Set([
      value.currency,
      transport.currency,
      insurance.currency,
      fees.currency,
    ]).size !== 1
  )
    kernelInvalid('Customs amounts must share a currency');
  const tariff = value.amount.times(
    ratio(eligibility.effectiveTariffRate, 'effectiveTariffRate'),
  );
  const tariffDue = renderMoney(tariff, value.currency);
  const landedCost = renderMoney(
    value.amount
      .plus(transport.amount)
      .plus(insurance.amount)
      .plus(tariff)
      .plus(fees.amount),
    value.currency,
  );
  return Object.freeze({
    foundationStatus: TRADE_LOGISTICS_FOUNDATION_STATUS,
    assessmentRef,
    declarationRef: ref(declaration.declarationRef, 'declarationRef'),
    tariffDue,
    landedCost,
    collectionEligible: true,
    replayProof: foundationReplayProof({
      module: 'V21_TARIFF_CUSTOMS_SHIPMENT',
      trace: input.trace,
      inputFacts: [
        input.declarationFact,
        input.eligibilityFact,
        input.collectionWitnessFact,
      ],
      outputs: [
        {
          outputRef: assessmentRef,
          payload: { tariffDue, landedCost, collectionEligible: true },
        },
      ],
      transitions: [],
    }),
  });
}

export interface ShipmentTransitSnapshot {
  readonly shipmentRef: string;
  readonly contractRef: string;
  readonly commodityRef: string;
  readonly totalQuantity: ExactQuantity;
  readonly inTransitQuantity: ExactQuantity;
  readonly deliveredQuantity: ExactQuantity;
  readonly lostQuantity: ExactQuantity;
  readonly status: 'IN_TRANSIT' | 'DELAYED' | 'DELIVERED' | 'LOST';
  readonly dispatchedAt: ExactQuantity;
  readonly expiryAt: ExactQuantity;
}

export interface LogisticsCapacity {
  readonly capacityRef: string;
  readonly portRemaining: ExactQuantity;
  readonly railRemaining: ExactQuantity;
  readonly storageRemaining: ExactQuantity;
  readonly measuredAt: ExactQuantity;
}

export interface ShipmentOutcomeReport {
  readonly reportRef: string;
  readonly shipmentRef: string;
  readonly deliveredQuantity: ExactQuantity;
  readonly lostQuantity: ExactQuantity;
  readonly reportedAt: ExactQuantity;
}

export interface ShipmentLogisticsResult {
  readonly foundationStatus: typeof TRADE_LOGISTICS_FOUNDATION_STATUS;
  readonly shipment: ShipmentTransitSnapshot;
  readonly destinationAvailableIncrease: ExactQuantity;
  readonly portConsumed: ExactQuantity;
  readonly railConsumed: ExactQuantity;
  readonly storageConsumed: ExactQuantity;
  readonly replayProof: V13V14FoundationReplayProof;
}

/** In-transit goods become destination-available only through delivered quantity. */
export function applyShipmentLogisticsOutcome(input: {
  readonly trace: TradeLogisticsTraceRequest;
  readonly shipmentFact: TradeLogisticsFact<ShipmentTransitSnapshot>;
  readonly capacityFact: TradeLogisticsFact<LogisticsCapacity>;
  readonly outcomeFact: TradeLogisticsFact<ShipmentOutcomeReport>;
  readonly outputRef: string;
}): ShipmentLogisticsResult {
  const shipment = foundationFactPayload(
    input.trace,
    input.shipmentFact,
    'shipmentFact',
  );
  const capacity = foundationFactPayload(
    input.trace,
    input.capacityFact,
    'capacityFact',
  );
  const outcome = foundationFactPayload(
    input.trace,
    input.outcomeFact,
    'outcomeFact',
  );
  if (outcome.shipmentRef !== shipment.shipmentRef)
    kernelInvalid('Outcome must reference its shipment');
  if (shipment.status !== 'IN_TRANSIT' && shipment.status !== 'DELAYED') {
    kernelInvalid(
      'Only an in-transit or delayed shipment can receive an outcome',
    );
  }
  const total = physical(shipment.totalQuantity, 'shipment.totalQuantity');
  const transit = physical(
    shipment.inTransitQuantity,
    'shipment.inTransitQuantity',
  );
  const deliveredBefore = physical(
    shipment.deliveredQuantity,
    'shipment.deliveredQuantity',
  );
  const lostBefore = physical(shipment.lostQuantity, 'shipment.lostQuantity');
  const delivered = physical(
    outcome.deliveredQuantity,
    'outcome.deliveredQuantity',
  );
  const lost = physical(outcome.lostQuantity, 'outcome.lostQuantity');
  const port = physical(capacity.portRemaining, 'capacity.portRemaining');
  const rail = physical(capacity.railRemaining, 'capacity.railRemaining');
  const storage = physical(
    capacity.storageRemaining,
    'capacity.storageRemaining',
  );
  const unit = sameCommodity(
    [
      total,
      transit,
      deliveredBefore,
      lostBefore,
      delivered,
      lost,
      port,
      rail,
      storage,
    ],
    'shipment logistics',
  );
  const dispatchedAt = tick(shipment.dispatchedAt, 'shipment.dispatchedAt');
  const expiryAt = tick(shipment.expiryAt, 'shipment.expiryAt');
  const reportedAt = tick(outcome.reportedAt, 'outcome.reportedAt');
  tick(capacity.measuredAt, 'capacity.measuredAt');
  if (reportedAt.lessThan(dispatchedAt))
    kernelInvalid('Outcome cannot precede shipment dispatch');
  if (!reportedAt.lessThan(expiryAt))
    kernelInvalid(
      'Expired shipment cannot be delivered through logistics outcome',
    );
  if (
    !total.amount.equals(
      transit.amount.plus(deliveredBefore.amount).plus(lostBefore.amount),
    )
  )
    kernelInvalid(
      'Shipment quantities must reconcile total transit delivered and lost',
    );
  const consumed = delivered.amount.plus(lost.amount);
  if (consumed.greaterThan(transit.amount))
    kernelInvalid('Delivery and loss cannot exceed in-transit quantity');
  if (
    consumed.greaterThan(port.amount) ||
    consumed.greaterThan(rail.amount) ||
    consumed.greaterThan(storage.amount)
  )
    kernelInvalid(
      'Shipment outcome cannot bypass port rail or storage capacity',
    );
  const nextTransit = transit.amount.minus(consumed);
  const nextDelivered = deliveredBefore.amount.plus(delivered.amount);
  const nextLost = lostBefore.amount.plus(lost.amount);
  const nextStatus = nextTransit.isZero()
    ? nextLost.isZero()
      ? 'DELIVERED'
      : 'LOST'
    : shipment.status;
  const nextShipment: ShipmentTransitSnapshot = Object.freeze({
    ...shipment,
    inTransitQuantity: renderQuantity(nextTransit, unit),
    deliveredQuantity: renderQuantity(nextDelivered, unit),
    lostQuantity: renderQuantity(nextLost, unit),
    status: nextStatus,
  });
  const deliveryTransition = exactQuantityTransition({
    transitionRef: `${outcome.reportRef}.TRANSIT`,
    inputRefs: [input.shipmentFact.factRef, input.outcomeFact.factRef],
    outputRef: input.outputRef,
    before: shipment.inTransitQuantity,
    delta: renderQuantity(consumed.negated(), unit),
    after: nextShipment.inTransitQuantity,
  });
  return Object.freeze({
    foundationStatus: TRADE_LOGISTICS_FOUNDATION_STATUS,
    shipment: nextShipment,
    destinationAvailableIncrease: renderQuantity(delivered.amount, unit),
    portConsumed: renderQuantity(consumed, unit),
    railConsumed: renderQuantity(consumed, unit),
    storageConsumed: renderQuantity(consumed, unit),
    replayProof: foundationReplayProof({
      module: 'V21_LOGISTICS_REPLAY',
      trace: input.trace,
      inputFacts: [input.shipmentFact, input.capacityFact, input.outcomeFact],
      outputs: [
        {
          outputRef: input.outputRef,
          payload: {
            shipment: nextShipment,
            destinationAvailableIncrease: renderQuantity(
              delivered.amount,
              unit,
            ),
          },
        },
      ],
      transitions: [deliveryTransition],
    }),
  });
}
