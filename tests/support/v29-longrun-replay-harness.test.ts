import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  Money,
  createAuthoritativeTransition,
  createFinancialAccount,
  createFinancialPostingBatch,
  countryId,
  financialAccountId,
  financialPostingBatchId,
  financialPostingLegId,
  legalEntityId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  worldId,
  type FinancialPostingBatch,
} from '../../packages/core/src/index.js';
import { openingLedgers } from '../helpers/v08-ledgers.js';
import {
  assertV29FixedSeedReplay,
  runV29LocalFinancialLongRun,
  type V29LongRunPlan,
} from './v29-longrun-replay-harness.js';

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const WORLD = worldId('WORLD_V29_LOCAL_TEST');
const A = countryId('COUNTRY_V29_A');
const B = countryId('COUNTRY_V29_B');
const accountA = createFinancialAccount({
  worldId: WORLD,
  accountId: financialAccountId('ACCOUNT_V29_A_CASH'),
  ownerId: legalEntityId('ENTITY_V29_A'),
  countryId: A,
  accountClass: 'CASH',
  currency: 'GCU',
  claimId: null,
  counterpartyEntityId: null,
});
const accountB = createFinancialAccount({
  ...accountA,
  accountId: financialAccountId('ACCOUNT_V29_B_CASH'),
  ownerId: legalEntityId('ENTITY_V29_B'),
  countryId: B,
});

function plan(
  days: number,
  seed: string,
  options: {
    readonly idleOnDay?: number;
    readonly forgedPosting?: boolean;
    readonly sequenceOffset?: number;
    readonly replaySalt?: () => string;
  } = {},
): V29LongRunPlan {
  return {
    days,
    seed,
    countryIds: [A, B],
    createDriver() {
      return {
        opening: openingLedgers({ worldId: WORLD, sha256Hex: sha256 })
          .financial,
        async nextDay({ day, financial, seed: fixedSeed }) {
          if (day === options.idleOnDay) return [];
          const before = financial.worldVersion;
          const after = (BigInt(before) + 1n).toString();
          const draw = sha256(
            `${fixedSeed}:${day}:${options.replaySalt?.() ?? ''}`,
          );
          const amount = (
            (BigInt(`0x${draw.slice(0, 8)}`) % 7n) +
            1n
          ).toString();
          const fromA = BigInt(`0x${draw.slice(8, 10)}`) % 2n === 0n;
          const source = fromA ? accountA : accountB;
          const destination = fromA ? accountB : accountA;
          const simTime = String(day * 86_400);
          const command = parseCanonicalCommand(
            {
              schemaVersion: COMMAND_SCHEMA_VERSION,
              commandType: 'TEST_LOCAL_GCU_TRANSFER',
              commandId: `COMMAND_V29_DAY_${day}`,
              idempotencyKey: `IDEMPOTENCY_V29_DAY_${day}`,
              worldId: WORLD,
              actorId: 'ACTOR_V29_LOCAL_TEST',
              authSubject: '00000000-0000-4000-8000-000000000001',
              countryId: source.countryId,
              officeId: null,
              expectedWorldVersion: before,
              simTime,
              submittedAtReal: '2026-09-24T00:00:00.000Z',
              correlationId: `CORRELATION_V29_DAY_${day}`,
              payload: {
                amount,
                currency: 'GCU',
                destinationCountryId: destination.countryId,
                sourceCountryId: source.countryId,
              },
            },
            sha256,
          );
          const event = parseAuthoritativeEvent(
            {
              schemaVersion: EVENT_SCHEMA_VERSION,
              eventId: `EVENT_V29_DAY_${day}`,
              eventType: 'TEST_LOCAL_GCU_TRANSFER_POSTED',
              worldId: WORLD,
              worldVersion: after,
              sequence: (
                BigInt(after) + BigInt(options.sequenceOffset ?? 0)
              ).toString(),
              causationCommandId: command.commandId,
              correlationId: command.correlationId,
              simTime,
              recordedAtReal: '2026-09-24T00:00:00.000Z',
              payload: {
                amount,
                currency: 'GCU',
                destinationCountryId: destination.countryId,
                sourceCountryId: source.countryId,
              },
              correctsEventId: null,
            },
            sha256,
          );
          const transition = createAuthoritativeTransition({
            command,
            worldVersionBefore: before,
            worldVersionAfter: after,
            events: [event],
          });
          const posting = createFinancialPostingBatch(
            {
              schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
              batchId: financialPostingBatchId(`BATCH_V29_DAY_${day}`),
              worldId: WORLD,
              causationCommandId: command.commandId,
              causationEventIds: [event.eventId],
              worldVersionBefore: before,
              worldVersionAfter: after,
              simTime: command.simTime,
              command,
              transition,
              settlementCurrency: 'GCU',
              legs: [
                {
                  legId: financialPostingLegId(`LEG_V29_DAY_${day}_SOURCE`),
                  account: source,
                  direction: 'CREDIT',
                  amount: Money.from(amount, 'GCU'),
                  counterpartyAccountId: destination.accountId,
                },
                {
                  legId: financialPostingLegId(
                    `LEG_V29_DAY_${day}_DESTINATION`,
                  ),
                  account: destination,
                  direction: 'DEBIT',
                  amount: Money.from(amount, 'GCU'),
                  counterpartyAccountId: source.accountId,
                },
              ],
            },
            sha256,
          );
          return [
            {
              command,
              transition,
              posting: options.forgedPosting
                ? ({ ...posting } as FinancialPostingBatch)
                : posting,
            },
          ];
        },
      };
    },
  };
}

