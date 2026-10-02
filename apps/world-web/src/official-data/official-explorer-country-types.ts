/** Browser display contracts only. These are not authorized live projections,
 * Posting inputs, OpeningSeeds or authoritative economic arithmetic types. */
export type OfficialPoint = readonly [number, number];
export type OfficialBox = readonly [number, number, number, number];
export type OfficialRecord = Readonly<Record<string, unknown>>;

export interface OfficialExplorerFacility {
  readonly id: string;
  readonly countryId: string;
  readonly name: string;
  readonly kind: string;
  readonly point: OfficialPoint;
  readonly anchor: OfficialPoint | null;
  readonly projectId: string | null;
  readonly projectNumber: number | null;
  readonly resourceId?: string | null;
  readonly record: {
    readonly id: string;
    readonly countryId: string;
    readonly name: string;
    readonly projectId: string | null;
    readonly lifecycle: string;
    readonly operational: boolean;
    readonly estimatedCapacity: number;
    readonly capacityUnit: string;
    readonly requiredWorkers: number;
    readonly requiredPowerMW: number;
    readonly requiredWaterM3Day: number;
    readonly maintenanceGcuDay: number;
    readonly equipmentUnits: number;
    readonly constructionSimDays: number;
    readonly recipeStatus: string;
    readonly scenarioRole: string;
    readonly openingAvailabilityProposal: boolean;
    readonly sourceStatus: string;
  };
}

export interface OfficialExplorerResource {
  readonly id: string;
  readonly countryId: string;
  readonly kind: string;
  readonly point: OfficialPoint;
  readonly commodityId: string;
  readonly visibility: string;
  readonly tradable: false;
  readonly type: {
    readonly id: string;
    readonly name: string;
    readonly symbol: string;
    readonly color: string;
    readonly [key: string]: unknown;
  };
  readonly deposit: {
    readonly id: string;
    readonly countryId: string;
    readonly regionId: string;
    readonly commodityId: string;
    readonly unit: string;
    readonly point: OfficialPoint;
    readonly initialGeological: number;
    readonly historicalConsumed: number;
    readonly cumulativeExtracted: number;
    readonly remainingGeological: number;
    readonly discoveredRemaining: number;
    readonly recoverableRemaining: number;
    readonly developedRemaining: number;
    readonly qualityProxy: number;
    readonly depthM: number;
    readonly developmentDifficulty: number;
    readonly extractionCapacityPerDay: number;
    readonly runtimeExtractionPerDay: number;
    readonly [key: string]: unknown;
  };
}

export interface OfficialExplorerRegion {
  readonly id: string;
  readonly countryId: string;
  readonly label: OfficialPoint;
  readonly areaKm2: number;
  readonly landUseKm2: Readonly<Record<string, number>>;
  readonly natural: OfficialRecord;
  readonly initial: {
    readonly population: number;
    readonly labourForce: number;
    readonly workingAge: number;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

export interface OfficialExplorerProfile extends OfficialRecord {
  readonly countryId: string;
  readonly bindingStatus: 'OPENING_SEED_NOT_COMMITTED';
  readonly population: number;
  readonly labourForce: number;
  readonly scenarioEmployed: number;
  readonly scenarioUnemployed: number;
  readonly foodProductionTonnesDay: number;
  readonly foodDemandTonnesDay: number;
  readonly foodAvailableStockTonnes: number;
  readonly foodReservedTonnes: number;
  readonly foodInTransitTonnes: number;
  readonly dailyIncomeGcu: number;
  readonly treasuryCentralBankBalanceGcu: number;
  readonly bankDepositsGcu: number;
  readonly bankReservesGcu: number;
  readonly bankLoansGcu: number;
  readonly bankEquityGcu: number;
  readonly historicalDebtGcu: number;
}

/** C owns generation of this additive, exact-token provenance contract. */
export interface OfficialExplorerFieldProvenance extends OfficialRecord {
  readonly schemaVersion: 'OFFICIAL_UI_FIELD_PROVENANCE_V1';
  readonly sourcePackageId: string;
  readonly sourceChecksumsSha256: string;
  readonly authority: 'SELECTED_SOURCE_NOT_RUNTIME';
  readonly datasets: Readonly<
    Record<string, { readonly sourcePath: string; readonly sha256: string }>
  >;
  readonly fields: Readonly<
    Record<
      string,
      {
        readonly exact: string;
        readonly rawToken: string;
        readonly dataset: string;
        readonly rowId: string;
        readonly rowIndex: number;
        readonly field: string;
        readonly sourcePointer: string;
        readonly unit: string;
        readonly unitBasis: string;
        readonly nature: string;
      }
    >
  >;
  readonly collections: Readonly<Record<string, OfficialRecord>>;
}

export interface OfficialExplorerCountryPayload {
  readonly id: string;
  readonly number: string;
  readonly name: string;
  readonly color: string;
  readonly coastal: boolean;
  readonly areaKm2: number;
  readonly neighbours: readonly string[];
  readonly climateMix: readonly OfficialRecord[];
  readonly scene: string;
  readonly detail: string;
  readonly viewBox: OfficialBox;
  readonly frame: OfficialBox;
  readonly profile: OfficialExplorerProfile;
  readonly facilities: readonly OfficialExplorerFacility[];
  readonly resources: readonly OfficialExplorerResource[];
  readonly regions: readonly OfficialExplorerRegion[];
  readonly power: OfficialRecord;
  readonly sourceStatus: 'OFFICIAL_SELECTED_OPENING_DATA_NOT_RUNTIME_STATE';
  readonly officialOpening: {
    readonly sourcePackageId: string;
    readonly countriesSha256: string;
    readonly worldId: null;
    readonly openingSeedCommitted: false;
    readonly finance: OfficialRecord;
    readonly employment: OfficialRecord;
    readonly stocks: readonly OfficialRecord[];
    readonly productionPlans: readonly OfficialRecord[];
    readonly populationServices: readonly OfficialRecord[];
  };
  // Absent in the original generated baseline; never synthesize exact tokens.
  readonly officialSource?: OfficialExplorerFieldProvenance;
  readonly [key: string]: unknown;
}

export interface OfficialExplorerCountry extends OfficialExplorerCountryPayload {
  readonly population: number;
  readonly source: {
    readonly kind: 'selected-source-display';
    readonly packageId: string;
    readonly countriesSha256: string;
    readonly selectionChecksumSha256: string;
    readonly countryFileSha256: string;
    readonly liveWorldState: false;
    readonly proposalFieldsAreExecuted: false;
    readonly worldId: null;
    readonly openingSeedCommitted: false;
  };
}

export type OfficialExplorerCountryLoadResult =
  | { readonly kind: 'ready'; readonly data: OfficialExplorerCountry }
  | { readonly kind: 'missing'; readonly reason: 'COUNTRY_FILE_MISSING' }
  | { readonly kind: 'stale'; readonly reason: 'READ_ABORTED' }
  | {
      readonly kind: 'error';
      readonly reason:
        | 'COUNTRY_ID_INVALID'
        | 'BASE_URL_INVALID'
        | 'SOURCE_UNAVAILABLE'
        | 'SOURCE_TOO_LARGE'
        | 'SOURCE_HASH_MISMATCH'
        | 'SOURCE_INVALID'
        | 'READ_TIMEOUT'
        | 'CRYPTO_UNAVAILABLE';
    };
export type OfficialExplorerCountryLoadState =
  | OfficialExplorerCountryLoadResult
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' };
