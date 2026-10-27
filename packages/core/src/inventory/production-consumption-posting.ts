import {
  canonicalSha256,
  type CanonicalCommand,
  type Sha256Hex,
} from '../commands/command.js';
import {
  bindAuthoritativeTransition,
  type AuthoritativeTransition,
} from '../commands/receipt.js';
import {
  calculateV13Production,
  type V13ProductionInput,
  type V13ProductionResult,
} from '../engine-kernels/energy-production-foundation.js';
import {
  foundationFactPayload,
  type FoundationFact,
} from '../engine-kernels/foundation-provenance.js';
import { type ExactUnitRate } from '../engine-kernels/common.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  inventoryPostingId,
  legalEntityId,
  type InventoryPostingId,
  type FinancialPostingBatchId,
  type FinancialPostingLegId,
} from '../ids.js';
import { Money } from '../numeric/money.js';
import { Quantity } from '../numeric/quantity.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  createInventoryAccount,
  type InventoryAccount,
  type InventoryPosting,
  type InventoryPostingEntry,
} from './inventory-ledger.js';
import {
  type FinancialPostingBatch,
  type FinancialLedgerState,
} from '../finance/financial-ledger.js';
import { isAuthoritativeFinancialLedgerState } from '../opening/ledger-authority.js';

export const PRODUCTION_CONSUMPTION_SCHEMA_VERSION =
  'inventory-production-consumption-v1' as const;
export const PRODUCTION_SETTLED_EVENT_TYPE =
  'INDUSTRY_PRODUCTION_SETTLED' as const;
export const PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED =
  'PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED' as const;

/** Source-owned recipe. Coefficients are explicit dimensional quantities, never defaults. */
export interface ProductionRecipe {
  readonly facilityRef: string;
  readonly outputCommodityId: InventoryAccount['commodityId'];
  readonly outputUnit: string;
  readonly materials: readonly {
    readonly materialRef: string;
    readonly commodityId: InventoryAccount['commodityId'];
    readonly perOutput: ExactUnitRate;
  }[];
  readonly energyPerOutput: ExactUnitRate;
  readonly labourPerOutput: ExactUnitRate;
  readonly logisticsPerOutput: ExactUnitRate;
  readonly costPerOutput: ExactUnitRate;
}

/** These source bindings are not authorization grants. The Worker still owns admission. */
export interface ProductionOperatingEvidence {
  readonly worldId: InventoryAccount['worldId'];
  readonly worldVersion: string;
  readonly facilityRef: string;
  readonly operatorId: InventoryAccount['titleHolderId'];
  readonly operatorClassification: 'OP';
  readonly maintenanceAppliedRef: string;
  readonly technologyRightRef: string;
  readonly operatingPermissionRef: string;
  readonly costSourceRef: string;
  readonly fundingBatchId: FinancialPostingBatchId;
  readonly fundingFingerprint: FinancialPostingBatch['fingerprint'];
  readonly costLegId: FinancialPostingLegId;
  readonly settledCost: { readonly amount: string; readonly currency: string };
}

export interface ProductionConsumptionEvidence {
  readonly runId: string;
  readonly inventorySnapshotHash: InventoryPosting['fingerprint'];
  readonly input: V13ProductionInput;
  readonly recipe: FoundationFact<ProductionRecipe>;
  readonly operating: FoundationFact<ProductionOperatingEvidence>;
  readonly materials: readonly {
    readonly materialRef: string;
    readonly account: InventoryAccount;
  }[];
  readonly output: InventoryAccount;
}

export interface InventoryProductionPosting extends Omit<
  InventoryPosting,
  'schemaVersion' | 'operation'
> {
  readonly schemaVersion: typeof PRODUCTION_CONSUMPTION_SCHEMA_VERSION;
  readonly operation: 'PRODUCE_AND_CONSUME';
  readonly evidence: ProductionConsumptionEvidence;
  readonly result: V13ProductionResult;
}
export type InventoryLedgerPosting =
  InventoryPosting | InventoryProductionPosting;
