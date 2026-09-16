import {
  decimal,
  kernelInvalid,
  nonNegative,
  quantity,
  render,
  type ExactDecimal,
} from './common.js';
import {
  getCausalChain,
  scheduleCausalSignal,
  type CausalChainId,
  type ScheduledCausalSignal,
} from './causal-channels.js';

/** A monetary amount is never interchangeable with a physical quantity. */
export type CausalUnit =
  | Readonly<{ readonly kind: 'MONEY'; readonly currency: string }>
  | Readonly<{ readonly kind: 'QUANTITY'; readonly unit: string }>
  | Readonly<{
      readonly kind: 'UNIT_PRICE';
      readonly currency: string;
      readonly perUnit: string;
    }>;

export type CausalValueSign = 'NON_NEGATIVE' | 'SIGNED';

/**
 * A concrete, caller-owned measure. The kernel does not attach it to World
 * State; it merely preserves exact amount, dimensional unit, and sign rule.
 */
export interface ExactCausalValue {
  readonly node: string;
  readonly amount: ExactDecimal;
  readonly unit: CausalUnit;
  readonly sign: CausalValueSign;
}

export interface ExactCausalResponse {
  readonly sourceUnit: CausalUnit;
  readonly targetUnit: CausalUnit;
  /** Explicit target-unit change per one source unit; no default exists. */
  readonly targetAmountPerSourceUnit: ExactDecimal;
  readonly parameterVersion: string;
}

export interface ExactCausalTransmissionInput {
  readonly effectId: string;
  readonly chainId: CausalChainId;
  readonly edgeIndex: number;
  readonly sourcePeriod: number;
  readonly delayPeriods: number;
  readonly source: ExactCausalValue;
  readonly targetBefore: ExactCausalValue;
  readonly response: ExactCausalResponse;
}

export interface ExactScheduledCausalEffect {
  readonly scheduled: ScheduledCausalSignal;
  readonly source: ExactCausalValue;
  readonly targetBefore: ExactCausalValue;
  /** Always SIGNED, including a negative delta for a decreasing relationship. */
  readonly targetDelta: ExactCausalValue;
  readonly targetAfter: ExactCausalValue;
}

function stableIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    kernelInvalid(`${label} must be a stable identifier`);
  }
  return value;
}

function canonicalUnit(value: CausalUnit, label: string): CausalUnit {
  if (value.kind === 'MONEY') {
    if (!/^[A-Z]{3}$/u.test(value.currency)) {
      kernelInvalid(`${label} currency must be canonical`);
    }
    return Object.freeze({ kind: 'MONEY' as const, currency: value.currency });
  }
  if (value.kind === 'QUANTITY') {
    return Object.freeze({
      kind: 'QUANTITY' as const,
      unit: quantity({ amount: '0', unit: value.unit }, label).unit,
    });
  }
  if (value.kind !== 'UNIT_PRICE') kernelInvalid(`${label} kind is invalid`);
  if (!/^[A-Z]{3}$/u.test(value.currency)) {
    kernelInvalid(`${label} currency must be canonical`);
  }
  return Object.freeze({
    kind: 'UNIT_PRICE' as const,
    currency: value.currency,
    perUnit: quantity({ amount: '0', unit: value.perUnit }, label).unit,
  });
}

export function causalUnitsMatch(left: CausalUnit, right: CausalUnit): boolean {
  if (left.kind === 'MONEY') {
    return right.kind === 'MONEY' && left.currency === right.currency;
  }
  if (left.kind === 'QUANTITY') {
    return right.kind === 'QUANTITY' && left.unit === right.unit;
  }
  return (
    right.kind === 'UNIT_PRICE' &&
    left.currency === right.currency &&
    left.perUnit === right.perUnit
  );
}

function parsedValue(
  input: ExactCausalValue,
  label: string,
): { readonly amount: ReturnType<typeof decimal>; readonly unit: CausalUnit } {
  if (input.sign !== 'NON_NEGATIVE' && input.sign !== 'SIGNED') {
    kernelInvalid(`${label} sign is invalid`);
  }
  const amount =
    input.sign === 'NON_NEGATIVE'
      ? nonNegative(input.amount, `${label} amount`)
      : decimal(input.amount, `${label} amount`);
  return Object.freeze({
    amount,
    unit: canonicalUnit(input.unit, `${label} unit`),
  });
}

export function canonicalizeExactCausalValue(
  input: ExactCausalValue,
): ExactCausalValue {
  const node = stableIdentifier(input.node, 'causal value node');
  const parsed = parsedValue(input, node);
  return Object.freeze({
    node,
    amount: render(parsed.amount),
    unit: parsed.unit,
    sign: input.sign,
  });
}

function exactResponse(input: ExactCausalResponse): {
  readonly sourceUnit: CausalUnit;
  readonly targetUnit: CausalUnit;
  readonly factor: ReturnType<typeof nonNegative>;
  readonly parameterVersion: string;
} {
  return Object.freeze({
    sourceUnit: canonicalUnit(input.sourceUnit, 'response sourceUnit'),
    targetUnit: canonicalUnit(input.targetUnit, 'response targetUnit'),
    factor: nonNegative(
      input.targetAmountPerSourceUnit,
      'targetAmountPerSourceUnit',
    ),
    parameterVersion: stableIdentifier(
      input.parameterVersion,
      'parameterVersion',
    ),
  });
}

