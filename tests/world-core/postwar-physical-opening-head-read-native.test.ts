/** Opt-in actual persistent PG history bridge. Copies only immutable derived
 * physical pages between owned same-seed/admission clones. No seed read, Core
 * parse/reseed, event copy, role grant, production action or Clock. */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clonePostwarNativeReference,
  loadPostwarNativeReferenceMarker,
} from '../support/postwar-native-reference-db.js';
import {
  createPostwarPhysicalOpeningHeadReader,
  POSTWAR_PHYSICAL_OPENING_DATASETS,
  type PostwarPhysicalOpeningRequest,
} from '../../apps/world-worker/src/persistence/postwar-physical-opening-head-read.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const h3Path = process.env.ECONMIND_POSTWAR_PHYSICAL_OPENING_H3_TEMPLATE;
const h0Path = process.env.ECONMIND_POSTWAR_PHYSICAL_OPENING_H0_TEMPLATE;
const requested = h3Path !== undefined || h0Path !== undefined;
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function losslessRows(bytes: string): unknown[] {
  const parse = JSON.parse as (
    s: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  return parse(bytes, (_key, value, context) =>
    typeof value === 'number' ? context.source : value,
  ) as unknown[];
}
describe.skipIf(!requested)(
  'actual persistent physical opening pages after committed Social history',
  () => {
    it('reads all five immutable datasets at H3 and retains role, admission, scope, paging, revocation and source hash fences', async () => {
      if (!h3Path || !h0Path)
        throw Error('BOTH_ACTUAL_H3_AND_H0_TEMPLATE_DESCRIPTORS_REQUIRED');
      const h3Bytes = await readFile(h3Path, 'utf8'),
        h0Bytes = await readFile(h0Path, 'utf8');
      const h3 = JSON.parse(h3Bytes),
        h0 = JSON.parse(h0Bytes);
      expect(h3.referenceMarker).toBe(h0.referenceMarker);
      const marker = await loadPostwarNativeReferenceMarker(h3.referenceMarker);
      expect(h3.seedFingerprint).toBe(marker.seedFingerprint);
      expect(h0.seedFingerprint).toBe(marker.seedFingerprint);
      expect(h3.admissionRef).toBe(marker.admissionRef);
      expect(h0.admissionRef).toBe(marker.admissionRef);
      const ancestor = await clonePostwarNativeReference(
        marker,
        'physical_history_h0',
        h0.templateDatabase,
      );
      let target:
        Awaited<ReturnType<typeof clonePostwarNativeReference>> | undefined;
      const evidence: Record<string, unknown> = {
        classification:
          'ACTUAL_PERSISTENT_NATIVE_HISTORICAL_SOURCE_NOT_CURRENT_PHYSICAL_STATE_OR_PRODUCTION',
        h3Descriptor: h3Path,
        h3DescriptorSha256: sha(h3Bytes),
        h0Descriptor: h0Path,
        h0DescriptorSha256: sha(h0Bytes),
        seedFingerprint: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        sourceBundleSha256: marker.sourceBundleSha256,
        canonicalPayloadRead: false,
        eventsCopied: false,
        sourceSeedChanged: false,
        WorldClock: false,
      };
      const statements: string[] = [];
      let failure: unknown;
      try {
        target = await clonePostwarNativeReference(
          marker,
          'physical_history_h3',
          h3.templateDatabase,
        );
        const targetDb = target;
        const before = (
          await target.installer.query(
            'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
            [marker.worldId],
          )
        ).rows[0];
        expect(before).toEqual({ world_version: '3', event_sequence: '3' });
        const admission = (
          await target.installer.query(
            'select admission_ref,seed_fingerprint from world_v2.runtime_opening_admission where world_id=$1',
            [marker.worldId],
          )
        ).rows[0];
        expect(admission).toEqual({
          admission_ref: marker.admissionRef,
          seed_fingerprint: marker.seedFingerprint,
        });
        const documents = (
          await ancestor.installer.query<{ body: string }>(
            "select row_to_json(d)::text as body from world_v2.postwar_office_projection_document d where world_id=$1 and country_id=$2 and office_id in('INDUSTRY','TRADE','CAPTAIN') order by office_id,dataset",
            [marker.worldId, marker.countryId],
          )
        ).rows.map((r) => JSON.parse(r.body));
        expect(documents).toHaveLength(5);
        const copied: unknown[] = [];
        await target.installer.query('begin');
        try {
          for (const document of documents) {
            expect(document.seed_fingerprint).toBe(marker.seedFingerprint);
            expect(document.admission_ref).toBe(marker.admissionRef);
            expect(document.source_bundle_sha256).toBe(
              marker.sourceBundleSha256,
            );
            expect(document.world_version).toBe(0);
            expect(document.event_sequence).toBe(0);
            await target.installer.query(
              'insert into world_v2.postwar_office_projection_document select * from json_populate_record(null::world_v2.postwar_office_projection_document,$1::json)on conflict(document_ref)do nothing',
              [JSON.stringify(document)],
            );
            const pages = (
              await ancestor.installer.query<{ body: string }>(
                'select row_to_json(p)::text as body from world_v2.postwar_office_projection_page p where document_ref=$1 order by page_index',
                [document.document_ref],
              )
            ).rows.map((r) => JSON.parse(r.body));
            expect(pages).toHaveLength(document.page_count);
            for (const p of pages) {
              expect(sha(p.rows_text)).toBe(p.page_sha256);
              await target.installer.query(
                'insert into world_v2.postwar_office_projection_page select * from json_populate_record(null::world_v2.postwar_office_projection_page,$1::json)on conflict(document_ref,page_index)do nothing',
                [JSON.stringify(p)],
              );
            }
            copied.push({
              office: document.office_id,
              dataset: document.dataset,
              sourceVersion: document.source_version,
              sourcePointer: document.source_pointer,
              rows: document.total_rows,
              documentSha256: document.document_sha256,
              sourceBodySha256: sha(JSON.stringify(document)),
              pages: pages.map((p) => ({
                page: p.page_index,
                pageSha256: p.page_sha256,
                rows: p.row_count,
              })),
            });
          }
          await target.installer.query('commit');
        } catch (error) {
          await target.installer.query('rollback');
          throw error;
        }
        const sqlPath =
          'database/proposals/postwar-physical-opening-facts-read.sql';
        const sql = await readFile(path.join(root, sqlPath), 'utf8');
        await target.installer.query(sql);
        evidence.proposal = { path: sqlPath, sha256: sha(sql) };
        evidence.copiedDerivedOnly = copied;
        const reader = createPostwarPhysicalOpeningHeadReader({
          runtimeReaderRole: marker.roles.boundedReaderRole,
          authorizationPublisherRole: marker.roles.authorizationPublisherRole,
          expectedSeedFingerprint: marker.seedFingerprint,
        });
        const run = async <T>(
          consume: (tx: SqlExecutor) => Promise<T>,
          subject = marker.subject,
        ) => {
          const c = await targetDb.boundedReader.connect();
          try {
            await c.query('begin isolation level repeatable read read only');
            await c.query(
              "select set_config('request.jwt.claim.sub',$1,true)",
              [subject],
            );
            return await consume({
              async query<Row extends object>(
                q: string,
                args: readonly unknown[] = [],
              ) {
                statements.push(q);
                const r = await c.query<Row>(q, [...args]);
                return { rows: r.rows, rowCount: r.rowCount };
              },
            });
          } finally {
            try {
              await c.query('rollback');
            } finally {
              c.release();
            }
          }
        };
        const reads: unknown[] = [];
        for (const officeId of Object.keys(
          POSTWAR_PHYSICAL_OPENING_DATASETS,
        ) as (keyof typeof POSTWAR_PHYSICAL_OPENING_DATASETS)[]) {
          for (const dataset of POSTWAR_PHYSICAL_OPENING_DATASETS[officeId]) {
            const input: PostwarPhysicalOpeningRequest = {
              worldId: marker.worldId,
              officeId,
              dataset,
            };
            const result = await run((tx) => reader.readPageFrom(tx, input));
            expect(['PAGE', 'EMPTY']).toContain(result.status);
            if (result.status !== 'PAGE' && result.status !== 'EMPTY')
              throw Error('ACTUAL_HISTORICAL_PAGE_REQUIRED');
            const original = documents.find(
              (d) => d.office_id === officeId && d.dataset === dataset,
            )!;
            expect(result.page.total).toBe(original.total_rows);
            expect(result.scope.countryId).toBe(marker.countryId);
            expect(result.scope.officeId).toBe(officeId);
            expect(result.source).toMatchObject({
              dataNature: 'ADMITTED_IMMUTABLE_OPENING_FACTS',
              worldVersion: '0',
              eventSequence: '0',
              originWorldVersion: '0',
              originEventSequence: '0',
              observedHead: { worldVersion: '3', eventSequence: '3' },
              sourceVersion: original.source_version,
              admissionRef: marker.admissionRef,
            });
            expect(result.currentState.status).toBe('UNAVAILABLE');
            expect(JSON.stringify(result)).not.toContain('COUNTRY_02');
            expect(
              Buffer.byteLength(JSON.stringify(result)),
            ).toBeLessThanOrEqual(65536);
            const originalPage = await ancestor.installer.query(
              'select rows_text from world_v2.postwar_office_projection_page where document_ref=$1 and page_index=0',
              [original.document_ref],
            );
            expect(result.rows).toEqual(
              losslessRows(originalPage.rows[0].rows_text).slice(0, 25),
            );
            expect(
              await run((tx) =>
                reader.readPageFrom(tx, { ...input, view: 'CURRENT' }),
              ),
            ).toEqual({
              status: 'UNAVAILABLE',
              code: 'CURRENT_PHYSICAL_STATE_REPLAY_REQUIRED',
            });
            expect(
              (
                await run((tx) =>
                  reader.readPageFrom(tx, {
                    ...input,
                    expectedVersion: `sha256:${'0'.repeat(64)}`,
                  }),
                )
              ).status,
            ).toBe('STALE');
            if (result.page.total > 1) {
              const next = await run((tx) =>
                reader.readPageFrom(tx, {
                  ...input,
                  offset: 1,
                  limit: 1,
                  expectedVersion: result.source.sourceVersion,
                }),
              );
              if (next.status !== 'PAGE')
                throw Error('ACTUAL_SECOND_ROW_REQUIRED');
              expect(next.rows).toEqual(
                losslessRows(originalPage.rows[0].rows_text).slice(1, 2),
              );
            }
            reads.push({
              officeId,
              dataset,
              status: result.status,
              total: result.page.total,
              sourceVersion: result.source.sourceVersion,
            });
          }
        }
        const input: PostwarPhysicalOpeningRequest = {
          worldId: marker.worldId,
          officeId: 'INDUSTRY',
          dataset: 'opening-inventory-entries',
        };
        expect(
          (
            await run(
              (tx) => reader.readPageFrom(tx, input),
              '22222222-2222-4222-8222-222222222222',
            )
          ).status,
        ).toBe('DENIED');
        await expect(
          run((tx) =>
            reader.readPageFrom(
              tx,
              Object.assign({}, input, { countryId: 'COUNTRY_02' }),
            ),
          ),
        ).rejects.toThrow('COUNTRY_SCOPE_IS_SERVER_SELECTED');
        expect(
          (
            await run((tx) =>
              reader.readPageFrom(tx, {
                ...input,
                worldId: 'WORLD_FOREIGN_PHYSICAL_OPENING',
              }),
            )
          ).status,
        ).toBe('DENIED');
        for (const q of [
          'select canonical_payload from world_v2.opening_seed',
          'select * from world_v2.postwar_office_projection_document',
          'select jsonb_agg(rows_text)from world_v2.postwar_office_projection_page',
        ]) {
          await expect(run((tx) => tx.query(q))).rejects.toMatchObject({
            code: '42501',
          });
        }
        const privileged = await target.installer.connect();
        try {
          await privileged.query(
            'begin isolation level repeatable read read only',
          );
          await privileged.query(
            "select set_config('request.jwt.claim.sub',$1,true)",
            [marker.subject],
          );
          await expect(
            reader.readPageFrom(
              {
                async query<Row extends object>(
                  q: string,
                  args: readonly unknown[] = [],
                ) {
                  const r = await privileged.query<Row>(q, [...args]);
                  return { rows: r.rows, rowCount: r.rowCount };
                },
              },
              input,
            ),
          ).rejects.toThrow();
        } finally {
          try {
            await privileged.query('rollback');
          } finally {
            privileged.release();
          }
        }
        const publisher = await target.installer.connect();
        try {
          await publisher.query(
            'begin isolation level repeatable read read only',
          );
          await publisher.query(
            'set local role world_v2_postwar_projection_publisher',
          );
          await publisher.query(
            "select set_config('request.jwt.claim.sub',$1,true)",
            [marker.subject],
          );
          await expect(
            publisher.query(
              'select * from world_v2.read_postwar_physical_opening_facts_page($1,$2,$3,0,25,null)',
              [marker.worldId, 'INDUSTRY', 'opening-inventory-entries'],
            ),
          ).rejects.toMatchObject({ code: '42501' });
        } finally {
          try {
            await publisher.query('rollback');
          } finally {
            publisher.release();
          }
        }
        const revokedCapabilities = await target.installer.query<{
          capability: string;
        }>(
          "update world_v2.current_commit_authorization set active=false where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='INDUSTRY'and active returning capability",
          [marker.worldId, marker.subject, marker.countryId],
        );
        expect(revokedCapabilities.rows.length).toBeGreaterThan(0);
        expect((await run((tx) => reader.readPageFrom(tx, input))).status).toBe(
          'DENIED',
        );
        await target.installer.query(
          "update world_v2.current_commit_authorization set active=true where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='INDUSTRY'and capability=any($4::text[])",
          [
            marker.worldId,
            marker.subject,
            marker.countryId,
            revokedCapabilities.rows.map((r) => r.capability),
          ],
        );
        const scopeKey = `OFFICE_${Buffer.from(marker.countryId).toString('hex').toUpperCase()}_${Buffer.from('INDUSTRY').toString('hex').toUpperCase()}`;
        await target.installer.query(
          'update world_v2.projection_entitlement set active=false,revoked_at=clock_timestamp()where world_id=$1 and scope_key=$2 and auth_subject=$3::uuid and active',
          [marker.worldId, scopeKey, marker.subject],
        );
        await expect(
          run((tx) => reader.readPageFrom(tx, input)),
        ).rejects.toThrow('CURRENT_SEAT_NOT_COHERENT');
        await target.installer.query(
          'update world_v2.projection_entitlement set active=true,revoked_at=null where world_id=$1 and scope_key=$2 and auth_subject=$3::uuid',
          [marker.worldId, scopeKey, marker.subject],
        );
        const doc = documents.find(
          (d) =>
            d.office_id === 'INDUSTRY' &&
            d.dataset === 'opening-inventory-entries',
        )!;
        await expect(
          target.installer.query(
            'insert into world_v2.postwar_office_projection_page(document_ref,world_id,country_id,office_id,page_index,row_offset,row_count,rows_text,page_sha256)values($1,$2,$3,$4,999,99999,0,$5,$6)',
            [
              doc.document_ref,
              marker.worldId,
              marker.countryId,
              'INDUSTRY',
              '[]',
              '0'.repeat(64),
            ],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await target.installer.query(
          'insert into world_v2.postwar_office_projection_revocation(document_ref,world_id,reason_ref)values($1,$2,$3)',
          [doc.document_ref, marker.worldId, 'TEST_ONLY_HISTORY_REVOCATION'],
        );
        expect((await run((tx) => reader.readPageFrom(tx, input))).status).toBe(
          'UNAVAILABLE',
        );
        expect(
          (
            await target.installer.query(
              'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
              [marker.worldId],
            )
          ).rows[0],
        ).toEqual(before);
        evidence.status = 'PASS';
        evidence.reads = reads;
        evidence.head = before;
        evidence.successfulCanonicalPayloadReads = 0;
        evidence.deniedRawSeedSelectProbe = true;
        evidence.runtimeQueries = statements.filter((q) =>
          q.startsWith('select * from world_v2.read_'),
        );
      } catch (error) {
        evidence.status = 'FAIL';
        evidence.error = {
          name: error instanceof Error ? error.name : 'UNKNOWN',
          message: error instanceof Error ? error.message : String(error),
        };
        failure = error;
      } finally {
        const cleanup: string[] = [];
        for (const c of [target, ancestor])
          if (c)
            try {
              await c.drop();
            } catch (error) {
              cleanup.push(
                error instanceof Error ? error.message : String(error),
              );
            }
        evidence.cleanup = {
          ownedClonesRemoved: cleanup.length === 0,
          errors: cleanup,
        };
        if (cleanup.length) {
          evidence.status = 'FAIL';
          failure ??= Error('OWNED_HISTORY_CLONE_CLEANUP_FAILED');
        }
        const out =
          process.env.ECONMIND_POSTWAR_PHYSICAL_OPENING_EVIDENCE_DIR ??
          '/tmp/postwar-physical-opening-native';
        await mkdir(out, { recursive: true });
        await writeFile(
          path.join(out, 'receipt.json'),
          JSON.stringify(evidence, null, 2) + '\n',
        );
      }
      if (failure !== undefined) throw failure;
    }, 30_000);
  },
);
