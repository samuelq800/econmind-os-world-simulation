import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  FINANCIAL_POSTING_SCHEMA_VERSION,
  Money,
  SimTime,
  applyFinancialPostingBatch,
  canonicalSerialize,
  commandId,
  countryId,
  createFinancialAccount,
  createFinancialPostingBatch,
  eventId,
  financialAccountId,
  financialPostingBatchId,
  financialPostingLegId,
  hydrateFinancialLedgerState,
  legalEntityId,
  worldId,
  type FinancialPostingLeg,
} from '../../packages/core/src/index.js';
import { FOUNDATION_PROPERTY_CONFIG } from './property-config.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const WORLD = worldId('WORLD_PROPERTY');

const accounts = ['DEBIT', 'CREDIT_A', 'CREDIT_B'].map((name) =>
  createFinancialAccount({
    worldId: WORLD,
    accountId: financialAccountId(`ACCOUNT_${name}`),
    ownerId: legalEntityId(`ENTITY_${name}`),
    countryId: countryId(`COUNTRY_${name}`),
    accountClass: name === 'DEBIT' ? 'ASSET' : 'LIABILITY',
    currency: 'GCU',
    claimId: null,
    counterpartyEntityId: null,
  }),
);

function leg(
  index: number,
  direction: FinancialPostingLeg['direction'],
  amount: bigint,
): FinancialPostingLeg {
  const account = accounts[index];
  if (account === undefined) throw new Error('property account missing');
  return {
    legId: financialPostingLegId(`LEG_${index}`),
    account,
    direction,
    amount: Money.from(String(amount), 'GCU'),
    counterpartyAccountId: null,
  };
}

function batch(legs: readonly FinancialPostingLeg[]) {
  return createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId('BATCH_PROPERTY'),
      worldId: WORLD,
      causationCommandId: commandId('COMMAND_PROPERTY'),
      causationEventIds: [eventId('EVENT_PROPERTY')],
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: SimTime.fromTicks('10000'),
      settlementCurrency: 'GCU',
      legs,
    },
    sha256,
  );
}

const emptyState = () =>
  hydrateFinancialLedgerState({
    worldId: WORLD,
    worldVersion: '0',
    positions: [],
  });

describe('V08.2 exact financial posting properties', () => {
  it('balances every generated multilateral batch exactly', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 30n }),
        fc.bigInt({ min: 1n, max: 10n ** 30n }),
        (first, second) => {
          const posting = batch([
            leg(0, 'DEBIT', first + second),
            leg(1, 'CREDIT', first),
            leg(2, 'CREDIT', second),
          ]);
          const result = applyFinancialPostingBatch(emptyState(), posting);
          const total = result.state.positions.reduce(
            (sum, position) => sum.add(position.netDebitBalance),
            Money.from('0', 'GCU'),
          );
          expect(total.toCanonicalValue().amount).toBe('0');
        },
      ),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 90,
      },
    );
  });

  it('rejects every generated one-sided imbalance', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 24n }),
        fc.bigInt({ min: 1n, max: 10n ** 24n }),
        (amount, imbalance) => {
          expect(() =>
            batch([
              leg(0, 'DEBIT', amount + imbalance),
              leg(1, 'CREDIT', amount),
            ]),
          ).toThrow('balance exactly');
        },
      ),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 91,
      },
    );
  });

  it('replays equal canonical intent to equal state and evidence', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 24n }),
        fc.bigInt({ min: 1n, max: 10n ** 24n }),
        (first, second) => {
          const legs = [
            leg(0, 'DEBIT', first + second),
            leg(1, 'CREDIT', first),
            leg(2, 'CREDIT', second),
          ];
          const forward = applyFinancialPostingBatch(emptyState(), batch(legs));
          const reversed = applyFinancialPostingBatch(
            emptyState(),
            batch([...legs].reverse()),
          );
          expect(canonicalSerialize(reversed.state)).toBe(
            canonicalSerialize(forward.state),
          );
          expect(canonicalSerialize(reversed.receipt)).toBe(
            canonicalSerialize(forward.receipt),
          );
        },
      ),
      {
        ...FOUNDATION_PROPERTY_CONFIG,
        seed: FOUNDATION_PROPERTY_CONFIG.seed + 92,
      },
    );
  });
});
