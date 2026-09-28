import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CURRENT_REPLAY_BINDING,
  Money,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  Quantity,
  commodityId,
  countryId,
  createFinancialAccount,
  createInventoryAccount,
  createOpeningSeed,
  createOpeningSource,
  financialAccountId,
  financialOpeningBatchId,
  financialOpeningLegId,
  inventoryBatchId,
  inventoryLocationId,
  legalEntityId,
  openingInventoryEntryId,
  openingSeedId,
  openingSourceId,
  rebuildV08LedgersFromLineage,
  worldId,
} from '../../packages/core/src/index.js';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../artifacts/world-balanced-candidate-v1',
);
const expectedChecksums =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
const world = worldId('WORLD_V29_BALANCED_TEST_FIXTURE');
const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

interface SourceCountry {
  readonly id: string;
  readonly number: string;
}

interface SourceStock {
  readonly countryId: string;
  readonly commodityId: string;
  readonly unit: string;
  readonly available: number;
}

interface SourceFinance {
  readonly countryId: string;
  readonly currency: string;
  readonly householdBankDeposits: number;
  readonly businessBankDeposits: number;
  readonly bankReserveAssets: number;
  readonly bankLoanAssets: number;
  readonly bankDepositLiabilities: number;
  readonly bankEquity: number;
}

interface Checksum {
  readonly path: string;
  readonly sha256: string;
}

async function selectedInputs() {
  const checksumBytes = await readFile(path.join(root, 'CHECKSUMS.json'));
  expect(sha256(checksumBytes.toString('utf8'))).toBe(expectedChecksums);
  const checksums = new Map(
    (JSON.parse(checksumBytes.toString('utf8')) as Checksum[]).map((entry) => [
      entry.path,
      entry.sha256,
    ]),
  );
  const read = async <T>(relativePath: string): Promise<T> => {
    const bytes = await readFile(path.join(root, relativePath));
    expect(sha256(bytes.toString('utf8'))).toBe(checksums.get(relativePath));
    return JSON.parse(bytes.toString('utf8')) as T;
  };
  return {
    countries: await read<SourceCountry[]>('data/countries.json'),
    stocks: await read<SourceStock[]>('data/stocks.json'),
    finance: await read<SourceFinance[]>('data/finance.json'),
  };
}

