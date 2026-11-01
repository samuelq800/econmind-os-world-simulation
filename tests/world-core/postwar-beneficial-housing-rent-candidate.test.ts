/** Finite 70-country Core proof, not 70-country genesis. No fixture declares
 * operating/admission/Clock authority; the actual source producer stays closed. */
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  restorePostwarBeneficialHousingRentParent,
  preparePostwarBeneficialHousingRentCandidate,
  isPostwarBeneficialHousingRentCandidate,
} from '../../apps/world-worker/src/preparation/postwar-beneficial-housing-rent-candidate.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function fixture() {
  const world = C.worldId('WORLD_TEST_ONLY_RENT_CANDIDATE_PROOF');
  const sources = [1, 2, 3].map((n) =>
    C.createOpeningSource(
      {
        schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: C.openingSourceId('SOURCE_TEST_ONLY_PARENT_' + n),
        sourceKind: 'TEST_FIXTURE',
        sourceVersion: 'TEST_ONLY_RETAINED_V1',
        locator: 'TEST_ONLY_CORE_NOT_OPERATING_OR_ADMISSION',
        payload: {
          index: n.toString(),
          retainedOriginal: 'Exact original bytes, including non-ASCII 字段',
        },
      },
      sha,
    ),
  );
  const accounts = Array.from({ length: 70 }, (_, i) => {
    const suffix = (i + 1).toString().padStart(2, '0');
    const asset = C.createFinancialAccount({
      worldId: world,
      countryId: C.countryId('COUNTRY_' + suffix),
      ownerId: C.legalEntityId('ENTITY_HOUSEHOLDS_' + suffix),
      accountId: C.financialAccountId('ACCOUNT_HH_' + suffix),
      accountClass: 'ASSET',
      currency: 'AAA',
      claimId: C.financialClaimId('CLAIM_HH_' + suffix),
      counterpartyEntityId: C.legalEntityId('ENTITY_BANK_' + suffix),
    });
    const liability = C.createFinancialAccount({
      ...asset,
      accountId: C.financialAccountId('ACCOUNT_BANK_' + suffix),
      ownerId: asset.counterpartyEntityId!,
      counterpartyEntityId: asset.ownerId,
      accountClass: 'LIABILITY',
    });
    return { asset, liability, suffix };
  });
  const inventory = {
    entryId: C.openingInventoryEntryId('OPENING_RETAINED_MEDICINE'),
    sourceId: sources[1]!.sourceId,
    account: C.createInventoryAccount({
      worldId: world,
      countryId: accounts[0]!.asset.countryId,
      commodityId: C.commodityId('MEDICINE_TEST'),
      batchId: C.inventoryBatchId('RETAINED_MEDICINE_BATCH'),
      unit: 'medical_dose',
      physicalLocationId: C.inventoryLocationId('RETAINED_STORE'),
      bucket: 'AVAILABLE',
      reservationId: null,
      shipmentId: null,
      titleHolderId: accounts[0]!.asset.ownerId,
      riskBearerId: accounts[0]!.asset.ownerId,
      economicRecognitionId: null,
    }),
    quantity: C.Quantity.from('7', 'medical_dose'),
  };
  const parent = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_RENT_CANDIDATE_PROOF'),
      worldId: world,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources,
      inventoryEntries: [inventory],
      financialBatches: accounts.map(({ asset, liability, suffix }) => ({
        batchId: C.financialOpeningBatchId('OPENING_HH_' + suffix),
        sourceId: sources[0]!.sourceId,
        settlementCurrency: 'AAA',
        legs: [
          {
            legId: C.financialOpeningLegId('DEBIT_' + suffix),
            account: asset,
            direction: 'DEBIT',
            amount: C.Money.from('100.000003', 'AAA'),
            counterpartLegId: C.financialOpeningLegId('CREDIT_' + suffix),
          },
          {
            legId: C.financialOpeningLegId('CREDIT_' + suffix),
            account: liability,
            direction: 'CREDIT',
            amount: C.Money.from('100.000003', 'AAA'),
            counterpartLegId: C.financialOpeningLegId('DEBIT_' + suffix),
          },
        ],
      })),
    },
    sha,
  );
  const receipts: C.BeneficialHousingReclassificationReceipt[] = [],
    extraSources: C.OpeningSeed['sources'][number][] = [],
    extraBatches: C.OpeningSeed['financialBatches'][number][] = [];
  for (const { asset, suffix } of accounts) {
    const locationId = 'REGION_' + suffix + '_E1';
    const child = C.reclassifyBeneficialHousingSeed(
      {
        seed: parent,
        allocationId: 'TEST_ONLY_ALLOCATION_' + suffix,
        policyRef: 'TEST_ONLY_CORE_MECHANISM_EXISTING_POLICY',
        sourcePopulationRef: 'TEST_ONLY_EXISTING_POPULATION',
        countryId: asset.countryId,
        householdEntityId: asset.ownerId,
        parentAccountId: asset.accountId,
        regions: [{ locationId, households: '6', population: '18' }],
        groups: (
          [
            ['OWNER_OCCUPIER', '0', '2', '0', '6'],
            ['PRIVATE_RENTER', '2', '2', '6', '6'],
            ['PUBLIC_RENTER', '4', '1', '12', '3'],
            ['DISPLACED', '5', '1', '15', '3'],
          ] as const
        ).map(
          ([
            role,
            firstHouseholdOrdinal,
            households,
            firstPersonOrdinal,
            population,
          ]) => ({
            groupId: 'GROUP_' + suffix + '_' + role,
            locationId,
            role,
            firstHouseholdOrdinal,
            households,
            firstPersonOrdinal,
            population,
          }),
        ),
        pools: [
          {
            poolId: 'POOL_' + suffix,
            locationId,
            landlordGroupId: 'GROUP_' + suffix + '_OWNER_OCCUPIER',
            totalUnits: '12',
            habitableUnits: '10',
            ownerOccupiedUnits: '2',
          },
        ],
        leases: [
          {
            leaseId: 'LEASE_' + suffix,
            poolId: 'POOL_' + suffix,
            landlordGroupId: 'GROUP_' + suffix + '_OWNER_OCCUPIER',
            tenantGroupId: 'GROUP_' + suffix + '_PRIVATE_RENTER',
            firstHouseholdOrdinal: '0',
            households: '2',
            startTick: '1',
            endTick: '31',
            periodTicks: '10',
            rentPerHouseholdPerPeriod: '5.000001',
            currency: 'AAA',
            genesisRightsRef: 'TEST_ONLY_UNPAID_RIGHTS_' + suffix,
          },
        ],
      },
      sha,
    );
    receipts.push(child.receipt);
    extraSources.push(
      child.seed.sources.find(
        (s) => s.sourceId === child.receipt.supplementalSourceId,
      )!,
    );
    extraBatches.push(
      child.seed.financialBatches.find(
        (b) => b.batchId === child.receipt.reclassificationBatchId,
      )!,
    );
  }
  const seed = C.createOpeningSeed(
    {
      ...parent,
      sources: [...parent.sources, ...extraSources],
      financialBatches: [...parent.financialBatches, ...extraBatches],
    },
    sha,
  );
  return { parent, seed, receipts };
}
let f: ReturnType<typeof fixture>;
beforeAll(() => {
  f = fixture();
});
describe('prospective beneficial child parent proof, not source admission', () => {
  it('strips only the seventy actual Core deltas, restoring all parent bytes, funds and inventory', () => {
    const parent = restorePostwarBeneficialHousingRentParent(f);
    expect(f.seed.sources).toHaveLength(73);
    expect(f.seed.fingerprint).not.toBe(f.parent.fingerprint);
    expect(C.canonicalSerialize(parent)).toBe(C.canonicalSerialize(f.parent));
    expect(C.canonicalSerialize(parent.inventoryEntries)).toBe(
      C.canonicalSerialize(f.seed.inventoryEntries),
    );
    const childFinancial = C.rebuildV08LedgersFromLineage({
      seed: f.seed,
      sha256Hex: sha,
    }).financial;
    for (const r of f.receipts)
      expect(
        C.aggregateBeneficialHousingLiquidClaim(childFinancial, r)
          .availableAmount,
      ).toBe(r.originalAmount);
    const again = restorePostwarBeneficialHousingRentParent({
      ...f,
      receipts: [...f.receipts].reverse(),
    });
    expect(again.fingerprint).toBe(parent.fingerprint);
    expect(isPostwarBeneficialHousingRentCandidate(parent)).toBe(false);
    expect(isPostwarBeneficialHousingRentCandidate({ ...parent })).toBe(false);
  });
  it.each(['missing', 'duplicate', 'foreign-parent'] as const)(
    'rejects %s country proof before source removal',
    (kind) => {
      const receipts =
        kind === 'missing'
          ? f.receipts.slice(1)
          : kind === 'duplicate'
            ? [f.receipts[0]!, ...f.receipts.slice(0, 69)]
            : f.receipts.map((r, i) =>
                i === 0
                  ? { ...r, parentSeedFingerprint: f.seed.fingerprint }
                  : r,
              );
      expect(() =>
        restorePostwarBeneficialHousingRentParent({ ...f, receipts }),
      ).toThrow('COMPLETE_SEVENTY_COUNTRY_PARENT_PROOF_REQUIRED');
    },
  );
  it('does not hide unrelated retained bytes or an omitted opening batch by stripping the family', () => {
    const extra = C.createOpeningSource(
      {
        schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: C.openingSourceId('SOURCE_NOT_A_RENT_DELTA'),
        sourceKind: 'TEST_FIXTURE',
        sourceVersion: 'TEST_ONLY_V1',
        locator: 'TEST_ONLY',
        payload: { extra: 'cannot hide' },
      },
      sha,
    );
    const seed = C.createOpeningSeed(
      { ...f.seed, sources: [...f.seed.sources, extra] },
      sha,
    );
    expect(() =>
      restorePostwarBeneficialHousingRentParent({ ...f, seed }),
    ).toThrow('RESTORED_PARENT_FINGERPRINT_MISMATCH');
    const missing = C.createOpeningSeed(
      {
        ...f.seed,
        financialBatches: f.seed.financialBatches.filter(
          (b) => b.batchId !== f.receipts[69]!.reclassificationBatchId,
        ),
      },
      sha,
    );
    expect(() =>
      restorePostwarBeneficialHousingRentParent({ ...f, seed: missing }),
    ).toThrow('EXACT_SEVENTY_SOURCE_BATCH_DELTA_REQUIRED');
  });
  it('re-derives the actual Core receipt rather than trusting matching parent/source identifiers', () => {
    const receipts = f.receipts.map((r, i) =>
      i === 0 ? { ...r, originalAmount: '101.000003' } : r,
    );
    expect(() =>
      restorePostwarBeneficialHousingRentParent({ ...f, receipts }),
    ).toThrow();
  });
  it('does not turn a seventy-country fixture or already beneficial child into an operating candidate', () => {
    expect(() =>
      preparePostwarBeneficialHousingRentCandidate({ parentSeed: f.parent }),
    ).toThrow();
    expect(() =>
      preparePostwarBeneficialHousingRentCandidate({ parentSeed: f.seed }),
    ).toThrow('UNMODIFIED_NON_BENEFICIAL_OPENING_PARENT_REQUIRED');
    expect(
      isPostwarBeneficialHousingRentCandidate({
        classification: 'PROSPECTIVE_OPENING_DATA_NOT_CURRENT_WORLD_ADMISSION',
        seed: f.seed,
      }),
    ).toBe(false);
  });
});
