import type { OfficialMapPublication } from './official-map-publication-index.mjs';
export interface OfficialMapBuildResult {
  status: 'PASS';
  files: number;
  images: number;
  support: number;
  countries: number;
  countryAssociatedFiles: number;
  totalBytes: number;
  liveWorldState: false;
  deploymentVerified: false;
}
export function verifyOfficialMapOutput(
  index: OfficialMapPublication,
  outputRoot: string,
): Promise<OfficialMapBuildResult>;
export function publishOfficialMapSources(
  root?: string,
  outputRoot?: string,
): Promise<
  OfficialMapBuildResult & {
    staticOutputFiles: number;
    staticOutputBytes: number;
    staticOutputBudgetBytes: number;
    staticOutputRemainingBytes: number;
  }
>;
export function measureStaticOutput(
  outputRoot: string,
): Promise<{ staticOutputFiles: number; staticOutputBytes: number }>;
export function assertStaticOutputBudget(measurement: {
  staticOutputBytes: number;
}): { staticOutputBudgetBytes: number; staticOutputRemainingBytes: number };
