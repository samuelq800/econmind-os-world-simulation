/** Actual retained PG only; no Node, proof, new World, Clock or economy. */
import { it, expect } from 'vitest';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
  sealPostwarReferenceClone,
} from '../support/postwar-native-reference-db.js';
import { readRetainedPostwarPowerCatalogFrom } from '../support/postwar-retained-power-upgrade.js';
import { readRegisteredCurrentEconomicSnapshotFrom } from '../support/registered-current-read-repair-checkpoint.js';
import { wireColdError } from '../../tools/office-connection/native-mixed-cold-errors.mjs';
import { createPostwarPhysicalInventoryProvenanceReader } from '../../apps/world-worker/src/persistence/postwar-physical-inventory-provenance.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const native =
  process.env.ECONMIND_C10_OPENING_READ_REPAIR_NATIVE === '1' ? it : it.skip;
native(
  'repairs real missing C10 origin0 bases through the restricted publisher at H3',
  async () => {
    const root = new URL('../..', import.meta.url).pathname,
      base = '/workspace/.cloud-setup/evidence/c10-retained-preflight-02',
      out = process.env.ECONMIND_C10_OPENING_READ_REPAIR_EVIDENCE;
    assert(
      typeof out === 'string' &&
        out.startsWith('/workspace/.cloud-setup/evidence/'),
    );
    await mkdir(out, { recursive: true });
    const save = (n: string, v: unknown) =>
      writeFile(out + '/' + n, JSON.stringify(v, null, 2) + '\n');
    const report: Record<string, unknown> = {
      status: 'RUNNING',
      classification: 'WIP_SQL_ACTUAL_PG_NOT_FINAL_CANDIDATE',
      Node: false,
      proof: false,
      economicPost: 0,
      Clock: false,
    };
    let marker:
        | Awaited<ReturnType<typeof loadPostwarNativeReferenceMarker>>
        | undefined,
      clone:
        Awaited<ReturnType<typeof clonePostwarNativeReference>> | undefined,
      publisher: Pool | undefined,
      failure: unknown;
    try {
      const cpRaw = await readFile(
        base + '/pg/retained-checkpoint.json',
        'utf8',
      );
      assert.equal(
        sha(cpRaw),
        'df5b18ac91ec828040436ad9545f6c2df72cff0f8c2113ef90d8032ffdff073d',
      );
      const cp = JSON.parse(cpRaw) as {
        ownedContainer: string;
        ownershipNonce: string;
        templateDatabase: string;
      };
      const side = JSON.parse(
        await readFile(base + '/schema-ancestry-sidecar.json', 'utf8'),
      ) as {
        actualAfterCatalog: { path: string; sha256: string };
        additionalDdlReceipt: { path: string; sha256: string };
      };
      for (const e of [side.actualAfterCatalog, side.additionalDdlReceipt])
        assert.equal(sha(await readFile(e.path, 'utf8')), e.sha256);
      assert.equal(
        execFileSync(
          'docker',
          [
            'inspect',
            cp.ownedContainer,
            '--format',
            '{{index .Config.Labels "econmind.reference.nonce"}} {{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}',
          ],
          { encoding: 'utf8' },
        ).trim(),
        cp.ownershipNonce + ' exited 0 false',
      );
      execFileSync('docker', ['start', cp.ownedContainer]);
      marker = await loadPostwarNativeReferenceMarker(
        base + '/pg/reference-db.json',
      );
      const ready = new Pool({
        host: marker.socket,
        port: marker.port,
        database: 'postgres',
        user: 'postgres',
        max: 1,
        ssl: false,
        password: async () => '',
        connectionTimeoutMillis: 500,
      });
      try {
        for (let n = 0; ; n++) {
          try {
            await ready.query('select 1');
            break;
          } catch (e) {
            if (n === 50) throw e;
            await new Promise((r) => setTimeout(r, 100));
          }
        }
      } finally {
        await ready.end();
      }
      clone = await clonePostwarNativeReference(
        marker,
        'opening_bases',
        cp.templateDatabase,
      );
      report.parent = cp;
      report.database = clone.database;
      const client = await clone.installer.connect();
      let beforeCatalog: Awaited<
        ReturnType<typeof readRetainedPostwarPowerCatalogFrom>
      >;
      try {
        beforeCatalog = await readRetainedPostwarPowerCatalogFrom(client);
        assert.deepEqual(
          beforeCatalog,
          JSON.parse(await readFile(side.actualAfterCatalog.path, 'utf8')),
        );
      } finally {
        client.release();
      }
      const before = await readRegisteredCurrentEconomicSnapshotFrom(
        clone.installer,
        marker.worldId,
      );
      await save('before.json', before);
      const oldDocs = (
        await clone.installer.query<{ row: Record<string, unknown> }>(
          'select to_jsonb(d)row from world_v2.postwar_office_projection_document d order by document_ref',
        )
      ).rows;
      const seedQuery =
          "select seed_id,seed_fingerprint,encode(sha256(convert_to(canonical_payload,'UTF8')),'hex')sha from world_v2.opening_seed where world_id=$1",
        sourceBefore = (
          await clone.installer.query<{ sha: string }>(seedQuery, [
            marker.worldId,
          ])
        ).rows;
      const sql = await readFile(
        root +
          '/database/proposals/postwar-office-opening-read-base-repair.sql',
        'utf8',
      );
      await clone.installer.query(sql);
      report.ddl = {
        status: 'DDL_COMMITTED_ACKNOWLEDGED',
        sourceSha256: sha(sql),
      };
      const c = await clone.installer.connect();
      let afterCatalog;
      try {
        afterCatalog = await readRetainedPostwarPowerCatalogFrom(c);
      } finally {
        c.release();
      }
      const signature =
          'world_v2.repair_postwar_office_opening_read_bases(text,text,text,text,text,text)',
        added = afterCatalog.functions.filter((f) => f.signature === signature);
      expect(added).toHaveLength(1);
      assert.deepEqual(
        {
          ...afterCatalog,
          functions: afterCatalog.functions.filter(
            (f) => f.signature !== signature,
          ),
        },
        beforeCatalog,
      );
      report.function = added[0];
      await save('catalog-after.json', afterCatalog);
      const pins = (
          await clone.installer.query(
            "select source_bundle_sha256 from world_v2.runtime_admission_publication_permit p where p.world_id=$1 and 'ADMISSION_'||upper(p.authorization_sha256)=$2 and p.seed_fingerprint=$3 and not exists(select 1 from world_v2.runtime_admission_publication_revocation r where r.authorization_id=p.authorization_id)",
            [marker.worldId, marker.admissionRef, marker.seedFingerprint],
          )
        ).rows[0]!,
        args = [
          marker.worldId,
          'COUNTRY_10',
          marker.seedFingerprint,
          sourceBefore[0]!.sha,
          pins.source_bundle_sha256,
          marker.admissionRef,
        ];
      const restore = JSON.parse(
        await readFile(base + '/pg/restore-evidence.json', 'utf8'),
      ) as {
        roles: { publication: string; read: string };
        c10HttpActor: { authSubject: string };
      };
      publisher = new Pool({
        host: marker.socket,
        port: marker.port,
        database: clone.database,
        user: restore.roles.publication,
        max: 1,
        ssl: false,
        password: async () => '',
        connectionTimeoutMillis: 10000,
      });
      const pub = async (q: string, p: readonly unknown[]) => {
        const x = await publisher!.connect();
        try {
          await x.query('begin isolation level repeatable read');
          await x.query("set local statement_timeout='120s'");
          const r = await x.query(q, [...p]);
          await x.query('commit');
          return r.rows;
        } catch (e) {
          await x.query('rollback');
          throw e;
        } finally {
          x.release();
        }
      };
      const query =
          'select * from world_v2.repair_postwar_office_opening_read_bases($1,$2,$3,$4,$5,$6)',
        start = performance.now(),
        docs = await pub(query, args);
      report.repairMilliseconds = performance.now() - start;
      expect(docs).toHaveLength(13);
      expect(
        docs.every(
          (d) =>
            d.country_id === 'COUNTRY_10' &&
            String(d.world_version) === '0' &&
            String(d.event_sequence) === '0',
        ),
      ).toBe(true);
      report.documents = docs;
      expect(await pub(query, args)).toEqual(docs);
      await expect(
        pub(query, [...args.slice(0, 3), '0'.repeat(64), ...args.slice(4)]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pub(
          'select * from world_v2.publish_postwar_office_projection($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            marker.worldId,
            'COUNTRY_10',
            'FINANCE',
            'currency-fx',
            ...args.slice(2),
          ],
        ),
      ).rejects.toMatchObject({
        code: '55000',
        message: 'POSTWAR_PROJECTION_H0_REQUIRED',
      });
      const provenance = await pub(
        'select * from world_v2.publish_postwar_inventory_provenance_v2($1,$2,$3,$4,$5,$6)',
        args,
      );
      expect(provenance).toHaveLength(2);
      report.provenance = provenance;
      const complete = await pub(
        'select * from world_v2.publish_postwar_complete_opening_inventory($1,$2,$3,$4,$5,$6)',
        args,
      );
      expect(complete).toHaveLength(2);
      report.complete = complete;
      const regional = await pub(
        'select * from world_v2.repair_postwar_industry_regional_source_capacity($1,$2)',
        args.slice(0, 2),
      );
      expect(regional).toHaveLength(1);
      report.regional = regional;
      const reader = new Pool({
        host: marker.socket,
        port: marker.port,
        database: clone.database,
        user: restore.roles.read,
        max: 1,
        ssl: false,
        password: async () => '',
        connectionTimeoutMillis: 10000,
      });
      try {
        await expect(reader.query(query, args)).rejects.toMatchObject({
          code: '42501',
        });
        const low = await reader.connect();
        try {
          await low.query('begin isolation level repeatable read read only');
          await low.query(
            "select set_config('request.jwt.claim.sub',$1,true)",
            [restore.c10HttpActor.authSubject],
          );
          await low.query('set local role world_v2_postwar_projection_reader');
          const port = createPostwarPhysicalInventoryProvenanceReader({
            runtimeReaderRole: 'world_v2_postwar_projection_reader',
            authorizationPublisherRole: 'world_v2_postwar_projection_publisher',
            expectedSeedFingerprint: marker.seedFingerprint,
          });
          const page = await port.readPageFrom(
            {
              query: async <T extends object>(
                q: string,
                p: readonly unknown[] = [],
              ) => {
                const result = await low.query<T>(q, [...p]);
                return { rows: result.rows, rowCount: result.rowCount };
              },
            },
            {
              worldId: marker.worldId,
              officeId: 'INDUSTRY',
              dataset: 'opening-inventory-entries',
              limit: 64,
            },
          );
          expect(page.status).toBe('PAGE');
          report.actualLowReaderOpeningStock = page;
          await low.query('rollback');
        } finally {
          await low.query('rollback');
          low.release();
        }
      } finally {
        await reader.end();
      }
      await expect(
        pub(query, ['WORLD_TEST_ONLY_UNKNOWN_REPAIR', ...args.slice(1)]),
      ).rejects.toMatchObject({ code: '55000' });
      expect(
        (
          await clone.installer.query(
            'select to_jsonb(d)row from world_v2.postwar_office_projection_document d where document_ref=any($1::text[])order by document_ref',
            [oldDocs.map((d) => d.row.document_ref)],
          )
        ).rows,
      ).toEqual(oldDocs);
      expect(
        (await clone.installer.query(seedQuery, [marker.worldId])).rows,
      ).toEqual(sourceBefore);
      const after = await readRegisteredCurrentEconomicSnapshotFrom(
        clone.installer,
        marker.worldId,
      );
      await save('after.json', after);
      expect(after.economic).toEqual(before.economic);
      report.economicSevenUnchanged = true;
      report.oldDocumentsUnchanged = true;
      report.actualCanonicalSourceUnchanged = true;
      report.status =
        'SOURCE_BASE_REPAIR_PASSED_CURRENT_H3_CORE_PUBLICATION_NOT_RUN';
    } catch (e) {
      failure = e;
      report.status = 'FAIL';
      report.error = wireColdError(e);
    } finally {
      const errors = [];
      try {
        await publisher?.end();
        if (clone && marker) {
          const sessions = (
            await clone.installer.query(
              'select count(*)::text count from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()',
              [clone.database],
            )
          ).rows;
          assert.equal(sessions[0]?.count, '0');
          await clone.close();
          await sealPostwarReferenceClone(marker, clone.database);
          report.retainedTemplate = clone.database;
        }
      } catch (e) {
        errors.push(wireColdError(e));
      }
      try {
        execFileSync('docker', [
          'stop',
          '--time',
          '10',
          'econmind-postwar-reference-9cf04019',
        ]);
        report.stopped = execFileSync(
          'docker',
          [
            'inspect',
            'econmind-postwar-reference-9cf04019',
            '--format',
            '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}',
          ],
          { encoding: 'utf8' },
        ).trim();
      } catch (e) {
        errors.push(wireColdError(e));
      }
      report.cleanupErrors = errors;
      await save('report.json', report);
      if (!failure && errors.length)
        failure = Error('C10_REPAIR_CLEANUP_FAILED');
    }
    if (failure) throw failure;
  },
  300000,
);
