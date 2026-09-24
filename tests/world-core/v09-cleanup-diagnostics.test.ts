import { describe, expect, it } from 'vitest';

import {
  cleanupMarkedBoundary,
  hasNoExternalDependents,
} from '../../scripts/v09-staging-evidence-runner.mjs';

const approval = {
  admin_database_role: 'postgres',
  disposable_namespace: 'world_v2',
  roles: {
    migration_owner: 'v09_staging_migration_owner',
    reader: 'v09_staging_reader',
    worker: 'v09_staging_worker',
  },
  target_fingerprint: 'a'.repeat(64),
};

function evidence() {
  return {
    cleanup: { markerBound: true, status: 'NOT_ATTEMPTED' },
    marker: {
      run_id: 'RUN.DISPOSABLE.CLEANUP.1',
      target_fingerprint: approval.target_fingerprint,
    },
  };
}

describe('V09 disposable cleanup diagnostics', () => {
  it('requires an exact zero integer count of external dependents', () => {
    expect(hasNoExternalDependents([{ dependent_count: 0 }])).toBe(true);
    expect(hasNoExternalDependents([{ dependent_count: 1 }])).toBe(false);
    expect(hasNoExternalDependents([{ dependent_count: '0' }])).toBe(false);
    expect(hasNoExternalDependents([])).toBe(false);
  });

  it('captures the first SQL checkpoint and SQLSTATE without storing an error message', async () => {
    const output = evidence();
    const client = {
      execute: async ({ step }: { step: string }) => {
        if (step === 'CLEANUP_VERIFY_CONNECTED_ADMIN') {
          return { rows: [{ current_user: 'postgres' }] };
        }
        if (step === 'CLEANUP_VERIFY_MARKER') {
          const error = Object.assign(
            new Error('sensitive-message-must-not-escape'),
            { code: '42P01' },
          );
          throw error;
        }
        return { rows: [] };
      },
    };

    await expect(
      cleanupMarkedBoundary(client, approval, output, {
        captureDiagnostic: true,
      }),
    ).rejects.toMatchObject({ stage: 'CLEANUP_INCOMPLETE' });

    expect(output.cleanup).toMatchObject({
      diagnostic: {
        checkpoint_id: 'CLEANUP_VERIFY_MARKER',
        error_kind: 'SQL',
        sqlstate: '42P01',
        status: 'CAPTURED',
      },
      status: 'CLEANUP_INCOMPLETE',
    });
    expect(JSON.stringify(output)).not.toContain(
      'sensitive-message-must-not-escape',
    );
  });

  it('captures the first failed cleanup assertion and remains fail-closed', async () => {
    const output = evidence();
    const client = {
      execute: async ({ step }: { step: string }) => {
        if (step === 'CLEANUP_VERIFY_CONNECTED_ADMIN') {
          return { rows: [{ current_user: 'postgres' }] };
        }
        if (step === 'CLEANUP_VERIFY_MARKER') return { rows: [] };
        return { rows: [] };
      },
    };

    await expect(
      cleanupMarkedBoundary(client, approval, output, {
        captureDiagnostic: true,
      }),
    ).rejects.toMatchObject({ stage: 'CLEANUP_INCOMPLETE' });

    expect(output.cleanup).toMatchObject({
      diagnostic: {
        checkpoint_id: 'CLEANUP_ASSERT_MARKER_BOUND',
        error_kind: 'ASSERTION',
        sqlstate: null,
        status: 'CAPTURED',
      },
      status: 'CLEANUP_INCOMPLETE',
    });
  });
});