const instances = new WeakSet<object>();
const REF = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.INVENTORY_INPUT_INVALID, message);
}
function ref(value: string, label: string): void {
  if (typeof value !== 'string' || !REF.test(value))
    invalid(`${label} requires explicit source evidence`);
}
function immutableJson<T>(value: T): T {
  const copy = JSON.parse(canonicalSerialize(value)) as T;
  function freeze(node: unknown): void {
    if (node !== null && typeof node === 'object') {
      for (const child of Object.values(node)) freeze(child);
      Object.freeze(node);
    }
  }
  freeze(copy);
  return copy;
}
function coefficient(
  rate: ExactUnitRate,
  output: { amount: string; unit: string },
  expected: { amount: string; unit: string },
): void {
  if (rate.inputUnit !== output.unit || rate.outputUnit !== expected.unit)
    invalid('Recipe coefficient unit mismatch');
  const value = Quantity.from(rate.amount, rate.outputUnit);
  if (
    !value.amount.greaterThan('0') ||
    !value.amount
      .times(Quantity.from(output.amount, output.unit).amount)
      .equals(Quantity.from(expected.amount, expected.unit).amount)
  ) {
    invalid('Recipe coefficient does not reproduce required input or cost');
  }
}

/** Recalculate from the real V13 kernel; no client-supplied actualOutput is accepted. */
export function productionConsumptionEventPayload(
  evidence: ProductionConsumptionEvidence,
) {
  ref(evidence.runId, 'runId');
  const result = calculateV13Production(evidence.input);
  const recipe = foundationFactPayload(
    evidence.input.trace,
    evidence.recipe,
    'production recipe',
  );
  const op = foundationFactPayload(
    evidence.input.trace,
    evidence.operating,
    'operating evidence',
  );
  if (
    op.operatorClassification !== 'OP' ||
    recipe.facilityRef !== result.facilityRef ||
    op.facilityRef !== result.facilityRef
  )
    invalid('Production needs the same operational OP facility and recipe');
  legalEntityId(op.operatorId);
  for (const key of [
    'maintenanceAppliedRef',
    'technologyRightRef',
    'operatingPermissionRef',
    'costSourceRef',
  ] as const)
    ref(op[key], key);
  if (
    !result.actualOutput ||
    !Quantity.from(
      result.actualOutput.amount,
      result.actualOutput.unit,
    ).amount.greaterThan('0')
  )
    invalid('Zero output must not create a production posting');
  const output = createInventoryAccount(evidence.output);
  if (
    output.bucket !== 'AVAILABLE' ||
    output.commodityId !== recipe.outputCommodityId ||
    output.unit !== recipe.outputUnit ||
    output.unit !== result.actualOutput.unit ||
    output.titleHolderId !== op.operatorId ||
    output.riskBearerId !== op.operatorId ||
    output.worldId !== op.worldId
  )
    invalid(
      'Output account must carry explicit OP title/risk and recipe commodity/unit',
    );
  if (
    recipe.materials.length !== evidence.input.materials.length ||
    evidence.materials.length !== recipe.materials.length
  )
    invalid('Production requires every recipe material exactly once');
  const refs = evidence.materials.map((m) => m.materialRef);
  if (
    new Set(refs).size !== refs.length ||
    new Set(recipe.materials.map((m) => m.materialRef)).size !==
      recipe.materials.length
  )
    invalid('Duplicate production material');
  for (const fact of evidence.input.materials) {
    const material = fact.payload;
    const binding = evidence.materials.find(
      (m) => m.materialRef === material.materialRef,
    );
    const recipeMaterial = recipe.materials.find(
      (m) => m.materialRef === material.materialRef,
    );
    if (!binding || !recipeMaterial)
      invalid('Missing recipe/account material binding');
    const account = createInventoryAccount(binding.account);
    if (
      material.inventoryRef !== account.batchId ||
      account.commodityId !== recipeMaterial.commodityId ||
      account.unit !== material.usableBefore.unit ||
      account.bucket !== 'AVAILABLE' ||
      account.worldId !== output.worldId ||
      account.countryId !== output.countryId ||
      account.titleHolderId !== op.operatorId ||
      account.riskBearerId !== op.operatorId ||
      account.batchId === output.batchId
    )
      invalid('Material account/source/batch/title/unit mismatch');
    coefficient(
      recipeMaterial.perOutput,
      result.potentialOutput,
      material.requiredAtPotentialOutput,
    );
  }
  const accounts = evidence.materials.map((m) => canonicalSerialize(m.account));
  if (new Set(accounts).size !== accounts.length)
    invalid('Duplicate source account');
  coefficient(
    recipe.energyPerOutput,
    result.potentialOutput,
    evidence.input.energy.payload.requiredAtPotentialOutput,
  );
  coefficient(
    recipe.labourPerOutput,
    result.potentialOutput,
    evidence.input.labour.payload.requiredAtPotentialOutput,
  );
  coefficient(
    recipe.logisticsPerOutput,
    result.potentialOutput,
    evidence.input.logistics.payload.requiredAtPotentialOutput,
  );
  const cost = Money.from(op.settledCost.amount, op.settledCost.currency);
  if (!cost.amount.greaterThan('0'))
    invalid('Production cost must be explicitly funded, not zero');
  coefficient(recipe.costPerOutput, result.actualOutput, {
    amount: cost.toCanonicalValue().amount,
    unit: cost.currency,
  });
  if (!/^sha256:[a-f0-9]{64}$/u.test(op.fundingFingerprint))
    invalid('Funding fingerprint missing');
  return immutableJson({
    schemaVersion: PRODUCTION_CONSUMPTION_SCHEMA_VERSION,
    evidence,
    result,
  });
}

