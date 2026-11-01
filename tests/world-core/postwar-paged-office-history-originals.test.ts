/** Real Core/Atomic OMO journals plus bounded SQL original transport. Host
 * enrollment is TEST_ONLY; this does not claim official 70-country admission. */
import { readFile } from 'node:fs/promises';
import { it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  prepareFinanceSocialLedger,
  replayPreparedFinanceSocialFxLedger,
} from '@econmind/core/finance-social-prepared-ledger';
import {
  createCentralBankOmoAtomicFixture,
  cbAtomicTestSha,
} from '../support/postwar-central-bank-omo-atomic-fixture.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import {
  readPostwarPagedOmoHistoryOriginalsFrom,
  POSTWAR_PAGED_OMO_ORIGINALS_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-paged-office-history-originals.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
it('reads actual committed OMO originals for a complete page and denies changed boundaries, host, mode and revoked current source', async () => {
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
    const frames = lineage.transitions.map((frame) => ({
      ...frame,
      events: frame.transition.events,
    }));
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
    await f.db.exec(
      'create role world_v2_captain_source_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication',
    );
    await f.db.exec(
      await readFile(
        new URL(
          '../../database/proposals/postwar-paged-office-history-originals.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const base = {
      worldId: f.seed.worldId,
      hostCountryId: f.command.countryId,
      seedFingerprint: f.seed.fingerprint,
      admissionRef: admission,
      expectedHead: { worldVersion: '1', eventSequence: '1' },
      mode: 'TEST_ONLY_LOCAL' as const,
      frames,
      officeId: 'FINANCE' as const,
      fromHead: { worldVersion: '0', eventSequence: '0' },
      throughHead: { worldVersion: '1', eventSequence: '1' },
      sourceMetadata: f.seed.sources.map((s) => ({
        sourceId: s.sourceId,
        payloadHash: s.payloadHash,
      })),
    };

    const originals = await run('world_v2_finance_budget_source_reader', (tx) =>
      readPostwarPagedOmoHistoryOriginalsFrom(tx, base),
    );
    expect(originals).toHaveLength(1);
    const replay = replayPreparedFinanceSocialFxLedger({
      prepared: prepareFinanceSocialLedger(
        C.rebuildV08LedgersFromLineage({
          seed: f.seed,
          sha256Hex: cbAtomicTestSha,
        }).financial,
      ),
      frames,
      socialCountries: [],
      openingEncumbrances: [],
      fxOriginals: [],
      omoOriginals: originals,
      expectedHead: base.expectedHead,
      sha256Hex: cbAtomicTestSha,
    });
    const actual = C.rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: lineage.transitions,
      sha256Hex: cbAtomicTestSha,
    });
    expect(C.canonicalSerialize(replay.financial)).toBe(
      C.canonicalSerialize(actual.financial),
    );
    for (const changed of [
      { hostCountryId: 'COUNTRY_99' },
      { mode: 'OFFICIAL_RUNTIME' as const },
      { expectedHead: { worldVersion: '2', eventSequence: '2' } },
      { fromHead: { worldVersion: '0', eventSequence: '1' } },
      { throughHead: { worldVersion: '1', eventSequence: '0' } },
    ])
      await expect(
        run('world_v2_finance_budget_source_reader', (tx) =>
          readPostwarPagedOmoHistoryOriginalsFrom(tx, { ...base, ...changed }),
        ),
      ).rejects.toThrow();
    const invalidPageArgs = [
      base.worldId,
      base.hostCountryId,
      base.officeId,
      base.seedFingerprint,
      base.admissionRef,
      '1',
      '1',
      '0',
      '1',
      '1',
      '1',
    ];
    await expect(
      run('world_v2_finance_budget_source_reader', (tx) =>
        tx.query(POSTWAR_PAGED_OMO_ORIGINALS_QUERY, invalidPageArgs),
      ),
    ).rejects.toThrow(
      'PAGED_ORIGINALS_COMPLETE_TRANSACTION_BOUNDARIES_REQUIRED',
    );
    await expect(
      run('world_v2_finance_budget_source_reader', (tx) =>
        tx.query('select * from world_v2.central_bank_omo_original'),
      ),
    ).rejects.toThrow();
    await f.db.exec(
      "insert into world_v2.finance_budget_policy_revocation values('HOST_FINANCE_TEST_ONLY')",
    );
    await expect(
      run('world_v2_finance_budget_source_reader', (tx) =>
        readPostwarPagedOmoHistoryOriginalsFrom(tx, base),
      ),
    ).rejects.toThrow('CB_OMO_HISTORY_CURRENT_HOST_SOURCE_REQUIRED');
    expect((await f.counts()).batches).toBe(1);
  } finally {
    await f.db.close();
  }
});