describe('V29 preparation-only non-idle fixed-seed local ledger runner', () => {
  it('executes 600 days of real two-country Core commands, Events, postings and exact numeric positions', async () => {
    const evidence = await assertV29FixedSeedReplay(plan(600, 'v29-seed-600'));
    expect(evidence).toMatchObject({
      status: 'LOCAL_CORE_LEDGER_ONLY_NOT_V29_ACCEPTANCE',
      days: 600,
      countryCount: 2,
      actionCount: 600,
      eventCount: 600,
      postingCount: 600,
    });
    expect(evidence.daily).toHaveLength(600);
    expect(
      evidence.daily.some((day) => day.numericPositions.length === 2),
    ).toBe(true);
    expect(
      evidence.daily.every((day) =>
        day.numericPositions.every((position) => position.currency === 'GCU'),
      ),
    ).toBe(true);
  }, 60_000);

  it('executes 1000 days with the same per-day proof requirements', async () => {
    const evidence = await assertV29FixedSeedReplay(
      plan(1000, 'v29-seed-1000'),
    );
    expect(evidence).toMatchObject({
      days: 1000,
      actionCount: 1000,
      eventCount: 1000,
      postingCount: 1000,
    });
    expect(new Set(evidence.daily.map((day) => day.hash)).size).toBe(1000);
  }, 90_000);

  it('changes the trace hash when the fixed seed changes', async () => {
    const first = await runV29LocalFinancialLongRun(plan(8, 'seed-a'));
    const second = await runV29LocalFinancialLongRun(plan(8, 'seed-b'));
    expect(first.traceHash).not.toBe(second.traceHash);
  });

  it('rejects an idle day and a forged non-authoritative ledger batch', async () => {
    await expect(
      runV29LocalFinancialLongRun(plan(3, 'seed', { idleOnDay: 2 })),
    ).rejects.toThrow('day 2 is idle');
    await expect(
      runV29LocalFinancialLongRun(plan(1, 'seed', { forgedPosting: true })),
    ).rejects.toThrow(
      'Financial writer accepts validated canonical batches only',
    );
  });

  it('rejects a declared third country with no economic posting', async () => {
    await expect(
      runV29LocalFinancialLongRun({
        ...plan(1, 'seed'),
        countryIds: [A, B, countryId('COUNTRY_V29_C')],
      }),
    ).rejects.toThrow('did not post an economic action for every country');
  });

  it('rejects an Event sequence gap and a same-seed replay drift', async () => {
    await expect(
      runV29LocalFinancialLongRun(plan(1, 'seed', { sequenceOffset: 1 })),
    ).rejects.toThrow('Event sequence gap or duplicate');
    let freshRun = 0;
    await expect(
      assertV29FixedSeedReplay(
        plan(3, 'seed', { replaySalt: () => String(freshRun++) }),
      ),
    ).rejects.toThrow('same fixed seed produced a different daily replay hash');
  });
});
