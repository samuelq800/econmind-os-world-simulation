/** Fixed Core-data -> normal Atomic draft adapter. No arbitrary reader/factory
 * callback; payment preparation is inert DATA, never an admission/OP mandate. */
import { createHash } from 'node:crypto';
import {
  INDUSTRY_PRODUCTION_CAPABILITY,
  parseIndustryProductionIntent,
  assertIndustryProductionCommandCalculation,
} from '@econmind/core/industry-production-command';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  canonicalSerialize,
  isCommitAuthorizationProof,
  reauthorizeCommitAuthorizationProof,
  createFinalCommandReceipt,
  type WorldWriterCommitAssertion,
} from '@econmind/core';
import {
  assertCurrentMaterializationObservation,
  type CurrentMaterializationObservation,
} from './current-materialization-observation.js';
import {
  assertProductionWaterConsumptionCommitBinding,
  type ProductionWaterConsumptionCommitBinding,
} from '@econmind/core/production-water-consumption';
import {
  isPostwarIndustryOperatingCutoffGuard,
  type PostwarIndustryOperatingCutoffGuard,
} from './postwar-industry-operating-cutoff.js';
import {
  isIndustrySettledPaymentDataPreparation,
  readIndustrySettledPaymentDataForCommand,
  type IndustrySettledPaymentDataPreparation,
} from './postwar-industry-settled-payment-receipt.js';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from './atomic-transition-repository.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const factories = new WeakSet<object>();
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Industry fixed candidate: ' + s,
  );
}
export function isPostwarIndustryProductionCandidateFactory(
  value: unknown,
): value is AtomicTransitionCandidateFactory {
  return value !== null && typeof value === 'object' && factories.has(value);
}
export function createPostwarIndustryProductionCandidateFactory(
  config: Readonly<{
    preparation: IndustrySettledPaymentDataPreparation;
    sourceGuard: PostwarIndustryOperatingCutoffGuard;
    commitAssertion: WorldWriterCommitAssertion;
    water?: Readonly<{
      binding: ProductionWaterConsumptionCommitBinding;
      observation: CurrentMaterializationObservation;
    }>;
  }>,
): Readonly<AtomicTransitionCandidateFactory> {
  if (
    !isIndustrySettledPaymentDataPreparation(config.preparation) ||
    !isPostwarIndustryOperatingCutoffGuard(config.sourceGuard)
  )
    invalid('GENUINE_DATA_PREPARATION_AND_FIXED_GUARD_REQUIRED');
  const preparation = config.preparation,
    sourceGuard = config.sourceGuard,
    commitAssertion = Object.freeze({ ...config.commitAssertion }),
    water = config.water;
  if (water) assertProductionWaterConsumptionCommitBinding(water.binding);
  const factory: Readonly<AtomicTransitionCandidateFactory> = Object.freeze({
    async prepare(
      candidate: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
    ): Promise<AtomicTransitionDraft> {
      const command = candidate.command;
      parseIndustryProductionIntent(command, sha);
      const proof = candidate.commitAuthorization;
      if (
        !proof ||
        !isCommitAuthorizationProof(proof) ||
        proof.officeId !== 'INDUSTRY' ||
        proof.capability !== INDUSTRY_PRODUCTION_CAPABILITY ||
        proof.worldId !== command.worldId ||
        proof.countryId !== command.countryId ||
        proof.commandId !== command.commandId ||
        proof.commandFingerprint !== command.fingerprint ||
        proof.authSubject !== command.authSubject ||
        proof.actorId !== command.actorId
      )
        invalid('CURRENT_COMMAND_BOUND_INDUSTRY_AUTHORIZATION_REQUIRED');
      await reauthorizeCommitAuthorizationProof(proof);
      const data = readIndustrySettledPaymentDataForCommand(
          preparation,
          command,
        ),
        target = data.target;
      assertIndustryProductionCommandCalculation(
        { command, transition: target.transition, posting: target.posting },
        sha,
      );
      if (
        commitAssertion.worldId !== command.worldId ||
        commitAssertion.expectedWorldVersion !== command.expectedWorldVersion ||
        !commitAssertion.holderId ||
        !/^[1-9]\d*$/u.test(commitAssertion.fencingToken) ||
        target.transition.events.some(
          (e) => e.recordedAtReal !== candidate.observedAtReal,
        )
      )
        invalid('EXACT_WRITER_SCOPE_AND_CALCULATION_TIME_REQUIRED');
      const materializations: AtomicTransitionDraft['currentMaterializations'] =
        water
          ? [
              Object.freeze({
                ...water.binding.materialization,
                observation: water.observation,
              }),
            ]
          : [];
      if (water) {
        const b = water.binding;
        if (
          b.commandFingerprint !== command.fingerprint ||
          b.postingFingerprint !== target.posting.fingerprint ||
          canonicalSerialize(b.transitionBinding) !==
            canonicalSerialize(target.posting.transitionBinding)
        )
          invalid('EXACT_WATER_COMMIT_BINDING_REQUIRED');
        assertCurrentMaterializationObservation({
          observation: water.observation,
          worldId: command.worldId,
          key: b.materialization.key,
          expectedWorldVersion: target.expectedHead.worldVersion,
        });
        if (
          water.observation.canonicalPayload === null
            ? b.beforeState.uses.length !== 0
            : water.observation.canonicalPayload !==
                canonicalSerialize(b.beforeState) ||
              water.observation.payloadHash !== b.beforeStateHash
        )
          invalid('WATER_CURRENT_REPLAY_OBSERVATION_REQUIRED');
      } else if (target.transition.events.length !== 1)
        invalid('ACTUAL_WATER_BINDING_REQUIRED');
      // Exact hook: standard lifecycle invokes prepare before normal Atomic
      // revalidation. Atomic retains this transition object, while command/posting
      // may be reconstructed; guard data is private and still fresh-SQL checked.
      sourceGuard.preparePaymentData(data);
      return Object.freeze({
        transition: target.transition,
        inventoryPostings: Object.freeze([target.posting]),
        financialPostingBatches: Object.freeze([]),
        receipt: createFinalCommandReceipt({
          command,
          transition: target.transition,
          outcome: 'COMMITTED',
          reasonCode: null,
          simTime: command.simTime,
          recordedAtReal: candidate.observedAtReal,
        }),
        outboxMessages: Object.freeze([]),
        currentMaterializations: Object.freeze(materializations),
        authorityKind: 'DISCRETIONARY_USER',
        commitAssertion,
        observedAtReal: candidate.observedAtReal,
        ...(water ? { productionWaterCommitBinding: water.binding } : {}),
      });
    },
  });
  factories.add(factory);
  return factory;
}
