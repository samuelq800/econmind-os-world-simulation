/** The positive path is actual bounded native SQL over the sealed c427 source,
 * never a same-shape source mock or source-adoption-as-execution claim. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  createPostwarRuntimeReadEvidenceReader,
  consumePostwarRuntimeReadEvidenceFrom,
  type PostwarRuntimeReadEvidence,
} from '../../apps/world-worker/src/persistence/postwar-runtime-read-evidence.js';
import {
  POSTWAR_PROJECTION_DATASETS,
  type PostwarProjectionOffice,
} from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
} from '../support/postwar-native-reference-db.js';
const root = path.resolve(import.meta.dirname, '../..');
const frozenAuditBytes = await readFile(
  path.join(
    root,
    'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_GAPS.json',
  ),
  'utf8',
);
const inertExecutor: SqlExecutor = {
  async query() {
    throw Error('not queried');
  },
};
describe('bounded read evidence is separate from deferred execution authority', () => {
  it('rejects a forged or expired token before any database read', () => {
    expect(() =>
      consumePostwarRuntimeReadEvidenceFrom(
        inertExecutor,
        {} as PostwarRuntimeReadEvidence,
      ),
    ).toThrow('forged expired');
  });
  it('does not accept a modified historical audit or caller-supplied ready flags', () => {
    expect(() =>
      createPostwarRuntimeReadEvidenceReader({
        runtimeReaderRole: 'fixture_reader',
        authorizationPublisherRole: 'fixture_publisher',
        worldId: 'WORLD_TEST',
        seedFingerprint: `sha256:${'1'.repeat(64)}`,
        admissionRef: 'ADMISSION_TEST',
        sourceBundleSha256: '2'.repeat(64),
        frozenAuditBytes: frozenAuditBytes + ' ',
      }),
    ).toThrow('frozen raw audit bytes differ');
  });
});
const templatePath = process.env.ECONMIND_POSTWAR_BOUNDED_TEMPLATE;
const native = templatePath ? describe : describe.skip;
native('actual native bounded read bridge', () => {
  it('binds six current Office scopes and 16 actual dataset first pages while all 490 execution gates remain unresolved', async () => {
    const template = JSON.parse(await readFile(templatePath!, 'utf8'));
    const marker = await loadPostwarNativeReferenceMarker(
      template.referenceMarker,
    );
    const clone = await clonePostwarNativeReference(
      marker,
      'read_gate_bridge',
      template.templateDatabase,
    );
    const receipts: unknown[] = [];
    try {
      const reader = createPostwarRuntimeReadEvidenceReader({
        runtimeReaderRole: marker.roles.boundedReaderRole,
        authorizationPublisherRole: marker.roles.authorizationPublisherRole,
        frozenAuditBytes,
        worldId: marker.worldId,
        seedFingerprint: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        sourceBundleSha256: marker.sourceBundleSha256,
      });
      const run = async <T>(consume: (tx: SqlExecutor) => Promise<T>) => {
        const client = await clone.boundedReader.connect();
        try {
          await client.query('begin isolation level repeatable read read only');
          await client.query(
            "select set_config('request.jwt.claim.sub',$1,true)",
            [marker.subject],
          );
          const tx: SqlExecutor = {
            async query<Row extends object>(
              sql: string,
              args: readonly unknown[] = [],
            ) {
              expect(sql).not.toContain('canonical_payload');
              expect(sql).not.toContain(
                'from world_v2.current_commit_authorization',
              );
              const r = await client.query<Row>(sql, [...args]);
              return { rows: r.rows, rowCount: r.rowCount };
            },
          };
          return await consume(tx);
        } finally {
          await client.query('rollback');
          client.release();
        }
      };
      for (const office of Object.keys(
        POSTWAR_PROJECTION_DATASETS,
      ) as PostwarProjectionOffice[]) {
        await run(async (tx) => {
          let escaped: PostwarRuntimeReadEvidence | undefined;
          await reader.withEvidenceFrom(tx, office, async (token) => {
            escaped = token;
            const proof = consumePostwarRuntimeReadEvidenceFrom(tx, token);
            expect(proof.header.scope.countryId).toBe('COUNTRY_01');
            expect(proof.header.scope.teamId).toBe(marker.team);
            expect(proof.header.scope.officeId).toBe(office);
            expect(proof.header.source.admissionRef).toBe(marker.admissionRef);
            expect(proof.datasets).toHaveLength(
              POSTWAR_PROJECTION_DATASETS[office].length,
            );
            expect(proof.counts.rawDeferredExecutionGates).toBe(490);
            expect(proof.counts.executionGatesClosed).toBe(0);
            expect(proof.counts.productionGatesClosed).toBe(0);
            expect(proof.deferredExecutionGates).toHaveLength(490);
            expect(
              new Set(proof.deferredExecutionGates.map((g) => g.countryId))
                .size,
            ).toBe(70);
            expect(() =>
              consumePostwarRuntimeReadEvidenceFrom(inertExecutor, token),
            ).toThrow('different-executor');
            expect(() =>
              consumePostwarRuntimeReadEvidenceFrom(tx, {
                ...token,
              } as PostwarRuntimeReadEvidence),
            ).toThrow('forged expired');
            receipts.push(proof);
          });
          expect(() =>
            consumePostwarRuntimeReadEvidenceFrom(tx, escaped!),
          ).toThrow('forged expired');
        });
      }
      const roleRights = (
        await clone.installer.query(
          "select has_column_privilege($1,'world_v2.opening_seed','canonical_payload','SELECT')as raw_seed",
          [marker.roles.boundedReaderRole],
        )
      ).rows[0];
      expect(roleRights.raw_seed).toBe(false);
      const count = receipts.reduce<number>(
        (sum, r) => sum + (r as { datasets: unknown[] }).datasets.length,
        0,
      );
      expect(count).toBe(16);
      // Real current authorization revocation, only in this disposable clone.
      await clone.installer.query(
        "update world_v2.current_commit_authorization set active=false where world_id=$1 and auth_subject=$2::uuid and office_id='SOCIAL'",
        [marker.worldId, marker.subject],
      );
      await expect(
        run((tx) => reader.withEvidenceFrom(tx, 'SOCIAL', async () => true)),
      ).rejects.toThrow('actual current Office seat missing');
      const dir =
        process.env.ECONMIND_POSTWAR_READ_GATE_EVIDENCE_DIR ??
        '/workspace/office-connection-evidence/postwar-runtime-read-gates-20261028';
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, 'summary.json'),
        JSON.stringify(
          {
            classification:
              'TEST_ONLY_ACTUAL_NATIVE_READ_BRIDGE_NOT_EXECUTION_AUTHORITY',
            referenceMarker: template.referenceMarker,
            templateDatabase: template.templateDatabase,
            worldId: marker.worldId,
            seedFingerprint: marker.seedFingerprint,
            readCountryCount: 1,
            readOfficeScopeCount: 6,
            firstPagesRead: count,
            rawDeferredExecutionGateCount: 490,
            executionGatesClosed: 0,
            productionGatesClosed: 0,
            rawSeedSelectDenied: true,
            currentSeatRevocationRejected: true,
            WorldClock: false,
            receipts,
          },
          null,
          2,
        ) + '\n',
      );
    } finally {
      await clone.drop();
    }
  }, 30_000);
});
