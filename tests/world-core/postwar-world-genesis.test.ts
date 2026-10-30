import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalSerialize,
  rebuildV08LedgersFromLineage,
  parseWorldDecimal,
} from '@econmind/core';
import { createHash } from 'node:crypto';
import { preparePostwarWorldGenesis } from '../../apps/world-worker/src/preparation/postwar-world-genesis.js';

const input = {
  repositoryRoot: path.resolve(import.meta.dirname, '../..'),
  worldId: 'WORLD_POSTWAR_FULL_CHAIN_V1',
  seedId: 'SEED_POSTWAR_FULL_CHAIN_V1',
  genesisVersion: 'POSTWAR_OPERATING_GENESIS_20261028_V1',
  valueDate: '2026-10-28',
};
const result = await preparePostwarWorldGenesis(input);
describe('real postwar source, money, labour and public-service preparation', () => {
  it('joins all 70 countries and 122 regions to actual Core financial accounts and labour without spending or duplicating source stock', () => {
    expect(result.monetary.bindings).toHaveLength(70);
    expect(result.social.regions).toHaveLength(122);
    expect(result.funding.accounts).toHaveLength(140);
    expect(result.materializedLabour.unmatched).toBe('0');
    expect(result.supplySeed.inventoryEntries.length).toBe(
      result.financial.baselineSeed.inventoryEntries.length + 244,
    );
    expect(canonicalSerialize(result.supplySeed.financialBatches)).toBe(
      canonicalSerialize(result.financial.baselineSeed.financialBatches),
    );
    const rebuilt = rebuildV08LedgersFromLineage({
      seed: result.supplySeed,
      sha256Hex: (bytes) => createHash('sha256').update(bytes).digest('hex'),
    });
    for (const account of result.funding.accounts) {
      const actual = rebuilt.financial.positions.find(
        (p) => p.account.accountId === account.accountRef,
      )!;
      expect(actual.account.ownerId).toBe(account.payerEntityId);
      expect(actual.account.currency).toBe(account.currency);
      expect(actual.netDebitBalance.toCanonicalValue().amount).toBe(
        account.availableAmount,
      );
      expect(
        parseWorldDecimal(account.reservedAmount).lte(account.availableAmount),
      ).toBe(true);
      expect(
        parseWorldDecimal(account.remainingAmount)
          .plus(account.reservedAmount)
          .equals(account.availableAmount),
      ).toBe(true);
    }
    expect(result.safetyFinalized.incidents.length).toBeGreaterThan(0);
    expect(
      result.safetyFinalized.programmes.some(
        (p) => BigInt(p.scheduledUnpaidRecipients) > 0n,
      ),
    ).toBe(true);
    expect(result.safetyFinalized.wagesOrBenefitsPaid).toBe(false);
    expect(result.worldStarted).toBe(false);
    expect(result.clockStarted).toBe(false);
    expect(result.paymentsPosted).toBe(false);
  });
  it('repeats the same source preparation without new financial batches, stock or work identities', async () => {
    const second = await preparePostwarWorldGenesis(input);
    expect(second.supplySeed.fingerprint).toBe(result.supplySeed.fingerprint);
    expect(second.funding.fingerprint).toBe(result.funding.fingerprint);
    expect(second.housing.fingerprint).toBe(result.housing.fingerprint);
    expect(second.safetyFinalized.fingerprint).toBe(
      result.safetyFinalized.fingerprint,
    );
    expect(second.materializedLabour.state).toEqual(
      result.materializedLabour.state,
    );
  });
});
