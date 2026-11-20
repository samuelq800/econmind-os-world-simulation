/** Opt-in TEST_ONLY real committed Social checkpoint. Reuses persistent PG16
 * reference; never generates a seed, credentials, production install or Clock. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
  sealPostwarReferenceClone,
} from '../support/postwar-native-reference-db.js';
import {
  createPostwarOfficeProjectionStore,
  type PostwarOfficeProjectionPage,
} from '../../apps/world-worker/src/persistence/postwar-office-projection-store.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const checkpoint = process.env.ECONMIND_POSTWAR_CURRENT_SOCIAL_CHECKPOINT;
const native = checkpoint ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const identifier = (s: string) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(s))
    throw Error('TEST_ONLY_IDENTIFIER_REQUIRED');
  return '"' + s + '"';
};
native('current committed Social bounded native projection', () => {
  it('derives exact current country pages, rejects old/tampered/uncovered state, and seals the owned result', async () => {
    const descriptor = JSON.parse(await readFile(checkpoint!, 'utf8')) as {
      templateDatabase?: string;
      database?: string;
      referenceMarker?: string;
    };
    const template = descriptor.templateDatabase ?? descriptor.database;
    if (!template?.startsWith('postwar_clone_'))
      throw Error('OWNED_SOCIAL_CHECKPOINT_REQUIRED');
    const markerPath =
      descriptor.referenceMarker ??
      '/workspace/.cloud-setup/evidence/postwar-reference-persistent-20261028/reference-db.json';
    if (!markerPath.includes('postwar-reference-persistent-'))
      throw Error('PERSISTENT_REFERENCE_REQUIRED');
    const marker = await loadPostwarNativeReferenceMarker(markerPath),
      dir =
        process.env.ECONMIND_POSTWAR_CURRENT_SOCIAL_EVIDENCE_DIR ??
        '/workspace/office-connection-evidence/postwar-social-current-native-development-20261028';
    await mkdir(dir, { recursive: true });
    const clone = await clonePostwarNativeReference(
      marker,
      'current_social',
      template,
    );
    let sealed = false;
    let ancestor:
      Awaited<ReturnType<typeof clonePostwarNativeReference>> | undefined;
    const checks: Record<string, unknown> = {},
      queries: string[] = [];
    const evidence: Record<string, unknown> = {
      classification:
        'TEST_ONLY_ACTUAL_CORE_COMMITTED_SOCIAL_COUNTRY_PAGES_NOT_PRODUCTION',
      checkpoint,
      referenceMarker: markerPath,
      checks,
      queries,
      production: false,
      WorldClock: false,
    };
    const store = createPostwarOfficeProjectionStore({
      runtimeReaderRole: marker.roles.boundedReaderRole,
      authorizationPublisherRole: marker.roles.authorizationPublisherRole,
    });
    const read = async (
      dataset: string,
      expectedVersion?: string,
      pool: Pool = clone.boundedReader,
    ): Promise<PostwarOfficeProjectionPage> => {
      const c = await pool.connect();
      try {
        await c.query('begin isolation level repeatable read read only');
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          marker.subject,
        ]);
        const executor: SqlExecutor = {
          async query<Row extends object>(
            q: string,
            args: readonly unknown[] = [],
          ) {
            queries.push(q);
            const r = await c.query<Row>(q, [...args]);
            return { rows: r.rows, rowCount: r.rowCount };
          },
        };
        return await store.readPageFrom(executor, {
          worldId: marker.worldId,
          officeId: 'SOCIAL',
          dataset,
          limit: 100,
          ...(expectedVersion ? { expectedVersion } : {}),
        });
      } finally {
        await c.query('rollback').catch(() => {});
        c.release();
      }
    };
    try {
      const head = (
        await clone.installer.query(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
          [marker.worldId],
        )
      ).rows[0];
      expect(['2', '3']).toContain(head.world_version);
      expect(head.event_sequence).toBe(head.world_version);
      checks.actualHead = head;
      const exists = (
        await clone.installer.query(
          "select to_regclass('world_v2.postwar_office_projection_document')as t",
        )
      ).rows[0].t;
      if (!exists) {
        // Fixed global roles already exist in this isolated shared cluster.
        // Verify their exact non-login flags instead of attempting duplicates.
        const roles = (
          await clone.installer.query(
            'select rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication from pg_roles where rolname=any($1::text[])',
            [
              [
                'world_v2_postwar_projection_owner',
                'world_v2_postwar_projection_publisher',
                'world_v2_postwar_projection_reader',
              ],
            ],
          )
        ).rows;
        expect(roles).toHaveLength(3);
        for (const r of roles)
          for (const k of [
            'rolcanlogin',
            'rolsuper',
            'rolbypassrls',
            'rolcreaterole',
            'rolcreatedb',
            'rolreplication',
          ])
            expect(r[k]).toBe(false);
        const h0ddl = await readFile(
          path.join(root, 'database/proposals/postwar-office-derived-read.sql'),
          'utf8',
        );
        await clone.installer.query(
          h0ddl.replace(/^create role [^\n]+;\n/gmu, ''),
        );
        checks.reusedFixedClusterRoles = true;
        checks.h0ProposalSha256 = sha(h0ddl);
        const h0desc = JSON.parse(
          await readFile(
            '/workspace/office-connection-evidence/postwar-persistent-bounded-native-20261028/projection-template.json',
            'utf8',
          ),
        ) as {
          templateDatabase: string;
          seedFingerprint: string;
          admissionRef: string;
        };
        expect(h0desc.seedFingerprint).toBe(marker.seedFingerprint);
        expect(h0desc.admissionRef).toBe(marker.admissionRef);
        ancestor = await clonePostwarNativeReference(
          marker,
          'current_ancestor',
          h0desc.templateDatabase,
        );
        const docs = (
          await ancestor.installer.query(
            "select * from world_v2.postwar_office_projection_document where world_id=$1 and country_id='COUNTRY_01'and office_id='SOCIAL'and dataset in('positions','service-pools')",
            [marker.worldId],
          )
        ).rows;
        expect(docs).toHaveLength(2);
        for (const doc of docs) {
          expect(doc.seed_fingerprint).toBe(marker.seedFingerprint);
          expect(doc.admission_ref).toBe(marker.admissionRef);
          const cols = Object.keys(doc);
          await clone.installer.query(
            `insert into world_v2.postwar_office_projection_document(${cols.map(identifier).join(',')})values(${cols.map((_, i) => '$' + (i + 1)).join(',')})`,
            Object.values(doc),
          );
          const pages = (
            await ancestor.installer.query(
              'select * from world_v2.postwar_office_projection_page where document_ref=$1 order by page_index',
              [doc.document_ref],
            )
          ).rows;
          for (const p of pages) {
            const cs = Object.keys(p);
            await clone.installer.query(
              `insert into world_v2.postwar_office_projection_page(${cs.map(identifier).join(',')})values(${cs.map((_, i) => '$' + (i + 1)).join(',')})`,
              Object.values(p),
            );
          }
        }
        checks.ancestorCopy =
          'Exact immutable same-seed/admission H0 document/page records copied by TEST_ONLY installer; no caller Ready/JSON publication';
        await ancestor.drop();
        ancestor = undefined;
      }
      const ddl = await readFile(
        path.join(
          root,
          'database/proposals/postwar-social-current-derived-read.sql',
        ),
        'utf8',
      );
      await clone.installer.query(ddl);
      evidence.proposalSha256 = sha(ddl);
      await clone.installer.query(
        `grant world_v2_postwar_projection_reader to ${identifier(marker.roles.boundedReaderRole)}`,
      );
      const pc = await clone.installer.connect();
      try {
        await pc.query('set role world_v2_postwar_projection_publisher');
        const p = await pc.query(
          'select * from world_v2.publish_postwar_social_current_projection($1,$2)',
          [marker.worldId, 'COUNTRY_01'],
        );
        expect(p.rows).toHaveLength(2);
        checks.publication = p.rows;
        expect(
          (
            await pc.query(
              'select * from world_v2.publish_postwar_social_current_projection($1,$2)',
              [marker.worldId, 'COUNTRY_01'],
            )
          ).rows,
        ).toEqual(p.rows);
      } finally {
        await pc.query('reset role');
        pc.release();
      }
      const before = process.memoryUsage().heapUsed,
        start = performance.now();
      const positions = await read('positions'),
        pools = await read('service-pools');
      expect(positions.status).toBe('PAGE');
      expect(['PAGE', 'EMPTY']).toContain(pools.status);
      for (const r of [positions, pools])
        if (r.status === 'PAGE' || r.status === 'EMPTY') {
          expect(r.source.dataNature).toBe(
            'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION',
          );
          expect(r.source.worldVersion).toBe(head.world_version);
          expect(r.source.eventSequence).toBe(head.event_sequence);
          expect(r.scope.countryId).toBe('COUNTRY_01');
          expect(r.source.currentStateBinding?.sourceStateWorldVersion).toBe(
            head.world_version,
          );
          expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThanOrEqual(
            65536,
          );
        }
      checks.reads = {
        positions,
        pools,
        elapsedMs: performance.now() - start,
        observedHeapDeltaBytes: Math.max(
          0,
          process.memoryUsage().heapUsed - before,
        ),
        measurement: 'observed delta, not peak RSS',
      };
      expect((await read('offers')).status).toBe('STALE');
      expect((await read('positions', 'sha256:' + '0'.repeat(64))).status).toBe(
        'STALE',
      );
      checks.staticOpeningAndWrongVersionRejected = true;
      const raw = (
        await clone.installer.query(
          'select canonical_payload,payload_sha256 from world_v2.current_materialization where world_id=$1 and materialization_key=$2',
          [marker.worldId, 'SOCIAL_EMPLOYMENT_SERVICE_COUNTRY_01'],
        )
      ).rows[0];
      expect(
        Buffer.byteLength(raw.canonical_payload as string),
      ).toBeLessThanOrEqual(1048576);
      expect(raw.payload_sha256).toBe(
        'sha256:' + sha('SHA-256\n' + String(raw.canonical_payload)),
      );
      if (positions.status === 'PAGE')
        expect(
          positions.source.currentStateBinding?.canonicalMaterializationSha256,
        ).toBe(sha(String(raw.canonical_payload)));
      checks.independentBoundedCountryHashRecomputed = true;

      const client = await clone.boundedReader.connect();
      try {
        await expect(
          client.query('select canonical_payload from world_v2.opening_seed'),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          client.query(
            'select jsonb_agg(rows_text)from world_v2.postwar_social_current_page',
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          client.query(
            'select * from world_v2.postwar_current_social_witness($1,$2)',
            [marker.worldId, 'COUNTRY_01'],
          ),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        client.release();
      }
      checks.noRawSeedNoDirectAggregateNoWitnessExecute = true;
      // Mutations are isolated to rollback transactions; other tests never see
      // these counterfactual states. The final sealed clone keeps genuine H2/H3.
      const admin = await clone.installer.connect();
      const negativeRead = async () => {
        await admin.query(
          'set local session authorization ' +
            identifier(marker.roles.boundedReaderRole),
        );
        await admin.query(
          "select set_config('request.jwt.claim.sub',$1,true)",
          [marker.subject],
        );
        return (
          await admin.query(
            'select * from world_v2.read_postwar_office_projection_page($1,$2,$3,0,100,null)',
            [marker.worldId, 'SOCIAL', 'positions'],
          )
        ).rows[0].status as string;
      };
      try {
        await admin.query('begin');
        await admin.query(
          'update world_v2.world_head set world_version=world_version+1,event_sequence=event_sequence+1 where world_id=$1',
          [marker.worldId],
        );
        expect(await negativeRead()).toBe('UNAVAILABLE');
        await admin.query('rollback');
        checks.noPromotedOldHead = true;
        await admin.query('begin');
        await admin.query(
          "update world_v2.current_materialization set world_version=world_version+1,canonical_payload='{}'where world_id=$1 and materialization_key=$2",
          [marker.worldId, 'SOCIAL_EMPLOYMENT_SERVICE_COUNTRY_01'],
        );
        expect(await negativeRead()).toBe('UNAVAILABLE');
        await admin.query('rollback');
        checks.materializationTamperRejected = true;
      } finally {
        await admin.query('rollback').catch(() => {});
        admin.release();
      }
      expect(
        queries.every(
          (q) =>
            !q.includes('canonical_payload') && !q.includes('opening_seed'),
        ),
      ).toBe(true);
      checks.onlineQueryGraphOnlyBoundedFunctions = true;
      await clone.close();
      await sealPostwarReferenceClone(marker, clone.database);
      sealed = true;
      const handoff = {
        schemaVersion: 'postwar-current-social-projection-template-v1',
        classification:
          'TEST_ONLY_ACTUAL_COMMITTED_SOCIAL_CURRENT_PAGES_NOT_PRODUCTION',
        referenceMarker: markerPath,
        templateDatabase: clone.database,
        worldId: marker.worldId,
        seedFingerprint: marker.seedFingerprint,
        admissionRef: marker.admissionRef,
        head,
        proposalSha256: sha(ddl),
        dataNature:
          'ADMITTED_CURRENT_SOCIAL_DERIVED_FROM_COMMITTED_EVENT_MATERIALIZATION',
      };
      await writeFile(
        path.join(dir, 'current-template.json'),
        JSON.stringify(handoff, null, 2) + '\n',
      );
      evidence.handoff = handoff;
    } finally {
      try {
        await ancestor?.drop();
      } finally {
        try {
          if (!sealed) await clone.drop();
        } finally {
          await writeFile(
            path.join(dir, 'native-evidence.json'),
            JSON.stringify(evidence, null, 2) + '\n',
          );
        }
      }
    }
  }, 120_000);
});
