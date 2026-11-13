/** TEST_ONLY embedded SQL/catalog repair, not official source adoption, native
 * PostgreSQL, running Node/browser, or production installation evidence. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { createIndustryRunParametersSqlFixture } from '../support/postwar-industry-run-parameters-fixture.js';
import { createPostwarIndustryRunParametersReader } from '../../apps/world-worker/src/persistence/postwar-industry-run-parameters-read.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (p: string) => readFile(resolve(p), 'utf8');
const manifestPath =
  'database/upgrades/postwar-industry-run-parameters-capacity.manifest.json';
async function artifact() {
  const manifest = JSON.parse(await read(manifestPath)) as {
    sourcePin: { path: string; oldSha256: string; newSha256: string };
    installationAllowed: boolean;
    productionApproval: string;
    sourceInitializationPerformed: boolean;
    permissionChanges: boolean;
    upgrade: { path: string; sha256: string; bytes: number };
    functions: readonly {
      signature: string;
      oldBody: string;
      oldBodySha256: string;
      newBodySha256: string;
    }[];
  };
  const sql = await read(manifest.upgrade.path);
  expect(sha(sql)).toBe(manifest.upgrade.sha256);
  expect(Buffer.byteLength(sql)).toBe(manifest.upgrade.bytes);
  expect(sha(await read(manifest.sourcePin.path))).toBe(
    manifest.sourcePin.newSha256,
  );
  for (const f of manifest.functions)
    expect(sha(f.oldBody)).toBe(f.oldBodySha256);
  return { manifest, sql };
}
it('repairs both exact V1 read bodies while preserving OID/owner/ACL/RLS/source/economic rows; unknown metadata, repeats and failed transactions reject', async () => {
  const { manifest, sql } = await artifact();
  const f = await createIndustryRunParametersSqlFixture();
  try {
    const signatures = manifest.functions.map((x) => x.signature);
    const definitions = new Map<string, { definition: string; body: string }>();
    for (const spec of manifest.functions) {
      const actual = (
        await f.db.query<{ definition: string; body: string }>(
          'select pg_get_functiondef(oid) definition,prosrc body from pg_proc where oid=$1::regprocedure',
          [spec.signature],
        )
      ).rows[0]!;
      expect(sha(actual.body)).toBe(spec.newBodySha256);
      const predecessor = {
        definition: actual.definition.replace(actual.body, () => spec.oldBody),
        body: spec.oldBody,
      };
      definitions.set(spec.signature, predecessor);
      await f.db.exec(predecessor.definition);
    }
    const catalog = async () =>
      (
        await f.db.query<{
          signature: string;
          metadata: unknown;
          body: string;
        }>(
          "select oid::regprocedure::text signature,to_jsonb(p)-'prosrc' metadata,encode(sha256(convert_to(prosrc,'UTF8')),'hex')body from pg_proc p where oid=any($1::regprocedure[]) order by oid::regprocedure::text",
          [signatures],
        )
      ).rows;
    const stable = async () =>
      (
        await f.db.query(
          `select
      (select jsonb_agg(to_jsonb(p) order by p.oid)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='world_v2' and p.oid<>all($1::regprocedure[]))functions,
      (select jsonb_agg(to_jsonb(p)order by p.oid)from pg_policy p)policies,
      (select jsonb_agg(to_jsonb(c)order by c.oid)from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_v2')relations,
      (select jsonb_agg(to_jsonb(x)order by x.roleid,x.member)from pg_auth_members x)memberships,
      (select jsonb_agg(to_jsonb(x)order by x.world_id,x.facility_id)from world_v2.postwar_industry_first_day_source x)sources,
      (select jsonb_agg(to_jsonb(x)order by x.world_id,x.facility_id)from world_v2.postwar_industry_original x)originals,
      (select jsonb_agg(to_jsonb(x)order by x.world_id)from world_v2.world_head x)heads,
      (select count(*)from world_v2.authoritative_event)events,
      (select count(*)from world_v2.command_receipt)receipts,
      (select count(*)from world_v2.financial_posting_batch)financial,
      (select count(*)from world_v2.inventory_posting)inventory`,
          [signatures],
        )
      ).rows;
    const before = await catalog(),
      unchanged = await stable();
    for (const spec of manifest.functions)
      expect(before.find((x) => x.signature === spec.signature)!.body).toBe(
        spec.oldBodySha256,
      );
    await f.begin();
    const old = (
      await f.db.query<{ rows_text: string }>(
        'select * from world_v2.read_postwar_industry_run_parameters_page($1,0,1,null)',
        [f.f.world],
      )
    ).rows[0]!;
    expect(JSON.parse(old.rows_text)[0].schemaVersion).toBe(
      'postwar-industry-run-parameter-row-v1',
    );
    expect(JSON.parse(old.rows_text)[0].capacityPerSimDay).toBeUndefined();
    await f.f.reset();
    const reject = async (text: string, code: string) => {
      await expect(f.db.exec(text)).rejects.toMatchObject({
        code: '55000',
        message: expect.stringContaining(code),
      });
      await f.db.exec('rollback');
    };
    const target = manifest.functions[0]!,
      original = definitions.get(target.signature)!;
    await f.db.exec(
      original.definition.replace(
        original.body,
        () => original.body + '\n-- TEST_ONLY_UNKNOWN\n',
      ),
    );
    await reject(sql, 'INDUSTRY_CAPACITY_EXACT_PREDECESSOR_BODY_REQUIRED');
    await f.db.exec(original.definition);
    await f.db.exec(
      `grant execute on function ${target.signature} to world_v2_postwar_projection_reader`,
    );
    await reject(sql, 'INDUSTRY_CAPACITY_EXACT_PREDECESSOR_METADATA_REQUIRED');
    await f.db.exec(
      `revoke execute on function ${target.signature} from world_v2_postwar_projection_reader`,
    );
    await f.db.exec(
      `alter function ${target.signature} set search_path=public`,
    );
    await reject(sql, 'INDUSTRY_CAPACITY_EXACT_PREDECESSOR_METADATA_REQUIRED');
    await f.db.exec(
      `alter function ${target.signature} set search_path=pg_catalog`,
    );
    expect(await catalog()).toEqual(before);
    const boundary =
      ' -- Fixed failure-injection boundary for the isolated rollback test only.';
    expect(sql).toContain(boundary);
    await reject(
      sql.replace(
        boundary,
        () =>
          ` raise exception 'TEST_ONLY_AFTER_BOTH_REPLACEMENTS'using errcode='55000';\n${boundary}`,
      ),
      'TEST_ONLY_AFTER_BOTH_REPLACEMENTS',
    );
    expect(await catalog()).toEqual(before);
    expect(await stable()).toEqual(unchanged);
    await f.db.exec(sql);
    const after = await catalog();
    for (const spec of manifest.functions) {
      const a = after.find((x) => x.signature === spec.signature)!,
        b = before.find((x) => x.signature === spec.signature)!;
      expect(a.body).toBe(spec.newBodySha256);
      expect(a.metadata).toEqual(b.metadata);
    }
    expect(await stable()).toEqual(unchanged);
    await reject(sql, 'INDUSTRY_CAPACITY_EXACT_PREDECESSOR_BODY_REQUIRED');
    expect(await catalog()).toEqual(after);
    const capacity = (
      await f.db.query<{ capacity: string }>(
        "select source_text::jsonb->'sourceFacility'->>'capacity'capacity from world_v2.postwar_industry_first_day_source where source_ref=$1",
        [f.published.sourceRef],
      )
    ).rows[0]!.capacity;
    await f.begin();
    const reader = createPostwarIndustryRunParametersReader({
      runtimeReaderRole: 'world_v2_postwar_projection_reader',
      authorizationPublisherRole: 'world_v2_postwar_projection_publisher',
    });
    const page = await reader.readPageFrom(f.tx, { worldId: f.f.world });
    expect(page.status).toBe('PAGE');
    if (!('rows' in page)) throw Error('ACTUAL_UPGRADED_PAGE_REQUIRED');
    expect(page.rows[0]).toMatchObject({
      schemaVersion: 'postwar-industry-run-parameter-row-v2',
      capacityPerSimDay: capacity,
    });
    expect(
      (
        await f.db.query(
          "select has_table_privilege(current_user,'world_v2.postwar_industry_first_day_source','SELECT')raw",
        )
      ).rows[0],
    ).toEqual({ raw: false });
    await f.f.reset();
    expect(await stable()).toEqual(unchanged);
  } finally {
    await f.close();
  }
}, 60000);
it('is an unapproved body-only review artifact accepted by the unchanged transaction classifier', async () => {
  const { manifest } = await artifact();
  expect(manifest).toMatchObject({
    installationAllowed: false,
    productionApproval: 'NOT_GRANTED',
    sourceInitializationPerformed: false,
    permissionChanges: false,
  });
  expect(manifest.functions).toHaveLength(2);
  const script =
    "import{readFileSync}from'node:fs';import{pathToFileURL}from'node:url';const{classifyDeltaTransaction}=await import(pathToFileURL(process.argv[2]));if(classifyDeltaTransaction(readFileSync(process.argv[3])).sourceEnvelope!=='SOURCE_BEGIN_COMMIT')throw Error('EXACT_ENVELOPE_REQUIRED');";
  const r = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      script,
      'FIXED_IMPORT_ONLY',
      resolve('tools/office-connection/postwar-schema-delta.mjs'),
      resolve(manifest.upgrade.path),
    ],
    { encoding: 'utf8' },
  );
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
});
