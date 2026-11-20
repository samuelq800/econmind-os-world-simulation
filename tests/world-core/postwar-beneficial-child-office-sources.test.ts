/** Fail-closed proof/scope checks only. The real fixed 70-country child
 * derivation and controlled publisher require separate retained artifacts. */
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonicalSerialize } from '@econmind/core';
import { createBeneficialHousingRentChildCoreFixture } from '../support/beneficial-housing-rent-child-test-only.js';
import {
  prepareBeneficialHousingRentSource,
  retireBeneficialHousingRentSource,
  type PreparedBeneficialHousingRentSource,
} from '../../apps/world-worker/src/persistence/postwar-beneficial-housing-rent-source.js';
import { derivePostwarBeneficialChildFinanceSocialSources } from '../../apps/world-worker/src/persistence/postwar-finance-social-source-publication.js';
import {
  parseAdoptedCaptainOpeningPolicy,
  withAdoptedBeneficialChildCaptainNewScenarioFrom,
  type AdoptedCaptainOpeningPolicy,
} from '../../apps/world-worker/src/preparation/postwar-captain-opening-source.js';
let f: ReturnType<typeof createBeneficialHousingRentChildCoreFixture>,
  proof: PreparedBeneficialHousingRentSource,
  policy: AdoptedCaptainOpeningPolicy;
beforeAll(async () => {
  f = createBeneficialHousingRentChildCoreFixture();
  proof = prepareBeneficialHousingRentSource({
    parentSeed: f.parent,
    seed: f.seed,
    receipts: f.receipts,
  });
  policy = parseAdoptedCaptainOpeningPolicy({
    policyBytes: await readFile(
      new URL(
        '../../config/postwar-genesis/captain-opening.v1.json',
        import.meta.url,
      ),
      'utf8',
    ),
    receiptBytes: await readFile(
      new URL(
        '../../config/postwar-genesis/captain-opening-adoption.v1.json',
        import.meta.url,
      ),
      'utf8',
    ),
  });
});
afterAll(() => retireBeneficialHousingRentSource(proof));
describe('fixed child office originals require real complete proof, not relabelled packets', () => {
  it('binds the complete child SQL allowlist independently of the unchanged parent allowlist', async () => {
    const load = async (name: string) =>
      JSON.parse(
        await readFile(
          new URL('../../config/postwar-genesis/' + name, import.meta.url),
          'utf8',
        ),
      ) as {
        seedFingerprint: string;
        parentSeedFingerprint?: string;
        canonicalSeedSha256: string;
        countries: { countryId: string; derivedSha256: string }[];
      };
    const parent = await load('finance-social-source-manifest.v1.json'),
      child = await load(
        'finance-social-source-manifest.beneficial-child.v1.json',
      ),
      sql = await readFile(
        new URL(
          '../../database/proposals/postwar-finance-social-source-publication.sql',
          import.meta.url,
        ),
        'utf8',
      ),
      pins = [...sql.matchAll(/pins:='([^']+)'::jsonb/gu)].map((m) =>
        JSON.parse(m[1]!),
      );
    expect(pins).toHaveLength(2);
    for (const [i, manifest] of [parent, child].entries()) {
      expect(manifest.countries.map((c) => c.countryId)).toEqual(
        Array.from(
          { length: 70 },
          (_, n) => 'COUNTRY_' + String(n + 1).padStart(2, '0'),
        ),
      );
      expect(pins[i]).toEqual(
        Object.fromEntries(
          manifest.countries.map((c) => [c.countryId, c.derivedSha256]),
        ),
      );
      expect(sql).toContain(manifest.canonicalSeedSha256);
    }
    expect(child.parentSeedFingerprint).toBe(parent.seedFingerprint);
    expect(child.seedFingerprint).not.toBe(parent.seedFingerprint);
    expect(
      child.countries.every(
        (c, i) => c.derivedSha256 !== parent.countries[i]!.derivedSha256,
      ),
    ).toBe(true);
    expect(sql).toContain(
      'Canonical child manifest SHA256: ' +
        createHash('sha256').update(canonicalSerialize(child)).digest('hex'),
    );
    expect(sql).toContain('ACTUAL_STORED_SEED_HASH_REQUIRED');
    expect(sql).toContain('ACTUAL_SIGNED_ADMISSION_REQUIRED');
  });
  it('refuses manifest/copied proof and does not mistake a genuine tiny fixture for the approved actual child', () => {
    expect(() =>
      derivePostwarBeneficialChildFinanceSocialSources({
        seed: f.seed,
        preparation: { ...proof },
      }),
    ).toThrow('GENUINE_LIVE_PREPARED_SOURCE_REQUIRED');
    expect(() =>
      derivePostwarBeneficialChildFinanceSocialSources({
        seed: f.seed,
        preparation: proof,
      }),
    ).toThrow('FIXED_COMPLETE_BENEFICIAL_CHILD_PROOF_REQUIRED');
  });
  it('does not query a publisher or mint a private Captain publication scope from a copied proof or a non-operating parent', async () => {
    let queries = 0,
      consumed = 0;
    const tx = {
      query: async () => {
        queries++;
        return { rows: [], rowCount: 0 };
      },
    };
    await expect(
      withAdoptedBeneficialChildCaptainNewScenarioFrom(
        tx,
        {
          seed: f.seed,
          preparation: { ...proof },
          policy,
          worldAdmissionRef: 'ADMISSION_TEST_ONLY_NOT_REAL',
        },
        async () => {
          consumed++;
        },
      ),
    ).rejects.toThrow('GENUINE_LIVE_PREPARED_SOURCE_REQUIRED');
    await expect(
      withAdoptedBeneficialChildCaptainNewScenarioFrom(
        tx,
        {
          seed: f.seed,
          preparation: proof,
          policy,
          worldAdmissionRef: 'ADMISSION_TEST_ONLY_NOT_REAL',
        },
        async () => {
          consumed++;
        },
      ),
    ).rejects.toThrow();
    expect(queries).toBe(0);
    expect(consumed).toBe(0);
  });
});