export function createProductionConsumptionPosting(
  input: {
    readonly postingId: InventoryPostingId;
    readonly command: CanonicalCommand;
    readonly transition: AuthoritativeTransition;
    readonly evidence: ProductionConsumptionEvidence;
  },
  sha256Hex: Sha256Hex,
): Readonly<InventoryProductionPosting> {
  const payload = productionConsumptionEventPayload(input.evidence);
  const binding = bindAuthoritativeTransition(input, sha256Hex);
  const op = payload.evidence.operating.payload;
  if (
    binding.worldId !== op.worldId ||
    input.command.countryId !== payload.evidence.output.countryId ||
    input.command.expectedWorldVersion !== binding.worldVersionBefore ||
    binding.worldVersionBefore !== op.worldVersion ||
    input.evidence.input.trace.snapshot.sourceVersion !==
      `WORLD_VERSION.${op.worldVersion}` ||
    input.evidence.input.trace.snapshotAt.amount !==
      binding.simTime.ticks.toString() ||
    input.evidence.input.trace.snapshotAt.unit !== 'sim_millisecond'
  )
    invalid(
      'Production evidence must bind the current WorldVersion and SimTime',
    );
  const matching = input.transition.events.filter(
    (event) =>
      event.eventType === PRODUCTION_SETTLED_EVENT_TYPE &&
      event.canonicalPayload === canonicalSerialize(payload),
  );
  if (matching.length !== 1)
    invalid(
      'Production posting requires one exact production settlement Event',
    );
  const entries: InventoryPostingEntry[] = payload.evidence.materials.flatMap(
    (m) => {
      const use = payload.result.materialConsumption.find(
        (c) => c.inputRef === m.materialRef,
      );
      if (!use) invalid('Missing V13 material consumption');
      return use.proposedConsumed.amount === '0'
        ? []
        : [
            {
              account: createInventoryAccount(m.account),
              delta: Quantity.from(
                `-${use.proposedConsumed.amount}`,
                use.proposedConsumed.unit,
              ),
            },
          ];
    },
  );
  entries.push({
    account: createInventoryAccount(payload.evidence.output),
    delta: Quantity.from(
      payload.result.actualOutput.amount,
      payload.result.actualOutput.unit,
    ),
  });
  entries.sort((a, b) => {
    const left = canonicalSerialize(a.account);
    const right = canonicalSerialize(b.account);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const intent = Object.freeze({
    schemaVersion: PRODUCTION_CONSUMPTION_SCHEMA_VERSION,
    postingId: inventoryPostingId(input.postingId),
    worldId: binding.worldId,
    causationCommandId: binding.commandId,
    causationEventIds: binding.eventIds,
    worldVersionBefore: binding.worldVersionBefore,
    worldVersionAfter: binding.worldVersionAfter,
    simTime: binding.simTime,
    transitionBinding: binding,
    operation: 'PRODUCE_AND_CONSUME' as const,
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
    evidence: payload.evidence,
    result: payload.result,
  });
  const posting: InventoryProductionPosting = Object.freeze({
    ...intent,
    fingerprint: canonicalSha256(canonicalHashInput(intent), sha256Hex),
  });
  instances.add(posting);
  return posting;
}

/** @internal Same-ledger writer accepts only constructor-validated production objects. */
export function isValidatedProductionPosting(
  posting: InventoryLedgerPosting,
): posting is InventoryProductionPosting {
  return instances.has(posting);
}

/** Replay must resolve real settled financial lineage, not merely accept a source reference. */
export function assertProductionFunding(
  posting: InventoryProductionPosting,
  batches: readonly FinancialPostingBatch[],
  financial: FinancialLedgerState,
): void {
  const op = posting.evidence.operating.payload;
  const batch = batches.find(
    (b) =>
      b.batchId === op.fundingBatchId &&
      b.fingerprint === op.fundingFingerprint,
  );
  if (
    !isAuthoritativeFinancialLedgerState(financial) ||
    financial.worldId !== posting.worldId ||
    !financial.appliedBatches.some(
      (b) =>
        b.batchId === op.fundingBatchId &&
        b.fingerprint === op.fundingFingerprint,
    )
  )
    invalid(
      'Production funding must be applied to the authoritative same ledger',
    );
  if (
    !batch ||
    batch.worldId !== posting.worldId ||
    BigInt(batch.worldVersionAfter) > BigInt(posting.worldVersionAfter)
  )
    invalid('Production funding is not in the settled financial lineage');
  const cost = Money.from(op.settledCost.amount, op.settledCost.currency);
  const expense = batch.legs.find((l) => l.legId === op.costLegId);
  if (
    !expense ||
    expense.direction !== 'DEBIT' ||
    expense.account.accountClass !== 'EXPENSE' ||
    expense.account.ownerId !== op.operatorId ||
    expense.account.countryId !== posting.evidence.output.countryId ||
    expense.amount.currency !== cost.currency ||
    !expense.amount.amount.equals(cost.amount)
  )
    invalid('Production cost does not match the settled expense leg');
  const cash = batch.legs.filter(
    (l) =>
      l.direction === 'CREDIT' &&
      l.account.ownerId === op.operatorId &&
      l.account.countryId === posting.evidence.output.countryId &&
      (l.account.accountClass === 'CASH' ||
        l.account.accountClass === 'DEPOSIT') &&
      l.amount.currency === cost.currency,
  );
  if (cash.length !== 1 || !cash[0]!.amount.amount.equals(cost.amount))
    invalid(
      'Production needs an exact settled cash/deposit payment, not a free payable',
    );
  const balance = financial.positions.find(
    (p) => p.account.accountId === cash[0]!.account.accountId,
  );
  if (balance?.netDebitBalance.amount.isNegative())
    invalid(
      'Production payment cannot leave negative cash or unfunded capacity',
    );
}

/** Existing 0007/0009 constraints admit only V08 movements. Never cast production into them. */
export function assertInventoryPersistenceSchemaAdmitted(
  postings: readonly InventoryLedgerPosting[],
): void {
  if (
    postings.some(
      (p) => p.schemaVersion === PRODUCTION_CONSUMPTION_SCHEMA_VERSION,
    )
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.VERSION_MISMATCH,
      PRODUCTION_PERSISTENCE_SCHEMA_NOT_ADMITTED,
    );
  }
}