function withAmount(
  source: ExactCausalValue,
  amount: ReturnType<typeof decimal>,
  sign: CausalValueSign,
): ExactCausalValue {
  if (sign === 'NON_NEGATIVE' && amount.isNegative()) {
    kernelInvalid(`${source.node} cannot become negative`);
  }
  return Object.freeze({
    node: source.node,
    amount: render(amount),
    unit: canonicalUnit(source.unit, `${source.node} unit`),
    sign,
  });
}

/**
 * Calculates one exact, dimensional causal result. It is deliberately unable
 * to infer a conversion from GCU to people, tonnes, or percentage points: the
 * caller must provide the approved conversion and its version.
 */
export function scheduleExactCausalTransmission(
  input: ExactCausalTransmissionInput,
): ExactScheduledCausalEffect {
  const definition = getCausalChain(input.chainId);
  const selected = definition.edges[input.edgeIndex];
  if (selected === undefined) {
    kernelInvalid(
      `Unknown causal edge ${input.edgeIndex} for ${input.chainId}`,
    );
  }
  const source = canonicalizeExactCausalValue(input.source);
  const targetBefore = canonicalizeExactCausalValue(input.targetBefore);
  if (source.node !== selected.source) {
    kernelInvalid('Exact source node does not match the selected causal edge');
  }
  if (targetBefore.node !== selected.target) {
    kernelInvalid('Exact target node does not match the selected causal edge');
  }
  const sourceParsed = parsedValue(source, 'source');
  const targetParsed = parsedValue(targetBefore, 'targetBefore');
  const response = exactResponse(input.response);
  if (!causalUnitsMatch(sourceParsed.unit, response.sourceUnit)) {
    kernelInvalid('Exact source unit does not match response sourceUnit');
  }
  if (!causalUnitsMatch(targetParsed.unit, response.targetUnit)) {
    kernelInvalid('Exact target unit does not match response targetUnit');
  }
  const exposure = nonNegative(source.amount, 'source amount');
  const scheduled = scheduleCausalSignal({
    effectId: input.effectId,
    chainId: input.chainId,
    edgeIndex: input.edgeIndex,
    sourcePeriod: input.sourcePeriod,
    delayPeriods: input.delayPeriods,
    parameterVersion: response.parameterVersion,
  });
  const absoluteDelta = exposure.times(response.factor);
  const delta =
    selected.direction === 'INCREASES'
      ? absoluteDelta
      : absoluteDelta.negated();
  const targetDelta = withAmount(targetBefore, delta, 'SIGNED');
  const targetAfter = withAmount(
    targetBefore,
    targetParsed.amount.plus(delta),
    targetBefore.sign,
  );
  return Object.freeze({
    scheduled,
    source,
    targetBefore,
    targetDelta,
    targetAfter,
  });
}

export interface ExactCausalStateCalculation {
  readonly before: ExactCausalValue;
  readonly delta: ExactCausalValue;
  readonly after: ExactCausalValue;
}

/**
 * Recomputes a concrete value from an authoritative caller-supplied current
 * value and already-due effects. It is pure: the caller owns persistence and
 * must still validate fence, version, authorization and atomic settlement.
 */
export function calculateExactCausalStateAfterEffects(input: {
  readonly currentPeriod: number;
  readonly current: ExactCausalValue;
  readonly effects: readonly ExactScheduledCausalEffect[];
}): ExactCausalStateCalculation {
  if (!Number.isSafeInteger(input.currentPeriod) || input.currentPeriod < 0) {
    kernelInvalid('currentPeriod must be a non-negative safe integer');
  }
  const before = canonicalizeExactCausalValue(input.current);
  const parsedBefore = parsedValue(before, 'current');
  const seen = new Set<string>();
  let total = decimal('0', 'zero');
  for (const effect of input.effects) {
    const effectId = stableIdentifier(effect.scheduled.effectId, 'effectId');
    if (seen.has(effectId)) kernelInvalid('Causal effect IDs must be unique');
    seen.add(effectId);
    if (effect.scheduled.duePeriod > input.currentPeriod) {
      kernelInvalid('Causal effect is not due at currentPeriod');
    }
    if (effect.scheduled.target !== before.node) {
      kernelInvalid('Causal effect target does not match current value node');
    }
    const delta = canonicalizeExactCausalValue(effect.targetDelta);
    if (delta.sign !== 'SIGNED') {
      kernelInvalid('Causal effect delta must be signed');
    }
    const parsedDelta = parsedValue(delta, 'effect delta');
    if (!causalUnitsMatch(parsedBefore.unit, parsedDelta.unit)) {
      kernelInvalid(
        'Causal effect delta unit does not match current value unit',
      );
    }
    total = total.plus(parsedDelta.amount);
  }
  return Object.freeze({
    before,
    delta: withAmount(before, total, 'SIGNED'),
    after: withAmount(before, parsedBefore.amount.plus(total), before.sign),
  });
}