describe('selected 70-country data — TEST_FIXTURE-only Core ledger dry-run', () => {
  it('rebuilds partial inventory and bank ledgers with exact, visible source reconciliation', async () => {
    const { countries, stocks, finance } = await selectedInputs();
    expect(countries).toHaveLength(70);
    expect(finance).toHaveLength(70);
    const mapped = new Map(
      countries.map((country) => {
        expect(country.id).toBe(`visual-territory-${country.number}`);
        return [country.id, countryId(`COUNTRY_${country.number}`)];
      }),
    );
    expect(new Set(mapped.values()).size).toBe(70);

    const source = createOpeningSource(
      {
        schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: openingSourceId('SOURCE_V29_BALANCED_TEST_FIXTURE'),
        sourceKind: 'TEST_FIXTURE',
        locator: 'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
        sourceVersion: expectedChecksums,
        payload: {
          candidateChecksumsSha256: expectedChecksums,
          rightsStatus: 'DIAGNOSTIC_PLACEHOLDERS_NOT_APPROVED',
        },
      },
      sha256,
    );
    const inventoryEntries = stocks
      .filter((stock) => stock.available > 0)
      .map((stock) => {
        const targetCountry = mapped.get(stock.countryId);
        if (targetCountry === undefined)
          throw new Error(`Unmapped source country ${stock.countryId}`);
        const number = stock.countryId.slice(-2);
        const diagnosticOwner = legalEntityId(`ENTITY_TEST_OPERATOR_${number}`);
        return {
          entryId: openingInventoryEntryId(
            `OPENING_STOCK_${number}_${stock.commodityId}`,
          ),
          sourceId: source.sourceId,
          account: createInventoryAccount({
            worldId: world,
            countryId: targetCountry,
            commodityId: commodityId(stock.commodityId),
            batchId: inventoryBatchId(
              `BATCH_TEST_${number}_${stock.commodityId}`,
            ),
            unit: stock.unit,
            physicalLocationId: inventoryLocationId(`LOCATION_TEST_${number}`),
            bucket: 'AVAILABLE',
            reservationId: null,
            shipmentId: null,
            titleHolderId: diagnosticOwner,
            riskBearerId: diagnosticOwner,
            economicRecognitionId: null,
          }),
          quantity: Quantity.from(String(stock.available), stock.unit),
        };
      });

    let liabilityCorrections = 0;
    let equityCorrections = 0;
    const financialBatches = finance.map((row) => {
      const targetCountry = mapped.get(row.countryId);
      if (targetCountry === undefined)
        throw new Error(`Unmapped source country ${row.countryId}`);
      expect(row.currency).toBe('GCU_SCENARIO_ACCOUNTING_UNIT');
      const number = row.countryId.slice(-2);
      const bank = legalEntityId(`ENTITY_TEST_BANK_${number}`);
      const reserve = Money.from(String(row.bankReserveAssets), 'GCU');
      const loans = Money.from(String(row.bankLoanAssets), 'GCU');
      expect(loans.amount.isZero()).toBe(true);
      const household = Money.from(String(row.householdBankDeposits), 'GCU');
      const business = Money.from(String(row.businessBankDeposits), 'GCU');
      const derivedLiability = household.add(business);
      const derivedEquity = reserve.add(loans).subtract(derivedLiability);
      expect(derivedEquity.amount.isPositive()).toBe(true);
      if (
        !derivedLiability.amount.equals(
          Money.from(String(row.bankDepositLiabilities), 'GCU').amount,
        )
      ) {
        liabilityCorrections += 1;
      }
      if (
        !derivedEquity.amount.equals(
          Money.from(String(row.bankEquity), 'GCU').amount,
        )
      ) {
        equityCorrections += 1;
      }
      const account = (
        suffix: string,
        accountClass: 'ASSET' | 'LIABILITY' | 'EQUITY',
      ) =>
        createFinancialAccount({
          worldId: world,
          accountId: financialAccountId(`ACCOUNT_TEST_${suffix}_${number}`),
          ownerId: bank,
          countryId: targetCountry,
          accountClass,
          currency: 'GCU',
          claimId: null,
          counterpartyEntityId: null,
        });
      const debitId = financialOpeningLegId(`LEG_TEST_RESERVE_${number}`);
      return {
        batchId: financialOpeningBatchId(`BATCH_TEST_BANK_${number}`),
        sourceId: source.sourceId,
        settlementCurrency: 'GCU',
        legs: [
          {
            legId: debitId,
            account: account('RESERVE', 'ASSET'),
            direction: 'DEBIT' as const,
            amount: reserve,
            counterpartLegId: financialOpeningLegId(
              `LEG_TEST_HOUSEHOLD_${number}`,
            ),
          },
          {
            legId: financialOpeningLegId(`LEG_TEST_HOUSEHOLD_${number}`),
            account: account('HOUSEHOLD', 'LIABILITY'),
            direction: 'CREDIT' as const,
            amount: household,
            counterpartLegId: debitId,
          },
          {
            legId: financialOpeningLegId(`LEG_TEST_BUSINESS_${number}`),
            account: account('BUSINESS', 'LIABILITY'),
            direction: 'CREDIT' as const,
            amount: business,
            counterpartLegId: debitId,
          },
          {
            legId: financialOpeningLegId(`LEG_TEST_EQUITY_${number}`),
            account: account('EQUITY', 'EQUITY'),
            direction: 'CREDIT' as const,
            amount: derivedEquity,
            counterpartLegId: debitId,
          },
        ],
      };
    });
    expect(liabilityCorrections).toBe(56);
    expect(equityCorrections).toBe(62);
    expect(inventoryEntries).toHaveLength(619);
    expect(financialBatches).toHaveLength(70);

    const seed = createOpeningSeed(
      {
        schemaVersion: OPENING_SEED_SCHEMA_VERSION,
        seedId: openingSeedId('SEED_V29_BALANCED_TEST_FIXTURE'),
        worldId: world,
        openingWorldVersion: '0',
        replayBinding: CURRENT_REPLAY_BINDING,
        sources: [source],
        inventoryEntries,
        financialBatches,
      },
      sha256,
    );
    expect(seed.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(seed.sources).toHaveLength(1);
    expect(seed.sources[0]?.sourceKind).toBe('TEST_FIXTURE');
    const rebuilt = rebuildV08LedgersFromLineage({ seed, sha256Hex: sha256 });
    expect(rebuilt.worldVersion).toBe('0');
    expect(rebuilt.inventory.balances).toHaveLength(619);
    expect(rebuilt.financial.positions).toHaveLength(280);
    expect(
      new Set(
        rebuilt.inventory.balances.map((balance) => balance.account.countryId),
      ).size,
    ).toBe(70);
    expect(
      new Set(
        rebuilt.financial.positions.map(
          (position) => position.account.countryId,
        ),
      ).size,
    ).toBe(70);
  });
});
