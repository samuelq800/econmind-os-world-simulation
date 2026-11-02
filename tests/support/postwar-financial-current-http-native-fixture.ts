/** Isolated existing c427 H5/H6 clone; never bootstrap, production or Clock. */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from 'vitest';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
  sealPostwarReferenceClone,
} from './postwar-native-reference-db.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { publishPostwarFinancialCurrentProjectionFrom } from '../../apps/world-worker/src/persistence/postwar-financial-current-publication.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const root = path.resolve(import.meta.dirname, '../..'),
  sha = (s: string) => createHash('sha256').update(s).digest('hex');
export async function createFinancialCurrentHttpNativeFixture(
  checkpoint: string,
  evidenceDirectory: string,
) {
  const ck = JSON.parse(await readFile(checkpoint, 'utf8')) as {
    referenceMarker: string;
    database: string;
  };
  const marker = await loadPostwarNativeReferenceMarker(ck.referenceMarker),
    clone = await clonePostwarNativeReference(
      marker,
      'financial_http',
      ck.database,
    );
  let publication: Awaited<
    ReturnType<typeof publishPostwarFinancialCurrentProjectionFrom>
  >;
  try {
    // Genuine same-seed H0 derived originals, never republished at fake H0.
    const h0 = JSON.parse(
      await readFile(
        '/workspace/office-connection-evidence/postwar-persistent-bounded-native-20261028/projection-template.json',
        'utf8',
      ),
    ) as { templateDatabase: string };
    const ancestor = await clonePostwarNativeReference(
      marker,
      'financial_ancestor',
      h0.templateDatabase,
    );
    try {
      if (
        !(
          await clone.installer.query(
            "select to_regclass('world_v2.postwar_office_projection_document') as t",
          )
        ).rows[0]?.t
      ) {
        const proposal = await readFile(
          path.join(root, 'database/proposals/postwar-office-derived-read.sql'),
          'utf8',
        );
        await clone.installer.query(
          proposal.replace(
            /^create role world_v2_postwar_projection_(owner|publisher|reader) .*;$/gmu,
            '',
          ),
        );
      }
      const docs = (
        await ancestor.installer.query(
          "select * from world_v2.postwar_office_projection_document where world_id=$1 and country_id=$2 and(office_id in('FINANCE','CENTRAL_BANK')or(office_id='SOCIAL'and dataset in('positions','service-pools')))",
          [marker.worldId, marker.countryId],
        )
      ).rows;
      expect(docs).toHaveLength(9);
      const ident = (v: string) => {
        if (!/^[a-z_0-9]+$/u.test(v)) throw Error('COLUMN_IDENTIFIER');
        return '"' + v + '"';
      };
      for (const doc of docs) {
        expect(doc.seed_fingerprint).toBe(marker.seedFingerprint);
        expect(doc.admission_ref).toBe(marker.admissionRef);
        if (
          (
            await clone.installer.query(
              'select 1 from world_v2.postwar_office_projection_document where document_ref=$1',
              [doc.document_ref],
            )
          ).rowCount
        )
          continue;
        const cols = Object.keys(doc);
        await clone.installer.query(
          `insert into world_v2.postwar_office_projection_document(${cols.map(ident).join(',')})values(${cols.map((_, i) => '$' + (i + 1)).join(',')})`,
          Object.values(doc),
        );
        for (const page of (
          await ancestor.installer.query(
            'select * from world_v2.postwar_office_projection_page where document_ref=$1',
            [doc.document_ref],
          )
        ).rows) {
          const cols = Object.keys(page);
          await clone.installer.query(
            `insert into world_v2.postwar_office_projection_page(${cols.map(ident).join(',')})values(${cols.map((_, i) => '$' + (i + 1)).join(',')})`,
            Object.values(page),
          );
        }
      }
    } finally {
      await ancestor.drop();
    }
    for (const file of [
      'postwar-social-current-derived-read.sql',
      'postwar-social-current-prefix-read.sql',
      'postwar-financial-current-derived-read.sql',
    ]) {
      const exists =
        file === 'postwar-social-current-derived-read.sql'
          ? "select to_regclass('world_v2.postwar_social_current_document')as t"
          : file === 'postwar-social-current-prefix-read.sql'
            ? "select to_regclass('world_v2.postwar_social_prefix_scope')as t"
            : "select to_regclass('world_v2.postwar_financial_current_document')as t";
      if (!(await clone.installer.query(exists)).rows[0]?.t) {
        console.info('FINANCIAL_CURRENT_INSTALL:' + file);
        await clone.installer.query(
          await readFile(path.join(root, 'database/proposals', file), 'utf8'),
        );
      }
    }
    console.info('FINANCIAL_CURRENT_FIXED_SQL_PREFIX_PRECHECK');
    const pre = await clone.installer.connect();
    try {
      await pre.query('begin');
      await pre.query('set local role world_v2_postwar_projection_owner');
      void (
        await pre.query(
          'select * from world_v2.postwar_financial_complete_prefix($1)',
          [marker.worldId],
        )
      ).rows;
      await pre.query('commit');
    } finally {
      await pre.query('rollback').catch(() => {});
      pre.release();
    }
    console.info('FINANCIAL_CURRENT_CORE_PUBLICATION');
    const client = await clone.installer.connect();
    try {
      await client.query('begin');
      const executor: SqlExecutor = {
        async query<Row extends object>(
          q: string,
          args: readonly unknown[] = [],
        ) {
          const pub =
            q.includes('lock_postwar_financial_current_publication') ||
            q.includes('publish_postwar_financial_current_projection');
          if (pub)
            await client.query(
              'set local role world_v2_postwar_projection_publisher',
            );
          try {
            const r = await client.query<Row>(q, [...args]);
            return { rows: r.rows, rowCount: r.rowCount };
          } finally {
            if (pub) await client.query('reset role');
          }
        },
      };
      const db = {
          query: executor.query,
          transaction: async <T>(f: (t: SqlExecutor) => Promise<T>) =>
            f(executor),
        },
        reader = new DurableV08LedgerLineageReader({
          database: db,
          sha256Hex: sha,
        });
      publication = await publishPostwarFinancialCurrentProjectionFrom(
        executor,
        {
          reader,
          worldId: marker.worldId,
          countryId: marker.countryId,
        },
      );
      await client.query('commit');
    } finally {
      await client.query('rollback').catch(() => {});
      client.release();
    }

    return { marker, clone, publication };
  } catch (error) {
    await clone.close();
    await sealPostwarReferenceClone(marker, clone.database);
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(
      path.join(evidenceDirectory, 'failed-fixture-' + Date.now() + '.json'),
      JSON.stringify(
        {
          referenceMarker: marker.markerPath,
          database: clone.database,
          error: String(error),
        },
        null,
        2,
      ),
    );
    throw error;
  }
}

