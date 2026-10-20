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
export interface FollowupDisplayCorrectionReview {
  readonly decision: 'APPROVED_FOR_ILLUSTRATIVE_ASSET_CANDIDATE_ONLY';
  readonly codeApproval: false;
  readonly publicationApproval: false;
  readonly exactPixelAnchorAlignment: 'NOT_PROVEN';
  readonly rows: readonly {
    readonly number: string;
    readonly sha256: string;
    readonly verdict: 'APPROVED_FOR_ILLUSTRATIVE_ASSET_CANDIDATE_ONLY';
    readonly principalLandmarksPreservedVisually: true;
    readonly requiredChanges: readonly unknown[];
  }[];
}
export interface FollowupDisplayCorrectionProof {
  readonly kind: 'VERIFIED_FOLLOWUP_DISPLAY_ASSETS_NOT_AUTHORITY';
  readonly manifest: DisplayCorrectionManifest;
  readonly review: FollowupDisplayCorrectionReview;
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
export interface DisplayCorrectionBatchPlan {
  readonly kind: 'FIXED_DISPLAY_BATCH_OUTPUT_PLAN';
  readonly targets: DisplayCorrectionPlan['targets'];
}
export interface AllDisplayCorrectionVerification extends Omit<
  DisplayCorrectionVerification,
  'correctedImages' | 'verifiedDisplayAliases'
> {
  readonly correctedImages: 13;
  readonly verifiedDisplayAliases: 13;
  readonly versions: readonly string[];
}
export const correctionVersion: string;
export const correctedCountries: readonly string[];
export const followupVersion: string;
export const followupCountries: readonly string[];
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
export function inspectFollowupCorrectionRecords(
  manifestBytes: Buffer,
  reviewBytes: Buffer,
  originalManifestBytes: Buffer,
  uiManifestBytes: Buffer,
): {
  manifest: DisplayCorrectionManifest;
  review: FollowupDisplayCorrectionReview;
};
export function loadFollowupDisplayCorrections(): Promise<FollowupDisplayCorrectionProof>;
export function preflightDisplayCorrectionPublication(
  proof: DisplayCorrectionProof | FollowupDisplayCorrectionProof,
  aliases: ReadonlyMap<string, Buffer>,
): DisplayCorrectionPlan;
export function preflightAllDisplayCorrectionPublication(
  baseProof: DisplayCorrectionProof,
  followupProof: FollowupDisplayCorrectionProof,
  aliases: ReadonlyMap<string, Buffer>,
): DisplayCorrectionBatchPlan;
export function publishDisplayCorrections(): Promise<DisplayCorrectionVerification>;
export function verifyBuiltDisplayCorrections(): Promise<DisplayCorrectionVerification>;
export function publishAllDisplayCorrections(): Promise<AllDisplayCorrectionVerification>;
export function verifyAllBuiltDisplayCorrections(): Promise<AllDisplayCorrectionVerification>;
