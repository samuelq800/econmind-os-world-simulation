// NON_ACTIVATED / PARALLEL_PREPARATION. Root owns durable readers and dispatch.
import {
  CENTRAL_BANK_OMO_CAPABILITY,
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalHashInput,
  canonicalSha256,
  createFinalCommandReceipt,
  createOutboxMessage,
  isCommitAuthorizationProof,
  parseCentralBankOmoIntent,
  prepareCentralBankOmoTransition,
  reauthorizeCommitAuthorizationProof,
  validateCentralBankOmoSource,
  type CanonicalCommand,
  type CentralBankOmoSource,
  type CommitAuthorizationProof,
  type Sha256Hex,
  type WorldWriterCommitAssertion,
} from '@econmind/core';
import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from './atomic-transition-repository.js';

export interface CentralBankOmoReader {
  /** Acquire one coherent durable lineage, quote and held-batch snapshot.
   * No request balances/holdings, fallback seed, clock fabrication or R/A backing.
   * Missing official source MUST throw; no activation through this interface.
   */
  read(input: {
    readonly worldId: CanonicalCommand['worldId'];
    readonly commandId: CanonicalCommand['commandId'];
    readonly commandFingerprint: CanonicalCommand['fingerprint'];
    readonly countryId: CanonicalCommand['countryId'];
    readonly expectedWorldVersion: string;
    readonly settlementSimTime: string;
    readonly securityRef: string;
    readonly batchRef: string;
  }): Promise<CentralBankOmoPreparation>;
}

export interface CentralBankOmoPreparation {
  readonly source: CentralBankOmoSource;
  readonly commitAssertion: WorldWriterCommitAssertion;
  readonly eventId: string;
  readonly eventSequence: string;
  readonly financialBatchId: string;
  readonly outboxMessageId: string;
}
export interface CentralBankOmoDraftInput extends CentralBankOmoPreparation {
  readonly command: CanonicalCommand;
  readonly observedAtReal: string;
  readonly sha256Hex: Sha256Hex;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `CB-1: ${message}`,
  );
}
async function authorize(
  command: CanonicalCommand,
  proof: CommitAuthorizationProof | null,
) {
  if (
    proof === null ||
    !isCommitAuthorizationProof(proof) ||
    proof.capability !== CENTRAL_BANK_OMO_CAPABILITY ||
    proof.officeId !== 'CENTRAL_BANK' ||
    proof.commandId !== command.commandId ||
    proof.commandFingerprint !== command.fingerprint ||
    proof.worldId !== command.worldId ||
    proof.countryId !== command.countryId ||
    proof.authSubject !== command.authSubject ||
    proof.actorId !== command.actorId
  )
    invalid('issued current Central Bank command authorization required');
  await reauthorizeCommitAuthorizationProof(proof);
}

/** Source gates run before downstream candidate factory entry, with no writes. */
export async function loadCentralBankOmoCandidateSource(input: {
  readonly command: CanonicalCommand;
  readonly commitAuthorization: CommitAuthorizationProof | null;
  readonly reader: CentralBankOmoReader;
  readonly sha256Hex: Sha256Hex;
}): Promise<CentralBankOmoPreparation> {
  const intent = parseCentralBankOmoIntent(input.command, input.sha256Hex);
  await authorize(input.command, input.commitAuthorization);
  const preparation = await input.reader.read({
    worldId: input.command.worldId,
    commandId: input.command.commandId,
    commandFingerprint: input.command.fingerprint,
    countryId: input.command.countryId,
    expectedWorldVersion: input.command.expectedWorldVersion!,
    settlementSimTime: intent.settlementSimTime,
    securityRef: intent.securityRef,
    batchRef: intent.batchRef,
  });
  const assertion = preparation.commitAssertion;
  if (
    assertion.worldId !== input.command.worldId ||
    assertion.expectedWorldVersion !== input.command.expectedWorldVersion ||
    typeof assertion.fencingToken !== 'string' ||
    !/^[1-9]\d*$/u.test(assertion.fencingToken) ||
    typeof assertion.holderId !== 'string' ||
    assertion.holderId.length === 0 ||
    !/^[1-9]\d*$/u.test(preparation.eventSequence)
  )
    invalid('same World/version/positive fence and event sequence required');
  const checked = validateCentralBankOmoSource({
    command: input.command,
    source: preparation.source,
    sha256Hex: input.sha256Hex,
  });
  if (
    preparation.eventSequence !==
    (BigInt(checked.facts.currentEventSequence) + 1n).toString()
  )
    invalid('current global Event sequence mismatch');
  await authorize(input.command, input.commitAuthorization);
  return Object.freeze({
    ...preparation,
    // Preserve the existing canonical assertion identity, including its brand.
    commitAssertion: Object.freeze(assertion),
    source: Object.freeze({
      facts: checked.facts,
      trace: checked.trace,
      financialState: preparation.source.financialState,
    }),
  });
}

/** Uses the existing Atomic Draft; transaction cutoff/fence remains authoritative. */
export function prepareCentralBankOmoAtomicDraft(
  input: CentralBankOmoDraftInput,
): AtomicTransitionDraft {
  const result = prepareCentralBankOmoTransition(input);
  const payload = {
    schemaVersion: 'central-bank-omo-outbox-v1',
    eventId: result.event.eventId,
    financialPostingFingerprint: result.posting.fingerprint,
  };
  return Object.freeze({
    transition: result.transition,
    inventoryPostings: Object.freeze([]),
    financialPostingBatches: Object.freeze([result.posting]),
    receipt: createFinalCommandReceipt({
      command: input.command,
      outcome: 'COMMITTED',
      reasonCode: null,
      transition: result.transition,
      simTime: input.command.simTime,
      recordedAtReal: input.observedAtReal,
    }),
    outboxMessages: Object.freeze([
      createOutboxMessage({
        messageId: input.outboxMessageId,
        worldId: input.command.worldId,
        commandId: input.command.commandId,
        eventId: result.event.eventId,
        payload,
        payloadHash: canonicalSha256(
          canonicalHashInput(payload),
          input.sha256Hex,
        ),
        availableAtSimTime: input.command.simTime,
      }),
    ]),
    // Root must add the shared, lineage-bound domain current materializations.
    currentMaterializations: Object.freeze([]),
    authorityKind: 'DISCRETIONARY_USER',
    commitAssertion: input.commitAssertion,
    observedAtReal: input.observedAtReal,
  });
}

/** Root first loads/gates the server source, then enters this canonical factory. */
export function createCentralBankOmoCandidateFactory(input: {
  readonly preparation: CentralBankOmoPreparation;
  readonly sha256Hex: Sha256Hex;
}): AtomicTransitionCandidateFactory {
  return Object.freeze({
    async prepare(
      candidate: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
    ) {
      await authorize(candidate.command, candidate.commitAuthorization);
      if (
        input.preparation.commitAssertion.worldId !==
          candidate.command.worldId ||
        input.preparation.commitAssertion.expectedWorldVersion !==
          candidate.command.expectedWorldVersion
      )
        invalid('factory source World/version mismatch');
      return prepareCentralBankOmoAtomicDraft({
        ...input.preparation,
        command: candidate.command,
        observedAtReal: candidate.observedAtReal,
        sha256Hex: input.sha256Hex,
      });
    },
  });
}
