/** TEST_ONLY transport of immutable derived H0/H6 facts between genuine
 * same-seed/admission/prefix clones. No authority, grants or source bytes are
 * synthesized; the fixed getter and publisher independently validate them. */
import { readFile } from 'node:fs/promises';
import { clonePostwarNativeReference } from './postwar-native-reference-db.js';
import { createPostwarMixedBudgetRuntimeFixture } from './postwar-mixed-budget-runtime-fixture.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { createPostwarFinancialCurrentProjectionStore } from '../../apps/world-worker/src/persistence/postwar-financial-current-projection.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

export async function createBudgetCurrentReadbackFixture(checkpoint: string) {
  const f = await createPostwarMixedBudgetRuntimeFixture(checkpoint);
  try {
    const descriptor = JSON.parse(
      await readFile(
        '/workspace/office-connection-evidence/postwar-financial-current-http-20261028/published-template.json',
        'utf8',
      ),
    ) as {
      templateDatabase: string;
      seedFingerprint: string;
      admissionRef: string;
    };
    if (
      descriptor.seedFingerprint !== f.marker.seedFingerprint ||
      descriptor.admissionRef !== f.marker.admissionRef
    )
      throw Error('EXACT_SAME_ADMITTED_SOURCE_REQUIRED');
    const ancestor = await clonePostwarNativeReference(
      f.marker,
      'budget_readback_ancestor',
      descriptor.templateDatabase,
    );
    try {
      const heads = await Promise.all(
        [f.clone.installer, ancestor.installer].map((p) =>
          p.query(
            'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
            [f.marker.worldId],
          ),
        ),
      );
      if (
        JSON.stringify(heads[0]!.rows) !== JSON.stringify(heads[1]!.rows) ||
        heads[0]!.rows[0]?.world_version !== '6'
      )
        throw Error('EXACT_ACTUAL_H6_REQUIRED');
      const events = await Promise.all(
        [f.clone.installer, ancestor.installer].map((p) =>
          p.query(
            'select event_id,event_fingerprint from world_v2.authoritative_event where world_id=$1 order by event_sequence',
            [f.marker.worldId],
          ),
        ),
      );
      if (JSON.stringify(events[0]!.rows) !== JSON.stringify(events[1]!.rows))
        throw Error('EXACT_SAME_CANONICAL_PREFIX_REQUIRED');
      for (const [table, file] of [
        [
          'postwar_social_current_document',
          'postwar-social-current-derived-read.sql',
        ],
        [
          'postwar_social_prefix_scope',
          'postwar-social-current-prefix-read.sql',
        ],
        [
          'postwar_financial_current_document',
          'postwar-financial-current-derived-read.sql',
        ],
      ]) {
        if (
          !(
            await f.clone.installer.query('select to_regclass($1)as t', [
              'world_v2.' + table,
            ])
          ).rows[0]?.t
        )
          await f.clone.installer.query(
            await readFile(
              new URL('../../database/proposals/' + file, import.meta.url),
              'utf8',
            ),
          );
      }
      const ident = (s: string) => {
        if (!/^[a-z_0-9]+$/u.test(s)) throw Error('FIXED_IDENTIFIER');
        return '"' + s + '"';
      };
      for (const table of [
        'postwar_office_projection_document',
        'postwar_office_projection_page',
        'postwar_social_prefix_scope',
        'postwar_financial_current_document',
        'postwar_financial_current_page',
      ]) {
        const rows = (
          await ancestor.installer.query(
            'select * from world_v2.' + table + ' where world_id=$1',
            [f.marker.worldId],
          )
        ).rows;
        for (const row of rows) {
          if (
            'seed_fingerprint' in row &&
            (row.seed_fingerprint !== f.marker.seedFingerprint ||
              row.admission_ref !== f.marker.admissionRef)
          )
            throw Error('EXACT_SOURCE_PINS');
          const keys = Object.keys(row);
          await f.clone.installer.query(
            'insert into world_v2.' +
              table +
              '(' +
              keys.map(ident).join(',') +
              ')values(' +
              keys.map((_, i) => '$' + (i + 1)).join(',') +
              ')on conflict do nothing',
            Object.values(row),
          );
        }
      }
    } finally {
      await ancestor.drop();
    }
    const statements: string[] = [];
    const raw = new PostgresSqlDatabase(f.worker);
    const sourceMetrics: { sql: string; bytes: number }[] = [];
    const observed = (tx: SqlExecutor): SqlExecutor => ({
      async query<Row extends object>(
        q: string,
        args: readonly unknown[] = [],
      ) {
        const r = await tx.query<Row>(q, args);
        sourceMetrics.push({
          sql: q,
          bytes: Buffer.byteLength(JSON.stringify(r.rows)),
        });
        return r;
      },
    });
    const sourceDatabase: SqlDatabase = {
      query: observed(raw).query,
      transaction: (work) => raw.transaction((tx) => work(observed(tx))),
    };
    // Test installer switches to the real dedicated publisher role only inside
    // this independent connection. No worker membership or LOGIN is added.
    const publicationDatabase: SqlDatabase = {
      async query<Row extends object>(
        q: string,
        args: readonly unknown[] = [],
      ) {
        return this.transaction((tx) => tx.query<Row>(q, args));
      },
      async transaction<T>(work: (tx: SqlExecutor) => Promise<T>) {
        const c = await f.clone.installer.connect();
        try {
          await c.query('begin');
          await c.query('set local role world_v2_postwar_projection_publisher');
          const tx: SqlExecutor = {
            async query<Row extends object>(
              q: string,
              args: readonly unknown[] = [],
            ) {
              statements.push(q);
              const r = await c.query<Row>(q, [...args]);
              return { rows: r.rows, rowCount: r.rowCount };
            },
          };
          const result = await work(tx);
          await c.query('commit');
          return result;
        } finally {
          await c.query('rollback').catch(() => {});
          c.release();
        }
      },
    };
    const store = createPostwarFinancialCurrentProjectionStore({
      runtimeReaderRole: f.marker.roles.boundedReaderRole,
      authorizationPublisherRole: f.marker.roles.authorizationPublisherRole,
    });
    const read = async (
      officeId: 'FINANCE' | 'CENTRAL_BANK',
      dataset: string,
      expectedVersion?: string,
    ) => {
      const c = await f.clone.boundedReader.connect();
      try {
        await c.query('begin isolation level repeatable read read only');
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          f.marker.subject,
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
          worldId: f.marker.worldId,
          officeId,
          dataset,
          ...(expectedVersion === undefined ? {} : { expectedVersion }),
          limit: 100,
        });
      } finally {
        await c.query('rollback').catch(() => {});
        c.release();
      }
    };
    return {
      ...f,
      sourceDatabase,
      publicationDatabase,
      read,
      statements,
      sourceMetrics,
    };
  } catch (error) {
    await f.cleanup();
    throw error;
  }
}
