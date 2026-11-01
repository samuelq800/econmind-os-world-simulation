/** Tiny complete 70-country Core proof. No world genesis, SQL or admission. */
import { beforeAll, describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { createBeneficialHousingRentChildCoreFixture as fixture } from '../support/beneficial-housing-rent-child-test-only.js';
import {
  prepareBeneficialHousingRentSource,
  retireBeneficialHousingRentSource,
  type PreparedBeneficialHousingRentSource,
} from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-source.js';
import {
  restoreVerifiedBeneficialHousingRentParent,
  readPostwarBeneficialHousingRentChildOperatingView,
} from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-child-view.js';
let f: ReturnType<typeof fixture>, proof: PreparedBeneficialHousingRentSource;
beforeAll(() => {
  f = fixture();
  proof = prepareBeneficialHousingRentSource({
    parentSeed: f.parent,
    seed: f.seed,
    receipts: f.receipts,
  });
});
describe('fixed child parent proof without admission', () => {
  it('reuses genuine full-family proof and restores the exact parent without rerunning generation', () => {
    const parent = restoreVerifiedBeneficialHousingRentParent({
      seed: f.seed,
      preparation: proof,
    });
    expect(parent.fingerprint).toBe(f.parent.fingerprint);
    expect(C.canonicalSerialize(parent)).toBe(C.canonicalSerialize(f.parent));
    expect(parent.fingerprint).not.toBe(f.seed.fingerprint);
  });
  it('rejects copied proof and exact-child mismatch', () => {
    expect(() =>
      restoreVerifiedBeneficialHousingRentParent({
        seed: f.seed,
        preparation: { ...proof },
      }),
    ).toThrow('GENUINE_LIVE_PREPARED_SOURCE_REQUIRED');
    expect(() =>
      restoreVerifiedBeneficialHousingRentParent({
        seed: f.parent,
        preparation: proof,
      }),
    ).toThrow('EXACT_LIVE_COMPLETE_CHILD_PROOF_REQUIRED');
  });
  it('does not turn a true Core fixture parent into an operating source or relabel its fingerprint', () => {
    expect(() =>
      readPostwarBeneficialHousingRentChildOperatingView({
        seed: f.seed,
        preparation: proof,
      }),
    ).toThrow();
    expect(f.parent.fingerprint).not.toBe(f.seed.fingerprint);
  });
  it('requires an explicit actual startup child when a private proof is supplied, before opening any transaction', async () => {
    const { createPostwarSocialSourcePreparation, preparePostwarSocialSource } =
      await import('../../apps/world-worker/src/persistence/prepared-postwar-social-source.js');
    let calls = 0;
    const database = {
      query: async () => {
        calls++;
        throw Error('unexpected SQL');
      },
      transaction: async () => {
        calls++;
        throw Error('unexpected transaction');
      },
    };
    await expect(
      preparePostwarSocialSource({
        preparation: createPostwarSocialSourcePreparation(),
        database,
        workerRole: 'fixture_rent_worker',
        countryIds: ['COUNTRY_01'],
        configuration: {
          observedAtReal: '2026-11-01T00:00:00.000Z',
          admittedWorldPins: {
            worldId: f.seed.worldId,
            seedRef: f.seed.seedId,
            contentHash: f.seed.fingerprint,
            admissionRef: 'ADMISSION_TEST_ONLY_NOT_REGISTERED',
          },
          modelVersion: f.seed.replayBinding.modelVersion,
          startupBeneficialHousingRentSource: proof,
        },
      }),
    ).rejects.toThrow('BENEFICIAL_CHILD_REQUIRES_EXPLICIT_STARTUP_SEED');
    expect(calls).toBe(0);
  });
  it('rejects a retired proof even after a successful parent projection', () => {
    retireBeneficialHousingRentSource(proof);
    expect(() =>
      restoreVerifiedBeneficialHousingRentParent({
        seed: f.seed,
        preparation: proof,
      }),
    ).toThrow('GENUINE_LIVE_PREPARED_SOURCE_REQUIRED');
  });
});
