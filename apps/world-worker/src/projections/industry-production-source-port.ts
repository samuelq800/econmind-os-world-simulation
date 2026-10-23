/** No-IO source adaptor. This module issues no view, admission or capability. */
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  Money,
  PRODUCTION_SETTLED_EVENT_TYPE,
  SimTime,
  assertProductionFunding,
  canonicalSerialize,
  commandId,
  countryId,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createFinancialPostingBatch,
  createProductionConsumptionPosting,
  eventId,
  inventoryPostingId,
  rebuildV08LedgersFromLineage,
  validateAuthoritativeEvent,
  validateCanonicalCommand,
  worldId,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type CommandId,
  type CountryId,
  type DecisionResultHead,
  type EventId,
  type FinalCommandReceipt,
  type FinancialPostingBatch,
  type InventoryAccount,
  type InventoryPostingId,
  type InventoryProductionPosting,
  type OpeningSeed,
  type RebuiltV08Ledgers,
  type Sha256Hex,
  type V08AuthoritativeLedgerTransition,
  type WorldId,
} from '@econmind/core';
import type { SqlExecutor } from '../persistence/sql-database.js';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../persistence/validated-canonical-lineage.js';
import { validateCommittedDecisionLineage } from './office-decision-result-projector.js';

export interface IndustryProductionSelectors {
  readonly worldId: WorldId;
  readonly countryId: CountryId;
  readonly commandId: CommandId;
  readonly eventId: EventId;
  readonly postingId: InventoryPostingId;
  readonly expectedPublicationHead: DecisionResultHead;
}
type PrefixTransition = Readonly<
  V08AuthoritativeLedgerTransition & { readonly receipt: FinalCommandReceipt }
>;
export interface IndustryPrefixTestInput {
  readonly seed: OpeningSeed;
  readonly sourceHead: DecisionResultHead;
  readonly transitions: readonly PrefixTransition[];
  readonly selectors: IndustryProductionSelectors;
  readonly sha256Hex: Sha256Hex;
}
interface OwnedHead {
  readonly worldId: string;
  readonly worldVersion: string;
  readonly eventSequence: string;
}
interface OwnedCause {
  readonly commandId: string;
  readonly commandFingerprint: string;
  readonly eventId: string;
  readonly eventFingerprint: string;
  readonly eventType: string;
  readonly eventSequence: string;
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly simTime: string;
  readonly planCommandId: null;
}
interface OwnedInventoryAccountWitness {
  readonly worldId: string;
  readonly countryId: string;
  readonly commodityId: string;
  readonly batchId: string;
  readonly physicalLocationId: string;
  readonly titleHolderId: string;
  readonly riskBearerId: string;
  readonly bucket: string;
  readonly unit: string;
  readonly economicRecognitionId: string | null;
  readonly reservationId: string | null;
  readonly shipmentId: string | null;
}
type PrefixSummary =
  | Readonly<{
      status: 'SOURCE_UNAVAILABLE';
      reason: 'PRODUCTION_TARGET_NOT_FOUND';
      publicationHead: OwnedHead;
    }>
  | Readonly<{
      status: 'VALIDATED_PREFIX';
      publicationHead: OwnedHead;
      targetCutoff: OwnedHead;
      cause: OwnedCause;
      actualOutput: Readonly<{ amount: string; unit: string }>;
      inventoryAccountWitnesses: readonly OwnedInventoryAccountWitness[];
    }>;
