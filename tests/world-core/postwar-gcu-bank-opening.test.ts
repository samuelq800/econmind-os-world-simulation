import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { createTestOnlyGcuFinancialParent } from '../support/postwar-gcu-bank-opening-fixture.js';
import {
  derivePostwarGcuBankOpening,
  appendPostwarGcuBankOpening,
  verifyPostwarGcuBankOpeningSeed,
  readPostwarGcuBankOpeningFromSeed,
  type PostwarGcuOpeningInputs,
} from '../../apps/world-worker/src/preparation/postwar-gcu-bank-opening.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (p: string) => readFile(path.join(root, p), 'utf8');
const [tradePlansBytes, compactMappingBytes, policyBytes, userReceiptBytes] =
  await Promise.all([
    read('artifacts/world-balanced-candidate-v1/data/trade-plans.json'),
    read('config/postwar-genesis/gcu-country-mapping.v1.json'),
    read('config/postwar-genesis/gcu-bank-opening.v1.json'),
    read(
      'docs/governance/owner-inputs/2026-10-29/GCU_OPENING_USER_ADOPTION.original.json',
    ),
  ]);
const inputs: PostwarGcuOpeningInputs = {
  tradePlansBytes,
  compactMappingBytes,
  policyBytes,
  userReceiptBytes,
};
const plan = derivePostwarGcuBankOpening(inputs);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('authorized deterministic GCU private-bank opening policy', () => {
  it('recalculates real 641-plan/70-country exact allocation, including differences and the aggregate cap', () => {
    expect(plan.planCount).toBe('641');
    expect(plan.countries).toHaveLength(70);
    expect(plan.totalGcu).toBe('6662014088.360237');
    expect(plan.countries[0]?.openingGcu).toBe('33145607.284752');
    expect(
      plan.countries.find((c) => c.countryId === 'COUNTRY_36')?.openingGcu,
    ).toBe('23832576.205484');
    expect(
      plan.countries.find((c) => c.countryId === 'COUNTRY_66')?.openingGcu,
    ).toBe('248506342.851057');
    expect(new Set(plan.countries.map((c) => c.openingGcu)).size).toBe(70);
    expect(plan.countries.flatMap((c) => c.sourcePlanPointers)).toHaveLength(
      641,
    );
    expect(
      new Set(plan.countries.flatMap((c) => c.sourcePlanPointers)).size,
    ).toBe(641);
    expect(plan.referenceNature).toBe('UNSIGNED_PLANS_NOT_EXECUTABLE_QUOTES');
    expect(plan.status).toBe('PROJECT_POLICY_ADOPTED_NOT_RUNTIME_ADMITTED');
  });
  it('retains exact original mapping excerpts rather than suffix-derived aliases', async () => {
    const full = JSON.parse(
      await read(
        'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
      ),
    ) as {
      mappings: {
        countries: { sourceCountryId: string; coreCountryId: string }[];
      };
    };
    expect(JSON.parse(compactMappingBytes).countries).toEqual(
      full.mappings.countries.map((c) => ({
        sourceCountryId: c.sourceCountryId,
        countryId: c.coreCountryId,
      })),
    );
  });
  it('rejects changed plans, policy, mapping, or a substituted user receipt', () => {
    for (const key of Object.keys(
      inputs,
    ) as (keyof PostwarGcuOpeningInputs)[]) {
      expect(() =>
        derivePostwarGcuBankOpening({ ...inputs, [key]: inputs[key] + ' ' }),
      ).toThrow('pin mismatch');
    }
    expect(() =>
      appendPostwarGcuBankOpening({
        parentSeed: createTestOnlyGcuFinancialParent(plan),
        plan: JSON.parse(JSON.stringify(plan)),
      }),
    ).toThrow('genuine');
  });
  it('posts one cash/equity pair per mechanism-parent bank and preserves all original LC positions', () => {
    const parent = createTestOnlyGcuFinancialParent(plan),
      family = appendPostwarGcuBankOpening({ parentSeed: parent, plan });
    expect(family.accounts).toHaveLength(70);
    expect(family.seed.financialBatches).toHaveLength(140);
    expect(family.seed.inventoryEntries).toEqual(parent.inventoryEntries);
    for (const batch of parent.financialBatches)
      expect(
        family.seed.financialBatches.find((b) => b.batchId === batch.batchId),
      ).toEqual(batch);
    for (const batch of family.batches) {
      expect(batch.legs).toHaveLength(2);
      const debit = batch.legs.find((l) => l.direction === 'DEBIT')!,
        credit = batch.legs.find((l) => l.direction === 'CREDIT')!;
      expect(debit.account.accountClass).toBe('CASH');
      expect(credit.account.accountClass).toBe('EQUITY');
      expect(debit.account.ownerId).toBe(credit.account.ownerId);
      expect(C.canonicalSerialize(debit.amount)).toBe(
        C.canonicalSerialize(credit.amount),
      );
      expect(debit.account.currency).toBe('GCU');
      expect(debit.account.claimId).toBeNull();
      expect(debit.account.counterpartyEntityId).toBeNull();
    }
    // The real Core opening/replay validator consumes these actual entries.
    const replay = C.rebuildV08LedgersFromLineage({
      seed: family.seed,
      sha256Hex: sha,
    });
    const original = C.rebuildV08LedgersFromLineage({
      seed: parent,
      sha256Hex: sha,
    });
    for (const position of original.financial.positions)
      expect(
        replay.financial.positions.find(
          (p) => p.account.accountId === position.account.accountId,
        ),
      ).toEqual(position);
    for (const account of family.accounts) {
      const cash = replay.financial.positions.find(
        (p) => p.account.accountId === account.cashAccountId,
      )!;
      const equity = replay.financial.positions.find(
        (p) => p.account.accountId === account.equityAccountId,
      )!;
      expect(C.canonicalDecimal(cash.netDebitBalance.amount)).toBe(
        account.amount,
      );
      expect(C.canonicalDecimal(equity.netDebitBalance.amount)).toBe(
        `-${account.amount}`,
      );
    }
  });
  it('reproduces identical seed bytes and IDs; a second issuance into the same seed is rejected', () => {
    const parent = createTestOnlyGcuFinancialParent(plan),
      a = appendPostwarGcuBankOpening({ parentSeed: parent, plan }),
      b = appendPostwarGcuBankOpening({ parentSeed: parent, plan });
    expect(C.canonicalSerialize(a.seed)).toBe(C.canonicalSerialize(b.seed));
    expect(() =>
      appendPostwarGcuBankOpening({ parentSeed: a.seed, plan }),
    ).toThrow('no second issuance');
  });
  it('revalidates serialized lineage and refuses a rehashed change to the issued cash/equity values', () => {
    const family = appendPostwarGcuBankOpening({
      parentSeed: createTestOnlyGcuFinancialParent(plan),
      plan,
    });
    const verified = verifyPostwarGcuBankOpeningSeed(
      JSON.parse(JSON.stringify(family.seed)),
    );
    expect(verified.parentSeed.fingerprint).toBe(family.parentSeed.fingerprint);
    const changed = C.createOpeningSeed(
      {
        ...family.seed,
        financialBatches: family.seed.financialBatches.map((b) =>
          b.sourceId !== family.source.sourceId
            ? b
            : {
                ...b,
                legs: b.legs.map((l) => ({
                  ...l,
                  amount: C.Money.from('1', 'GCU'),
                })),
              },
        ),
      },
      sha,
    );
    expect(() => verifyPostwarGcuBankOpeningSeed(changed)).toThrow(
      'deterministic issuance',
    );
    expect(readPostwarGcuBankOpeningFromSeed(family.parentSeed)).toBeNull();
    expect(
      readPostwarGcuBankOpeningFromSeed(family.seed)?.seed.fingerprint,
    ).toBe(family.seed.fingerprint);
  });
});
