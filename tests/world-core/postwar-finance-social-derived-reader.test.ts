/** Private DATA-reader negative boundary only. Genuine same-object success is
 * checked by the registered initializer holding the real derivation; no test
 * here reissues 70-country proof or simulates its WeakSet membership. */
import { describe, it, expect } from 'vitest';
import {
  readPostwarFinanceSocialSourceDerivation,
  type PostwarFinanceSocialSourceDerivation,
} from '../../apps/world-worker/src/persistence/postwar-finance-social-source-publication.js';
const plain: PostwarFinanceSocialSourceDerivation = {
  schemaVersion: 'postwar-finance-social-derived-manifest-v1',
  worldId: 'WORLD_TEST_ONLY',
  seedId: 'SEED_TEST_ONLY',
  seedFingerprint: 'sha256:' + 'a'.repeat(64),
  canonicalSeedSha256: 'b'.repeat(64),
  retainedSources: {},
  countries: [],
};
describe('issued Finance/Social derivation DATA accessor', () => {
  it('rejects a same-shaped object and serialized manifest, without minting authority or a derivation', () => {
    for (const data of [
      plain,
      Object.freeze({ ...plain }),
      JSON.parse(JSON.stringify(plain)),
    ])
      expect(() => readPostwarFinanceSocialSourceDerivation(data)).toThrow(
        'ISSUED_DERIVATION_REQUIRED',
      );
  });
  it('rejects prototype inheritance from a manifest; no Ready flag or callback can supply private membership', () => {
    const inherited = Object.create(
      plain,
    ) as PostwarFinanceSocialSourceDerivation;
    expect(() => readPostwarFinanceSocialSourceDerivation(inherited)).toThrow(
      'ISSUED_DERIVATION_REQUIRED',
    );
  });
});
