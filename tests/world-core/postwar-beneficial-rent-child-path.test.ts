/** Cheap regression for the real pre-resource native path failure. */
import { describe, it, expect } from 'vitest';
import {
  assertPostwarBeneficialRentChildEvidenceDirectory,
  runPostwarBeneficialRentChildNativeRehearsal,
} from '../support/postwar-beneficial-rent-child-native-fixture.js';
describe('child native early UDS path budget', () => {
  it('accepts the short owned scope and rejects traversal/outside roots', () => {
    expect(() =>
      assertPostwarBeneficialRentChildEvidenceDirectory(
        '/workspace/.cloud-setup/evidence/bc2',
      ),
    ).not.toThrow();
    expect(() =>
      assertPostwarBeneficialRentChildEvidenceDirectory(
        '/tmp/not-an-owned-reference',
      ),
    ).toThrow('OWNED_EVIDENCE_ROOT_REQUIRED');
    expect(() =>
      assertPostwarBeneficialRentChildEvidenceDirectory(
        '/workspace/.cloud-setup/evidence/../../other',
      ),
    ).toThrow('OWNED_EVIDENCE_ROOT_REQUIRED');
  });
  it('rejects an overlong UDS before source files/full proof or any native resources', async () => {
    await expect(
      runPostwarBeneficialRentChildNativeRehearsal({
        repositoryRoot: '/MUST_NOT_ACCESS',
        artifactDirectory: '/MUST_NOT_ACCESS',
        evidenceDirectory:
          '/workspace/.cloud-setup/evidence/' + 'x'.repeat(100),
      }),
    ).rejects.toThrow(
      'REFERENCE_UNIX_SOCKET_PATH_TOO_LONG_BEFORE_SOURCE_PREPARATION',
    );
  });
});
