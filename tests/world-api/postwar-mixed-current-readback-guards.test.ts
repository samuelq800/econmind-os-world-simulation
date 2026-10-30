/** Fixture safety only. These tests never construct/open PostgreSQL or claim
 * that data registration, publication, JWT SQL or native readback has run. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpeningSeed } from '@econmind/core';
import {
  deriveCfcMixedCurrentReadData,
  installCfcMixedCurrentReadbackFrom,
} from '../support/postwar-mixed-current-native-readback.js';
afterEach(() => vi.unstubAllEnvs());
describe('current readback fixture explicit invocation boundary', () => {
  it('requires the actual Core-validated cfc seed, not a seed-shaped object', () => {
    expect(() =>
      deriveCfcMixedCurrentReadData({
        seed: {} as OpeningSeed,
        admissionRef: 'TEST_ONLY',
        canonicalSeedSHA256: 'a'.repeat(64),
      }),
    ).toThrow('ACTUAL_GENUINE_CFC_SEED_REQUIRED');
  });
  it.each(['0', '1'])(
    'does not touch any database from unissued source data even with opt-in %s',
    async (optIn) => {
      vi.stubEnv('ECONMIND_POSTWAR_MIXED_CURRENT_NATIVE', optIn);
      let touched = false;
      const fixture = Object.defineProperty({}, 'connection', {
        get() {
          touched = true;
          throw Error('UNEXPECTED_DATABASE_PATH');
        },
      });
      await expect(
        installCfcMixedCurrentReadbackFrom(
          fixture as Parameters<typeof installCfcMixedCurrentReadbackFrom>[0],
          {} as Parameters<typeof installCfcMixedCurrentReadbackFrom>[1],
        ),
      ).rejects.toThrow('EXPLICIT_NATIVE_AND_GENUINE_DERIVED_DATA_REQUIRED');
      expect(touched).toBe(false);
    },
  );
});
