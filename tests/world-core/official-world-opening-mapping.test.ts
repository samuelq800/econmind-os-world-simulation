import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildOfficialWorldOpeningMapping,
  resolveOfficialWorldSourceBindings,
  serializeOfficialWorldArtifact,
} from '../../scripts/official-world-opening-mapping.mjs';

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

interface CompleteDatasetRow {
  readonly dataset: string;
  readonly sourceRecordCount: number;
  readonly structuredMappingStatus: string;
  readonly records: readonly DatasetRecord[];
}

interface DatasetRecord {
  readonly countryBindings: readonly {
    readonly sourceCountryId: string;
    readonly coreCountryId: string;
  }[];
  readonly regionBindings: readonly {
    readonly sourceRegionId: string;
    readonly normalizedRegionId: string;
  }[];
  readonly source: Record<string, unknown>;
}

interface CoverageCountryRow {
  readonly sourceCountryId: string;
  readonly structuredDatasets: readonly string[];
  readonly structuredDatasetCount: number;
  readonly versionedMapAssetCount: number;
}

describe('official 70-country opening-input mapping', () => {
  it('binds the selected immutable packages without claiming a ready seed', async () => {
    const { mapping, gaps, coverage } =
      await buildOfficialWorldOpeningMapping(root);
    expect(mapping).toMatchObject({
      schemaVersion: 'OFFICIAL_WORLD_OPENING_MAPPING_V2',
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
        completeStructuredDatasetCount: 34,
        candidateArtifactsEnumerated: 87,
        mapPackageFilesEnumerated: 203,
        countryAssociatedMapAssets: 140,
        globalMapPackageAssets: 63,
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
    expect(coverage).toMatchObject({
      schemaVersion: 'OFFICIAL_WORLD_COMPLETE_COVERAGE_V1',
      status: 'COMPLETE_SOURCE_SIDE_COVERAGE_WITH_CONNECTION_GAPS',
      mappingFingerprint: mapping.mappingFingerprint,
      gapsFingerprint: gaps.gapsFingerprint,
      counts: {
        checksumManifestEntries: 86,
        sourceArtifactsIncludingChecksumManifest: 87,
        structuredJsonDatasets: 34,
        mapPackageFiles: 203,
        countryAssociatedMapAssets: 140,
        globalMapPackageFiles: 63,
        countries: 70,
        omittedSourceArtifacts: 0,
        omittedStructuredDatasets: 0,
        omittedMapPackageFiles: 0,
      },
      omissions: {
        sourceArtifacts: [],
        structuredDatasets: [],
        mapPackageFiles: [],
      },
    });
    expect(coverage.coverageFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
  }, 30_000);

  it('includes every structured official dataset and all 203 versioned map-package files', async () => {
    const { mapping, coverage } = await buildOfficialWorldOpeningMapping(root);
    const datasets = new Map<string, CompleteDatasetRow>(
      mapping.records.allOfficialDatasets.map((dataset: CompleteDatasetRow) => [
        dataset.dataset,
        dataset,
      ]),
    );
    expect([...datasets.keys()].sort()).toEqual(
      [
        'assumptions',
        'changes',
        'commodity-catalog',
        'countries',
        'coverage',
        'deposits',
        'domestic-access',
        'employment',
        'entities',
        'facilities',
        'facility-map-links',
        'finance',
        'geography',
        'hazard-proposals',
        'illustration-links',
        'land-program',
        'license-proposals',
        'manifest',
        'nodes',
        'opening-material-reconciliation',
        'population-services',
        'power',
        'production-plans',
        'recipes',
        'regions',
        'seasonal-water',
        'settlements',
        'stocks',
        'supplier-concentration-policy',
        'technology-proposals',
        'trade-plans',
        'transit-proposals',
        'transport-routes',
        'water-allocations',
      ].sort(),
    );
    expect(datasets.get('settlements')?.sourceRecordCount).toBe(244);
    expect(datasets.get('domestic-access')?.sourceRecordCount).toBe(1304);
    expect(datasets.get('production-plans')?.sourceRecordCount).toBe(840);
    expect(datasets.get('recipes')?.sourceRecordCount).toBe(12);
    expect(datasets.get('trade-plans')?.sourceRecordCount).toBe(641);
    expect(datasets.get('transport-routes')?.sourceRecordCount).toBe(564);
    expect(datasets.get('hazard-proposals')?.sourceRecordCount).toBe(366);
    expect(datasets.get('technology-proposals')?.sourceRecordCount).toBe(98);
    expect(datasets.get('license-proposals')?.sourceRecordCount).toBe(234);
    expect(datasets.get('transit-proposals')?.sourceRecordCount).toBe(153);
    expect(
      [...datasets.values()].every(
        (dataset) =>
          dataset.structuredMappingStatus ===
            'FULL_SOURCE_RECORDS_INCLUDED_LOSSLESS' &&
          dataset.records.length === dataset.sourceRecordCount,
      ),
    ).toBe(true);

    const seasonalWater = datasets.get('seasonal-water');
    const changes = datasets.get('changes');
    expect(seasonalWater?.records).toHaveLength(122);
    expect(changes?.records).toHaveLength(130);
    expect(
      seasonalWater?.records.every(
        (record) =>
          record.countryBindings.length === 1 &&
          record.regionBindings.length === 1,
      ),
    ).toBe(true);
    expect(
      changes?.records.every(
        (record) =>
          record.countryBindings.length === 1 &&
          record.regionBindings.length === 1,
      ),
    ).toBe(true);

    const regionsByCountry = new Map<string, Set<string>>();
    for (const region of mapping.mappings.regions) {
      const regionIds =
        regionsByCountry.get(region.sourceCountryId) ?? new Set();
      regionIds.add(region.sourceRegionId);
      regionsByCountry.set(region.sourceCountryId, regionIds);
    }
    for (const country of coverage.countries as readonly CoverageCountryRow[]) {
      expect(country.structuredDatasets).toContain('seasonal-water');
      expect(country.structuredDatasets).toContain('changes');
      const expectedRegionIds = regionsByCountry.get(country.sourceCountryId);
      expect(expectedRegionIds).toBeDefined();
      const countrySeasonalRows = seasonalWater?.records.filter((record) =>
        record.countryBindings.some(
          (binding) => binding.sourceCountryId === country.sourceCountryId,
        ),
      );
      expect(countrySeasonalRows).toHaveLength(expectedRegionIds?.size ?? 0);
      expect(
        countrySeasonalRows?.every((record) =>
          record.regionBindings.every((binding) =>
            expectedRegionIds?.has(binding.sourceRegionId),
          ),
        ),
      ).toBe(true);
    }
    expect(coverage.sourceArtifacts).toHaveLength(87);
    expect(coverage.mapAssets).toHaveLength(203);
    expect(
      coverage.countries.every(
        (country: CoverageCountryRow) =>
          country.structuredDatasetCount > 0 &&
          country.versionedMapAssetCount === 2,
      ),
    ).toBe(true);
    expect(coverage.productionPreservationEvidence).toMatchObject({
      immutableSourceArtifacts: '87',
      immutableStorageRows: '278',
      mapFileDatabaseStorageClaim: 'NONE',
      productionWritesInReadback: '0',
    });
  }, 30_000);

  it('derives region-only country bindings and rejects unknown or conflicting references', () => {
    const countries = [
      { id: 'visual-territory-01' },
      { id: 'visual-territory-02' },
    ];
    const regions = [
      {
        id: 'visual-territory-01-E1',
        countryId: 'visual-territory-01',
      },
      {
        id: 'visual-territory-02-E1',
        countryId: 'visual-territory-02',
      },
    ];

    expect(
      resolveOfficialWorldSourceBindings(
        { objectId: 'visual-territory-01-E1' },
        countries,
        regions,
        'region-only change',
      ),
    ).toEqual({
      countryBindings: [
        {
          sourceCountryId: 'visual-territory-01',
          coreCountryId: 'COUNTRY_01',
        },
      ],
      regionBindings: [
        {
          sourceRegionId: 'visual-territory-01-E1',
          normalizedRegionId: 'REGION_01_E1',
        },
      ],
    });
    expect(
      resolveOfficialWorldSourceBindings(
        { scope: 'WORLD_LEVEL_NO_COUNTRY_REFERENCE' },
        countries,
        regions,
      ),
    ).toEqual({ countryBindings: [], regionBindings: [] });
    expect(() =>
      resolveOfficialWorldSourceBindings(
        { regionId: 'visual-territory-01-E9' },
        countries,
        regions,
        'unknown region',
      ),
    ).toThrow(
      /OFFICIAL_WORLD_UNKNOWN_REFERENCE:unknown region region binding/u,
    );
    expect(() =>
      resolveOfficialWorldSourceBindings(
        {
          countryId: 'visual-territory-02',
          regionId: 'visual-territory-01-E1',
        },
        countries,
        regions,
        'conflicting country and region',
      ),
    ).toThrow(
      /OFFICIAL_WORLD_COUNTRY_REGION_REFERENCE_CONFLICT:conflicting country and region/u,
    );
  });

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

    const mappingPath = path.join(
      root,
      'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
    );
    const gapsPath = path.join(
      root,
      'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_GAPS.json',
    );
    const coveragePath = path.join(
      root,
      'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
    );
    const [mappingText, gapsText, coverageText] = await Promise.all([
      readFile(mappingPath, 'utf8'),
      readFile(gapsPath, 'utf8'),
      readFile(coveragePath, 'utf8'),
    ]);
    expect(JSON.parse(mappingText)).toEqual(first.mapping);
    expect(JSON.parse(gapsText)).toEqual(first.gaps);
    expect(JSON.parse(coverageText)).toEqual(first.coverage);
    expect(mappingText).toBe(
      await serializeOfficialWorldArtifact(mappingPath, first.mapping),
    );
    expect(gapsText).toBe(
      await serializeOfficialWorldArtifact(gapsPath, first.gaps),
    );
    expect(coverageText).toBe(
      await serializeOfficialWorldArtifact(coveragePath, first.coverage),
    );
  }, 60_000);
});
