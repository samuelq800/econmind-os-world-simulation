/** Explicit one-time local reference installation; never part of default CI. */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import {
  createPostwarNativeReferenceDatabase,
  clonePostwarNativeReference,
  readPostwarNativeReferenceHeader,
} from '../support/postwar-native-reference-db.js';
const gated =
  process.env.ECONMIND_POSTWAR_REFERENCE_BOOTSTRAP === '1'
    ? describe
    : describe.skip;
gated('isolated shared PG16.15 reference', () => {
  it('validates the existing actual seed once and preserves a cloneable admitted TEST_ONLY native baseline', async () => {
    const marker = await createPostwarNativeReferenceDatabase({
      repositoryRoot: path.resolve(import.meta.dirname, '../..'),
      evidenceDirectory:
        '/workspace/.cloud-setup/evidence/postwar-reference-20261028',
      seedFile: '/tmp/econmind-postwar-cli-20261028T1602/final-seed.json',
    });
    expect(marker.baselineSealed).toBe(true);
    const clone = await clonePostwarNativeReference(marker, 'smoke');
    try {
      const h = await clone.installer.query(
        'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
        [marker.worldId],
      );
      expect(h.rows).toEqual([{ world_version: '0', event_sequence: '0' }]);
      const header = await readPostwarNativeReferenceHeader(
        marker,
        clone.database,
      );
      expect(header.core_intent_fingerprint_matches).toBe(true);
      expect(header.seed_fingerprint).toBe(marker.seedFingerprint);
      const bounded = await clone.boundedReader.query('select current_user');
      expect(bounded.rows).toEqual([
        {
          current_user: marker.roles.boundedReaderRole,
        },
      ]);
      const permissions = await clone.installer.query(
        `select has_column_privilege($1,'world_v2.opening_seed','canonical_payload','SELECT') as raw_seed_select`,
        [marker.roles.boundedReaderRole],
      );
      expect(permissions.rows).toEqual([{ raw_seed_select: false }]);
      await writeFile(
        path.join(marker.evidenceDirectory, 'reference-header.json'),
        JSON.stringify(header, null, 2) + '\n',
      );
      expect(
        marker.verification.ephemeralEd25519PrivateAuthorityActuallyVerified,
      ).toBe(true);
    } finally {
      await clone.drop();
    }
    console.info(
      'POSTWAR_REFERENCE_READY',
      JSON.stringify({
        markerPath: marker.markerPath,
        socket: marker.socket,
        database: marker.database,
        seedFingerprint: marker.seedFingerprint,
        ownedContainer: marker.ownedContainer,
      }),
    );
  }, 300_000);
});
