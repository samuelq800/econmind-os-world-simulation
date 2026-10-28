/** Exact physical water use paired with an existing production posting. This
 * is deterministic calculation/replay data, never a water grant, delivery,
 * source admission or commit authorization. Water remains outside commodities. */
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import { worldId } from '../ids.js';
import {
  canonicalSha256,
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from '../commands/command.js';
import {
  bindAuthoritativeTransition,
  validateFinalReceiptForCommand,
  type AuthoritativeTransition,
  type FinalCommandReceipt,
} from '../commands/receipt.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  foundationFactPayload,
  type FoundationFact,
} from '../engine-kernels/foundation-provenance.js';
import type { ExactUnitRate } from '../engine-kernels/common.js';
import {
  allocateWaterPeriod,
  type WaterAllocationState,
  type WaterOperation,
} from '../water/foundation.js';
import {
  addWater,
  subtractWater,
  scaleWater,
  compareWater,
  zeroWater,
  volumeFromDecimal,
  waterScalarFromDecimal,
  type WaterVolume,
} from '../water/exact-volume.js';
import {
  productionConsumptionEventPayload,
  isValidatedProductionPosting,
  PRODUCTION_SETTLED_EVENT_TYPE,
  type ProductionConsumptionEvidence,
  type InventoryProductionPosting,
} from './production-consumption-posting.js';

export const PRODUCTION_WATER_CONSUMED_EVENT =
  'INDUSTRY_PRODUCTION_WATER_CONSUMED_V1' as const;
export const PRODUCTION_WATER_STATE_SCHEMA =
  'production-delivered-water-consumption-state-v1' as const;
export interface ProductionWaterAccount {
  readonly accountRef: string;
  readonly basinRef: string;
  readonly countryRef: string;
  readonly regionRef: string;
  readonly holderRef: string;
  readonly rightRef: string;
  readonly demandRef: string;
  readonly operationRef: string;
  readonly purpose: string;
  readonly sourceRef: string;
  readonly fromTicks: string;
  readonly untilTicks: string;
  readonly delivered: WaterVolume;
  readonly consumed: WaterVolume;
  readonly available: WaterVolume;
}
export interface ProductionWaterUse {
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly runId: string;
  readonly accountRef: string;
  readonly consumed: WaterVolume;
  readonly productionEvidenceHash: string;
  readonly waterRecipeHash: string;
}
export interface ProductionWaterConsumptionState {
  readonly schemaVersion: typeof PRODUCTION_WATER_STATE_SCHEMA;
  readonly worldId: string;
  readonly materializationKey: string;
  readonly allocationSourceHash: string;
  readonly accounts: readonly ProductionWaterAccount[];
  readonly uses: readonly ProductionWaterUse[];
}
export interface ProductionWaterRecipe {
  readonly sourceRecipeRef: string;
  readonly facilityRef: string;
  readonly countryRef: string;
  readonly regionRef: string;
  readonly perOutput: ExactUnitRate;
}
const states = new WeakSet<object>();
const preparations = new WeakMap<
  object,
  {
    command: CanonicalCommand;
    evidenceHash: string;
    before: ProductionWaterConsumptionState;
    after: ProductionWaterConsumptionState;
    payload: ReturnType<typeof payload>;
  }
