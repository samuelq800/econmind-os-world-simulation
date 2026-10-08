import {
  DOMAIN_ERROR_CODES,
  DomainError,
  assertCaptainPoliticalCapitalAuthorization,
  assertWorldWriterCanCommit,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createOutboxMessage,
  createWorldWriterCommitAssertion,
  parseCaptainPoliticalCapitalAllocation,
  prepareCaptainPoliticalCapitalEvent,
  reauthorizeCommitAuthorizationProof,
  replayCaptainPoliticalCapitalAllocation,
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

/**
 * Required Root server dependency: read genuinely admitted operating lineage,
 * replay it to this global head, resolve the actual reason record and lease at
 * one consistent cutoff. This interface does NOT perform or certify admission.
 * No request DTO, magic source tag, boolean override or implicit genesis exists.
 */
export interface CaptainPoliticalCapitalRuntimeReader {
  read(
    input: Readonly<{
      worldId: CanonicalCommand['worldId'];
      countryId: CanonicalCommand['countryId'];
      commandId: CanonicalCommand['commandId'];
      commandFingerprint: CanonicalCommand['fingerprint'];
      expectedWorldVersion: string;
      simTime: string;
      reasonFactRef: string;
      observedAtReal: string;
    }>,
  ): Promise<CaptainPoliticalCapitalSourceRead>;
}

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `CAP-1 source: ${message}`,
  );
}

function frozenSnapshot(
  value: CaptainPoliticalCapitalSourceSnapshot,
): CaptainPoliticalCapitalSourceSnapshot {
  const copy: CaptainPoliticalCapitalSourceSnapshot = JSON.parse(
    canonicalSerialize(value),
  );
  const keys = Object.keys(copy);
  const fields = [
    'worldId',
    'countryId',
    'worldVersion',
    'lastEventSequence',
    'trace',
    'capitalFact',
    'reasonFact',
  ];
  if (
    keys.length !== fields.length ||
    keys.some((key) => !fields.includes(key))
  )
    invalid('Missing or unknown source snapshot fields');
  function freeze(item: unknown): void {
    if (item !== null && typeof item === 'object') {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  }
  freeze(copy);
  return copy;
}

function frozenRead(
  read: CaptainPoliticalCapitalSourceRead,
): CaptainPoliticalCapitalSourceRead {
  if (read.kind === 'MISSING') {
    const allowed: readonly CaptainPoliticalCapitalMissing[] = [
      'CURRENT_WORLD_HEAD',
      'POLITICAL_CAPITAL_EVENT_LINEAGE',
      'REASON_RECORD',
      'WRITER_LEASE',
    ];
    if (
      !Array.isArray(read.missing) ||
      read.missing.length === 0 ||
      read.missing.some((gap) => !allowed.includes(gap))
    )
      invalid('Missing source requires exact known gaps');
    return Object.freeze({
      kind: 'MISSING',
      missing: Object.freeze([...read.missing]),
    });
  }
  if (read.kind !== 'READ') invalid('Unsupported source read result');
  // Preserve the existing issued lease instance; copying it would lose its brand.
  return Object.freeze({
    kind: 'READ',
    snapshot: frozenSnapshot(read.snapshot),
    lease: read.lease,
  });
}

/** SOURCE_TO_DRAFT_ONLY adapter. Reader absence refuses, never seeds state. */
export function createCaptainPoliticalCapitalRuntimeSource(input: {
  readonly reader: CaptainPoliticalCapitalRuntimeReader | null;
  readonly sha256Hex: Sha256Hex;
}): CaptainPoliticalCapitalCandidateSource {
  return Object.freeze({
    async load(
      request: Parameters<CaptainPoliticalCapitalCandidateSource['load']>[0],
    ): Promise<CaptainPoliticalCapitalSourceRead> {
      const terms = parseCaptainPoliticalCapitalAllocation(
        request.command,
        input.sha256Hex,
      );
      if (input.reader === null)
        return unavailableCaptainPoliticalCapitalSource().load(request);
      return frozenRead(
        await input.reader.read(
          Object.freeze({
            worldId: request.command.worldId,
            countryId: request.command.countryId,
            commandId: request.command.commandId,
            commandFingerprint: request.command.fingerprint,
            expectedWorldVersion: request.command.expectedWorldVersion!,
            simTime: request.command.simTime.toCanonicalValue(),
            reasonFactRef: terms.reasonFactRef,
            observedAtReal: request.observedAtReal,
          }),
        ),
      );
    },
  });
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
      const read = frozenRead(
        await source.load({
          command,
          observedAtReal: candidate.observedAtReal,
        }),
      );
      // Recheck after the awaited reader; reader-time revocation must not return a draft.
      await reauthorizeCommitAuthorizationProof(candidate.commitAuthorization);
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
      if (read.lease.renewedAtReal > candidate.observedAtReal)
        invalid('Lease renewal is later than current explicit observation');
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
      // One-step Core replay verifies this draft against the same immutable read.
      // It does NOT certify the reader's historical/genesis admission.
      const replayed = replayCaptainPoliticalCapitalAllocation({
        state: {
          worldId: read.snapshot.worldId,
          countryId: read.snapshot.countryId,
          worldVersion: read.snapshot.worldVersion,
          lastEventSequence: read.snapshot.lastEventSequence,
          capital: read.snapshot.capitalFact.payload,
          applied: [],
        },
        event: prepared.event,
        sha256Hex: input.sha256Hex,
      });
      if (
        canonicalSerialize(replayed.capital) !==
        canonicalSerialize(prepared.capitalAfter)
      )
        invalid('Core replay disagrees with prepared capital');
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
          schemaVersion: 'captain-political-capital-checkpoint-v2',
          worldId: command.worldId,
          countryId: command.countryId,
          worldVersion: prepared.event.worldVersion,
          eventSequence: prepared.event.sequence,
          eventId: prepared.event.eventId,
          eventFingerprint: prepared.event.fingerprint,
          commandId: command.commandId,
          commandFingerprint: command.fingerprint,
          sourceSnapshotHash: read.snapshot.trace.snapshot.snapshotHash,
          worldVersionBefore: transition.worldVersionBefore,
          worldVersionAfter: transition.worldVersionAfter,
          eventSequenceBefore: read.snapshot.lastEventSequence,
          eventIds: transition.eventIds,
          events: transition.events,
          capital: replayed.capital,
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
