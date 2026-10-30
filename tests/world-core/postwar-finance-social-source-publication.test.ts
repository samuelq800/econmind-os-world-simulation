import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  derivePostwarFinanceSocialSources,
  hashPostwarFinanceSocialSeedIntent,
  publishPostwarFinanceSocialSources,
} from '../../apps/world-worker/src/persistence/postwar-finance-social-source-publication.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const evidence =
  '/workspace/.cloud-setup/evidence/finance-social-fixed-source-publication-20261030';
describe('fixed cfc Finance/Social controlled source publication', () => {
  it('rejects DTO/Ready and counterfeit derived rows before any SQL', async () => {
    expect(() =>
      derivePostwarFinanceSocialSources({ ready: true } as never),
    ).toThrow('FIXED_ADOPTED_CORE_SEED_REQUIRED');
    expect(() =>
      hashPostwarFinanceSocialSeedIntent({ ready: true } as never),
    ).toThrow('GENUINE_CORE_SEED_REQUIRED');
    let calls = 0;
    const db = {
      query: async () => {
        calls++;
        return { rows: [], rowCount: 0 };
      },
      transaction: async () => {
        calls++;
      },
    };
    await expect(
      publishPostwarFinanceSocialSources({
        derivation: { countries: [] } as never,
        financeDatabase: db as never,
        socialDatabase: db as never,
      }),
    ).rejects.toThrow('ISSUED_DERIVATION_REQUIRED');
    expect(calls).toBe(0);
  });
  it('streams the exact Core canonical intent including chunk-edge Unicode and escaping', () => {
    const source = C.createOpeningSource(
      {
        schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: C.openingSourceId('SOURCE_STREAM_TEST'),
        sourceKind: 'TEST_FIXTURE',
        sourceVersion: 'TEST_ONLY',
        locator: 'test://stream-codec',
        payload: { text: 'a'.repeat(16374) + '😀\\"\n終' + 'b'.repeat(33000) },
      },
      sha,
    );
    expect(source.canonicalPayload.charCodeAt(16383)).toBe(0xd83d);
    const seed = C.createOpeningSeed(
      {
        schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
        worldId: C.worldId('WORLD_STREAM_TEST'),
        seedId: C.openingSeedId('SEED_STREAM_TEST'),
        openingWorldVersion: '0',
        replayBinding: C.CURRENT_REPLAY_BINDING,
        sources: [source],
        financialBatches: [],
        inventoryEntries: [],
      },
      sha,
    );
    const { fingerprint: _fingerprint, ...intent } = seed;
    void _fingerprint;
    expect(hashPostwarFinanceSocialSeedIntent(seed)).toBe(
      sha(C.canonicalSerialize(intent)),
    );
  });
  it('binds all 70 SQL country pins to the retained fixed-version manifest', async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL(
          '../../config/postwar-genesis/finance-social-source-manifest.v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as {
      classification: string;
      seedFingerprint: string;
      canonicalSeedSha256: string;
      countries: { countryId: string; derivedSha256: string }[];
    };
    const sql = await readFile(
      new URL(
        '../../database/proposals/postwar-finance-social-source-publication.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const map = sql.match(/pins:='([^']+)'::jsonb/u);
    expect(map).not.toBeNull();
    expect(JSON.parse(map![1]!)).toEqual(
      Object.fromEntries(
        manifest.countries.map((c) => [c.countryId, c.derivedSha256]),
      ),
    );
    expect(manifest.countries).toHaveLength(70);
    expect(new Set(manifest.countries.map((c) => c.countryId)).size).toBe(70);
    expect(manifest.classification).toBe(
      'FIXED_VERSION_DERIVATION_EVIDENCE_NOT_SIGNATURE',
    );
    expect(sql).toContain(
      'Canonical manifest SHA256: ' + sha(C.canonicalSerialize(manifest)),
    );
    expect(sql).toContain(manifest.canonicalSeedSha256);
    expect(sql).toContain(manifest.seedFingerprint);
  });
  it.skipIf(process.env.ECONMIND_DERIVE_FINANCE_SOCIAL_SOURCES !== '1')(
    'derives actual 70 country originals from the retained genuine cfc seed',
    async () => {
      const start = performance.now();
      const seed = C.parseOpeningSeed(
        JSON.parse(
          await readFile(
            '/workspace/.cloud-setup/evidence/postwar-gcu-opening-fresh-20261029T020748Z/final-seed.json',
            'utf8',
          ),
        ),
        sha,
      );
      const result = derivePostwarFinanceSocialSources(seed);
      expect(result.countries).toHaveLength(70);
      expect(result.countries.map((c) => c.countryId)).toEqual(
        Array.from(
          { length: 70 },
          (_, i) => 'COUNTRY_' + String(i + 1).padStart(2, '0'),
        ),
      );
      for (const c of result.countries) {
        expect(sha(c.derivedText)).toBe(c.derivedSha256);
        expect(Buffer.byteLength(c.derivedText)).toBeLessThanOrEqual(524288);
        const d = JSON.parse(c.derivedText);
        expect(d.countryId).toBe(c.countryId);
        expect(d.capacity.treasury.assetAccount.countryId).toBe(c.countryId);
        expect(d.capacity).not.toHaveProperty('admissionRef');
      }
      const { countries, ...pins } = result;
      const manifest = {
        ...pins,
        classification: 'FIXED_VERSION_DERIVATION_EVIDENCE_NOT_SIGNATURE',
        countries: countries.map(({ countryId, derivedSha256 }) => ({
          countryId,
          derivedSha256,
        })),
      };
      await mkdir(evidence, { recursive: true });
      const text = C.canonicalSerialize(manifest);
      await writeFile(evidence + '/manifest.json', text + '\n');
      await writeFile(
        evidence + '/country-originals.json',
        JSON.stringify(result),
      );
      await writeFile(
        evidence + '/derivation-receipt.json',
        JSON.stringify(
          {
            status: 'PASS_OFFLINE_CORE_DERIVATION_NOT_ADMISSION',
            elapsedMs: performance.now() - start,
            peakRssKiB: process.resourceUsage().maxRSS,
            canonicalManifestSha256: sha(text),
            seedFingerprint: result.seedFingerprint,
            countryCount: countries.length,
            publicationSqlExecuted: false,
          },
          null,
          2,
        ),
      );
    },
    120000,
  );
});
