/** Actual embedded PostgreSQL + genuine Core CB commit. Trade host metadata is
 * explicitly TEST_ONLY, independently enrolled in this fixture; it is neither
 * production OP representation nor a Captain command acceptance fixture. */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
import {
  prepareFinanceSocialLedger,
  replayPreparedFinanceSocialFxLedger,
} from '@econmind/core/finance-social-prepared-ledger';
import {
  createCentralBankOmoAtomicFixture,
  cbAtomicTestSha as sha,
} from '../support/postwar-central-bank-omo-atomic-fixture.js';
import { DurableV08LedgerLineageReader } from '../../apps/world-worker/src/persistence/durable-v08-ledger-lineage-reader.js';
import { readCentralBankOmoMixedReplayOriginalsFrom } from '../../apps/world-worker/src/persistence/postgres-central-bank-omo-history.js';
import { readPostwarNarrowTradeHistoryOriginalsFrom } from '../../apps/world-worker/src/persistence/postwar-narrow-trade-history-originals.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';

const proposal = async (name: string) =>
  readFile(
    new URL('../../database/proposals/' + name, import.meta.url),
    'utf8',
  );
describe('Trade complete-prefix historical originals, not Office authority', () => {
  it('rejects a copied or caller-made Social baseline before any historical SQL', async () => {
    let calls = 0;
    await expect(
      readPostwarNarrowTradeHistoryOriginalsFrom(
        {
          query: async () => {
            calls++;
            throw Error('UNEXPECTED_SQL');
          },
        },
        {
          baseline: {} as never,
          mode: 'OFFICIAL_RUNTIME',
          worldId: 'WORLD_TEST',
          hostCountryId: 'COUNTRY_01',
          frames: [],
          expectedHead: { worldVersion: '0', eventSequence: '0' },
        },
      ),
    ).rejects.toThrow('GENUINE_LIVE_FINANCIAL_REPLAY_BASE_REQUIRED');
    expect(calls).toBe(0);
  });
  it('uses the real Trade host guard and immutable CB history at the actual head, including current-host revocation and no raw-table privileges', async () => {
    const f = await createCentralBankOmoAtomicFixture();
    try {
      await f.execution.executeQueuedCommand(f.input);
      const lineage = await f.admin.transaction((tx) =>
        new DurableV08LedgerLineageReader({
          database: f.admin,
          sha256Hex: sha,
        }).readValidatedLineageFrom(tx, f.seed.worldId),
      );
      await f.db.exec(`
create role world_v2_day_one_fx_history_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role world_v2_captain_source_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role world_v2_postwar_narrow_trade_current_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role world_v2_postwar_narrow_trade_source nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create role trade_history_test_worker nologin inherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant world_v2_postwar_narrow_trade_source to trade_history_test_worker;
create role world_v2_finance_budget_source_reader nologin;
create role world_v2_social_source_reader nologin;
create role world_v2_day_one_fx_source_reader nologin;
create role world_v2_captain_source_reader nologin;
grant usage on schema world_v2 to world_v2_day_one_fx_history_owner,world_v2_captain_source_owner,world_v2_postwar_narrow_trade_current_owner,world_v2_postwar_narrow_trade_source,trade_history_test_worker,world_v2_finance_budget_source_reader;
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
create table world_v2.captain_source_publication_registry(world_id text,country_id text,seed_fingerprint text,world_admission_ref text,adoption_ref text);
-- This fixture does not supply Captain originals. Calling it always fails;
-- only its real catalog signature is needed by the optional EXEC enrollment.
create function world_v2.read_postwar_captain_history_originals(text,text,text,text,text,text)returns void language plpgsql as $$begin raise exception 'TEST_ONLY_CAPTAIN_NOT_INSTALLED';end;$$;
revoke all on function world_v2.read_postwar_captain_history_originals(text,text,text,text,text,text)from public;
create table world_v2.postwar_narrow_trade_rights_admission(world_id text,seed_fingerprint text,source_id text,source_payload_hash text,admission_ref text);
create table world_v2.postwar_narrow_trade_rights_revocation(admission_ref text);
create table world_v2.postwar_narrow_trade_current_original(world_id text,seed_fingerprint text,source_id text,source_payload_hash text,canonical_payload text);
grant select on world_v2.world_head,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation,world_v2.postwar_narrow_trade_rights_admission,world_v2.postwar_narrow_trade_rights_revocation,world_v2.postwar_narrow_trade_current_original,world_v2.command_submission,world_v2.command_receipt to world_v2_postwar_narrow_trade_current_owner;
grant select(world_id,seed_id,seed_fingerprint,replay_binding)on world_v2.opening_seed to world_v2_postwar_narrow_trade_current_owner;
grant update(world_version)on world_v2.world_head to world_v2_postwar_narrow_trade_current_owner;
grant update(seed_id)on world_v2.runtime_opening_admission to world_v2_postwar_narrow_trade_current_owner;
grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_postwar_narrow_trade_current_owner;
grant update(source_id)on world_v2.postwar_narrow_trade_rights_admission to world_v2_postwar_narrow_trade_current_owner;
`);
      // Fixture-only owner policy mirrors the existing Trade proposal's exact
      // world RLS fence. The actual runtime worker obtains EXEC, never SELECT.
      for (const table of [
        'world_head',
        'opening_seed',
        'runtime_opening_admission',
        'command_submission',
        'command_receipt',
      ]) {
        await f.db.exec(
          `create policy trade_history_test_read on world_v2.${table} for select to world_v2_postwar_narrow_trade_current_owner using(world_id=current_setting('econmind.narrow_current_world',true));`,
        );
      }
      for (const table of ['world_head', 'runtime_opening_admission']) {
        await f.db.exec(
          `create policy trade_history_test_lock on world_v2.${table} for update to world_v2_postwar_narrow_trade_current_owner using(world_id=current_setting('econmind.narrow_current_world',true))with check(false);`,
        );
      }
      await f.db.exec(await proposal('central-bank-omo-history-read.sql'));
      await f.db.exec(await proposal('postwar-narrow-trade-history-read.sql'));
      const body = C.canonicalSerialize({
        records: [{ kind: 'OWNER_TRANSFER_MANDATE', countryId: 'COUNTRY_01' }],
      });
      await f.db.query(
        'insert into world_v2.postwar_narrow_trade_rights_admission values($1,$2,$3,$4,$5)',
        [
          f.seed.worldId,
          f.seed.fingerprint,
          'RIGHT_TEST_ONLY',
          'sha256:' + sha(body),
          'RIGHT_ADMISSION_TEST_ONLY',
        ],
      );
      await f.db.query(
        'insert into world_v2.postwar_narrow_trade_current_original values($1,$2,$3,$4,$5)',
        [
          f.seed.worldId,
          f.seed.fingerprint,
          'RIGHT_TEST_ONLY',
          'sha256:' + sha(body),
          body,
        ],
      );
      const initialSession = (
        await f.db.query<{ session_user: string }>('select session_user')
      ).rows[0]!.session_user;
      if (!/^[a-z_][a-z_0-9]*$/u.test(initialSession))
        throw Error('TEST_ONLY_SAFE_ADMIN_ID_REQUIRED');
      const run = async <T>(
        consume: (tx: SqlExecutor) => Promise<T>,
        role = 'trade_history_test_worker',
      ) => {
        await f.db.exec(
          'reset role;set session authorization ' +
            role +
            ';begin isolation level repeatable read;set local role ' +
            role,
        );
        try {
          const result = await consume({
            async query<Row extends object>(
              sql: string,
              params: readonly unknown[] = [],
            ) {
              const r = await f.db.query<Row>(sql, [...params]);
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
        } finally {
          await f.db.exec(
            'set session authorization ' + initialSession + ';reset role',
          );
        }
      };
      const input = {
        worldId: f.seed.worldId,
        hostCountryId: 'COUNTRY_01',
        seedFingerprint: f.seed.fingerprint,
        admissionRef: 'ADMISSION_' + '1'.repeat(64),
        officeId: 'TRADE' as const,
        expectedHead: { worldVersion: '1', eventSequence: '1' },
        mode: 'TEST_ONLY_LOCAL' as const,
        frames: lineage.transitions,
        sourceMetadata: f.seed.sources.map((s) => ({
          sourceId: s.sourceId,
          payloadHash: s.payloadHash,
        })),
      };
      const read = () =>
        run((tx) => readCentralBankOmoMixedReplayOriginalsFrom(tx, input));
      // A genuine current Trade host must not turn TEST_ONLY instruments into
      // formal originals merely because the caller is correctly authenticated.
      await expect(
        run((tx) =>
          readCentralBankOmoMixedReplayOriginalsFrom(tx, {
            ...input,
            mode: 'OFFICIAL_RUNTIME',
          }),
        ),
      ).rejects.toThrow('UNIQUE_INDEPENDENT_ADOPTED_ORIGIN_REQUIRED');
      const originals = await read();
      expect(originals).toHaveLength(1);
      const prepared = prepareFinanceSocialLedger(
        C.rebuildV08LedgersFromLineage({ seed: f.seed, sha256Hex: sha })
          .financial,
      );
      const replayed = replayPreparedFinanceSocialFxLedger({
        prepared,
        frames: lineage.transitions.map((frame) => ({
          ...frame,
          events: frame.transition.events,
        })),
        socialCountries: [],
        openingEncumbrances: [],
        fxOriginals: [],
        omoOriginals: originals,
        expectedHead: input.expectedHead,
        sha256Hex: sha,
      });
      expect(C.canonicalSerialize(replayed.financial)).toBe(
        C.canonicalSerialize(
          C.rebuildV08LedgersFromLineage({
            seed: f.seed,
            transitions: lineage.transitions,
            sha256Hex: sha,
          }).financial,
        ),
      );
      await expect(
        run((tx) =>
          readCentralBankOmoMixedReplayOriginalsFrom(tx, {
            ...input,
            hostCountryId: 'COUNTRY_02',
          }),
        ),
      ).rejects.toThrow(
        'TRADE_HISTORY_CURRENT_HOST_OR_COMMITTED_OBLIGATION_REQUIRED',
      );
      await expect(
        run((tx) =>
          readCentralBankOmoMixedReplayOriginalsFrom(tx, {
            ...input,
            expectedHead: { worldVersion: '2', eventSequence: '2' },
          }),
        ),
      ).rejects.toThrow('EXACT_BOUNDED_HEAD_REQUIRED');
      await expect(
        run((tx) =>
          tx.query('select * from world_v2.central_bank_omo_original'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        run((tx) =>
          tx.query('select canonical_payload from world_v2.opening_seed'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        run((tx) =>
          tx.query(
            'set local role world_v2_postwar_narrow_trade_current_owner',
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        run(
          (tx) => readCentralBankOmoMixedReplayOriginalsFrom(tx, input),
          'world_v2_finance_budget_source_reader',
        ),
      ).rejects.toThrow('FIXED_HOST_READER_REQUIRED');
      await f.revoke('QUOTE');
      expect(await read()).toEqual(originals); // committed history remains true
      await f.db.exec(
        "insert into world_v2.postwar_narrow_trade_rights_revocation values('RIGHT_ADMISSION_TEST_ONLY')",
      );
      await expect(read()).rejects.toThrow(
        'TRADE_HISTORY_CURRENT_HOST_OR_COMMITTED_OBLIGATION_REQUIRED',
      );
    } finally {
      await f.db.close();
    }
  }, 30000);
});
