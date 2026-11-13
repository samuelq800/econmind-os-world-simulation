/** Real fixed 641-plan policy; TEST_ONLY small canonical financial parent.
 * Not the full postwar carrier, admission, executable quote or native trade. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import { createTestOnlyGcuFinancialParent } from '../support/postwar-gcu-bank-opening-fixture.js';
import {
  derivePostwarGcuBankOpening,
  appendPostwarGcuBankOpening,
  readPostwarGcuBankOpeningFromSeed,
} from '../../apps/world-worker/src/preparation/postwar-gcu-bank-opening.js';
import { derivePostwarGcuBankOpeningCashFacts } from '../../apps/world-worker/src/persistence/postwar-financial-office-runtime-source.js';
import { readPostwarOperatingGenesisFromSeed } from '../../apps/world-worker/src/preparation/postwar-operating-genesis-adoption.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (p: string) =>
  readFile(new URL(`../../${p}`, import.meta.url), 'utf8');
const [tradePlansBytes, compactMappingBytes, policyBytes, userReceiptBytes] =
  await Promise.all([
    read('artifacts/world-balanced-candidate-v1/data/trade-plans.json'),
    read('config/postwar-genesis/gcu-country-mapping.v1.json'),
    read('config/postwar-genesis/gcu-bank-opening.v1.json'),
    read(
      'docs/governance/owner-inputs/2026-10-29/GCU_OPENING_USER_ADOPTION.original.json',
    ),
  ]);
const plan = derivePostwarGcuBankOpening({
  tradePlansBytes,
  compactMappingBytes,
  policyBytes,
  userReceiptBytes,
});
const parentSeed = createTestOnlyGcuFinancialParent(plan);
const family = appendPostwarGcuBankOpening({ parentSeed, plan });
describe('fourth-source GCU runtime read and existing owner boundaries', () => {
  it('keeps a legacy seed without GCU cash unavailable and recovers the exact unchanged parent from a valid new family', () => {
    expect(
      derivePostwarGcuBankOpeningCashFacts({
        seed: parentSeed,
        countryId: 'COUNTRY_01',
      }),
    ).toBeNull();
    expect(readPostwarGcuBankOpeningFromSeed(parentSeed)).toBeNull();
    const recovered = readPostwarGcuBankOpeningFromSeed(family.seed)!;
    expect(C.canonicalSerialize(recovered.parentSeed)).toBe(
      C.canonicalSerialize(parentSeed),
    );
    expect(recovered.seed.fingerprint).not.toBe(parentSeed.fingerprint);
    expect(C.canonicalSerialize(family.seed.inventoryEntries)).toBe(
      C.canonicalSerialize(parentSeed.inventoryEntries),
    );
  });
  it.each(['COUNTRY_01', 'COUNTRY_70'])(
    'reads only %s actual BANK CASH and paired equity with new source fingerprints, never a quote',
    (countryId) => {
      const facts = derivePostwarGcuBankOpeningCashFacts({
        seed: family.seed,
        countryId,
      })!;
      const expected = family.accounts.find((a) => a.countryId === countryId)!;
      expect(facts.countryId).toBe(countryId);
      expect(facts.bankEntityId).toBe(expected.bankId);
      expect(facts.cash.accountId).toBe(expected.cashAccountId);
      expect(facts.cash.accountClass).toBe('CASH');
      expect(facts.cash.availableOpeningAmount).toBe(expected.amount);
      expect(facts.initialEquity.creditAmount).toBe(expected.amount);
      expect(facts.seedFingerprint).toBe(family.seed.fingerprint);
      expect(facts.sourceId).toBe(family.source.sourceId);
      expect(facts.sourcePayloadHash).toBe(family.source.payloadHash);
      expect(facts.executableQuote).toBeNull();
      expect(Object.isFrozen(facts)).toBe(true);
    },
  );
  it('preserves all original LC accounts and has no GOV/OP GCU cash for the old narrow-trade classifier', () => {
    const prior = C.rebuildV08LedgersFromLineage({
      seed: parentSeed,
      sha256Hex: sha,
    }).financial;
    const ledger = C.rebuildV08LedgersFromLineage({
      seed: family.seed,
      sha256Hex: sha,
    }).financial;
    for (const old of prior.positions)
      expect(
        ledger.positions.find(
          (p) => p.account.accountId === old.account.accountId,
        ),
      ).toEqual(old);
    const cash = ledger.positions.filter(
      (p) => p.account.accountClass === 'CASH' && p.account.currency === 'GCU',
    );
    expect(cash).toHaveLength(70);
    expect(
      cash.every((p) =>
        family.accounts.some(
          (a) =>
            a.bankId === p.account.ownerId &&
            a.countryId === p.account.countryId,
        ),
      ),
    ).toBe(true);
    expect(
      cash.filter((p) => p.account.ownerId === 'ENTITY_GOVERNMENT_01'),
    ).toEqual([]);
    expect(
      cash.filter((p) => p.account.ownerId === 'ENTITY_OPERATOR_01'),
    ).toEqual([]);
    const total = cash.reduce(
      (n, p) => n.add(p.netDebitBalance),
      C.Money.from('0', 'GCU'),
    );
    expect(total.toCanonicalValue().amount).toBe('6662014088.360237');
  });
  it('refuses wrong-country reads, balanced amount forgery and changed original LC balances', () => {
    expect(() =>
      derivePostwarGcuBankOpeningCashFacts({
        seed: family.seed,
        countryId: 'COUNTRY_71',
      }),
    ).toThrow('exact GCU opening country');
    for (const sourceId of [
      family.source.sourceId,
      parentSeed.sources[0]!.sourceId,
    ]) {
      let changed = false;
      const financialBatches = family.seed.financialBatches.map((b) => {
        if (b.sourceId !== sourceId || changed) return b;
        changed = true;
        return {
          ...b,
          legs: b.legs.map((leg) => ({
            ...leg,
            amount: leg.amount.add(C.Money.from('1', leg.amount.currency)),
          })),
        };
      });
      const counterfeit = C.createOpeningSeed(
        { ...family.seed, financialBatches },
        sha,
      );
      expect(() =>
        derivePostwarGcuBankOpeningCashFacts({
          seed: counterfeit,
          countryId: 'COUNTRY_01',
        }),
      ).toThrow();
      expect(() => readPostwarOperatingGenesisFromSeed(counterfeit)).toThrow(
        /POSTWAR_GCU_OPENING_INVALID/u,
      );
    }
  });
  it('does not treat the new user receipt as approval of a missing original operating carrier', () => {
    expect(() => readPostwarOperatingGenesisFromSeed(parentSeed)).toThrow(
      'EXACT_OPERATING_SOURCE_REQUIRED',
    );
    expect(() => readPostwarOperatingGenesisFromSeed(family.seed)).toThrow(
      'EXACT_OPERATING_SOURCE_REQUIRED',
    );
  });
});
