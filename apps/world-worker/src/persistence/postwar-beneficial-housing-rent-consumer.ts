/** Narrow consumer of the separate beneficial housing source family. Every
 * payment is a real Core command/event/posting, independently replayed against
 * the retained financial parent. This does not enroll that family in the
 * current three-source World, provide automatic authority or commit to SQL. */
import { createHash } from 'node:crypto';
import {
  BENEFICIAL_HOUSING_RENT_COMMAND,
  BENEFICIAL_HOUSING_RENT_EVENT,
  EVENT_SCHEMA_VERSION,
  canonicalSerialize,
  createAuthoritativeTransition,
  createBeneficialHousingRentState,
  createFinalCommandReceipt,
  parseAuthoritativeEvent,
  parseOpeningSeed,
  prepareBeneficialHousingRent,
  rebuildV08LedgersFromLineage,
  settleBeneficialHousingRent,
  synchronizeBeneficialHousingRentState,
  validateCanonicalCommand,
  type BeneficialHousingRentDraft,
  type BeneficialHousingRentState,
  type CanonicalCommand,
  type FinalCommandReceipt,
  type FinancialLedgerState,
  type InventoryLedgerState,
  type SimTime,
  type V08AuthoritativeLedgerTransition,
} from '@econmind/core';
import {
  isPostwarHousingRentBindings,
  verifyPostwarHousingRentReclassificationFamily,
  type PostwarHousingRentBindings,
} from '../preparation/postwar-housing-rent-bindings.js';

export interface PostwarBeneficialHousingRentQuoteRequest {
  readonly countryId: string;
  readonly leaseId: string;
  readonly periodIndex: string;
  readonly simTime: SimTime;
  readonly history: readonly V08AuthoritativeLedgerTransition[];
}
export interface PostwarBeneficialHousingRentConsumeRequest {
  readonly command: CanonicalCommand;
  readonly history: readonly V08AuthoritativeLedgerTransition[];
  readonly observedAtReal: string;
}
export interface PostwarBeneficialHousingRentEvaluationBase {
  readonly classification: 'SOURCE_FAMILY_COMMAND_EVALUATION_NOT_COMMIT_AUTHORITY';
  readonly financial: Readonly<FinancialLedgerState>;
  readonly inventory: Readonly<InventoryLedgerState>;
}
export type PostwarBeneficialHousingRentEvaluation = Readonly<
  PostwarBeneficialHousingRentEvaluationBase &
    (
      | {
          readonly outcome: 'APPLIED';
          readonly step: Readonly<V08AuthoritativeLedgerTransition>;
          /** Candidate only; no SQL Final has been persisted by this consumer. */
          readonly receipt: Readonly<FinalCommandReceipt>;
        }
      | {
          readonly outcome: 'EXACT_DUPLICATE';
          readonly step: null;
          readonly receipt: null;
        }
    )
>;
/** Public Core ledger type references preserve their opaque internals without
 * inferring or exporting the private ledger-authority symbols in this module. */
