import { describe, expect, it } from 'vitest';
import { assertBeneficialChildNativeEvidenceDirectory } from '../../tools/office-connection/beneficial-child-source-preflight.mjs';
describe('beneficial child native path preflight before costly source issuance', () => {
  it('accepts a short owned path and checks the actual socket suffix budget', () => {
    const prefix = '/workspace/.cloud-setup/evidence/';
    expect(assertBeneficialChildNativeEvidenceDirectory(prefix + 'bc2')).toBe(
      prefix + 'bc2',
    );
    const boundary =
      prefix + 'a'.repeat(107 - 20 - '/socket-00000000'.length - prefix.length);
    expect(assertBeneficialChildNativeEvidenceDirectory(boundary)).toBe(
      boundary,
    );
    expect(() =>
      assertBeneficialChildNativeEvidenceDirectory(boundary + 'x'),
    ).toThrow('REFERENCE_UNIX_SOCKET_PATH_TOO_LONG');
  });
  it('rejects the failed real long directory before database construction or Core preparation', () => {
    expect(() =>
      assertBeneficialChildNativeEvidenceDirectory(
        '/workspace/.cloud-setup/evidence/beneficial-child-source-publication-native-20261101/attempt01',
      ),
    ).toThrow('REFERENCE_UNIX_SOCKET_PATH_TOO_LONG');
  });
  it('counts Unicode bytes and rejects non-owned or unnormalized paths', () => {
    expect(() =>
      assertBeneficialChildNativeEvidenceDirectory(
        '/workspace/.cloud-setup/evidence/' + '界'.repeat(20),
      ),
    ).toThrow('REFERENCE_UNIX_SOCKET_PATH_TOO_LONG');
    for (const value of [
      '/tmp/bc2',
      '/workspace/.cloud-setup/evidence/a/../b',
      undefined,
    ]) {
      expect(() => assertBeneficialChildNativeEvidenceDirectory(value)).toThrow(
        'OWNED_NEW_NATIVE_EVIDENCE_DIRECTORY_REQUIRED',
      );
    }
  });
});
