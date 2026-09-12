import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  FINANCIAL_AUTHORITATIVE_WRITER,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  Money,
  SimTime,
  commandId,
  countryId,
  createClaimAccountPair,
  createFinancialAccount,
  createFinancialPostingBatch,
  eventId,
  financialAccountId,
  financialClaimId,
  financialPostingBatchId,
  financialPostingLegId,
  legalEntityId,
  worldId,
  type FinancialAccount,
  type FinancialPostingLeg,
} from '../../packages/core/src/index.js';
import { applyFinancialPostingBatch } from '../../packages/core/src/finance/financial-ledger.js';
import {
  openingLedgers,
  testAuthoritativeTransition,
} from '../helpers/v08-ledgers.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const WORLD = worldId('WORLD_1');
const ENTITY_A = legalEntityId('ENTITY_A');
const ENTITY_B = legalEntityId('ENTITY_B');

function account(
  id: string,
  accountClass: FinancialAccount['accountClass'],
  overrides: Partial<FinancialAccount> = {},
) {
  return createFinancialAccount({
    worldId: WORLD,
    accountId: financialAccountId(id),
    ownerId: ENTITY_A,
    countryId: countryId('COUNTRY_A'),
    accountClass,
    currency: 'GCU',
    claimId: null,
    counterpartyEntityId: null,
    ...overrides,
  });
}

const cash = account('ACCOUNT_CASH', 'CASH');
const revenue = account('ACCOUNT_REVENUE', 'REVENUE');
const expense = account('ACCOUNT_EXPENSE', 'EXPENSE');

function leg(
  id: string,
  target: FinancialAccount,
  direction: FinancialPostingLeg['direction'],
  amount: string,
  counterpartyAccountId: FinancialPostingLeg['counterpartyAccountId'] = null,
): FinancialPostingLeg {
  return {
    legId: financialPostingLegId(id),
    account: target,
    direction,
    amount: Money.from(amount, target.currency),
    counterpartyAccountId,
  };
}

function batch(
  id: string,
  versionBefore: number,
  legs: readonly FinancialPostingLeg[],
  commandPayloadVariant = 'a',
) {
  const causationCommandId = commandId(`COMMAND_${id}`);
  const causationEventIds = [eventId(`EVENT_${id}`)];
  const simTime = SimTime.fromTicks(String((versionBefore + 1) * 10_000));
  const evidence = testAuthoritativeTransition({
    worldId: WORLD,
    commandId: causationCommandId,
    eventIds: causationEventIds,
    worldVersionBefore: String(versionBefore),
    worldVersionAfter: String(versionBefore + 1),
    simTime,
    sha256Hex: sha256,
    firstEventSequence: String(versionBefore + 1),
    commandPayload: { commandPayloadVariant },
  });
  return createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId(id),
      worldId: WORLD,
      causationCommandId,
      causationEventIds,
      worldVersionBefore: String(versionBefore),
      worldVersionAfter: String(versionBefore + 1),
      simTime,
      command: evidence.command,
      transition: evidence.transition,
      settlementCurrency: 'GCU',
      legs,
    },
    sha256,
  );
}

const emptyState = () =>
  openingLedgers({
    worldId: WORLD,
    sha256Hex: sha256,
  }).financial;

function balance(state: ReturnType<typeof emptyState>, accountId: string) {
  return (
    state.positions
      .find((position) => position.account.accountId === accountId)
      ?.netDebitBalance.toCanonicalValue().amount ?? '0'
  );
}

