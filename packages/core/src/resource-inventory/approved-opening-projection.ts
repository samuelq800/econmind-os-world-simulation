import {
  nonNegative,
  kernelInvalid,
  renderQuantity,
  type ExactQuantity,
} from '../engine-kernels/common.js';
import { assertWorldDecimalResult } from '../numeric/world-decimal.js';
import {
  createResourcePoolState,
  GEOLOGICAL_RESOURCE_UNITS,
  type GeologicalResourceId,
  type ResourcePoolState,
} from './foundation.js';

/** Pure representation of the adopted nested remaining quantities. This does
 * not approve adoption, grant a licence, extract, or create inventory. */
export interface NestedOpeningResource {
  readonly resourceId: GeologicalResourceId;
  readonly unit: string;
  readonly initialGeological: string;
  readonly cumulativeExtracted: string;
  readonly remainingGeological: string;
  readonly discoveredRemaining: string;
  readonly recoverableRemaining: string;
  readonly developedRemaining: string;
  readonly originRef: string;
}

export function projectApprovedNestedOpeningResource(
  input: NestedOpeningResource,
): ResourcePoolState {
  if (input.unit !== GEOLOGICAL_RESOURCE_UNITS[input.resourceId])
    kernelInvalid(
      'Source geological unit differs from the Core geological unit',
    );
  const g = nonNegative(input.initialGeological, 'initialGeological');
  const x = nonNegative(input.cumulativeExtracted, 'cumulativeExtracted');
  const remaining = nonNegative(
    input.remainingGeological,
    'remainingGeological',
  );
  const d = nonNegative(input.discoveredRemaining, 'discoveredRemaining');
  const r = nonNegative(input.recoverableRemaining, 'recoverableRemaining');
  const v = nonNegative(input.developedRemaining, 'developedRemaining');
  if (!g.minus(x).equals(remaining))
    kernelInvalid(
      'Geological remainder must equal G minus explicit cumulative X',
    );
  if (v.greaterThan(r) || r.greaterThan(d) || d.greaterThan(remaining))
    kernelInvalid('Nested remaining hierarchy must satisfy V <= R <= D <= G-X');
  const q = (amount: typeof g): ExactQuantity =>
    renderQuantity(assertWorldDecimalResult(amount), input.unit);
  return createResourcePoolState({
    resourceId: input.resourceId,
    geologicalEndowment: q(g),
    pools: {
      undiscovered: q(remaining.minus(d)),
      discovered: q(d.minus(r)),
      recoverable: q(r.minus(v)),
      developed: q(v),
      extractedCumulative: q(x),
    },
    originRef: input.originRef,
  });
}
