import { sha256Canonical } from './canonical.js';
import type { CalibrationPackage } from './types.js';

export type CalibrationPackageInput = Omit<CalibrationPackage, 'contentHash'>;

export function buildCalibrationPackage(
  input: CalibrationPackageInput,
): CalibrationPackage {
  const canonicalInput = {
    ...input,
    sourceSnapshotSet: [...input.sourceSnapshotSet].sort(),
    transformationVersions: [...input.transformationVersions].sort(),
  };
  return Object.freeze({
    ...canonicalInput,
    contentHash: sha256Canonical(canonicalInput),
  });
}

export function verifyCalibrationPackage(
  packageValue: CalibrationPackage,
): boolean {
  const { contentHash, ...input } = packageValue;
  return buildCalibrationPackage(input).contentHash === contentHash;
}
