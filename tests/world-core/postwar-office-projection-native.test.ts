/** Actual source reference reused once. No new full seed generation, signer,
 * World/Clock or production install. Leaves only the sealed owned handoff DB. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import { describe, it, expect } from 'vitest';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
  sealPostwarReferenceClone,
} from '../support/postwar-native-reference-db.js';
import {
  createPostwarOfficeProjectionStore,
  POSTWAR_PROJECTION_PUBLISH_QUERY,
  POSTWAR_PROJECTION_DATASETS,
  POSTWAR_PROJECTION_RESPONSE_MAX,
  type PostwarProjectionOffice,
} from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const markerPath = process.env.ECONMIND_POSTWAR_BOUNDED_NATIVE_REFERENCE;
const native = markerPath ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
native('actual full-source bounded country projection native PG16', () => {
  it('publishes fixed actual stored-source pages once, seals reusable template, and reads only bounded current-seat metadata/pages', async () => {
    const marker = await loadPostwarNativeReferenceMarker(markerPath!),
      clone = await clonePostwarNativeReference(marker, 'bounded_projection');
    const evidenceDirectory =
      process.env.ECONMIND_BOUNDED_PROJECTION_NATIVE_EVIDENCE_DIR ??
      '/workspace/office-connection-evidence/postwar-bounded-native-development-20261028';
    await mkdir(evidenceDirectory, { recursive: true });
    let sealed = false;
    let negative:
      Awaited<ReturnType<typeof clonePostwarNativeReference>> | undefined;
    const bounded = new Pool({
      host: marker.socket,
      port: marker.port,
      database: clone.database,
      user: marker.roles.boundedReaderRole,
      max: 1,
    });
    bounded.on('error', () => {});
    const publication: Record<string, unknown>[] = [],
      reads: Record<string, unknown>[] = [],
      statements: string[] = [];
    const evidence: Record<string, unknown> = {
      classification:
        'TEST_ONLY_REAL_123MB_SOURCE_NATIVE_BOUNDED_READ_NOT_PRODUCTION',
      referenceMarker: markerPath,
      worldId: marker.worldId,
      seedFingerprint: marker.seedFingerprint,
      markerVerification: marker.verification,
      publication,
      reads,
      productionAdmission: false,
      WorldClock: false,
    };
    const store = createPostwarOfficeProjectionStore({
      runtimeReaderRole: marker.roles.boundedReaderRole,
      authorizationPublisherRole: marker.roles.authorizationPublisherRole,
    });
    const readWith = async <T>(
      pool: Pool,
      consume: (executor: SqlExecutor) => Promise<T>,
    ) => {
      const client = await pool.connect();
      try {
        await client.query('begin isolation level repeatable read read only');
        await client.query(
          "select set_config('request.jwt.claim.sub',$1,true)",
          [marker.subject],
        );
        const executor: SqlExecutor = {
          async query<Row extends object>(
            q: string,
            args: readonly unknown[] = [],
          ) {
            statements.push(q);
            const r = await client.query<Row>(q, [...args]);
            return { rows: r.rows, rowCount: r.rowCount };
          },
        };
        const result = await consume(executor);
        await client.query('commit');
        return result;
      } finally {
        await client.query('rollback').catch(() => {});
        client.release();
      }
    };
    try {
      expect(marker.verification.currentCoreSeedParsed).toBe(true);
      expect(marker.verification.currentOperatingSourceActuallyValidated).toBe(
        true,
      );
      expect(marker.verification.controlledPermitPublishedAndReadBack).toBe(
        true,
      );
      const ddl = await readFile(
        path.join(root, 'database/proposals/postwar-office-derived-read.sql'),
        'utf8',
      );
      await clone.installer.query(ddl);
      await clone.installer.query(
        `grant world_v2_postwar_projection_reader to ${marker.roles.boundedReaderRole}`,
      );
      const info = (
        await clone.installer.query(
          "select seed_fingerprint,encode(sha256(convert_to(canonical_payload,'UTF8')),'hex')as canonical_sha,octet_length(canonical_payload)as bytes from world_v2.opening_seed where world_id=$1",
          [marker.worldId],
        )
      ).rows[0];
      expect(info.seed_fingerprint).toBe(marker.seedFingerprint);
      evidence.canonicalSeedIntentBytes = info.bytes;
      evidence.canonicalSeedIntentSha256 = info.canonical_sha;
      evidence.proposalSha256 = sha(ddl);
      const ordered: [PostwarProjectionOffice, string][] = [
        ['SOCIAL', 'positions'],
        ['SOCIAL', 'service-pools'],
        ['SOCIAL', 'offers'],
        ['SOCIAL', 'minimum-wage'],
        ['FINANCE', 'opening-financial-legs'],
        ['CENTRAL_BANK', 'cb-holdings'],
      ];
      for (const [office, datasets] of Object.entries(
        POSTWAR_PROJECTION_DATASETS,
      ))
        for (const dataset of datasets)
          if (!ordered.some(([o, d]) => o === office && d === dataset))
            ordered.push([office as PostwarProjectionOffice, dataset]);
      const client = await clone.installer.connect();
      try {
        await client.query('set role world_v2_postwar_projection_publisher');
        for (const [office, dataset] of ordered) {
          const start = performance.now(),
            r = await client.query(POSTWAR_PROJECTION_PUBLISH_QUERY, [
              marker.worldId,
              'COUNTRY_01',
              office,
              dataset,
              marker.seedFingerprint,
              info.canonical_sha,
              marker.sourceBundleSha256,
              marker.admissionRef,
            ]);
          expect(r.rows).toHaveLength(1);
          const d = r.rows[0];
          publication.push({
            office,
            dataset,
            rows: d.total_rows,
            pages: d.page_count,
            milliseconds: performance.now() - start,
            sourceVersion: d.source_version,
          });
          console.log(
            JSON.stringify({
              phase: 'PUBLISHED_COUNTRY01',
              office,
              dataset,
              rows: d.total_rows,
              pages: d.page_count,
            }),
          );
        }
        await client.query(POSTWAR_PROJECTION_PUBLISH_QUERY, [
          marker.worldId,
          'COUNTRY_02',
          'SOCIAL',
          'positions',
          marker.seedFingerprint,
          info.canonical_sha,
          marker.sourceBundleSha256,
          marker.admissionRef,
        ]);
      } finally {
        await client.query('reset role');
        client.release();
      }
      const headers = await readWith(bounded, (exec) =>
        store.readCurrentSeatHeadersFrom(exec, { worldId: marker.worldId }),
      );
      expect(headers).toHaveLength(6);
      expect(
        headers.every(
          (h) =>
            h.scope.countryId === 'COUNTRY_01' &&
            h.scope.authSubject === marker.subject,
        ),
      ).toBe(true);
      evidence.headerBytes = Buffer.byteLength(JSON.stringify(headers));
      for (const [office, dataset] of ordered) {
        const heapBefore = process.memoryUsage().heapUsed,
          start = performance.now(),
          r = await readWith(bounded, (exec) =>
            store.readPageFrom(exec, {
              worldId: marker.worldId,
              officeId: office,
              dataset,
              limit: 100,
            }),
          );
        expect(['PAGE', 'EMPTY']).toContain(r.status);
        if (r.status !== 'PAGE' && r.status !== 'EMPTY')
          throw Error('BOUNDED_PAGE_REQUIRED');
        const bytes = Buffer.byteLength(JSON.stringify(r));
        expect(bytes).toBeLessThanOrEqual(POSTWAR_PROJECTION_RESPONSE_MAX);
        expect(r.rows.length).toBeLessThanOrEqual(100);
        expect(r.source.seedFingerprint).toBe(marker.seedFingerprint);
        expect(r.source.sourceBundleSha256).toBe(marker.sourceBundleSha256);
        expect(r.source.canonicalSeedSha256).toBe(info.canonical_sha);
        reads.push({
          office,
          dataset,
          status: r.status,
          returned: r.page.returned,
          total: r.page.total,
          responseBytes: bytes,
          clientHeapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
          milliseconds: performance.now() - start,
          sourceVersion: r.source.sourceVersion,
        });
      }
      await expect(
        readWith(bounded, (exec) =>
          exec.query('select canonical_payload from world_v2.opening_seed'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      for (const q of [
        'select country_id from world_v2.postwar_office_projection_document',
        'select jsonb_agg(rows_text) from world_v2.postwar_office_projection_page',
      ])
        await expect(
          readWith(bounded, (exec) => exec.query(q)),
        ).rejects.toMatchObject({ code: '42501' });
      expect(
        statements
          .filter((q) =>
            q.startsWith(
              'select * from world_v2.read_postwar_office_projection_',
            ),
          )
          .every((q) => !q.includes('canonical_payload')),
      ).toBe(true);
      evidence.runtimeQueryStatements = statements;
      evidence.runtimeFullSeedQueries = 0;
      evidence.rawCanonicalSelectDenied = true;
      evidence.directProjectionTableAndAggregateSelectDenied = true;
      await bounded.end();
      await clone.close();
      await sealPostwarReferenceClone(marker, clone.database);
      sealed = true;
      const handoff = {
        schemaVersion: 'postwar-bounded-projection-template-v1',
        classification: 'TEST_ONLY_SEALED_DERIVED_TEMPLATE_NOT_PRODUCTION',
        referenceMarker: markerPath,
        templateDatabase: clone.database,
        worldId: marker.worldId,
        seedFingerprint: marker.seedFingerprint,
        readerRole: marker.roles.boundedReaderRole,
        sourceBundleSha256: marker.sourceBundleSha256,
        admissionRef: marker.admissionRef,
        proposalSha256: sha(ddl),
        officeDatasets: ordered,
      };
      await writeFile(
        path.join(evidenceDirectory, 'projection-template.json'),
        JSON.stringify(handoff, null, 2) + '\n',
      );
      console.log(
        JSON.stringify({
          phase: 'BOUNDED_TEMPLATE_SEALED',
          descriptor: path.join(evidenceDirectory, 'projection-template.json'),
          templateDatabase: clone.database,
        }),
      );
      // All revocation/head/permission mutations are confined to a disposable child.
      negative = await clonePostwarNativeReference(
        marker,
        'bounded_negative',
        clone.database,
      );
      const negativeReader = new Pool({
        host: marker.socket,
        port: marker.port,
        database: negative.database,
        user: marker.roles.boundedReaderRole,
        max: 1,
      });
      negativeReader.on('error', () => {});
      try {
        await negative.installer.query(
          "update world_v2.projection_entitlement set active=false,revoked_at=now()where world_id=$1 and auth_subject=$2::uuid and classification='OFFICE_PRIVATE'and scope_key=$3",
          [
            marker.worldId,
            marker.subject,
            headers.find((h) => h.scope.officeId === 'SOCIAL')!.scope.scopeKey,
          ],
        );
        expect(
          (
            await readWith(negativeReader, (exec) =>
              store.readPageFrom(exec, {
                worldId: marker.worldId,
                officeId: 'SOCIAL',
                dataset: 'positions',
              }),
            )
          ).status,
        ).toBe('DENIED');
        await negative.installer.query(
          'update world_v2.projection_entitlement set active=true,revoked_at=null where world_id=$1 and auth_subject=$2::uuid',
          [marker.worldId, marker.subject],
        );
        await negative.installer.query(
          'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
          [marker.worldId],
        );
        expect(
          (
            await readWith(negativeReader, (exec) =>
              store.readPageFrom(exec, {
                worldId: marker.worldId,
                officeId: 'SOCIAL',
                dataset: 'positions',
              }),
            )
          ).status,
        ).toBe('STALE');
        evidence.actualEntitlementRevocationDenied = true;
        evidence.advancedHeadRefused = true;
      } finally {
        await negativeReader.end();
        await negative.drop();
        negative = undefined;
      }
    } finally {
      await bounded.end().catch(() => {});
      if (negative) await negative.drop();
      if (!sealed) await clone.drop();
      evidence.cleanup = {
        ownedWorkingTemplateSealedAndHandedOff: sealed,
        ownNegativeCloneDropped: negative === undefined,
        sharedReferenceContainerPreserved: true,
      };
      await writeFile(
        path.join(evidenceDirectory, 'native-evidence.json'),
        JSON.stringify(evidence, null, 2) + '\n',
      );
    }
  }, 600_000);
});
