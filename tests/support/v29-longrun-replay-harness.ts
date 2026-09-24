import { createHash } from 'node:crypto';

import {
  CURRENT_REPLAY_BINDING,
  bindAuthoritativeTransition,
  canonicalSerialize,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type CountryId,
  type FinancialLedgerState,
  type FinancialPostingBatch,
} from '../../packages/core/src/index.js';
import { applyFinancialPostingBatch } from '../../packages/core/src/finance/financial-ledger.js';

export const V29_LONGRUN_HARNESS_STATUS =
  'LOCAL_CORE_LEDGER_ONLY_NOT_V29_ACCEPTANCE' as const;

export interface V29FinancialAction {
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly posting: FinancialPostingBatch;
}

export interface V29DayDriver {
  readonly opening: FinancialLedgerState;
  nextDay(input: {
    readonly day: number;
    readonly seed: string;
    readonly financial: FinancialLedgerState;
  }): Promise<readonly V29FinancialAction[]>;
}

export interface V29LongRunPlan {
  readonly days: number;
  readonly seed: string;
  readonly countryIds: readonly CountryId[];
  readonly initialEventSequence?: string;
  createDriver(): V29DayDriver;
}

export interface V29DayTrace {
  readonly day: number;
  readonly actionCount: number;
  readonly eventCount: number;
  readonly postingCount: number;
  readonly worldVersion: string;
  readonly countryIds: readonly CountryId[];
  readonly numericPositions: readonly Readonly<{
    accountId: string;
    countryId: CountryId;
    amount: string;
    currency: string;
  }>[];
  readonly hash: string;
}

export interface V29LongRunEvidence {
  readonly status: typeof V29_LONGRUN_HARNESS_STATUS;
  readonly days: number;
  readonly countryCount: number;
  readonly actionCount: number;
  readonly eventCount: number;
  readonly postingCount: number;
  readonly seedHash: string;
  readonly traceHash: string;
  readonly daily: readonly V29DayTrace[];
}

function invalid(message: string): never {
  throw new Error(`V29_LONGRUN_EVIDENCE_INVALID: ${message}`);
}