export interface IndustryPrefixTestCandidate {
  readonly schemaVersion: 'industry-production-prefix-test-candidate-v1';
  readonly kind: 'INDUSTRY_PREFIX_TEST_CANDIDATE';
  readonly admission: 'ISOLATED_TEST_ONLY_NOT_ADMITTED';
  readonly productionAuthority: false;
  readonly sourceAdmitted: false;
  readonly runtimeConnected: false;
  readonly result:
    | Extract<PrefixSummary, { status: 'SOURCE_UNAVAILABLE' }>
    | Readonly<
        Omit<
          Extract<PrefixSummary, { status: 'VALIDATED_PREFIX' }>,
          'status'
        > & {
          status: 'EVALUATED_TEST_ONLY';
        }
      >;
}
interface TargetEvidence {
  readonly targetCommand: CanonicalCommand;
  readonly targetTransition: AuthoritativeTransition;
  readonly targetReceipt: FinalCommandReceipt;
  readonly targetEvent: ReturnType<typeof validateAuthoritativeEvent>;
  readonly constructorValidatedProductionPosting: InventoryProductionPosting;
  readonly completeTargetPrefixSettledFinancialBatches: readonly FinancialPostingBatch[];
  readonly targetPrefixRebuiltLedgers: RebuiltV08Ledgers;
}
export type IndustryProductionSourceResult =
  | Readonly<{
      kind: 'SOURCE_UNAVAILABLE';
      reason: 'PRODUCTION_TARGET_NOT_FOUND';
      publicationHead: OwnedHead;
    }>
  | Readonly<
      TargetEvidence & {
        kind: 'AVAILABLE_FOR_PROJECTION';
        publicationHead: OwnedHead;
        immutableSourceWitnesses: Extract<
          PrefixSummary,
          { status: 'VALIDATED_PREFIX' }
        >;
      }
    >;
interface Evaluation {
  readonly summary: PrefixSummary;
  readonly target: TargetEvidence | null;
}
const LIMIT = 10_000;

