/** TEST_ONLY genuine Core financial data; never admission or completed work. */
import { createHash } from 'node:crypto';
import * as C from '../../packages/core/src/index.js';
export const wageSha = (s: string) =>
  createHash('sha256').update(s).digest('hex');
export function industryWageFixture() {
  const worldId = C.worldId('WORLD_TEST_ONLY_OPERATING_WAGE'),
    countryId = C.countryId('COUNTRY_01');
  const operatorId = C.legalEntityId('ENTITY_OPERATOR_01'),
    householdId = C.legalEntityId('ENTITY_HOUSEHOLDS_01'),
    bankId = C.legalEntityId('ENTITY_BANK_01');
  const id = (prefix: string, key: string) =>
    `${prefix}_${wageSha(C.canonicalSerialize([worldId, countryId, key, 'XAA'])).toUpperCase()}`;
  const pair = (key: string, owner: C.LegalEntityId) => {
    const asset = C.createFinancialAccount({
      worldId,
      countryId,
      ownerId: owner,
      accountId: C.financialAccountId(id('ACCOUNT', key + '_ASSET')),
      accountClass: 'ASSET',
      currency: 'XAA',
      claimId: C.financialClaimId(id('CLAIM', key)),
      counterpartyEntityId: bankId,
    });
    const liability = C.createFinancialAccount({
      ...asset,
      accountId: C.financialAccountId(id('ACCOUNT', key + '_LIABILITY')),
      accountClass: 'LIABILITY',
      ownerId: bankId,
      counterpartyEntityId: owner,
    });
    return { asset, liability };
  };
  const op = pair('BUSINESS_DEPOSIT', operatorId),
    hh = pair('HOUSEHOLD_DEPOSIT', householdId);
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_WAGE_FINANCIAL'),
      sourceKind: 'AUTHORITATIVE_DATASET',
      sourceVersion: 'TEST_ONLY_V1',
      locator: 'TEST_ONLY_NOT_ADOPTED_FINANCIAL_VALUES',
      payload: {
        schemaVersion: 'adopted-financial-opening-source-v2',
        assembly: {
          worldId,
          countries: [
            {
              countryId,
              roster: {
                operator: operatorId,
                households: householdId,
                bank: bankId,
              },
            },
          ],
        },
        reconciliations: [
          {
            countryId,
            denominations: [
              {
                field: 'businessBankDeposits',
                localBookValue: { amount: '100', currency: 'XAA' },
              },
              {
                field: 'householdBankDeposits',
                localBookValue: { amount: '100', currency: 'XAA' },
              },
            ],
          },
        ],
      },
    },
    wageSha,
  );
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_OPERATING_WAGE'),
      worldId,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [op, hh].map(({ asset, liability }, i) => ({
        batchId: C.financialOpeningBatchId('OPENING_WAGE_' + i),
        sourceId: source.sourceId,
        settlementCurrency: 'XAA',
        legs: [
          {
            legId: C.financialOpeningLegId('OPENING_WAGE_ASSET_' + i),
            account: asset,
            direction: 'DEBIT',
            amount: C.Money.from('100', 'XAA'),
            counterpartLegId: C.financialOpeningLegId(
              'OPENING_WAGE_LIABILITY_' + i,
            ),
          },
          {
            legId: C.financialOpeningLegId('OPENING_WAGE_LIABILITY_' + i),
            account: liability,
            direction: 'CREDIT',
            amount: C.Money.from('100', 'XAA'),
            counterpartLegId: C.financialOpeningLegId(
              'OPENING_WAGE_ASSET_' + i,
            ),
          },
        ],
      })),
    },
    wageSha,
  );
  const child = C.reclassifyBeneficialHousingSeed(
    {
      seed,
      allocationId: 'TEST_ONLY_WAGE_ALLOCATION',
      policyRef: 'TEST_ONLY_BENEFICIAL_RULE',
      sourcePopulationRef: 'TEST_ONLY_REGIONAL_POPULATION',
      countryId,
      householdEntityId: householdId,
      parentAccountId: hh.asset.accountId,
      regions: [
        { locationId: 'REGION_01_E1', households: '4', population: '8' },
      ],
      groups: [
        {
          groupId: 'GROUP_WAGE_A',
          locationId: 'REGION_01_E1',
          role: 'OWNER_OCCUPIER',
          firstHouseholdOrdinal: '0',
          households: '1',
          firstPersonOrdinal: '0',
          population: '2',
        },
        {
          groupId: 'GROUP_WAGE_B',
          locationId: 'REGION_01_E1',
          role: 'PRIVATE_RENTER',
          firstHouseholdOrdinal: '1',
          households: '1',
          firstPersonOrdinal: '2',
          population: '2',
        },
        {
          groupId: 'GROUP_WAGE_C',
          locationId: 'REGION_01_E1',
          role: 'PUBLIC_RENTER',
          firstHouseholdOrdinal: '2',
          households: '1',
          firstPersonOrdinal: '4',
          population: '2',
        },
        {
          groupId: 'GROUP_WAGE_D',
          locationId: 'REGION_01_E1',
          role: 'DISPLACED',
          firstHouseholdOrdinal: '3',
          households: '1',
          firstPersonOrdinal: '6',
          population: '2',
        },
      ],
      pools: [],
      leases: [],
    },
    wageSha,
  );
  return {
    worldId,
    countryId,
    operatorId,
    householdId,
    bankId,
    op,
    hh,
    parent: seed,
    ...child,
  };
}
