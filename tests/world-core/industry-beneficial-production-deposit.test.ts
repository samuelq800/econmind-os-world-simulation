import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import { applyFinancialPostingBatch } from '../../packages/core/src/finance/financial-ledger.js';
import {
  bindBeneficialProductionDepositRecipients,
  readProductionWageDepositAccounts,
  isSettledOriginalProductionDeposit,
} from '../../packages/core/src/finance/production-deposit-funding.js';
import {
  industryWageFixture,
  wageSha as sha,
} from '../support/industry-operating-wage-fixture.js';
function paid(f: ReturnType<typeof industryWageFixture>, bad = false) {
  const financial = C.rebuildV08LedgersFromLineage({
    seed: f.seed,
    transitions: [],
    sha256Hex: sha,
  }).financial;
  bindBeneficialProductionDepositRecipients(financial, f.receipt);
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      commandId: 'COMMAND_TEST_ONLY_WAGES',
      worldId: f.worldId,
      commandType: 'TEST_ONLY_WAGE_SETTLE',
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      countryId: f.countryId,
      officeId: null,
      expectedWorldVersion: '0',
      idempotencyKey: 'TEST_ONLY_WAGES',
      correlationId: 'CORRELATION_TEST_ONLY',
      simTime: '1000',
      submittedAtReal: '2026-11-01T00:00:00.000Z',
      payload: { TEST_ONLY: true },
    },
    sha,
  );
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_TEST_ONLY_WAGES',
      eventType: 'TEST_ONLY_WAGE_SETTLED',
      worldId: f.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: '1',
      sequence: '1',
      simTime: command.simTime.toCanonicalValue(),
      recordedAtReal: command.submittedAtReal,
      correctsEventId: null,
      payload: { TEST_ONLY: true },
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const expense = C.createFinancialAccount({
    ...f.op.asset,
    accountId: C.financialAccountId('ACCOUNT_WAGE_EXPENSE'),
    accountClass: 'EXPENSE',
    claimId: null,
    counterpartyEntityId: null,
  });
  const rows: {
    account: C.FinancialAccount;
    direction: 'DEBIT' | 'CREDIT';
    counterpartyAccountId: C.FinancialAccountId;
    amount: C.Money;
  }[] = [
    {
      account: expense,
      direction: 'DEBIT',
      counterpartyAccountId: f.op.asset.accountId,
      amount: C.Money.from('6', 'XAA'),
    },
    {
      account: f.op.asset,
      direction: 'CREDIT',
      counterpartyAccountId: expense.accountId,
      amount: C.Money.from('6', 'XAA'),
    },
    {
      account: f.op.liability,
      direction: 'DEBIT',
      counterpartyAccountId: f.hh.liability.accountId,
      amount: C.Money.from('6', 'XAA'),
    },
    {
      account: f.hh.liability,
      direction: 'CREDIT',
      counterpartyAccountId: f.op.liability.accountId,
      amount: C.Money.from('6', 'XAA'),
    },
  ];
  f.receipt.subaccounts.slice(0, 2).forEach((s, i) => {
    const revenue = C.createFinancialAccount({
      ...s.account,
      accountId: C.financialAccountId('ACCOUNT_WAGE_REVENUE_' + i),
      accountClass: 'REVENUE',
      claimId: null,
      counterpartyEntityId: null,
    });
    const asset = bad && i === 0 ? f.hh.asset : s.account;
    rows.push(
      {
        account: asset,
        direction: 'DEBIT',
        counterpartyAccountId: revenue.accountId,
        amount: C.Money.from('3', 'XAA'),
      },
      {
        account: revenue,
        direction: 'CREDIT',
        counterpartyAccountId: asset.accountId,
        amount: C.Money.from('3', 'XAA'),
      },
    );
  });
  const batch = C.createFinancialPostingBatch(
    {
      schemaVersion: C.FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: C.financialPostingBatchId('BATCH_TEST_ONLY_WAGES'),
      worldId: f.worldId,
      causationCommandId: command.commandId,
      causationEventIds: transition.eventIds,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: command.simTime,
      command,
      transition,
      settlementCurrency: 'XAA',
      legs: rows.map((r, i) => ({
        ...r,
        legId: C.financialPostingLegId('LEG_WAGE_' + i),
      })),
    },
    sha,
  );
  return {
    financial: applyFinancialPostingBatch(financial, batch).state,
    batch,
  };
}
describe('real beneficial deposit settlement classification (TEST_ONLY)', () => {
  it('recognizes complete multi-group wage legs with one unchanged bank claim mirror', () => {
    const f = industryWageFixture();
    const { financial, batch } = paid(f);
    expect(
      isSettledOriginalProductionDeposit({
        financial,
        batch,
        payment: batch.legs[1]!,
        expense: batch.legs[0]!,
      }),
    ).toBe(true);
    expect(
      C.aggregateBeneficialHousingLiquidClaim(financial, f.receipt)
        .availableAmount,
    ).toBe('106');
    expect(
      financial.positions
        .find((p) => p.account.accountId === f.hh.asset.accountId)
        ?.netDebitBalance.amount.toString() ?? '0',
    ).toBe('0');
  });
  it('refuses paying the zero parent instead of actual beneficial groups', () => {
    const f = industryWageFixture();
    expect(() => {
      const { financial, batch } = paid(f, true);
      isSettledOriginalProductionDeposit({
        financial,
        batch,
        payment: batch.legs[1]!,
        expense: batch.legs[0]!,
      });
    }).toThrow(/parent claim/);
  });
  it('rejects copied receipt and cross-country accounts, keeps both real group accounts', () => {
    const f = industryWageFixture();
    const financial = C.rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: [],
      sha256Hex: sha,
    }).financial;
    expect(() =>
      bindBeneficialProductionDepositRecipients(financial, { ...f.receipt }),
    ).toThrow();
    bindBeneficialProductionDepositRecipients(financial, f.receipt);
    expect(() =>
      readProductionWageDepositAccounts({
        financial,
        countryId: 'COUNTRY_02',
        operatorId: f.operatorId,
        householdAccountId: f.receipt.subaccounts[0]!.account.accountId,
      }),
    ).toThrow();
    for (const s of f.receipt.subaccounts)
      expect(
        readProductionWageDepositAccounts({
          financial,
          countryId: f.countryId,
          operatorId: f.operatorId,
          householdAccountId: s.account.accountId,
        }).payeeAsset,
      ).toEqual(s.account);
    expect(() =>
      readProductionWageDepositAccounts({
        financial,
        countryId: f.countryId,
        operatorId: f.operatorId,
        householdAccountId: f.hh.asset.accountId,
      }),
    ).toThrow();
  });
});
