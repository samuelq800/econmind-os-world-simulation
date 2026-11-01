/** Actual embedded PostgreSQL policy publication over genuine selected raw site
 * bytes and explicit TEST_ONLY metadata rows. No signed World admission, work,
 * production, payment or native deployment acceptance is claimed here. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import {
  loadPostwarIndustryFirstDayAdoptedPolicy,
  publishPostwarIndustryFirstDaySourceFrom,
  readPostwarIndustryFirstDaySourceFrom,
  INDUSTRY_FIRST_DAY_PUBLISH_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-industry-first-day-source.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const read = (file: string) =>
  readFile(new URL('../../' + file, import.meta.url), 'utf8');
describe('adopted Industry opening rules are registered originals, not execution', () => {
  it('does not issue policy authority from an interface-shaped object or arbitrary callback', async () => {
    let calls = 0;
    await expect(
      publishPostwarIndustryFirstDaySourceFrom(
        {
          query: async () => {
            calls++;
            throw Error('UNEXPECTED_SQL');
          },
        },
        {
          worldId: 'WORLD_TEST',
          countryId: 'COUNTRY_02',
          facilityId: 'OPEN-02-REFINED_FUEL',
          adoptedPolicy: {} as never,
          sourceContext: {} as never,
        },
      ),
    ).rejects.toThrow('GENUINE_POLICY');
    expect(calls).toBe(0);
  });
  it('publishes exact adopted bytes and raw site once, with actual source/head/revocation and low-role denials', async () => {
    const db = new PGlite();
    try {
      const context = await loadPostwarSourceContext(process.cwd());
      const policy = await loadPostwarIndustryFirstDayAdoptedPolicy(
        process.cwd(),
      );
      const world = 'WORLD_INDUSTRY_FIRST_DAY_TEST_ONLY',
        seedId = 'SEED_INDUSTRY_FIRST_DAY_TEST_ONLY',
        seedFingerprint = 'sha256:' + '2'.repeat(64),
        authorization = '3'.repeat(64),
        admissionRef = 'ADMISSION_' + authorization.toUpperCase();
      const datasets = context.sourceBytes.datasets;
      const facilities = JSON.parse(
        datasets['data/facilities.json']!,
      ) as Record<string, unknown>[];
      const site = facilities.find((f) => f.id === 'OPEN-02-REFINED_FUEL')!;
      const recipe = (
        JSON.parse(datasets['data/recipes.json']!) as Record<string, unknown>[]
      ).find((r) => r.id === site.recipeId)!;
      const mapping = JSON.parse(context.mappingBytes) as {
        mappings: {
          regions: Record<string, unknown>[];
          entityProposals: Record<string, unknown>[];
        };
      };
      const region = mapping.mappings.regions.find(
        (r) => r.sourceRegionId === site.regionId,
      )!;
      const op = mapping.mappings.entityProposals.find(
        (e) => e.sourceEntityId === site.operatorId,
      )!;
      const body = JSON.stringify({
        worldId: world,
        countryId: 'COUNTRY_02',
        locationId: region.normalizedRegionId,
        operatorId: op.proposedCoreLegalEntityId,
        sourceFacility: site,
        recipe,
        technologyProposals: [],
        licenseProposals: [],
        commodityCatalog: JSON.parse(datasets['data/commodity-catalog.json']!),
      });
      await db.exec(`create schema world_v2;
create role world_v2_industry_source_owner nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
create role world_v2_industry_source_publisher nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
create role world_v2_industry_source_reader nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
grant usage on schema world_v2 to world_v2_industry_source_owner,world_v2_industry_source_publisher,world_v2_industry_source_reader;
create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,replay_binding text,model_version text,admission_ref text,admitted_at_real timestamptz);
create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
create table world_v2.runtime_admission_publication_revocation(authorization_id text);
create table world_v2.postwar_industry_original(world_id text,country_id text,facility_id text,registration_ref text,seed_fingerprint text,admission_ref text,document_text text,document_sha256 text,checksums_sha256 text,unique(world_id,registration_ref));
create table world_v2.postwar_industry_original_revocation(world_id text,registration_ref text);
create function world_v2.reject_authoritative_history_mutation()returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE_HISTORY';end;$$;
grant select on world_v2.world_head,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation,world_v2.postwar_industry_original,world_v2.postwar_industry_original_revocation to world_v2_industry_source_owner;
grant update(world_version)on world_v2.world_head to world_v2_industry_source_owner;
grant update(seed_id)on world_v2.runtime_opening_admission to world_v2_industry_source_owner;
grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_industry_source_owner;
grant update(registration_ref)on world_v2.postwar_industry_original to world_v2_industry_source_owner;
`);
      await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
      await db.query(
        "insert into world_v2.runtime_opening_admission values($1,$2,$3,'TEST_ONLY_REPLAY','TEST_ONLY_MODEL',$4,'2026-11-01Z')",
        [world, seedId, seedFingerprint, admissionRef],
      );
      await db.query(
        "insert into world_v2.runtime_admission_publication_permit values('TEST_ONLY_PERMIT',$1,$2,$3,$4,'TEST_ONLY_MODEL','TEST_ONLY_REPLAY','2026-01-01Z','2027-01-01Z')",
        [authorization, world, seedId, seedFingerprint],
      );
      await db.query(
        'insert into world_v2.postwar_industry_original values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          world,
          'COUNTRY_02',
          'OPEN-02-REFINED_FUEL',
          'REGISTRATION_TEST_ONLY_SITE',
          seedFingerprint,
          admissionRef,
          body,
          sha(body),
          sha(context.sourceBytes.checksumsBytes),
        ],
      );
      const original = await read(
        'database/proposals/postwar-industry-production-source.sql',
      );
      // Execute the exact existing admission guard, not a fake Ready function.
      const start = original.indexOf(
          'create function world_v2.industry_source_admission(',
        ),
        end = original.indexOf(
          'create function world_v2.register_postwar_industry_originals(',
        );
      await db.exec(
        'grant create on schema world_v2 to world_v2_industry_source_owner;' +
          original.slice(start, end),
      );
      await db.exec(
        await read('database/proposals/postwar-industry-first-day-source.sql'),
      );
      await db.exec(`
create role world_v2_finance_budget_source_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
create table world_v2.finance_budget_policy_original(world_id text,country_id text,policy_ref text primary key,seed_fingerprint text,admission_ref text);

create role world_v2_social_source_reader nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage on schema world_v2 to world_v2_social_source_reader,world_v2_finance_budget_source_reader;
create table world_v2.social_operating_source_registration(world_id text,country_id text,registration_ref text primary key,seed_fingerprint text,admission_ref text);

alter table world_v2.social_operating_source_registration enable row level security;
alter table world_v2.social_operating_source_registration force row level security;


create table world_v2.command_submission(world_id text,command_id text,command_fingerprint text,command_type text,country_id text);
create table world_v2.command_receipt(world_id text,command_id text,outcome text,world_version_after bigint,event_ids jsonb);
create table world_v2.authoritative_event(world_id text,causation_command_id text,event_id text,event_type text,world_version bigint,event_sequence bigint,canonical_payload text);
create table world_v2.financial_posting_batch(world_id text,causation_command_id text);
create table world_v2.inventory_posting(world_id text,causation_command_id text);
grant select on world_v2.command_submission,world_v2.command_receipt,world_v2.financial_posting_batch to world_v2_industry_source_owner;
`);
      // Use the actual immutable proposal DDL for both revocation tables.
      // They have parent refs, NOT a world_id column (older fixture was wrong).
      for (const [path, table] of [
        ['social-operating-custody.sql', 'social_operating_source_revocation'],
        ['finance-budget-custody.sql', 'finance_budget_policy_revocation'],
      ] as const) {
        const sql = await read('database/proposals/' + path);
        const start = sql.indexOf('create table world_v2.' + table + '(');
        const end = sql.indexOf(');', start);
        if (start < 0 || end < start)
          throw Error('ACTUAL_REVOCATION_DDL_NOT_FOUND');
        await db.exec(sql.slice(start, end + 2));
        await db.exec(
          'alter table world_v2.' +
            table +
            ' enable row level security;alter table world_v2.' +
            table +
            ' force row level security',
        );
        const columns = await db.query<{ column_name: string }>(
          "select column_name from information_schema.columns where table_schema='world_v2'and table_name=$1",
          [table],
        );
        expect(columns.rows.map((c) => c.column_name)).not.toContain(
          'world_id',
        );
      }
      await db.exec(
        await read('database/proposals/postwar-industry-run-history.sql'),
      );
      const tx: SqlExecutor = {
        async query<Row extends object>(
          sql: string,
          params: readonly unknown[] = [],
        ) {
          const r = await db.query<Row>(sql, [...params]);
          return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
        },
      };
      const run = async <T>(role: string, action: () => Promise<T>) => {
        await db.exec(
          'set session authorization ' +
            role +
            ';begin isolation level repeatable read;set local role ' +
            role,
        );
        try {
          const r = await action();
          await db.exec('commit');
          return r;
        } catch (e) {
          await db.exec('rollback');
          throw e;
        } finally {
          await db.exec('set session authorization postgres;reset role');
        }
      };
      const publish = () =>
        publishPostwarIndustryFirstDaySourceFrom(tx, {
          worldId: world,
          countryId: 'COUNTRY_02',
          facilityId: 'OPEN-02-REFINED_FUEL',
          adoptedPolicy: policy,
          sourceContext: context,
        });
      const scope = {
        worldId: world,
        countryId: 'COUNTRY_02',
        facilityId: 'OPEN-02-REFINED_FUEL',
        head: { worldVersion: '0', eventSequence: '0' },
        expectedPins: { seedId, seedFingerprint, admissionRef },
      };
      expect(
        await run('world_v2_industry_source_reader', () =>
          readPostwarIndustryFirstDaySourceFrom(tx, scope),
        ),
      ).toBe(null);
      const first = await run('world_v2_industry_source_publisher', publish);
      expect(await run('world_v2_industry_source_publisher', publish)).toEqual(
        first,
      );
      const data = await run('world_v2_industry_source_reader', () =>
        readPostwarIndustryFirstDaySourceFrom(tx, scope),
      );
      expect(data?.classification).toBe(
        'ADOPTED_OPENING_RULE_SOURCE_NOT_EXECUTION_OR_COMMIT_AUTHORITY',
      );
      expect(data?.data.execution).toMatchObject({
        maintenancePerformed: null,
        workMinutesBooked: null,
        paymentBatchIds: null,
        outputProduced: null,
      });
      expect(data?.data.maintenanceReferences).toEqual({
        legacyProxy: '1352',
        capitalReferenceBudget: '48548.29',
        classification: 'REFERENCE_NOT_INVOICE_OR_PAYMENT',
      });
      expect(data?.data.domesticAccess).toMatchObject({
        status: 'NOT_SURVEYED_NOT_OPERATIONAL',
        distanceKmEstimate: '1252.5865375359651',
        capacityTonnesDayProposal: '248321.976502',
      });
      await expect(
        run('world_v2_industry_source_reader', () => publish()),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        run('world_v2_industry_source_reader', () =>
          tx.query('select * from world_v2.postwar_industry_first_day_source'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        run('world_v2_industry_source_reader', () =>
          readPostwarIndustryFirstDaySourceFrom(tx, {
            ...scope,
            head: { worldVersion: '1', eventSequence: '1' },
          }),
        ),
      ).rejects.toMatchObject({ code: '55000' });
      await expect(
        run('world_v2_industry_source_publisher', () =>
          tx.query(INDUSTRY_FIRST_DAY_PUBLISH_QUERY, [
            world,
            'COUNTRY_02',
            scope.facilityId,
            '{}',
            '{}',
            context.sourceBytes.checksumsBytes,
            datasets['data/domestic-access.json'],
          ]),
        ),
      ).rejects.toMatchObject({ code: '23514' });
      // Actual stored TEST_ONLY stage metadata, never a fake Core work token.
      await db.query(
        'insert into world_v2.social_operating_source_registration values($1,$2,$3,$4,$5)',
        [
          world,
          'COUNTRY_02',
          'SOCIAL_HOST_TEST_ONLY',
          seedFingerprint,
          admissionRef,
        ],
      );
      await db.query(
        'insert into world_v2.command_submission values($1,$2,$3,$4,$5)',
        [
          world,
          'COMMAND_STAGE_TEST_ONLY',
          'sha256:' + '4'.repeat(64),
          'CORE_INDUSTRY_RUN_SCHEDULE_V1',
          'COUNTRY_02',
        ],
      );
      await db.query(
        "insert into world_v2.command_receipt values($1,$2,'COMMITTED',1,$3::jsonb)",
        [
          world,
          'COMMAND_STAGE_TEST_ONLY',
          JSON.stringify(['EVENT_STAGE_TEST_ONLY']),
        ],
      );
      await db.query(
        'insert into world_v2.authoritative_event values($1,$2,$3,$4,1,1,$5)',
        [
          world,
          'COMMAND_STAGE_TEST_ONLY',
          'EVENT_STAGE_TEST_ONLY',
          'INDUSTRY_FIRST_DAY_RUN_SCHEDULED_V1',
          JSON.stringify({
            terms: { facilityId: scope.facilityId },
            source: {
              sourceRef: first.sourceRef,
              sourceRawSha256: first.sourceSha256,
            },
          }),
        ],
      );
      await db.query(
        'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
        [world],
      );
      const history = () =>
        tx.query<{ source_sha256: string }>(
          "select * from world_v2.read_postwar_industry_run_original($1,$2,'SOCIAL',$3,$4,1,1,$5,$6)",
          [
            world,
            'COUNTRY_02',
            'COMMAND_STAGE_TEST_ONLY',
            'sha256:' + '4'.repeat(64),
            seedFingerprint,
            admissionRef,
          ],
        );
      expect(
        (await run('world_v2_social_source_reader', history)).rows[0]
          ?.source_sha256,
      ).toBe(first.sourceSha256);
      await expect(
        run('world_v2_industry_source_reader', history),
      ).rejects.toMatchObject({ code: '42501' });
      await db.query(
        'insert into world_v2.finance_budget_policy_original values($1,$2,$3,$4,$5)',
        [
          world,
          'COUNTRY_02',
          'FINANCE_HOST_TEST_ONLY',
          seedFingerprint,
          admissionRef,
        ],
      );
      const financeHistory = () =>
        tx.query<{ source_sha256: string }>(
          "select * from world_v2.read_postwar_industry_run_original($1,$2,'FINANCE',$3,$4,1,1,$5,$6)",
          [
            world,
            'COUNTRY_02',
            'COMMAND_STAGE_TEST_ONLY',
            'sha256:' + '4'.repeat(64),
            seedFingerprint,
            admissionRef,
          ],
        );
      expect(
        (await run('world_v2_finance_budget_source_reader', financeHistory))
          .rows[0]?.source_sha256,
      ).toBe(first.sourceSha256);
      await expect(
        run('world_v2_social_source_reader', financeHistory),
      ).rejects.toMatchObject({ code: '42501' });
      await db.query(
        'insert into world_v2.finance_budget_policy_revocation(policy_ref,reason_ref) values($1,$2)',
        ['FINANCE_HOST_TEST_ONLY', 'TEST_ONLY_REVOKE'],
      );
      await expect(
        run('world_v2_finance_budget_source_reader', financeHistory),
      ).rejects.toMatchObject({ code: '55000' });

      await expect(
        run('world_v2_social_source_reader', () =>
          tx.query('select * from world_v2.postwar_industry_first_day_source'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        run('world_v2_social_source_reader', () =>
          tx.query(
            "select * from world_v2.read_postwar_industry_run_original($1,$2,'SOCIAL',$3,$4,1,1,$5,$6)",
            [
              world,
              'COUNTRY_03',
              'COMMAND_STAGE_TEST_ONLY',
              'sha256:' + '4'.repeat(64),
              seedFingerprint,
              admissionRef,
            ],
          ),
        ),
      ).rejects.toMatchObject({ code: '55000' });
      await run('world_v2_industry_source_publisher', () =>
        tx.query(
          'select world_v2.revoke_postwar_industry_first_day_source($1,$2,$3)',
          [world, first.sourceRef, 'TEST_ONLY_REVOKED'],
        ),
      );
      await expect(
        run('world_v2_industry_source_reader', () =>
          readPostwarIndustryFirstDaySourceFrom(tx, {
            ...scope,
            head: { worldVersion: '1', eventSequence: '1' },
          }),
        ),
      ).rejects.toMatchObject({ code: '55000' });
      // Revocation denies NEW actions, not immutable already-committed history.
      expect(
        (await run('world_v2_social_source_reader', history)).rows[0]
          ?.source_sha256,
      ).toBe(first.sourceSha256);
      await db.query(
        'insert into world_v2.social_operating_source_revocation(registration_ref,reason_ref) values($1,$2)',
        ['SOCIAL_HOST_TEST_ONLY', 'TEST_ONLY_REVOKE'],
      );
      await expect(
        run('world_v2_social_source_reader', history),
      ).rejects.toMatchObject({ code: '55000' });
      expect(
        (
          await db.query<{ n: number }>(
            'select count(*)::int n from world_v2.postwar_industry_first_day_source',
          )
        ).rows[0]?.n,
      ).toBe(1);
    } finally {
      await db.close();
    }
  }, 30000);
});