function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Industry source port: ${message}`,
  );
}
function closed(value: unknown, keys: readonly string[]): void {
  if (
    value === null ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid('Plain closed data record required');
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== keys.length ||
    actual.some(
      (key) =>
        typeof key !== 'string' ||
        !keys.includes(key) ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'),
    )
  )
    invalid('Missing, unknown or accessor field');
}
function frozen<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
/** Copies plain canonical data only, never a branded state/view or proof. */
function owned<T>(value: T): Readonly<T> {
  return frozen(JSON.parse(canonicalSerialize(value)) as T);
}
function head(value: DecisionResultHead): OwnedHead {
  closed(value, ['worldId', 'worldVersion', 'eventSequence']);
  for (const number of [value.worldVersion, value.eventSequence])
    if (typeof number !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(number))
      invalid('Canonical head integers required');
  return owned({
    worldId: worldId(value.worldId),
    worldVersion: value.worldVersion,
    eventSequence: value.eventSequence,
  });
}
function select(
  value: IndustryProductionSelectors,
): IndustryProductionSelectors {
  closed(value, [
    'worldId',
    'countryId',
    'commandId',
    'eventId',
    'postingId',
    'expectedPublicationHead',
  ]);
  return owned({
    worldId: worldId(value.worldId),
    countryId: countryId(value.countryId),
    commandId: commandId(value.commandId),
    eventId: eventId(value.eventId),
    postingId: inventoryPostingId(value.postingId),
    expectedPublicationHead: head(value.expectedPublicationHead),
  });
}
function equal(left: unknown, right: unknown, label: string): void {
  if (canonicalSerialize(left) !== canonicalSerialize(right)) invalid(label);
}
function ownBatch(
  row: PrefixTransition,
  batch: FinancialPostingBatch,
  digest: Sha256Hex,
): FinancialPostingBatch {
  const command = validateCanonicalCommand(row.command, digest);
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: row.transition.worldVersionBefore,
    worldVersionAfter: row.transition.worldVersionAfter,
    events: row.transition.events.map((e) =>
      validateAuthoritativeEvent(e, digest),
    ),
  });
  const copy = createFinancialPostingBatch(
    {
      ...batch,
      command,
      transition,
      simTime: SimTime.fromTicks(batch.simTime.toCanonicalValue()),
      legs: batch.legs.map((leg) => ({
        ...leg,
        amount: Money.from(
          leg.amount.toCanonicalValue().amount,
          leg.amount.currency,
        ),
      })),
    },
    digest,
  );
  equal(copy, batch, 'Financial canonical identity differs');
  return copy;
}

/** Shared pure algorithm. Never issues a view, source admission or capability. */
function evaluateCanonicalIndustryPrefix(
  input: IndustryPrefixTestInput,
): Evaluation {
  const publicationHead = head(input.sourceHead);
  const selectors = select(input.selectors);
  const digest = input.sha256Hex;
  if (typeof digest !== 'function') invalid('Hash dependency required');
  canonicalSerialize(input.seed);
  canonicalSerialize(input.transitions);
  if (!Array.isArray(input.transitions))
    invalid('Complete transition array required');
  const transitions: readonly PrefixTransition[] = input.transitions;
  for (const row of transitions)
    closed(row, [
      'command',
      'transition',
      'receipt',
      'inventoryPostings',
      'financialPostingBatches',
    ]);
  equal(
    publicationHead,
    selectors.expectedPublicationHead,
    'Held head differs',
  );
  if (
    publicationHead.worldId !== selectors.worldId ||
    input.seed.worldId !== selectors.worldId
  )
    invalid('Source World differs');
  if (
    transitions.length > LIMIT ||
    BigInt(publicationHead.eventSequence) > BigInt(LIMIT) ||
    transitions.reduce((n, t) => n + t.transition.events.length, 0) > LIMIT ||
    transitions.reduce((n, t) => n + t.inventoryPostings.length, 0) > LIMIT ||
    transitions.reduce((n, t) => n + t.financialPostingBatches.length, 0) >
      LIMIT
  )
    invalid('Complete lineage exceeds preparation capacity; never truncate');
  validateCommittedDecisionLineage({
    sourceHead: publicationHead,
    transitions,
    sha256Hex: digest,
  });
  // This also enforces genuine seed/posting constructor identities, global
  // Inventory/Financial replay, applied funding and duplicate-recognition rules.
  const full = rebuildV08LedgersFromLineage({
    seed: input.seed,
    transitions,
    sha256Hex: digest,
  });
  if (full.worldVersion !== publicationHead.worldVersion)
    invalid('Complete ledger does not reach held head');
  const index = transitions.findIndex(
    (row) => row.command.commandId === selectors.commandId,
  );
  const row = transitions[index];
  const absent = (): Evaluation => ({
    summary: owned({
      status: 'SOURCE_UNAVAILABLE',
      reason: 'PRODUCTION_TARGET_NOT_FOUND',
      publicationHead,
    } as const),
    target: null,
  });
  if (!row) return absent();
  const events = row.transition.events.filter(
    (e) => e.eventType === PRODUCTION_SETTLED_EVENT_TYPE,
  );
  const postings = row.inventoryPostings.filter(
    (p): p is InventoryProductionPosting =>
      p.operation === 'PRODUCE_AND_CONSUME',
  );
  if (events.length === 0 && postings.length === 0) return absent();
  if (events.length !== 1 || postings.length !== 1)
    invalid('One exact production Event and posting required');
  const event = events[0]!;
  const posting = postings[0]!;
  if (
    event.eventId !== selectors.eventId ||
    posting.postingId !== selectors.postingId
  )
    return absent();
  if (
    row.command.countryId !== selectors.countryId ||
    posting.evidence.output.countryId !== selectors.countryId ||
    event.correctsEventId !== null ||
    transitions.some((t) =>
      t.transition.events.some((e) => e.correctsEventId === event.eventId),
    )
  )
    invalid('Target country or correction contract differs');
  const command = validateCanonicalCommand(row.command, digest);
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: row.transition.worldVersionBefore,
    worldVersionAfter: row.transition.worldVersionAfter,
    events: row.transition.events.map((e) =>
      validateAuthoritativeEvent(e, digest),
    ),
  });
  const canonicalEvent = validateAuthoritativeEvent(event, digest);
  const verified = createProductionConsumptionPosting(
    {
      postingId: posting.postingId,
      command,
      transition,
      evidence: posting.evidence,
    },
    digest,
  );
  equal(verified, posting, 'Production canonical identity differs');
  const receipt = createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: SimTime.fromTicks(row.receipt.simTime.toCanonicalValue()),
    recordedAtReal: row.receipt.recordedAtReal,
  });
  equal(receipt, row.receipt, 'Receipt canonical identity differs');
  const prefix = transitions.slice(0, index + 1);
  const ledgers = rebuildV08LedgersFromLineage({
    seed: input.seed,
    transitions: prefix,
    sha256Hex: digest,
  });
  const batches = Object.freeze(
    prefix.flatMap((t) =>
      t.financialPostingBatches.map((b) => ownBatch(t, b, digest)),
    ),
  );
  // Use the TARGET historical state, never the later full-head cash position.
  assertProductionFunding(verified, batches, ledgers.financial);
  const summary = owned({
    status: 'VALIDATED_PREFIX' as const,
    publicationHead,
    targetCutoff: {
      worldId: selectors.worldId,
      worldVersion: transition.worldVersionAfter,
      eventSequence: transition.events.at(-1)!.sequence,
    },
    cause: {
      commandId: command.commandId,
      commandFingerprint: command.fingerprint,
      eventId: canonicalEvent.eventId,
      eventFingerprint: canonicalEvent.fingerprint,
      eventType: canonicalEvent.eventType,
      eventSequence: canonicalEvent.sequence,
      worldVersionBefore: transition.worldVersionBefore,
      worldVersionAfter: transition.worldVersionAfter,
      simTime: canonicalEvent.simTime.toCanonicalValue(),
      planCommandId: null,
    },
    actualOutput: verified.result.actualOutput,
    inventoryAccountWitnesses: [
      verified.evidence.output,
      ...verified.evidence.materials.map((m) => m.account),
    ] as readonly InventoryAccount[],
  });
  return {
    summary,
    target: Object.freeze({
      targetCommand: command,
      targetTransition: transition,
      targetReceipt: receipt,
      targetEvent: canonicalEvent,
      constructorValidatedProductionPosting: verified,
      completeTargetPrefixSettledFinancialBatches: batches,
      targetPrefixRebuiltLedgers: ledgers,
    }),
  };
}

/** Existing genuine-view input only. Returned data is not an escaped authority. */
export function readIndustryProductionSourceFrom(
  executor: SqlExecutor,
  view: ValidatedCanonicalLineageView,
  selectors: IndustryProductionSelectors,
  sha256Hex: Sha256Hex,
): IndustryProductionSourceResult {
  const data = readValidatedCanonicalLineageFrom(executor, view);
  const result = evaluateCanonicalIndustryPrefix({
    seed: data.seed,
    sourceHead: {
      worldId: data.worldId,
      worldVersion: data.headWorldVersion,
      eventSequence: data.headEventSequence,
    },
    transitions: data.transitions,
    selectors,
    sha256Hex,
  });
  // Point-of-use recheck; no await, alternate reader or locally issued token.
  readValidatedCanonicalLineageFrom(executor, view);
  if (!result.target || result.summary.status === 'SOURCE_UNAVAILABLE')
    return owned({
      kind: 'SOURCE_UNAVAILABLE',
      reason: 'PRODUCTION_TARGET_NOT_FOUND',
      publicationHead: result.summary.publicationHead,
    } as const);
  return Object.freeze({
    kind: 'AVAILABLE_FOR_PROJECTION',
    publicationHead: result.summary.publicationHead,
    ...result.target,
    immutableSourceWitnesses: result.summary,
  });
}

/** Inert pure mechanism control, never accepted by the genuine-view entry. */
export function evaluateIndustryProductionPrefixForTestOnly(
  input: IndustryPrefixTestInput,
): IndustryPrefixTestCandidate {
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.VITEST !== 'true' ||
    !['local', 'ci'].includes(process.env.ECONMIND_ENV ?? '')
  )
    throw new Error('INDUSTRY_PREFIX_TEST_RUNTIME_REQUIRED');
  closed(input, [
    'seed',
    'sourceHead',
    'transitions',
    'selectors',
    'sha256Hex',
  ]);
  canonicalSerialize(input.seed);
  if (
    !Array.isArray(input.seed.sources) ||
    input.seed.sources.length === 0 ||
    input.seed.sources.some((source) => source.sourceKind !== 'TEST_FIXTURE')
  )
    invalid('Explicit TEST_FIXTURE opening source required');
  const evaluated = evaluateCanonicalIndustryPrefix(input);
  // Deliberately omit evaluator target, seed, states, postings and all brands.
  return owned({
    schemaVersion: 'industry-production-prefix-test-candidate-v1',
    kind: 'INDUSTRY_PREFIX_TEST_CANDIDATE',
    admission: 'ISOLATED_TEST_ONLY_NOT_ADMITTED',
    productionAuthority: false,
    sourceAdmitted: false,
    runtimeConnected: false,
    result:
      evaluated.summary.status === 'SOURCE_UNAVAILABLE'
        ? evaluated.summary
        : { ...evaluated.summary, status: 'EVALUATED_TEST_ONLY' },
  } as const);
}