/** Reuse real already-published sealed rows, not external scalar proof pins.
 * Only metadata/derived-page hashes are read. No Core seed load or publication. */
export async function clonePublishedFinancialCurrentHttpFixture(
  descriptorPath: string,
) {
  const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8')) as {
    referenceMarker: string;
    templateDatabase: string;
    seedFingerprint: string;
    admissionRef: string;
    publicationPrefixFingerprint: string;
  };
  const marker = await loadPostwarNativeReferenceMarker(
    descriptor.referenceMarker,
  );
  expect(descriptor.seedFingerprint).toBe(marker.seedFingerprint);
  expect(descriptor.admissionRef).toBe(marker.admissionRef);
  const clone = await clonePostwarNativeReference(
    marker,
    'financial_http_read',
    descriptor.templateDatabase,
  );
  try {
    const head = (
      await clone.installer.query(
        'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
        [marker.worldId],
      )
    ).rows;
    expect(head).toEqual([{ world_version: '6', event_sequence: '10' }]);
    const documents = (
      await clone.installer.query(
        'select * from world_v2.postwar_financial_current_document where world_id=$1 and country_id=$2 order by office_id,dataset',
        [marker.worldId, marker.countryId],
      )
    ).rows;
    expect(documents).toHaveLength(10);
    expect(
      new Set(documents.map((d) => d.office_id + ':' + d.dataset)).size,
    ).toBe(10);
    for (const d of documents) {
      expect(d.seed_fingerprint).toBe(marker.seedFingerprint);
      expect(d.admission_ref).toBe(marker.admissionRef);
      expect(d.source_bundle_sha256).toBe(marker.sourceBundleSha256);
      expect(String(d.world_version)).toBe('6');
      expect(String(d.event_sequence)).toBe('10');
      expect(d.prefix_fingerprint).toBe(
        descriptor.publicationPrefixFingerprint,
      );
      const pages = (
        await clone.installer.query(
          'select * from world_v2.postwar_financial_current_page where document_ref=$1 order by page_index',
          [d.document_ref],
        )
      ).rows;
      expect(pages).toHaveLength(d.page_count);
      for (const p of pages) expect(sha(p.rows_text)).toBe(p.page_sha256);
      const rows = pages.flatMap((p) => JSON.parse(p.rows_text) as unknown[]);
      // The document hash uses PostgreSQL jsonb text, independently checked by PG
      // so JS whitespace/key ordering never substitutes for the sealed raw bytes.
      const verified = (
        await clone.installer.query(
          "select encode(sha256(convert_to(coalesce(jsonb_agg(x order by p.page_index,n),'[]'::jsonb)::text,'UTF8')),'hex')as sha from world_v2.postwar_financial_current_page p cross join lateral jsonb_array_elements(p.rows_text::jsonb)with ordinality q(x,n)where p.document_ref=$1",
          [d.document_ref],
        )
      ).rows[0];
      expect(verified?.sha).toBe(d.document_sha256);
      expect(rows).toHaveLength(d.total_rows);
    }
    expect(
      (
        await clone.installer.query(
          'select count(*)::text as n from world_v2.financial_posting_batch where world_id=$1',
          [marker.worldId],
        )
      ).rows[0]?.n,
    ).toBe('0');
    expect(
      (
        await clone.installer.query(
          'select count(*)::text as n from world_v2.inventory_posting where world_id=$1',
          [marker.worldId],
        )
      ).rows[0]?.n,
    ).toBe('0');
    return {
      marker,
      clone,
      publication: {
        classification:
          'READBACK_OF_EXISTING_FIXED_SQL_PUBLICATION_NOT_REPUBLICATION',
        head: {
          worldId: marker.worldId,
          worldVersion: '6',
          eventSequence: '10',
        },
        seed: { seedId: marker.seedId, fingerprint: marker.seedFingerprint },
        prefixFingerprint: documents[0]!.prefix_fingerprint as string,
        documents,
      },
    };
  } catch (error) {
    await clone.drop();
    throw error;
  }
}
