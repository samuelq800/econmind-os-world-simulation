import { kernelInvalid } from './common.js';
import {
  scheduleExactCausalTransmission,
  type ExactCausalTransmissionInput,
  type ExactScheduledCausalEffect,
} from './causal-values.js';

/**
 * System-bound execution of exact, caller-calibrated causal transmissions.
 * This is pure calculation only: it never attaches an effect to World State.
 */
export type QuantifiedSystemId =
  | 'FIRM_ECOLOGY'
  | 'INSTITUTIONS_STATE_CAPACITY'
  | 'LAND_WATER_FOOD'
  | 'ENVIRONMENT_NATURAL_CAPITAL'
  | 'DEMOGRAPHY_HOUSEHOLD'
  | 'ASSET_SPATIAL_DIGITAL';

export interface QuantifiedSystemTransmissionBatch {
  readonly system: QuantifiedSystemId;
  readonly transmissions: readonly ExactCausalTransmissionInput[];
}

const SYSTEM_CHAIN_RANGES: Readonly<
  Record<QuantifiedSystemId, readonly [bigint, bigint]>
> = Object.freeze({
  FIRM_ECOLOGY: [101n, 110n],
  INSTITUTIONS_STATE_CAPACITY: [111n, 120n],
  LAND_WATER_FOOD: [121n, 125n],
  ENVIRONMENT_NATURAL_CAPITAL: [126n, 130n],
  DEMOGRAPHY_HOUSEHOLD: [131n, 140n],
  ASSET_SPATIAL_DIGITAL: [141n, 150n],
});

function chainNumber(chainId: string): bigint {
  const parsed = /^C([1-9][0-9]*)$/u.exec(chainId);
  if (parsed?.[1] === undefined) kernelInvalid('causal chain ID is invalid');
  return BigInt(parsed[1]);
}

/**
 * Calculates a lossless batch of exact-unit transmissions for one of the six
 * systems introduced by C101–C150. Every response factor remains explicit;
 * this function introduces neither elasticities nor ordering/persistence.
 */
export function calculateQuantifiedSystemTransmissions(
  input: QuantifiedSystemTransmissionBatch,
): readonly ExactScheduledCausalEffect[] {
  const range = SYSTEM_CHAIN_RANGES[input.system];
  if (range === undefined) kernelInvalid('quantified system is invalid');
  if (input.transmissions.length === 0) {
    kernelInvalid('quantified system requires a transmission');
  }
  const [firstChain, lastChain] = range;
  const effectIds = new Set<string>();
  const results: ExactScheduledCausalEffect[] = [];
  for (const transmission of input.transmissions) {
    const numericChainId = chainNumber(transmission.chainId);
    if (numericChainId < firstChain || numericChainId > lastChain) {
      kernelInvalid(`${input.system} cannot calculate ${transmission.chainId}`);
    }
    if (effectIds.has(transmission.effectId)) {
      kernelInvalid('quantified system effect IDs must be unique');
    }
    effectIds.add(transmission.effectId);
    results.push(scheduleExactCausalTransmission(transmission));
  }
  return Object.freeze(results);
}
