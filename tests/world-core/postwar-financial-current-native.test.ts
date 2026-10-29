/** Isolated existing c427 H5/H6 clone; never bootstrap, production or Clock. */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
  sealPostwarReferenceClone,
} from '../support/postwar-native-reference-db.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { publishPostwarFinancialCurrentProjectionFrom } from '../../apps/world-worker/src/persistence/postwar-financial-current-publication.js';
import { createPostwarFinancialCurrentProjectionStore } from '../../apps/world-worker/src/persistence/postwar-financial-current-projection.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const checkpoint = process.env.ECONMIND_FINANCIAL_CURRENT_NATIVE_CHECKPOINT;
const suite = checkpoint ? describe : describe.skip;
const root = path.resolve(import.meta.dirname, '../..'),
  sha = (s: string) => createHash('sha256').update(s).digest('hex');
suite('actual mixed prefix financial current native', () => {
  it('independently publishes real ledger/capacity and bounded original/current pages at exact H6', async () => {
    const ck = JSON.parse(await readFile(checkpoint!, 'utf8')) as {
      referenceMarker: string;
      database: string;
    };
    const marker = await loadPostwarNativeReferenceMarker(ck.referenceMarker),
      clone = await clonePostwarNativeReference(
        marker,
        'financial_current',
        ck.database,
      );
    const out =
      '/workspace/office-connection-evidence/postwar-financial-current-native-20261028';
    await mkdir(out, { recursive: true });
    const evidence: Record<string, unknown> = {
      classification: 'TEST_ONLY_ACTUAL_C427_FINANCIAL_CURRENT_NOT_PRODUCTION',
      checkpoint,
      sourceRegenerated: false,
      WorldClock: false,
      database: clone.database,
    };
    let passed = false;
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
            path.join(
              root,
              'database/proposals/postwar-office-derived-read.sql',
            ),
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
        evidence.sqlPrefix = (
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
        evidence.publication =
          await publishPostwarFinancialCurrentProjectionFrom(executor, {
            reader,
            worldId: marker.worldId,
            countryId: marker.countryId,
          });
        await client.query('commit');
      } finally {
        await client.query('rollback').catch(() => {});
        client.release();
      }
      const store = createPostwarFinancialCurrentProjectionStore({
        runtimeReaderRole: marker.roles.boundedReaderRole,
        authorizationPublisherRole: marker.roles.authorizationPublisherRole,
      });
      async function read(
        officeId: 'FINANCE' | 'CENTRAL_BANK',
        dataset: string,
        subject = marker.subject,
        expectedVersion?: string,
      ) {
        const c = await clone.boundedReader.connect();
        try {
          await c.query('begin isolation level repeatable read read only');
          await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
            subject,
          ]);
          const tx: SqlExecutor = {
            async query<Row extends object>(
              q: string,
              args: readonly unknown[] = [],
            ) {
              const r = await c.query<Row>(q, [...args]);
              return { rows: r.rows, rowCount: r.rowCount };
            },
          };
          return await store.readPageFrom(tx, {
            worldId: marker.worldId,
            officeId,
            dataset,
            expectedVersion,
            limit: 100,
          });
        } finally {
          await c.query('rollback').catch(() => {});
          c.release();
        }
      }
      const cap = await read('FINANCE', 'treasury-capacity'),
        balance = await read('CENTRAL_BANK', 'ledger-balances'),
        history = await read('FINANCE', 'currency-fx');
      expect(cap.status).toBe('PAGE');
      expect(balance.status).toBe('PAGE');
      expect(history.status).toBe('PAGE');
      if (cap.status === 'PAGE') {
        expect(cap.source.worldVersion).toBe('6');
        expect(cap.source.eventSequence).toBe('10');
        expect(cap.rows).toHaveLength(1);
        const row = cap.rows[0] as Record<string, string>;
        expect(row.treasuryLedgerClaimBalance).toBe('206838792635.904');
        expect(row.budgetEnvelopeCapacity).toBe('94331915421.552');
        expect(row.additionalPayrollReservedCapacity).toBe('162.72');
        expect(row.reservationNature).toBe(
          'CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED',
        );
        evidence.capacity = cap;
        expect(
          (
            await read(
              'FINANCE',
              'treasury-capacity',
              marker.subject,
              'sha256:' + '0'.repeat(64),
            )
          ).status,
        ).toBe('STALE');
      }
      if (history.status === 'PAGE') {
        expect(history.source.worldVersion).toBe('0');
        expect(history.source.observedHead.worldVersion).toBe('6');
        expect(history.source.dataNature).toBe(
          'ADMITTED_IMMUTABLE_OPENING_FACTS',
        );
      }
      expect(
        (
          await read(
            'FINANCE',
            'treasury-capacity',
            '00000000-0000-4000-8000-000000000099',
          )
        ).status,
      ).toBe('DENIED');
      await expect(
        clone.boundedReader.query(
          'select * from world_v2.postwar_financial_current_document',
        ),
      ).rejects.toMatchObject({ code: '42501' });
      evidence.status = 'PASS';
      passed = true;
      await writeFile(
        path.join(out, 'report.json'),
        JSON.stringify(evidence, null, 2) + '\n',
      );
    } catch (error) {
      evidence.status = 'FAIL';
      evidence.error = String(error);
      await writeFile(
        path.join(out, 'report-failure-' + Date.now() + '.json'),
        JSON.stringify(evidence, null, 2) + '\n',
      );
      await sealPostwarReferenceClone(marker, clone.database);
      await writeFile(
        path.join(out, 'failure-checkpoint-' + Date.now() + '.json'),
        JSON.stringify(
          {
            referenceMarker: marker.markerPath,
            database: clone.database,
            classification:
              'TEST_ONLY_FAILED_FINANCIAL_CURRENT_DEBUG_CHECKPOINT',
          },
          null,
          2,
        ) + '\n',
      );
      throw error;
    } finally {
      if (passed) await clone.drop();
      else await clone.close();
    }
  }, 180000);
});

