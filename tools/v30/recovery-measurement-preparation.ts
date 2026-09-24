/** V30.3 preparation only: arithmetic over unverified, caller-supplied drill facts. */

export interface V30RecoveryMeasurementInput {
  readonly target: 'DISPOSABLE_NON_PRODUCTION';
  readonly codeSha: string;
  readonly backupId: string;
  readonly incidentAt: string;
  readonly latestCommittedAt: string;
  readonly recoveryPointAt: string;
  readonly serviceRecoveredAt: string;
  readonly latestCommittedWorldVersion: string;
  readonly restoredWorldVersion: string;
}

export interface V30RecoveryMeasurement {
  readonly status: 'CALLER_REPORTED_NOT_VERIFIED';
  readonly codeSha: string;
  readonly backupId: string;
  readonly rpoMs: number;
  readonly rtoMs: number;
  readonly lostCommittedWorldVersions: string;
}

const HEX_SHA = /^[0-9a-f]{40}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function utcMilliseconds(value: string): number {
  if (!UTC_INSTANT.test(value)) {
    throw new Error('V30 recovery times must be canonical UTC instants');
  }
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error('V30 recovery time is invalid');
  }
  return milliseconds;
}

/** This cannot establish that a backup was restored or that its state is valid. */
export function measureV30ReportedRecovery(
  input: V30RecoveryMeasurementInput,
): V30RecoveryMeasurement {
  if (
    input.target !== 'DISPOSABLE_NON_PRODUCTION' ||
    !HEX_SHA.test(input.codeSha) ||
    typeof input.backupId !== 'string' ||
    input.backupId.length < 1 ||
    input.backupId.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(input.backupId) ||
    !DECIMAL.test(input.latestCommittedWorldVersion) ||
    !DECIMAL.test(input.restoredWorldVersion)
  ) {
    throw new Error('Invalid V30 recovery identity or WorldVersion evidence');
  }
  const incident = utcMilliseconds(input.incidentAt);
  const committed = utcMilliseconds(input.latestCommittedAt);
  const recoveryPoint = utcMilliseconds(input.recoveryPointAt);
  const recovered = utcMilliseconds(input.serviceRecoveredAt);
  const latestVersion = BigInt(input.latestCommittedWorldVersion);
  const restoredVersion = BigInt(input.restoredWorldVersion);
  if (
    recoveryPoint > committed ||
    committed > incident ||
    recovered < incident ||
    restoredVersion > latestVersion
  ) {
    throw new Error('Contradictory V30 recovery chronology or WorldVersion');
  }
  return {
    status: 'CALLER_REPORTED_NOT_VERIFIED',
    codeSha: input.codeSha,
    backupId: input.backupId,
    rpoMs: incident - recoveryPoint,
    rtoMs: recovered - incident,
    lostCommittedWorldVersions: (latestVersion - restoredVersion).toString(),
  };
}
