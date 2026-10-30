/** Actual Atomic CB history + actual fixed-role SQL reads. Host source rows
 * below are explicitly TEST_ONLY metadata fixtures, not Finance/FX/Captain
 * policy admission or evidence of an executable cross-domain Core replay. */
import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import {
  createCentralBankOmoAtomicFixture,
  cbAtomicTestSha,
} from '../support/postwar-central-bank-omo-atomic-fixture.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import {
  readCentralBankOmoCommittedOriginalsFrom,
  type CentralBankOmoHistoricalFrame,
} from '../../apps/world-worker/src/persistence/postgres-central-bank-omo-history.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

describe('bounded committed CB original provider, not shared Core authority', () => {
  it('binds real Atomic history, preserves paid history after CB withdrawal, and rejects wrong current host/role/head/admission', async () => {
    const f = await createCentralBankOmoAtomicFixture();
    try {
      await f.execution.executeQueuedCommand(f.input);
      const reader = new DurableV08LedgerLineageReader({
        database: f.admin,
        sha256Hex: cbAtomicTestSha,
      });
      const lineage = await f.admin.transaction((tx) =>
        reader.readValidatedLineageFrom(tx, f.seed.worldId),
      );
      const frames: readonly CentralBankOmoHistoricalFrame[] =
        lineage.transitions;
      // Only the existing inaccessible owner's role profile is emulated.
      // No operational role receives a table grant or another office role.
      await f.db
        .exec(`create role world_v2_day_one_fx_history_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage on schema world_v2 to world_v2_day_one_fx_history_owner;
create role world_v2_finance_budget_source_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role world_v2_social_source_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role world_v2_day_one_fx_source_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role world_v2_captain_source_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage on schema world_v2 to world_v2_finance_budget_source_reader,world_v2_social_source_reader,world_v2_day_one_fx_source_reader,world_v2_captain_source_reader;
create table world_v2.social_operating_source_registration(world_id text,country_id text,seed_fingerprint text,admission_ref text,registration_ref text);
create table world_v2.social_operating_source_revocation(registration_ref text);
create table world_v2.finance_budget_policy_original(world_id text,country_id text,seed_fingerprint text,admission_ref text,policy_ref text);
create table world_v2.finance_budget_policy_revocation(policy_ref text);
create table world_v2.postwar_day_one_fx_source_original(world_id text,seed_id text,seed_fingerprint text,admission_ref text,registration_ref text);
create table world_v2.postwar_day_one_fx_source_revocation(registration_ref text);
create table world_v2.postwar_day_one_fx_quote_original(world_id text,country_id text,quote_ref text);
create table world_v2.postwar_day_one_fx_quote_revocation(world_id text,country_id text,quote_ref text);
create table world_v2.captain_operating_source_adoption(world_id text,country_id text,seed_fingerprint text,adoption_ref text);
create table world_v2.captain_operating_source_revocation(adoption_ref text);
create table world_v2.captain_source_publication_registry(world_id text,country_id text,seed_fingerprint text,world_admission_ref text,adoption_ref text);`);
      const admission = 'ADMISSION_' + '1'.repeat(64),
        args = [
          f.seed.worldId,
          f.command.countryId,
          f.seed.fingerprint,
          admission,
        ];
      await f.db.query(
        "insert into world_v2.finance_budget_policy_original values($1,$2,$3,$4,'HOST_FINANCE_TEST_ONLY')",
        args,
      );
      await f.db.query(
        "insert into world_v2.social_operating_source_registration values($1,$2,$3,$4,'HOST_SOCIAL_TEST_ONLY')",
        args,
      );
      await f.db.query(
        "insert into world_v2.postwar_day_one_fx_source_original values($1,$2,$3,$4,'HOST_FX_TEST_ONLY')",
        [f.seed.worldId, f.seed.seedId, f.seed.fingerprint, admission],
      );
      await f.db.query(
        "insert into world_v2.postwar_day_one_fx_quote_original values($1,$2,'HOST_FX_QUOTE_TEST_ONLY')",
        [f.seed.worldId, f.command.countryId],
      );
      await f.db.query(
        "insert into world_v2.captain_operating_source_adoption values($1,$2,$3,'HOST_CAPTAIN_TEST_ONLY')",
        args.slice(0, 3),
      );
      await f.db.query(
        "insert into world_v2.captain_source_publication_registry values($1,$2,$3,$4,'HOST_CAPTAIN_TEST_ONLY')",
        args,
      );
      await f.db.exec(
        await readFile(
          new URL(
            '../../database/proposals/central-bank-omo-history-read.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      const run = async <T>(
        role: string,
        consume: (tx: SqlExecutor) => Promise<T>,
      ) => {
        await f.db.exec(
          'begin isolation level repeatable read;set local role ' + role,
        );
        try {
          const result = await consume({
            async query<Row extends object>(
              sql: string,
              parameters: readonly unknown[] = [],
            ) {
              const r = await f.db.query<Row>(sql, [...parameters]);
              return {
                rows: r.rows,
                rowCount: r.affectedRows ?? r.rows.length,
              };
            },
          });
          await f.db.exec('commit');
          return result;
        } catch (error) {
          await f.db.exec('rollback');
          throw error;
        }
      };
      const base = {
        worldId: f.seed.worldId,
        hostCountryId: f.command.countryId,
        seedFingerprint: f.seed.fingerprint,
        admissionRef: admission,
        expectedHead: { worldVersion: '1', eventSequence: '1' },
        mode: 'TEST_ONLY_LOCAL' as const,
        frames,
      };
      const modes = [
        ['FINANCE', 'world_v2_finance_budget_source_reader'],
        ['SOCIAL', 'world_v2_social_source_reader'],
        ['TREASURY_FX', 'world_v2_day_one_fx_source_reader'],
        ['CAPTAIN', 'world_v2_captain_source_reader'],
        ['CB_OMO', 'world_v2_cb_omo_source_reader'],
      ] as const;
      for (const [officeId, role] of modes) {
        const data = await run(role, (tx) =>
          readCentralBankOmoCommittedOriginalsFrom(tx, { ...base, officeId }),
        );
        expect(data.classification).toBe(
          'COMMITTED_CB_ORIGINALS_DATA_NOT_AUTHORITY',
        );
        expect(data.countries).toHaveLength(1);
        expect(data.countries[0]?.original).toEqual(f.original);
        expect(data.countries[0]?.quotes[0]?.quote).toEqual(f.quote);
        expect(data.countries[0]?.frames[0]?.commandFingerprint).toBe(
          f.command.fingerprint,
        );
      }
      await expect(
        run('world_v2_finance_budget_source_reader', (tx) =>
          readCentralBankOmoCommittedOriginalsFrom(tx, {
            ...base,
            officeId: 'SOCIAL',
          }),
        ),
      ).rejects.toThrow('CB_OMO_HISTORY_FIXED_HOST_READER_REQUIRED');
      await expect(
        run('world_v2_finance_budget_source_reader', (tx) =>
          readCentralBankOmoCommittedOriginalsFrom(tx, {
            ...base,
            officeId: 'FINANCE',
            hostCountryId: 'COUNTRY_FOREIGN',
          }),
        ),
      ).rejects.toThrow('CB_OMO_HISTORY_CURRENT_HOST_SOURCE_REQUIRED');
      await expect(
        run('world_v2_finance_budget_source_reader', (tx) =>
          readCentralBankOmoCommittedOriginalsFrom(tx, {
            ...base,
            officeId: 'FINANCE',
            expectedHead: { worldVersion: '2', eventSequence: '2' },
          }),
        ),
      ).rejects.toThrow('CB_OMO_HISTORY_EXACT_BOUNDED_HEAD_REQUIRED');
      await expect(
        run('world_v2_finance_budget_source_reader', (tx) =>
          readCentralBankOmoCommittedOriginalsFrom(tx, {
            ...base,
            officeId: 'FINANCE',
            frames: [],
          }),
        ),
      ).rejects.toThrow('ALL_PARTICIPATING_ORIGINS_REQUIRED');
      await expect(
        run('world_v2_finance_budget_source_reader', (tx) =>
          tx.query('select * from world_v2.central_bank_omo_original'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        run('world_v2_finance_budget_source_reader', (tx) =>
          tx.query('select * from world_v2.opening_seed'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await f.revoke('QUOTE');
      await f.revoke('SOURCE');
      // Current Finance/Social sources can replay already paid CB history.
      const historical = await run(
        'world_v2_finance_budget_source_reader',
        (tx) =>
          readCentralBankOmoCommittedOriginalsFrom(tx, {
            ...base,
            officeId: 'FINANCE',
          }),
      );
      expect(historical.countries[0]?.quotes[0]?.quote).toEqual(f.quote);
      await expect(
        run('world_v2_cb_omo_source_reader', (tx) =>
          readCentralBankOmoCommittedOriginalsFrom(tx, {
            ...base,
            officeId: 'CB_OMO',
          }),
        ),
      ).rejects.toThrow('CB_OMO_HISTORY_CURRENT_HOST_SOURCE_REQUIRED');
      await f.db.exec(
        "insert into world_v2.finance_budget_policy_revocation values('HOST_FINANCE_TEST_ONLY')",
      );
      await expect(
        run('world_v2_finance_budget_source_reader', (tx) =>
          readCentralBankOmoCommittedOriginalsFrom(tx, {
            ...base,
            officeId: 'FINANCE',
          }),
        ),
      ).rejects.toThrow('CB_OMO_HISTORY_CURRENT_HOST_SOURCE_REQUIRED');
      await f.db.exec(
        "insert into world_v2.runtime_admission_publication_revocation values('PERMIT_TEST_ONLY')",
      );
      await expect(
        run('world_v2_social_source_reader', (tx) =>
          readCentralBankOmoCommittedOriginalsFrom(tx, {
            ...base,
            officeId: 'SOCIAL',
          }),
        ),
      ).rejects.toThrow('CB_OMO_HISTORY_WORLD_ADMISSION_REVOKED');
      expect(await f.counts()).toEqual({
        events: 1,
        batches: 1,
        receipts: 1,
        finalized: 1,
        audit: 1,
        outbox: 1,
        inventory: 0,
        materials: 0,
        version: '1',
        sequence: '1',
        queue: 'FINALIZED',
      });
    } finally {
      await f.db.close();
    }
  });
});
