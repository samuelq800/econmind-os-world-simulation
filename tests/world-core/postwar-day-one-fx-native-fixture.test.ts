/** Artifact/opt-in guards only. Even the real artifact hash case performs no
 * seed JSON parse, SQL, Docker, bootstrap, source admission or FX transaction. */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  inspectPostwarDayOneFxArtifacts,
  createPostwarDayOneFxNativeFixture,
  POSTWAR_DAY_ONE_FX_PINS,
} from '../support/postwar-day-one-fx-native-fixture.js';

describe('fresh cfc FX native fixture guards', () => {
  it('rejects explicit native construction without the independent native opt-in before any PG work', async () => {
    vi.stubEnv('ECONMIND_POSTWAR_DAY_ONE_FX_NATIVE', '');
    try {
      await expect(
        createPostwarDayOneFxNativeFixture({
          repositoryRoot: process.cwd(),
          evidenceDirectory: '/workspace/.cloud-setup/evidence/fx-cfc-guard',
          environment: 'ci',
        }),
      ).rejects.toThrow('EXPLICIT_LOCAL_NATIVE_OPT_IN_REQUIRED');
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('rejects old-world or asserted metadata before reading a seed as authority', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'fx-artifact-guard-'),
    );
    try {
      await Promise.all([
        writeFile(
          path.join(directory, 'receipt.json'),
          JSON.stringify({
            seedFingerprint: 'sha256:' + 'c427'.padEnd(64, '0'),
            status: 'PASS',
          }),
        ),
        writeFile(
          path.join(directory, 'actual-bank-ledger-verification.json'),
          JSON.stringify({ status: 'PASS', countries: Array(70).fill({}) }),
        ),
        writeFile(path.join(directory, 'final-seed.json'), '{}'),
      ]);
      await expect(inspectPostwarDayOneFxArtifacts(directory)).rejects.toThrow(
        'EXACT_NEW_WORLD_ARTIFACTS_REQUIRED',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.skipIf(process.env.ECONMIND_POSTWAR_DAY_ONE_FX_ARTIFACT_TESTS !== '1')(
    'streams the actual existing new-World seed once and verifies its exact cfc/file/fourth-source pins (not native acceptance)',
    async () => {
      const actual = await inspectPostwarDayOneFxArtifacts();
      expect(actual.seedFileSHA256).toBe(
        POSTWAR_DAY_ONE_FX_PINS.seedFileSHA256,
      );
      expect(actual.seedFingerprint).toBe(
        POSTWAR_DAY_ONE_FX_PINS.seedFingerprint,
      );
      expect(actual.worldId).toBe(POSTWAR_DAY_ONE_FX_PINS.worldId);
      expect(actual.sourceId).toBe(POSTWAR_DAY_ONE_FX_PINS.sourceId);
      expect(actual.sourcePayloadHash).toBe(
        POSTWAR_DAY_ONE_FX_PINS.sourcePayloadHash,
      );
      expect(BigInt(actual.seedBytes)).toBeGreaterThan(100n * 1024n * 1024n);
      expect(actual.classification).toBe(
        'OFFLINE_ARTIFACT_HASH_ONLY_NOT_NATIVE_ACCEPTANCE',
      );
    },
  );
});
