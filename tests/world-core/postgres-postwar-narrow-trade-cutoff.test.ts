/** Actual native PostgreSQL only, explicit coordinated slot. Tiny TEST_ONLY
 * genuine Core source, not official cfc rights or an economic Trade adoption. */
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { describe, it, expect } from 'vitest';
import {
  installPostwarNarrowTradeCutoffFixture,
  createPostwarNarrowTradeCutoffCandidate,
} from '../support/postwar-narrow-trade-cutoff-fixture.js';
import { loadPostwarNativeReferenceMarker } from '../support/postwar-native-reference-db.js';
import {
  preparePostwarNarrowTradeOpening,
  createPostwarNarrowTradeCurrentSource,
  POSTWAR_NARROW_TRADE_CURRENT_SOURCE_PURPOSE,
  POSTWAR_NARROW_TRADE_CURRENT_SOURCE_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-narrow-trade-current-source.js';
const markerPath =
  process.env.ECONMIND_POSTWAR_NARROW_TRADE_CURRENT_NATIVE_REFERENCE;
const evidence =
  process.env.ECONMIND_POSTWAR_NARROW_TRADE_CURRENT_EVIDENCE ??
  '/workspace/.cloud-setup/evidence/postwar-narrow-trade-current-native-20261030';
describe('actual PG Trade current source cutoff (isolated TEST_ONLY)', () => {
  it.skipIf(!markerPath)(
    'genuine private port positively checks reserve and real revocation locks; source/quantity changes deny with no economic writes',
    async () => {
      if (
        !markerPath ||
        !evidence.startsWith('/workspace/.cloud-setup/evidence/')
      )
        throw Error('EXPLICIT_OWNED_NATIVE_EVIDENCE_REQUIRED');
      const marker = await loadPostwarNativeReferenceMarker(markerPath);
      const admin = new Pool({
        host: marker.socket,
        port: marker.port,
        database: 'postgres',
        user: 'postgres',
        max: 1,
      });
      const name = 'postwar_trade_cutoff_' + randomBytes(6).toString('hex');
      let before = new Set<string>();
      let beforeKnown = false;
      let createdDatabase = false;
      let pool: Pool | undefined;
      let failure: unknown;
      let failed = false;
      const failures: unknown[] = [];
      const report: Record<string, unknown> = {
        classification:
          'TEST_ONLY_NATIVE_CORE_SOURCE_CUTOFF_NOT_PRODUCTION_TRADE',
        status: 'IN_PROGRESS',
        database: name,
        wholeWorldInitialized: false,
        rawSeedOnline: false,
      };
      try {
        await mkdir(evidence, { recursive: true });
        before = new Set(
          (
            await admin.query<{ rolname: string }>(
              'select rolname from pg_roles',
            )
          ).rows.map((r) => r.rolname),
        );
        beforeKnown = true;
        await admin.query('create database "' + name + '" template template0');
        createdDatabase = true;
        pool = new Pool({
          host: marker.socket,
          port: marker.port,
          database: name,
          user: 'postgres',
          max: 2,
        });
        const client = await pool.connect();
        try {
          const db = {
            exec: async (sql: string) => client.query(sql),
            async query<T extends object>(sql: string, args: unknown[] = []) {
              return client.query<T>(sql, args);
            },
          };
          const f = await installPostwarNarrowTradeCutoffFixture(db);
          await f.begin();
          const c = await createPostwarNarrowTradeCutoffCandidate(f);
          const source = createPostwarNarrowTradeCurrentSource({
            runtimeRole: f.readerRole,
            openingPreparation: preparePostwarNarrowTradeOpening({
              seed: f.seed,
              admissionRef: f.admissionRef,
            }),
          });
          const tx = {
            async query<T extends object>(
              sql: string,
              args: readonly unknown[] = [],
            ) {
              const r = await client.query<T>(sql, [...args]);
              return { rows: r.rows, rowCount: r.rowCount };
            },
          };
          const result = await source.inspectFrom(tx, {
            command: c.command,
            authorization: c.authorization,
            observedAtReal: c.at,
          });
          expect(result.kind).toBe('SOURCE_MATCH');
          if (result.kind !== 'SOURCE_MATCH')
            throw Error('GENUINE_SOURCE_POSITIVE_REQUIRED');
          const request = {
            phase: 'BEFORE_EVENTS' as const,
            purpose: POSTWAR_NARROW_TRADE_CURRENT_SOURCE_PURPOSE,
            command: c.command,
            transition: c.transition,
            currentHead: c.head,
            observedAtReal: c.at,
            readBinding: result.binding,
            commitAuthorization: c.proof,
            inventoryPostings: [c.posting],
            financialPostingBatches: [],
          };
          expect(
            await source.sourceCommitProtectionPort.assertCurrentFrom(
              tx,
              request,
            ),
          ).toMatchObject({
            status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
            protectionMode: 'HELD_SOURCE_GUARDS',
          });
          await expect(
            source.sourceCommitProtectionPort.assertCurrentFrom(tx, {
              ...request,
              inventoryPostings: [],
            }),
          ).rejects.toThrow('reserve-only');
          const revoker = await pool.connect();
          try {
            await revoker.query("set lock_timeout='150ms'");
            await expect(
              revoker.query(
                'insert into world_v2.postwar_narrow_trade_rights_revocation values($1,$2)',
                [f.domainAdmissionRef, 'TEST_ONLY_REVOCATION'],
              ),
            ).rejects.toMatchObject({ code: '55P03' });
            report.sameTransactionRightsLock = 'PASS';
            await client.query('commit');
            await revoker.query(
              'insert into world_v2.postwar_narrow_trade_rights_revocation values($1,$2)',
              [f.domainAdmissionRef, 'TEST_ONLY_REVOCATION'],
            );
            await f.begin();
            const denied = await source.inspectFrom(tx, {
              command: c.command,
              authorization: c.authorization,
              observedAtReal: c.at,
            });
            expect(denied.kind).toBe('MISSING');
            if (denied.kind === 'MISSING')
              expect(denied.missing).toEqual([
                'SELLER_OWNER_TRANSFER_MANDATE',
                'ADMITTED_CROSS_BORDER_ROUTE',
              ]);
            await expect(
              source.sourceCommitProtectionPort.assertCurrentFrom(tx, request),
            ).rejects.toThrow('POSTWAR_NARROW_TRADE_CURRENT_MISSING');
            await client.query('rollback');
          } finally {
            revoker.release();
          }
          await f.reset();
          const counts = await client.query(
            `select (select count(*)::text from world_v2.authoritative_event)as events,(select count(*)::text from world_v2.financial_posting_batch)as batches,(select count(*)::text from world_v2.inventory_posting)as inventory,(select count(*)::text from world_v2.command_receipt)as receipts`,
          );
          expect(counts.rows[0]).toEqual({
            events: '0',
            batches: '0',
            inventory: '0',
            receipts: '0',
          });
          report.status = 'PASS';
          report.privatePortPositive = true;
          report.revokedCutoffDenied = true;
          report.economicWrites = counts.rows[0];
          report.resultBytes = Buffer.byteLength(JSON.stringify(result));
          report.formalOwnerMandateIssued = false;
          report.clockStarted = false;
          await f.begin();
          await expect(
            client.query('select canonical_payload from world_v2.opening_seed'),
          ).rejects.toMatchObject({ code: '42501' });
          await f.reset();
          // The actual SQL getter is fixed; no API caller can replace its original
          // rows, current auth, head, permit or revocation with a ready callback.
          expect(POSTWAR_NARROW_TRADE_CURRENT_SOURCE_QUERY).toContain(
            'read_postwar_narrow_trade_current_source',
          );
        } finally {
          await client
            .query('rollback;reset role;set session authorization postgres')
            .catch(() => undefined);
          client.release();
        }
      } catch (error) {
        report.status = 'FAIL';
        report.error =
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : String(error);
        failure = error;
        failed = true;
      } finally {
        if (pool) await pool.end().catch((e) => failures.push(e));
        if (createdDatabase)
          await admin
            .query('drop database if exists "' + name + '"')
            .catch((e) => failures.push(e));
        const knownRoles = new Set([
          'world_v2_admission_release',
          'world_v2_admission_owner',
          'world_v2_postwar_projection_owner',
          'world_v2_postwar_projection_publisher',
          'world_v2_postwar_projection_reader',
          'world_v2_day_one_fx_source_owner',
          'world_v2_day_one_fx_source_publisher',
          'world_v2_day_one_fx_source_reader',
          'world_v2_postwar_narrow_trade_source',
          'world_v2_postwar_narrow_trade_current_owner',
          'world_v2_opening_admission_test_narrow',
          'test_narrow_current_reader',
        ]);
        const created = (
          await admin
            .query<{ rolname: string }>('select rolname from pg_roles')
            .catch((e) => {
              failures.push(e);
              return { rows: [] };
            })
        ).rows
          .map((r) => r.rolname)
          .filter((r) => beforeKnown && !before.has(r) && knownRoles.has(r));
        if (created.length)
          await admin
            .query('drop role ' + created.map((r) => '"' + r + '"').join(','))
            .catch((e) => failures.push(e));
        await admin.end().catch((e) => failures.push(e));
        report.cleanupFailures = failures.map(String);
        report.cleanupComplete = failures.length === 0;
        await writeFile(
          evidence + '/report.json',
          JSON.stringify(report, null, 2) + '\n',
        ).catch((e) => failures.push(e));
      }
      if (failed && failures.length)
        throw new AggregateError(
          [failure, ...failures],
          'NATIVE_TRADE_AND_OWNED_CLEANUP_FAILED',
          { cause: failure },
        );
      if (failed) throw failure;
      if (failures.length)
        throw new AggregateError(failures, 'NATIVE_TRADE_OWNED_CLEANUP_FAILED');
    },
    60000,
  );
});
