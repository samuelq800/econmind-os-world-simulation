/** Receipt matching supplements the existing real original/current-use guard.
 * It never issues operating permission, payer authority or source admission. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  isValidatedProductionPosting,
  bindAuthoritativeTransition,
  productionConsumptionEventPayload,
  PRODUCTION_SETTLED_EVENT_TYPE,
} from '@econmind/core';
import {
  assertProductionWaterConsumptionCommitBinding,
  PRODUCTION_WATER_CONSUMED_EVENT,
  type ProductionWaterConsumptionCommitBinding,
} from '@econmind/core/production-water-consumption';
import {
  ProtectedIndustryProductionGuard,
  type IndustryProductionCutoffGuard,
  type IndustryProductionCutoffRequest,
} from './industry-production-source-cutoff.js';
import {
  isPostwarIndustryCurrentSource,
  consumeIndustryOperatingCurrentFrom,
  readIndustrySettledPaymentForCutoffFrom,
  type PostwarIndustryCurrentSource,
  type IndustryOperatingCurrentRequest,
  type IndustryOperatingReceiptRequirement,
} from './postwar-industry-current-source.js';
import type { SqlExecutor } from './sql-database.js';
import type { IndustryOperatingReceiptKind } from './postwar-industry-operating-receipts.js';
import {
  prepareIndustrySettledPaymentData,
  readPreparedIndustrySettledPaymentData,
  type IndustrySettledPaymentInput,
  type IndustrySettledPaymentDataPreparation,
} from './postwar-industry-settled-payment-receipt.js';
export interface PostwarIndustryOperatingCutoffGuard extends IndustryProductionCutoffGuard {
  preparePaymentData(
    input: IndustrySettledPaymentInput,
  ): IndustrySettledPaymentDataPreparation;
}
const guards = new WeakSet<object>();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw Error('INDUSTRY_OPERATING_CUTOFF:' + s);
}
export function isPostwarIndustryOperatingCutoffGuard(
  v: unknown,
): v is IndustryProductionCutoffGuard {
  return v !== null && typeof v === 'object' && guards.has(v);
}
/** Pure binding only. No SQL/authorization/issuance occurs here. */
export function industryOperatingRequirementsForCandidate(
  request: IndustryProductionCutoffRequest,
  waterBinding?: ProductionWaterConsumptionCommitBinding,
): Readonly<IndustryOperatingCurrentRequest> {
  const { command, transition, posting } = request;
  if (!isValidatedProductionPosting(posting))
    invalid('GENUINE_CORE_PRODUCTION_REQUIRED');
  const binding = bindAuthoritativeTransition({ command, transition }, sha),
    e = posting.evidence,
    op = e.operating.payload;
  if (
    canonicalSerialize(binding) !==
      canonicalSerialize(posting.transitionBinding) ||
    command.worldId !== op.worldId ||
    command.countryId !== e.output.countryId ||
    op.worldVersion !== request.expectedHead.worldVersion ||
    command.expectedWorldVersion !== request.expectedHead.worldVersion ||
    transition.worldVersionBefore !== request.expectedHead.worldVersion ||
    BigInt(transition.events[0]!.sequence) !==
      BigInt(request.expectedHead.eventSequence) + 1n ||
    op.fundingBatchId !== request.fundingBatchId ||
    op.fundingFingerprint !== request.fundingFingerprint ||
    op.costLegId !== request.costLegId ||
    transition.events[0]!.eventType !== PRODUCTION_SETTLED_EVENT_TYPE ||
    transition.events[0]!.canonicalPayload !==
      canonicalSerialize(productionConsumptionEventPayload(e))
  )
    invalid('EXACT_CANDIDATE_HEAD_AND_FUNDING_REQUIRED');
  const requirements: IndustryOperatingReceiptRequirement[] = [];
  const add = (
    kind: IndustryOperatingReceiptKind,
    receiptId: string,
    factCanonicalPayload: string,
  ) =>
    requirements.push(Object.freeze({ kind, receiptId, factCanonicalPayload }));
  add('WORK', e.input.labour.factRef, e.input.labour.canonicalPayload);
  add(
    'POWER_DELIVERY',
    e.input.energy.factRef,
    e.input.energy.canonicalPayload,
  );
  add(
    'LOGISTICS_DELIVERY',
    e.input.logistics.factRef,
    e.input.logistics.canonicalPayload,
  );
  add('RECIPE', e.recipe.factRef, e.recipe.canonicalPayload);
  add('PAID_COST', op.costSourceRef, canonicalSerialize(op));
  for (const [kind, key] of [
    ['MAINTENANCE', 'maintenanceAppliedRef'],
    ['TECHNOLOGY_RIGHT', 'technologyRightRef'],
    ['OPERATING_PERMISSION', 'operatingPermissionRef'],
  ] as const)
    add(
      kind,
      op[key],
      canonicalSerialize({ facilityRef: op.facilityRef, [key]: op[key] }),
    );
  if (
    transition.events.some(
      (x) => x.eventType === PRODUCTION_WATER_CONSUMED_EVENT,
    )
  ) {
    if (!waterBinding) invalid('GENUINE_WATER_COMMIT_BINDING_REQUIRED');
    assertProductionWaterConsumptionCommitBinding(waterBinding);
    if (
      waterBinding.commandFingerprint !== command.fingerprint ||
      waterBinding.postingFingerprint !== posting.fingerprint ||
      canonicalSerialize(waterBinding.transitionBinding) !==
        canonicalSerialize(binding) ||
      transition.events.length !== 2 ||
      transition.events[1]!.eventId !== waterBinding.waterEventId ||
      transition.events[1]!.fingerprint !== waterBinding.waterEventFingerprint
    )
      invalid('EXACT_WATER_CANDIDATE_REQUIRED');
    add(
      'WATER_DELIVERY',
      waterBinding.waterAccount.accountRef,
      canonicalSerialize({
        account: waterBinding.waterAccount,
        allocationSourceHash: waterBinding.allocationSourceHash,
        waterRecipe: waterBinding.waterRecipe,
      }),
    );
  } else if (waterBinding || transition.events.length !== 1)
    invalid('UNSUPPORTED_EVENT_GROUP');
  return Object.freeze({
    scope: Object.freeze({
      worldId: command.worldId,
      countryId: command.countryId,
      locationId: e.output.physicalLocationId,
      facilityId: op.facilityRef,
      operatorId: op.operatorId,
    }),
    targetCommand: Object.freeze({
      commandId: command.commandId,
      fingerprint: command.fingerprint,
    }),
    head: Object.freeze({ ...request.expectedHead }),
    simTime: command.simTime.toCanonicalValue(),
    requirements: Object.freeze(requirements),
  });
}
export function createPostwarIndustryOperatingCutoffGuard(
  config: Readonly<{
    source: PostwarIndustryCurrentSource;
    protectedGuard: ProtectedIndustryProductionGuard;
    waterBinding?: ProductionWaterConsumptionCommitBinding;
  }>,
): Readonly<PostwarIndustryOperatingCutoffGuard> {
  if (
    !isPostwarIndustryCurrentSource(config.source) ||
    !(config.protectedGuard instanceof ProtectedIndustryProductionGuard)
  )
    invalid('FIXED_SOURCE_AND_PROTECTED_GUARD_REQUIRED');
  const source = config.source,
    protectedGuard = config.protectedGuard,
    water = config.waterBinding;
  if (water) assertProductionWaterConsumptionCommitBinding(water);
  const preparedByTransition = new WeakMap<
    object,
    IndustrySettledPaymentDataPreparation
  >();
  const guard: Readonly<PostwarIndustryOperatingCutoffGuard> = Object.freeze({
    preparePaymentData(input: IndustrySettledPaymentInput) {
      const prepared = prepareIndustrySettledPaymentData(input);
      preparedByTransition.set(input.target.transition, prepared);
      return prepared;
    },
    async assertCurrentFrom(
      tx: SqlExecutor,
      request: Readonly<IndustryProductionCutoffRequest>,
    ) {
      const requirements = industryOperatingRequirementsForCandidate(
        request,
        water,
      );
      const prepared = preparedByTransition.get(request.transition);
      if (!prepared) invalid('ACTUAL_PAYMENT_DATA_PREPARATION_REQUIRED');
      const data = readPreparedIndustrySettledPaymentData(prepared, request);
      // Called by Atomic only after its existing lease -> H -> authority locks.
      // Preparation is inert data; this call performs fresh real DB validation.
      return source.withSettledPaymentFrom(tx, data, async () => {
        const payment = readIndustrySettledPaymentForCutoffFrom(
          tx,
          source,
          request.command.fingerprint,
        );
        if (
          payment.payment.worldId !== request.command.worldId ||
          payment.payment.countryId !== request.command.countryId ||
          payment.payment.facilityId !== requirements.scope.facilityId ||
          payment.payment.operatorId !== requirements.scope.operatorId ||
          canonicalSerialize(payment.payment.observedHead) !==
            canonicalSerialize(request.expectedHead) ||
          payment.payment.factCanonicalPayload !==
            canonicalSerialize(request.posting.evidence.operating.payload)
        )
          invalid('EXACT_ACTUAL_PAYMENT_SCOPE_REQUIRED');
        const remaining = Object.freeze({
          ...requirements,
          requirements: Object.freeze(
            requirements.requirements.filter((r) => r.kind !== 'PAID_COST'),
          ),
        });
        return source.withCurrentFrom(tx, remaining, async (lease) => {
          // A financial settlement is independently DB-verified. A generic
          // record-event called PAID_COST cannot replace that actual payment.
          const facts = consumeIndustryOperatingCurrentFrom(tx, lease);
          if (
            facts.seedFingerprint !== payment.seedFingerprint ||
            facts.admissionRef !== payment.admissionRef ||
            facts.registrationRef !== payment.registrationRef ||
            facts.documentSha256 !== payment.documentSha256
          )
            invalid('PAYMENT_AND_OPERATING_ORIGINAL_DIFFER');
          // Fixed prototype avoids a caller overriding the protected guard's method.
          return ProtectedIndustryProductionGuard.prototype.assertCurrentFrom.call(
            protectedGuard,
            tx,
            request,
          );
        });
      });
    },
  });
  guards.add(guard);
  return guard;
}
