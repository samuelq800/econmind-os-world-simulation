import { describe, expect, it } from 'vitest';

import {
  measureV30ReportedRecovery,
  type V30RecoveryMeasurementInput,
} from '../../tools/v30/recovery-measurement-preparation.js';

const input: V30RecoveryMeasurementInput = {
  target: 'DISPOSABLE_NON_PRODUCTION',
  codeSha: 'a'.repeat(40),
  backupId: 'backup-drill-01',
  recoveryPointAt: '2026-09-24T10:00:00.000Z',
  latestCommittedAt: '2026-09-24T10:04:00.000Z',
  incidentAt: '2026-09-24T10:05:00.000Z',
  serviceRecoveredAt: '2026-09-24T10:12:00.000Z',
  latestCommittedWorldVersion: '9007199254740993',
  restoredWorldVersion: '9007199254740990',
};

describe('V30.3 unverified recovery measurement preparation', () => {
  it('computes exact time and version gaps without returning PASS', () => {
    expect(measureV30ReportedRecovery(input)).toEqual({
      status: 'CALLER_REPORTED_NOT_VERIFIED',
      codeSha: input.codeSha,
      backupId: input.backupId,
      rpoMs: 300_000,
      rtoMs: 420_000,
      lostCommittedWorldVersions: '3',
    });
  });

  it('rejects production targets, missing identity and invalid timestamps', () => {
    expect(() =>
      measureV30ReportedRecovery({ ...input, target: 'PRODUCTION' } as never),
    ).toThrow();
    expect(() =>
      measureV30ReportedRecovery({ ...input, codeSha: 'moving-main' }),
    ).toThrow();
    expect(() =>
      measureV30ReportedRecovery({ ...input, backupId: 'secret/path' }),
    ).toThrow();
    expect(() =>
      measureV30ReportedRecovery({
        ...input,
        incidentAt: '2026-09-24T10:05:00Z',
      }),
    ).toThrow();
    expect(() =>
      measureV30ReportedRecovery({
        ...input,
        incidentAt: '2026-02-30T10:05:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects contradictory chronology or WorldVersion evidence', () => {
    expect(() =>
      measureV30ReportedRecovery({
        ...input,
        recoveryPointAt: '2026-09-24T10:05:01.000Z',
      }),
    ).toThrow();
    expect(() =>
      measureV30ReportedRecovery({
        ...input,
        serviceRecoveredAt: '2026-09-24T10:04:59.999Z',
      }),
    ).toThrow();
    expect(() =>
      measureV30ReportedRecovery({
        ...input,
        restoredWorldVersion: '9007199254740994',
      }),
    ).toThrow();
    expect(() =>
      measureV30ReportedRecovery({ ...input, restoredWorldVersion: '01' }),
    ).toThrow();
  });
});