>();
const bindings = new WeakSet<object>();
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.INVENTORY_INPUT_INVALID,
    'Production water: ' + message,
  );
}
function ref(s: string): string {
  if (typeof s !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(s))
    invalid('explicit canonical reference required');
  return s;
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
const hash = (value: unknown, sha: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(value), sha);

/** Only an ALREADY APPLIED Core allocation is usable. Re-running the actual
 * same operation checks the private water-state brand and exact request. An
 * unused quota, opening proposal or freshly calculated potential is rejected. */
export function createProductionWaterConsumptionState(
  input: {
    readonly worldId: string;
    readonly allocation: WaterAllocationState;
    readonly operation: WaterOperation;
  },
  sha: Sha256Hex,
): Readonly<ProductionWaterConsumptionState> {
  worldId(input.worldId);
  const actual = allocateWaterPeriod(input.allocation, input.operation);
  if (!actual.replayed)
    invalid('an already applied actual delivery is required');
  const record = actual.record;
  const accounts = record.deliveries.map((delivery) => {
    const right = input.allocation.rights.find(
      (r) => r.rightRef === delivery.rightRef,
    );
    const demand = input.operation.demands.find(
      (d) => d.demandRef === delivery.demandRef,
    );
    if (
      !right ||
      !demand ||
      right.countryRef !== demand.countryRef ||
      right.regionRef !== demand.regionRef ||
      right.holderRef !== demand.holderRef ||
      right.purpose !== demand.purpose ||
      right.basinRef !== input.allocation.basinRef
    )
      invalid('actual right/demand ownership mismatch');
    return {
      accountRef:
        'WATER_DELIVERY_' +
        hash(
          {
            worldId: input.worldId,
            basinRef: input.allocation.basinRef,
            operationRef: record.operationRef,
            demandRef: delivery.demandRef,
            rightRef: right.rightRef,
          },
          sha,
        )
          .slice(7)
          .toUpperCase(),
      basinRef: right.basinRef,
      countryRef: right.countryRef,
      regionRef: right.regionRef,
      holderRef: right.holderRef,
      rightRef: right.rightRef,
      demandRef: delivery.demandRef,
      operationRef: record.operationRef,
      purpose: right.purpose,
      sourceRef: record.sourceRef,
      fromTicks: record.fromTicks,
      untilTicks: record.untilTicks,
      delivered: delivery.delivered,
      consumed: zeroWater(),
      available: delivery.delivered,
    };
  });
  const state = freeze({
    schemaVersion: PRODUCTION_WATER_STATE_SCHEMA,
    worldId: input.worldId,
    materializationKey:
      'PRODUCTION_WATER_' +
      hash(
        {
          worldId: input.worldId,
          basinRef: input.allocation.basinRef,
          operationRef: record.operationRef,
          openingTicks: input.allocation.openingTicks,
        },
        sha,
      )
        .slice(7)
        .toUpperCase(),
    allocationSourceHash: hash(
      {
        allocation: input.allocation,
        operationCanonical: record.requestCanonical,
      },
      sha,
    ),
    accounts,
    uses: [],
  });
  states.add(state);
  return state;
}
function payload(
  input: {
    command: CanonicalCommand;
    evidence: ProductionConsumptionEvidence;
    waterRecipe: FoundationFact<ProductionWaterRecipe>;
    account: ProductionWaterAccount;
    consumed: WaterVolume;
    before: ProductionWaterConsumptionState;
    after: ProductionWaterConsumptionState;
  },
  sha: Sha256Hex,
) {
  return freeze({
    schemaVersion: 'production-water-consumption-event-v1' as const,
    commandFingerprint: input.command.fingerprint,
    runId: input.evidence.runId,
    productionEvidenceHash: hash(input.evidence, sha),
    waterRecipe: input.waterRecipe,
    allocationSourceHash: input.before.allocationSourceHash,
    materializationKey: input.before.materializationKey,
    account: input.account,
    consumed: input.consumed,
    availableAfter: subtractWater(input.account.available, input.consumed),
    beforeStateHash: hash(input.before, sha),
    afterStateHash: hash(input.after, sha),
  });
}
declare const preparationBrand: unique symbol;
export interface ProductionWaterConsumptionPreparation {
  readonly [preparationBrand]: true;
  readonly eventPayload: ReturnType<typeof payload>;
  readonly before: Readonly<ProductionWaterConsumptionState>;
  readonly after: Readonly<ProductionWaterConsumptionState>;
}
/** A shortage rejects the proposed production instead of inventing water or
 * silently changing an already funded/posted actual output. The next legal
 * candidate may choose a smaller production plan and re-run the real kernel. */
export function prepareProductionWaterConsumption(
  input: {
    readonly command: CanonicalCommand;
    readonly evidence: ProductionConsumptionEvidence;
    readonly state: ProductionWaterConsumptionState;
    readonly accountRef: string;
    readonly waterRecipe: FoundationFact<ProductionWaterRecipe>;
  },
  sha: Sha256Hex,
): Readonly<ProductionWaterConsumptionPreparation> {
  const command = validateCanonicalCommand(input.command, sha),
    state = input.state;
  if (!states.has(state) || state.worldId !== command.worldId)
    invalid('genuine same-world delivered-water state required');
  if (
    state.uses.some(
      (u) =>
        u.commandId === command.commandId || u.runId === input.evidence.runId,
    )
  )
    invalid('water use already applied; restore the existing Final');
  const production = productionConsumptionEventPayload(input.evidence);
  const op = input.evidence.operating.payload;
  if (
    op.worldId !== command.worldId ||
    op.worldVersion !== command.expectedWorldVersion ||
    input.evidence.output.countryId !== command.countryId
  )
    invalid('production command/head/country mismatch');
  const recipe = foundationFactPayload(
    input.evidence.input.trace,
    input.waterRecipe,
    'water recipe',
  );
  ref(recipe.sourceRecipeRef);
  ref(recipe.facilityRef);
  if (
    recipe.facilityRef !== production.result.facilityRef ||
    recipe.countryRef !== command.countryId ||
    recipe.perOutput.inputUnit !== production.result.actualOutput.unit ||
    recipe.perOutput.outputUnit !== 'm3'
  )
    invalid('water recipe facility/country/output unit mismatch');
  const rate = volumeFromDecimal(recipe.perOutput.amount);
  if (rate.numerator === '0') invalid('positive exact water recipe required');
  const account = state.accounts.find((a) => a.accountRef === input.accountRef);
  if (
    !account ||
    account.countryRef !== command.countryId ||
    account.regionRef !== recipe.regionRef ||
    account.holderRef !== op.operatorId ||
    !['FOOD_AGRICULTURE', 'OTHER_INDUSTRY'].includes(account.purpose)
  )
    invalid(
      'exact legal Industry water account/holder/country/region required',
    );
  if (BigInt(account.untilTicks) > command.simTime.ticks)
    invalid('future water is not delivered');
  const consumed = scaleWater(
    rate,
    waterScalarFromDecimal(production.result.actualOutput.amount),
  );
  if (compareWater(consumed, account.available) > 0)
    invalid('actual production exceeds remaining delivered water');
  const use = {
    commandId: command.commandId,
    commandFingerprint: command.fingerprint,
    runId: input.evidence.runId,
    accountRef: account.accountRef,
    consumed,
    productionEvidenceHash: hash(input.evidence, sha),
    waterRecipeHash: hash(input.waterRecipe, sha),
  };
  const after = freeze({
    ...state,
    accounts: state.accounts.map((a) =>
      a === account
        ? {
            ...a,
            consumed: addWater(a.consumed, consumed),
            available: subtractWater(a.available, consumed),
          }
        : a,
    ),
    uses: [...state.uses, use],
  });
  for (const a of after.accounts)
    if (compareWater(addWater(a.consumed, a.available), a.delivered) !== 0)
      invalid('delivered water conservation failed');
  states.add(after);
  const eventPayload = payload(
    { ...input, command, account, consumed, before: state, after },
    sha,
  );
  const preparation = freeze({
    eventPayload,
    before: state,
    after,
  }) as unknown as ProductionWaterConsumptionPreparation;
  preparations.set(preparation, {
    command,
    evidenceHash: hash(input.evidence, sha),
    before: state,
    after,
    payload: eventPayload,
  });
  return preparation;
}
/** Requires the original inventory posting and exactly ordered production +
 * water events in the SAME authoritative transition, not a later side write. */
export function bindProductionWaterConsumptionToTransition(
  input: {
    readonly command: CanonicalCommand;
    readonly transition: AuthoritativeTransition;
    readonly posting: InventoryProductionPosting;
    readonly preparation: ProductionWaterConsumptionPreparation;
  },
  sha: Sha256Hex,
) {
  const p = preparations.get(input.preparation);
  if (
    !p ||
    !isValidatedProductionPosting(input.posting) ||
    input.command.fingerprint !== p.command.fingerprint ||
    hash(input.posting.evidence, sha) !== p.evidenceHash
  )
    invalid('genuine production/water preparation required');
  const binding = bindAuthoritativeTransition(input, sha),
    events = input.transition.events;
  if (
    events.length !== 2 ||
    events[0]!.eventType !== PRODUCTION_SETTLED_EVENT_TYPE ||
    events[0]!.canonicalPayload !==
      canonicalSerialize(
        productionConsumptionEventPayload(input.posting.evidence),
      ) ||
    events[1]!.eventType !== PRODUCTION_WATER_CONSUMED_EVENT ||
    events[1]!.canonicalPayload !== canonicalSerialize(p.payload) ||
    canonicalSerialize(input.posting.transitionBinding) !==
      canonicalSerialize(binding)
  )
    invalid(
      'water debit must accompany the same production posting and event group',
    );
  const value = freeze({
    classification:
      'ATOMIC_PRODUCTION_WATER_CALCULATION_NOT_SOURCE_AUTHORITY' as const,
    commandFingerprint: input.command.fingerprint,
    transitionBinding: binding,
    postingId: input.posting.postingId,
    postingFingerprint: input.posting.fingerprint,
    beforeStateHash: hash(p.before, sha),
    afterStateHash: hash(p.after, sha),
    beforeState: p.before,
    waterRecipe: p.payload.waterRecipe.payload,
    materialization: { key: p.after.materializationKey, payload: p.after },
    waterEventId: events[1]!.eventId,
    waterEventFingerprint: events[1]!.fingerprint,
    allocationSourceHash: p.before.allocationSourceHash,
    waterAccount: p.payload.account,
  });
  bindings.add(value);
  return value;
}
export type ProductionWaterConsumptionCommitBinding = ReturnType<
  typeof bindProductionWaterConsumptionToTransition
>;
export function assertProductionWaterConsumptionCommitBinding(
  value: ProductionWaterConsumptionCommitBinding,
): void {
  if (!bindings.has(value))
    invalid('genuine production/water atomic calculation required');
}

/** Domain replay only: the host must obtain the COMPLETE water-bearing history
 * from its held canonical prefix, not filter unknown World events on faith.
 * This does not establish DB source admission or prefix completeness. */
export function replayProductionWaterConsumptionHistory(
  input: {
    readonly opening: ProductionWaterConsumptionState;
    readonly frames: readonly {
      readonly command: CanonicalCommand;
      readonly transition: AuthoritativeTransition;
      readonly posting: InventoryProductionPosting;
      readonly receipt: FinalCommandReceipt;
      readonly waterRecipe: FoundationFact<ProductionWaterRecipe>;
      readonly accountRef: string;
    }[];
  },
  sha: Sha256Hex,
): Readonly<ProductionWaterConsumptionState> {
  let state = input.opening;
  if (!states.has(state)) invalid('genuine delivered-water origin required');
  for (const frame of input.frames) {
    if (frame.receipt.outcome !== 'COMMITTED')
      invalid('committed production/water receipt required');
    validateFinalReceiptForCommand(frame);
    const preparation = prepareProductionWaterConsumption(
      {
        command: frame.command,
        evidence: frame.posting.evidence,
        state,
        accountRef: frame.accountRef,
        waterRecipe: frame.waterRecipe,
      },
      sha,
    );
    bindProductionWaterConsumptionToTransition({ ...frame, preparation }, sha);
    state = preparation.after;
  }
  return state;
}
