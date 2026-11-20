/** Pure accounting integration with TEST_ONLY instruments/quote originals.
 * Actual Core FX and OMO postings are rederived; no source admission, funds,
 * bank capital threshold or official price is created by this test. */
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  valueCentralBankDayOneForeignRegister,
  projectCentralBankDayOneValuedSnapshot,
} from '../../packages/core/src/finance/central-bank-day-one-valuation.js';
import { createPostwarDayOneFxQuoteData } from '../../packages/core/src/finance/postwar-day-one-treasury-fx.js';
import { createCbFinanceSocialFixture } from '../support/cb-finance-social-replay-fixture.js';
import {
  mixedFinancialFixture,
  mixedFxFrame,
  mixedSha as sha,
} from '../support/finance-social-fx-replay-fixture.js';
function fixture() {
  const f = createCbFinanceSocialFixture(),
    fx = mixedFinancialFixture(),
    owner = f.original.bank.bankRef;
  const account = (id: string, kind: 'CASH' | 'EQUITY') =>
    C.createFinancialAccount({
      worldId: f.seed.worldId,
      countryId: C.countryId('COUNTRY_01'),
      ownerId: C.legalEntityId(owner),
      accountId: C.financialAccountId(id),
      accountClass: kind,
      currency: 'GCU',
      claimId: null,
      counterpartyEntityId: null,
    });
  const cash = account('ACCOUNT_CB_VALUATION_GCU_CASH', 'CASH'),
    equity = account('ACCOUNT_CB_VALUATION_GCU_EQUITY', 'EQUITY');
  const { fingerprint: _fp, ...intent } = f.seed;
  void _fp;
  const seed = C.createOpeningSeed(
    {
      ...intent,
      financialBatches: [
        ...intent.financialBatches,
        {
          sourceId: seedSource(f.seed),
          batchId: C.financialOpeningBatchId('BATCH_CB_VALUATION_GCU'),
          settlementCurrency: 'GCU',
          legs: [
            {
              legId: C.financialOpeningLegId('LEG_CB_VALUATION_GCU_CASH'),
              account: cash,
              direction: 'DEBIT',
              amount: C.Money.from('100', 'GCU'),
              counterpartLegId: C.financialOpeningLegId(
                'LEG_CB_VALUATION_GCU_EQUITY',
              ),
            },
            {
              legId: C.financialOpeningLegId('LEG_CB_VALUATION_GCU_EQUITY'),
              account: equity,
              direction: 'CREDIT',
              amount: C.Money.from('100', 'GCU'),
              counterpartLegId: C.financialOpeningLegId(
                'LEG_CB_VALUATION_GCU_CASH',
              ),
            },
          ],
        },
      ],
    },
    sha,
  );
  const financial = C.rebuildV08LedgersFromLineage({
    seed,
    sha256Hex: sha,
  }).financial;
  const { quoteRef: _qr, quoteSha256: _qh, ...quoteIntent } = fx.quote;
  void _qr;
  void _qh;
  const quote = createPostwarDayOneFxQuoteData(
    {
      ...quoteIntent,
      seedFingerprint: seed.fingerprint,
      dealerGcuAccountId: cash.accountId,
      localCurrencyPerGcu: '4.42',
      financialSourceId: seedSource(seed),
      gcuSourceId: seedSource(seed),
      financialSourcePayloadHash: seed.sources[0]!.payloadHash,
      gcuSourcePayloadHash: seed.sources[0]!.payloadHash,
    },
    sha,
  );
  const bank = projectCentralBankDayOneValuedSnapshot({
    financial,
    quote,
    ownerRef: owner,
    simTime: C.SimTime.fromTicks('0'),
    sha256Hex: sha,
    snapshot: f.original.bank,
    assetField: 'settlementCash',
  });
  const position = (id: string) =>
    financial.accounts.find((a) => a.accountId === id)!;
  const foreign = {
    ...fx,
    seed,
    financial,
    quote,
    accounts: {
      ...fx.accounts,
      treasuryAsset: position(f.tga.accountId),
      treasuryLiability: position(
        f.original.centralBankAccounts.treasuryDeposits!,
      ),
      bankSettlementAsset: position(
        f.original.bankAccounts.reservesAtCentralBank!,
      ),
      bankSettlementLiability: position(
        f.original.centralBankAccounts.commercialBankReserves!,
      ),
      bankGcuAsset: cash,
    },
    payload: {
      ...fx.payload,
      quoteRef: quote.quoteRef,
      payerTreasuryAccountId: f.tga.accountId,
      dealerGcuAccountId: cash.accountId,
      localAmount: '1',
      expectedQuoteSha256: quote.quoteSha256,
    },
  };
  return { f, seed, financial, quote, bank, owner, foreign, cash, equity };
}
function seedSource(s: Readonly<C.OpeningSeed>) {
  return s.sources[0]!.sourceId;
}
describe('first-day read-only complete bank foreign denomination view', () => {
  it('refuses an unvalued foreign instrument type even with a genuine ledger and a valid quote', () => {
    const x = fixture(),
      { fingerprint: _fp, ...intent } = x.seed;
    void _fp;
    const seed = C.createOpeningSeed(
        {
          ...intent,
          financialBatches: intent.financialBatches.map((batch) => ({
            ...batch,
            legs: batch.legs.map((leg) =>
              leg.account.accountId === x.cash.accountId
                ? {
                    ...leg,
                    account: C.createFinancialAccount({
                      ...leg.account,
                      accountClass: 'ASSET',
                    }),
                  }
                : leg,
            ),
          })),
        },
        sha,
      ),
      financial = C.rebuildV08LedgersFromLineage({
        seed,
        sha256Hex: sha,
      }).financial;
    expect(() =>
      valueCentralBankDayOneForeignRegister({
        financial,
        quote: x.quote,
        ownerRef: x.owner,
        simTime: C.SimTime.fromTicks('1'),
        sha256Hex: sha,
      }),
    ).toThrow('FULL_FOREIGN_INSTRUMENT_VALUATION_REQUIRED');
  });
  it('maps actual GCU cash and corresponding equity together and permits a genuine LC OMO without changing foreign accounts', () => {
    const x = fixture(),
      before = C.canonicalSerialize(x.financial);
    const v = valueCentralBankDayOneForeignRegister({
      financial: x.financial,
      quote: x.quote,
      ownerRef: x.owner,
      simTime: C.SimTime.fromTicks('1'),
      sha256Hex: sha,
    });
    expect(v.assetAddition).toEqual({ amount: '442', currency: 'XAA' });
    expect(v.equityAddition).toEqual(v.assetAddition);
    expect(v.entries).toHaveLength(2);
    C.assertCentralBankOmoOpeningOriginal({
      financialState: x.financial,
      worldId: x.seed.worldId,
      ...x.f.original,
      bank: x.bank,
      valuationQuote: x.quote,
      sha256Hex: sha,
    });
    expect(C.canonicalSerialize(x.financial)).toBe(before);
  });
  it('after a real six-leg FX, reconciles the unchanged aggregate bank value and actual LC reserve change; a subsequent OMO remains only four LC legs', async () => {
    const x = fixture(),
      frame = await mixedFxFrame({
        financial: x.financial,
        original: x.foreign,
        sequence: '1',
        identity: 'BANK_VALUATION',
        treasuryReservedAmount: '0',
        bankGcuReservedAmount: '0',
      }),
      financial = frame.financialAfter;
    const snapshot = <T extends object>(
      template: T,
      map: Readonly<Record<string, string>>,
    ): T =>
      Object.fromEntries(
        Object.entries(template).map(([key, value]) => {
          const id = map[key];
          if (!id) return [key, value];
          const p = financial.positions.find(
            (p) => p.account.accountId === id,
          )!;
          return [
            key,
            {
              amount: (p.account.accountClass === 'LIABILITY' ||
              p.account.accountClass === 'EQUITY'
                ? p.netDebitBalance.amount.negated()
                : p.netDebitBalance.amount
              ).toString(),
              currency: p.account.currency,
            },
          ];
        }),
      ) as T;
    const bank = projectCentralBankDayOneValuedSnapshot({
        financial,
        quote: x.quote,
        ownerRef: x.owner,
        simTime: C.SimTime.fromTicks('1'),
        sha256Hex: sha,
        snapshot: snapshot(x.f.original.bank, x.f.original.bankAccounts),
        assetField: 'settlementCash',
      }),
      centralBank = snapshot(
        x.f.original.centralBank,
        x.f.original.centralBankAccounts,
      );
    expect(
      C.Money.from(bank.reservesAtCentralBank.amount, 'XAA')
        .add(C.Money.from(bank.settlementCash.amount, 'XAA'))
        .toCanonicalValue(),
    ).toEqual(
      C.Money.from(x.bank.reservesAtCentralBank.amount, 'XAA')
        .add(C.Money.from(x.bank.settlementCash.amount, 'XAA'))
        .toCanonicalValue(),
    );
    const template = x.f.omoFrame([], 'VALUATION_TEMPLATE'),
      payload = JSON.parse(template.events[0]!.canonicalPayload) as {
        trace: C.CentralBankOmoSource['trace'];
      };
    const command = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        worldId: x.seed.worldId,
        countryId: 'COUNTRY_01',
        officeId: 'CENTRAL_BANK',
        commandType: C.CENTRAL_BANK_OMO_COMMAND,
        commandId: 'COMMAND_CB_VALUATION_AFTER_FX',
        idempotencyKey: 'KEY_CB_VALUATION_AFTER_FX',
        actorId: template.command.actorId,
        authSubject: template.command.authSubject,
        expectedWorldVersion: '1',
        simTime: '1',
        correlationId: 'CORRELATION_CB_VALUATION',
        submittedAtReal: template.command.submittedAtReal,
        payload: JSON.parse(template.command.canonicalPayload),
      },
      sha,
    );
    const facts: C.CentralBankOmoSourceFacts = {
      ...x.f.facts,
      worldVersion: '1',
      currentEventSequence: '1',
      currentSimTime: '1',
      bank,
      centralBank,
      quote: x.f.original.quotes[1]!,
      valuationQuote: x.quote,
    };
    const trace = {
      ...payload.trace,
      snapshot: {
        ...payload.trace.snapshot,
        sourceVersion: 'WORLD_VERSION.1',
        snapshotHash: C.centralBankOmoSourceHash(facts, sha),
      },
      snapshotAt: { amount: '1', unit: 'sim_millisecond' as const },
    };
    const settled = C.prepareCentralBankOmoTransition({
      command,
      source: { facts, trace, financialState: financial },
      eventId: 'EVENT_CB_VALUATION_AFTER_FX',
      eventSequence: '2',
      financialBatchId: 'BATCH_CB_VALUATION_AFTER_FX',
      observedAtReal: template.command.submittedAtReal,
      sha256Hex: sha,
    });
    expect(settled.posting.legs).toHaveLength(4);
    expect(
      settled.posting.legs.every((l) => l.account.currency === 'XAA'),
    ).toBe(true);
    expect(
      settled.financial.state.positions.filter(
        (p) => p.account.currency === 'GCU',
      ),
    ).toEqual(financial.positions.filter((p) => p.account.currency === 'GCU'));
    expect(settled.financial.state.worldVersion).toBe('2');
  });
  it('rejects copied ledgers, wrong owner/quote, expiry and omitted foreign valuation instead of dropping the GCU register', () => {
    const x = fixture(),
      input = {
        financial: x.financial,
        quote: x.quote,
        ownerRef: x.owner,
        simTime: C.SimTime.fromTicks('1'),
        sha256Hex: sha,
      };
    expect(() =>
      valueCentralBankDayOneForeignRegister({
        ...input,
        financial: { ...x.financial },
      }),
    ).toThrow('GENUINE_LEDGER');
    expect(() =>
      valueCentralBankDayOneForeignRegister({
        ...input,
        ownerRef: 'ENTITY_BANK_02',
      }),
    ).toThrow('SAME_COUNTRY');
    expect(() =>
      valueCentralBankDayOneForeignRegister({
        ...input,
        simTime: C.SimTime.fromTicks(C.SIMULATION_TICKS_PER_DAY),
      }),
    ).toThrow('SAME_COUNTRY');
    expect(() =>
      valueCentralBankDayOneForeignRegister({
        ...input,
        quote: { ...x.quote, localCurrencyPerGcu: '1' },
      }),
    ).toThrow();
    expect(() =>
      C.assertCentralBankOmoOpeningOriginal({
        financialState: x.financial,
        worldId: x.seed.worldId,
        ...x.f.original,
      }),
    ).toThrow('unmapped BANK/CB');
  });
});
