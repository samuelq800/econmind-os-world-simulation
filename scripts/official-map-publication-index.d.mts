export interface OfficialMapFile {
  readonly sourcePath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly publicUrl: string;
  readonly publicationPath: string;
  readonly countryNumber: string | null;
  readonly sourceCountryId: string | null;
  readonly coreCountryId: string | null;
  readonly classification:
    'COUNTRY_SCENE' | 'COUNTRY_DETAIL' | 'GLOBAL_OR_SUPPORT';
  readonly kind: 'IMAGE' | 'SUPPORT';
  readonly fileType: string;
  readonly nature: 'OFFICIAL_VERSIONED_SOURCE_FILE_NOT_LIVE';
  readonly thirdPartyRights: 'UNKNOWN';
  readonly coordinates: null;
  readonly coordinateStatus: 'NOT_PROJECTED_SOURCE_FILE_ONLY';
}
export interface OfficialMapPublication {
  readonly schemaVersion: 'OFFICIAL_MAP_PUBLICATION_V1';
  readonly packageId: string;
  readonly authority: string;
  readonly selectionPath: string;
  readonly selectionSha256: string;
  readonly manifestPath: string;
  readonly manifestSha256: string;
  readonly urlBase: string;
  readonly immutableIndexUrl: string;
  readonly publicationState: string;
  readonly liveWorldState: false;
  readonly proposalFieldsAreExecuted: false;
  readonly sourceFilesModified: false;
  readonly publicationAuthority: 'OWNER_SELECTED_SOURCE_FILES_ONLY';
  readonly thirdPartyRights: 'UNKNOWN';
  readonly thirdPartyRightsProofProvided: false;
  readonly supportFilesExecuted: false;
  readonly counts: {
    readonly files: number;
    readonly images: number;
    readonly support: number;
    readonly countries: number;
    readonly countryAssociatedFiles: number;
    readonly totalBytes: number;
  };
  readonly files: readonly OfficialMapFile[];
}
export const repositoryRoot: string;
export const publicationDirectory: string;
export function sha256(bytes: string | Uint8Array): string;
export function readVerifiedSource(
  root: string,
  entry: OfficialMapFile,
): Promise<Buffer>;
export function loadOfficialMapPublication(
  root?: string,
): Promise<OfficialMapPublication>;
export function findOfficialMapSource(
  index: OfficialMapPublication,
  sourcePath: string,
): OfficialMapFile;
export function resolveOfficialMapPublicUrl(
  index: OfficialMapPublication,
  sourcePath: string,
  siteBase: string,
): string;
export function serializeOfficialMapIndex(
  index: OfficialMapPublication,
): string;
export function renderOfficialMapDirectory(
  index: OfficialMapPublication,
): string;
