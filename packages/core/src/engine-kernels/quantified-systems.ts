import { kernelInvalid } from './common.js';
import {
  canonicalizeExactCausalValue,
  causalUnitsMatch,
  scheduleExactCausalTransmission,
  type CausalUnit,
  type CausalValueSign,
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
  /** Immutable, caller-owned dimensional registry for this batch. */
  readonly nodeContracts: readonly QuantifiedNodeContract[];
  readonly transmissions: readonly ExactCausalTransmissionInput[];
}

/** A node's stock/flow unit and sign rule; never inferred from the edge label. */
export interface QuantifiedNodeContract {
  readonly node: string;
  readonly unit: CausalUnit;
  readonly sign: CausalValueSign;
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

function indexNodeContracts(
  contracts: readonly QuantifiedNodeContract[],
): ReadonlyMap<string, QuantifiedNodeContract> {
  if (contracts.length === 0) {
    kernelInvalid('quantified system requires node contracts');
  }
  const indexed = new Map<string, QuantifiedNodeContract>();
  for (const contract of contracts) {
    const canonical = canonicalizeExactCausalValue({
      node: contract.node,
      amount: '0',
      unit: contract.unit,
      sign: contract.sign,
    });
    if (indexed.has(canonical.node)) {
      kernelInvalid('quantified node contracts must be unique');
    }
    indexed.set(
      canonical.node,
      Object.freeze({
        node: canonical.node,
        unit: canonical.unit,
        sign: canonical.sign,
      }),
    );
  }
  return indexed;
}

function assertMatchesNodeContract(
  value: ExactCausalTransmissionInput['source'],
  contract: QuantifiedNodeContract | undefined,
  label: string,
): void {
  if (contract === undefined) {
    kernelInvalid(`${label} node requires a quantified unit contract`);
  }
  const canonical = canonicalizeExactCausalValue(value);
  if (canonical.sign !== contract.sign) {
    kernelInvalid(`${label} sign must match its quantified node contract`);
  }
  if (!causalUnitsMatch(canonical.unit, contract.unit)) {
    kernelInvalid(`${label} unit must match its quantified node contract`);
  }
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
  const contracts = indexNodeContracts(input.nodeContracts);
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
    assertMatchesNodeContract(
      transmission.source,
      contracts.get(transmission.source.node),
      'source',
    );
    assertMatchesNodeContract(
      transmission.targetBefore,
      contracts.get(transmission.targetBefore.node),
      'target',
    );
    const sourceContract = contracts.get(transmission.source.node);
    const targetContract = contracts.get(transmission.targetBefore.node);
    if (
      sourceContract === undefined ||
      targetContract === undefined ||
      !causalUnitsMatch(
        transmission.response.sourceUnit,
        sourceContract.unit,
      ) ||
      !causalUnitsMatch(transmission.response.targetUnit, targetContract.unit)
    ) {
      kernelInvalid(
        'causal response units must match quantified node contracts',
      );
    }
    effectIds.add(transmission.effectId);
    results.push(scheduleExactCausalTransmission(transmission));
  }
  return Object.freeze(results);
}
