import { kernelInvalid } from './common.js';
import {
  scheduleFixedQuantifiedCausalTransmission,
  type ExactCausalTransmissionInput,
  type ExactScheduledCausalEffect,
} from './causal-values.js';
import {
  quantifiedSystemForChain,
  type QuantifiedSystemId,
} from './quantified-node-registry.js';

export type { QuantifiedSystemId } from './quantified-node-registry.js';

/**
 * System-bound execution of C101–C150 exact transmissions. The node/unit/sign
 * registry is Core-owned and immutable; callers can provide calibration
 * factors but cannot supply or override a node contract.
 */
export interface QuantifiedSystemTransmissionBatch {
  readonly system: QuantifiedSystemId;
  readonly transmissions: readonly ExactCausalTransmissionInput[];
}

/**
 * Calculates a lossless batch of fixed-registry transmissions for one of the
 * six C101–C150 systems. It is pure: no ordering, persistence, parameter
 * source, authorization, or World State mutation is introduced here.
 */
export function calculateQuantifiedSystemTransmissions(
  input: QuantifiedSystemTransmissionBatch,
): readonly ExactScheduledCausalEffect[] {
  if (input.transmissions.length === 0) {
    kernelInvalid('quantified system requires a transmission');
  }
  const effectIds = new Set<string>();
  const results: ExactScheduledCausalEffect[] = [];
  for (const transmission of input.transmissions) {
    const registeredSystem = quantifiedSystemForChain(transmission.chainId);
    if (registeredSystem !== input.system) {
      kernelInvalid(`${input.system} cannot calculate ${transmission.chainId}`);
    }
    if (effectIds.has(transmission.effectId)) {
      kernelInvalid('quantified system effect IDs must be unique');
    }
    effectIds.add(transmission.effectId);
    results.push(scheduleFixedQuantifiedCausalTransmission(transmission));
  }
  return Object.freeze(results);
}
