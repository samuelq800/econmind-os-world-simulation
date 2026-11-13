/** Fixed old-schema -> CREATE increment in one owned in-memory DB. No native
 * database, official private source, running Node, hot upgrade or production. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { createSocialEmploymentCreationSqlFixture } from '../support/social-employment-creation-sql-fixture.js';
import { preparePostwarSocialEmploymentCreationForward } from '../support/postwar-social-employment-creation-forward.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
it('applies the exact dc5/bde increment, preserves old rows/OIDs/ACL/RLS and repeats before actual CREATE→PLAN→MATCH old readback', async () => {
  const f = await createSocialEmploymentCreationSqlFixture('DC5_PREDECESSOR');
  const db = f.db;
  try {
    const manifest = JSON.parse(
      await read(
        'database/upgrades/postwar-social-employment-creation.manifest.json',
      ),
    ) as {
      functions: readonly {
        signature: string;
        oldBodySha256: string;
        newBodySha256: string;
      }[];
      upgrade: { path: string; sha256: string };
    };
    const prepared = await preparePostwarSocialEmploymentCreationForward(
      resolve('.'),
    );
    const sql = prepared.sql;
    expect(prepared.sourceInitializer.performed).toBe(false);
    expect(prepared.operatorPrecondition).toBe(
      'ALL_CONSUMERS_AND_SOURCE_PUBLICATION_TRANSACTIONS_STOPPED_AND_DRAINED',
    );
    expect(sha(sql)).toBe(manifest.upgrade.sha256);
    const metadata = async () =>
      (
        await db.query<{
          signature: string;
          oid: number;
          body: string;
          owner: string;
          acl: string;
          config: unknown;
          definer: boolean;
        }>(
          `select p.oid,p.oid::regprocedure::text signature,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')body,pg_get_userbyid(p.proowner)owner,p.proacl::text acl,p.proconfig config,p.prosecdef definer from pg_proc p where p.oid=any($1::regprocedure[]) order by p.oid::regprocedure::text`,
          [manifest.functions.map((x) => x.signature)],
        )
      ).rows;
    const stable = async () =>
      (
        await db.query(`select
     (select jsonb_agg(to_jsonb(x)order by x.country_id)from world_v2.postwar_social_prefix_scope x)scopes,
     (select jsonb_agg(to_jsonb(x)order by x.document_ref)from world_v2.postwar_office_projection_document x)documents,
     (select jsonb_agg(to_jsonb(x)order by x.document_ref,x.page_index)from world_v2.postwar_office_projection_page x)pages,
     (select jsonb_agg(to_jsonb(x)order by x.world_id)from world_v2.world_head x)heads,
     (select jsonb_agg(to_jsonb(x)order by x.world_id)from world_v2.opening_seed x)seeds,
     (select jsonb_agg(to_jsonb(x)order by x.roleid,x.member)from pg_auth_members x)memberships,
     (select jsonb_agg(to_jsonb(x)order by x.rolname)from pg_roles x where x.rolname like 'world_v2_%')roles,
     (select count(*)from world_v2.authoritative_event)events,
     (select count(*)from world_v2.command_receipt)receipts,
     (select count(*)from world_v2.financial_posting_batch)financial,
     (select count(*)from world_v2.inventory_posting)inventory`)
      ).rows;
    const before = await metadata(),
      rows = await stable();
    expect(before).toHaveLength(13);
    for (const spec of manifest.functions)
      expect(before.find((x) => x.signature === spec.signature)?.body).toBe(
        spec.oldBodySha256,
      );
    await db.exec(sql);
    const after = await metadata();
    expect(await stable()).toEqual(rows);
    for (const spec of manifest.functions) {
      const old = before.find((x) => x.signature === spec.signature)!,
        next = after.find((x) => x.signature === spec.signature)!;
      expect(next.body).toBe(spec.newBodySha256);
      expect({ ...next, body: '' }).toEqual({ ...old, body: '' });
    }
    await db.exec(sql);
    expect(await metadata()).toEqual(after);
    expect(await stable()).toEqual(rows);
    await f.assertActualCreationChain();
    await f.admin();
    const licences = (
      await db.query(
        'select * from world_v2.postwar_social_employment_creation_licence order by country_id,licence_ref',
      )
    ).rows;
    expect(licences).toHaveLength(2);
    await db.exec(sql);
    expect(
      (
        await db.query(
          'select * from world_v2.postwar_social_employment_creation_licence order by country_id,licence_ref',
        )
      ).rows,
    ).toEqual(licences);
    expect(await metadata()).toEqual(after);
  } finally {
    await db.close();
  }
}, 60000);
it('uses the existing conservative transaction classifier without a new destructive-SQL exception', () => {
  const script =
    "import{readFileSync}from'node:fs';import{pathToFileURL}from'node:url';const{classifyDeltaTransaction}=await import(pathToFileURL(process.argv[2]));const r=classifyDeltaTransaction(readFileSync(process.argv[3]));if(r.sourceEnvelope!=='SOURCE_BEGIN_COMMIT')throw Error('EXACT_ATOMIC_ENVELOPE_REQUIRED');";
  const r = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      script,
      'FIXED_IMPORT_ONLY',
      resolve('tools/office-connection/postwar-schema-delta.mjs'),
      resolve('database/upgrades/postwar-social-employment-creation.sql'),
    ],
    { encoding: 'utf8' },
  );
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
});

it('refuses unknown body/ACL/search-path metadata and rolls back a known mid-package failure without touching old rows', async () => {
  const f = await createSocialEmploymentCreationSqlFixture('DC5_PREDECESSOR'),
    db = f.db;
  try {
    const manifest = JSON.parse(
      await read(
        'database/upgrades/postwar-social-employment-creation.manifest.json',
      ),
    ) as {
      functions: {
        signature: string;
        oldBodySha256: string;
        newBodySha256: string;
      }[];
      upgrade: { path: string };
    };
    const sql = await read(manifest.upgrade.path),
      signature = manifest.functions[0]!.signature;
    const catalog = async () =>
      (
        await db.query<{
          signature: string;
          body: string;
          acl: string;
          config: unknown;
        }>(
          `select p.oid::regprocedure::text signature,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')body,p.proacl::text acl,p.proconfig config from pg_proc p where p.oid=any($1::regprocedure[])order by p.oid::regprocedure::text`,
          [manifest.functions.map((x) => x.signature)],
        )
      ).rows;
    const absent = async () =>
      expect(
        (
          await db.query<{ name: string | null }>(
            "select to_regclass('world_v2.postwar_social_employment_creation_licence')::text name",
          )
        ).rows[0]!.name,
      ).toBe(null);
    const reject = async (text: string, reason: string) => {
      let caught: unknown;
      try {
        await db.exec(text);
      } catch (e) {
        caught = e;
      } finally {
        await db.exec('rollback');
      }
      expect(caught).toMatchObject({ code: '55000' });
      expect(String((caught as Error).message)).toContain(reason);
    };
    const original = (
        await db.query<{ definition: string; body: string }>(
          'select pg_get_functiondef($1::regprocedure)definition,prosrc body from pg_proc where oid=$1::regprocedure',
          [signature],
        )
      ).rows[0]!,
      before = await catalog();
    await db.exec(
      original.definition.replace(
        original.body,
        () => original.body + '\n-- TEST_ONLY_UNKNOWN_PREDECESSOR\n',
      ),
    );
    await reject(sql, 'SOCIAL_CREATE_EXACT_PREDECESSOR_BODY_REQUIRED');
    await absent();
    await db.exec(original.definition);
    expect(await catalog()).toEqual(before);
    await db.exec(
      'grant execute on function ' +
        signature +
        'to world_v2_postwar_projection_reader',
    );
    await reject(sql, 'SOCIAL_CREATE_EXACT_PREDECESSOR_METADATA_REQUIRED');
    await absent();
    await db.exec(
      'revoke execute on function ' +
        signature +
        'from world_v2_postwar_projection_reader',
    );
    await db.exec('alter function ' + signature + 'set search_path=public');
    await reject(sql, 'SOCIAL_CREATE_EXACT_PREDECESSOR_METADATA_REQUIRED');
    await absent();
    await db.exec('alter function ' + signature + 'set search_path=pg_catalog');
    expect(await catalog()).toEqual(before);
    const boundary =
      ' -- Fixed failure-injection boundary for the isolated rollback test only.';
    expect(sql.includes(boundary)).toBe(true);
    const injected = sql.replace(
      boundary,
      () =>
        " raise exception 'TEST_ONLY_MID_PACKAGE_FAILURE'using errcode='55000';\n" +
        boundary,
    );
    await reject(injected, 'TEST_ONLY_MID_PACKAGE_FAILURE');
    await absent();
    expect(await catalog()).toEqual(before);
    await db.exec(sql);
    await db.exec(
      'alter function world_v2.prepare_postwar_social_employment_creation_licences(text)set search_path=public',
    );
    await reject(sql, 'SOCIAL_CREATE_EXACT_SUPPLEMENT_FUNCTION_REQUIRED');
    await db.exec(
      'alter function world_v2.prepare_postwar_social_employment_creation_licences(text)set search_path=pg_catalog',
    );
    await db.exec(sql);
  } finally {
    await db.close();
  }
}, 60000);
it('loads only the fixed review package without executing or approving its source initializer', async () => {
  const a = await preparePostwarSocialEmploymentCreationForward(resolve('.'));
  expect(a.functions).toHaveLength(13);
  expect(a.sourceEnvelope).toBe('SOURCE_BEGIN_COMMIT');
  expect(a.classification).toBe(
    'FIXED_REVIEW_ARTIFACT_NOT_APPROVAL_OR_SOURCE_AUTHORITY',
  );
  expect(a.sourceInitializer).toEqual({
    signature:
      'world_v2.prepare_postwar_social_employment_creation_licences(text)',
    role: 'world_v2_postwar_projection_publisher',
    separateTransaction: true,
    performed: false,
  });
});
