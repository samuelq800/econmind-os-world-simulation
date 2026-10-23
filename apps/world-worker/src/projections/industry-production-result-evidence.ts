/** ISOLATED TEST_ONLY mechanism. No durable reader, admission or runtime export. */
import { createHash } from 'node:crypto';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  PRODUCTION_SETTLED_EVENT_TYPE,
  canonicalSerialize,
  createProductionConsumptionPosting,
  rebuildV08LedgersFromLineage,
  validateAuthoritativeEvent,
  validateCanonicalCommand,
  type DecisionResultCause,
  type DecisionResultHead,
  type FinalCommandReceipt,
  type InventoryAccount,
  type OpeningSeed,
  type V08AuthoritativeLedgerTransition,
} from '@econmind/core';
import { validateCommittedDecisionLineage } from './office-decision-result-projector.js';

export const INDUSTRY_TEST_ONLY_ADMISSION =
  'ISOLATED_TEST_ONLY_NOT_ADMITTED' as const;
export type IndustryTestOnlyTransition = V08AuthoritativeLedgerTransition & {
  readonly receipt: FinalCommandReceipt;
};
export interface IsolatedIndustryResultHandle {
  readonly schemaVersion: 'unit-test-only-industry-source-v1';
  readonly admission: typeof INDUSTRY_TEST_ONLY_ADMISSION;
}
interface ProductionRow {
  readonly countryId: string;
  readonly cause: DecisionResultCause;
  readonly output: Readonly<{ amount: string; unit: string }>;
  readonly accounts: readonly InventoryAccount[];
}
interface PrivateSource {
  readonly sourceHead: DecisionResultHead;
  readonly rows: readonly ProductionRow[];
  readonly correctedEventIds: readonly string[];
}
const handles = new WeakMap<object, PrivateSource>();
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Industry TEST_ONLY: ${message}`,
  );
}
export function requireIndustryIsolatedTestRuntime(): void {
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.VITEST !== 'true' ||
    !['local', 'ci'].includes(process.env.ECONMIND_ENV ?? '')
  ) {
    throw new Error('INDUSTRY_ISOLATED_TEST_RUNTIME_REQUIRED');
  }
}

/** Accept only constructor-produced fixture objects. The existing in-memory
 * ledger replay validates every posting and genuine same-ledger funding; no
 * supplied actualOutput, funding boolean or source-admitted flag is accepted.
 */
export function createIsolatedIndustryResultSourceForTestOnly(input: {
  readonly seed: OpeningSeed;
  readonly sourceHead: DecisionResultHead;
  readonly transitions: readonly IndustryTestOnlyTransition[];
}): IsolatedIndustryResultHandle {
  requireIndustryIsolatedTestRuntime();
  if (Object.keys(input).sort().join('|') !== 'seed|sourceHead|transitions')
    invalid('Closed fixture source input required');
  if (
    input.seed.sources.length === 0 ||
    input.seed.sources.some((source) => source.sourceKind !== 'TEST_FIXTURE')
  )
    invalid('Explicit TEST_FIXTURE opening sources required');
  if (input.transitions.length > 128)
    invalid('Bounded isolated prefix required');
  const sourceHead = Object.freeze({
    worldId: input.sourceHead.worldId,
    worldVersion: input.sourceHead.worldVersion,
    eventSequence: input.sourceHead.eventSequence,
  });
  const transitions = input.transitions.map((row) =>
    Object.freeze({
      ...row,
      inventoryPostings: Object.freeze([...row.inventoryPostings]),
      financialPostingBatches: Object.freeze([...row.financialPostingBatches]),
    }),
  );
  validateCommittedDecisionLineage({ sourceHead, transitions, sha256Hex: sha });
  const rebuilt = rebuildV08LedgersFromLineage({
    seed: input.seed,
    transitions,
    sha256Hex: sha,
  });
  if (
    input.seed.worldId !== sourceHead.worldId ||
    rebuilt.worldVersion !== sourceHead.worldVersion
  )
    invalid('Fixture ledger and exact held head differ');
  const rows: ProductionRow[] = [];
  const correctedEventIds = new Set<string>();
  for (const row of transitions) {
    for (const event of row.transition.events)
      if (event.correctsEventId !== null)
        correctedEventIds.add(event.correctsEventId);
    const events = row.transition.events.filter(
      (event) => event.eventType === PRODUCTION_SETTLED_EVENT_TYPE,
    );
    const postings = row.inventoryPostings.filter(
      (posting) => posting.operation === 'PRODUCE_AND_CONSUME',
    );
    if (events.length === 0 && postings.length === 0) continue;
    const event = events[0],
      posting = postings[0];
    if (
      events.length !== 1 ||
      postings.length !== 1 ||
      !event ||
      !posting ||
      event.correctsEventId !== null
    )
      invalid('One non-correction production event and posting required');
    const verified = createProductionConsumptionPosting(
      {
        postingId: posting.postingId,
        command: row.command,
        transition: row.transition,
        evidence: posting.evidence,
      },
      sha,
    );
    if (canonicalSerialize(verified) !== canonicalSerialize(posting))
      invalid('Production posting differs from its existing Core constructor');
    const command = validateCanonicalCommand(row.command, sha);
    const canonicalEvent = validateAuthoritativeEvent(event, sha);
    // Full replay above also resolves actual applied cost batches and enforces
    // the source inventory snapshot/availability; rehydration alone cannot.
    rows.push(
      Object.freeze({
        countryId: verified.evidence.output.countryId,
        // Own scalar cause values, not caller command/transition/event objects.
        // Validation may accept mutable canonical copies and return new objects.
        cause: Object.freeze({
          commandId: command.commandId,
          commandFingerprint: command.fingerprint,
          eventId: canonicalEvent.eventId,
          eventFingerprint: canonicalEvent.fingerprint,
          eventType: canonicalEvent.eventType,
          eventSequence: canonicalEvent.sequence,
          worldVersionBefore: verified.worldVersionBefore,
          worldVersionAfter: verified.worldVersionAfter,
          simTime: canonicalEvent.simTime.toCanonicalValue(),
          planCommandId: null,
        }),
        output: Object.freeze({ ...verified.result.actualOutput }),
        accounts: Object.freeze([
          verified.evidence.output,
          ...verified.evidence.materials.map((material) => material.account),
        ]),
      }),
    );
  }
  const handle = Object.freeze({
    schemaVersion: 'unit-test-only-industry-source-v1' as const,
    admission: INDUSTRY_TEST_ONLY_ADMISSION,
  });
  handles.set(
    handle,
    Object.freeze({
      sourceHead,
      rows: Object.freeze(rows),
      correctedEventIds: Object.freeze([...correctedEventIds]),
    }),
  );
  return handle;
}

/** Internal direct-import bridge for the isolated projector only, never a token
 * accepted by the official publisher, decoder, writer or authorization path.
 */
export function readIsolatedIndustryResultSourceForTestOnly(
  handle: IsolatedIndustryResultHandle,
): PrivateSource {
  requireIndustryIsolatedTestRuntime();
  const source = handles.get(handle);
  if (!source) invalid('Untrusted isolated source handle');
  return source;
}