export interface PostwarBeneficialHousingRentConsumer {
  readonly classification: 'SEPARATE_SOURCE_FAMILY_NOT_RUNTIME_ADMISSION';
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly parentSeedFingerprint: string;
  quote(
    input: PostwarBeneficialHousingRentQuoteRequest,
  ): Readonly<BeneficialHousingRentDraft>;
  consume(
    input: PostwarBeneficialHousingRentConsumeRequest,
  ): PostwarBeneficialHousingRentEvaluation;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(reason: string): never {
  throw Error(`POSTWAR_BENEFICIAL_RENT_CONSUMER:${reason}`);
}
function same(a: unknown, b: unknown, reason: string) {
  if (canonicalSerialize(a) !== canonicalSerialize(b)) invalid(reason);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function intent(command: CanonicalCommand) {
  if (command.commandType !== BENEFICIAL_HOUSING_RENT_COMMAND)
    invalid('UNSUPPORTED_COMMAND_FAMILY');
  const payload: unknown = JSON.parse(command.canonicalPayload);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    invalid('INVALID_RENT_PAYLOAD');
  const body = payload as Record<string, unknown>;
  if (
    Object.keys(body).sort().join('|') !==
      'genesisReceiptFingerprint|leaseId|periodIndex|schemaVersion' ||
    body.schemaVersion !== 'beneficial-housing-rent-command.v1' ||
    typeof body.genesisReceiptFingerprint !== 'string' ||
    typeof body.leaseId !== 'string' ||
    typeof body.periodIndex !== 'string'
  )
    invalid('INVALID_RENT_PAYLOAD');
  return {
    genesisReceiptFingerprint: body.genesisReceiptFingerprint,
    leaseId: body.leaseId,
    periodIndex: body.periodIndex,
  };
}

/** Fixed source verification, not an injected readiness callback. Each of all
 * 70 country originals must reproduce its exact child from the same parent.
 * Raw JSON hashes/ADMITTED flags alone cannot issue a Core genesis receipt. */
export function createPostwarBeneficialHousingRentConsumer(input: {
  readonly bindings: PostwarHousingRentBindings;
}): Readonly<PostwarBeneficialHousingRentConsumer> {
  if (!isPostwarHousingRentBindings(input.bindings))
    invalid('GENUINE_SOURCE_PRODUCER_REQUIRED');
  const parentSeed = parseOpeningSeed(
    JSON.parse(canonicalSerialize(input.bindings.parentSeed)),
    sha,
  );
  const seed = parseOpeningSeed(
    JSON.parse(canonicalSerialize(input.bindings.seed)),
    sha,
  );
  const verified = verifyPostwarHousingRentReclassificationFamily({
    parentSeed,
    seed,
    receipts: input.bindings.countries.map((c) => c.receipt),
  });
  const countries = new Map(
    verified.map(({ receipt }) => [receipt.countryId, receipt]),
  );
  function country(id: string) {
    const receipt = countries.get(id);
    if (!receipt) invalid('COUNTRY_NOT_IN_VERIFIED_SOURCE_FAMILY');
    return receipt;
  }
  function replay(history: readonly V08AuthoritativeLedgerTransition[]) {
    // This first validates the complete financial lineage, including event
    // order, actual Core postings, duplicate commands and exact World head.
    const rebuilt = rebuildV08LedgersFromLineage({
      seed,
      transitions: history,
      sha256Hex: sha,
    });
    let financial = rebuildV08LedgersFromLineage({
      seed,
      sha256Hex: sha,
    }).financial;
    const states = new Map<string, BeneficialHousingRentState>(
      [...countries].map(([id, receipt]) => [
        id,
        createBeneficialHousingRentState(receipt),
      ]),
    );
    let lastSimTime = 0n;
    for (const step of history) {
      const command = validateCanonicalCommand(step.command, sha);
      const body = intent(command);
      if (command.simTime.ticks < lastSimTime)
        invalid('COMMAND_PRECEDES_ACTUAL_PREFIX');
      lastSimTime = command.simTime.ticks;
      const receipt = country(command.countryId);
      if (body.genesisReceiptFingerprint !== receipt.fingerprint)
        invalid('WRONG_COUNTRY_ORIGINAL');
      const state = synchronizeBeneficialHousingRentState(
        { receipt, state: states.get(receipt.countryId)!, financial },
        sha,
      );
      const applied = settleBeneficialHousingRent(
        {
          receipt,
          state,
          financialBefore: financial,
          command,
          transition: step.transition,
          leaseId: body.leaseId,
          periodIndex: body.periodIndex,
        },
        sha,
      );
      if (applied.outcome !== 'APPLIED' || !applied.posting)
        invalid('DUPLICATE_HISTORICAL_RENT');
      same(step.inventoryPostings, [], 'UNEXPECTED_INVENTORY_EFFECT');
      same(
        step.financialPostingBatches,
        [applied.posting],
        'HISTORICAL_RENT_POSTING_DIFFERS',
      );
      financial = applied.financial;
      states.set(receipt.countryId, applied.state);
    }
    same(financial, rebuilt.financial, 'FULL_FINANCIAL_REPLAY_DIFFERS');
    return { financial, inventory: rebuilt.inventory, states, lastSimTime };
  }
  function quote(input: {
    readonly countryId: string;
    readonly leaseId: string;
    readonly periodIndex: string;
    readonly simTime: SimTime;
    readonly history: readonly V08AuthoritativeLedgerTransition[];
  }) {
    const current = replay(input.history);
    if (input.simTime.ticks < current.lastSimTime)
      invalid('COMMAND_PRECEDES_ACTUAL_PREFIX');
    const receipt = country(input.countryId);
    const state = synchronizeBeneficialHousingRentState(
      {
        receipt,
        state: current.states.get(receipt.countryId)!,
        financial: current.financial,
      },
      sha,
    );
    return prepareBeneficialHousingRent(
      { ...input, receipt, state, financialBefore: current.financial },
      sha,
    );
  }
  function consume(input: {
    readonly command: CanonicalCommand;
    readonly history: readonly V08AuthoritativeLedgerTransition[];
    readonly observedAtReal: string;
  }) {
    const command = validateCanonicalCommand(input.command, sha);
    const body = intent(command);
    const current = replay(input.history);
    if (command.worldId !== seed.worldId) invalid('WRONG_WORLD');
    const original = country(command.countryId);
    if (body.genesisReceiptFingerprint !== original.fingerprint)
      invalid('WRONG_COUNTRY_ORIGINAL');
    const previous = input.history.find(
      (step) => step.command.commandId === command.commandId,
    );
    if (previous) {
      same(previous.command, command, 'COMMAND_ID_CONFLICT');
      return freeze({
        classification:
          'SOURCE_FAMILY_COMMAND_EVALUATION_NOT_COMMIT_AUTHORITY' as const,
        outcome: 'EXACT_DUPLICATE' as const,
        step: null,
        financial: current.financial,
        inventory: current.inventory,
        receipt: null,
      });
    }
    if (command.simTime.ticks < current.lastSimTime)
      invalid('COMMAND_PRECEDES_ACTUAL_PREFIX');
    if (command.expectedWorldVersion !== current.financial.worldVersion)
      invalid('STALE_WORLD_HEAD');
    const draft = quote({
      countryId: command.countryId,
      leaseId: body.leaseId,
      periodIndex: body.periodIndex,
      simTime: command.simTime,
      history: input.history,
    });
    const after = (BigInt(current.financial.worldVersion) + 1n).toString();
    const event = parseAuthoritativeEvent(
      {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventId: `HOUSING_RENT_EVENT_${command.commandId}`,
        eventType: BENEFICIAL_HOUSING_RENT_EVENT,
        worldId: command.worldId,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        worldVersion: after,
        sequence: (BigInt(input.history.length) + 1n).toString(),
        simTime: command.simTime.toCanonicalValue(),
        recordedAtReal: input.observedAtReal,
        correctsEventId: null,
        payload: draft.eventPayload,
      },
      sha,
    );
    const transition = createAuthoritativeTransition({
      command,
      worldVersionBefore: current.financial.worldVersion,
      worldVersionAfter: after,
      events: [event],
    });
    const state = synchronizeBeneficialHousingRentState(
      {
        receipt: original,
        state: current.states.get(original.countryId)!,
        financial: current.financial,
      },
      sha,
    );
    const applied = settleBeneficialHousingRent(
      {
        receipt: original,
        state,
        financialBefore: current.financial,
        command,
        transition,
        leaseId: body.leaseId,
        periodIndex: body.periodIndex,
      },
      sha,
    );
    if (!applied.posting) invalid('FRESH_COMMAND_DID_NOT_POST');
    const step: V08AuthoritativeLedgerTransition = freeze({
      command,
      transition,
      inventoryPostings: [],
      financialPostingBatches: [applied.posting],
    });
    // A successful result must already be consumable by the full financial
    // replay and narrow rights reducer; no projection/Ready flag substitutes.
    const independentlyReplayed = replay([...input.history, step]);
    same(
      applied.financial,
      independentlyReplayed.financial,
      'PAYMENT_REPLAY_DIFFERS',
    );
    return freeze({
      classification:
        'SOURCE_FAMILY_COMMAND_EVALUATION_NOT_COMMIT_AUTHORITY' as const,
      outcome: 'APPLIED' as const,
      step,
      financial: independentlyReplayed.financial,
      inventory: independentlyReplayed.inventory,
      receipt: createFinalCommandReceipt({
        command,
        outcome: 'COMMITTED',
        reasonCode: null,
        transition,
        simTime: command.simTime,
        recordedAtReal: input.observedAtReal,
      }),
    });
  }
  return Object.freeze({
    classification: 'SEPARATE_SOURCE_FAMILY_NOT_RUNTIME_ADMISSION' as const,
    worldId: seed.worldId,
    seedFingerprint: seed.fingerprint,
    parentSeedFingerprint: parentSeed.fingerprint,
    quote,
    consume,
  });
}
