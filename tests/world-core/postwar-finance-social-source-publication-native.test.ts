/** Explicit isolated owned-clone SQL acceptance. Reuses the real cfc baseline
 * and previously Core-derived pinned small originals; no seed reconstruction,
 * source fixture registrar, new role/membership, production or Clock. */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import {
  clonePostwarNativeReference,
  loadPostwarNativeReferenceMarker,
} from '../support/postwar-native-reference-db.js';
const enabled =
  process.env.ECONMIND_FINANCE_SOCIAL_SOURCE_PUBLICATION_NATIVE === '1';
const directory =
  '/workspace/.cloud-setup/evidence/finance-social-fixed-source-publication-20261030';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
describe('fixed cfc Finance/Social formal small-source SQL (isolated TEST_ONLY admission)', () => {
  it.skipIf(!enabled)(
    'publishes exact originals via EXEC-only definers; rejects forged bytes, wrong role, conflicts and revoked admission',
    async () => {
      const marker = await loadPostwarNativeReferenceMarker(
        '/workspace/.cloud-setup/evidence/fx-cfc-runtime-20261029/reference-db.json',
      );
      const manifest = JSON.parse(
        await readFile(
          new URL(
            '../../config/postwar-genesis/finance-social-source-manifest.v1.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ) as {
        seedFingerprint: string;
        canonicalSeedSha256: string;
        countries: { countryId: string; derivedSha256: string }[];
      };
      const actual = JSON.parse(
        await readFile(directory + '/country-originals.json', 'utf8'),
      ) as {
        countries: {
          countryId: string;
          derivedText: string;
          derivedSha256: string;
        }[];
      };
      expect(marker.seedFingerprint).toBe(manifest.seedFingerprint);
      expect(actual.countries).toHaveLength(70);
      for (const c of actual.countries) {
        expect(sha(c.derivedText)).toBe(c.derivedSha256);
        expect(
          manifest.countries.find((p) => p.countryId === c.countryId)
            ?.derivedSha256,
        ).toBe(c.derivedSha256);
      }
      const clone = await clonePostwarNativeReference(
        marker,
        'fixed_source_pub',
      );
      const installed: { path: string; sha256: string }[] = [];
      let passed = false;
      let stage = 'INSTALL_CANDIDATE';
      const started = performance.now();
      try {
        // The baseline already has official migrations/admission. Install only
        // missing reviewed source proposals in this clone, never the template.
        for (const [file, object] of [
          [
            'social-operating-custody',
            'world_v2.social_operating_source_registration',
          ],
          ['finance-budget-custody', 'world_v2.finance_budget_policy_original'],
          [
            'finance-budget-capacity-source',
            'world_v2.finance_budget_capacity_original',
          ],
          [
            'finance-budget-mixed-source',
            'world_v2.finance_budget_mixed_social_original',
          ],
        ] as const) {
          const exists = (
            await clone.installer.query('select to_regclass($1)::text object', [
              object,
            ])
          ).rows[0]?.object;
          if (!exists) {
            const text = await readFile(
              new URL(
                '../../database/proposals/' + file + '.sql',
                import.meta.url,
              ),
              'utf8',
            );
            await clone.installer.query(text);
            installed.push({ path: file, sha256: sha(text) });
          }
        }
        const sql = await readFile(
          new URL(
            '../../database/proposals/postwar-finance-social-source-publication.sql',
            import.meta.url,
          ),
          'utf8',
        );
        await clone.installer.query(sql);
        installed.push({
          path: 'postwar-finance-social-source-publication',
          sha256: sha(sql),
        });
        const run = async (kind: 'FINANCE' | 'SOCIAL', text: string) => {
          const client = await clone.installer.connect();
          try {
            await client.query('begin');
            await client.query(
              'set local role ' +
                (kind === 'FINANCE'
                  ? 'world_v2_finance_budget_source_publisher'
                  : 'world_v2_social_source_publisher'),
            );
            const result = await client.query(
              'select * from world_v2.' +
                (kind === 'FINANCE'
                  ? 'publish_postwar_finance_source_bounded'
                  : 'publish_postwar_social_source_bounded') +
                '($1)',
              [text],
            );
            await client.query('commit');
            return result.rows;
          } catch (error) {
            await client.query('rollback');
            throw error;
          } finally {
            client.release();
          }
        };
        stage = 'PUBLISH_70_COUNTRIES';
        for (const country of actual.countries) {
          expect(await run('SOCIAL', country.derivedText)).toHaveLength(1);
          expect(await run('FINANCE', country.derivedText)).toHaveLength(1);
        }
        stage = 'IDEMPOTENCY_AND_NEGATIVES';
        const c = actual.countries[0]!;
        const first = await run('FINANCE', c.derivedText);
        expect(await run('FINANCE', c.derivedText)).toEqual(first);
        const fake = JSON.parse(c.derivedText);
        fake.capacity.treasury.assetAmount = '99999999999999999';
        await expect(run('FINANCE', canonicalSerialize(fake))).rejects.toThrow(
          'FIXED_CORE_DERIVATION_HASH_REQUIRED',
        );
        await expect(
          clone.installer.query(
            'select * from world_v2.publish_postwar_finance_source_bounded($1)',
            [c.derivedText],
          ),
        ).rejects.toThrow('FIXED_FINANCE_SOCIAL_PUBLISHER_REQUIRED');
        // Source conflict is isolated to this clone; original triggers remain active.
        const counts = (
          await clone.installer.query(
            'select (select count(*)::text from world_v2.finance_budget_mixed_social_original) mixed,(select count(*)::text from world_v2.finance_budget_capacity_original) capacity,(select count(*)::text from world_v2.social_operating_source_registration) social,(select world_version::text from world_v2.world_head where world_id=$1) version',
            [marker.worldId],
          )
        ).rows[0];
        expect(counts).toEqual({
          mixed: '70',
          capacity: '70',
          social: '70',
          version: '0',
        });
        await expect(
          clone.installer.query(
            'update world_v2.finance_budget_capacity_original set source_text=source_text',
          ),
        ).rejects.toThrow();
        // Append the existing revocation in the owned clone only. Re-publication
        // must not restore source/admission authority after revocation.
        stage = 'CONTROLLED_REVOCATION';
        const authorization = (
          await clone.installer.query(
            'select authorization_id from world_v2.runtime_admission_publication_permit where world_id=$1',
            [marker.worldId],
          )
        ).rows;
        expect(authorization).toHaveLength(1);
        const registrar = await clone.installer.connect();
        try {
          await registrar.query('begin');
          await registrar.query('set local role world_v2_admission_release');
          await registrar.query(
            'insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref) values($1,$2)',
            [
              authorization[0]!.authorization_id,
              'TEST_ONLY_FIXED_SOURCE_REVOCATION',
            ],
          );
          await registrar.query('commit');
        } catch (error) {
          await registrar.query('rollback');
          throw error;
        } finally {
          registrar.release();
        }
        await expect(run('FINANCE', c.derivedText)).rejects.toThrow(
          'ACTUAL_SIGNED_ADMISSION_REQUIRED',
        );
        passed = true;
        await mkdir(directory, { recursive: true });
        await writeFile(
          directory + '/native-publication.json',
          JSON.stringify(
            {
              status: 'PASS_ISOLATED_TEST_ONLY_ADMISSION_NOT_PRODUCTION',
              worldId: marker.worldId,
              seedFingerprint: marker.seedFingerprint,
              canonicalSeedSha256: manifest.canonicalSeedSha256,
              clone: clone.database,
              countries: 70,
              sourceRows: counts,
              installed,
              sqlParsesWholeSeed: false,
              clockStarted: false,
              newRolesOrMemberships: false,
              callerIdentity:
                'TEST_ONLY_ADMIN_SESSION_SET_LOCAL_ROLE_EXISTING_PUBLISHER',
              elapsedMs: performance.now() - started,
              peakNodeRssKiB: process.resourceUsage().maxRSS,
            },
            null,
            2,
          ),
        );
      } finally {
        await clone.drop();
        await mkdir(directory, { recursive: true });
        await writeFile(
          directory + '/native-stage-receipt.json',
          JSON.stringify(
            {
              status: passed ? 'PASS' : 'FAIL',
              stage,
              elapsedMs: performance.now() - started,
              peakNodeRssKiB: process.resourceUsage().maxRSS,
              clone: clone.database,
              ownedCloneDropped: true,
              production: false,
            },
            null,
            2,
          ),
        );
        if (passed)
          await writeFile(
            directory + '/native-cleanup.json',
            JSON.stringify({
              status: 'OWNED_CLONE_DROPPED',
              database: clone.database,
              templateUnchanged: true,
            }),
          );
      }
    },
    120000,
  );
});
