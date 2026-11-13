/** Actual small embedded old-catalog -> new-catalog checks. Sentinel derived
 * rows are TEST_ONLY metadata, not admitted sources or economic executions. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { it, expect } from 'vitest';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
// This historical upgrade ends at 4b6d400c. The later domestic-model forward
// has its own tests; it must not rewrite this upgrade's target or receipt.
const readTarget = (name: string) =>
  read(
    name === 'postwar-industry-first-day-source'
      ? 'tests/fixtures/sql/postwar-industry-first-day-source.4b6d400c.sql'
      : 'database/proposals/' + name + '.sql',
  );
const names = [
  'postwar-captain-current-derived-read',
  'postwar-captain-h0-current',
  'postwar-industry-first-day-source',
  'postwar-paged-current-projection',
  'postwar-industry-utility-custody',
];
const upgrades = [
  [
    'postwar-captain-allocation-options-upgrade',
    'read_postwar_captain_current_page(text,integer,integer,text)',
    'postwar-captain-h0-current',
    'postwar_captain_h0_current_document',
  ],
  [
    'postwar-industry-first-day-refinery-upgrade',
    'publish_postwar_industry_first_day_source(text,text,text,text,text,text,text)',
    'postwar-industry-first-day-source',
    'postwar_industry_first_day_source',
  ],
  [
    'postwar-paged-current-options-upgrade',
    'read_postwar_paged_current_page(text,text,text,integer,integer,text)',
    'postwar-paged-current-projection',
    'postwar_paged_current_document',
  ],
  [
    'postwar-industry-utility-source-functions-upgrade',
    'publish_postwar_industry_utility_source(text,text,jsonb,text)',
    'postwar-industry-utility-custody',
    'postwar_industry_utility_source',
  ],
] as const;
function declaration(sql: string, name: string) {
  const escaped = name.slice(0, name.indexOf('('));
  const d = sql.match(
    new RegExp(
      'create(?: or replace)? function world_v2\\.' +
        escaped +
        '\\([^$]*?as \\$\\$[\\s\\S]*?\\$\\$;',
    ),
  )?.[0];
  if (!d) throw Error('EXACT_SOURCE_FUNCTION_REQUIRED');
  return d.replace('create function', 'create or replace function');
}
it('installs exact predecessor proposals and upgrades in place, preserving rows/OIDs/ACL/RLS and rejecting drift/repeat/partial failures', async () => {
  const db = new PGlite();
  const legacy = new Map<string, string>();
  const manifest = JSON.parse(
    await read('database/upgrades/postwar-0cf65bc0-to-4b6d400c.manifest.json'),
  ) as {
    oldProposalSha256: Record<string, string>;
    newProposalSha256: Record<string, string>;
    tableChanges: readonly {
      relation: string;
      oldPrimaryKey: readonly string[];
      targetPrimaryKey: readonly string[];
    }[];
  };
  const meta = async (signature: string) =>
    (
      await db.query<Record<string, unknown>>(
        `select p.oid,p.prosrc,p.proargnames,p.proisstrict,p.proleakproof,p.proparallel,p.pronargdefaults,pg_get_expr(p.proargdefaults,0)as defaults_expression,p.proargdefaults::text,p.prosecdef,p.proconfig,p.provolatile,p.proacl::text,pg_get_userbyid(p.proowner)as owner,pg_get_function_result(p.oid)as result from pg_proc p where p.oid=to_regprocedure($1)`,
        ['world_v2.' + signature],
      )
    ).rows;
  const stable = async () =>
    (
      await db.query(`select
    (select jsonb_agg(to_jsonb(x)order by x.rolname)from pg_roles x where x.rolname like 'world_v2_%')as roles,
    (select jsonb_agg(to_jsonb(x)order by x.roleid,x.member)from pg_auth_members x)as memberships,
    (select jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity)order by c.relname)from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2'and c.relkind in('r','p'))as tables,
    (select jsonb_agg(to_jsonb(p)order by p.polrelid,p.polname)from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2')as policies,
    (select jsonb_agg(to_jsonb(t)order by t.tgrelid,t.tgname)from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2')as triggers,
    (select jsonb_agg(to_jsonb(x))from world_v2.postwar_paged_current_document x)as documents,
    (select jsonb_agg(to_jsonb(x))from world_v2.postwar_paged_current_page x)as pages,
    (select jsonb_agg(to_jsonb(x))from world_v2.world_head x)as heads`)
    ).rows;
  const reject = async (sql: string, code: string, message: string) => {
    let error: unknown;
    try {
      await db.exec(sql);
    } catch (e) {
      error = e;
    } finally {
      await db.exec('rollback');
    }
    expect(error).toMatchObject({ code });
    expect(String((error as Error).message)).toContain(message);
  };
  try {
    for (const n of names) {
      const old = await read('tests/fixtures/sql/' + n + '.0cf65bc0.sql');
      expect(sha(old)).toBe(manifest.oldProposalSha256[n]);
      legacy.set(n, old);
      expect(sha(await readTarget(n))).toBe(manifest.newProposalSha256[n]);
    }
    const tableChange = manifest.tableChanges[0];
    if (!tableChange) throw Error('EXACT_TARGET_PRIMARY_KEY_RECORD_REQUIRED');
    const primaryKey = (sql: string) => {
      const start = sql.indexOf('create table ' + tableChange.relation + '(');
      if (start < 0) throw Error('ACTUAL_TABLE_DECLARATION_REQUIRED');
      const table = sql.slice(start, sql.indexOf(');', start) + 2);
      const match = table.match(/primary key\(([^)]*)\)/u);
      if (!match) throw Error('ACTUAL_PRIMARY_KEY_REQUIRED');
      return match[1]!.split(',').map((s) => s.trim());
    };
    expect(tableChange.oldPrimaryKey).toEqual(
      primaryKey(legacy.get('postwar-industry-utility-custody')!),
    );
    expect(tableChange.targetPrimaryKey).toEqual(
      primaryKey(
        await read('database/proposals/postwar-industry-utility-custody.sql'),
      ),
    );
    for (const n of [
      '0001_world_v2_namespace',
      '0002_world_v2_command_event_ledger',
      '0003_world_v2_command_receipts_outbox',
      '0005_world_v2_writer_lease_fencing',
      '0007_world_v2_atomic_transition_facts',
      '0009_world_v2_posting_payload_integrity',
      '0011_world_v2_current_commit_authorization',
      '0013_world_v2_read_projection_boundary',
      '0016_world_v2_opening_seed',
    ])
      await db.exec(await read('database/migrations/artifacts/' + n + '.sql'));
    for (const n of [
      'runtime-read-binding-storage',
      'runtime-admission-publication',
      'postwar-office-derived-read',
      'postwar-social-current-derived-read',
      'postwar-social-current-prefix-read',
      'postwar-financial-current-derived-read',
      'postwar-day-one-fx-custody',
      'postwar-mixed-current-projection-read',
      'social-operating-custody',
      'finance-budget-custody',
      'postwar-day-one-fx-history-read',
      'postwar-bounded-journal-read',
      'postwar-bounded-prefix-read',
      'postwar-bounded-prefix-pages',
      'captain-operating-custody',
      'postwar-captain-source-publication',
      'postwar-captain-current-derived-read',
      'postwar-paged-current-projection',
      'postwar-captain-h0-current',
      'postwar-industry-production-source',
      'postwar-industry-first-day-source',
      'postwar-industry-utility-custody',
    ])
      await db.exec(
        legacy.get(n) ?? (await read('database/proposals/' + n + '.sql')),
      );
    // Actual old table constraints/RLS are retained. These deliberately marked
    // derived sentinel rows are never presented as a genuine World/source.
    await db.exec(`insert into world_v2.world_head values('WORLD_TEST_ONLY_UPGRADE',0,0);
      insert into world_v2.postwar_paged_current_document values('TEST_ONLY_DOC','WORLD_TEST_ONLY_UPGRADE','COUNTRY_02','CAPTAIN','political-capital-current',null,1,1,0,0,'sha256:${'1'.repeat(64)}','TEST_ONLY','TEST_ONLY_ADMISSION','TEST_ONLY_SEED','TEST_ONLY_FP','${'2'.repeat(64)}','${'3'.repeat(64)}','TEST_ONLY','{}','${'4'.repeat(64)}','{}','{}',1,1);
      insert into world_v2.postwar_paged_current_page values('TEST_ONLY_DOC','WORLD_TEST_ONLY_UPGRADE',0,0,1,'["TEST_ONLY_EXISTING_ROW"]',encode(sha256(convert_to('["TEST_ONLY_EXISTING_ROW"]','UTF8')),'hex'));`);
    const baseline = await stable();
    for (const [name, signature, source, table] of upgrades) {
      const sql = await read('database/upgrades/' + name + '.sql');
      const before = await meta(signature);
      expect(before).toHaveLength(1);
      const original = declaration(legacy.get(source)!, signature);
      const evidenceSignature =
        'read_postwar_industry_water_command_evidence(text,text,text,text,bigint,bigint,text,text,jsonb)';
      if (source === 'postwar-industry-utility-custody') {
        const evidenceOriginal = declaration(
          legacy.get(source)!,
          evidenceSignature,
        );
        await db.exec(
          evidenceOriginal.replace(
            '$$;',
            () => '\n-- TEST_ONLY evidence drift\n$$;',
          ),
        );
        await reject(
          sql,
          '55000',
          'PROPOSAL_UPGRADE_EXACT_OLD_FUNCTION_REQUIRED',
        );
        await db.exec(evidenceOriginal);
      }

      await db.exec(
        original.replace('$$;', () => '\n-- TEST_ONLY definition drift\n$$;'),
      );
      await reject(
        sql,
        '55000',
        'PROPOSAL_UPGRADE_EXACT_OLD_FUNCTION_REQUIRED',
      );
      await db.exec(original);
      expect(await meta(signature)).toEqual(before);
      await db.exec(
        'grant execute on function world_v2.' + signature + ' to public',
      );
      await reject(
        sql,
        '42501',
        'PROPOSAL_UPGRADE_EXACT_FUNCTION_ACL_REQUIRED',
      );
      await db.exec(
        'revoke execute on function world_v2.' + signature + ' from public',
      );
      await db.exec(
        'alter table world_v2.' + table + ' disable row level security',
      );
      await reject(
        sql,
        '55000',
        'PROPOSAL_UPGRADE_EXISTING_FORCED_RLS_REQUIRED',
      );
      await db.exec(
        'alter table world_v2.' + table + ' enable row level security',
      );
      expect(await stable()).toEqual(baseline);
      await reject(
        sql.replace(
          'do $postflight$',
          "do $failure$begin raise exception 'TEST_ONLY_INJECTED'using errcode='P0001';end;$failure$;\ndo $postflight$",
        ),
        'P0001',
        'TEST_ONLY_INJECTED',
      );
      expect(await meta(signature)).toEqual(before);
      expect(await stable()).toEqual(baseline);
      await db.exec(sql);
      const after = await meta(signature);
      expect(after[0]).toMatchObject({
        ...before[0],
        prosrc: expect.any(String),
      });
      expect(after[0]?.prosrc).not.toBe(before[0]?.prosrc);
      expect(await stable()).toEqual(baseline);
      const current = declaration(await readTarget(source), signature);
      expect(after[0]?.prosrc).toBe(
        current.match(/as \$\$([\s\S]*?)\$\$;/u)?.[1],
      );
      if (source === 'postwar-industry-utility-custody') {
        const expected = declaration(
          await read('database/proposals/' + source + '.sql'),
          evidenceSignature,
        );
        expect((await meta(evidenceSignature))[0]?.prosrc).toBe(
          expected.match(/as \$\$([\s\S]*?)\$\$;/u)?.[1],
        );
      }

      await reject(
        sql,
        '55000',
        'PROPOSAL_UPGRADE_EXACT_OLD_FUNCTION_REQUIRED',
      );
      expect(await meta(signature)).toEqual(after);
      expect(await stable()).toEqual(baseline);
    }
    // Private helper adds bounded metadata only, with no reader EXEC grant.
    expect(
      (
        await db.query(
          'select world_v2.postwar_captain_allocation_options(null,$1)as value',
          ['COUNTRY_02'],
        )
      ).rows,
    ).toEqual([{ value: null }]);
    await db.exec('begin;set local role world_v2_postwar_projection_reader');
    await expect(
      db.query('select world_v2.postwar_captain_allocation_options(null,$1)', [
        'COUNTRY_02',
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    await db.exec('rollback');
    expect(await stable()).toEqual(baseline);
  } finally {
    await db.close();
  }
}, 30000);
