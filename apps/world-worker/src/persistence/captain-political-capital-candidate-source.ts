import {
  DOMAIN_ERROR_CODES,
  DomainError,
  assertCaptainPoliticalCapitalAuthorization,
  assertWorldWriterCanCommit,
  canonicalHashInput,
  canonicalSha256,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createOutboxMessage,
  createWorldWriterCommitAssertion,
  parseCaptainPoliticalCapitalAllocation,
  prepareCaptainPoliticalCapitalEvent,
  reauthorizeCommitAuthorizationProof,
  type CanonicalCommand,
  type CaptainPoliticalCapitalSourceSnapshot,
  type Sha256Hex,
  type WorldWriterLease,
} from '@econmind/core';

import type {
  AtomicTransitionCandidateFactory,
  AtomicTransitionDraft,
} from './atomic-transition-repository.js';

export type CaptainPoliticalCapitalMissing =
  | 'CURRENT_WORLD_HEAD'
  | 'POLITICAL_CAPITAL_EVENT_LINEAGE'
  | 'REASON_RECORD'
  | 'WRITER_LEASE';

export class CaptainPoliticalCapitalSourceMissing extends DomainError {
  readonly missing: readonly CaptainPoliticalCapitalMissing[];

  constructor(missing: readonly CaptainPoliticalCapitalMissing[]) {
    super(
      DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
      `Captain source missing: ${missing.join(',')}`,
    );
    this.missing = Object.freeze([...missing]);
  }
}

export type CaptainPoliticalCapitalSourceRead =
  | Readonly<{
      kind: 'MISSING';
      missing: readonly CaptainPoliticalCapitalMissing[];
    }>
  | Readonly<{
      kind: 'READ';
      snapshot: CaptainPoliticalCapitalSourceSnapshot;
      lease: WorldWriterLease;
    }>;

/**
 * Worker composition dependency, never a request DTO or authority issuer.
 * Implementations must read the authoritative global head, replayed capital,
 * actual reason record and current writer lease at ONE consistent cutoff.
 * They must verify durable event lineage before returning READ; parsing a
 * FoundationFact or accepting a supplied snapshot is not that verification.
 * This slice does not implement the shared production domain reader.
 */
export interface CaptainPoliticalCapitalCandidateSource {
  load(
    input: Readonly<{
      command: CanonicalCommand;
      observedAtReal: string;
    }>,
  ): Promise<CaptainPoliticalCapitalSourceRead>;
}

/** Safe default: missing production infrastructure cannot produce a draft. */
export function unavailableCaptainPoliticalCapitalSource(): CaptainPoliticalCapitalCandidateSource {
  return Object.freeze({
    async load() {
      return Object.freeze({
        kind: 'MISSING' as const,
        missing: Object.freeze([
          'CURRENT_WORLD_HEAD',
          'POLITICAL_CAPITAL_EVENT_LINEAGE',
          'REASON_RECORD',
          'WRITER_LEASE',
        ] as const),
      });
    },
  });
}

/**
 * Adapts one actual server read to the EXISTING queued-command/atomic protocol.
 * No SQL, second dispatcher, ledger, clock, or persistence commit is created.
 * AtomicTransitionRepository still owns reauthorization, fence/CAS and commit.
 */
export function createCaptainPoliticalCapitalCandidateFactory(input: {
  readonly sha256Hex: Sha256Hex;
  readonly source?: CaptainPoliticalCapitalCandidateSource;
}): AtomicTransitionCandidateFactory {
  const source = input.source ?? unavailableCaptainPoliticalCapitalSource();
  return Object.freeze({
    async prepare(
      candidate: Parameters<AtomicTransitionCandidateFactory['prepare']>[0],
    ): Promise<AtomicTransitionDraft> {
      const command = candidate.command;
      parseCaptainPoliticalCapitalAllocation(command, input.sha256Hex);
      assertCaptainPoliticalCapitalAuthorization(
        command,
        candidate.commitAuthorization,
      );
      await reauthorizeCommitAuthorizationProof(candidate.commitAuthorization);
      const read = await source.load({
        command,
        observedAtReal: candidate.observedAtReal,
      });
      if (read.kind === 'MISSING')
        throw new CaptainPoliticalCapitalSourceMissing(read.missing);
      const commitAssertion = createWorldWriterCommitAssertion(
        read.lease,
        read.snapshot.worldVersion,
      );
      assertWorldWriterCanCommit(
        read.lease,
        commitAssertion,
        candidate.observedAtReal,
        read.snapshot.worldVersion,
      );
      const prepared = prepareCaptainPoliticalCapitalEvent({
        command,
        source: read.snapshot,
        eventId: `EVENT_${command.commandId}_CAPITAL`,
        recordedAtReal: candidate.observedAtReal,
        sha256Hex: input.sha256Hex,
      });
      // Scope cannot be inferred from a valid lease for another world.
      if (commitAssertion.worldId !== command.worldId)
        throw new DomainError(
          DOMAIN_ERROR_CODES.WRITER_FENCE_STALE,
          'Captain source lease belongs to another world',
        );
      const transition = createAuthoritativeTransition({
        command,
        worldVersionBefore: read.snapshot.worldVersion,
        worldVersionAfter: prepared.event.worldVersion,
        events: [prepared.event],
      });
      const receipt = createFinalCommandReceipt({
        command,
        outcome: 'COMMITTED',
        reasonCode: null,
        transition,
        simTime: command.simTime,
        recordedAtReal: candidate.observedAtReal,
      });
      const outboxPayload = Object.freeze({
        schemaVersion: 'captain-political-capital-notification-v1',
        countryId: command.countryId,
        eventId: prepared.event.eventId,
        worldVersion: prepared.event.worldVersion,
      });
      const outbox = createOutboxMessage({
        messageId: `OUTBOX_${command.commandId}_CAPITAL`,
        worldId: command.worldId,
        commandId: command.commandId,
        eventId: prepared.event.eventId,
        payload: outboxPayload,
        payloadHash: canonicalSha256(
          canonicalHashInput(outboxPayload),
          input.sha256Hex,
        ),
        availableAtSimTime: command.simTime,
      });
      // Derived event-bound checkpoint only, never an independently writable balance.
      const checkpoint = Object.freeze({
        key: `CAPTAIN_POLITICAL_CAPITAL_${command.countryId}`,
        payload: Object.freeze({
          schemaVersion: 'captain-political-capital-checkpoint-v1',
          worldId: command.worldId,
          countryId: command.countryId,
          worldVersion: prepared.event.worldVersion,
          eventSequence: prepared.event.sequence,
          eventId: prepared.event.eventId,
          eventFingerprint: prepared.event.fingerprint,
          commandId: command.commandId,
          commandFingerprint: command.fingerprint,
          sourceSnapshotHash: read.snapshot.trace.snapshot.snapshotHash,
          capital: prepared.capitalAfter,
        }),
      });
      return Object.freeze({
        transition,
        receipt,
        commitAssertion,
        authorityKind: 'DISCRETIONARY_USER',
        observedAtReal: candidate.observedAtReal,
        inventoryPostings: Object.freeze([]),
        financialPostingBatches: Object.freeze([]),
        outboxMessages: Object.freeze([outbox]),
        currentMaterializations: Object.freeze([checkpoint]),
      });
    },
  });
}
