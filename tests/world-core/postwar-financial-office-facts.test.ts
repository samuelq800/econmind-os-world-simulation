/** Necessary pure source regression: actual selected 70-country financial
 * baseline only. No full operating world, SQL cluster, key or admission row. */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadOwnerNonHostSourceAdoption } from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import { createPostwarMonetaryGenesis } from '../../apps/world-worker/src/preparation/postwar-monetary-genesis.js';
import {
  createPostwarFinancialGenesis,
  readPostwarLiquidFundingAccountsFromSeed,
} from '../../apps/world-worker/src/preparation/postwar-financial-genesis.js';
import { createPostwarFinancialOfficeOriginalDocument } from '../../apps/world-worker/src/preparation/postwar-financial-office-originals.js';
import { derivePostwarFinancialOfficeReadFacts } from '../../apps/world-worker/src/persistence/postwar-financial-office-runtime-source.js';
const root = path.resolve(import.meta.dirname, '../..');
const parent = await loadOwnerNonHostSourceAdoption({
  repositoryRoot: root,
  ownerDocumentPath: path.join(
    root,
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
  ),
  rootReceiptPath: path.join(
    root,
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
  ),
  scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
});
const monetary = createPostwarMonetaryGenesis({
  source: parent.source,
  countriesBytes: await readFile(
    path.join(
      root,
      'artifacts/world-balanced-candidate-v1/data/countries.json',
    ),
    'utf8',
  ),
  mappingBytes: await readFile(
    path.join(
      root,
      'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
    ),
    'utf8',
  ),
  valueDate: '2026-10-28',
});
const financial = createPostwarFinancialGenesis({
  adoption: parent,
  monetary,
  worldId: 'WORLD_POSTWAR_FINANCIAL_FACTS_TEST',
  seedId: 'SEED_POSTWAR_FINANCIAL_FACTS_TEST',
  sourceId: 'SOURCE_POSTWAR_FINANCIAL_FACTS_TEST',
  genesisVersion: 'POSTWAR_FINANCIAL_FACTS_TEST_V1',
});
const originalsDocument =
  createPostwarFinancialOfficeOriginalDocument(financial);
describe('actual financial source after held-ledger optimization', () => {
  it('matches the original exact two-sided treasury claim reader for actual first and last countries', () => {
    const expected = readPostwarLiquidFundingAccountsFromSeed(
      financial.baselineSeed,
    );
    for (const countryId of ['COUNTRY_01', 'COUNTRY_70']) {
      const facts = derivePostwarFinancialOfficeReadFacts({
        seed: financial.baselineSeed,
        originalsDocument,
        scope: {
          worldId: financial.baselineSeed.worldId,
          countryId,
          officeId: 'FINANCE',
        },
      });
      if (facts.officeId !== 'FINANCE') throw Error('FINANCE_SCOPE_REQUIRED');
      expect(facts.treasuryLiquidClaim).toEqual(
        expected.find(
          (e) => e.countryId === countryId && e.kind === 'TREASURY_TGA',
        ),
      );
      expect(
        facts.financialPositions.every(
          (p) =>
            p.account.countryId === countryId &&
            p.account.ownerId === facts.governmentEntityId,
        ),
      ).toBe(true);
      expect(facts.openingOperatingAllocations).toBeNull();
      expect(facts).not.toHaveProperty('centralBankRegister');
    }
  });
  it('returns only the actual scoped Central Bank register and explicit absence of government securities', () => {
    for (const countryId of ['COUNTRY_01', 'COUNTRY_70']) {
      const facts = derivePostwarFinancialOfficeReadFacts({
        seed: financial.baselineSeed,
        originalsDocument,
        scope: {
          worldId: financial.baselineSeed.worldId,
          countryId,
          officeId: 'CENTRAL_BANK',
        },
      });
      if (facts.officeId !== 'CENTRAL_BANK') throw Error('CB_SCOPE_REQUIRED');
      expect(facts.centralBankRegister).toEqual(
        financial.contract.countries.find((c) => c.countryId === countryId)!
          .cbRegister,
      );
      expect(facts.omoInventory.status).toBe('NO_DECLARED_GOVERNMENT_SECURITY');
      expect(facts.omoInventory.holdings).toEqual([]);
      expect(
        facts.financialPositions.every(
          (p) =>
            p.account.countryId === countryId &&
            [facts.centralBankEntityId, facts.domesticBankEntityId].includes(
              p.account.ownerId,
            ),
        ),
      ).toBe(true);
      expect(facts).not.toHaveProperty('treasuryLiquidClaim');
      expect(facts).not.toHaveProperty('quote');
    }
  });
});