describe('V08.2 authoritative financial posting ledger', () => {
  it('applies an exact balanced bilateral posting through one owner boundary', () => {
    expect(FINANCIAL_AUTHORITATIVE_WRITER).toBe('WORLD_FINANCIAL_POSTING');
    const posting = batch('BATCH_1', 0, [
      leg('LEG_1', cash, 'DEBIT', '10.125'),
      leg('LEG_2', revenue, 'CREDIT', '10.125'),
    ]);
    const result = applyFinancialPostingBatch(emptyState(), posting);

    expect(balance(result.state, 'ACCOUNT_CASH')).toBe('10.125');
    expect(balance(result.state, 'ACCOUNT_REVENUE')).toBe('-10.125');
    expect(result.receipt).toMatchObject({
      outcome: 'APPLIED',
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      causationCommandId: commandId('COMMAND_BATCH_1'),
      causationEventIds: [eventId('EVENT_BATCH_1')],
    });
  });

  it('balances a multilateral batch without tolerance or partial application', () => {
    const posting = batch('BATCH_MULTI', 0, [
      leg('LEG_CASH', cash, 'DEBIT', '100'),
      leg('LEG_REVENUE', revenue, 'CREDIT', '60'),
      leg('LEG_EXPENSE', expense, 'CREDIT', '40'),
    ]);
    const result = applyFinancialPostingBatch(emptyState(), posting);
    expect(result.state.positions).toHaveLength(3);
    const total = result.state.positions.reduce(
      (sum, position) => sum.add(position.netDebitBalance),
      Money.from('0', 'GCU'),
    );
    expect(total.toCanonicalValue().amount).toBe('0');
  });

  it('rejects unequal, missing and duplicate legs before state mutation', () => {
    const original = emptyState();
    expect(() =>
      batch('BATCH_UNBALANCED', 0, [
        leg('LEG_1', cash, 'DEBIT', '10'),
        leg('LEG_2', revenue, 'CREDIT', '9.999'),
      ]),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.LEDGER_IMBALANCE }),
    );
    expect(() =>
      batch('BATCH_MISSING', 0, [leg('LEG_1', cash, 'DEBIT', '10')]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.FINANCIAL_INPUT_INVALID,
      }),
    );
    expect(() =>
      batch('BATCH_DUPLICATE', 0, [
        leg('LEG_1', cash, 'DEBIT', '10'),
        leg('LEG_2', cash, 'CREDIT', '10'),
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.FINANCIAL_INPUT_INVALID,
      }),
    );
    expect(original.positions).toEqual([]);
    expect(original.worldVersion).toBe('0');
  });

  it('forbids cross-currency netting and implicit conversion', () => {
    const usdCash = account('ACCOUNT_USD', 'CASH', { currency: 'USD' });
    expect(() =>
      batch('BATCH_FX', 0, [
        leg('LEG_1', cash, 'DEBIT', '10'),
        leg('LEG_2', usdCash, 'CREDIT', '10'),
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.FINANCIAL_INPUT_INVALID,
      }),
    );
  });

  it('fails closed on unsupported versions, JS-number leakage and non-positive legs', () => {
    const valid = batch('BATCH_VERSION', 0, [
      leg('LEG_1', cash, 'DEBIT', '1'),
      leg('LEG_2', revenue, 'CREDIT', '1'),
    ]);
    expect(() =>
      createFinancialPostingBatch(
        {
          ...valid,
          ...testAuthoritativeTransition({
            worldId: WORLD,
            commandId: valid.causationCommandId,
            eventIds: valid.causationEventIds,
            worldVersionBefore: valid.worldVersionBefore,
            worldVersionAfter: valid.worldVersionAfter,
            simTime: valid.simTime,
            sha256Hex: sha256,
          }),
          schemaVersion: 'financial-posting-v2' as never,
        },
        sha256,
      ),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.VERSION_MISMATCH }),
    );
    expect(() =>
      createFinancialPostingBatch(
        {
          ...valid,
          ...testAuthoritativeTransition({
            worldId: WORLD,
            commandId: valid.causationCommandId,
            eventIds: valid.causationEventIds,
            worldVersionBefore: valid.worldVersionBefore,
            worldVersionAfter: valid.worldVersionAfter,
            simTime: valid.simTime,
            sha256Hex: sha256,
          }),
          legs: [
            { ...valid.legs[0]!, amount: 1 as unknown as Money },
            valid.legs[1]!,
          ],
        },
        sha256,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.FINANCIAL_INPUT_INVALID,
      }),
    );
    expect(() =>
      batch('BATCH_ZERO', 0, [
        leg('LEG_1', cash, 'DEBIT', '0'),
        leg('LEG_2', revenue, 'CREDIT', '0'),
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.FINANCIAL_INPUT_INVALID,
      }),
    );
  });

  it('exposes symmetric claim/debt account identities without issuing debt', () => {
    const pair = createClaimAccountPair({
      worldId: WORLD,
      claimId: financialClaimId('CLAIM_1'),
      currency: 'GCU',
      lenderAccountId: financialAccountId('ACCOUNT_RECEIVABLE'),
      lenderId: ENTITY_A,
      lenderCountryId: countryId('COUNTRY_A'),
      borrowerAccountId: financialAccountId('ACCOUNT_PAYABLE'),
      borrowerId: ENTITY_B,
      borrowerCountryId: countryId('COUNTRY_B'),
    });
    expect(pair.receivable).toMatchObject({
      accountClass: 'RECEIVABLE',
      claimId: financialClaimId('CLAIM_1'),
      counterpartyEntityId: ENTITY_B,
    });
    expect(pair.payable).toMatchObject({
      accountClass: 'PAYABLE',
      claimId: financialClaimId('CLAIM_1'),
      counterpartyEntityId: ENTITY_A,
    });
  });

  it('requires explicit counterpart accounts to identify another batch leg', () => {
    expect(() =>
      batch('BATCH_COUNTERPARTY', 0, [
        leg('LEG_1', cash, 'DEBIT', '5', financialAccountId('ACCOUNT_MISSING')),
        leg('LEG_2', revenue, 'CREDIT', '5'),
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.FINANCIAL_INPUT_INVALID,
      }),
    );
  });

  it('canonicalizes leg order and produces deterministic fingerprints', () => {
    const forward = batch('BATCH_ORDER', 0, [
      leg('LEG_1', cash, 'DEBIT', '2'),
      leg('LEG_2', revenue, 'CREDIT', '2'),
    ]);
    const reverse = batch('BATCH_ORDER', 0, [
      leg('LEG_2', revenue, 'CREDIT', '2'),
      leg('LEG_1', cash, 'DEBIT', '2'),
    ]);
    expect(reverse.fingerprint).toBe(forward.fingerprint);
    expect(reverse.legs).toEqual(forward.legs);
  });

  it('returns exact duplicate evidence and rejects changed canonical intent', () => {
    const firstBatch = batch('BATCH_RETRY', 0, [
      leg('LEG_1', cash, 'DEBIT', '20'),
      leg('LEG_2', revenue, 'CREDIT', '20'),
    ]);
    const first = applyFinancialPostingBatch(emptyState(), firstBatch);
    const duplicate = applyFinancialPostingBatch(first.state, firstBatch);
    expect(duplicate.state).toBe(first.state);
    expect(duplicate.receipt.outcome).toBe('EXACT_DUPLICATE');

    const conflict = batch('BATCH_RETRY', 0, [
      leg('LEG_1', cash, 'DEBIT', '21'),
      leg('LEG_2', revenue, 'CREDIT', '21'),
    ]);
    expect(() =>
      applyFinancialPostingBatch(first.state, conflict),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.FINANCIAL_POSTING_CONFLICT,
      }),
    );

    const transitionConflict = batch(
      'BATCH_RETRY',
      0,
      [
        leg('LEG_1', cash, 'DEBIT', '20'),
        leg('LEG_2', revenue, 'CREDIT', '20'),
      ],
      'b',
    );
    expect(() =>
      applyFinancialPostingBatch(first.state, transitionConflict),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.FINANCIAL_POSTING_CONFLICT,
      }),
    );
  });

  it('rejects a redefinition of an existing account identity', () => {
    const first = applyFinancialPostingBatch(
      emptyState(),
      batch('BATCH_FIRST', 0, [
        leg('LEG_1', cash, 'DEBIT', '3'),
        leg('LEG_2', revenue, 'CREDIT', '3'),
      ]),
    );
    const cleared = applyFinancialPostingBatch(
      first.state,
      batch('BATCH_CLEAR', 1, [
        leg('LEG_3', cash, 'CREDIT', '3'),
        leg('LEG_4', revenue, 'DEBIT', '3'),
      ]),
    );
    expect(cleared.state.positions).toEqual([]);
    expect(cleared.state.accounts).toHaveLength(2);
    const redefinedCash = account('ACCOUNT_CASH', 'LIABILITY');
    expect(() =>
      applyFinancialPostingBatch(
        cleared.state,
        batch('BATCH_SECOND', 2, [
          leg('LEG_5', redefinedCash, 'DEBIT', '1'),
          leg('LEG_6', expense, 'CREDIT', '1'),
        ]),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.FINANCIAL_POSTING_CONFLICT,
      }),
    );
  });

  it('rejects forged ledger and posting records at the writer boundary', () => {
    const posting = batch('BATCH_FORGE', 0, [
      leg('LEG_1', cash, 'DEBIT', '1'),
      leg('LEG_2', revenue, 'CREDIT', '1'),
    ]);
    expect(() =>
      applyFinancialPostingBatch({ ...emptyState() }, posting),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.VERSION_MISMATCH }),
    );
    expect(() =>
      applyFinancialPostingBatch(emptyState(), { ...posting }),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.FINANCIAL_INPUT_INVALID,
      }),
    );
  });
});
