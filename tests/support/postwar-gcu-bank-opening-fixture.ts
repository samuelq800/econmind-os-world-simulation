import { createHash } from 'node:crypto';
import * as C from '@econmind/core';
import type { PostwarGcuBankOpeningPlan } from '../../apps/world-worker/src/preparation/postwar-gcu-bank-opening.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** TEST_ONLY canonical mechanism parent, not proof of the real financial
 * producer/adoption. Full actual genesis integration is separately required. */
export function createTestOnlyGcuFinancialParent(
  plan: PostwarGcuBankOpeningPlan,
) {
  const world = C.worldId('WORLD_TEST_ONLY_GCU_MECHANISM'),
    seed = C.openingSeedId('SEED_TEST_ONLY_GCU_MECHANISM');
  const sourceId = C.openingSourceId('SOURCE_TEST_ONLY_GCU_PARENT');
  const roster = plan.countries.map((c, i) => ({
    countryId: c.countryId,
    roster: { bank: `ENTITY_BANK_${String(i + 1).padStart(2, '0')}` },
  }));
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId,
      sourceKind: 'AUTHORITATIVE_DATASET',
      sourceVersion: 'TEST_ONLY_MECHANISM',
      locator: 'incoming/financial/adoption.json',
      payload: {
        schemaVersion: 'adopted-financial-opening-source-v2',
        assembly: { worldId: world, seedId: seed, countries: roster },
      },
    },
    sha,
  );
  const financialBatches: C.FinancialOpeningBatch[] = roster.map((c, i) => {
    const id = String(i + 1).padStart(2, '0'),
      credit = C.financialOpeningLegId(`TEST_CREDIT_${id}`),
      debit = C.financialOpeningLegId(`TEST_DEBIT_${id}`);
    const account = (kind: 'ASSET' | 'EQUITY') =>
      C.createFinancialAccount({
        worldId: world,
        countryId: C.countryId(c.countryId),
        ownerId: C.legalEntityId(c.roster.bank),
        accountId: C.financialAccountId(`TEST_${kind}_${id}`),
        accountClass: kind,
        currency: 'XAA',
        claimId: null,
        counterpartyEntityId: null,
      });
    return {
      batchId: C.financialOpeningBatchId(`TEST_BATCH_${id}`),
      sourceId,
      settlementCurrency: 'XAA',
      legs: [
        {
          legId: debit,
          account: account('ASSET'),
          direction: 'DEBIT',
          amount: C.Money.from('123.45', 'XAA'),
          counterpartLegId: credit,
        },
        {
          legId: credit,
          account: account('EQUITY'),
          direction: 'CREDIT',
          amount: C.Money.from('123.45', 'XAA'),
          counterpartLegId: debit,
        },
      ],
    };
  });
  return C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      worldId: world,
      seedId: seed,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      financialBatches,
      inventoryEntries: [],
    },
    sha,
  );
}
