import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildOfficialWorldOpeningMapping } from '../../scripts/official-world-opening-mapping.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

interface EntityProposalRow {
  readonly role: string;
  readonly realTeamBinding: null;
  readonly authority: string;
}

interface StockRow {
  readonly titleHolderId: null;
  readonly riskBearerId: null;
  readonly ownershipAuthority: string;
}

interface FacilityRow {
  readonly runtimeOperational: boolean;
  readonly executionAuthorized: boolean;
  readonly source: { readonly status: string };
  readonly mapLink: { readonly scenePointAuthority: string };
}

interface DepositRow {
  readonly runtimeAuthorized: boolean;
  readonly source: { readonly visibility: string };
}

interface WaterRow {
  readonly rightsGranted: boolean;
  readonly source: { readonly rightsStatus: string };
}

interface SceneRow {
  readonly displayOnly: boolean;
  readonly sourceCountryId: string;
  readonly officialMapPackageScene: { readonly id: string };
  readonly officialMapPackageDetail: { readonly id: string };
}

describe('official 70-country opening-input mapping', () => {
  it('binds the selected immutable packages without claiming a ready seed', async () => {
    const { mapping, gaps } = await buildOfficialWorldOpeningMapping(root);
    expect(mapping).toMatchObject({
      schemaVersion: 'OFFICIAL_WORLD_OPENING_MAPPING_V1',
      status: 'MAPPED_WITH_BLOCKING_GAPS',
      source: {
        packageId: 'BALANCED_2026_09_28_V1',
        checksumsSha256:
          '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315',
        checksumEntries: 86,
        verifiedArtifactsIncludingChecksumManifest: 87,
        mapPackage: {
          packageId: 'WORLD_MAP_FILES_V1_2026_09_28',
          manifestSha256:
            '9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f',
          filesVerified: 203,
        },
      },
      authority: {
        officialSelectedSourceDataset: true,
        sourceProposalLabelsPreserved: true,
        proposalRecordsExecuted: false,
        openingSeedReady: false,
        worldId: null,
        teamAssignmentsExecuted: false,
        workerStarted: false,
        productionDatabaseMutated: false,
      },
      invariants: {
        countryCount: 70,
        populationTotal: '14712146434',
        regionCount: 122,
        entityProposalCount: 350,
        commodityCount: 12,
        stockCellCount: 840,
        positiveStockCellCount: 619,
        zeroAvailableStockCellCount: 221,
        financeRowCount: 70,
        facilityCount: 1374,
        openingPortfolioFacilityProposals: 1024,
        developmentOptionFacilityProposals: 350,
        depositCount: 240,
        countrySceneCount: 70,
        balancedFrozenIllustrationSceneCount: 63,
      },
    });
    expect(mapping.mappingFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(gaps).toMatchObject({
      schemaVersion: 'OFFICIAL_WORLD_OPENING_GAPS_V1',
      status: 'BLOCKING_GAPS_PRESENT',
      mappingFingerprint: mapping.mappingFingerprint,
      openingSeedReady: false,
      rejections: [],
    });
    expect(gaps.countries).toHaveLength(70);
  }, 30_000);

  it('maps identifiers and all stock cells while leaving ownership unresolved', async () => {
    const { mapping } = await buildOfficialWorldOpeningMapping(root);
    expect(mapping.mappings.countries[0]).toMatchObject({
      sourceCountryId: 'visual-territory-01',
      coreCountryId: 'COUNTRY_01',
      name: 'Avenor',
      teamAssignment: null,
      administrationProposal: 'NPC_UNTIL_TEAM_ASSIGNED',
    });
    expect(mapping.mappings.countries[69]).toMatchObject({
      sourceCountryId: 'visual-territory-70',
      coreCountryId: 'COUNTRY_70',
    });
    expect(
      new Set(
        mapping.mappings.entityProposals.map(
          (row: EntityProposalRow) => row.role,
        ),
      ),
    ).toEqual(new Set(['GOV', 'OP', 'HOUSEHOLDS', 'BANK', 'CENTRAL-BANK']));
    expect(
      mapping.mappings.entityProposals.every(
        (row: EntityProposalRow) =>
          row.realTeamBinding === null &&
          row.authority === 'PROPOSAL_NOT_EXECUTED',
      ),
    ).toBe(true);
    expect(mapping.records.stocks).toHaveLength(840);
    expect(
      mapping.countryReports.every(
        (country) =>
          country.counts.stockCells === 12 &&
          country.sourceEntityIds.length === 5 &&
          country.warehouseIds.length === 1,
      ),
    ).toBe(true);
    expect(
      mapping.records.stocks.every(
        (stock: StockRow) =>
          stock.titleHolderId === null &&
          stock.riskBearerId === null &&
          stock.ownershipAuthority === 'REQUIRED_NOT_INFERRED',
      ),
    ).toBe(true);
    expect(mapping.records.stocks[0]).toMatchObject({
      sourceStockId: 'STOCK-01-CRUDE_OIL',
      coreCountryId: 'COUNTRY_01',
      sourceOwnerId: 'OP-01',
      sourceWarehouseId: 'WAREHOUSE-01',
      proposedInventoryLocationId: 'LOCATION_WAREHOUSE_01',
      available: '0',
      reserved: '0',
      inTransit: '0',
      total: '0',
    });
  }, 30_000);

  it('reports exact finance tails separately from unresolved economic semantics', async () => {
    const { mapping, gaps } = await buildOfficialWorldOpeningMapping(root);
    expect(mapping.invariants).toMatchObject({
      financeDepositMismatchCountries: 56,
      financeEquityMismatchCountries: 62,
      financeEconomicSemanticArithmeticMismatchCountries: 0,
      maximumAbsoluteDepositLiabilityDelta: '0.00001',
      maximumAbsoluteBankEquityDelta: '0.000017',
      financeSourceValuesCorrectedOrRounded: false,
    });
    expect(mapping.records.finance[0]).toMatchObject({
      sourceCountryId: 'visual-territory-01',
      currency: 'GCU_SCENARIO_ACCOUNTING_UNIT',
      coreSettlementCurrency: null,
      currencyAuthority: 'REQUIRED_NOT_INFERRED',
      treasuryCentralBankBoundary: 'MERGED_SOURCE_BALANCE_SPLIT_REQUIRED',
      values: {
        treasuryCentralBankBalance: '46796106931.2',
        householdBankDeposits: '17548540099.199997',
        businessBankDeposits: '5849513366.4',
        bankReserveAssets: '25737858812.16',
        bankDepositLiabilities: '23398053465.6',
        bankEquity: '2339805346.56',
      },
      reconciliation: {
        expectedDepositLiabilities: '23398053465.599997',
        depositLiabilityDelta: '0.000003',
        depositLiabilityDeltaClassification: 'FLOATING_TAIL_SOURCE_PRECISION',
        expectedBankEquity: '2339805346.560003',
        bankEquityDelta: '-0.000003',
        bankEquityDeltaClassification: 'FLOATING_TAIL_SOURCE_PRECISION',
        correctedOrRounded: false,
      },
    });
    const firstCountryGaps = gaps.countries[0];
    expect(firstCountryGaps).toBeDefined();
    const firstGapCodes = new Set(
      firstCountryGaps?.gaps.map(
        (entry: { readonly code: string }) => entry.code,
      ),
    );
    expect(firstGapCodes.has('SCENARIO_CURRENCY_CORE_BINDING_REQUIRED')).toBe(
      true,
    );
    expect(firstGapCodes.has('TREASURY_CENTRAL_BANK_SPLIT_REQUIRED')).toBe(
      true,
    );
    expect(
      firstGapCodes.has(
        'SOURCE_BANK_DEPOSIT_LIABILITY_RECONCILIATION_REQUIRED',
      ),
    ).toBe(true);
    expect(
      firstGapCodes.has('SOURCE_BANK_EQUITY_RECONCILIATION_REQUIRED'),
    ).toBe(true);
  }, 30_000);

  it('preserves proposal and display-only boundaries for mapped domain records', async () => {
    const { mapping } = await buildOfficialWorldOpeningMapping(root);
    expect(
      mapping.records.facilities.every(
        (row: FacilityRow) =>
          row.runtimeOperational === false &&
          row.executionAuthorized === false &&
          row.source.status === 'UNAPPROVED_SCENARIO_ASSET' &&
          row.mapLink.scenePointAuthority === 'DISPLAY_ONLY',
      ),
    ).toBe(true);
    expect(
      mapping.records.deposits.every(
        (row: DepositRow) =>
          row.runtimeAuthorized === false &&
          row.source.visibility === 'PUBLIC_SCENARIO_CANDIDATE',
      ),
    ).toBe(true);
    expect(
      mapping.records.waterAllocations.every(
        (row: WaterRow) =>
          row.rightsGranted === false &&
          row.source.rightsStatus === 'ALLOCATION_PROPOSAL_NOT_GRANTED',
      ),
    ).toBe(true);
    expect(mapping.records.countryScenes).toHaveLength(70);
    expect(
      mapping.records.countryScenes.every(
        (row: SceneRow) =>
          row.displayOnly &&
          row.officialMapPackageScene.id === row.sourceCountryId &&
          row.officialMapPackageDetail.id === row.sourceCountryId,
      ),
    ).toBe(true);
  }, 30_000);

  it('reproduces the committed mapping and gap artifacts byte-for-byte', async () => {
    const first = await buildOfficialWorldOpeningMapping(root);
    const second = await buildOfficialWorldOpeningMapping(root);
    expect(second).toEqual(first);

    const committedMapping = JSON.parse(
      await readFile(
        path.join(
          root,
          'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
        ),
        'utf8',
      ),
    );
    const committedGaps = JSON.parse(
      await readFile(
        path.join(
          root,
          'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_GAPS.json',
        ),
        'utf8',
      ),
    );
    expect(committedMapping).toEqual(first.mapping);
    expect(committedGaps).toEqual(first.gaps);
  }, 30_000);
});
