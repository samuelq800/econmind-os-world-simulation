export interface DisplayCorrectionEntry {
  readonly number: string;
  readonly sourcePath: string;
  readonly displayPath: string;
  readonly legacyAlias: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly original: {
    readonly sourcePath: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly publicUrl: string;
  };
}
export interface DisplayCorrectionManifest {
  readonly schemaVersion: 'COUNTRY_SCENE_DISPLAY_CORRECTION_V1';
  readonly version: string;
  readonly entries: readonly DisplayCorrectionEntry[];
}
export interface DisplayCorrectionReview {
  readonly exactPixelAnchorAlignment: 'NOT_PROVEN';
  readonly rows: readonly {
    readonly number: string;
    readonly sha256: string;
    readonly subjectIds: readonly string[];
  }[];
}
export interface DisplayCorrectionProof {
  readonly kind: 'VERIFIED_DISPLAY_ASSETS_NOT_AUTHORITY';
  readonly manifest: DisplayCorrectionManifest;
  readonly review: DisplayCorrectionReview;
}
export interface DisplayCorrectionPlan {
  readonly kind: 'FIXED_DISPLAY_OUTPUT_PLAN';
  readonly targets: readonly {
    readonly relativePath: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly number: string | null;
  }[];
}
export interface DisplayCorrectionVerification {
  readonly status: 'PASS';
  readonly correctedImages: 8;
  readonly verifiedDisplayAliases: 8;
  readonly originalSourcesModified: false;
  readonly deploymentVerified: false;
  readonly exactPixelAnchorAlignment: 'NOT_PROVEN';
}
export const correctionVersion: string;
export const correctedCountries: readonly string[];
export function displaySha256(bytes: string | Uint8Array): string;
export function verifyCorrectionPng(
  bytes: Buffer,
  entry: Pick<DisplayCorrectionEntry, 'bytes' | 'sha256' | 'width' | 'height'>,
): void;
export function inspectCorrectionRecords(
  manifestBytes: Buffer,
  reviewBytes: Buffer,
  originalManifestBytes: Buffer,
  uiManifestBytes: Buffer,
): { manifest: DisplayCorrectionManifest; review: DisplayCorrectionReview };
export function loadDisplayCorrections(): Promise<DisplayCorrectionProof>;
export function preflightDisplayCorrectionPublication(
  proof: DisplayCorrectionProof,
  aliases: ReadonlyMap<string, Buffer>,
): DisplayCorrectionPlan;
export function publishDisplayCorrections(): Promise<DisplayCorrectionVerification>;
export function verifyBuiltDisplayCorrections(): Promise<DisplayCorrectionVerification>;