function hash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalSerialize(value)).digest('hex')}`;
}

const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

function canonicalNonNegative(value: string, label: string): bigint {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
    invalid(`${label} must be a canonical non-negative integer`);
  }
  return BigInt(value);
}

function validatePlan(plan: V29LongRunPlan): readonly CountryId[] {
  if (!Number.isSafeInteger(plan.days) || plan.days < 1) {
    invalid('days must be a positive safe integer');
  }
  if (plan.seed.length === 0) invalid('fixed seed is required');
  if (
    plan.countryIds.length === 0 ||
    new Set(plan.countryIds).size !== plan.countryIds.length
  ) {
    invalid('countryIds must be a non-empty unique roster');
  }
  canonicalNonNegative(
    plan.initialEventSequence ?? '0',
    'initialEventSequence',
  );
  return Object.freeze([...plan.countryIds].sort());
}

function numericPositions(financial: FinancialLedgerState) {
  return Object.freeze(
    financial.positions.map((position) =>
      Object.freeze({
        accountId: position.account.accountId,
        countryId: position.account.countryId,
        amount: position.netDebitBalance.toCanonicalValue().amount,
        currency: position.netDebitBalance.currency,
      }),
    ),
  );
}

/**
 * Test-only runner. Each action is applied by Core's real ledger writer; this
 * does not stand in for World Worker, persistence, or formal V29 acceptance.
 */
export async function runV29LocalFinancialLongRun(
  plan: V29LongRunPlan,
): Promise<V29LongRunEvidence> {
  const roster = validatePlan(plan);
  const rosterSet = new Set(roster);
  const driver = plan.createDriver();
  let financial = driver.opening;
  let nextSequence =
    canonicalNonNegative(
      plan.initialEventSequence ?? '0',
      'initialEventSequence',
    ) + 1n;
  const seenCommands = new Set<string>();
  const seenEvents = new Set<string>();
  const seenPostings = new Set<string>();
  const daily: V29DayTrace[] = [];
  let actionCount = 0;
  let eventCount = 0;
  const seedHash = hash({ seed: plan.seed });

  for (let day = 1; day <= plan.days; day += 1) {
    const actions = await driver.nextDay({ day, seed: plan.seed, financial });
    if (actions.length === 0) invalid(`day ${day} is idle`);
    const touched = new Set<CountryId>();
    const commands: string[] = [];
    const events: string[] = [];
    const postings: string[] = [];

    for (const { command, transition, posting } of actions) {
      const binding = bindAuthoritativeTransition(
        { command, transition },
        sha256Hex,
      );
      if (
        transition.worldVersionBefore !== financial.worldVersion ||
        posting.worldVersionBefore !== financial.worldVersion ||
        posting.worldVersionAfter !== transition.worldVersionAfter ||
        posting.worldId !== financial.worldId ||
        posting.causationCommandId !== command.commandId ||
        canonicalSerialize(posting.transitionBinding) !==
          canonicalSerialize(binding)
      ) {
        invalid(`day ${day} has a broken command/event/posting/version link`);
      }
      if (
        seenCommands.has(command.commandId) ||
        seenPostings.has(posting.batchId)
      ) {
        invalid(`day ${day} reused a command or posting identity`);
      }
      seenCommands.add(command.commandId);
      seenPostings.add(posting.batchId);
      for (const event of transition.events) {
        if (
          BigInt(event.sequence) !== nextSequence ||
          seenEvents.has(event.eventId)
        ) {
          invalid(`day ${day} has an Event sequence gap or duplicate`);
        }
        nextSequence += 1n;
        seenEvents.add(event.eventId);
        events.push(event.fingerprint);
      }
      for (const leg of posting.legs) {
        if (!rosterSet.has(leg.account.countryId)) {
          invalid(`day ${day} posted to a country outside the roster`);
        }
        touched.add(leg.account.countryId);
      }
      const before = canonicalSerialize(numericPositions(financial));
      const applied = applyFinancialPostingBatch(financial, posting);
      if (
        applied.receipt.outcome !== 'APPLIED' ||
        canonicalSerialize(numericPositions(applied.state)) === before
      ) {
        invalid(`day ${day} action did not change exact ledger positions`);
      }
      financial = applied.state;
      commands.push(command.fingerprint);
      postings.push(posting.fingerprint);
      actionCount += 1;
      eventCount += transition.events.length;
    }

    if (roster.some((country) => !touched.has(country))) {
      invalid(`day ${day} did not post an economic action for every country`);
    }
    const positions = numericPositions(financial);
    const trace = Object.freeze({
      day,
      actionCount: actions.length,
      eventCount: events.length,
      postingCount: postings.length,
      worldVersion: financial.worldVersion,
      countryIds: roster,
      numericPositions: positions,
      hash: hash({
        binding: CURRENT_REPLAY_BINDING,
        commands,
        countryIds: roster,
        day: String(day),
        events,
        numericPositions: positions,
        postings,
        seedHash,
        worldVersion: financial.worldVersion,
      }),
    });
    daily.push(trace);
  }

  return Object.freeze({
    status: V29_LONGRUN_HARNESS_STATUS,
    days: plan.days,
    countryCount: roster.length,
    actionCount,
    eventCount,
    postingCount: seenPostings.size,
    seedHash,
    traceHash: hash({ dailyHashes: daily.map((day) => day.hash), seedHash }),
    daily: Object.freeze(daily),
  });
}

/** Fresh second execution, never a hash of a copied first-run result. */
export async function assertV29FixedSeedReplay(
  plan: V29LongRunPlan,
): Promise<V29LongRunEvidence> {
  const first = await runV29LocalFinancialLongRun(plan);
  const second = await runV29LocalFinancialLongRun(plan);
  if (
    first.traceHash !== second.traceHash ||
    first.daily.some((day, index) => day.hash !== second.daily[index]?.hash)
  ) {
    invalid('same fixed seed produced a different daily replay hash');
  }
  return first;
}