const getterTemplate = process.env.ECONMIND_FINANCIAL_CURRENT_GETTER_TEMPLATE;
(getterTemplate ? describe : describe.skip)(
  'actual sealed H6 bounded financial publication originals getter',
  () => {
    it('returns hash-bound DATA_ONLY small originals with separate EXEC role, fresh locks and revocation denial without loading a seed', async () => {
      const descriptor = JSON.parse(
        await readFile(getterTemplate!, 'utf8'),
      ) as {
        referenceMarker: string;
        templateDatabase: string;
        seedFingerprint: string;
        admissionRef: string;
      };
      const marker = await loadPostwarNativeReferenceMarker(
        descriptor.referenceMarker,
      );
      expect(descriptor.seedFingerprint).toBe(marker.seedFingerprint);
      expect(descriptor.admissionRef).toBe(marker.admissionRef);
      const clone = await clonePostwarNativeReference(
        marker,
        'financial_getter',
        descriptor.templateDatabase,
      );
      const out =
        '/workspace/office-connection-evidence/postwar-financial-current-getter-20261028';
      await mkdir(out, { recursive: true });
      const sqlPath =
        'database/proposals/postwar-financial-current-derived-read.sql';
      const sql = await readFile(path.join(root, sqlPath), 'utf8');
      const begin = sql.indexOf(
        '-- BEGIN BOUNDED_FINANCIAL_PUBLICATION_ORIGINALS_V1',
      );
      const end = sql.indexOf(
        '-- END BOUNDED_FINANCIAL_PUBLICATION_ORIGINALS_V1',
      );
      if (begin < 0 || end <= begin)
        throw Error('FIXED_GETTER_SOURCE_BLOCK_REQUIRED');
      const fragment = sql.slice(begin, end);
      const body = fragment.replace(/--[^\n]*/gu, '');
      expect(body).not.toMatch(
        /\bcanonical_payload\b|\bprepare_postwar_social_prefix_scopes\s*\(/iu,
      );
      expect(body).not.toMatch(/\b(?:from|join)\s+world_v2\.opening_seed\b/iu);
      const query =
        'select * from world_v2.read_postwar_financial_current_publication_originals($1,$2)';
      const calls: string[] = [];
      async function asPublisher(
        country = marker.countryId,
        mode = 'read committed',
      ) {
        const c = await clone.installer.connect();
        try {
          await c.query('begin isolation level ' + mode);
          await c.query('set local role world_v2_postwar_projection_publisher');
          calls.push(query);
          return await c.query<{
            originals_text: string;
            originals_sha256: string;
          }>(query, [marker.worldId, country]);
        } finally {
          await c.query('rollback').catch(() => {});
          c.release();
        }
      }
      try {
        // Exact new function only; previous schema/source/events remain intact.
        await clone.installer.query(
          'begin;grant create on schema world_v2 to world_v2_postwar_projection_owner;' +
            fragment +
            'revoke create on schema world_v2 from world_v2_postwar_projection_owner;commit;',
        );
        const result = await asPublisher();
        expect(result.rows).toHaveLength(1);
        const row = result.rows[0]!;
        expect(Buffer.byteLength(row.originals_text)).toBeLessThanOrEqual(
          65536,
        );
        expect(sha(row.originals_text)).toBe(row.originals_sha256);
        const originals = JSON.parse(row.originals_text);
        expect(originals.schemaVersion).toBe(
          'postwar-financial-current-publication-originals-v1',
        );
        expect(originals.dataNature).toBe(
          'IMMUTABLE_ADMITTED_H0_FINANCIAL_DATA_ONLY',
        );
        expect(originals.head).toEqual({
          worldVersion: '6',
          eventSequence: '10',
        });
        expect(originals.seedFingerprint).toBe(marker.seedFingerprint);
        expect(originals.admissionRef).toBe(marker.admissionRef);
        expect(originals.sourceBundleSha256).toBe(marker.sourceBundleSha256);
        expect(originals.canonicalSeedSha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(originals.originalDocuments).toHaveLength(7);
        expect(originals.fundingAccounts).toHaveLength(1);
        const fund = originals.fundingAccounts[0];
        expect(fund.payerRole).toBe('GOV');
        const tga = originals.financeLedgerRows.find(
          (p: { account: { accountId: string } }) =>
            p.account.accountId === fund.accountRef,
        );
        expect(tga.netDebitBalance.amount).toBe('206838792635.904');
        expect(tga.account.claimId).toBe(fund.claimId);
        expect(
          originals.centralBankLedgerRows.some(
            (p: {
              account: { claimId: string; accountClass: string };
              netDebitBalance: { amount: string };
            }) =>
              p.account.claimId === fund.claimId &&
              p.account.accountClass === 'LIABILITY' &&
              p.netDebitBalance.amount === '-206838792635.904',
          ),
        ).toBe(true);
        await expect(
          asPublisher('COUNTRY_UNKNOWN' as typeof marker.countryId),
        ).rejects.toMatchObject({ code: '55000' });
        await expect(
          asPublisher(marker.countryId, 'repeatable read read only'),
        ).rejects.toMatchObject({ code: '25000' });
        await expect(
          clone.boundedReader.query(query, [marker.worldId, marker.countryId]),
        ).rejects.toMatchObject({ code: '42501' });
        const c = await clone.installer.connect();
        try {
          await c.query('begin');
          await c.query('set local role world_v2_postwar_projection_publisher');
          await c.query(
            'select world_v2.revoke_postwar_office_projection($1,$2,$3)',
            [
              marker.worldId,
              originals.originalDocuments[0].documentRef,
              'TEST_ONLY_GETTER_REVOCATION',
            ],
          );
          await c.query('commit');
        } finally {
          await c.query('rollback').catch(() => {});
          c.release();
        }
        await expect(asPublisher()).rejects.toMatchObject({ code: '55000' });
        await writeFile(
          path.join(out, 'report.json'),
          JSON.stringify(
            {
              classification:
                'TEST_ONLY_ACTUAL_H6_DATA_ONLY_GETTER_NOT_PRODUCTION',
              status: 'PASS',
              sourceSQLSha256: sha(sql),
              fragmentSha256: sha(fragment),
              seedFingerprint: marker.seedFingerprint,
              admissionRef: marker.admissionRef,
              bytes: Buffer.byteLength(row.originals_text),
              originalsSha256: row.originals_sha256,
              head: originals.head,
              originalDocuments: originals.originalDocuments,
              checks: [
                'RAW_SHA_AND_64K',
                'EXACT_SEED_ADMISSION_HEAD',
                'SEVEN_ORIGINALS',
                'GOV_RECIPROCAL_LEDGER',
                'UNKNOWN_COUNTRY_DENIED',
                'NON_FRESH_ISOLATION_DENIED',
                'ACTUAL_BOUNDED_READER_EXEC_DENIED',
                'ORIGINAL_REVOCATION_DENIED',
              ],
              canonicalSeedLoaded: false,
              calls,
              sourceRegenerated: false,
              WorldClock: false,
            },
            null,
            2,
          ) + '\n',
        );
      } catch (error) {
        await clone.installer.query('rollback').catch(() => {});
        await writeFile(
          path.join(out, 'failure-' + Date.now() + '.json'),
          JSON.stringify(
            { status: 'FAIL', error: String(error), sourceSQLSha256: sha(sql) },
            null,
            2,
          ) + '\n',
        );
        throw error;
      } finally {
        await clone.drop();
      }
    }, 30000);
  },
);
